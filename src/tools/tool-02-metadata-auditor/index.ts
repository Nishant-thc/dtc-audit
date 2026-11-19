import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SharedDatabase } from '../../db/database.ts';
import type { CrawlRecord, ToolManifest } from '../../types/entities.ts';
import type { StandaloneToolModule, ToolRunResult } from '../types.ts';
import { RulesEngine, loadRulesFromFile } from '../../engine/rules-engine.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest: ToolManifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'));
const rules = loadRulesFromFile(path.join(__dirname, 'rules.yaml'));

export const tool02MetadataAuditor: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const pages = db.getPages(crawl.crawlId);
    const allOkPages = pages.filter((p) => p.status === 200);
    const htmlOkPages = allOkPages.filter(
      (p) => p.extractionMethod !== 'A' || p.title !== null || p.contentLength > 0
    );
    const okPages = htmlOkPages.length > 0 ? htmlOkPages : allOkPages;

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const titleMap = new Map<string, string[]>();
    const descMap = new Map<string, string[]>();
    for (const p of okPages) {
      if (p.title) {
        const k = p.title.toLowerCase().trim();
        const arr = titleMap.get(k) ?? [];
        arr.push(p.sourceUrl);
        titleMap.set(k, arr);
      }
      if (p.metaDescription) {
        const k = p.metaDescription.toLowerCase().trim();
        const arr = descMap.get(k) ?? [];
        arr.push(p.sourceUrl);
        descMap.set(k, arr);
      }
    }

    const duplicateTitleGroups = Array.from(titleMap.entries())
      .filter(([, urls]) => urls.length > 1)
      .map(([titleText, urls]) => ({
        type: 'Duplicate Title',
        value: titleText,
        characterLength: titleText.length,
        urlCount: urls.length,
        affectedUrls: urls.join(' | '),
      }));

    const duplicateDescGroups = Array.from(descMap.entries())
      .filter(([, urls]) => urls.length > 1)
      .map(([descText, urls]) => ({
        type: 'Duplicate Meta Description',
        value: descText,
        characterLength: descText.length,
        urlCount: urls.length,
        affectedUrls: urls.join(' | '),
      }));

    // Heading issues (missing H1, multiple H1s, or missing H2 subheadings on content-heavy pages)
    const headingIssuePages = okPages.filter((p) => p.h1List.length !== 1);

    // Noindex and canonical conflicts
    const noindexAndCanonicalConflictRows: Array<Record<string, unknown>> = [];
    for (const p of okPages) {
      const conflicts: string[] = [];
      if (p.isNoindex && p.inSitemap) {
        conflicts.push('Noindex page listed in XML sitemap');
      }
      if (p.isNoindex && p.canonicalUrl) {
        conflicts.push('Mixed signals: both noindex and rel=canonical present');
      }
      if (!p.isNoindex && !p.canonicalUrl) {
        conflicts.push('Indexable 200 OK page missing rel=canonical');
      }
      if (p.normalizedCanonicalUrl && p.normalizedCanonicalUrl !== p.normalizedUrl) {
        conflicts.push(`Non-self canonical pointing to ${p.normalizedCanonicalUrl}`);
      }
      if (conflicts.length > 0) {
        noindexAndCanonicalConflictRows.push({
          url: p.sourceUrl,
          pageType: p.pageType,
          templateId: p.templateId,
          isNoindex: p.isNoindex,
          inSitemap: p.inSitemap,
          canonicalUrl: p.canonicalUrl ?? '(missing)',
          conflictTypes: conflicts.join('; '),
        });
      }
    }

    // Template summary with sample affected URLs
    const templateStats = new Map<
      string,
      {
        total: number;
        missingTitle: number;
        missingDesc: number;
        badH1: number;
        noindex: number;
        canonicalIssues: number;
        sampleAffectedUrls: string[];
      }
    >();
    for (const p of okPages) {
      const st = templateStats.get(p.templateId) ?? {
        total: 0,
        missingTitle: 0,
        missingDesc: 0,
        badH1: 0,
        noindex: 0,
        canonicalIssues: 0,
        sampleAffectedUrls: [],
      };
      st.total++;
      let hasIssue = false;
      if (!p.title || p.title.length < 15 || p.title.length > 65) {
        st.missingTitle++;
        hasIssue = true;
      }
      if (!p.metaDescription || p.metaDescription.length < 50 || p.metaDescription.length > 165) {
        st.missingDesc++;
        hasIssue = true;
      }
      if (p.h1List.length !== 1) {
        st.badH1++;
        hasIssue = true;
      }
      if (p.isNoindex) {
        st.noindex++;
        hasIssue = true;
      }
      if (!p.canonicalUrl || (p.normalizedCanonicalUrl && p.normalizedCanonicalUrl !== p.normalizedUrl)) {
        st.canonicalIssues++;
        hasIssue = true;
      }
      if (hasIssue && st.sampleAffectedUrls.length < 3) {
        st.sampleAffectedUrls.push(p.sourceUrl);
      }
      templateStats.set(p.templateId, st);
    }

    const pagesWithGoodMeta = okPages.filter(
      (p) =>
        p.title &&
        p.title.length >= 15 &&
        p.title.length <= 65 &&
        p.metaDescription &&
        p.metaDescription.length >= 50 &&
        p.metaDescription.length <= 165 &&
        p.h1List.length === 1 &&
        !p.isNoindex
    );

    const noindexPages = okPages.filter((p) => p.isNoindex);
    const classifiedPct =
      pages.length > 0
        ? Number(((pages.filter((p) => p.pageType !== 'unknown').length / pages.length) * 100).toFixed(1))
        : 100;

    return {
      manifest,
      crawl,
      reusedExistingCrawl,
      headlineMetrics: [
        {
          id: 'meta_compliant_pages',
          label: 'Fully Compliant Pages',
          value: `${pagesWithGoodMeta.length} / ${okPages.length}`,
          subtitle: 'Valid title, description, single H1, indexable',
          affectedUrls: pagesWithGoodMeta.map((p) => p.sourceUrl),
          status: pagesWithGoodMeta.length === okPages.length ? 'good' : 'warning',
        },
        {
          id: 'duplicate_groups',
          label: 'Duplicate Metadata Groups',
          value: duplicateTitleGroups.length + duplicateDescGroups.length,
          subtitle: `${duplicateTitleGroups.length} title groups, ${duplicateDescGroups.length} description groups`,
          affectedUrls: [...duplicateTitleGroups, ...duplicateDescGroups].flatMap((g) => g.affectedUrls.split(' | ')),
          status: duplicateTitleGroups.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'h1_issues',
          label: 'Heading (H1) Issues',
          value: headingIssuePages.length,
          subtitle: 'Pages with 0 or multiple H1 tags',
          affectedUrls: headingIssuePages.map((p) => p.sourceUrl),
          status: headingIssuePages.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'noindex_canonical_conflicts',
          label: 'Noindex & Canonical Conflicts',
          value: noindexAndCanonicalConflictRows.length,
          subtitle: `${noindexPages.length} noindex pages detected`,
          affectedUrls: noindexAndCanonicalConflictRows.map((r) => String(r.url)),
          status: noindexPages.length > 0 ? 'critical' : noindexAndCanonicalConflictRows.length > 0 ? 'warning' : 'good',
        },
      ],
      findings,
      tables: [
        {
          id: 'page_metadata_audit',
          title: '1. Metadata Coverage & Sizing Audit',
          description: 'Title, meta description, H1 count, canonical, and robots directives for every 200 OK page.',
          rows: okPages.map((p) => ({
            url: p.sourceUrl,
            pageType: p.pageType,
            templateId: p.templateId,
            title: p.title ?? '(missing)',
            titleLength: p.title?.length ?? 0,
            titleStatus: !p.title ? 'Missing' : p.title.length < 15 ? 'Too Short (<15)' : p.title.length > 65 ? 'Too Long (>65)' : 'Optimal',
            metaDescription: p.metaDescription ?? '(missing)',
            metaDescLength: p.metaDescription?.length ?? 0,
            metaDescStatus: !p.metaDescription
              ? 'Missing'
              : p.metaDescription.length < 50
                ? 'Too Short (<50)'
                : p.metaDescription.length > 165
                  ? 'Too Long (>165)'
                  : 'Optimal',
            h1Count: p.h1List.length,
            primaryH1: p.h1List[0] ?? '(missing)',
            h2Count: p.h2List.length,
            canonicalUrl: p.canonicalUrl ?? '(missing)',
            isNoindex: p.isNoindex,
          })),
        },
        {
          id: 'duplicate_metadata_groups',
          title: '2. Duplicate Title & Meta Description Groups',
          description: 'Groups of URLs sharing identical <title> or meta description tags.',
          rows: [...duplicateTitleGroups, ...duplicateDescGroups],
        },
        {
          id: 'heading_issues_table',
          title: '3. Heading Structure Issues (Missing or Multiple H1s)',
          description: 'Pages with zero H1 tags or multiple competing H1 tags.',
          rows: headingIssuePages.map((p) => ({
            url: p.sourceUrl,
            pageType: p.pageType,
            templateId: p.templateId,
            h1Count: p.h1List.length,
            allH1Values: p.h1List.join(' | ') || '(none)',
            h2Count: p.h2List.length,
            h3ToH6Count: p.h3ToH6Count,
          })),
        },
        {
          id: 'noindex_canonical_conflicts_table',
          title: '4. Noindex & Canonical Directive Conflicts',
          description: 'Pages with accidental noindex, noindex in sitemap, missing canonicals, or non-self canonicals.',
          rows: noindexAndCanonicalConflictRows,
        },
        {
          id: 'template_issue_breakdown',
          title: '5. Metadata & Indexability Issues Grouped by Template',
          description: 'Aggregated metadata hygiene issues grouped by detected page template with sample affected URLs.',
          rows: Array.from(templateStats.entries()).map(([templateId, st]) => ({
            templateId,
            totalPages: st.total,
            titleIssuesCount: st.missingTitle,
            metaDescIssuesCount: st.missingDesc,
            h1IssuesCount: st.badH1,
            noindexCount: st.noindex,
            canonicalIssuesCount: st.canonicalIssues,
            sampleAffectedUrls: st.sampleAffectedUrls.join(' | '),
          })),
        },
      ],
      coveragePanel: {
        crawlId: crawl.crawlId,
        domain: crawl.domain,
        platform: crawl.platform,
        maxLevel: crawl.maxLevel,
        ...crawl.coverage,
        classifiedPercentage: classifiedPct,
        entityInspectedCount: okPages.length,
        entityName: '200 OK HTML pages',
        notes: [
          `Inspected ${okPages.length} 200 OK HTML pages across ${templateStats.size} templates.`,
          crawl.maxLevel === 'C'
            ? `Includes ${crawl.coverage.deeplyInspected} pages verified with Level C browser rendering.`
            : 'Extracted from Level B HTTP HTML responses (Level C client-side DOM mutations not checked).',
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};

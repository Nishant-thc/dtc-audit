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

export const tool08InternalLinkAnalyzer: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const pages = db.getPages(crawl.crawlId);
    const links = db.getLinks(crawl.crawlId);
    const internalLinks = links.filter((l) => l.linkType === 'internal');

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const interior200 = pages.filter((p) => p.pageType !== 'homepage' && p.status === 200);
    const orphans = interior200.filter((p) => p.inboundLinkCount === 0);
    const lowInbound = interior200.filter((p) => p.inboundLinkCount > 0 && p.inboundLinkCount < 2);
    const deepPages = pages.filter((p) => p.status === 200 && p.depth > 3);
    const brokenInternalLinks = internalLinks.filter((l) => l.isBroken);

    // Top linked pages
    const topLinked = [...pages].sort((a, b) => b.inboundLinkCount - a.inboundLinkCount);

    // Link distribution by target page type
    const byTargetType = new Map<string, { linkCount: number; uniqueAnchors: Set<string> }>();
    for (const l of internalLinks) {
      const curr = byTargetType.get(l.targetPageType) ?? { linkCount: 0, uniqueAnchors: new Set<string>() };
      curr.linkCount++;
      if (l.anchorText) curr.uniqueAnchors.add(l.anchorText);
      byTargetType.set(l.targetPageType, curr);
    }

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
          id: 'total_internal_links',
          label: 'Internal Link Edges',
          value: internalLinks.length,
          subtitle: `Across ${pages.length} discovered pages`,
          affectedUrls: pages.map((p) => p.sourceUrl),
          status: 'neutral',
        },
        {
          id: 'orphan_pages',
          label: 'Orphan Pages (0 Inbound)',
          value: orphans.length,
          subtitle: `${lowInbound.length} additional pages have only 1 inbound link`,
          affectedUrls: orphans.map((p) => p.sourceUrl),
          status: orphans.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'deep_pages',
          label: 'Deep Pages (>3 Clicks)',
          value: deepPages.length,
          subtitle: 'Pages requiring >3 clicks from homepage',
          affectedUrls: deepPages.map((p) => p.sourceUrl),
          status: deepPages.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'broken_internal_links',
          label: 'Broken Internal Links',
          value: brokenInternalLinks.length,
          subtitle: 'Internal links pointing to 4xx/5xx URLs',
          affectedUrls: Array.from(new Set(brokenInternalLinks.map((l) => l.sourceUrl))),
          status: brokenInternalLinks.length > 0 ? 'critical' : 'good',
        },
      ],
      findings,
      tables: [
        {
          id: 'page_link_depth_matrix',
          title: 'Page Click Depth, Inbound & Outbound Link Matrix',
          description: 'Every page ranked by internal inbound link count and click depth from the homepage.',
          rows: topLinked.map((p) => ({
            url: p.sourceUrl,
            pageType: p.pageType,
            templateId: p.templateId,
            clickDepth: p.depth,
            inboundLinks: p.inboundLinkCount,
            outboundLinks: p.outboundLinkCount,
            inNav: p.inNav,
            inSitemap: p.inSitemap,
            status: p.status,
          })),
        },
        {
          id: 'link_distribution_by_type',
          title: 'Internal Link Distribution by Target Page Type',
          description: 'How internal link equity and anchor text diversity flow across page types.',
          rows: Array.from(byTargetType.entries()).map(([targetPageType, st]) => ({
            targetPageType,
            internalLinkCount: st.linkCount,
            shareOfLinksPct:
              internalLinks.length > 0 ? Number(((st.linkCount / internalLinks.length) * 100).toFixed(1)) : 0,
            distinctAnchorTexts: st.uniqueAnchors.size,
            sampleAnchors: Array.from(st.uniqueAnchors).slice(0, 5).join(' | '),
          })),
        },
        {
          id: 'broken_internal_links_table',
          title: 'Broken Internal Links Inventory',
          description: 'Source pages, anchor texts, and broken destination URLs.',
          rows: brokenInternalLinks.map((l) => ({
            sourceUrl: l.sourceUrl,
            destinationUrl: l.destinationUrl,
            anchorText: l.anchorText || '(empty)',
            position: l.position,
            statusCode: l.statusCode ?? 404,
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
        entityInspectedCount: internalLinks.length,
        entityName: 'internal links',
        notes: [
          `Analysed ${internalLinks.length} internal link edges across ${pages.length} discovered pages.`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


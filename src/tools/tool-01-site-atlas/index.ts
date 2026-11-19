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

export const tool01SiteAtlas: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const pages = db.getPages(crawl.crawlId);
    const sitemaps = db.getSitemaps(crawl.crawlId);

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const status200 = pages.filter((p) => p.status === 200);
    const redirects = pages.filter((p) => p.redirectChain.length > 0 || (p.status >= 300 && p.status < 400));
    const errors = pages.filter((p) => p.status >= 400 || p.status === 0);
    const inSitemapPages = pages.filter((p) => p.inSitemap);
    const missingFromSitemap = pages.filter(
      (p) => p.status === 200 && !p.isNoindex && !p.inSitemap && p.pageType !== 'filtered' && p.pageType !== 'search'
    );
    const orphanCandidates = pages.filter(
      (p) => p.pageType !== 'homepage' && p.status === 200 && p.inboundLinkCount === 0
    );

    // 1. Duplicate URL candidates (content fingerprint groups + canonical target groups + base path groups)
    const duplicateGroups: Array<{
      duplicateReason: string;
      primaryOrCanonicalUrl: string;
      duplicateUrlsCount: number;
      duplicateUrls: string;
    }> = [];

    const fpMap = new Map<string, string[]>();
    const basePathMap = new Map<string, string[]>();

    for (const p of status200) {
      if (p.contentFingerprint && p.wordCount > 0) {
        const arr = fpMap.get(p.contentFingerprint) ?? [];
        arr.push(p.sourceUrl);
        fpMap.set(p.contentFingerprint, arr);
      }
      try {
        const u = new URL(p.normalizedUrl);
        const cleanBase = `${u.origin}${u.pathname}`;
        const bArr = basePathMap.get(cleanBase) ?? [];
        bArr.push(p.sourceUrl);
        basePathMap.set(cleanBase, bArr);
      } catch {
        // ignore
      }
    }

    for (const [, urls] of fpMap.entries()) {
      if (urls.length > 1) {
        duplicateGroups.push({
          duplicateReason: 'Identical HTML Content Fingerprint (SHA-256)',
          primaryOrCanonicalUrl: urls[0],
          duplicateUrlsCount: urls.length,
          duplicateUrls: urls.join(' | '),
        });
      }
    }

    for (const [cleanBase, urls] of basePathMap.entries()) {
      if (urls.length > 1) {
        duplicateGroups.push({
          duplicateReason: 'Parameterized / Faceted Variants of Base Path',
          primaryOrCanonicalUrl: cleanBase,
          duplicateUrlsCount: urls.length,
          duplicateUrls: urls.join(' | '),
        });
      }
    }

    // 2. URLs by Page Type, Sitemap & Status
    const byTypeMap = new Map<
      string,
      {
        count: number;
        inSitemap: number;
        inNav: number;
        status200: number;
        status3xx: number;
        status4xx5xx: number;
        avgConfidence: number;
      }
    >();
    for (const p of pages) {
      const curr = byTypeMap.get(p.pageType) ?? {
        count: 0,
        inSitemap: 0,
        inNav: 0,
        status200: 0,
        status3xx: 0,
        status4xx5xx: 0,
        avgConfidence: 0,
      };
      curr.count++;
      if (p.inSitemap) curr.inSitemap++;
      if (p.inNav) curr.inNav++;
      if (p.status === 200 && p.redirectChain.length === 0) curr.status200++;
      if (p.redirectChain.length > 0 || (p.status >= 300 && p.status < 400)) curr.status3xx++;
      if (p.status >= 400 || p.status === 0) curr.status4xx5xx++;
      curr.avgConfidence += p.classificationConfidence;
      byTypeMap.set(p.pageType, curr);
    }

    const typeBreakdownRows = Array.from(byTypeMap.entries()).map(([pageType, stats]) => ({
      pageType,
      totalUrls: stats.count,
      shareOfSitePct: pages.length > 0 ? Number(((stats.count / pages.length) * 100).toFixed(1)) : 0,
      inSitemapCount: stats.inSitemap,
      inNavCount: stats.inNav,
      clean200Count: stats.status200,
      redirect3xxCount: stats.status3xx,
      error4xx5xxCount: stats.status4xx5xx,
      avgConfidence: Number((stats.avgConfidence / stats.count).toFixed(2)),
    }));

    // 3. Sitemap vs Navigation & Internal Links Cross-Comparison
    const inSitemapAndLinked = pages.filter((p) => p.inSitemap && (p.inboundLinkCount > 0 || p.inNav));
    const inSitemapOnlyUnlinked = pages.filter(
      (p) => p.inSitemap && p.inboundLinkCount === 0 && !p.inNav && p.pageType !== 'homepage'
    );
    const inNavButMissingFromSitemap = pages.filter((p) => p.inNav && !p.inSitemap && p.status === 200);
    const linkedButMissingFromSitemap = pages.filter(
      (p) => !p.inSitemap && p.inboundLinkCount > 0 && p.status === 200 && !p.isNoindex
    );

    const sitemapVsLinksComparisonRows = [
      {
        segment: 'In Sitemap AND Linked Internally / Nav (Healthy)',
        urlCount: inSitemapAndLinked.length,
        sharePct: pages.length > 0 ? Number(((inSitemapAndLinked.length / pages.length) * 100).toFixed(1)) : 0,
        sampleUrls: inSitemapAndLinked.slice(0, 4).map((p) => p.sourceUrl).join(' | '),
      },
      {
        segment: 'In Sitemap ONLY — Zero Internal Links (Orphan in Site Structure)',
        urlCount: inSitemapOnlyUnlinked.length,
        sharePct: pages.length > 0 ? Number(((inSitemapOnlyUnlinked.length / pages.length) * 100).toFixed(1)) : 0,
        sampleUrls: inSitemapOnlyUnlinked.slice(0, 4).map((p) => p.sourceUrl).join(' | '),
      },
      {
        segment: 'In Main Navigation ONLY — Missing from XML Sitemaps',
        urlCount: inNavButMissingFromSitemap.length,
        sharePct: pages.length > 0 ? Number(((inNavButMissingFromSitemap.length / pages.length) * 100).toFixed(1)) : 0,
        sampleUrls: inNavButMissingFromSitemap.slice(0, 4).map((p) => p.sourceUrl).join(' | '),
      },
      {
        segment: 'Linked Internally (200 OK Indexable) — Missing from XML Sitemaps',
        urlCount: linkedButMissingFromSitemap.length,
        sharePct: pages.length > 0 ? Number(((linkedButMissingFromSitemap.length / pages.length) * 100).toFixed(1)) : 0,
        sampleUrls: linkedButMissingFromSitemap.slice(0, 4).map((p) => p.sourceUrl).join(' | '),
      },
    ];

    // 4. Visual Hierarchy Tree (Level 1 & Level 2 path structure)
    const treeMap = new Map<
      string,
      { depth: number; count: number; status200: number; inSitemap: number; pageTypes: Set<string>; sampleUrl: string }
    >();
    for (const p of pages) {
      try {
        const u = new URL(p.normalizedUrl);
        const segments = u.pathname.split('/').filter(Boolean);
        const level1 = segments.length > 0 ? `/${segments[0]}` : '/';
        const level2 = segments.length > 1 ? `/${segments[0]}/${segments[1]}` : null;

        for (const [nodePath, d] of [
          [level1, 1],
          ...(level2 ? [[level2, 2] as const] : []),
        ] as Array<[string, number]>) {
          const curr = treeMap.get(nodePath) ?? {
            depth: d,
            count: 0,
            status200: 0,
            inSitemap: 0,
            pageTypes: new Set<string>(),
            sampleUrl: p.sourceUrl,
          };
          curr.count++;
          if (p.status === 200) curr.status200++;
          if (p.inSitemap) curr.inSitemap++;
          curr.pageTypes.add(p.pageType);
          treeMap.set(nodePath, curr);
        }
      } catch {
        // skip
      }
    }

    const hierarchyRows = Array.from(treeMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([pathNode, info]) => ({
        hierarchyNode: info.depth === 2 ? `  └─ ${pathNode}` : pathNode,
        pathDepth: info.depth,
        urlCount: info.count,
        status200Count: info.status200,
        inSitemapCount: info.inSitemap,
        pageTypes: Array.from(info.pageTypes).join(', '),
        sampleUrl: info.sampleUrl,
      }));

    const classifiedCount = pages.filter((p) => p.pageType !== 'unknown').length;
    const classifiedPercentage = pages.length > 0 ? Number(((classifiedCount / pages.length) * 100).toFixed(1)) : 100;

    return {
      manifest,
      crawl,
      reusedExistingCrawl,
      headlineMetrics: [
        {
          id: 'total_urls',
          label: 'Total Discovered URLs',
          value: pages.length,
          subtitle: `${classifiedPercentage}% classified with confidence`,
          affectedUrls: pages.map((p) => p.sourceUrl),
          status: 'neutral',
        },
        {
          id: 'sitemap_coverage',
          label: 'URLs in XML Sitemaps',
          value: `${inSitemapPages.length} / ${pages.length}`,
          subtitle: `${missingFromSitemap.length} indexable pages missing from sitemaps`,
          affectedUrls: missingFromSitemap.map((p) => p.sourceUrl),
          status: missingFromSitemap.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'status_errors_redirects',
          label: 'Errors & Redirect Chains',
          value: errors.length + redirects.length,
          subtitle: `${errors.length} error URLs, ${redirects.length} redirecting URLs`,
          affectedUrls: [...errors, ...redirects].map((p) => p.sourceUrl),
          status: errors.length > 0 ? 'critical' : redirects.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'orphan_and_duplicate_candidates',
          label: 'Orphans & Duplicate Groups',
          value: `${orphanCandidates.length} / ${duplicateGroups.length}`,
          subtitle: `${orphanCandidates.length} orphans, ${duplicateGroups.length} duplicate URL groups`,
          affectedUrls: orphanCandidates.map((p) => p.sourceUrl),
          status: orphanCandidates.length > 0 || duplicateGroups.length > 0 ? 'warning' : 'good',
        },
      ],
      findings,
      tables: [
        {
          id: 'url_inventory',
          title: '1. Complete URL Inventory & Classification Review Table',
          description: 'Every discovered URL with discovery provenance, sitemap source, page type, confidence, HTTP status, and canonical status.',
          rows: pages.map((p) => ({
            url: p.sourceUrl,
            normalizedUrl: p.normalizedUrl,
            pageType: p.pageType,
            confidence: p.classificationConfidence,
            signals: p.classificationSignals.join(', '),
            templateId: p.templateId,
            status: p.status,
            discoverySource: p.discoverySource,
            sitemapSource: p.sitemapSource ?? '(none)',
            lastmod: p.lastmod ?? '(none)',
            inSitemap: p.inSitemap,
            inNav: p.inNav,
            inboundLinks: p.inboundLinkCount,
            canonicalUrl: p.canonicalUrl ?? '(missing)',
            redirectDestination: p.redirectDestination ?? '',
          })),
        },
        {
          id: 'page_type_breakdown',
          title: '2. URLs by Page Type, Sitemap & Status',
          description: 'Distribution of discovered URLs across ecommerce page types, sitemap inclusion, and HTTP status codes.',
          rows: typeBreakdownRows,
        },
        {
          id: 'sitemap_coverage',
          title: '3. Sitemap Inventory & Health Report',
          description: 'All discovered XML sitemaps and sitemap indexes with declared URL counts and error/redirect counts.',
          rows: sitemaps.map((s) => ({
            sitemapUrl: s.sourceUrl,
            isIndex: s.isIndex,
            declaredUrlsCount: s.declaredPagesCount,
            status: s.status,
            errorUrlCount: s.errorUrlCount,
            redirectUrlCount: s.redirectUrlCount,
          })),
        },
        {
          id: 'sitemap_vs_nav_comparison',
          title: '4. Sitemap vs. Navigation & Internal Links Coverage Matrix',
          description: 'Compares URLs declared in XML sitemaps against URLs linked from site navigation and internal content.',
          rows: sitemapVsLinksComparisonRows,
        },
        {
          id: 'hierarchy_map',
          title: '5. Store Architecture Hierarchy Visualisation',
          description: 'Multi-level directory tree showing URL concentration, status health, and page types across the site.',
          rows: hierarchyRows,
        },
        {
          id: 'orphan_candidates',
          title: '6. Orphan URL Candidates (0 Internal Inbound Links)',
          description: 'Indexable 200 OK pages discovered via sitemaps or feeds that receive zero internal inbound links.',
          rows: orphanCandidates.map((p) => ({
            url: p.sourceUrl,
            pageType: p.pageType,
            discoverySource: p.discoverySource,
            sitemapSource: p.sitemapSource ?? '(none)',
            inSitemap: p.inSitemap,
            status: p.status,
          })),
        },
        {
          id: 'duplicate_url_candidates',
          title: '7. Duplicate & Near-Duplicate URL Candidates',
          description: 'Groups of URLs sharing identical HTML content fingerprints or parameterized variants of the same base path.',
          rows: duplicateGroups,
        },
        {
          id: 'redirect_and_error_urls',
          title: '8. Redirect Chains & Non-200 Error URLs',
          description: 'Pages returning 3xx redirect hops or 4xx/5xx errors, including whether they are still listed in sitemaps or navigation.',
          rows: [...redirects, ...errors].map((p) => ({
            sourceUrl: p.sourceUrl,
            status: p.status,
            redirectHops: p.redirectChain.length,
            redirectChain: p.redirectChain.length > 0 ? `${p.sourceUrl} -> ${p.redirectChain.join(' -> ')}` : '(none)',
            inSitemap: p.inSitemap,
            inNav: p.inNav,
            inboundLinks: p.inboundLinkCount,
          })),
        },
      ],
      coveragePanel: {
        crawlId: crawl.crawlId,
        domain: crawl.domain,
        platform: crawl.platform,
        maxLevel: crawl.maxLevel,
        ...crawl.coverage,
        classifiedPercentage,
        entityInspectedCount: pages.length,
        entityName: 'discovered pages',
        notes: [
          `Evaluated ${pages.length} discovered pages and ${sitemaps.length} XML sitemaps.`,
          `Compared ${inSitemapPages.length} sitemap URLs against navigation and internal link graph (${missingFromSitemap.length} indexable pages missing from sitemaps; ${orphanCandidates.length} orphan candidates).`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};

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

export const tool07FacetedNavAuditor: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const pages = db.getPages(crawl.crawlId);

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const paramPages = pages.filter((p) => Object.keys(p.parameters).length > 0 || p.pageType === 'filtered');
    const uncontrolledParamPages = paramPages.filter(
      (p) => !p.isNoindex && (!p.normalizedCanonicalUrl || p.normalizedCanonicalUrl === p.normalizedUrl)
    );
    const filteredInSitemap = paramPages.filter((p) => p.inSitemap);
    const multiParamTraps = paramPages.filter((p) => Object.keys(p.parameters).length >= 2);

    const paramInventoryMap = new Map<string, { urlCount: number; sampleValues: Set<string>; sampleUrl: string }>();
    for (const p of paramPages) {
      for (const [k, vals] of Object.entries(p.parameters)) {
        const curr = paramInventoryMap.get(k) ?? { urlCount: 0, sampleValues: new Set<string>(), sampleUrl: p.sourceUrl };
        curr.urlCount++;
        vals.forEach((v) => curr.sampleValues.add(v));
        paramInventoryMap.set(k, curr);
      }
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
          id: 'parameterized_urls',
          label: 'Filtered / Parameter URLs',
          value: paramPages.length,
          subtitle: `${paramInventoryMap.size} distinct parameter keys discovered`,
          affectedUrls: paramPages.map((p) => p.sourceUrl),
          status: 'neutral',
        },
        {
          id: 'uncontrolled_faceted_urls',
          label: 'Indexable Without Canonical',
          value: uncontrolledParamPages.length,
          subtitle: 'Filtered URLs lacking canonical to base page or noindex',
          affectedUrls: uncontrolledParamPages.map((p) => p.sourceUrl),
          status: uncontrolledParamPages.length > 0 ? 'critical' : 'good',
        },
        {
          id: 'filtered_in_sitemap',
          label: 'Filtered URLs in Sitemap',
          value: filteredInSitemap.length,
          subtitle: 'Parameterized URLs declared in XML sitemaps',
          affectedUrls: filteredInSitemap.map((p) => p.sourceUrl),
          status: filteredInSitemap.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'multi_param_combinations',
          label: 'Multi-Parameter Traps (>=2)',
          value: multiParamTraps.length,
          subtitle: 'URLs combining multiple filter/sort parameters',
          affectedUrls: multiParamTraps.map((p) => p.sourceUrl),
          status: multiParamTraps.length > 0 ? 'warning' : 'good',
        },
      ],
      findings,
      tables: [
        {
          id: 'parameter_inventory',
          title: 'Query Parameter Inventory',
          description: 'All discovered URL query parameters with occurrence counts and sample values.',
          rows: Array.from(paramInventoryMap.entries()).map(([paramKey, info]) => ({
            parameterName: paramKey,
            urlCount: info.urlCount,
            sampleValues: Array.from(info.sampleValues).slice(0, 6).join(', '),
            sampleUrl: info.sampleUrl,
          })),
        },
        {
          id: 'faceted_url_handling',
          title: 'Filtered & Parameterized URL Canonical / Robots Handling',
          description: 'Detailed inspection of canonical targets, robots directives, and sitemap inclusion for every filtered URL.',
          rows: paramPages.map((p) => ({
            url: p.sourceUrl,
            parameterKeys: Object.keys(p.parameters).join(', '),
            paramCount: Object.keys(p.parameters).length,
            inSitemap: p.inSitemap,
            isNoindex: p.isNoindex,
            canonicalUrl: p.canonicalUrl ?? '(missing)',
            pointsToCleanBase: Boolean(p.normalizedCanonicalUrl && p.normalizedCanonicalUrl !== p.normalizedUrl),
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
        entityInspectedCount: paramPages.length,
        entityName: 'parameterized/filtered URLs',
        notes: [
          `Evaluated ${paramPages.length} filtered/parameterized URLs across ${paramInventoryMap.size} parameter keys.`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


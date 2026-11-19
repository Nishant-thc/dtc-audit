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

export const tool17HreflangAuditor: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const allOkPages = db.getPages(crawl.crawlId).filter((p) => p.status === 200);
    const htmlOkPages = allOkPages.filter(
      (p) => p.extractionMethod !== 'A' || p.title !== null || p.contentLength > 0
    );
    const pages = htmlOkPages.length > 0 ? htmlOkPages : allOkPages;
    const products = db.getProducts(crawl.crawlId);

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const currencies = Array.from(new Set(products.map((p) => p.currency).filter(Boolean)));
    const regionalPages = allOkPages.filter((p) =>
      /^\/(en-[a-z]{2}|fr|de|es|uk|au|ca|eu)(\/|$)/i.test(new URL(p.normalizedUrl).pathname)
    );

    const classifiedPct =
      allOkPages.length > 0
        ? Number(((allOkPages.filter((p) => p.pageType !== 'unknown').length / allOkPages.length) * 100).toFixed(1))
        : 100;

    return {
      manifest,
      crawl,
      reusedExistingCrawl,
      headlineMetrics: [
        {
          id: 'pages_inspected_intl',
          label: 'HTML Pages Inspected',
          value: pages.length,
          subtitle: `${regionalPages.length} regional subfolder URLs across ${allOkPages.length} discovered pages`,
          affectedUrls: pages.map((p) => p.sourceUrl),
          status: 'neutral',
        },
        {
          id: 'observed_currencies',
          label: 'Observed Currencies',
          value: currencies.length > 0 ? currencies.join(', ') : 'USD',
          subtitle: currencies.length > 1 ? 'Multiple currencies detected across products' : 'Single consistent currency',
          affectedUrls: products.map((p) => p.sourceUrl),
          status: currencies.length > 1 ? 'warning' : 'good',
        },
        {
          id: 'regional_subfolders',
          label: 'Regional Subfolders',
          value: regionalPages.length,
          subtitle: 'Locale path prefixes (/en-gb, /fr, /ca, etc.)',
          affectedUrls: regionalPages.map((p) => p.sourceUrl),
          status: 'neutral',
        },
        {
          id: 'intl_findings',
          label: 'Locale / Header Notices',
          value: findings.length,
          subtitle: 'Language header & hreflang checks',
          affectedUrls: findings.flatMap((f) => f.affectedUrls),
          status: 'neutral',
        },
      ],
      findings,
      tables: [
        {
          id: 'international_page_inventory',
          title: '1. Page Language, Hreflang & Canonical Matrix',
          description: 'HTML lang attributes, alternate hreflang tags, Content-Language headers, and canonical targets.',
          rows: pages.map((p) => {
            const pathname = new URL(p.normalizedUrl).pathname;
            const localeMatch = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(?:\/|$)/i);
            return {
              url: p.sourceUrl,
              pageType: p.pageType,
              htmlLang: p.responseHeaders['x-html-lang'] ?? p.responseHeaders['content-language'] ?? 'Not declared',
              hreflangCount: Number(p.responseHeaders['x-hreflang-count'] ?? 0),
              hreflangLocales: p.responseHeaders['x-hreflang-locales'] ?? '(none)',
              detectedLocaleSubfolder: localeMatch ? localeMatch[1] : '(default root)',
              canonicalUrl: p.canonicalUrl ?? '(missing)',
            };
          }),
        },
        {
          id: 'product_currency_consistency',
          title: '2. Product Currency Consistency Check',
          description: 'Verifies that extracted product prices and Offer schemas use a consistent ISO 4217 currency code.',
          rows: products.map((p) => ({
            url: p.sourceUrl,
            title: p.title,
            currency: p.currency ?? 'USD',
            price: p.price ?? 'N/A',
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
        entityInspectedCount: pages.length,
        entityName: '200 OK pages',
        notes: [
          `Audited ${pages.length} pages and ${products.length} products for locale subfolder mapping, language headers, and currency parity.`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


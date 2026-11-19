import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SharedDatabase } from '../../db/database.ts';
import type { CrawlRecord, ToolManifest } from '../../types/entities.ts';
import type { StandaloneToolModule, ToolRunResult } from '../types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest: ToolManifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'));

function summarizeCrawlMetrics(db: SharedDatabase, c: CrawlRecord) {
  const pages = db.getPages(c.crawlId);
  const allOkPages = pages.filter((p) => p.status === 200);
  const htmlOkPages = allOkPages.filter(
    (p) => p.extractionMethod !== 'A' || p.title !== null || p.contentLength > 0
  );
  const okPages = htmlOkPages.length > 0 ? htmlOkPages : allOkPages;
  const products = db.getProducts(c.crawlId);
  const collections = db.getCollections(c.crawlId);
  const contents = db.getContents(c.crawlId);
  const schemas = db.getSchemas(c.crawlId);
  const techs = db.getTechnologies(c.crawlId);

  const validMetaCount = okPages.filter(
    (p) => p.title && p.title.length >= 15 && p.metaDescription && p.metaDescription.length >= 50 && p.h1List.length === 1
  ).length;
  const metaCompliancePct = okPages.length > 0 ? Math.round((validMetaCount / okPages.length) * 100) : 0;

  const prodSchemaUrls = new Set(schemas.filter((s) => s.schemaType === 'Product').map((s) => s.sourceUrl));
  const prodPages = okPages.filter((p) => p.pageType === 'product');
  const prodSchemaPct = prodPages.length > 0 ? Math.round((prodSchemaUrls.size / prodPages.length) * 100) : 0;

  const avgProdCompleteness =
    products.length > 0
      ? Math.round(products.reduce((acc, pr) => acc + pr.completenessScore, 0) / products.length)
      : 0;
  const avgCollCompleteness =
    collections.length > 0
      ? Math.round(collections.reduce((acc, col) => acc + col.completenessScore, 0) / collections.length)
      : 0;

  const thirdPartyTechs = new Set(techs.filter((t) => t.isThirdParty).map((t) => t.name)).size;

  return {
    domain: c.domain,
    platform: c.platform,
    discoveredUrls: c.coverage.discovered,
    extractedPages: c.coverage.extracted,
    productsInspected: products.length,
    collectionsInspected: collections.length,
    editorialArticles: contents.length,
    metaCompliancePct,
    prodSchemaPct,
    avgProdCompleteness,
    avgCollCompleteness,
    thirdPartyTechs,
  };
}

export const tool14CompetitorComparison: StandaloneToolModule = {
  manifest,
  rules: [],
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const allCrawls = db.listCrawls();
    const otherCrawl = allCrawls.find((c) => c.domain !== crawl.domain) ?? crawl;

    const primaryStats = summarizeCrawlMetrics(db, crawl);
    const benchmarkStats = summarizeCrawlMetrics(db, otherCrawl);
    const pages = db.getPages(crawl.crawlId);
    const classifiedPct =
      pages.length > 0
        ? Number(((pages.filter((p) => p.pageType !== 'unknown').length / pages.length) * 100).toFixed(1))
        : 100;

    const sideBySideRows = [
      { metric: 'Detected Ecommerce Platform', primaryDomain: primaryStats.platform, comparisonDomain: benchmarkStats.platform },
      { metric: 'Discovered Public URLs', primaryDomain: primaryStats.discoveredUrls, comparisonDomain: benchmarkStats.discoveredUrls },
      { metric: 'Extracted Pages (Level B/C)', primaryDomain: primaryStats.extractedPages, comparisonDomain: benchmarkStats.extractedPages },
      { metric: 'Products Inspected', primaryDomain: primaryStats.productsInspected, comparisonDomain: benchmarkStats.productsInspected },
      { metric: 'Collections Inspected', primaryDomain: primaryStats.collectionsInspected, comparisonDomain: benchmarkStats.collectionsInspected },
      { metric: 'Editorial Articles Inspected', primaryDomain: primaryStats.editorialArticles, comparisonDomain: benchmarkStats.editorialArticles },
      { metric: 'Metadata & H1 Compliance (%)', primaryDomain: `${primaryStats.metaCompliancePct}%`, comparisonDomain: `${benchmarkStats.metaCompliancePct}%` },
      { metric: 'Product Schema Coverage (%)', primaryDomain: `${primaryStats.prodSchemaPct}%`, comparisonDomain: `${benchmarkStats.prodSchemaPct}%` },
      { metric: 'Avg Product Completeness Score (0–100)', primaryDomain: primaryStats.avgProdCompleteness, comparisonDomain: benchmarkStats.avgProdCompleteness },
      { metric: 'Avg Collection Completeness Score (0–100)', primaryDomain: primaryStats.avgCollCompleteness, comparisonDomain: benchmarkStats.avgCollCompleteness },
      { metric: 'Third-Party Integrations Count', primaryDomain: primaryStats.thirdPartyTechs, comparisonDomain: benchmarkStats.thirdPartyTechs },
    ];

    return {
      manifest,
      crawl,
      reusedExistingCrawl,
      headlineMetrics: [
        {
          id: 'primary_domain',
          label: 'Primary Domain',
          value: primaryStats.domain,
          subtitle: `Platform: ${primaryStats.platform} (${primaryStats.AvgProdCompleteness ?? primaryStats.avgProdCompleteness}/100 catalogue score)`,
          affectedUrls: pages.map((p) => p.sourceUrl),
          status: 'neutral',
        },
        {
          id: 'comparison_domain',
          label: 'Comparison Domain',
          value: benchmarkStats.domain,
          subtitle: `Platform: ${benchmarkStats.platform} (${benchmarkStats.avgProdCompleteness}/100 catalogue score)`,
          affectedUrls: [],
          status: 'neutral',
        },
        {
          id: 'catalogue_score_delta',
          label: 'Catalogue Score Delta',
          value: `${primaryStats.avgProdCompleteness} vs ${benchmarkStats.avgProdCompleteness}`,
          subtitle: 'Observed public completeness score comparison',
          affectedUrls: [],
          status: primaryStats.avgProdCompleteness >= benchmarkStats.avgProdCompleteness ? 'good' : 'warning',
        },
        {
          id: 'schema_coverage_delta',
          label: 'Product Schema Delta',
          value: `${primaryStats.prodSchemaPct}% vs ${benchmarkStats.prodSchemaPct}%`,
          subtitle: 'Observed Product structured data coverage',
          affectedUrls: [],
          status: primaryStats.prodSchemaPct >= benchmarkStats.prodSchemaPct ? 'good' : 'warning',
        },
      ],
      findings: [],
      tables: [
        {
          id: 'side_by_side_comparison',
          title: `Side-by-Side Public Coverage Comparison (${primaryStats.domain} vs ${benchmarkStats.domain})`,
          description: 'Strictly public observable website metrics within stated crawl coverage (no traffic, revenue, or ad-spend claims).',
          rows: sideBySideRows,
        },
      ],
      coveragePanel: {
        crawlId: crawl.crawlId,
        domain: crawl.domain,
        platform: crawl.platform,
        maxLevel: crawl.maxLevel,
        ...crawl.coverage,
        classifiedPercentage: classifiedPct,
        entityInspectedCount: 2,
        entityName: 'compared domains',
        notes: [
          `Compared ${primaryStats.domain} against ${benchmarkStats.domain} using public crawl data only.`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


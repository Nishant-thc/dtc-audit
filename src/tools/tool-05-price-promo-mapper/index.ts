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

export const tool05PricePromoMapper: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const products = db.getProducts(crawl.crawlId);
    const pages = db.getPages(crawl.crawlId);

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const pricedProducts = products.filter((p) => p.price !== null);
    const onSaleProducts = products.filter((p) => p.discountPercentage !== null && p.discountPercentage > 0);
    const outOfStockProducts = products.filter((p) => p.availability === 'out_of_stock');
    const bundleSubProducts = products.filter((p) => p.hasBundleOrSubscription);

    const prices = pricedProducts.map((p) => p.price as number).sort((a, b) => a - b);
    const minPrice = prices.length > 0 ? prices[0] : 0;
    const maxPrice = prices.length > 0 ? prices[prices.length - 1] : 0;
    const avgPrice =
      prices.length > 0 ? Number((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)) : 0;

    // Price distribution bands
    const priceBandRows = [
      { band: 'Under $50', count: pricedProducts.filter((p) => (p.price ?? 0) < 50).length },
      { band: '$50 – $149', count: pricedProducts.filter((p) => (p.price ?? 0) >= 50 && (p.price ?? 0) < 150).length },
      { band: '$150 – $299', count: pricedProducts.filter((p) => (p.price ?? 0) >= 150 && (p.price ?? 0) < 300).length },
      { band: '$300+', count: pricedProducts.filter((p) => (p.price ?? 0) >= 300).length },
    ];

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
          id: 'price_range',
          label: 'Observed Price Range',
          value: prices.length > 0 ? `$${minPrice} – $${maxPrice}` : 'N/A',
          subtitle: `Average observed price: $${avgPrice}`,
          affectedUrls: pricedProducts.map((p) => p.sourceUrl),
          status: 'neutral',
        },
        {
          id: 'share_on_sale',
          label: 'Products on Promotion',
          value: `${onSaleProducts.length} / ${products.length}`,
          subtitle:
            products.length > 0
              ? `${Math.round((onSaleProducts.length / products.length) * 100)}% of inspected catalogue discounted`
              : '0%',
          affectedUrls: onSaleProducts.map((p) => p.sourceUrl),
          status: 'neutral',
        },
        {
          id: 'out_of_stock_share',
          label: 'Out-of-Stock Exposure',
          value: `${outOfStockProducts.length} / ${products.length}`,
          subtitle: 'Public product pages currently unavailable',
          affectedUrls: outOfStockProducts.map((p) => p.sourceUrl),
          status: outOfStockProducts.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'bundle_sub_coverage',
          label: 'Bundle / Subscription',
          value: `${bundleSubProducts.length} / ${products.length}`,
          subtitle: 'Products with observable bundle or subscribe signals',
          affectedUrls: bundleSubProducts.map((p) => p.sourceUrl),
          status: 'neutral',
        },
      ],
      findings,
      tables: [
        {
          id: 'product_pricing_inventory',
          title: 'Product Price, Promotion & Availability Inventory',
          description: 'Observed public prices, compare-at prices, markdown percentages, stock status, and subscription signals.',
          rows: products.map((p) => ({
            url: p.sourceUrl,
            title: p.title,
            currency: p.currency ?? 'USD',
            currentPrice: p.price ?? 'N/A',
            originalPrice: p.originalPrice ?? 'N/A',
            discountPct: p.discountPercentage !== null ? `${p.discountPercentage}%` : '0%',
            availability: p.availability,
            hasBundleOrSubscription: p.hasBundleOrSubscription,
            variantCount: p.variantCount,
          })),
        },
        {
          id: 'price_distribution_bands',
          title: 'Observed Price Distribution Bands',
          description: 'Distribution of inspected products across price tiers.',
          rows: priceBandRows,
        },
      ],
      coveragePanel: {
        crawlId: crawl.crawlId,
        domain: crawl.domain,
        platform: crawl.platform,
        maxLevel: crawl.maxLevel,
        ...crawl.coverage,
        classifiedPercentage: classifiedPct,
        entityInspectedCount: products.length,
        entityName: 'products',
        notes: [
          `Reports observed public prices only across ${products.length} extracted product pages; no competitor pricing or price recommendations are made.`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


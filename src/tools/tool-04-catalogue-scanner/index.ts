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

export const tool04CatalogueScanner: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const products = db.getProducts(crawl.crawlId);
    const pages = db.getPages(crawl.crawlId);

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const avgCompleteness =
      products.length > 0
        ? Math.round(products.reduce((acc, p) => acc + p.completenessScore, 0) / products.length)
        : 0;
    const worstOffenders = products.filter((p) => p.completenessScore < 70);
    const thinDescProducts = products.filter((p) => p.descriptionWordCount < 30);
    const missingAltProducts = products.filter((p) => p.imageCount === 0 || p.imagesWithAltCount < p.imageCount);

    // Group completeness by category & template
    const groupMap = new Map<string, { count: number; totalScore: number; withSpecs: number; withReviews: number }>();
    for (const pr of products) {
      const key = `${pr.categoryName ?? 'Uncategorized'} (${pr.templateId})`;
      const curr = groupMap.get(key) ?? { count: 0, totalScore: 0, withSpecs: 0, withReviews: 0 };
      curr.count++;
      curr.totalScore += pr.completenessScore;
      if (pr.specsCount >= 2) curr.withSpecs++;
      if (pr.hasReviews) curr.withReviews++;
      groupMap.set(key, curr);
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
          id: 'total_products',
          label: 'Products Inspected',
          value: products.length,
          subtitle: `Average Completeness Score: ${avgCompleteness}/100`,
          affectedUrls: products.map((p) => p.sourceUrl),
          status: avgCompleteness >= 75 ? 'good' : 'warning',
        },
        {
          id: 'worst_offenders',
          label: 'Low Completeness (<70/100)',
          value: worstOffenders.length,
          subtitle: 'Products missing key merchandising attributes',
          affectedUrls: worstOffenders.map((p) => p.sourceUrl),
          status: worstOffenders.length > 0 ? 'critical' : 'good',
        },
        {
          id: 'thin_descriptions',
          label: 'Thin Descriptions (<30w)',
          value: thinDescProducts.length,
          subtitle: 'Products needing copy enrichment',
          affectedUrls: thinDescProducts.map((p) => p.sourceUrl),
          status: thinDescProducts.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'missing_alt_products',
          label: 'Missing Image Alt Text',
          value: missingAltProducts.length,
          subtitle: 'Products with unlabelled gallery images',
          affectedUrls: missingAltProducts.map((p) => p.sourceUrl),
          status: missingAltProducts.length > 0 ? 'warning' : 'good',
        },
      ],
      findings,
      tables: [
        {
          id: 'product_catalogue_completeness',
          title: 'Product Catalogue Completeness Ranking (Worst Offenders First)',
          description: 'Full product catalogue scored 0–100 across description, specs, imagery, alt text, schema, reviews, and variants.',
          rows: products.map((p) => ({
            url: p.sourceUrl,
            title: p.title,
            sku: p.sku ?? '(missing)',
            brand: p.brand ?? '(missing)',
            category: p.categoryName ?? 'Uncategorized',
            templateId: p.templateId,
            completenessScore: p.completenessScore,
            descWords: p.descriptionWordCount,
            specsCount: p.specsCount,
            images: `${p.imagesWithAltCount}/${p.imageCount} with alt`,
            hasSchema: p.hasProductSchema && p.hasOfferSchema,
            hasReviews: p.hasReviews,
            variantCount: p.variantCount,
            missingFields: p.missingFields.join(', '),
          })),
        },
        {
          id: 'completeness_by_category_template',
          title: 'Completeness Coverage by Category & Template',
          description: 'Average completeness score and attribute coverage grouped by category and template.',
          rows: Array.from(groupMap.entries()).map(([group, st]) => ({
            categoryAndTemplate: group,
            productCount: st.count,
            avgCompletenessScore: Math.round(st.totalScore / st.count),
            withSpecsCount: st.withSpecs,
            withReviewsCount: st.withReviews,
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
        entityInspectedCount: products.length,
        entityName: 'products',
        notes: [
          `Scored ${products.length} product pages across 8 completeness dimensions.`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


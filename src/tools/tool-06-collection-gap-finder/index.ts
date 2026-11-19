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

export const tool06CollectionGapFinder: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const collections = db.getCollections(crawl.crawlId);
    const pages = db.getPages(crawl.crawlId);

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const noIntro = collections.filter((c) => !c.hasIntroContent);
    const thinGrid = collections.filter((c) => c.productCount < 3);
    const weakInbound = collections.filter((c) => c.inboundLinkCount < 2);
    const avgScore =
      collections.length > 0
        ? Math.round(collections.reduce((a, c) => a + c.completenessScore, 0) / collections.length)
        : 0;

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
          id: 'collections_count',
          label: 'Collections Inspected',
          value: collections.length,
          subtitle: `Average Completeness: ${avgScore}/100`,
          affectedUrls: collections.map((c) => c.sourceUrl),
          status: avgScore >= 80 ? 'good' : 'warning',
        },
        {
          id: 'missing_intro_copy',
          label: 'Missing Intro Content',
          value: noIntro.length,
          subtitle: 'Collections with <15 words of intro text',
          affectedUrls: noIntro.map((c) => c.sourceUrl),
          status: noIntro.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'thin_product_grids',
          label: 'Thin Product Grids (<3)',
          value: thinGrid.length,
          subtitle: 'Under-merchandised category pages',
          affectedUrls: thinGrid.map((c) => c.sourceUrl),
          status: thinGrid.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'weak_inbound_collections',
          label: 'Weak Inbound Links (<2)',
          value: weakInbound.length,
          subtitle: 'Collections lacking internal link equity',
          affectedUrls: weakInbound.map((c) => c.sourceUrl),
          status: weakInbound.length > 0 ? 'warning' : 'good',
        },
      ],
      findings,
      tables: [
        {
          id: 'collection_inventory',
          title: 'Category & Collection Completeness Inventory',
          description: 'Every collection/category page ranked by content, metadata, product count, filters, and inbound links.',
          rows: collections.map((c) => ({
            url: c.sourceUrl,
            name: c.name,
            parentCategory: c.parentCategory ?? '(root)',
            hierarchy: c.hierarchyPath.join(' > '),
            templateId: c.templateId,
            completenessScore: c.completenessScore,
            introWords: c.descriptionWordCount,
            hasIntroContent: c.hasIntroContent,
            hasMetaDescription: c.hasMetaDescription,
            hasH1: c.hasH1,
            productCount: c.productCount,
            hasFilters: c.hasFilters,
            filterFacets: c.filterFacets.join(', '),
            hasSorting: c.hasSorting,
            paginationType: c.paginationType,
            inboundLinks: c.inboundLinkCount,
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
        entityInspectedCount: collections.length,
        entityName: 'collection/category pages',
        notes: [
          `Evaluated ${collections.length} collection/category pages for intro copy, metadata, product counts, and faceted controls.`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


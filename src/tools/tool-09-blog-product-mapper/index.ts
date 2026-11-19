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

export const tool09BlogProductMapper: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const contents = db.getContents(crawl.crawlId);
    const products = db.getProducts(crawl.crawlId);
    const collections = db.getCollections(crawl.crawlId);
    const pages = db.getPages(crawl.crawlId);

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const articlesNoProdLinks = contents.filter((c) => c.productLinks.length === 0);
    const linkedProductNorms = new Set(contents.flatMap((c) => c.productLinks));
    const linkedCollectionNorms = new Set(contents.flatMap((c) => c.categoryLinks));
    const unlinkedProducts = products.filter((p) => !linkedProductNorms.has(p.normalizedUrl));
    const unlinkedCollections = collections.filter((c) => !linkedCollectionNorms.has(c.normalizedUrl));

    const relationshipRows: Array<Record<string, unknown>> = [];
    for (const c of contents) {
      for (const pUrl of c.productLinks) {
        relationshipRows.push({
          articleUrl: c.sourceUrl,
          articleTitle: c.title,
          targetType: 'product',
          targetUrl: pUrl,
        });
      }
      for (const colUrl of c.categoryLinks) {
        relationshipRows.push({
          articleUrl: c.sourceUrl,
          articleTitle: c.title,
          targetType: 'collection/category',
          targetUrl: colUrl,
        });
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
          id: 'editorial_articles',
          label: 'Editorial Articles',
          value: contents.length,
          subtitle: `${relationshipRows.length} total commercial link connections`,
          affectedUrls: contents.map((c) => c.sourceUrl),
          status: 'neutral',
        },
        {
          id: 'articles_without_product_links',
          label: 'Articles w/o Product Links',
          value: `${articlesNoProdLinks.length} / ${contents.length}`,
          subtitle: 'Editorial posts driving zero product clicks',
          affectedUrls: articlesNoProdLinks.map((c) => c.sourceUrl),
          status: articlesNoProdLinks.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'products_without_editorial_support',
          label: 'Products w/o Blog Links',
          value: `${unlinkedProducts.length} / ${products.length}`,
          subtitle: 'Products never linked from editorial articles',
          affectedUrls: unlinkedProducts.map((p) => p.sourceUrl),
          status: unlinkedProducts.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'collections_without_editorial_support',
          label: 'Categories w/o Blog Links',
          value: `${unlinkedCollections.length} / ${collections.length}`,
          subtitle: 'Collections never linked from editorial articles',
          affectedUrls: unlinkedCollections.map((c) => c.sourceUrl),
          status: 'neutral',
        },
      ],
      findings,
      tables: [
        {
          id: 'article_commercial_link_audit',
          title: 'Article Commercial Link Distribution',
          description: 'Every editorial article with outbound product, category, and article link counts.',
          rows: contents.map((c) => ({
            articleUrl: c.sourceUrl,
            title: c.title,
            wordCount: c.wordCount,
            productLinksCount: c.productLinks.length,
            categoryLinksCount: c.categoryLinks.length,
            articleLinksCount: c.articleLinks.length,
            linkedProducts: c.productLinks.join(' | '),
            linkedCategories: c.categoryLinks.join(' | '),
          })),
        },
        {
          id: 'article_to_product_relationship_map',
          title: 'Article-to-Product & Category Relationship Map',
          description: 'All mapped internal links flowing from editorial content to commercial pages.',
          rows: relationshipRows,
        },
        {
          id: 'products_lacking_editorial_support',
          title: 'Products & Categories Without Editorial Support',
          description: 'Commercial pages receiving zero inbound links from blog/editorial content.',
          rows: [
            ...unlinkedProducts.map((p) => ({
              pageType: 'product',
              url: p.sourceUrl,
              name: p.title,
              price: p.price ?? 'N/A',
              completenessScore: p.completenessScore,
            })),
            ...unlinkedCollections.map((c) => ({
              pageType: 'collection',
              url: c.sourceUrl,
              name: c.name,
              price: 'N/A',
              completenessScore: c.completenessScore,
            })),
          ],
        },
      ],
      coveragePanel: {
        crawlId: crawl.crawlId,
        domain: crawl.domain,
        platform: crawl.platform,
        maxLevel: crawl.maxLevel,
        ...crawl.coverage,
        classifiedPercentage: classifiedPct,
        entityInspectedCount: contents.length,
        entityName: 'editorial/blog pages',
        notes: [
          `Mapped outbound commercial links from ${contents.length} editorial pages against ${products.length} products and ${collections.length} collections.`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


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

export const tool10ContentFreshnessTracker: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const contents = db.getContents(crawl.crawlId);
    const pages = db.getPages(crawl.crawlId);

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const staleArticles = contents.filter((c) => c.freshnessDays === null || c.freshnessDays > 365);
    const thinArticles = contents.filter((c) => c.wordCount < 400);
    const noSchemaArticles = contents.filter((c) => !c.hasArticleSchema);

    // Recurring deterministic topic terms across content
    const termFreq = new Map<string, { articleCount: number; sampleUrls: string[] }>();
    for (const c of contents) {
      for (const kw of c.extractedKeywords) {
        const curr = termFreq.get(kw) ?? { articleCount: 0, sampleUrls: [] };
        curr.articleCount++;
        if (curr.sampleUrls.length < 3) curr.sampleUrls.push(c.sourceUrl);
        termFreq.set(kw, curr);
      }
    }

    const topicRows = Array.from(termFreq.entries())
      .sort((a, b) => b[1].articleCount - a[1].articleCount)
      .slice(0, 25)
      .map(([term, info]) => ({
        exactTerm: term,
        articleCount: info.articleCount,
        sampleArticles: info.sampleUrls.join(' | '),
      }));

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
          id: 'total_content_pages',
          label: 'Content Pages Inspected',
          value: contents.length,
          subtitle: 'Blog and informational pages',
          affectedUrls: contents.map((c) => c.sourceUrl),
          status: 'neutral',
        },
        {
          id: 'stale_or_undated',
          label: 'Stale (>1yr) or Undated',
          value: staleArticles.length,
          subtitle: 'Pages needing freshness review',
          affectedUrls: staleArticles.map((c) => c.sourceUrl),
          status: staleArticles.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'thin_content_pages',
          label: 'Thin Content (<400w)',
          value: thinArticles.length,
          subtitle: 'Articles under 400 words',
          affectedUrls: thinArticles.map((c) => c.sourceUrl),
          status: thinArticles.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'missing_article_schema',
          label: 'Missing Article Schema',
          value: noSchemaArticles.length,
          subtitle: 'Pages without Article/BlogPosting JSON-LD',
          affectedUrls: noSchemaArticles.map((c) => c.sourceUrl),
          status: noSchemaArticles.length > 0 ? 'warning' : 'good',
        },
      ],
      findings,
      tables: [
        {
          id: 'content_freshness_inventory',
          title: 'Content Freshness & Completeness Report',
          description: 'Publication/modified dates, age in days, word counts, heading structure, and Article schema status.',
          rows: contents.map((c) => ({
            url: c.sourceUrl,
            title: c.title,
            categoryTopic: c.categoryTopic,
            author: c.author ?? '(missing)',
            publishedDate: c.publishedDate ?? '(missing)',
            modifiedDate: c.modifiedDate ?? '(missing)',
            freshnessDays: c.freshnessDays ?? 'Unknown',
            wordCount: c.wordCount,
            h2Count: c.h2Count,
            hasMetaDescription: c.hasMetaDescription,
            hasArticleSchema: c.hasArticleSchema,
            extractedTerms: c.extractedKeywords.join(', '),
          })),
        },
        {
          id: 'recurring_topic_terms',
          title: 'Recurring Deterministic Topic Terms (No LLM)',
          description: 'Exact recurring non-stopword terms extracted deterministically from titles, headings, and body copy.',
          rows: topicRows,
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
        entityName: 'content pages',
        notes: [
          `Evaluated ${contents.length} content pages using deterministic date, word-count, and exact-term frequency extraction (zero LLM).`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


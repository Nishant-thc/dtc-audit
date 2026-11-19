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

export const tool16ImageAuditor: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const images = db.getImages(crawl.crawlId);
    const pages = db.getPages(crawl.crawlId);

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const missingAlt = images.filter((i) => !i.hasAlt);
    const legacyFormat = images.filter((i) => i.format !== 'webp' && i.format !== 'avif' && i.format !== 'svg');
    const missingDims = images.filter((i) => i.width === null || i.height === null);
    const notLazy = images.filter((i) => !i.isLazyLoaded);

    const formatBreakdown = new Map<string, number>();
    for (const img of images) {
      formatBreakdown.set(img.format, (formatBreakdown.get(img.format) ?? 0) + 1);
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
          id: 'total_images',
          label: 'Total Images Inspected',
          value: images.length,
          subtitle: `Across ${new Set(images.map((i) => i.sourceUrl)).size} pages`,
          affectedUrls: Array.from(new Set(images.map((i) => i.sourceUrl))),
          status: 'neutral',
        },
        {
          id: 'missing_alt_images',
          label: 'Missing Alt Text',
          value: `${missingAlt.length} / ${images.length}`,
          subtitle: 'Images without descriptive alt attributes',
          affectedUrls: Array.from(new Set(missingAlt.map((i) => i.sourceUrl))),
          status: missingAlt.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'legacy_format_images',
          label: 'Legacy Formats (JPG/PNG)',
          value: `${legacyFormat.length} / ${images.length}`,
          subtitle: 'Images not served as WebP/AVIF/SVG',
          affectedUrls: Array.from(new Set(legacyFormat.map((i) => i.sourceUrl))),
          status: legacyFormat.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'missing_dimensions_images',
          label: 'Missing Width / Height',
          value: `${missingDims.length} / ${images.length}`,
          subtitle: 'Images risking Cumulative Layout Shift (CLS)',
          affectedUrls: Array.from(new Set(missingDims.map((i) => i.sourceUrl))),
          status: missingDims.length > 0 ? 'warning' : 'good',
        },
      ],
      findings,
      tables: [
        {
          id: 'image_optimisation_inventory',
          title: '1. Complete Store Image Audit Inventory',
          description: 'Every extracted image with alt text, format, explicit dimensions, and lazy-loading status.',
          rows: images.map((i) => ({
            pageUrl: i.sourceUrl,
            imageUrl: i.imageUrl,
            hasAlt: i.hasAlt,
            altText: i.altText || '(missing)',
            format: i.format,
            width: i.width ?? '(missing)',
            height: i.height ?? '(missing)',
            isLazyLoaded: i.isLazyLoaded,
          })),
        },
        {
          id: 'image_format_breakdown',
          title: '2. Image Format Distribution',
          description: 'Breakdown of modern vs. legacy image formats across the store.',
          rows: Array.from(formatBreakdown.entries()).map(([format, count]) => ({
            format,
            imageCount: count,
            sharePct: images.length > 0 ? Number(((count / images.length) * 100).toFixed(1)) : 0,
            isNextGen: format === 'webp' || format === 'avif' || format === 'svg',
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
        entityInspectedCount: images.length,
        entityName: 'images',
        notes: [
          `Audited ${images.length} images (${notLazy.length} eager-loaded, ${missingDims.length} missing explicit width/height).`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


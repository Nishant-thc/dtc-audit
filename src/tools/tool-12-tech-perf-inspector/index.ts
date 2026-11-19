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

export const tool12TechPerfInspector: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const pages = db.getPages(crawl.crawlId).filter((p) => p.status === 200);
    const technologies = db.getTechnologies(crawl.crawlId);
    const perfObs = db.getObservations(crawl.crawlId, 'performance');
    const images = db.getImages(crawl.crawlId);

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const techMap = new Map<
      string,
      { category: string; provider: string; isThirdParty: boolean; pageCount: number; sampleScript: string }
    >();
    for (const t of technologies) {
      const curr = techMap.get(t.name) ?? {
        category: t.category,
        provider: t.provider,
        isThirdParty: t.isThirdParty,
        pageCount: 0,
        sampleScript: t.scriptUrl ?? t.signatureMatched,
      };
      curr.pageCount++;
      techMap.set(t.name, curr);
    }

    const byUrlPerf = new Map<string, Record<string, unknown>>();
    for (const o of perfObs) {
      const curr = byUrlPerf.get(o.sourceUrl) ?? {
        url: o.sourceUrl,
        pageType: o.pageType,
        templateId: o.templateId,
      };
      curr[o.metric] = o.value;
      byUrlPerf.set(o.sourceUrl, curr);
    }

    const perfRows = Array.from(byUrlPerf.values());
    const thirdPartyTechCount = Array.from(techMap.values()).filter((t) => t.isThirdParty).length;
    const nonWebpAvifImages = images.filter((i) => i.format !== 'webp' && i.format !== 'avif' && i.format !== 'svg');

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
          id: 'detected_platform',
          label: 'Detected Platform',
          value: crawl.platform.toUpperCase(),
          subtitle: `${techMap.size} total technologies identified`,
          affectedUrls: pages.map((p) => p.sourceUrl),
          status: 'neutral',
        },
        {
          id: 'third_party_integrations',
          label: 'Third-Party Integrations',
          value: thirdPartyTechCount,
          subtitle: 'Analytics, pixels, chat & review scripts',
          affectedUrls: Array.from(new Set(technologies.filter((t) => t.isThirdParty).map((t) => t.sourceUrl))),
          status: thirdPartyTechCount > 6 ? 'warning' : 'good',
        },
        {
          id: 'legacy_image_formats',
          label: 'Non-Next-Gen Images',
          value: `${nonWebpAvifImages.length} / ${images.length}`,
          subtitle: 'Images not using WebP/AVIF/SVG',
          affectedUrls: Array.from(new Set(nonWebpAvifImages.map((i) => i.sourceUrl))),
          status: nonWebpAvifImages.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'level_c_sampled_perf',
          label: 'Deeply Sampled Pages',
          value: crawl.coverage.deeplyInspected,
          subtitle: 'Desktop & mobile runtime measurements',
          affectedUrls: pages.filter((p) => p.extractionMethod === 'C').map((p) => p.sourceUrl),
          status: 'neutral',
        },
      ],
      findings,
      tables: [
        {
          id: 'technology_inventory',
          title: 'Detected Technology & Marketing Integration Inventory',
          description: 'Platform, frameworks, analytics, pixels, review widgets, email/SMS, and chat integrations.',
          rows: Array.from(techMap.entries()).map(([name, info]) => ({
            technology: name,
            category: info.category,
            provider: info.provider,
            isThirdParty: info.isThirdParty,
            detectedOnPagesCount: info.pageCount,
            signatureOrScript: info.sampleScript,
          })),
        },
        {
          id: 'page_performance_measurements',
          title: 'Page Resource Weight, Caching & Runtime Performance',
          description: 'Script counts, HTML weight, lazy-loading share, compression/caching headers, and Level C runtime timings.',
          rows: perfRows.map((r) => ({
            url: r.url,
            pageType: r.pageType,
            templateId: r.templateId,
            externalScripts: r.total_external_scripts ?? 0,
            thirdPartyScripts: r.third_party_script_count ?? 0,
            stylesheets: r.stylesheet_count ?? 0,
            htmlBytes: r.html_document_bytes ?? 0,
            lazyLoadedImgPct: `${r.lazy_loaded_image_pct ?? 100}%`,
            hasCompression: Boolean(r.has_compression),
            hasCacheControl: Boolean(r.has_cache_control),
            desktopDclMs: r.level_c_dcl_ms ?? 'Not sampled',
            desktopLoadMs: r.level_c_load_ms ?? 'Not sampled',
            mobileEstimatedLcpMs: r.level_c_mobile_lcp_ms ?? 'Not sampled',
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
        entityInspectedCount: perfRows.length,
        entityName: 'pages with performance observations',
        notes: [
          `Detected ${techMap.size} technologies and measured resource/runtime performance across ${perfRows.length} pages (${crawl.coverage.deeplyInspected} at Level C).`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


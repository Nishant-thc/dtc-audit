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

export const tool11ConversionAuditor: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const pages = db.getPages(crawl.crawlId).filter((p) => p.status === 200);
    const convObs = db.getObservations(crawl.crawlId, 'conversion');

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const byUrl = new Map<string, Record<string, unknown>>();
    for (const o of convObs) {
      const curr = byUrl.get(o.sourceUrl) ?? {
        url: o.sourceUrl,
        pageType: o.pageType,
        templateId: o.templateId,
        extractionMethod: o.extractionMethod,
      };
      curr[o.metric] = o.value;
      if (o.extractionMethod === 'C') curr.extractionMethod = 'C';
      byUrl.set(o.sourceUrl, curr);
    }

    const pageRows = Array.from(byUrl.values());
    const withCta = pageRows.filter((r) => Boolean(r.has_primary_cta));
    const withTrust = pageRows.filter((r) => Boolean(r.has_trust_signals));
    const withDelivery = pageRows.filter((r) => Boolean(r.has_delivery_or_returns_info));
    const withLeadCapture = pageRows.filter((r) => Boolean(r.has_lead_capture));

    // Group by template to highlight inconsistencies
    const byTemplate = new Map<
      string,
      { count: number; ctaCount: number; trustCount: number; deliveryCount: number; reviewCount: number }
    >();
    for (const r of pageRows) {
      const tid = String(r.templateId);
      const curr = byTemplate.get(tid) ?? { count: 0, ctaCount: 0, trustCount: 0, deliveryCount: 0, reviewCount: 0 };
      curr.count++;
      if (r.has_primary_cta) curr.ctaCount++;
      if (r.has_trust_signals) curr.trustCount++;
      if (r.has_delivery_or_returns_info) curr.deliveryCount++;
      if (r.has_review_section) curr.reviewCount++;
      byTemplate.set(tid, curr);
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
          id: 'cta_coverage',
          label: 'Primary CTA Coverage',
          value: `${withCta.length} / ${pageRows.length}`,
          subtitle: 'Inspected pages with clear primary CTA',
          affectedUrls: pageRows.filter((r) => !r.has_primary_cta).map((r) => String(r.url)),
          status: withCta.length === pageRows.length ? 'good' : 'warning',
        },
        {
          id: 'trust_signal_coverage',
          label: 'Trust Signal Coverage',
          value: `${withTrust.length} / ${pageRows.length}`,
          subtitle: 'Pages with security/guarantee badges',
          affectedUrls: pageRows.filter((r) => !r.has_trust_signals).map((r) => String(r.url)),
          status: withTrust.length < pageRows.length ? 'warning' : 'good',
        },
        {
          id: 'delivery_info_coverage',
          label: 'Delivery / Returns Info',
          value: `${withDelivery.length} / ${pageRows.length}`,
          subtitle: 'Pages displaying shipping/returns copy',
          affectedUrls: pageRows.filter((r) => !r.has_delivery_or_returns_info).map((r) => String(r.url)),
          status: withDelivery.length < pageRows.length ? 'warning' : 'good',
        },
        {
          id: 'lead_capture_coverage',
          label: 'Lead Capture Presence',
          value: `${withLeadCapture.length} / ${pageRows.length}`,
          subtitle: 'Pages with email/newsletter signup forms',
          affectedUrls: withLeadCapture.map((r) => String(r.url)),
          status: 'neutral',
        },
      ],
      findings,
      tables: [
        {
          id: 'conversion_ux_checklist',
          title: 'Page-Level Conversion Element & UX Checklist',
          description: 'Observable conversion elements per inspected page (reports observable presence only, not conversion rates).',
          rows: pageRows.map((r) => ({
            url: r.url,
            pageType: r.pageType,
            templateId: r.templateId,
            method: `Level ${r.extractionMethod}`,
            hasPrimaryCta: Boolean(r.has_primary_cta),
            hasTrustSignals: Boolean(r.has_trust_signals),
            hasDeliveryReturnsInfo: Boolean(r.has_delivery_or_returns_info),
            hasReviewSection: Boolean(r.has_review_section),
            hasLeadCapture: Boolean(r.has_lead_capture),
            hasPromoBanner: Boolean(r.has_promo_mechanism),
            hasCartDrawerOrSticky: Boolean(r.has_cart_drawer_or_sticky_cta || r.level_c_cart_drawer || r.level_c_sticky_elements),
          })),
        },
        {
          id: 'template_conversion_consistency',
          title: 'Conversion Element Consistency Across Templates',
          description: 'Comparison of observable UX elements grouped by template ID.',
          rows: Array.from(byTemplate.entries()).map(([templateId, st]) => ({
            templateId,
            pagesInspected: st.count,
            ctaCoverage: `${st.ctaCount}/${st.count}`,
            trustBadgeCoverage: `${st.trustCount}/${st.count}`,
            deliveryInfoCoverage: `${st.deliveryCount}/${st.count}`,
            reviewSectionCoverage: `${st.reviewCount}/${st.count}`,
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
        entityInspectedCount: pageRows.length,
        entityName: 'pages with conversion observations',
        notes: [
          `Reports observable conversion elements only across ${pageRows.length} pages (${crawl.coverage.deeplyInspected} deeply rendered at Level C). Never claims or predicts conversion rates.`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


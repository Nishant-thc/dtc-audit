import type { SharedDatabase } from '../db/database.ts';
import type {
  CrawlRecord,
  LocalSpeedSummary,
  RuleResultRecord,
} from '../types/entities.ts';

function registrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  if (/^(co|com|org|net|gov)\.[a-z]{2}$/.test(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

const PLATFORM_CDN_DOMAINS = new Set(['shopify.com', 'shopifycdn.com', 'cdn.shopify.com', 'bigcommerce.com']);

export function evaluateLocalSpeed(
  db: SharedDatabase,
  crawl: CrawlRecord
): { summary: LocalSpeedSummary; ruleResults: RuleResultRecord[] } {
  const pages = db.getPages(crawl.crawlId);
  const htmlPages = pages.filter((p) => p.extractionMethod !== 'A' || p.title !== null || p.contentLength > 0);
  const images = db.getImages(crawl.crawlId);
  const observations = db.getObservations(crawl.crawlId);
  const technologies = db.getTechnologies(crawl.crawlId);
  const siteRegDomain = registrableDomain(crawl.domain);

  // 1. Static speed & weight metrics (always available, no browser required)
  const htmlBytesObs = observations.filter((o) => o.category === 'performance' && o.metric === 'html_document_bytes');
  const htmlKbs =
    htmlBytesObs.length > 0
      ? htmlBytesObs.map((o) => Math.round(Number(o.value) / 1024))
      : htmlPages.map((p) => Math.round(p.contentLength / 1024));
  const avgHtmlKb = htmlKbs.length > 0 ? Math.round(htmlKbs.reduce((a, b) => a + b, 0) / htmlKbs.length) : 0;
  const maxHtmlKb = htmlKbs.length > 0 ? Math.max(...htmlKbs) : 0;

  const extScriptObs = observations.filter((o) => o.category === 'performance' && o.metric === 'total_external_scripts');
  const avgExternalScripts =
    extScriptObs.length > 0
      ? Math.round(extScriptObs.reduce((a, o) => a + Number(o.value), 0) / extScriptObs.length)
      : 0;

  const tpScriptObs = observations.filter((o) => o.category === 'performance' && o.metric === 'third_party_script_count');
  const thirdPartyDomainSet = new Set<string>();
  for (const o of tpScriptObs) {
    const sample = Array.isArray(o.details?.sample) ? (o.details.sample as string[]) : [];
    for (const s of sample) {
      try {
        const host = new URL(s).hostname.replace(/^www\./, '');
        const reg = registrableDomain(host);
        if (reg && reg !== siteRegDomain && !PLATFORM_CDN_DOMAINS.has(reg) && !PLATFORM_CDN_DOMAINS.has(host)) {
          thirdPartyDomainSet.add(reg);
        }
      } catch {
        // ignore invalid URLs
      }
    }
  }
  for (const t of technologies) {
    if (t.isThirdParty) {
      if (t.scriptUrl) {
        try {
          const reg = registrableDomain(new URL(t.scriptUrl).hostname);
          if (reg && reg !== siteRegDomain && !PLATFORM_CDN_DOMAINS.has(reg)) {
            thirdPartyDomainSet.add(reg);
          }
        } catch {
          thirdPartyDomainSet.add(t.provider.toLowerCase());
        }
      } else {
        thirdPartyDomainSet.add(t.provider.toLowerCase());
      }
    }
  }

  const rawAvgThirdParty =
    tpScriptObs.length > 0
      ? Math.round(tpScriptObs.reduce((a, o) => a + Number(o.value), 0) / tpScriptObs.length)
      : 0;
  const avgThirdPartyScripts = Math.max(rawAvgThirdParty, thirdPartyDomainSet.size);

  const cssObs = observations.filter((o) => o.category === 'performance' && o.metric === 'stylesheet_count');
  const renderBlockingCssAvg =
    cssObs.length > 0 ? Math.round(cssObs.reduce((a, o) => a + Number(o.value), 0) / cssObs.length) : 0;

  const imgsMissingDim = images.filter((i) => i.width === null || i.height === null);
  const imagesMissingDimensionsPct =
    images.length > 0 ? Math.round((imgsMissingDim.length / images.length) * 100) : 0;

  // Measurement hygiene: check for duplicate GTM/GA4/Meta Pixel tags or conflicting analytics
  const duplicateTrackingTags: string[] = [];
  const techCountsByPage = new Map<string, Map<string, number>>();
  for (const t of technologies) {
    if (t.category === 'analytics' || t.category === 'pixel') {
      const m = techCountsByPage.get(t.sourceUrl) ?? new Map<string, number>();
      m.set(t.name, (m.get(t.name) ?? 0) + 1);
      techCountsByPage.set(t.sourceUrl, m);
    }
  }
  const hasGtm = technologies.some((t) => t.name === 'Google Tag Manager');
  const hasDirectGa4 = technologies.some((t) => t.name === 'Google Analytics 4');
  if (hasGtm && hasDirectGa4) {
    duplicateTrackingTags.push('Both Google Tag Manager and direct GA4 snippet detected (verify no double-counting)');
  }

  // 2. Browser Lab Vitals (Deep scan only — honest "Not measured" if browser didn't run)
  const lcpObs = observations.filter((o) => o.category === 'performance' && o.metric === 'lab_lcp_ms');
  const clsObs = observations.filter((o) => o.category === 'performance' && o.metric === 'lab_cls');
  const ttfbObs = observations.filter((o) => o.category === 'performance' && o.metric === 'lab_ttfb_ms');
  const tbtObs = observations.filter((o) => o.category === 'performance' && o.metric === 'lab_tbt_proxy_ms');
  const waterfallObs = observations.find((o) => o.category === 'performance' && o.metric === 'lab_request_waterfall');
  const dlObs = observations.filter((o) => o.category === 'performance' && o.metric === 'datalayer_ecommerce_events');

  const measured = lcpObs.length > 0 || ttfbObs.length > 0;
  const avgNum = (arr: typeof lcpObs): number | null =>
    arr.length > 0 ? Math.round(arr.reduce((a, o) => a + Number(o.value), 0) / arr.length) : null;
  const avgCls =
    clsObs.length > 0
      ? Number((clsObs.reduce((a, o) => a + Number(o.value), 0) / clsObs.length).toFixed(3))
      : null;

  const lcpMs = avgNum(lcpObs);
  const ttfbMs = avgNum(ttfbObs);
  const tbtProxyMs = avgNum(tbtObs);
  const waterfallSample = Array.isArray(waterfallObs?.details?.requests)
    ? (waterfallObs!.details.requests as LocalSpeedSummary['browserVitals']['waterfallSample']).slice(0, 15)
    : [];
  const dataLayerEcommerceEvents = Array.from(
    new Set(
      dlObs.flatMap((o) =>
        Array.isArray(o.details?.events) ? (o.details.events as string[]) : []
      )
    )
  );

  const isStaleDeepScan = !measured && crawl.coverage.deeplyInspected > 0;
  const summary: LocalSpeedSummary = {
    measurementMode: measured ? 'lab_browser' : 'static_only',
    disclaimer: measured
      ? 'Lab estimate from local headless Chromium — not Google CrUX field data. INP requires real user interaction and is omitted.'
      : isStaleDeepScan
        ? 'Measured on an older scan before lab vitals were captured. Re-run a deep scan to measure local LCP and CLS.'
        : 'Static HTML and asset checks only. Run a deep scan to measure local lab LCP, CLS, and TTFB.',
    staticMetrics: {
      avgHtmlKb,
      maxHtmlKb,
      avgExternalScripts,
      avgThirdPartyScripts,
      thirdPartyDomains: Array.from(thirdPartyDomainSet).slice(0, 20),
      renderBlockingCssAvg,
      imagesMissingDimensionsPct,
      duplicateTrackingTags,
    },
    browserVitals: {
      measured,
      sampleCount: Math.max(lcpObs.length, ttfbObs.length),
      lcpMs,
      lcpThresholdMs: 2500,
      cls: avgCls,
      clsThreshold: 0.1,
      ttfbMs,
      tbtProxyMs,
      dataLayerEcommerceEvents,
      waterfallSample,
    },
  };

  // Build deterministic RuleResultRecords for Local Speed
  const ruleResults: RuleResultRecord[] = [];

  // SPEED-001: Lab LCP <= 2.5s
  if (!measured || lcpMs === null) {
    ruleResults.push({
      ruleId: 'SPEED-001',
      toolId: 'local-speed',
      areaId: 'site_health_speed',
      title: 'Largest Contentful Paint (LCP) lab estimate ≤ 2.5s',
      plainTitle: 'Main page content loads slower than 2.5 seconds (Lab LCP)',
      kind: 'issue',
      status: 'not_measured',
      actionTier: 'fix_soon',
      weight: 3,
      effortMinutes: 45,
      owner: 'Theme / Web Developer',
      applicableCount: 0,
      affectedCount: 0,
      passedCount: 0,
      passRate: 1,
      denominatorNoun: 'browser-rendered pages',
      confidenceTag: 'not_measured',
      notMeasuredReason: 'Enable Deep (with browser) scan to measure local lab LCP.',
      affectedUrls: [],
      templateGroupCounts: {},
      finding: null,
    });
  } else {
    const slowLcp = lcpObs.filter((o) => Number(o.value) > 2500);
    ruleResults.push({
      ruleId: 'SPEED-001',
      toolId: 'local-speed',
      areaId: 'site_health_speed',
      title: 'Largest Contentful Paint (LCP) lab estimate ≤ 2.5s',
      plainTitle: 'Main page content loads slower than 2.5 seconds (Lab LCP)',
      kind: 'issue',
      status: slowLcp.length === 0 ? 'pass' : 'fail',
      actionTier: 'fix_soon',
      weight: 3,
      effortMinutes: 45,
      owner: 'Theme / Web Developer',
      applicableCount: lcpObs.length,
      affectedCount: slowLcp.length,
      passedCount: lcpObs.length - slowLcp.length,
      passRate: (lcpObs.length - slowLcp.length) / lcpObs.length,
      denominatorNoun: 'browser-rendered pages',
      confidenceTag: lcpObs.length < 8 ? 'small_sample' : 'sampled',
      affectedUrls: slowLcp.map((o) => o.sourceUrl),
      templateGroupCounts: { 'Sampled templates': { affected: slowLcp.length, total: lcpObs.length } },
      finding: null,
    });
  }

  // SPEED-002: Lab CLS <= 0.1
  if (!measured || avgCls === null) {
    ruleResults.push({
      ruleId: 'SPEED-002',
      toolId: 'local-speed',
      areaId: 'site_health_speed',
      title: 'Cumulative Layout Shift (CLS) lab estimate ≤ 0.1',
      plainTitle: 'Page layout shifts while loading (Lab CLS > 0.1)',
      kind: 'issue',
      status: 'not_measured',
      actionTier: 'fix_soon',
      weight: 2,
      effortMinutes: 30,
      owner: 'Theme / Web Developer',
      applicableCount: 0,
      affectedCount: 0,
      passedCount: 0,
      passRate: 1,
      denominatorNoun: 'browser-rendered pages',
      confidenceTag: 'not_measured',
      notMeasuredReason: 'Enable Deep (with browser) scan to measure local lab CLS.',
      affectedUrls: [],
      templateGroupCounts: {},
      finding: null,
    });
  } else {
    const highCls = clsObs.filter((o) => Number(o.value) > 0.1);
    ruleResults.push({
      ruleId: 'SPEED-002',
      toolId: 'local-speed',
      areaId: 'site_health_speed',
      title: 'Cumulative Layout Shift (CLS) lab estimate ≤ 0.1',
      plainTitle: 'Page layout shifts while loading (Lab CLS > 0.1)',
      kind: 'issue',
      status: highCls.length === 0 ? 'pass' : 'fail',
      actionTier: 'fix_soon',
      weight: 2,
      effortMinutes: 30,
      owner: 'Theme / Web Developer',
      applicableCount: clsObs.length,
      affectedCount: highCls.length,
      passedCount: clsObs.length - highCls.length,
      passRate: (clsObs.length - highCls.length) / clsObs.length,
      denominatorNoun: 'browser-rendered pages',
      confidenceTag: clsObs.length < 8 ? 'small_sample' : 'sampled',
      affectedUrls: highCls.map((o) => o.sourceUrl),
      templateGroupCounts: { 'Sampled templates': { affected: highCls.length, total: clsObs.length } },
      finding: null,
    });
  }

  return { summary, ruleResults };
}

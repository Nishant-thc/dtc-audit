import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import type { SharedDatabase } from '../db/database.ts';
import type {
  AiBotAccessEntry,
  AiReadinessSummary,
  CrawlRecord,
  RuleResultRecord,
} from '../types/entities.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface BotSpec {
  userAgent: string;
  provider: string;
  purpose: 'training' | 'search_citation' | 'user_fetch';
}

function loadAiBots(): BotSpec[] {
  const raw = fs.readFileSync(path.join(__dirname, 'ai-bots.yaml'), 'utf-8');
  const parsed = YAML.parse(raw) as { bots?: BotSpec[] };
  return parsed?.bots ?? [];
}

/**
 * Evaluates robots.txt directives for a specific User-Agent.
 * Honors exact UA blocks first, then falls back to wildcard (*) rules.
 */
export function checkRobotsForUserAgent(
  robotsTxtRaw: string | null,
  targetUa: string
): 'allowed' | 'disallowed' | 'no_rule' {
  if (!robotsTxtRaw || !robotsTxtRaw.trim()) return 'no_rule';

  const lines = robotsTxtRaw
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);

  interface Group {
    agents: string[];
    rules: Array<{ type: 'allow' | 'disallow'; path: string }>;
  }

  const groups: Group[] = [];
  let current: Group | null = null;

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();

    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(val.toLowerCase());
    } else if (current && (key === 'disallow' || key === 'allow')) {
      current.rules.push({ type: key, path: val });
    }
  }

  const targetLower = targetUa.toLowerCase();
  const exactGroups = groups.filter((g) => g.agents.includes(targetLower));
  const wildcardGroups = groups.filter((g) => g.agents.includes('*'));
  const activeGroups = exactGroups.length > 0 ? exactGroups : wildcardGroups;

  if (activeGroups.length === 0) return 'no_rule';

  let rootDisallowed = false;
  let rootAllowed = false;

  for (const g of activeGroups) {
    for (const r of g.rules) {
      if (r.type === 'disallow' && (r.path === '/' || r.path === '/*')) {
        rootDisallowed = true;
      } else if (r.type === 'allow' && (r.path === '/' || r.path === '/*')) {
        rootAllowed = true;
      }
    }
  }

  if (rootDisallowed && !rootAllowed) return 'disallowed';
  if (exactGroups.length > 0) return 'allowed';
  return 'no_rule';
}

export function evaluateAiReadiness(
  db: SharedDatabase,
  crawl: CrawlRecord
): { summary: AiReadinessSummary; ruleResults: RuleResultRecord[] } {
  const botsSpec = loadAiBots();
  const pages = db.getPages(crawl.crawlId);
  const htmlPages = pages.filter((p) => p.extractionMethod !== 'A' || p.title !== null || p.contentLength > 0);
  const products = db.getProducts(crawl.crawlId);
  const schemas = db.getSchemas(crawl.crawlId);
  const links = db.getLinks(crawl.crawlId);
  const observations = db.getObservations(crawl.crawlId);

  const robotsFound = Boolean(crawl.robotsTxtRaw && crawl.robotsTxtRaw.trim().length > 0);

  // Check if any server-side AI UA probe or llms.txt observation was recorded during crawl
  const llmsObs = observations.find((o) => o.metric === 'llms_txt_found');
  const llmsTxtFound = llmsObs ? Boolean(llmsObs.value) : false;
  const llmsTxtUrl = llmsTxtFound ? `https://${crawl.domain}/llms.txt` : null;

  const bots: AiBotAccessEntry[] = botsSpec.map((b) => {
    const robotsStatus = checkRobotsForUserAgent(crawl.robotsTxtRaw, b.userAgent);
    const probeObs = observations.find((o) => o.metric === `ai_ua_probe_${b.userAgent.toLowerCase()}`);
    const serverFetchStatus = probeObs
      ? (String(probeObs.value) as AiBotAccessEntry['serverFetchStatus'])
      : 'not_tested';
    return {
      userAgent: b.userAgent,
      provider: b.provider,
      purpose: b.purpose,
      robotsStatus,
      serverFetchStatus,
    };
  });

  // 1. Search & citation bots blocked (Training bots are intentionally NOT penalized)
  const citationBots = bots.filter((b) => b.purpose === 'search_citation' || b.purpose === 'user_fetch');
  const blockedCitationBots = citationBots.filter(
    (b) => b.robotsStatus === 'disallowed' || b.serverFetchStatus === 'blocked_403' || b.serverFetchStatus === 'challenge'
  );

  // 2. Raw HTML vs Rendered DOM parity
  const deepPages = htmlPages.filter((p) => p.extractionMethod === 'C');
  const rawHtmlParityObs = observations.find((o) => o.metric === 'raw_vs_rendered_word_ratio');
  let parityStatus: AiReadinessSummary['rawVsRenderedParity']['status'] = 'not_measured';
  let paritySummary = 'Run a Deep (with browser) scan to compare raw HTML against JavaScript-rendered content.';
  let rawWords: number | null = null;
  let renderedWords: number | null = null;
  let priceInRawHtml: boolean | null = null;
  let paritySampleUrl: string | null = null;

  if (rawHtmlParityObs) {
    const ratio = Number(rawHtmlParityObs.value);
    rawWords = Number(rawHtmlParityObs.details?.rawWordCount ?? 0);
    renderedWords = Number(rawHtmlParityObs.details?.renderedWordCount ?? 0);
    paritySampleUrl = rawHtmlParityObs.sourceUrl;
    priceInRawHtml =
      typeof rawHtmlParityObs.details?.priceInRawHtml === 'boolean'
        ? (rawHtmlParityObs.details.priceInRawHtml as boolean)
        : null;
    if (ratio < 0.5 && renderedWords > 80) {
      parityStatus = 'js_dependent_gap';
      paritySummary = `Raw HTML contains only ${Math.round(ratio * 100)}% of the words visible after JavaScript runs (${rawWords} vs ${renderedWords} words). Crawlers without JavaScript miss key product details.`;
    } else {
      parityStatus = 'verified';
      paritySummary = `Core page text is present in the initial HTML (${rawWords} raw words vs ${renderedWords} rendered words).`;
    }
  } else if (deepPages.length > 0 && products.length > 0) {
    const sampleProd = products[0];
    paritySampleUrl = sampleProd.sourceUrl;
    rawWords = sampleProd.descriptionWordCount;
    renderedWords = sampleProd.descriptionWordCount;
    priceInRawHtml = sampleProd.price !== null;
    parityStatus = sampleProd.descriptionWordCount > 0 && sampleProd.price !== null ? 'verified' : 'js_dependent_gap';
    paritySummary =
      parityStatus === 'verified'
        ? 'Product name, price, and description are present in the initial HTML response.'
        : 'Product price or description was missing in the initial HTML response.';
  } else if (products.length > 0) {
    // Check if products have price & description directly in Level B raw HTML
    const sampleProd = products[0];
    paritySampleUrl = sampleProd.sourceUrl;
    rawWords = sampleProd.descriptionWordCount;
    priceInRawHtml = sampleProd.price !== null;
    if (products.every((p) => p.price !== null && p.descriptionWordCount >= 15)) {
      parityStatus = 'verified';
      paritySummary = 'Product names, prices, and descriptions are present in raw HTML without requiring JavaScript.';
    }
  }

  // 3. Answerable facts
  const allLinkTargets = links.map((l) => `${l.destinationUrl} ${l.anchorText}`.toLowerCase());
  const hasShippingReturnsLink = allLinkTargets.some((t) => /shipping|delivery|returns|refund/i.test(t));
  const hasAboutLink = allLinkTargets.some((t) => /\/about|about us|our story/i.test(t));
  const hasFaqContent =
    allLinkTargets.some((t) => /\/faq|frequently asked/i.test(t)) ||
    schemas.some((s) => s.schemaType === 'FAQPage') ||
    htmlPages.some((p) => /frequently asked questions/i.test(p.visibleText));

  const productsWithPlainSpecs = products.filter((p) => p.specsCount >= 2 || p.descriptionWordCount >= 40);
  const productSpecsInPlainTextPct =
    products.length > 0 ? Math.round((productsWithPlainSpecs.length / products.length) * 100) : 0;

  // 4. Entity consistency (Organization + Product schema brand agreement + sameAs)
  const orgSchema = schemas.find((s) => s.schemaType === 'Organization');
  const orgBrandName = orgSchema?.rawProperties?.name ? String(orgSchema.rawProperties.name).trim() : null;
  const sameAsRaw = orgSchema?.rawProperties?.sameAs;
  const sameAsCount = Array.isArray(sameAsRaw)
    ? sameAsRaw.length
    : typeof sameAsRaw === 'string' && sameAsRaw.trim()
      ? 1
      : 0;
  const productBrandNames = Array.from(
    new Set(products.map((p) => p.brand?.trim()).filter((b): b is string => Boolean(b)))
  );
  const brandsAgree =
    orgBrandName && productBrandNames.length > 0
      ? productBrandNames.some((pb) => pb.toLowerCase() === orgBrandName.toLowerCase())
      : null;

  const summary: AiReadinessSummary = {
    robotsFound,
    llmsTxtFound,
    llmsTxtUrl,
    bots,
    rawVsRenderedParity: {
      status: parityStatus,
      summary: paritySummary,
      sampleUrl: paritySampleUrl,
      rawWordCount: rawWords,
      renderedWordCount: renderedWords,
      priceInRawHtml,
    },
    answerableFacts: {
      hasShippingReturnsLink,
      hasAboutLink,
      hasFaqContent,
      productSpecsInPlainTextPct,
    },
    entityConsistency: {
      orgBrandName,
      productBrandNames,
      brandsAgree,
      sameAsCount,
    },
  };

  // Build deterministic RuleResultRecords for AI Readiness
  const homeUrl = `https://${crawl.domain}/`;
  const ruleResults: RuleResultRecord[] = [];

  // AI-001: Search & citation AI bots allowed in robots.txt
  const ai001Pass = blockedCitationBots.length === 0;
  ruleResults.push({
    ruleId: 'AI-001',
    toolId: 'ai-readiness',
    areaId: 'ai_readiness',
    title: 'AI search and citation crawlers allowed in robots.txt',
    plainTitle: 'AI search crawlers (ChatGPT Search, Perplexity, Claude) are blocked in robots.txt',
    kind: 'issue',
    status: ai001Pass ? 'pass' : 'fail',
    actionTier: 'fix_now',
    weight: 4,
    effortMinutes: 15,
    owner: 'Theme / Web Developer',
    applicableCount: citationBots.length,
    affectedCount: blockedCitationBots.length,
    passedCount: citationBots.length - blockedCitationBots.length,
    passRate: citationBots.length > 0 ? (citationBots.length - blockedCitationBots.length) / citationBots.length : 1,
    denominatorNoun: 'AI search crawlers',
    confidenceTag: robotsFound ? 'verified' : 'sampled',
    affectedUrls: ai001Pass ? [] : [`https://${crawl.domain}/robots.txt`],
    templateGroupCounts: { 'Sitewide configuration': { affected: blockedCitationBots.length, total: citationBots.length } },
    finding: null,
  });

  // AI-002: Raw HTML product content availability
  if (parityStatus === 'not_measured') {
    ruleResults.push({
      ruleId: 'AI-002',
      toolId: 'ai-readiness',
      areaId: 'ai_readiness',
      title: 'Core product details present in raw HTML (no JS required)',
      plainTitle: 'Product details depend on JavaScript and may be invisible to AI crawlers',
      kind: 'issue',
      status: 'not_measured',
      actionTier: 'fix_now',
      weight: 4,
      effortMinutes: 60,
      owner: 'Theme / Web Developer',
      applicableCount: 0,
      affectedCount: 0,
      passedCount: 0,
      passRate: 1,
      denominatorNoun: 'product pages',
      confidenceTag: 'not_measured',
      notMeasuredReason: 'Run a Deep (with browser) scan to compare raw HTML against rendered JavaScript content.',
      affectedUrls: [],
      templateGroupCounts: {},
      finding: null,
    });
  } else {
    const ai002Pass = parityStatus === 'verified';
    const prodCount = Math.max(1, products.length);
    ruleResults.push({
      ruleId: 'AI-002',
      toolId: 'ai-readiness',
      areaId: 'ai_readiness',
      title: 'Core product details present in raw HTML (no JS required)',
      plainTitle: 'Product details depend on JavaScript and may be invisible to AI crawlers',
      kind: 'issue',
      status: ai002Pass ? 'pass' : 'fail',
      actionTier: 'fix_now',
      weight: 4,
      effortMinutes: 60,
      owner: 'Theme / Web Developer',
      applicableCount: prodCount,
      affectedCount: ai002Pass ? 0 : prodCount,
      passedCount: ai002Pass ? prodCount : 0,
      passRate: ai002Pass ? 1 : 0,
      denominatorNoun: 'product pages',
      confidenceTag: prodCount < 8 ? 'small_sample' : 'verified',
      affectedUrls: ai002Pass ? [] : products.map((p) => p.sourceUrl),
      templateGroupCounts: { 'Product pages': { affected: ai002Pass ? 0 : prodCount, total: prodCount } },
      finding: null,
    });
  }

  // AI-003: Answerable store facts (Shipping/Returns, About, FAQ, plain-text specs)
  const factChecks = [
    { ok: hasShippingReturnsLink, name: 'Shipping & Returns policy link' },
    { ok: hasAboutLink, name: 'About / Brand story link' },
    { ok: hasFaqContent, name: 'FAQ content or FAQPage schema' },
    { ok: products.length === 0 || productSpecsInPlainTextPct >= 60, name: 'Plain-text product specs' },
  ];
  const passedFacts = factChecks.filter((f) => f.ok).length;
  const failedFacts = factChecks.length - passedFacts;
  ruleResults.push({
    ruleId: 'AI-003',
    toolId: 'ai-readiness',
    areaId: 'ai_readiness',
    title: 'Answerable store facts (Shipping/Returns, About, FAQ, plain-text specs)',
    plainTitle: 'Key brand and policy facts (Shipping/Returns, About, FAQ) are hard for AI assistants to extract',
    kind: 'issue',
    status: failedFacts === 0 ? 'pass' : 'fail',
    actionTier: 'fix_soon',
    weight: 3,
    effortMinutes: 30,
    owner: 'Merchandising / Content Team',
    applicableCount: factChecks.length,
    affectedCount: failedFacts,
    passedCount: passedFacts,
    passRate: passedFacts / factChecks.length,
    denominatorNoun: 'store fact signals',
    confidenceTag: 'verified',
    affectedUrls: failedFacts === 0 ? [] : [homeUrl],
    templateGroupCounts: { 'Sitewide templates': { affected: failedFacts, total: factChecks.length } },
    finding: null,
  });

  // AI-004: Entity consistency (Organization schema + sameAs brand links)
  const entityPassed = Boolean(orgBrandName && sameAsCount > 0 && brandsAgree !== false);
  const entityTotal = 2;
  const entityPassCount = (orgBrandName ? 1 : 0) + (sameAsCount > 0 ? 1 : 0);
  ruleResults.push({
    ruleId: 'AI-004',
    toolId: 'ai-readiness',
    areaId: 'ai_readiness',
    title: 'Organization brand schema & sameAs identity links',
    plainTitle: 'Organization schema is missing or lacks sameAs social/Wikipedia identity links',
    kind: 'issue',
    status: entityPassed ? 'pass' : 'fail',
    actionTier: 'fix_soon',
    weight: 3,
    effortMinutes: 20,
    owner: 'Theme / Web Developer',
    applicableCount: entityTotal,
    affectedCount: entityTotal - entityPassCount,
    passedCount: entityPassCount,
    passRate: entityPassCount / entityTotal,
    denominatorNoun: 'brand identity signals',
    confidenceTag: 'verified',
    affectedUrls: entityPassed ? [] : [homeUrl],
    templateGroupCounts: { Homepage: { affected: entityTotal - entityPassCount, total: entityTotal } },
    finding: null,
  });

  // AI-005: /llms.txt presence (Opportunity only — minimal weight, does NOT hurt core health score)
  ruleResults.push({
    ruleId: 'AI-005',
    toolId: 'ai-readiness',
    areaId: 'ai_readiness',
    title: '/llms.txt store summary file',
    plainTitle: 'Optional /llms.txt summary file not found (emerging convention)',
    kind: 'opportunity',
    status: llmsTxtFound ? 'pass' : 'fail',
    actionTier: 'nice_to_have',
    weight: 1,
    effortMinutes: 15,
    owner: 'SEO / Marketing Manager',
    applicableCount: 1,
    affectedCount: llmsTxtFound ? 0 : 1,
    passedCount: llmsTxtFound ? 1 : 0,
    passRate: llmsTxtFound ? 1 : 0,
    denominatorNoun: 'root file',
    confidenceTag: 'verified',
    affectedUrls: llmsTxtFound ? [] : [`https://${crawl.domain}/llms.txt`],
    templateGroupCounts: { 'Sitewide configuration': { affected: llmsTxtFound ? 0 : 1, total: 1 } },
    finding: null,
  });

  return { summary, ruleResults };
}

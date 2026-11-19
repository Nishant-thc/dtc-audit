import type { SharedDatabase } from '../db/database.ts';
import { TOOL_REGISTRY } from '../tools/registry.ts';
import { RulesEngine } from './rules-engine.ts';
import { evaluateAiReadiness } from './ai-readiness.ts';
import { evaluateLocalSpeed } from './local-speed.ts';
import { RULE_PLAYBOOK } from '../ui/playbook.ts';
import type {
  ActionTier,
  AreaScoreSummary,
  ConfidenceTag,
  CrawlDenominators,
  CrawlRecord,
  FindingKind,
  FindingRecord,
  FixPacket,
  FixPacketBeforeAfter,
  HealthBand,
  PageRecord,
  PageType,
  PlatformType,
  RuleDefinition,
  RuleResultRecord,
  StoreAreaId,
  StoreSnapshotFact,
  StoreVerdictReport,
} from '../types/entities.ts';

interface RuleGovernance {
  areaId: StoreAreaId;
  kind: FindingKind;
  actionTier: ActionTier;
  baseWeight: number;
  revenueMultiplier: number; // product=1.5, collection=1.3, homepage=1.1, general=1.0, blog=0.8
  effortMinutes: number;
  owner: 'Merchandising / Content Team' | 'Theme / Web Developer' | 'SEO / Marketing Manager';
  denominatorNoun: string;
  primaryTemplateGroup: string;
}

const ALL_PAGE_TYPES: PageType[] = [
  'homepage',
  'product',
  'category',
  'collection',
  'blog',
  'landing',
  'informational',
  'search',
  'filtered',
  'utility',
  'unknown',
];

export const STORE_AREA_META: Array<{
  areaId: StoreAreaId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    areaId: 'search_visibility',
    label: 'Search Visibility',
    shortLabel: 'Search',
    description: 'Titles, descriptions, headings, XML sitemaps, canonicals, structured data, and regional tags.',
  },
  {
    areaId: 'ai_readiness',
    label: 'AI Readiness',
    shortLabel: 'AI Ready',
    description: 'AI search crawler access, raw HTML readability, answerable store facts, and brand entity consistency.',
  },
  {
    areaId: 'product_collection_quality',
    label: 'Product & Collection Quality',
    shortLabel: 'Product',
    description: 'Product descriptions, specs, image alt text, reviews, collection intro copy, and stock availability.',
  },
  {
    areaId: 'site_health_speed',
    label: 'Site Health & Speed',
    shortLabel: 'Site & Speed',
    description: 'Local speed estimates, third-party scripts, image formats/dimensions, filter bloat, and internal links.',
  },
  {
    areaId: 'conversion_trust',
    label: 'Conversion & Trust',
    shortLabel: 'Conversion',
    description: 'Shipping/returns clarity, trust signals, review sections on commercial pages, and blog-to-product links.',
  },
];

// Fixed, human-set governance per rule.
// 'fix_now' is strictly reserved for indexing or revenue blockers so <= ~20% of fixture findings are Fix now.
export const RULE_GOVERNANCE: Record<string, RuleGovernance> = {
  // Search Visibility
  'META-006': { areaId: 'search_visibility', kind: 'issue', actionTier: 'fix_now', baseWeight: 5, revenueMultiplier: 1.5, effortMinutes: 15, owner: 'Theme / Web Developer', denominatorNoun: 'commercial pages', primaryTemplateGroup: 'Commercial pages' },
  'SCHEMA-001': { areaId: 'search_visibility', kind: 'issue', actionTier: 'fix_now', baseWeight: 5, revenueMultiplier: 1.5, effortMinutes: 45, owner: 'Theme / Web Developer', denominatorNoun: 'product pages', primaryTemplateGroup: 'Product pages' },
  'SCHEMA-004': { areaId: 'search_visibility', kind: 'issue', actionTier: 'fix_now', baseWeight: 5, revenueMultiplier: 1.5, effortMinutes: 30, owner: 'Theme / Web Developer', denominatorNoun: 'product offers', primaryTemplateGroup: 'Product pages' },
  'ATLAS-002': { areaId: 'search_visibility', kind: 'issue', actionTier: 'fix_now', baseWeight: 4, revenueMultiplier: 1.2, effortMinutes: 30, owner: 'Theme / Web Developer', denominatorNoun: 'sitemap URLs', primaryTemplateGroup: 'XML Sitemaps' },
  'ATLAS-001': { areaId: 'search_visibility', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.2, effortMinutes: 20, owner: 'SEO / Marketing Manager', denominatorNoun: 'indexable pages', primaryTemplateGroup: 'XML Sitemaps' },
  'ATLAS-003': { areaId: 'search_visibility', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.1, effortMinutes: 30, owner: 'Theme / Web Developer', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Sitewide templates' },
  'ATLAS-004': { areaId: 'search_visibility', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.0, effortMinutes: 20, owner: 'SEO / Marketing Manager', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Navigation & links' },
  'META-001': { areaId: 'search_visibility', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.2, effortMinutes: 25, owner: 'SEO / Marketing Manager', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Sitewide templates' },
  'META-002': { areaId: 'search_visibility', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.2, effortMinutes: 25, owner: 'SEO / Marketing Manager', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Sitewide templates' },
  'META-003': { areaId: 'search_visibility', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.0, effortMinutes: 30, owner: 'Merchandising / Content Team', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Sitewide templates' },
  'META-004': { areaId: 'search_visibility', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.0, effortMinutes: 25, owner: 'Merchandising / Content Team', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Sitewide templates' },
  'META-005': { areaId: 'search_visibility', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.1, effortMinutes: 30, owner: 'Theme / Web Developer', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Sitewide templates' },
  'SCHEMA-002': { areaId: 'search_visibility', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.5, effortMinutes: 35, owner: 'Theme / Web Developer', denominatorNoun: 'product pages', primaryTemplateGroup: 'Product pages' },
  'SCHEMA-003': { areaId: 'search_visibility', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.1, effortMinutes: 30, owner: 'Theme / Web Developer', denominatorNoun: 'interior pages', primaryTemplateGroup: 'Sitewide templates' },
  'INTL-001': { areaId: 'search_visibility', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.1, effortMinutes: 15, owner: 'Theme / Web Developer', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Homepage' },

  // Product & Collection Quality
  'CAT-001': { areaId: 'product_collection_quality', kind: 'issue', actionTier: 'fix_soon', baseWeight: 4, revenueMultiplier: 1.5, effortMinutes: 60, owner: 'Merchandising / Content Team', denominatorNoun: 'product pages', primaryTemplateGroup: 'Product pages' },
  'CAT-002': { areaId: 'product_collection_quality', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.5, effortMinutes: 45, owner: 'Merchandising / Content Team', denominatorNoun: 'product pages', primaryTemplateGroup: 'Product pages' },
  'CAT-003': { areaId: 'product_collection_quality', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.5, effortMinutes: 20, owner: 'Theme / Web Developer', denominatorNoun: 'product pages', primaryTemplateGroup: 'Product pages' },
  'CAT-004': { areaId: 'product_collection_quality', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.5, effortMinutes: 30, owner: 'Theme / Web Developer', denominatorNoun: 'product pages', primaryTemplateGroup: 'Product pages' },
  'CAT-005': { areaId: 'product_collection_quality', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.5, effortMinutes: 60, owner: 'Merchandising / Content Team', denominatorNoun: 'product pages', primaryTemplateGroup: 'Product pages' },
  'PRICE-001': { areaId: 'product_collection_quality', kind: 'opportunity', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.5, effortMinutes: 20, owner: 'Merchandising / Content Team', denominatorNoun: 'product pages', primaryTemplateGroup: 'Product pages' },
  'PRICE-002': { areaId: 'product_collection_quality', kind: 'opportunity', actionTier: 'nice_to_have', baseWeight: 1, revenueMultiplier: 1.2, effortMinutes: 15, owner: 'Merchandising / Content Team', denominatorNoun: 'product pages', primaryTemplateGroup: 'Product pages' },
  'PRICE-003': { areaId: 'product_collection_quality', kind: 'opportunity', actionTier: 'nice_to_have', baseWeight: 1, revenueMultiplier: 1.2, effortMinutes: 45, owner: 'Merchandising / Content Team', denominatorNoun: 'product pages', primaryTemplateGroup: 'Product pages' },
  'COLL-001': { areaId: 'product_collection_quality', kind: 'issue', actionTier: 'fix_soon', baseWeight: 4, revenueMultiplier: 1.3, effortMinutes: 30, owner: 'Merchandising / Content Team', denominatorNoun: 'collection pages', primaryTemplateGroup: 'Collection pages' },
  'COLL-002': { areaId: 'product_collection_quality', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.3, effortMinutes: 20, owner: 'Merchandising / Content Team', denominatorNoun: 'collection pages', primaryTemplateGroup: 'Collection pages' },
  'COLL-003': { areaId: 'product_collection_quality', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.3, effortMinutes: 20, owner: 'SEO / Marketing Manager', denominatorNoun: 'collection pages', primaryTemplateGroup: 'Collection pages' },
  'IMG-001': { areaId: 'product_collection_quality', kind: 'issue', actionTier: 'fix_soon', baseWeight: 2, revenueMultiplier: 1.1, effortMinutes: 20, owner: 'Theme / Web Developer', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Sitewide templates' },

  // Site Health & Speed
  'LINK-003': { areaId: 'site_health_speed', kind: 'issue', actionTier: 'fix_now', baseWeight: 4, revenueMultiplier: 1.2, effortMinutes: 20, owner: 'SEO / Marketing Manager', denominatorNoun: 'internal links', primaryTemplateGroup: 'Navigation & links' },
  'FACET-001': { areaId: 'site_health_speed', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.2, effortMinutes: 40, owner: 'Theme / Web Developer', denominatorNoun: 'filtered URLs', primaryTemplateGroup: 'Collection pages' },
  'FACET-002': { areaId: 'site_health_speed', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.1, effortMinutes: 20, owner: 'Theme / Web Developer', denominatorNoun: 'filtered URLs', primaryTemplateGroup: 'XML Sitemaps' },
  'LINK-001': { areaId: 'site_health_speed', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.0, effortMinutes: 30, owner: 'SEO / Marketing Manager', denominatorNoun: 'discovered pages', primaryTemplateGroup: 'Navigation & links' },
  'LINK-002': { areaId: 'site_health_speed', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.0, effortMinutes: 30, owner: 'SEO / Marketing Manager', denominatorNoun: 'discovered pages', primaryTemplateGroup: 'Navigation & links' },
  'PERF-001': { areaId: 'site_health_speed', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.1, effortMinutes: 45, owner: 'Theme / Web Developer', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Sitewide templates' },
  'PERF-002': { areaId: 'site_health_speed', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.1, effortMinutes: 20, owner: 'Theme / Web Developer', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Sitewide templates' },
  'IMG-002': { areaId: 'site_health_speed', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.1, effortMinutes: 35, owner: 'Theme / Web Developer', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Sitewide templates' },
  'IMG-003': { areaId: 'site_health_speed', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 1.1, effortMinutes: 20, owner: 'Theme / Web Developer', denominatorNoun: 'inspected pages', primaryTemplateGroup: 'Sitewide templates' },

  // Conversion & Trust
  'CRO-001': { areaId: 'conversion_trust', kind: 'issue', actionTier: 'fix_soon', baseWeight: 4, revenueMultiplier: 1.5, effortMinutes: 25, owner: 'Theme / Web Developer', denominatorNoun: 'commercial pages', primaryTemplateGroup: 'Product pages' },
  'CRO-002': { areaId: 'conversion_trust', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 1.5, effortMinutes: 30, owner: 'Theme / Web Developer', denominatorNoun: 'product pages', primaryTemplateGroup: 'Product pages' },
  'BLOG-001': { areaId: 'conversion_trust', kind: 'issue', actionTier: 'fix_soon', baseWeight: 3, revenueMultiplier: 0.8, effortMinutes: 20, owner: 'Merchandising / Content Team', denominatorNoun: 'blog articles', primaryTemplateGroup: 'Blog articles' },
  'BLOG-002': { areaId: 'conversion_trust', kind: 'opportunity', actionTier: 'nice_to_have', baseWeight: 1, revenueMultiplier: 0.8, effortMinutes: 45, owner: 'Merchandising / Content Team', denominatorNoun: 'product pages', primaryTemplateGroup: 'Blog articles' },
  'FRESH-001': { areaId: 'conversion_trust', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 0.8, effortMinutes: 30, owner: 'Merchandising / Content Team', denominatorNoun: 'blog articles', primaryTemplateGroup: 'Blog articles' },
  'FRESH-002': { areaId: 'conversion_trust', kind: 'issue', actionTier: 'nice_to_have', baseWeight: 2, revenueMultiplier: 0.8, effortMinutes: 40, owner: 'Merchandising / Content Team', denominatorNoun: 'blog articles', primaryTemplateGroup: 'Blog articles' },
};

export function plainTemplateGroupName(pageType: PageType | string): string {
  switch (pageType) {
    case 'product':
      return 'Product pages';
    case 'collection':
    case 'category':
      return 'Collection pages';
    case 'blog':
    case 'informational':
      return 'Blog & editorial pages';
    case 'homepage':
      return 'Homepage';
    case 'landing':
      return 'Landing pages';
    case 'filtered':
    case 'search':
      return 'Filtered & search pages';
    default:
      return 'Sitewide templates';
  }
}

export function scoreToBand(score: number | null): HealthBand {
  if (score === null) return 'unmeasured';
  if (score >= 90) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

export function scoreToGrade(score: number | null): 'A' | 'B' | 'C' | 'D' | 'F' | '—' {
  if (score === null) return '—';
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

export function computeCrawlDenominators(db: SharedDatabase, crawlId: string): CrawlDenominators {
  const pages = db.getPages(crawlId);
  const htmlPages = pages.filter((p) => p.extractionMethod !== 'A' || p.title !== null || p.contentLength > 0);
  const okHtmlPages = htmlPages.filter((p) => p.status === 200);
  const deepPages = pages.filter((p) => p.extractionMethod === 'C');

  const byPageTypeDiscovered = {} as Record<PageType, number>;
  const byPageTypeHtml = {} as Record<PageType, number>;
  for (const pt of ALL_PAGE_TYPES) {
    byPageTypeDiscovered[pt] = 0;
    byPageTypeHtml[pt] = 0;
  }
  for (const p of pages) {
    byPageTypeDiscovered[p.pageType] = (byPageTypeDiscovered[p.pageType] ?? 0) + 1;
  }
  for (const p of okHtmlPages) {
    byPageTypeHtml[p.pageType] = (byPageTypeHtml[p.pageType] ?? 0) + 1;
  }

  return {
    crawlId,
    discoveredUrls: pages.length,
    htmlInspectedPages: htmlPages.length,
    okHtmlPages: okHtmlPages.length,
    deepInspectedPages: deepPages.length,
    byPageTypeDiscovered,
    byPageTypeHtml,
    entities: {
      products: db.getProducts(crawlId).length,
      collections: db.getCollections(crawlId).length,
      contents: db.getContents(crawlId).length,
      images: db.getImages(crawlId).length,
      schemas: db.getSchemas(crawlId).length,
      internalLinks: db.getLinks(crawlId).filter((l) => l.linkType === 'internal').length,
      sitemaps: db.getSitemaps(crawlId).length,
    },
  };
}

function getApplicableCountForPassedRule(
  rule: RuleDefinition,
  denoms: CrawlDenominators
): number {
  const entity = rule.detectionCondition.entity;
  if (entity === 'product') return denoms.entities.products;
  if (entity === 'collection') return denoms.entities.collections;
  if (entity === 'content') return denoms.entities.contents;
  if (entity === 'image') return denoms.okHtmlPages;
  if (entity === 'link') return denoms.entities.internalLinks;
  if (entity === 'sitemap') return denoms.entities.sitemaps;
  if (entity === 'schema') {
    if (rule.ruleId === 'SCHEMA-001' || rule.ruleId === 'SCHEMA-002' || rule.ruleId === 'SCHEMA-004') {
      return denoms.byPageTypeHtml.product;
    }
    return Math.max(0, denoms.okHtmlPages - denoms.byPageTypeHtml.homepage);
  }
  if (rule.applicablePageTypes.length > 0 && !rule.applicablePageTypes.includes('unknown')) {
    return rule.applicablePageTypes.reduce((sum, pt) => sum + (denoms.byPageTypeHtml[pt] ?? 0), 0);
  }
  return denoms.okHtmlPages;
}

function deriveConfidenceTag(
  applicableCount: number,
  discoveredTotal: number,
  isDeepRequired: boolean,
  hasDeepPages: boolean
): ConfidenceTag {
  if (isDeepRequired && !hasDeepPages) return 'not_measured';
  if (applicableCount === 0) return 'not_measured';
  if (applicableCount < 8) return 'small_sample';
  if (discoveredTotal > 0 && applicableCount >= discoveredTotal * 0.8) return 'verified';
  return 'sampled';
}

function computeWeightedScore(results: RuleResultRecord[]): number | null {
  const measurableIssues = results.filter(
    (r) => r.kind === 'issue' && (r.status === 'pass' || r.status === 'fail') && r.applicableCount > 0
  );
  if (measurableIssues.length === 0) return null;

  let totalWeight = 0;
  let earnedWeight = 0;
  for (const r of measurableIssues) {
    totalWeight += r.weight;
    earnedWeight += r.weight * r.passRate;
  }
  return totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : null;
}

function buildDynamicBeforeAfter(
  ruleIds: string[],
  db: SharedDatabase,
  crawl: CrawlRecord
): FixPacketBeforeAfter[] {
  const pages = db.getPages(crawl.crawlId);
  const products = db.getProducts(crawl.crawlId);
  const collections = db.getCollections(crawl.crawlId);
  const htmlPages = pages.filter((p) => p.extractionMethod !== 'A' || p.title !== null || p.contentLength > 0);
  const brandGuess =
    products.find((p) => p.brand)?.brand ||
    crawl.domain.replace(/^(www\.|row\.|us\.|uk\.|eu\.)/i, '').split('.')[0].replace(/^\w/, (c) => c.toUpperCase());

  const examples: FixPacketBeforeAfter[] = [];

  for (const rid of ruleIds.slice(0, 3)) {
    if (rid === 'META-001') {
      const bad = htmlPages.find((p) => p.status === 200 && (!p.title || p.title.length < 15 || p.title.length > 65));
      if (bad) {
        const cur = bad.title ? `"${bad.title}" (${bad.title.length} chars)` : '(missing <title> tag)';
        const h1 = bad.h1List[0] || bad.pageType;
        examples.push({
          currentLabel: 'Current page title on your store',
          currentValue: cur,
          suggestedLabel: 'Suggested pattern (30–60 chars)',
          suggestedValue: `"${h1.slice(0, 40)} | ${brandGuess}"`,
          sourceUrl: bad.sourceUrl,
        });
        continue;
      }
    }
    if (rid === 'META-005') {
      const bad = htmlPages.find((p) => p.status === 200 && p.h1List.length !== 1);
      if (bad) {
        examples.push({
          currentLabel: `Current headings on ${new URL(bad.sourceUrl).pathname}`,
          currentValue: bad.h1List.length === 0 ? '0 <h1> tags found' : `${bad.h1List.length} <h1> tags: ${bad.h1List.slice(0, 3).map((h) => `"${h}"`).join(', ')}`,
          suggestedLabel: 'Target heading structure',
          suggestedValue: `1 primary <h1> ("${bad.h1List[0] || bad.title || 'Page Headline'}") + <h2> for sub-sections`,
          sourceUrl: bad.sourceUrl,
        });
        continue;
      }
    }
    if (rid === 'CAT-001' || rid === 'CAT-002' || rid === 'CAT-003') {
      const bad = products.find(
        (pr) =>
          (rid === 'CAT-001' && pr.descriptionWordCount < 30) ||
          (rid === 'CAT-002' && pr.specsCount < 2) ||
          (rid === 'CAT-003' && pr.imagesWithAltCount < pr.imageCount)
      );
      if (bad) {
        if (rid === 'CAT-003') {
          examples.push({
            currentLabel: `Product images on "${bad.title}"`,
            currentValue: `${bad.imagesWithAltCount} of ${bad.imageCount} photos have alt text`,
            suggestedLabel: 'Template fallback fix',
            suggestedValue: `alt="${bad.title} — ${bad.brand || brandGuess}" on all ${bad.imageCount} photos`,
            sourceUrl: bad.sourceUrl,
          });
        } else if (rid === 'CAT-001') {
          examples.push({
            currentLabel: `Description on "${bad.title}"`,
            currentValue: `${bad.descriptionWordCount} words (below 30-word minimum)`,
            suggestedLabel: 'Target product copy',
            suggestedValue: `60–120 words covering fit, fabric/materials, key use case, and care for "${bad.title}"`,
            sourceUrl: bad.sourceUrl,
          });
        } else {
          examples.push({
            currentLabel: `Specs on "${bad.title}"`,
            currentValue: `${bad.specsCount} spec item(s) detected`,
            suggestedLabel: 'Target specification block',
            suggestedValue: `3–6 bullet specs (Material, Fit/Sizing, Dimensions, Care) rendered in HTML`,
            sourceUrl: bad.sourceUrl,
          });
        }
        continue;
      }
    }
    if (rid === 'COLL-001') {
      const bad = collections.find((c) => !c.hasIntroContent);
      if (bad) {
        examples.push({
          currentLabel: `Collection "${bad.name}"`,
          currentValue: `${bad.descriptionWordCount} intro words above ${bad.productCount} products`,
          suggestedLabel: 'Suggested intro copy',
          suggestedValue: `40–70 word summary introducing "${bad.name}" styles, fit options, and links to top sub-collections`,
          sourceUrl: bad.sourceUrl,
        });
        continue;
      }
    }

    // Fallback to playbook before/after if no specific dynamic row matched
    const pb = RULE_PLAYBOOK[rid];
    if (pb) {
      examples.push({
        currentLabel: 'Current pattern detected',
        currentValue: pb.beforeExample.replace(/^❌\s*/, ''),
        suggestedLabel: 'Target pattern',
        suggestedValue: pb.afterExample.replace(/^✅\s*/, ''),
      });
    }
  }

  return examples;
}

function buildPlatformSteps(
  platform: PlatformType,
  templateGroup: string,
  ruleIds: string[]
): string[] {
  const steps: string[] = [];
  const platformPrefix: Record<PlatformType, string> = {
    shopify: 'In Shopify Admin → Online Store → Themes → Edit code:',
    woocommerce: 'In WordPress Admin → Appearance / WooCommerce Templates (or Yoast/RankMath):',
    magento: 'In Adobe Commerce / Magento Admin → Content → Design / Catalog:',
    bigcommerce: 'In BigCommerce Admin → Storefront → Theme Files (Stencil):',
    generic: 'In your storefront codebase / CMS templates:',
  };

  steps.push(platformPrefix[platform]);

  if (templateGroup === 'Product pages') {
    if (platform === 'shopify') {
      steps.push('Open `sections/main-product.liquid` (or your headless PDP component) to update the shared product template once.');
    } else if (platform === 'woocommerce') {
      steps.push('Edit `woocommerce/content-single-product.php` or configure product schema & meta defaults in your SEO plugin.');
    } else {
      steps.push('Update your shared Product Detail Page (PDP) template so all product URLs inherit the fix together.');
    }
  } else if (templateGroup === 'Collection pages') {
    if (platform === 'shopify') {
      steps.push('Open `sections/main-collection-banner.liquid` to ensure `{{ collection.description }}` renders, and check `theme.liquid` for clean canonical URLs.');
    } else if (platform === 'woocommerce') {
      steps.push('Edit product category descriptions under Products → Categories and ensure your archive template renders `category_description()`.');
    } else {
      steps.push('Update your Collection / Category template to render intro copy and strip filter query params from `<link rel="canonical">`.');
    }
  } else if (templateGroup === 'Sitewide templates' || templateGroup === 'Homepage') {
    if (platform === 'shopify') {
      steps.push('Open `layout/theme.liquid` for `<head>` tags (canonical, lang, title) and `sections/header.liquid` to ensure logos use `<div>`/`<a>` instead of `<h1>`.');
    } else {
      steps.push('Update your root layout `<head>` and global header/footer components so every page inherits the fix.');
    }
  } else if (templateGroup === 'XML Sitemaps' || templateGroup === 'Sitewide configuration') {
    if (platform === 'shopify') {
      steps.push('Review `robots.txt.liquid` and check product/collection publishing status (`seo.hidden` metafields).');
    } else {
      steps.push('Update your `robots.txt` and dynamic sitemap generator to exclude redirects/filtered URLs and allow AI search crawlers.');
    }
  }

  for (const rid of ruleIds.slice(0, 3)) {
    const pb = RULE_PLAYBOOK[rid];
    if (pb && pb.actionSteps[0]) {
      steps.push(pb.actionSteps[0]);
    }
  }

  return Array.from(new Set(steps)).slice(0, 5);
}

export function computeStoreVerdict(db: SharedDatabase, crawl: CrawlRecord): StoreVerdictReport {
  const denoms = computeCrawlDenominators(db, crawl.crawlId);
  const pages = db.getPages(crawl.crawlId);
  const products = db.getProducts(crawl.crawlId);
  const collections = db.getCollections(crawl.crawlId);
  const contents = db.getContents(crawl.crawlId);
  const pageByUrl = new Map<string, PageRecord>(pages.map((p) => [p.sourceUrl, p]));

  // 1. Evaluate all standard rules across all 14 rule-bearing tools
  const allRuleDefs = TOOL_REGISTRY.flatMap((t) => t.rules);
  const rulesEngine = new RulesEngine(db);
  const rawFindings = rulesEngine.evaluateRules(crawl.crawlId, allRuleDefs);
  const findingByRuleId = new Map<string, FindingRecord>(rawFindings.map((f) => [f.ruleId, f]));

  const allRuleResults: RuleResultRecord[] = [];

  for (const rule of allRuleDefs) {
    const gov = RULE_GOVERNANCE[rule.ruleId] ?? {
      areaId: 'search_visibility' as StoreAreaId,
      kind: 'issue' as FindingKind,
      actionTier: 'nice_to_have' as ActionTier,
      baseWeight: rule.impactScore,
      revenueMultiplier: 1.0,
      effortMinutes: 30,
      owner: 'SEO / Marketing Manager' as const,
      denominatorNoun: 'inspected pages',
      primaryTemplateGroup: 'Sitewide templates',
    };
    const pb = RULE_PLAYBOOK[rule.ruleId];
    const finding = findingByRuleId.get(rule.ruleId) ?? null;
    const weight = Number((gov.baseWeight * gov.revenueMultiplier).toFixed(2));

    const applicableCount = finding
      ? finding.inspectedCount
      : getApplicableCountForPassedRule(rule, denoms);

    if (applicableCount === 0 && !finding) {
      allRuleResults.push({
        ruleId: rule.ruleId,
        toolId: rule.toolId,
        areaId: gov.areaId,
        title: rule.title,
        plainTitle: pb?.plainTitle ?? rule.title,
        kind: gov.kind,
        status: 'not_applicable',
        actionTier: gov.actionTier,
        weight,
        effortMinutes: gov.effortMinutes,
        owner: gov.owner,
        applicableCount: 0,
        affectedCount: 0,
        passedCount: 0,
        passRate: 1,
        denominatorNoun: gov.denominatorNoun,
        confidenceTag: 'not_measured',
        notMeasuredReason: `No ${gov.denominatorNoun} were present in this scan.`,
        affectedUrls: [],
        templateGroupCounts: {},
        finding: null,
      });
      continue;
    }

    const affectedCount = finding ? Math.min(finding.affectedCount, applicableCount) : 0;
    const passedCount = Math.max(0, applicableCount - affectedCount);
    const passRate = applicableCount > 0 ? passedCount / applicableCount : 1;

    // Group affected URLs into plain-English template groups (hiding hashes)
    const templateGroupCounts: Record<string, { affected: number; total: number }> = {};
    if (finding) {
      for (const u of finding.affectedUrls) {
        const p = pageByUrl.get(u);
        const grp = p ? plainTemplateGroupName(p.pageType) : gov.primaryTemplateGroup;
        const curr = templateGroupCounts[grp] ?? { affected: 0, total: 0 };
        curr.affected++;
        templateGroupCounts[grp] = curr;
      }
      for (const grp of Object.keys(templateGroupCounts)) {
        templateGroupCounts[grp].total = Math.max(templateGroupCounts[grp].affected, applicableCount);
      }
    }

    const confidenceTag = deriveConfidenceTag(
      applicableCount,
      denoms.discoveredUrls,
      false,
      denoms.deepInspectedPages > 0
    );

    allRuleResults.push({
      ruleId: rule.ruleId,
      toolId: rule.toolId,
      areaId: gov.areaId,
      title: rule.title,
      plainTitle: pb?.plainTitle ?? rule.title,
      kind: gov.kind,
      status: finding ? 'fail' : 'pass',
      actionTier: gov.actionTier,
      weight,
      effortMinutes: gov.effortMinutes,
      owner: gov.owner,
      applicableCount,
      affectedCount,
      passedCount,
      passRate,
      denominatorNoun: gov.denominatorNoun,
      confidenceTag,
      affectedUrls: finding ? finding.affectedUrls : [],
      templateGroupCounts,
      finding,
    });
  }

  // 2. Append new local AI Readiness & Local Speed rule results
  const aiEval = evaluateAiReadiness(db, crawl);
  const speedEval = evaluateLocalSpeed(db, crawl);
  allRuleResults.push(...aiEval.ruleResults, ...speedEval.ruleResults);

  // 3. Build the 5 Area Score Summaries (weighted pass rate 0-100, Issues only)
  const areas: AreaScoreSummary[] = STORE_AREA_META.map((meta) => {
    const areaResults = allRuleResults.filter((r) => r.areaId === meta.areaId);
    const issueResults = areaResults.filter((r) => r.kind === 'issue');
    const score = computeWeightedScore(issueResults);

    return {
      areaId: meta.areaId,
      label: meta.label,
      shortLabel: meta.shortLabel,
      description: meta.description,
      score,
      grade: scoreToGrade(score),
      band: scoreToBand(score),
      passedCount: issueResults.filter((r) => r.status === 'pass').length,
      failedCount: issueResults.filter((r) => r.status === 'fail').length,
      notMeasuredCount: areaResults.filter((r) => r.status === 'not_measured').length,
      notApplicableCount: areaResults.filter((r) => r.status === 'not_applicable').length,
      opportunitiesCount: areaResults.filter((r) => r.kind === 'opportunity' && r.status === 'fail').length,
      ruleResults: areaResults,
    };
  });

  // Overall Store Health Score (weighted pass rate across all measurable Issue rules)
  const overallScore = computeWeightedScore(allRuleResults);
  const overallGrade = scoreToGrade(overallScore);
  const overallBand = scoreToBand(overallScore);

  // 4. Group failing Issue rules by (templateGroup + owner) into merged Fix Packets
  const failingIssues = allRuleResults.filter((r) => r.kind === 'issue' && r.status === 'fail');
  const packetGroups = new Map<string, { templateGroup: string; owner: RuleResultRecord['owner']; rules: RuleResultRecord[] }>();

  for (const r of failingIssues) {
    const topGroup =
      Object.entries(r.templateGroupCounts).sort((a, b) => b[1].affected - a[1].affected)[0]?.[0] ||
      RULE_GOVERNANCE[r.ruleId]?.primaryTemplateGroup ||
      'Sitewide templates';
    const key = `${topGroup}::${r.owner}`;
    const existing = packetGroups.get(key) ?? { templateGroup: topGroup, owner: r.owner, rules: [] };
    existing.rules.push(r);
    packetGroups.set(key, existing);
  }

  const tierRank: Record<ActionTier, number> = { fix_now: 3, fix_soon: 2, nice_to_have: 1 };

  const allTasks: FixPacket[] = Array.from(packetGroups.entries()).map(([key, grp]) => {
    // Sort rules inside packet by tier then weight
    grp.rules.sort((a, b) => tierRank[b.actionTier] - tierRank[a.actionTier] || b.weight - a.weight);
    const highestTier = grp.rules[0].actionTier;
    const primaryAreaId = grp.rules[0].areaId;
    const primaryAreaLabel = STORE_AREA_META.find((a) => a.areaId === primaryAreaId)?.label ?? 'Store Health';
    const ruleIds = grp.rules.map((r) => r.ruleId);

    // Deterministic +N pts projection: recompute overallScore as if this packet's rules passed
    const ruleIdSet = new Set(ruleIds);
    const simulatedResults = allRuleResults.map((r) =>
      ruleIdSet.has(r.ruleId) ? { ...r, status: 'pass' as const, passRate: 1 } : r
    );
    const simulatedScore = computeWeightedScore(simulatedResults);
    const projectedScoreLift =
      overallScore !== null && simulatedScore !== null ? Math.max(1, simulatedScore - overallScore) : 1;

    // Combined effort (diminishing overhead when fixing multiple items in same template)
    const effortMinutes = Math.min(
      120,
      grp.rules.reduce((sum, r, idx) => sum + (idx === 0 ? r.effortMinutes : Math.round(r.effortMinutes * 0.5)), 0)
    );
    const effortLabel = effortMinutes >= 60 ? `~${(effortMinutes / 60).toFixed(1).replace(/\.0$/, '')} hr` : `~${effortMinutes} min`;

    const affectedUrlSet = new Set<string>();
    for (const r of grp.rules) {
      for (const u of r.affectedUrls) affectedUrlSet.add(u);
    }
    const affectedUrls = Array.from(affectedUrlSet);
    const leadRule = grp.rules[0];
    const samplePaths = affectedUrls.slice(0, 2).map((u) => {
      try {
        return new URL(u).pathname;
      } catch {
        return u;
      }
    });

    const shortActionBits = grp.rules.slice(0, 3).map((r) => {
      const t = r.plainTitle.replace(/^(Product pages|Collection pages|Pages|Blog articles|Images)\s+(are|have|with)\s+/i, '');
      return t.charAt(0).toLowerCase() + t.slice(1);
    });
    const mergedTitle =
      grp.rules.length === 1
        ? `${grp.templateGroup}: ${grp.rules[0].plainTitle}`
        : `${grp.templateGroup}: fix ${grp.rules.length} issues (${shortActionBits.slice(0, 2).join('; ')})`;

    const proofLine = `${leadRule.affectedCount} of ${leadRule.applicableCount} ${leadRule.denominatorNoun} affected${
      samplePaths.length > 0 ? `. Examples: ${samplePaths.join(', ')}` : ''
    }.`;

    const beforeAfter = buildDynamicBeforeAfter(ruleIds, db, crawl);
    const platformSteps = buildPlatformSteps(crawl.platform, grp.templateGroup, ruleIds);
    const confidenceTag: ConfidenceTag = grp.rules.every((r) => r.confidenceTag === 'small_sample')
      ? 'small_sample'
      : grp.rules.some((r) => r.confidenceTag === 'verified')
        ? 'verified'
        : 'sampled';

    // Value per effort (prioritize Fix Now tier, then score lift per minute; don't escalate small samples)
    const sampleDampener = confidenceTag === 'small_sample' ? 0.65 : 1;
    const valuePerEffort = Number(
      (((tierRank[highestTier] * 10 + projectedScoreLift * 2) / Math.max(15, effortMinutes)) * sampleDampener * 10).toFixed(2)
    );

    const ticketLines = [
      `## ${mergedTitle}`,
      `- **Store:** ${crawl.domain} (${crawl.platform})`,
      `- **Priority:** ${highestTier === 'fix_now' ? 'Fix now' : highestTier === 'fix_soon' ? 'Fix soon' : 'Nice to have'} (+${projectedScoreLift} pts projected store score lift)`,
      `- **Owner:** ${grp.owner} · **Estimated time:** ${effortLabel}`,
      `- **Proof:** ${proofLine}`,
      '',
      '### Steps to fix',
      ...platformSteps.map((s, i) => `${i + 1}. ${s}`),
      '',
      '### Sample affected URLs',
      ...affectedUrls.slice(0, 10).map((u) => `- ${u}`),
    ];

    return {
      taskId: `task_${key.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      areaId: primaryAreaId,
      areaLabel: primaryAreaLabel,
      templateGroup: grp.templateGroup,
      templatePageCount: Math.max(leadRule.applicableCount, affectedUrls.length),
      owner: grp.owner,
      effortMinutes,
      effortLabel,
      actionTier: highestTier,
      title: mergedTitle,
      proofLine,
      projectedScoreLift,
      valuePerEffort,
      confidenceTag,
      ruleIds,
      affectedCount: leadRule.affectedCount,
      applicableCount: leadRule.applicableCount,
      denominatorNoun: leadRule.denominatorNoun,
      affectedUrls,
      beforeAfter,
      platformSteps,
      ticketMarkdown: ticketLines.join('\n'),
    };
  });

  allTasks.sort((a, b) => tierRank[b.actionTier] - tierRank[a.actionTier] || b.valuePerEffort - a.valuePerEffort);
  const fixFirst = allTasks.slice(0, 5);

  // 5. Build Plain-English Verdict Sentence (Layer 0)
  const weakestArea = [...areas]
    .filter((a) => a.score !== null)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))[0];
  const top3Lift = fixFirst.slice(0, 3).reduce((sum, t) => sum + t.projectedScoreLift, 0);
  const verdictSentence =
    fixFirst.length === 0
      ? `All measured checks on ${crawl.domain} passed across ${denoms.okHtmlPages} inspected pages.`
      : `${weakestArea ? `${weakestArea.label} (${weakestArea.score}/100) is your biggest drag.` : ''} Completing the top ${Math.min(3, fixFirst.length)} template tasks would lift your Store Health score by ~${top3Lift} points.`.trim();

  // 6. Opportunities (separated from Issues) & Neutral Store Snapshot Facts
  const opportunities = allRuleResults.filter((r) => r.kind === 'opportunity' && r.status === 'fail');

  const prices = products.map((p) => p.price).filter((p): p is number => p !== null && p > 0);
  const currency = products.find((p) => p.currency)?.currency ?? 'USD';
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
  const onSaleCount = products.filter((p) => p.discountPercentage !== null && p.discountPercentage > 0).length;

  const storeSnapshot: StoreSnapshotFact[] = [
    { id: 'platform', label: 'Platform', value: crawl.platform.toUpperCase(), detail: `${denoms.discoveredUrls} discovered URLs · ${denoms.okHtmlPages} pages inspected` },
    { id: 'products', label: 'Product pages', value: `${denoms.entities.products} inspected`, detail: `${denoms.byPageTypeDiscovered.product} discovered in sitemap/links` },
    { id: 'collections', label: 'Collection pages', value: `${denoms.entities.collections} inspected`, detail: `${denoms.byPageTypeDiscovered.collection + denoms.byPageTypeDiscovered.category} discovered` },
    { id: 'price_range', label: 'Observed price range', value: prices.length > 0 ? `${sym}${Math.min(...prices)}–${sym}${Math.max(...prices)}` : 'Not detected', detail: `${onSaleCount} of ${products.length} products on promotion` },
    { id: 'editorial', label: 'Blog & editorial', value: `${contents.length} inspected`, detail: `${denoms.byPageTypeDiscovered.blog + denoms.byPageTypeDiscovered.informational} discovered` },
    { id: 'scan_depth', label: 'Scan mode', value: crawl.maxLevel === 'C' ? 'Deep (with browser)' : crawl.maxLevel === 'B' ? 'Standard' : 'Quick', detail: `${denoms.deepInspectedPages} pages browser-rendered` },
  ];

  const issueResultsAll = allRuleResults.filter((r) => r.kind === 'issue');
  return {
    crawl,
    denominators: denoms,
    overallScore,
    overallGrade,
    overallBand,
    verdictSentence,
    areas,
    fixFirst,
    allTasks,
    opportunities,
    storeSnapshot,
    totals: {
      passedChecks: issueResultsAll.filter((r) => r.status === 'pass').length,
      failedIssues: issueResultsAll.filter((r) => r.status === 'fail').length,
      opportunitiesCount: opportunities.length,
      notMeasuredChecks: allRuleResults.filter((r) => r.status === 'not_measured').length,
      notApplicableChecks: allRuleResults.filter((r) => r.status === 'not_applicable').length,
    },
    aiReadiness: aiEval.summary,
    localSpeed: speedEval.summary,
    generatedAt: new Date().toISOString(),
  };
}

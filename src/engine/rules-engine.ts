import * as fs from 'node:fs';
import YAML from 'yaml';
import type { SharedDatabase } from '../db/database.ts';
import type {
  RuleDefinition,
  FindingRecord,
  PriorityBand,
  PageRecord,
  ExtractionLevel,
} from '../types/entities.ts';

export interface ScoringWeights {
  impactWeight: number;
  coverageWeight: number;
  confidenceWeight: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  impactWeight: 1,
  coverageWeight: 1,
  confidenceWeight: 1,
};

export function loadRulesFromFile(filePath: string): RuleDefinition[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (filePath.endsWith('.json')) {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : parsed.rules ?? [];
  }
  const parsed = YAML.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.rules ?? [];
}

export function computeCoverageScore(affectedCount: number, inspectedCount: number): number {
  if (inspectedCount <= 0 || affectedCount <= 0) return 1;
  const ratio = affectedCount / inspectedCount;
  if (ratio >= 0.5) return 5;
  if (ratio >= 0.25) return 4;
  if (ratio >= 0.1) return 3;
  if (ratio >= 0.03) return 2;
  return 1;
}

export function computeConfidenceScore(
  extractionMethod: ExtractionLevel,
  avgEntityConfidence: number
): number {
  let base = extractionMethod === 'C' ? 5 : extractionMethod === 'B' ? 4 : 3;
  if (avgEntityConfidence >= 0.9) return Math.min(5, base + (extractionMethod === 'B' ? 1 : 0));
  if (avgEntityConfidence < 0.6) return Math.max(1, base - 1);
  return base;
}

export function computePriorityBand(priorityScore: number): PriorityBand {
  if (priorityScore >= 45) return 'High';
  if (priorityScore >= 20) return 'Medium';
  return 'Low';
}

export class RulesEngine {
  private db: SharedDatabase;
  private weights: ScoringWeights;

  constructor(db: SharedDatabase, weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS) {
    this.db = db;
    this.weights = weights;
  }

  public evaluateRules(crawlId: string, rules: RuleDefinition[]): FindingRecord[] {
    const pages = this.db.getPages(crawlId);
    const sitemaps = this.db.getSitemaps(crawlId);
    const products = this.db.getProducts(crawlId);
    const collections = this.db.getCollections(crawlId);
    const contents = this.db.getContents(crawlId);
    const links = this.db.getLinks(crawlId);
    const images = this.db.getImages(crawlId);
    const schemas = this.db.getSchemas(crawlId);
    const technologies = this.db.getTechnologies(crawlId);
    const observations = this.db.getObservations(crawlId);

    // Precompute duplicate maps for fast declarative checks
    const titleToPages = new Map<string, PageRecord[]>();
    const descToPages = new Map<string, PageRecord[]>();
    for (const p of pages) {
      if (p.status === 200 && p.title) {
        const k = p.title.toLowerCase().trim();
        const arr = titleToPages.get(k) ?? [];
        arr.push(p);
        titleToPages.set(k, arr);
      }
      if (p.status === 200 && p.metaDescription) {
        const k = p.metaDescription.toLowerCase().trim();
        const arr = descToPages.get(k) ?? [];
        arr.push(p);
        descToPages.set(k, arr);
      }
    }

    const findings: FindingRecord[] = [];
    const nowIso = new Date().toISOString();
    const isHtmlExtracted = (p: PageRecord) =>
      p.extractionMethod !== 'A' || p.title !== null || p.contentLength > 0;
    const htmlPages = pages.some(isHtmlExtracted) ? pages.filter(isHtmlExtracted) : pages;

    for (const rule of rules) {
      const eligiblePages =
        rule.applicablePageTypes.length === 0 || rule.applicablePageTypes.includes('unknown')
          ? pages
          : pages.filter((p) => rule.applicablePageTypes.includes(p.pageType));

      const eligibleHtmlPages =
        rule.applicablePageTypes.length === 0 || rule.applicablePageTypes.includes('unknown')
          ? htmlPages
          : htmlPages.filter((p) => rule.applicablePageTypes.includes(p.pageType));

      let inspectedCount = eligiblePages.length;
      let affectedUrls: string[] = [];
      const templateBreakdown: Record<string, { affected: number; total: number }> = {};

      for (const ep of eligibleHtmlPages.length > 0 ? eligibleHtmlPages : eligiblePages) {
        if (!templateBreakdown[ep.templateId]) {
          templateBreakdown[ep.templateId] = { affected: 0, total: 0 };
        }
        templateBreakdown[ep.templateId].total++;
      }

      const check = rule.detectionCondition.check;
      const threshold = rule.detectionCondition.threshold ?? 0;

      // Evaluate declarative rule check
      switch (check) {
        // --- TOOL 1: SITE ATLAS ---
        case 'important_page_missing_from_sitemap': {
          const candidates = eligiblePages.filter(
            (p) => p.status === 200 && !p.isNoindex && p.pageType !== 'filtered' && p.pageType !== 'search'
          );
          inspectedCount = candidates.length;
          affectedUrls = candidates.filter((p) => !p.inSitemap).map((p) => p.sourceUrl);
          break;
        }
        case 'sitemap_url_non_200_or_redirect': {
          const sitemapPages = htmlPages.filter((p) => p.inSitemap);
          inspectedCount = sitemapPages.length;
          affectedUrls = sitemapPages
            .filter((p) => (p.status !== 200 && p.status !== 0) || p.redirectChain.length > 0)
            .map((p) => p.sourceUrl);
          break;
        }
        case 'inconsistent_or_missing_canonical': {
          const okPages = eligibleHtmlPages.filter((p) => p.status === 200 && !p.isNoindex);
          inspectedCount = okPages.length;
          affectedUrls = okPages
            .filter(
              (p) =>
                !p.canonicalUrl ||
                (p.normalizedCanonicalUrl &&
                  p.normalizedCanonicalUrl !== p.normalizedUrl &&
                  p.pageType !== 'filtered')
            )
            .map((p) => p.sourceUrl);
          break;
        }
        case 'redirect_chain_detected': {
          inspectedCount = htmlPages.length;
          affectedUrls = htmlPages.filter((p) => p.redirectChain.length > 0).map((p) => p.sourceUrl);
          break;
        }

        // --- TOOL 2: METADATA & INDEXABILITY ---
        case 'missing_or_short_title': {
          const okPages = eligibleHtmlPages.filter((p) => p.status === 200);
          inspectedCount = okPages.length;
          affectedUrls = okPages
            .filter((p) => !p.title || p.title.length < (threshold || 15) || p.title.length > 65)
            .map((p) => p.sourceUrl);
          break;
        }
        case 'duplicate_title': {
          const okPages = eligibleHtmlPages.filter((p) => p.status === 200);
          inspectedCount = okPages.length;
          affectedUrls = okPages
            .filter((p) => p.title && (titleToPages.get(p.title.toLowerCase().trim())?.length ?? 0) > 1)
            .map((p) => p.sourceUrl);
          break;
        }
        case 'missing_meta_description': {
          const okPages = eligibleHtmlPages.filter((p) => p.status === 200);
          inspectedCount = okPages.length;
          affectedUrls = okPages
            .filter((p) => !p.metaDescription || p.metaDescription.length < 50 || p.metaDescription.length > 165)
            .map((p) => p.sourceUrl);
          break;
        }
        case 'duplicate_meta_description': {
          const okPages = eligibleHtmlPages.filter((p) => p.status === 200);
          inspectedCount = okPages.length;
          affectedUrls = okPages
            .filter(
              (p) =>
                p.metaDescription &&
                (descToPages.get(p.metaDescription.toLowerCase().trim())?.length ?? 0) > 1
            )
            .map((p) => p.sourceUrl);
          break;
        }
        case 'missing_or_multiple_h1': {
          const okPages = eligibleHtmlPages.filter((p) => p.status === 200);
          inspectedCount = okPages.length;
          affectedUrls = okPages.filter((p) => p.h1List.length !== 1).map((p) => p.sourceUrl);
          break;
        }
        case 'accidental_noindex_on_commercial_page': {
          const commPages = eligibleHtmlPages.filter((p) => p.status === 200);
          inspectedCount = commPages.length;
          affectedUrls = commPages.filter((p) => p.isNoindex).map((p) => p.sourceUrl);
          break;
        }

        // --- TOOL 3: SCHEMA COVERAGE ---
        case 'missing_product_schema': {
          const prodPages = htmlPages.filter((p) => p.pageType === 'product' && p.status === 200);
          inspectedCount = prodPages.length;
          const urlsWithProdSchema = new Set(
            schemas.filter((s) => s.schemaType === 'Product').map((s) => s.sourceUrl)
          );
          affectedUrls = prodPages.filter((p) => !urlsWithProdSchema.has(p.sourceUrl)).map((p) => p.sourceUrl);
          break;
        }
        case 'incomplete_product_or_offer_schema': {
          const prodSchemas = schemas.filter((s) => s.schemaType === 'Product' || s.schemaType === 'Offer');
          inspectedCount = Math.max(1, new Set(prodSchemas.map((s) => s.sourceUrl)).size);
          affectedUrls = Array.from(
            new Set(
              prodSchemas
                .filter((s) => !s.isValid || s.requiredFieldsMissing.length > 0 || s.recommendedFieldsMissing.length > 1)
                .map((s) => s.sourceUrl)
            )
          );
          break;
        }
        case 'missing_breadcrumb_schema': {
          const targetPages = eligibleHtmlPages.filter((p) => p.status === 200 && p.pageType !== 'homepage');
          inspectedCount = targetPages.length;
          const urlsWithBreadcrumb = new Set(
            schemas.filter((s) => s.schemaType === 'BreadcrumbList').map((s) => s.sourceUrl)
          );
          affectedUrls = targetPages.filter((p) => !urlsWithBreadcrumb.has(p.sourceUrl)).map((p) => p.sourceUrl);
          break;
        }
        case 'schema_visible_mismatch': {
          const checkedSchemas = schemas.filter(
            (s) => s.priceMatchesVisible !== null || s.availabilityMatchesVisible !== null
          );
          inspectedCount = Math.max(1, checkedSchemas.length);
          affectedUrls = Array.from(
            new Set(
              checkedSchemas
                .filter((s) => s.priceMatchesVisible === false || s.availabilityMatchesVisible === false)
                .map((s) => s.sourceUrl)
            )
          );
          break;
        }

        // --- TOOL 4: CATALOGUE COMPLETENESS ---
        case 'thin_product_description': {
          inspectedCount = products.length;
          affectedUrls = products
            .filter((pr) => pr.descriptionWordCount < (threshold || 30))
            .map((pr) => pr.sourceUrl);
          break;
        }
        case 'missing_product_specs': {
          inspectedCount = products.length;
          affectedUrls = products.filter((pr) => pr.specsCount < (threshold || 2)).map((pr) => pr.sourceUrl);
          break;
        }
        case 'missing_product_image_alt': {
          inspectedCount = products.length;
          affectedUrls = products
            .filter((pr) => pr.imageCount === 0 || pr.imagesWithAltCount < pr.imageCount)
            .map((pr) => pr.sourceUrl);
          break;
        }
        case 'missing_product_reviews': {
          inspectedCount = products.length;
          affectedUrls = products.filter((pr) => !pr.hasReviews).map((pr) => pr.sourceUrl);
          break;
        }
        case 'low_overall_product_completeness': {
          inspectedCount = products.length;
          affectedUrls = products
            .filter((pr) => pr.completenessScore < (threshold || 70))
            .map((pr) => pr.sourceUrl);
          break;
        }

        // --- TOOL 5: PRICE & PROMOTION MAPPER ---
        case 'out_of_stock_product_pages': {
          inspectedCount = products.length;
          affectedUrls = products
            .filter((pr) => pr.availability === 'out_of_stock')
            .map((pr) => pr.sourceUrl);
          break;
        }
        case 'extreme_or_unverified_discount': {
          const discounted = products.filter((pr) => pr.discountPercentage !== null && pr.discountPercentage > 0);
          inspectedCount = Math.max(products.length, 1);
          affectedUrls = discounted
            .filter((pr) => (pr.discountPercentage ?? 0) >= (threshold || 50))
            .map((pr) => pr.sourceUrl);
          break;
        }
        case 'missing_bundle_or_subscription_option': {
          inspectedCount = products.length;
          affectedUrls = products.filter((pr) => !pr.hasBundleOrSubscription).map((pr) => pr.sourceUrl);
          break;
        }

        // --- TOOL 6: COLLECTION CONTENT GAP FINDER ---
        case 'collection_missing_intro_copy': {
          inspectedCount = collections.length;
          affectedUrls = collections.filter((c) => !c.hasIntroContent).map((c) => c.sourceUrl);
          break;
        }
        case 'collection_thin_product_count': {
          inspectedCount = collections.length;
          affectedUrls = collections
            .filter((c) => c.productCount < (threshold || 3))
            .map((c) => c.sourceUrl);
          break;
        }
        case 'collection_weak_inbound_links': {
          inspectedCount = collections.length;
          affectedUrls = collections
            .filter((c) => c.inboundLinkCount < (threshold || 2))
            .map((c) => c.sourceUrl);
          break;
        }

        // --- TOOL 7: FACETED NAVIGATION & PARAMETER AUDITOR ---
        case 'parameterized_url_indexable_without_canonical': {
          const paramPages = pages.filter((p) => Object.keys(p.parameters).length > 0 || p.pageType === 'filtered');
          inspectedCount = Math.max(paramPages.length, 1);
          affectedUrls = paramPages
            .filter(
              (p) =>
                !p.isNoindex &&
                (!p.normalizedCanonicalUrl || p.normalizedCanonicalUrl === p.normalizedUrl)
            )
            .map((p) => p.sourceUrl);
          break;
        }
        case 'filtered_url_in_sitemap': {
          const paramPages = pages.filter((p) => Object.keys(p.parameters).length > 0 || p.pageType === 'filtered');
          inspectedCount = Math.max(paramPages.length, 1);
          affectedUrls = paramPages.filter((p) => p.inSitemap).map((p) => p.sourceUrl);
          break;
        }

        // --- TOOL 8: INTERNAL LINK GRAPH ANALYZER ---
        case 'orphan_or_zero_inbound_page': {
          const targetPages = eligiblePages.filter((p) => p.pageType !== 'homepage' && p.status === 200);
          inspectedCount = targetPages.length;
          affectedUrls = targetPages.filter((p) => p.inboundLinkCount === 0).map((p) => p.sourceUrl);
          break;
        }
        case 'deep_click_depth_page': {
          const targetPages = eligiblePages.filter((p) => p.status === 200);
          inspectedCount = targetPages.length;
          affectedUrls = targetPages
            .filter((p) => p.depth > (threshold || 3))
            .map((p) => p.sourceUrl);
          break;
        }
        case 'broken_internal_link': {
          const internalLinks = links.filter((l) => l.linkType === 'internal');
          inspectedCount = Math.max(1, internalLinks.length);
          affectedUrls = Array.from(
            new Set(internalLinks.filter((l) => l.isBroken).map((l) => l.sourceUrl))
          );
          break;
        }

        // --- TOOL 9: BLOG-TO-PRODUCT LINK MAPPER ---
        case 'article_without_product_links': {
          inspectedCount = contents.length;
          affectedUrls = contents
            .filter((c) => c.productLinks.length === 0)
            .map((c) => c.sourceUrl);
          break;
        }
        case 'product_without_editorial_links': {
          inspectedCount = products.length;
          const linkedProdNorms = new Set(contents.flatMap((c) => c.productLinks));
          affectedUrls = products
            .filter((pr) => !linkedProdNorms.has(pr.normalizedUrl))
            .map((pr) => pr.sourceUrl);
          break;
        }

        // --- TOOL 10: CONTENT FRESHNESS & COMPLETENESS TRACKER ---
        case 'stale_article_content': {
          inspectedCount = contents.length;
          affectedUrls = contents
            .filter((c) => c.freshnessDays === null || c.freshnessDays > (threshold || 365))
            .map((c) => c.sourceUrl);
          break;
        }
        case 'thin_or_unstructured_article': {
          inspectedCount = contents.length;
          affectedUrls = contents
            .filter((c) => c.wordCount < (threshold || 400) || c.h2Count < 2 || !c.hasArticleSchema)
            .map((c) => c.sourceUrl);
          break;
        }

        // --- TOOL 11: CONVERSION ELEMENT AUDITOR ---
        case 'missing_trust_or_delivery_signals': {
          const prodObs = observations.filter(
            (o) =>
              o.category === 'conversion' &&
              (o.metric === 'has_trust_signals' || o.metric === 'has_delivery_or_returns_info')
          );
          const urlsChecked = Array.from(new Set(prodObs.map((o) => o.sourceUrl)));
          inspectedCount = urlsChecked.length;
          affectedUrls = urlsChecked.filter((u) => {
            const pageObs = prodObs.filter((o) => o.sourceUrl === u);
            return pageObs.some((o) => o.value === false);
          });
          break;
        }
        case 'missing_review_widget_on_product': {
          const revObs = observations.filter(
            (o) => o.category === 'conversion' && o.metric === 'has_review_section' && o.pageType === 'product'
          );
          inspectedCount = revObs.length;
          affectedUrls = revObs.filter((o) => o.value === false).map((o) => o.sourceUrl);
          break;
        }

        // --- TOOL 12: TECH STACK & PERFORMANCE INSPECTOR ---
        case 'excessive_third_party_scripts': {
          const scriptObs = observations.filter(
            (o) => o.category === 'performance' && o.metric === 'third_party_script_count'
          );
          inspectedCount = scriptObs.length;
          affectedUrls = scriptObs
            .filter((o) => Number(o.value) > (threshold || 5))
            .map((o) => o.sourceUrl);
          break;
        }
        case 'missing_lazy_loading_on_images': {
          const lazyObs = observations.filter(
            (o) => o.category === 'performance' && o.metric === 'lazy_loaded_image_pct'
          );
          inspectedCount = lazyObs.length;
          affectedUrls = lazyObs
            .filter((o) => Number(o.value) < (threshold || 60))
            .map((o) => o.sourceUrl);
          break;
        }

        // --- PHASE 8 BACKLOG TOOLS (IMAGE & INTERNATIONAL AUDITORS) ---
        case 'image_missing_alt': {
          const pagesWithImgs = Array.from(new Set(images.map((i) => i.sourceUrl)));
          inspectedCount = Math.max(1, pagesWithImgs.length);
          affectedUrls = Array.from(new Set(images.filter((i) => !i.hasAlt).map((i) => i.sourceUrl)));
          break;
        }
        case 'image_legacy_format': {
          const pagesWithImgs = Array.from(new Set(images.map((i) => i.sourceUrl)));
          inspectedCount = Math.max(1, pagesWithImgs.length);
          affectedUrls = Array.from(
            new Set(
              images
                .filter((i) => i.format !== 'webp' && i.format !== 'avif' && i.format !== 'svg')
                .map((i) => i.sourceUrl)
            )
          );
          break;
        }
        case 'image_missing_dimensions': {
          const pagesWithImgs = Array.from(new Set(images.map((i) => i.sourceUrl)));
          inspectedCount = Math.max(1, pagesWithImgs.length);
          affectedUrls = Array.from(
            new Set(images.filter((i) => i.width === null || i.height === null).map((i) => i.sourceUrl))
          );
          break;
        }
        case 'missing_international_or_currency_consistency': {
          const okPages = eligibleHtmlPages.filter((p) => p.status === 200);
          inspectedCount = okPages.length;
          affectedUrls = okPages
            .filter((p) => !p.responseHeaders['content-language'] && p.pageType === 'homepage')
            .map((p) => p.sourceUrl);
          break;
        }
        default:
          break;
      }

      affectedUrls = Array.from(new Set(affectedUrls));
      if (affectedUrls.length === 0 || inspectedCount <= 0) {
        continue;
      }

      const affectedSet = new Set(affectedUrls);
      for (const p of pages) {
        if (affectedSet.has(p.sourceUrl)) {
          if (!templateBreakdown[p.templateId]) {
            templateBreakdown[p.templateId] = { affected: 0, total: 1 };
          }
          templateBreakdown[p.templateId].affected++;
        }
      }

      const coverageScore = computeCoverageScore(affectedUrls.length, inspectedCount);
      const highestMethod: ExtractionLevel = pages.some((p) => p.extractionMethod === 'C')
        ? 'C'
        : pages.some((p) => p.extractionMethod === 'B')
          ? 'B'
          : 'A';
      const avgConf =
        pages.length > 0
          ? pages.reduce((acc, p) => acc + p.confidence, 0) / pages.length
          : 0.9;
      const confidenceScore = computeConfidenceScore(highestMethod, avgConf);

      const priorityScore = Math.round(
        rule.impactScore *
          this.weights.impactWeight *
          (coverageScore * this.weights.coverageWeight) *
          (confidenceScore * this.weights.confidenceWeight)
      );
      const priorityBand = computePriorityBand(priorityScore);
      const coveragePercentage = Number(((affectedUrls.length / inspectedCount) * 100).toFixed(1));

      const topTemplate =
        Object.entries(templateBreakdown).sort((a, b) => b[1].affected - a[1].affected)[0]?.[0] ?? 'default';

      const evidenceSummary = rule.supportingEvidenceTemplate
        .replace(/\{affected\}/g, String(affectedUrls.length))
        .replace(/\{inspected\}/g, String(inspectedCount))
        .replace(/\{coveragePct\}/g, String(coveragePercentage))
        .replace(/\{template\}/g, topTemplate);

      const finding: FindingRecord = {
        findingId: `${crawlId}:finding:${rule.ruleId}`,
        crawlId,
        ruleId: rule.ruleId,
        ruleVersion: rule.version || '1.0.0',
        toolId: rule.toolId,
        module: rule.module,
        category: rule.category,
        title: rule.title,
        severity: rule.severity,
        impactScore: rule.impactScore,
        coverageScore,
        confidenceScore,
        priorityScore,
        priorityBand,
        recommendationText: rule.recommendationText,
        evidenceSummary,
        howDetected: rule.howDetected,
        inspectedCount,
        affectedCount: affectedUrls.length,
        coveragePercentage,
        affectedUrls,
        templateBreakdown,
        extractionMethod: highestMethod,
        originalValueJson: JSON.stringify({
          affectedCount: affectedUrls.length,
          inspectedCount,
          ruleVersion: rule.version,
        }),
        normalizedValueJson: JSON.stringify({
          priorityScore,
          priorityBand,
          coveragePercentage,
        }),
        confidence: Number((confidenceScore / 5).toFixed(2)),
        extractedAt: nowIso,
      };

      this.db.upsertFinding(finding);
      findings.push(finding);
    }

    return findings.sort((a, b) => b.priorityScore - a.priorityScore);
  }
}


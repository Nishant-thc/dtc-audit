export type ExtractionLevel = 'A' | 'B' | 'C';

export type PlatformType =
  | 'shopify'
  | 'woocommerce'
  | 'magento'
  | 'bigcommerce'
  | 'generic';

export type PageType =
  | 'homepage'
  | 'product'
  | 'category'
  | 'collection'
  | 'blog'
  | 'landing'
  | 'informational'
  | 'search'
  | 'filtered'
  | 'utility'
  | 'unknown';

export type DiscoverySource =
  | 'seed'
  | 'robots'
  | 'sitemap'
  | 'nav'
  | 'footer'
  | 'internal_link'
  | 'canonical'
  | 'adapter';

export type CrawlStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type PriorityBand = 'High' | 'Medium' | 'Low';

export type RecommendationCategory =
  | 'Technical SEO'
  | 'On-page SEO'
  | 'Product optimization'
  | 'Category optimization'
  | 'Content optimization'
  | 'Internal linking'
  | 'Conversion optimization'
  | 'Trust improvement'
  | 'Performance improvement'
  | 'Merchandising improvement';

export interface CrawlBudgetConfig {
  maxDiscoveryUrls: number;
  maxLightweightPages: number;
  maxDeepProductPages: number;
  maxDeepCollectionPages: number;
  maxDeepContentPages: number;
  maxBrowserPerfPages: number;
  concurrency: number;
  perHostDelayMs: number;
  storeRawHtml: boolean;
  snapshotRetentionDays: number;
  maxLevel: ExtractionLevel;
}

export interface CoverageCounters {
  discovered: number;
  requested: number;
  extracted: number;
  partiallyExtracted: number;
  skipped: number;
  blockedOrUnavailable: number;
  deeplyInspected: number;
}

export interface WebsiteRecord {
  domain: string;
  platform: PlatformType;
  latestCrawlId: string;
  settingsJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrawlRecord {
  crawlId: string;
  domain: string;
  platform: PlatformType;
  startTime: string;
  endTime: string | null;
  budgetJson: string;
  status: CrawlStatus;
  maxLevel: ExtractionLevel;
  coverage: CoverageCounters;
  robotsTxtRaw: string | null;
  crawlDelayMs: number;
}

export interface PageRecord {
  pageId: string;
  crawlId: string;
  sourceUrl: string;
  normalizedUrl: string;
  pageType: PageType;
  classificationConfidence: number;
  classificationSignals: string[];
  templateId: string;
  status: number;
  redirectDestination: string | null;
  redirectChain: string[];
  discoverySource: DiscoverySource;
  sitemapSource: string | null;
  lastmod: string | null;
  parameters: Record<string, string[]>;
  canonicalUrl: string | null;
  normalizedCanonicalUrl: string | null;
  title: string | null;
  metaDescription: string | null;
  h1List: string[];
  h2List: string[];
  h3ToH6Count: number;
  robotsMeta: string | null;
  xRobotsTag: string | null;
  isNoindex: boolean;
  isNofollow: boolean;
  visibleText: string;
  wordCount: number;
  contentLength: number;
  responseHeaders: Record<string, string>;
  contentFingerprint: string | null;
  etag: string | null;
  lastModifiedHeader: string | null;
  depth: number;
  inboundLinkCount: number;
  outboundLinkCount: number;
  inSitemap: boolean;
  inNav: boolean;
  extractionMethod: ExtractionLevel;
  originalValueJson: string;
  normalizedValueJson: string;
  confidence: number;
  extractedAt: string;
}

export interface SitemapRecord {
  sitemapId: string;
  crawlId: string;
  sourceUrl: string;
  isIndex: boolean;
  declaredPagesCount: number;
  declaredUrls: string[];
  lastmod: string | null;
  status: number;
  errorUrlCount: number;
  redirectUrlCount: number;
  extractionMethod: ExtractionLevel;
  confidence: number;
  extractedAt: string;
}

export interface ProductRecord {
  productId: string;
  crawlId: string;
  sourceUrl: string;
  normalizedUrl: string;
  title: string;
  sku: string | null;
  brand: string | null;
  price: number | null;
  originalPrice: number | null;
  currency: string | null;
  discountPercentage: number | null;
  availability: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  descriptionText: string;
  descriptionWordCount: number;
  specsCount: number;
  specs: Record<string, string>;
  imageCount: number;
  imagesWithAltCount: number;
  hasProductSchema: boolean;
  hasOfferSchema: boolean;
  hasAggregateRatingSchema: boolean;
  hasReviews: boolean;
  reviewCount: number;
  ratingValue: number | null;
  relatedProductsCount: number;
  variantCount: number;
  hasBundleOrSubscription: boolean;
  categoryName: string | null;
  templateId: string;
  completenessScore: number;
  missingFields: string[];
  extractionMethod: ExtractionLevel;
  originalValueJson: string;
  normalizedValueJson: string;
  confidence: number;
  extractedAt: string;
}

export interface VariantRecord {
  variantId: string;
  crawlId: string;
  productId: string;
  sourceUrl: string;
  title: string;
  sku: string | null;
  attributes: Record<string, string>;
  price: number | null;
  available: boolean;
  extractionMethod: ExtractionLevel;
  originalValueJson: string;
  normalizedValueJson: string;
  confidence: number;
  extractedAt: string;
}

export interface CollectionRecord {
  collectionId: string;
  crawlId: string;
  sourceUrl: string;
  normalizedUrl: string;
  name: string;
  parentCategory: string | null;
  hierarchyPath: string[];
  descriptionText: string;
  descriptionWordCount: number;
  productCount: number;
  hasIntroContent: boolean;
  hasMetaTitle: boolean;
  hasMetaDescription: boolean;
  hasH1: boolean;
  hasFilters: boolean;
  filterFacets: string[];
  hasSorting: boolean;
  paginationType: 'numbered' | 'infinite_or_load_more' | 'none';
  canonicalUrl: string | null;
  inboundLinkCount: number;
  templateId: string;
  completenessScore: number;
  extractionMethod: ExtractionLevel;
  originalValueJson: string;
  normalizedValueJson: string;
  confidence: number;
  extractedAt: string;
}

export interface ContentRecord {
  contentId: string;
  crawlId: string;
  sourceUrl: string;
  normalizedUrl: string;
  title: string;
  author: string | null;
  publishedDate: string | null;
  modifiedDate: string | null;
  wordCount: number;
  h2Count: number;
  hasMetaDescription: boolean;
  hasArticleSchema: boolean;
  categoryTopic: string;
  extractedKeywords: string[];
  productLinks: string[];
  categoryLinks: string[];
  articleLinks: string[];
  inboundLinkCount: number;
  freshnessDays: number | null;
  extractionMethod: ExtractionLevel;
  originalValueJson: string;
  normalizedValueJson: string;
  confidence: number;
  extractedAt: string;
}

export interface LinkRecord {
  linkId: string;
  crawlId: string;
  sourceUrl: string;
  destinationUrl: string;
  destinationNormalizedUrl: string;
  anchorText: string;
  linkType: 'internal' | 'external';
  targetPageType: PageType;
  position: 'nav' | 'footer' | 'breadcrumb' | 'content' | 'product_grid' | 'other';
  isNofollow: boolean;
  isBroken: boolean;
  statusCode: number | null;
  extractionMethod: ExtractionLevel;
  originalValueJson: string;
  normalizedValueJson: string;
  confidence: number;
  extractedAt: string;
}

export interface ImageRecord {
  imageId: string;
  crawlId: string;
  sourceUrl: string;
  imageUrl: string;
  altText: string;
  hasAlt: boolean;
  width: number | null;
  height: number | null;
  format: string;
  weightBytes: number | null;
  isLazyLoaded: boolean;
  extractionMethod: ExtractionLevel;
  originalValueJson: string;
  normalizedValueJson: string;
  confidence: number;
  extractedAt: string;
}

export interface SchemaRecord {
  schemaId: string;
  crawlId: string;
  sourceUrl: string;
  pageType: PageType;
  templateId: string;
  schemaType: string;
  format: 'json-ld' | 'microdata' | 'rdfa';
  rawProperties: Record<string, unknown>;
  normalizedProperties: Record<string, unknown>;
  requiredFieldsPresent: string[];
  requiredFieldsMissing: string[];
  recommendedFieldsMissing: string[];
  isValid: boolean;
  priceMatchesVisible: boolean | null;
  availabilityMatchesVisible: boolean | null;
  extractionMethod: ExtractionLevel;
  originalValueJson: string;
  normalizedValueJson: string;
  confidence: number;
  extractedAt: string;
}

export interface TechnologyRecord {
  techId: string;
  crawlId: string;
  sourceUrl: string;
  name: string;
  category:
    | 'platform'
    | 'cms'
    | 'framework'
    | 'analytics'
    | 'pixel'
    | 'reviews'
    | 'chat'
    | 'email_marketing'
    | 'ab_testing'
    | 'cdn'
    | 'other';
  provider: string;
  scriptUrl: string | null;
  signatureMatched: string;
  isThirdParty: boolean;
  extractionMethod: ExtractionLevel;
  originalValueJson: string;
  normalizedValueJson: string;
  confidence: number;
  extractedAt: string;
}

export interface ObservationRecord {
  observationId: string;
  crawlId: string;
  sourceUrl: string;
  templateId: string;
  pageType: PageType;
  category: 'conversion' | 'performance' | 'faceted';
  metric: string;
  value: string | number | boolean;
  details: Record<string, unknown>;
  device: 'desktop' | 'mobile';
  extractionMethod: ExtractionLevel;
  originalValueJson: string;
  normalizedValueJson: string;
  confidence: number;
  extractedAt: string;
}

export interface RuleDefinition {
  ruleId: string;
  version: string;
  module: string;
  toolId: string;
  title: string;
  category: RecommendationCategory;
  requiredDataFields: string[];
  detectionCondition: {
    entity:
      | 'page'
      | 'sitemap'
      | 'product'
      | 'collection'
      | 'content'
      | 'link'
      | 'image'
      | 'schema'
      | 'technology'
      | 'observation';
    check: string;
    threshold?: number;
    params?: Record<string, unknown>;
  };
  applicablePageTypes: PageType[];
  severity: 1 | 2 | 3 | 4 | 5;
  impactScore: 1 | 2 | 3 | 4 | 5;
  recommendationText: string;
  supportingEvidenceTemplate: string;
  howDetected: string;
}

export interface FindingRecord {
  findingId: string;
  crawlId: string;
  ruleId: string;
  ruleVersion: string;
  toolId: string;
  module: string;
  category: RecommendationCategory;
  title: string;
  severity: number;
  impactScore: number;
  coverageScore: number;
  confidenceScore: number;
  priorityScore: number;
  priorityBand: PriorityBand;
  recommendationText: string;
  evidenceSummary: string;
  howDetected: string;
  inspectedCount: number;
  affectedCount: number;
  coveragePercentage: number;
  affectedUrls: string[];
  templateBreakdown: Record<string, { affected: number; total: number }>;
  extractionMethod: ExtractionLevel;
  originalValueJson: string;
  normalizedValueJson: string;
  confidence: number;
  extractedAt: string;
}

export interface ToolManifest {
  toolId: string;
  slug: string;
  number: number;
  name: string;
  navGroup:
    | 'Website Architecture'
    | 'SEO'
    | 'Products'
    | 'Categories'
    | 'Content'
    | 'Conversion'
    | 'Technical'
    | 'Opportunities';
  oneLinePromise: string;
  problemId: string;
  problemStatement: string;
  whoUsesIt: string[];
  estimatedTimeLabel: string;
  requiredEntities: string[];
  requiredCrawlLevels: ExtractionLevel[];
  ownedRuleIds: string[];
}


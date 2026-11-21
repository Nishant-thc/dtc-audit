import type { SharedDatabase } from '../db/database.ts';
import type {
  CrawlDenominators,
  CrawlRecord,
  PageRecord,
  PageType,
  PlatformType,
  ProductRecord,
  CollectionRecord,
  ContentRecord,
  ImageRecord,
  SchemaRecord,
  StoreAreaId,
  StoreVerdictReport,
} from '../types/entities.ts';
import { RULE_PLAYBOOK } from '../ui/playbook.ts';

export type IssueSeverity = 'critical' | 'warning' | 'minor';

export interface ConciseRuleCopy {
  issue: string; // <= 70 chars
  action: string; // <= 90 chars, verb-first
  severity: IssueSeverity | 'opportunity';
  threshold: string;
  whyTested: string;
}

export const CONCISE_RULE_COPY: Record<string, ConciseRuleCopy> = {
  // Search Visibility
  'META-006': {
    issue: 'Commercial pages blocked with noindex',
    action: 'Remove noindex from live product, collection, and landing templates',
    severity: 'critical',
    threshold: '0 commercial pages with noindex',
    whyTested: 'We checked <meta name="robots"> and X-Robots-Tag headers. A noindex tag tells Google to drop the page from search results.',
  },
  'SCHEMA-001': {
    issue: 'Product schema missing',
    action: 'Add Product JSON-LD to the product template',
    severity: 'critical',
    threshold: '100% of product pages have @type Product',
    whyTested: 'We checked <script type="application/ld+json"> on product pages. Without Product schema, Google cannot show price, stock, or star ratings.',
  },
  'SCHEMA-004': {
    issue: 'Schema price or stock disagrees with page',
    action: 'Bind Offer JSON-LD to the active in-stock variant price and status',
    severity: 'critical',
    threshold: 'Schema price & availability match visible page',
    whyTested: 'We compared JSON-LD Offer price and stock against the visible page. Mismatches can disqualify rich snippets and Merchant Center listings.',
  },
  'ATLAS-002': {
    issue: 'Sitemap contains broken or redirecting URLs',
    action: 'Remove 404s and replace redirects with final URLs in sitemap.xml',
    severity: 'critical',
    threshold: '100% of sitemap URLs return 200 OK directly',
    whyTested: 'We checked HTTP status codes on sitemap URLs. Sitemaps should only list live 200 OK canonical destinations.',
  },
  'ATLAS-001': {
    issue: 'Live pages missing from sitemap',
    action: 'Include all live store pages in your XML sitemap',
    severity: 'warning',
    threshold: 'All 200 OK live pages listed in sitemap.xml',
    whyTested: 'We compared crawled live URLs against sitemap.xml. Missing URLs take longer for search engines to discover.',
  },
  'ATLAS-003': {
    issue: 'Missing or mismatched canonical tag',
    action: 'Output a self-referencing rel="canonical" in the layout head',
    severity: 'warning',
    threshold: 'Self-referencing canonical on every standard page',
    whyTested: 'We checked <link rel="canonical"> on each page. Canonical tags prevent tracking or duplicate URLs from splitting ranking signals.',
  },
  'ATLAS-004': {
    issue: 'Internal links pass through redirects',
    action: 'Update menu and content links to point to the final URL',
    severity: 'minor',
    threshold: '0 redirect hops on internal links',
    whyTested: 'We followed internal URL redirects. Direct links load faster and avoid unnecessary redirect hops.',
  },
  'META-001': {
    issue: 'Page title missing, too short, or too long',
    action: 'Keep page titles unique and between 15 and 65 characters',
    severity: 'warning',
    threshold: '15–65 characters per <title>',
    whyTested: 'We measured <title> length on every inspected page. Titles under 15 chars lack context; over 65 chars get cut off in Google.',
  },
  'META-002': {
    issue: 'Duplicate page titles across URLs',
    action: 'Make each page title unique using product, category, or topic names',
    severity: 'warning',
    threshold: '0 duplicate <title> tags',
    whyTested: 'We grouped pages sharing identical <title> text. Duplicate titles cause your own pages to compete in search results.',
  },
  'META-003': {
    issue: 'Meta description missing or poorly sized',
    action: 'Add a 50–165 character meta description template',
    severity: 'minor',
    threshold: '50–165 characters per meta description',
    whyTested: 'We measured <meta name="description"> length. Missing descriptions force Google to pull random page snippets.',
  },
  'META-004': {
    issue: 'Duplicate meta descriptions across URLs',
    action: 'Bind meta descriptions to each page summary instead of a global default',
    severity: 'minor',
    threshold: '0 duplicate meta descriptions',
    whyTested: 'We grouped pages with identical meta descriptions. Unique snippets clarify what each page offers.',
  },
  'META-005': {
    issue: 'Missing or multiple H1 headings',
    action: 'Keep exactly one <h1> per page; demote logo and banner headings to <h2>',
    severity: 'warning',
    threshold: 'Exactly 1 <h1> per page',
    whyTested: 'We counted <h1> tags on each page. Multiple or missing H1s blur the main heading for crawlers and screen readers.',
  },
  'SCHEMA-002': {
    issue: 'Product or Offer schema missing fields',
    action: 'Add missing product details (SKU, brand, rating) to Product schema',
    severity: 'warning',
    threshold: 'All required & recommended Product/Offer fields set',
    whyTested: 'We validated Product and Offer JSON-LD properties against Google rich result requirements.',
  },
  'SCHEMA-003': {
    issue: 'Breadcrumb schema missing',
    action: 'Add BreadcrumbList JSON-LD to non-homepage templates',
    severity: 'minor',
    threshold: 'BreadcrumbList JSON-LD on all interior pages',
    whyTested: 'We checked interior pages for BreadcrumbList markup, which shows clean category trails in Google search results.',
  },
  'INTL-001': {
    issue: 'Language tag not declared',
    action: 'Set lang="en" (or your locale) on the root <html> element',
    severity: 'minor',
    threshold: 'Explicit <html lang> or Content-Language header',
    whyTested: 'We checked <html lang> and Content-Language headers to confirm regional targeting is declared.',
  },

  // AI Readiness
  'AI-001': {
    issue: 'AI search crawlers blocked in robots.txt',
    action: 'Allow OAI-SearchBot, PerplexityBot, and Claude-SearchBot in robots.txt',
    severity: 'critical',
    threshold: 'Search & citation AI bots allowed (training bots optional)',
    whyTested: 'We parsed robots.txt for AI search/citation bots separately from model training bots. Blocking search bots removes live AI citations.',
  },
  'AI-002': {
    issue: 'Product details missing from raw HTML',
    action: 'Server-render product title, price, and description in initial HTML',
    severity: 'critical',
    threshold: 'Core product text & price present without JavaScript',
    whyTested: 'We compared raw HTML against JavaScript-rendered DOM. Crawlers that skip JS miss client-only product text.',
  },
  'AI-003': {
    issue: 'Store policy or product facts hard to extract',
    action: 'Link Shipping/Returns, About, and FAQ pages and render specs in text',
    severity: 'warning',
    threshold: 'Shipping/Returns, About, FAQ & plain-text specs present',
    whyTested: 'We checked whether shoppers and AI assistants can read policies and product specs directly from page HTML.',
  },
  'AI-004': {
    issue: 'Organization schema incomplete or brand mismatch',
    action: 'Add Organization JSON-LD with matching brand name and sameAs links',
    severity: 'warning',
    threshold: 'Organization name + sameAs links match Product brand',
    whyTested: 'We checked Organization schema name, sameAs links, and agreement with Product brand names for entity clarity.',
  },
  'AI-005': {
    issue: 'Optional /llms.txt file not present',
    action: 'Add a short /llms.txt markdown summary at the site root',
    severity: 'opportunity',
    threshold: 'Optional emerging convention',
    whyTested: 'We checked for /llms.txt at the domain root. It is an optional convention and does not affect your health score.',
  },

  // Product & Collection Quality
  'CAT-001': {
    issue: 'Thin or missing product descriptions',
    action: 'Expand product copy to 60+ words covering fit, materials, and care',
    severity: 'warning',
    threshold: '≥ 30 words per product description',
    whyTested: 'We counted words in each product description. Short copy leaves buyers guessing and gives Google little to rank.',
  },
  'CAT-002': {
    issue: 'Product specifications missing',
    action: 'Add a structured bullet list or table of product specs',
    severity: 'warning',
    threshold: '≥ 2 structured spec items per product',
    whyTested: 'We looked for spec tables, definition lists, JSON-LD properties, and feature bullets on product pages.',
  },
  'CAT-003': {
    issue: 'Product photos missing alt text',
    action: 'Set an alt text fallback using the product title in the product template',
    severity: 'warning',
    threshold: '100% of product images have alt text',
    whyTested: 'We checked alt attributes on product page images for screen-reader accessibility and Google Image indexing.',
  },
  'CAT-004': {
    issue: 'Product pages missing reviews or ratings',
    action: 'Enable your customer review widget on the product template',
    severity: 'warning',
    threshold: 'Visible review section or AggregateRating on products',
    whyTested: 'We checked product pages for review widgets and rating schema.',
  },
  'CAT-005': {
    issue: 'Products score below 70/100 completeness',
    action: 'Fill missing description, specs, alt text, and schema fields',
    severity: 'warning',
    threshold: 'Completeness score ≥ 70/100 across 8 dimensions',
    whyTested: 'We scored each product on description, specs, images, alt text, schema, reviews, SKU/brand, and variants.',
  },
  'COLL-001': {
    issue: 'No intro text on collection pages',
    action: 'Add a 40–60 word intro paragraph to collection templates',
    severity: 'warning',
    threshold: '≥ 15 words of intro copy per collection',
    whyTested: 'We checked collection pages for introductory copy above or below the grid so category queries have text to rank on.',
  },
  'COLL-002': {
    issue: 'Thin collections with under 3 products',
    action: 'Add products or redirect retired collections to parent categories',
    severity: 'minor',
    threshold: '≥ 3 products per indexable collection',
    whyTested: 'We counted products linked on each collection page to spot nearly empty categories.',
  },
  'COLL-003': {
    issue: 'Collections have weak internal linking',
    action: 'Link these collections from main navigation or parent category menus',
    severity: 'minor',
    threshold: '≥ 2 internal inbound links per collection',
    whyTested: 'We counted internal links pointing to each collection from sampled pages.',
  },
  'IMG-001': {
    issue: 'Site images missing alt text',
    action: 'Populate descriptive alt attributes on content and product images',
    severity: 'warning',
    threshold: 'Non-empty alt attribute on meaningful images',
    whyTested: 'We inspected every <img> tag on crawled pages for missing or empty alt attributes.',
  },
  'PRICE-001': {
    issue: 'Out-of-stock products in active catalogue',
    action: 'Add back-in-stock signup and push sold-out items down collection grids',
    severity: 'opportunity',
    threshold: 'Stock availability check',
    whyTested: 'We checked product stock status. Out-of-stock items are an opportunity for waitlist capture rather than a technical defect.',
  },
  'PRICE-002': {
    issue: 'Large compare-at discounts (≥50% off)',
    action: 'Verify compare-at prices are intentional clearance markdowns',
    severity: 'opportunity',
    threshold: 'Discount < 50%',
    whyTested: 'We compared current price to strikethrough compare-at prices to flag potential pricing typos.',
  },
  'PRICE-003': {
    issue: 'No bundle or subscription offers detected',
    action: 'Test multi-buy bundles or Subscribe & Save on top sellers',
    severity: 'opportunity',
    threshold: 'Merchandising growth idea',
    whyTested: 'We checked product pages for bundle or subscription copy. This is an optional AOV idea and does not affect your score.',
  },

  // Site Health & Speed
  'LINK-003': {
    issue: 'Broken internal links found',
    action: 'Replace links pointing to 4xx/5xx URLs with live destinations',
    severity: 'critical',
    threshold: '0 broken internal links',
    whyTested: 'We checked internal link destinations against crawled HTTP statuses to catch 404 dead ends.',
  },
  'FACET-001': {
    issue: 'Filter URLs indexable without canonical control',
    action: 'Point filter/sort URLs (?sort=, ?filter=) to the clean collection canonical',
    severity: 'warning',
    threshold: 'Filtered URLs canonicalize to base URL or use noindex',
    whyTested: 'We checked parameterized URLs to prevent faceted navigation from generating duplicate indexed pages.',
  },
  'FACET-002': {
    issue: 'Filtered URLs listed in XML sitemap',
    action: 'Strip query-parameter URLs from sitemap.xml generation',
    severity: 'warning',
    threshold: '0 parameterized URLs in sitemap.xml',
    whyTested: 'We checked sitemap entries for query parameters. Sitemaps should only contain clean canonical URLs.',
  },
  'LINK-001': {
    issue: 'No internal links pointing here (orphan candidates)',
    action: 'Link these URLs from parent collections, menus, or related products',
    severity: 'minor',
    threshold: '≥ 1 internal link from crawled pages',
    whyTested: 'We checked which discovered URLs received zero inbound links in the crawled sample.',
  },
  'LINK-002': {
    issue: 'Pages buried deeper than 3 clicks from home',
    action: 'Surface deep categories in header menus or increase grid pagination',
    severity: 'minor',
    threshold: 'Click depth ≤ 3 from homepage',
    whyTested: 'We measured shortest click depth from the homepage across the internal link graph.',
  },
  'PERF-001': {
    issue: 'Heavy third-party script load (>5 scripts)',
    action: 'Remove unused app scripts and defer non-critical third-party tags',
    severity: 'warning',
    threshold: '≤ 5 third-party external scripts per page',
    whyTested: 'We counted external scripts per page. Excess third-party JavaScript slows mobile page loads.',
  },
  'PERF-002': {
    issue: 'Below-the-fold images missing lazy loading',
    action: 'Add loading="lazy" to product grid and gallery images below the fold',
    severity: 'minor',
    threshold: '≥ 60% of images use loading="lazy"',
    whyTested: 'We checked loading="lazy" on page images to avoid downloading offscreen images upfront.',
  },
  'IMG-002': {
    issue: 'Legacy JPG/PNG images instead of WebP/AVIF',
    action: 'Serve images in WebP or AVIF via your CDN or storefront optimizer',
    severity: 'minor',
    threshold: 'Serve WebP/AVIF for photo assets',
    whyTested: 'We checked image file extensions and URL format params. WebP/AVIF cuts transfer size by 30–50%.',
  },
  'IMG-003': {
    issue: 'Images missing width and height attributes',
    action: 'Output explicit width and height on <img> tags to prevent layout shift',
    severity: 'minor',
    threshold: 'Explicit width & height on all <img> tags',
    whyTested: 'We checked <img> tags for width and height attributes, which reserve layout space before images load.',
  },
  'SPEED-001': {
    issue: 'Main content loads slower than 2.5s (Lab LCP)',
    action: 'Preload the hero/main product image and cut render-blocking assets',
    severity: 'warning',
    threshold: 'Lab LCP ≤ 2.5s',
    whyTested: 'Measured locally in headless Chromium via PerformanceObserver (lab estimate, not Google CrUX field data).',
  },
  'SPEED-002': {
    issue: 'Page layout shifts while loading (Lab CLS > 0.1)',
    action: 'Reserve fixed aspect ratios for images, banners, and dynamic embeds',
    severity: 'warning',
    threshold: 'Lab CLS ≤ 0.1',
    whyTested: 'Measured locally in headless Chromium via PerformanceObserver (lab estimate, not Google CrUX field data).',
  },

  // Conversion & Trust
  'CRO-001': {
    issue: 'Commercial pages missing shipping or trust info',
    action: 'Add delivery timelines, return policy, and trust signals near the CTA',
    severity: 'warning',
    threshold: 'Visible delivery/returns & trust signals on commercial templates',
    whyTested: 'We checked product, collection, and landing pages (excluding blog posts) for shipping, returns, and trust signals.',
  },
  'CRO-002': {
    issue: 'Product pages missing review widget',
    action: 'Display star ratings and customer reviews on product templates',
    severity: 'warning',
    threshold: 'Observable review widget on product pages',
    whyTested: 'We checked product templates for customer review containers and rating widgets.',
  },
  'BLOG-001': {
    issue: 'Blog posts have zero links to products',
    action: 'Add 2–4 contextual product links or product cards to each blog post',
    severity: 'warning',
    threshold: '≥ 1 internal product link per editorial article',
    whyTested: 'We inspected internal links inside blog articles to check whether editorial content drives shoppers to products.',
  },
  'BLOG-002': {
    issue: 'Products have no links from blog articles',
    action: 'Feature key products inside buying guides and how-to articles',
    severity: 'opportunity',
    threshold: 'Content merchandising opportunity',
    whyTested: 'We checked which products receive internal links from editorial content. Excluded from health score.',
  },
  'FRESH-001': {
    issue: 'Undated or stale articles (>1 year old)',
    action: 'Refresh older guides and output a visible updated date',
    severity: 'minor',
    threshold: 'Updated within 365 days with visible date',
    whyTested: 'We checked article publication and modified dates in HTML and Article schema.',
  },
  'FRESH-002': {
    issue: 'Thin (<400w), unstructured, or un-schemed articles',
    action: 'Expand articles to 400+ words with H2 sections and Article JSON-LD',
    severity: 'minor',
    threshold: '≥ 400 words, ≥ 2 H2s, and Article schema',
    whyTested: 'We checked editorial word count, H2 subheading structure, and Article/BlogPosting JSON-LD.',
  },
};

export interface IssueRowItem {
  url: string;
  currentValue: string;
}

export interface IssueTableRow {
  rowId: string;
  ruleId: string;
  severity: IssueSeverity;
  areaId: StoreAreaId;
  areaLabel: string;
  issue: string; // <= 70 chars
  pageType: PageType | 'sitewide';
  whereLabel: string;
  affectedCount: number;
  checkedCount: number;
  affectedPct: number;
  exampleUrl: string | null;
  action: string; // <= 90 chars
  owner: string;
  effortLabel: string;
  affectedItems: IssueRowItem[];
  passingUrls: string[];
  platformSteps: string[];
  beforeAfter: Array<{ currentLabel: string; currentValue: string; suggestedLabel: string; suggestedValue: string; sourceUrl?: string }>;
  whyTested: string;
  threshold: string;
  ticketMarkdown: string;
}

export interface PageCheckEntry {
  ruleId: string;
  issue: string;
  action: string;
  severity: IssueSeverity;
  areaLabel: string;
  status: 'pass' | 'fail';
  measuredValue: string;
}

export interface PageAuditRow {
  url: string;
  shortPath: string;
  pageType: PageType;
  pageTypeLabel: string;
  status: 'good' | 'needs_work' | 'broken';
  httpStatus: number;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
  minorCount: number;
  topIssue: string;
  keyValues: string;
  checks: PageCheckEntry[];
}

export interface VisualSummaryData {
  areaChartTitle: string;
  pageHealthChartTitle: string;
  pageHealthByType: Array<{
    pageType: string;
    label: string;
    good: number;
    needsWork: number;
    broken: number;
    total: number;
  }>;
  severityCounts: {
    critical: number;
    warning: number;
    minor: number;
  };
  heatmap: {
    pageTypes: Array<{ key: string; label: string }>;
    rows: Array<{
      areaId: StoreAreaId;
      areaLabel: string;
      cells: Array<{ pageType: string; affectedPct: number | null; affected: number; checked: number }>;
    }>;
  };
  coverageLine: string;
}

function pageTypeLabel(pt: PageType | 'sitewide'): string {
  switch (pt) {
    case 'product':
      return 'Product pages';
    case 'collection':
    case 'category':
      return 'Collection pages';
    case 'blog':
    case 'informational':
      return 'Blog & editorial';
    case 'homepage':
      return 'Homepage';
    case 'landing':
      return 'Landing pages';
    case 'filtered':
    case 'search':
      return 'Filtered & search';
    default:
      return 'Sitewide';
  }
}

function normalizePageTypeBucket(pt: PageType): PageType {
  if (pt === 'category') return 'collection';
  if (pt === 'informational') return 'blog';
  if (pt === 'search') return 'filtered';
  return pt;
}

function shortPathFromUrl(u: string): string {
  try {
    const parsed = new URL(u);
    const p = (parsed.pathname || '/') + (parsed.search || '');
    return p.length > 60 ? p.slice(0, 57) + '…' : p;
  } catch {
    return u;
  }
}

function measureValueForUrl(
  ruleId: string,
  url: string,
  page: PageRecord | undefined,
  prod: ProductRecord | undefined,
  col: CollectionRecord | undefined,
  cnt: ContentRecord | undefined,
  imgs: ImageRecord[],
  schemas: SchemaRecord[]
): string {
  switch (ruleId) {
    case 'META-001':
    case 'META-002':
      return page?.title ? `"${page.title.slice(0, 55)}" (${page.title.length} chars)` : 'Missing <title>';
    case 'META-003':
    case 'META-004':
      return page?.metaDescription
        ? `"${page.metaDescription.slice(0, 55)}…" (${page.metaDescription.length} chars)`
        : 'Missing meta description';
    case 'META-005':
      return page
        ? page.h1List.length === 0
          ? '0 H1 tags'
          : `${page.h1List.length} H1 tags (${page.h1List.slice(0, 2).join(' | ').slice(0, 50)})`
        : 'Unknown';
    case 'META-006':
      return page?.robotsMeta || page?.xRobotsTag || 'noindex';
    case 'ATLAS-003':
      return page?.canonicalUrl ? `Canonical → ${shortPathFromUrl(page.canonicalUrl)}` : 'Missing canonical tag';
    case 'ATLAS-001':
      return page?.inSitemap ? 'In sitemap.xml' : 'Not in sitemap.xml';
    case 'SCHEMA-001': {
      const hasProd = schemas.some((s) => s.schemaType === 'Product');
      return hasProd ? 'Product JSON-LD present' : 'No @type Product schema';
    }
    case 'SCHEMA-002': {
      const missing = schemas
        .filter((s) => s.schemaType === 'Product' || s.schemaType === 'Offer')
        .flatMap((s) => [...s.requiredFieldsMissing, ...s.recommendedFieldsMissing]);
      return missing.length > 0 ? `Missing: ${Array.from(new Set(missing)).slice(0, 4).join(', ')}` : 'All fields present';
    }
    case 'SCHEMA-003':
      return schemas.some((s) => s.schemaType === 'BreadcrumbList') ? 'BreadcrumbList present' : 'Missing BreadcrumbList';
    case 'SCHEMA-004': {
      const offer = schemas.find((s) => s.schemaType === 'Offer')?.rawProperties;
      const scPrice = offer?.price ?? offer?.lowPrice ?? 'n/a';
      const scAvail = offer?.availability ? String(offer.availability).replace(/^https?:\/\/schema\.org\//i, '') : 'n/a';
      return prod
        ? `Schema: ${scPrice} (${scAvail}) vs Page: ${prod.price ?? 'n/a'} (${prod.availability})`
        : 'Schema disagrees with visible page';
    }
    case 'CAT-001':
      return prod ? `${prod.descriptionWordCount} words` : 'n/a';
    case 'CAT-002':
      return prod ? `${prod.specsCount} spec items` : 'n/a';
    case 'CAT-003':
      return prod ? `${prod.imagesWithAltCount}/${prod.imageCount} photos with alt` : 'n/a';
    case 'CAT-004':
      return prod ? (prod.hasReviews ? `${prod.reviewCount} reviews` : 'No reviews') : 'n/a';
    case 'CAT-005':
      return prod ? `Score ${prod.completenessScore}/100 (missing: ${prod.missingFields.slice(0, 3).join(', ')})` : 'n/a';
    case 'COLL-001':
      return col ? `${col.descriptionWordCount} intro words (${col.productCount} products)` : '0 intro words';
    case 'COLL-002':
      return col ? `${col.productCount} products` : 'n/a';
    case 'IMG-001': {
      const withAlt = imgs.filter((i) => i.hasAlt).length;
      return `${withAlt}/${imgs.length} images with alt`;
    }
    case 'IMG-002': {
      const legacy = imgs.filter((i) => i.format !== 'webp' && i.format !== 'avif' && i.format !== 'svg').length;
      return `${legacy}/${imgs.length} legacy JPG/PNG`;
    }
    case 'IMG-003': {
      const noDim = imgs.filter((i) => i.width === null || i.height === null).length;
      return `${noDim}/${imgs.length} missing width/height`;
    }
    case 'BLOG-001':
      return cnt ? `${cnt.productLinks.length} product links` : '0 product links';
    case 'FRESH-001':
      return cnt ? (cnt.freshnessDays !== null ? `${cnt.freshnessDays} days old` : 'No date declared') : 'No date';
    case 'FRESH-002':
      return cnt ? `${cnt.wordCount} words · ${cnt.h2Count} H2s · Schema: ${cnt.hasArticleSchema ? 'Yes' : 'No'}` : 'n/a';
    default:
      return page ? `HTTP ${page.status}` : 'Checked';
  }
}

export function buildWorkingSeoTables(
  db: SharedDatabase,
  crawl: CrawlRecord,
  verdict: StoreVerdictReport
): {
  issueRows: IssueTableRow[];
  pageRows: PageAuditRow[];
  visualSummary: VisualSummaryData;
} {
  const allPages = db.getPages(crawl.crawlId);
  const checkedPages = allPages.filter(
    (p) =>
      p.status === 200 &&
      (p.extractionMethod !== 'A' || p.title !== null || p.contentLength > 0) &&
      (p.wordCount > 0 || p.title !== null)
  );
  const unreadableCount = allPages.filter(
    (p) => p.extractionMethod !== 'A' && p.wordCount === 0 && p.title === null
  ).length;
  const pageByUrl = new Map<string, PageRecord>(allPages.map((p) => [p.sourceUrl, p]));
  const prodByUrl = new Map<string, ProductRecord>(db.getProducts(crawl.crawlId).map((p) => [p.sourceUrl, p]));
  const colByUrl = new Map<string, CollectionRecord>(db.getCollections(crawl.crawlId).map((c) => [c.sourceUrl, c]));
  const cntByUrl = new Map<string, ContentRecord>(db.getContents(crawl.crawlId).map((c) => [c.sourceUrl, c]));

  const imgsByUrl = new Map<string, ImageRecord[]>();
  for (const img of db.getImages(crawl.crawlId)) {
    const arr = imgsByUrl.get(img.sourceUrl) ?? [];
    arr.push(img);
    imgsByUrl.set(img.sourceUrl, arr);
  }
  const schemasByUrl = new Map<string, SchemaRecord[]>();
  for (const sc of db.getSchemas(crawl.crawlId)) {
    const arr = schemasByUrl.get(sc.sourceUrl) ?? [];
    arr.push(sc);
    schemasByUrl.set(sc.sourceUrl, arr);
  }

  const areaLabelById = new Map<StoreAreaId, string>(verdict.areas.map((a) => [a.areaId, a.label]));
  const checkedByBucket = new Map<PageType, PageRecord[]>();
  for (const p of checkedPages) {
    const b = normalizePageTypeBucket(p.pageType);
    const arr = checkedByBucket.get(b) ?? [];
    arr.push(p);
    checkedByBucket.set(b, arr);
  }

  // Per-URL check tracking
  const checksByUrl = new Map<string, PageCheckEntry[]>();
  for (const p of checkedPages) {
    checksByUrl.set(p.sourceUrl, []);
  }

  const issueRows: IssueTableRow[] = [];
  const allIssueRuleResults = verdict.areas.flatMap((a) => a.ruleResults.filter((r) => r.kind === 'issue'));

  for (const r of allIssueRuleResults) {
    if (r.status !== 'pass' && r.status !== 'fail') continue;
    const copy = CONCISE_RULE_COPY[r.ruleId];
    const sev: IssueSeverity =
      copy && copy.severity !== 'opportunity'
        ? copy.severity
        : r.actionTier === 'fix_now'
          ? 'critical'
          : r.actionTier === 'fix_soon'
            ? 'warning'
            : 'minor';
    const shortIssue = (copy?.issue ?? r.plainTitle).slice(0, 70);
    const shortAction = (copy?.action ?? RULE_PLAYBOOK[r.ruleId]?.actionSteps[0] ?? 'Fix template configuration').slice(0, 90);
    const areaLabel = areaLabelById.get(r.areaId) ?? 'Store Health';
    const pb = RULE_PLAYBOOK[r.ruleId];
    const effortLabel = r.effortMinutes >= 60 ? `${(r.effortMinutes / 60).toFixed(1).replace(/\.0$/, '')} hr` : `${r.effortMinutes} min`;
    const affectedSet = new Set(r.affectedUrls);

    // Record pass/fail on every applicable checked HTML page for the Pages table
    for (const p of checkedPages) {
      const bucket = normalizePageTypeBucket(p.pageType);
      const applies =
        affectedSet.has(p.sourceUrl) ||
        (r.ruleId.startsWith('CAT-') && bucket === 'product') ||
        (r.ruleId.startsWith('COLL-') && bucket === 'collection') ||
        ((r.ruleId.startsWith('BLOG-') || r.ruleId.startsWith('FRESH-')) && bucket === 'blog') ||
        ((r.ruleId === 'SCHEMA-001' || r.ruleId === 'SCHEMA-002' || r.ruleId === 'SCHEMA-004' || r.ruleId === 'CRO-002') && bucket === 'product') ||
        (r.ruleId === 'CRO-001' && (bucket === 'product' || bucket === 'collection' || bucket === 'landing')) ||
        (r.ruleId.startsWith('META-') || r.ruleId.startsWith('IMG-') || r.ruleId === 'ATLAS-003');

      if (!applies) continue;
      const failedHere = affectedSet.has(p.sourceUrl);
      const val = measureValueForUrl(
        r.ruleId,
        p.sourceUrl,
        p,
        prodByUrl.get(p.sourceUrl),
        colByUrl.get(p.sourceUrl),
        cntByUrl.get(p.sourceUrl),
        imgsByUrl.get(p.sourceUrl) ?? [],
        schemasByUrl.get(p.sourceUrl) ?? []
      );
      checksByUrl.get(p.sourceUrl)!.push({
        ruleId: r.ruleId,
        issue: shortIssue,
        action: shortAction,
        severity: sev,
        areaLabel,
        status: failedHere ? 'fail' : 'pass',
        measuredValue: val,
      });
    }

    if (r.status !== 'fail' || r.affectedCount <= 0) continue;

    // Filter out unreadable 0w stubs from HTML-rule affected URLs so we never falsely report them
    const isDiscoveryRule =
      r.ruleId === 'ATLAS-001' ||
      r.ruleId === 'LINK-001' ||
      r.ruleId === 'LINK-002' ||
      r.ruleId === 'FACET-001' ||
      r.ruleId === 'FACET-002';
    const checkedUrlSet = new Set(checkedPages.map((p) => p.sourceUrl));
    const cleanUrls = isDiscoveryRule
      ? r.affectedUrls
      : r.affectedUrls.filter((u) => checkedUrlSet.has(u) || !pageByUrl.has(u));
    if (cleanUrls.length === 0 && !isDiscoveryRule) continue;

    // Consolidate to ONE clean row per rule (no 5x duplicate rows!), summarizing where it occurs
    const affectedByBucket = new Map<PageType | 'sitewide', string[]>();
    for (const u of cleanUrls) {
      const p = pageByUrl.get(u);
      const bucket: PageType | 'sitewide' = p ? normalizePageTypeBucket(p.pageType) : 'sitewide';
      const arr = affectedByBucket.get(bucket) ?? [];
      arr.push(u);
      affectedByBucket.set(bucket, arr);
    }

    const bucketKeys = Array.from(affectedByBucket.keys());
    const primaryBucket: PageType | 'sitewide' = bucketKeys.length === 1 ? bucketKeys[0] : 'sitewide';
    const whereLabel =
      bucketKeys.length === 1
        ? pageTypeLabel(bucketKeys[0])
        : bucketKeys.length === 2
          ? `${pageTypeLabel(bucketKeys[0]).replace(/ pages$/, '')} & ${pageTypeLabel(bucketKeys[1]).replace(/ pages$/, '')}`
          : 'All templates';

    const bucketCheckedPages =
      primaryBucket === 'sitewide' ? checkedPages : checkedByBucket.get(primaryBucket) ?? checkedPages;
    const checkedCount = isDiscoveryRule
      ? Math.max(cleanUrls.length, r.applicableCount)
      : Math.max(cleanUrls.length, primaryBucket === 'sitewide' ? checkedPages.length : bucketCheckedPages.length);

    const passingUrls = bucketCheckedPages
      .filter((p) => !affectedSet.has(p.sourceUrl))
      .map((p) => p.sourceUrl);

    const affectedItems: IssueRowItem[] = cleanUrls.slice(0, 50).map((u) => ({
      url: u,
      currentValue: measureValueForUrl(
        r.ruleId,
        u,
        pageByUrl.get(u),
        prodByUrl.get(u),
        colByUrl.get(u),
        cntByUrl.get(u),
        imgsByUrl.get(u) ?? [],
        schemasByUrl.get(u) ?? []
      ),
    }));

    const affectedCount = cleanUrls.length > 0 ? cleanUrls.length : r.affectedCount;
    const matchingTask = verdict.allTasks.find((t) => t.ruleIds.includes(r.ruleId));
    const platformSteps = matchingTask?.platformSteps ?? pb?.actionSteps ?? [shortAction];
    const beforeAfter = matchingTask?.beforeAfter ?? [];

    const ticketLines = [
      `## ${shortIssue} (${whereLabel})`,
      `- **Store:** ${crawl.domain} (${crawl.platform})`,
      `- **Severity:** ${sev.toUpperCase()} · **Scope:** ${affectedCount} of ${checkedCount} ${isDiscoveryRule ? 'discovered URLs' : 'checked pages'}`,
      `- **Action:** ${shortAction}`,
      `- **Owner:** ${r.owner} · **Effort:** ${effortLabel}`,
      '',
      '### Steps',
      ...platformSteps.map((s, i) => `${i + 1}. ${s}`),
      '',
      '### Sample URLs',
      ...cleanUrls.slice(0, 10).map((u) => `- ${u}`),
    ];

    issueRows.push({
      rowId: r.ruleId,
      ruleId: r.ruleId,
      severity: sev,
      areaId: r.areaId,
      areaLabel,
      issue: shortIssue,
      pageType: primaryBucket,
      whereLabel,
      affectedCount,
      checkedCount,
      affectedPct: checkedCount > 0 ? Math.round((affectedCount / checkedCount) * 100) : 0,
      exampleUrl: cleanUrls[0] ?? null,
      action: shortAction,
      owner: r.owner.replace(' / Content Team', '').replace(' / Web Developer', ' Dev').replace(' / Marketing Manager', ''),
      effortLabel,
      affectedItems,
      passingUrls,
      platformSteps,
      beforeAfter,
      whyTested: copy?.whyTested ?? pb?.whyItHurts ?? '',
      threshold: copy?.threshold ?? '',
      ticketMarkdown: ticketLines.join('\n'),
    });
  }

  const sevOrder: Record<IssueSeverity, number> = { critical: 3, warning: 2, minor: 1 };
  issueRows.sort(
    (a, b) => sevOrder[b.severity] - sevOrder[a.severity] || b.affectedCount - a.affectedCount
  );

  // Build Pages Table (Every checked URL: Good / Needs work / Broken)
  const pageRows: PageAuditRow[] = checkedPages.map((p) => {
    const checks = checksByUrl.get(p.sourceUrl) ?? [];
    const failed = checks.filter((c) => c.status === 'fail');
    const criticalCount = failed.filter((c) => c.severity === 'critical').length;
    const warningCount = failed.filter((c) => c.severity === 'warning').length;
    const minorCount = failed.filter((c) => c.severity === 'minor').length;

    // Calibrated status so healthy pages without critical blockers or multiple warnings show as Good
    const status: PageAuditRow['status'] =
      p.status !== 200 || criticalCount > 0
        ? 'broken'
        : warningCount >= 3
          ? 'needs_work'
          : 'good';

    const topFailed = failed.sort((a, b) => sevOrder[b.severity] - sevOrder[a.severity])[0];
    const imgs = imgsByUrl.get(p.sourceUrl) ?? [];
    const imgsAlt = imgs.filter((i) => i.hasAlt).length;
    const keyBits = [
      p.title ? `Title ${p.title.length} chars` : 'No title',
      `${p.h1List.length} H1`,
      `${p.wordCount.toLocaleString()} words`,
      imgs.length > 0 ? `${imgsAlt}/${imgs.length} alt` : null,
    ].filter(Boolean);

    return {
      url: p.sourceUrl,
      shortPath: shortPathFromUrl(p.sourceUrl),
      pageType: normalizePageTypeBucket(p.pageType),
      pageTypeLabel: pageTypeLabel(normalizePageTypeBucket(p.pageType)).replace(/ pages$/, ''),
      status,
      httpStatus: p.status,
      issueCount: failed.length,
      criticalCount,
      warningCount,
      minorCount,
      topIssue: topFailed ? topFailed.issue : 'No issues',
      keyValues: keyBits.join(' · '),
      checks: checks.sort((a, b) => (a.status === b.status ? sevOrder[b.severity] - sevOrder[a.severity] : a.status === 'fail' ? -1 : 1)),
    };
  });

  const statusOrder: Record<PageAuditRow['status'], number> = { broken: 3, needs_work: 2, good: 1 };
  pageRows.sort((a, b) => statusOrder[b.status] - statusOrder[a.status] || b.issueCount - a.issueCount);

  // Build 4 Visual Summary Charts
  const sortedAreas = [...verdict.areas].filter((a) => a.score !== null).sort((a, b) => (a.score ?? 100) - (b.score ?? 100));
  const areaChartTitle =
    sortedAreas.length >= 2
      ? `${sortedAreas[0].shortLabel} and ${sortedAreas[1].shortLabel} are weakest`.slice(0, 60)
      : 'Area health scores';

  const bucketOrder: PageType[] = ['product', 'collection', 'blog', 'homepage', 'landing', 'filtered', 'unknown'];
  const pageHealthByType = bucketOrder
    .map((pt) => {
      const rowsOfType = pageRows.filter((r) => r.pageType === pt);
      if (rowsOfType.length === 0) return null;
      return {
        pageType: pt,
        label: pageTypeLabel(pt),
        good: rowsOfType.filter((r) => r.status === 'good').length,
        needsWork: rowsOfType.filter((r) => r.status === 'needs_work').length,
        broken: rowsOfType.filter((r) => r.status === 'broken').length,
        total: rowsOfType.length,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const prodHealth = pageHealthByType.find((x) => x.pageType === 'product');
  const totalGood = pageRows.filter((r) => r.status === 'good').length;
  const pageHealthChartTitle = prodHealth
    ? `${prodHealth.good} of ${prodHealth.total} product pages are healthy`
    : `${totalGood} of ${pageRows.length} checked pages are healthy`;

  const severityCounts = {
    critical: issueRows.filter((r) => r.severity === 'critical').length,
    warning: issueRows.filter((r) => r.severity === 'warning').length,
    minor: issueRows.filter((r) => r.severity === 'minor').length,
  };

  const heatmapTypes = pageHealthByType.slice(0, 5).map((x) => ({ key: x.pageType, label: x.label.replace(/ pages$/, '') }));
  const heatmapRows = verdict.areas.map((a) => ({
    areaId: a.areaId,
    areaLabel: a.shortLabel,
    cells: heatmapTypes.map((ht) => {
      const matching = issueRows.filter((ir) => ir.areaId === a.areaId && ir.pageType === ht.key);
      if (matching.length === 0) return { pageType: ht.key, affectedPct: 0, affected: 0, checked: 0 };
      const maxRow = matching.sort((x, y) => y.affectedPct - x.affectedPct)[0];
      return {
        pageType: ht.key,
        affectedPct: maxRow.affectedPct,
        affected: maxRow.affectedCount,
        checked: maxRow.checkedCount,
      };
    }),
  }));

  const d: CrawlDenominators = verdict.denominators;
  const prodN = d.byPageTypeHtml.product;
  const colN = d.byPageTypeHtml.collection + d.byPageTypeHtml.category;
  const blogN = d.byPageTypeHtml.blog + d.byPageTypeHtml.informational;
  const otherN = Math.max(0, d.okHtmlPages - prodN - colN - blogN);
  const coverageLine = `Checked ${d.okHtmlPages} readable pages of ${d.discoveredUrls.toLocaleString()} URLs found (${prodN} product, ${colN} collection, ${blogN} blog, ${otherN} other)${
    unreadableCount > 0 ? ` · ${unreadableCount} empty/blocked responses excluded` : ''
  }. ${
    verdict.localSpeed.browserVitals.measured
      ? `Lab speed measured on ${verdict.localSpeed.browserVitals.sampleCount} pages.`
      : 'Speed vitals not measured — run a deep scan.'
  }`;

  return {
    issueRows,
    pageRows,
    visualSummary: {
      areaChartTitle,
      pageHealthChartTitle,
      pageHealthByType,
      severityCounts,
      heatmap: {
        pageTypes: heatmapTypes,
        rows: heatmapRows,
      },
      coverageLine,
    },
  };
}

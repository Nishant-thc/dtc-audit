import type { PageType } from '../types/entities.ts';

export interface ClassificationInput {
  url: string;
  pathname: string;
  parameters: Record<string, string[]>;
  sitemapSource?: string | null;
  schemaTypes?: string[];
  hasAddToCartButton?: boolean;
  hasProductPriceSignal?: boolean;
  hasProductGridSignal?: boolean;
  hasArticleTag?: boolean;
  breadcrumbDepth?: number;
  domSignature?: string;
}

export interface ClassificationResult {
  pageType: PageType;
  confidence: number;
  signals: string[];
  templateId: string;
}

const FILTER_PARAM_KEYS = new Set([
  'filter',
  'color',
  'colour',
  'size',
  'brand',
  'price',
  'min_price',
  'max_price',
  'sort',
  'sort_by',
  'orderby',
  'tag',
  'type',
  'availability',
  'in_stock',
  'vendor',
  'material',
]);

export function classifyPage(input: ClassificationInput): ClassificationResult {
  const path = input.pathname.toLowerCase();
  const signals: string[] = [];
  const scores: Record<PageType, number> = {
    homepage: 0,
    product: 0,
    category: 0,
    collection: 0,
    blog: 0,
    landing: 0,
    informational: 0,
    search: 0,
    filtered: 0,
    utility: 0,
    unknown: 0.1,
  };

  // 1. Homepage check
  if (path === '/' || path === '' || path === '/index.html' || path === '/index.php') {
    const paramKeys = Object.keys(input.parameters);
    if (paramKeys.includes('s') || paramKeys.includes('q')) {
      scores.search += 0.95;
      signals.push('url:search_query_param');
    } else {
      scores.homepage += 1.0;
      signals.push('url:root_path');
    }
  }

  // 2. Search check
  if (/^\/(search|catalogsearch|find)(\/|$)/i.test(path) || 'q' in input.parameters || 's' in input.parameters) {
    scores.search += 0.9;
    signals.push('url:search_pattern');
  }

  // 3. Filtered URL check (faceted parameters or filter path segments)
  const paramKeys = Object.keys(input.parameters);
  const hasFilterParam = paramKeys.some(
    (k) => FILTER_PARAM_KEYS.has(k) || k.startsWith('filter.') || k.startsWith('pa_') || k.startsWith('attr_')
  );
  const isCollectionSubPath =
    /^\/collections\/[^/]+\/([^/]+)$/.exec(path);
  const subSegment = isCollectionSubPath ? isCollectionSubPath[1] : '';
  const isHierarchicalCollectionSubPath =
    Boolean(subSegment) &&
    subSegment !== 'products' &&
    !subSegment.includes('+') &&
    !subSegment.includes('%2b') &&
    (Boolean(input.sitemapSource && input.sitemapSource.toLowerCase().includes('collection')) ||
      /^(mens|womens|men|women|kids|unisex|all|sale|new|accessories|footwear|apparel)$/.test(subSegment));

  if (
    hasFilterParam ||
    (Boolean(isCollectionSubPath) &&
      subSegment !== 'products' &&
      !isHierarchicalCollectionSubPath &&
      !path.includes('/products/'))
  ) {
    scores.filtered += 0.85;
    signals.push('url:faceted_filter_parameters');
  }

  // 4. Sitemap provenance signals
  if (input.sitemapSource) {
    const sm = input.sitemapSource.toLowerCase();
    if (sm.includes('product')) {
      scores.product += 0.45;
      signals.push('sitemap:products_sitemap');
    } else if (sm.includes('collection')) {
      scores.collection += 0.55;
      signals.push('sitemap:collections_sitemap');
    } else if (sm.includes('category') || sm.includes('product_cat')) {
      scores.category += 0.45;
      signals.push('sitemap:category_sitemap');
    } else if (sm.includes('blog') || sm.includes('post') || sm.includes('article')) {
      scores.blog += 0.45;
      signals.push('sitemap:blog_sitemap');
    } else if (sm.includes('page')) {
      scores.informational += 0.35;
      signals.push('sitemap:pages_sitemap');
    }
  }

  // 5. URL pattern heuristics
  if (
    /\/products?\/[^/]+/.test(path) ||
    /^\/shop\/[^/]+\/[^/]+/.test(path) ||
    /-p-\d+\.html$/i.test(path) ||
    (/\/catalogue\/[^/]+\/index\.html$/i.test(path) && !path.includes('/category/'))
  ) {
    scores.product += 0.75;
    signals.push('url:product_path_pattern');
  }

  if (
    (/^\/collections\/[^/]+$/.test(path) ||
      /^\/collections$/.test(path) ||
      isHierarchicalCollectionSubPath) &&
    !path.includes('/products/')
  ) {
    scores.collection += 0.75;
    signals.push('url:collection_path_pattern');
  }

  if (
    (/^\/(category|categories|product-category|c|catalog|catalogue\/category|shop|department|men|women|sale|accessories|apparel)(\/|$)/.test(path) &&
      !/\/products\//.test(path)) ||
    /\/category\/books\//i.test(path)
  ) {
    scores.category += 0.65;
    signals.push('url:category_path_pattern');
  }

  if (/^\/(blogs?|articles?|news|journal|magazine|stories|guides|learn)(\/|$)/.test(path)) {
    scores.blog += 0.75;
    signals.push('url:blog_path_pattern');
  }

  if (
    /^\/(pages\/)?(about|about-us|contact|contact-us|faq|faqs|shipping|returns|refund-policy|privacy-policy|terms|terms-of-service|size-guide|sustainability|careers|help|our-story|store-locator|press|reviews)(\/|$)/.test(
      path
    ) ||
    /^\/pages\/[^/]+/.test(path)
  ) {
    scores.informational += 0.8;
    signals.push('url:informational_path_pattern');
  }

  if (/^\/(pages\/)?(lp|landing|promo|campaign|offer|bundle-builder|quiz|gift-guide)(\/|$)/.test(path)) {
    scores.landing += 0.75;
    signals.push('url:landing_path_pattern');
  }

  if (/^\/(cart|checkout|account|login|register|wishlist|compare|track-order|order-status|policies)(\/|$)/.test(path)) {
    scores.utility += 0.85;
    signals.push('url:utility_path_pattern');
  }

  // 6. Schema signals
  if (input.schemaTypes && input.schemaTypes.length > 0) {
    const lowerSchemas = input.schemaTypes.map((s) => s.toLowerCase());
    if (lowerSchemas.includes('product') || lowerSchemas.includes('productgroup')) {
      scores.product += 0.55;
      signals.push('schema:Product');
    }
    if (lowerSchemas.includes('blogposting') || lowerSchemas.includes('article') || lowerSchemas.includes('newsarticle')) {
      scores.blog += 0.55;
      signals.push('schema:Article');
    }
    if (lowerSchemas.includes('collectionpage') || lowerSchemas.includes('itemlist')) {
      if (scores.collection >= scores.category) {
        scores.collection += 0.4;
      } else {
        scores.category += 0.4;
      }
      signals.push('schema:CollectionPage_or_ItemList');
    }
    if (lowerSchemas.includes('faqpage') || lowerSchemas.includes('aboutpage') || lowerSchemas.includes('contactpage')) {
      scores.informational += 0.45;
      signals.push('schema:InformationalPage');
    }
  }

  // 7. HTML / DOM signals
  if (input.hasAddToCartButton && input.hasProductPriceSignal && path !== '/') {
    scores.product += 0.35;
    signals.push('html:add_to_cart_and_price');
  }
  if (input.hasProductGridSignal && !input.hasAddToCartButton && path !== '/') {
    if (scores.collection > 0) {
      scores.collection += 0.3;
    } else {
      scores.category += 0.3;
    }
    signals.push('html:product_grid');
  }
  if (input.hasArticleTag && scores.product < 0.5) {
    scores.blog += 0.25;
    signals.push('html:article_element');
  }

  // Pick winning pageType
  let bestType: PageType = 'unknown';
  let bestScore = 0;

  for (const [type, sc] of Object.entries(scores) as [PageType, number][]) {
    if (sc > bestScore) {
      bestScore = sc;
      bestType = type;
    }
  }

  // If filtered has high score alongside category/collection, mark as filtered
  if (scores.filtered >= 0.85 && (bestType === 'collection' || bestType === 'category')) {
    bestType = 'filtered';
    bestScore = scores.filtered;
  }

  const confidence = Math.min(0.99, Math.max(0.25, Number(bestScore.toFixed(2))));
  const templateId = computeTemplateId(bestType, path, input.domSignature);

  return {
    pageType: bestType,
    confidence,
    signals: signals.length > 0 ? signals : ['heuristic:fallback'],
    templateId,
  };
}

export function computeTemplateId(pageType: PageType, pathname: string, domSignature?: string): string {
  const segments = pathname
    .toLowerCase()
    .split('/')
    .filter(Boolean);

  let prefix = pageType;
  if (pageType === 'homepage') {
    prefix = 'homepage';
  } else if (pageType === 'product') {
    prefix = segments.includes('collections') ? 'product-collection-scoped' : 'product-default';
  } else if (pageType === 'collection') {
    prefix = segments.length > 2 ? 'collection-sub' : 'collection-default';
  } else if (pageType === 'category') {
    prefix = segments.length > 2 ? 'category-nested' : 'category-default';
  } else if (pageType === 'blog') {
    prefix = segments.length <= 2 ? 'blog-index' : 'blog-article';
  } else if (pageType === 'informational') {
    prefix = 'page-informational';
  } else if (pageType === 'landing') {
    prefix = 'page-landing';
  } else if (pageType === 'filtered') {
    prefix = 'faceted-listing';
  }

  if (domSignature) {
    return `${prefix}-${domSignature}`;
  }
  return prefix;
}

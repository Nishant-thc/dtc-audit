import * as cheerio from 'cheerio';
import * as crypto from 'node:crypto';
import { normalizeUrl, isSameSiteDomain } from './url-normalizer.ts';
import { classifyPage } from './classifier.ts';
import type {
  PageRecord,
  ProductRecord,
  VariantRecord,
  CollectionRecord,
  ContentRecord,
  LinkRecord,
  ImageRecord,
  SchemaRecord,
  TechnologyRecord,
  ObservationRecord,
  ExtractionLevel,
  DiscoverySource,
} from '../types/entities.ts';

export interface FullPageExtractionOutput {
  page: PageRecord;
  links: LinkRecord[];
  images: ImageRecord[];
  schemas: SchemaRecord[];
  product: ProductRecord | null;
  variants: VariantRecord[];
  collection: CollectionRecord | null;
  content: ContentRecord | null;
  technologies: TechnologyRecord[];
  observations: ObservationRecord[];
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'your', 'have', 'more', 'will', 'about',
  'what', 'when', 'where', 'which', 'their', 'there', 'into', 'than', 'them', 'they', 'were',
  'been', 'some', 'such', 'only', 'other', 'also', 'over', 'after', 'most', 'very', 'just',
  'our', 'you', 'are', 'can', 'all', 'has', 'was', 'not', 'but', 'out', 'how', 'who', 'its',
]);

interface TechSignature {
  name: string;
  category: TechnologyRecord['category'];
  provider: string;
  patterns: RegExp[];
  isThirdParty: boolean;
}

const TECH_SIGNATURES: TechSignature[] = [
  { name: 'Shopify', category: 'platform', provider: 'Shopify', patterns: [/cdn\.shopify\.com/i, /Shopify\.theme/i], isThirdParty: false },
  { name: 'WooCommerce', category: 'platform', provider: 'Automattic', patterns: [/woocommerce/i, /wc-blocks/i], isThirdParty: false },
  { name: 'Magento', category: 'platform', provider: 'Adobe', patterns: [/x-magento-init/i, /mage\/cookies/i], isThirdParty: false },
  { name: 'BigCommerce', category: 'platform', provider: 'BigCommerce', patterns: [/bigcommerce\.com/i], isThirdParty: false },
  { name: 'Next.js', category: 'framework', provider: 'Vercel', patterns: [/_next\/static/i, /__NEXT_DATA__/i], isThirdParty: false },
  { name: 'React', category: 'framework', provider: 'Meta', patterns: [/data-reactroot/i, /react-dom/i], isThirdParty: false },
  { name: 'Vue.js', category: 'framework', provider: 'Vue', patterns: [/data-v-[a-f0-9]+/i, /vue\.runtime/i], isThirdParty: false },
  { name: 'Google Tag Manager', category: 'analytics', provider: 'Google', patterns: [/googletagmanager\.com\/gtm\.js/i], isThirdParty: true },
  { name: 'Google Analytics 4', category: 'analytics', provider: 'Google', patterns: [/googletagmanager\.com\/gtag\/js/i, /G-[A-Z0-9]{6,}/], isThirdParty: true },
  { name: 'Meta Pixel', category: 'pixel', provider: 'Meta', patterns: [/connect\.facebook\.net.*fbevents\.js/i, /fbq\s*\(/i], isThirdParty: true },
  { name: 'TikTok Pixel', category: 'pixel', provider: 'TikTok', patterns: [/analytics\.tiktok\.com/i, /ttq\.load/i], isThirdParty: true },
  { name: 'Pinterest Tag', category: 'pixel', provider: 'Pinterest', patterns: [/s\.pinimg\.com\/ct\/core\.js/i, /pintrk\s*\(/i], isThirdParty: true },
  { name: 'Klaviyo', category: 'email_marketing', provider: 'Klaviyo', patterns: [/static\.klaviyo\.com/i, /klaviyo\.js/i], isThirdParty: true },
  { name: 'Omnisend', category: 'email_marketing', provider: 'Omnisend', patterns: [/omnisnippet1\.com/i, /omnisend/i], isThirdParty: true },
  { name: 'Attentive', category: 'email_marketing', provider: 'Attentive', patterns: [/attn\.tv/i], isThirdParty: true },
  { name: 'Judge.me Reviews', category: 'reviews', provider: 'Judge.me', patterns: [/judge\.me/i, /jdgm-widget/i], isThirdParty: true },
  { name: 'Yotpo Reviews', category: 'reviews', provider: 'Yotpo', patterns: [/staticw2\.yotpo\.com/i, /yotpo-main-widget/i], isThirdParty: true },
  { name: 'Loox Reviews', category: 'reviews', provider: 'Loox', patterns: [/loox\.io/i], isThirdParty: true },
  { name: 'Okendo Reviews', category: 'reviews', provider: 'Okendo', patterns: [/okendo\.io/i, /okeReviews/i], isThirdParty: true },
  { name: 'Trustpilot', category: 'reviews', provider: 'Trustpilot', patterns: [/widget\.trustpilot\.com/i, /trustpilot-widget/i], isThirdParty: true },
  { name: 'Gorgias Chat', category: 'chat', provider: 'Gorgias', patterns: [/config\.gorgias\.chat/i, /gorgias-chat/i], isThirdParty: true },
  { name: 'Intercom', category: 'chat', provider: 'Intercom', patterns: [/widget\.intercom\.io/i], isThirdParty: true },
  { name: 'Zendesk Widget', category: 'chat', provider: 'Zendesk', patterns: [/static\.zdassets\.com/i], isThirdParty: true },
  { name: 'Tidio Chat', category: 'chat', provider: 'Tidio', patterns: [/code\.tidio\.co/i], isThirdParty: true },
  { name: 'Optimizely', category: 'ab_testing', provider: 'Optimizely', patterns: [/cdn\.optimizely\.com/i], isThirdParty: true },
  { name: 'VWO', category: 'ab_testing', provider: 'Wingify', patterns: [/dev\.visualwebsiteoptimizer\.com/i], isThirdParty: true },
];

export function extractFromHtml(params: {
  crawlId: string;
  sourceUrl: string;
  finalUrl: string;
  siteDomain: string;
  status: number;
  redirectChain: string[];
  headers: Record<string, string>;
  html: string;
  fingerprint: string;
  discoverySource: DiscoverySource;
  sitemapSource: string | null;
  lastmod: string | null;
  depth: number;
  inSitemap: boolean;
  inNav: boolean;
  extractionMethod: ExtractionLevel;
}): FullPageExtractionOutput {
  const nowIso = new Date().toISOString();
  const norm = normalizeUrl(params.sourceUrl);
  const normalizedUrl = norm ? norm.normalizedUrl : params.sourceUrl;
  const pathname = norm ? norm.pathname : '/';
  const parameters = norm ? norm.allParameters : {};

  const $ = cheerio.load(params.html || '');

  // Metadata
  const rawTitle = $('title').first().text();
  const title = rawTitle ? rawTitle.replace(/\s+/g, ' ').trim() : null;

  const rawMetaDesc =
    $('meta[name="description"], meta[name="Description"]').attr('content') ??
    $('meta[property="og:description"]').attr('content') ??
    null;
  const metaDescription = rawMetaDesc ? rawMetaDesc.replace(/\s+/g, ' ').trim() : null;

  const h1List: string[] = [];
  $('h1').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t) h1List.push(t);
  });

  const h2List: string[] = [];
  $('h2').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t) h2List.push(t);
  });

  const h3ToH6Count = $('h3, h4, h5, h6').length;

  const canonicalHref = $('link[rel="canonical"]').attr('href')?.trim() || null;
  let canonicalUrl: string | null = null;
  let normalizedCanonicalUrl: string | null = null;
  if (canonicalHref) {
    const cNorm = normalizeUrl(canonicalHref, params.finalUrl || params.sourceUrl);
    if (cNorm) {
      canonicalUrl = cNorm.originalUrl;
      normalizedCanonicalUrl = cNorm.normalizedUrl;
    } else {
      canonicalUrl = canonicalHref;
    }
  }

  const robotsMeta = $('meta[name="robots"], meta[name="googlebot"]').attr('content')?.trim() || null;
  const xRobotsTag = params.headers['x-robots-tag'] ?? null;
  const combinedRobots = `${robotsMeta ?? ''} ${xRobotsTag ?? ''}`.toLowerCase();
  const isNoindex = combinedRobots.includes('noindex');
  const isNofollow = combinedRobots.includes('nofollow');

  // Extract <html lang> and <link rel="alternate" hreflang="..."> for International / Hreflang auditing
  const htmlLang = $('html').attr('lang')?.trim() || null;
  const hreflangLocales: string[] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const hl = $(el).attr('hreflang')?.trim();
    if (hl) hreflangLocales.push(hl);
  });
  const enrichedHeaders: Record<string, string> = { ...params.headers };
  if (htmlLang && !enrichedHeaders['content-language']) {
    enrichedHeaders['content-language'] = htmlLang;
  }
  if (htmlLang) {
    enrichedHeaders['x-html-lang'] = htmlLang;
  }
  if (hreflangLocales.length > 0) {
    enrichedHeaders['x-hreflang-locales'] = Array.from(new Set(hreflangLocales)).join(', ');
    enrichedHeaders['x-hreflang-count'] = String(new Set(hreflangLocales).size);
  }

  // Extract structured data & script URLs first before stripping script/style tags for visibleText
  const rawSchemas = extractAllStructuredData($, params.sourceUrl);
  const externalScriptSrcs: string[] = [];
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src')?.trim();
    if (src) externalScriptSrcs.push(src);
  });

  // Visible text extraction (excluding script, style, noscript, svg, template) without re-parsing HTML
  $('script, style, noscript, svg, template').remove();
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim();
  const words = visibleText ? visibleText.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;

  // DOM signature for template clustering
  const topLevelTags = $('body > *')
    .map((_, el) => el.tagName?.toLowerCase() ?? '')
    .get()
    .filter(Boolean)
    .slice(0, 6)
    .join('-');
  const domHash = topLevelTags
    ? crypto.createHash('md5').update(topLevelTags).digest('hex').slice(0, 4)
    : undefined;

  // Detect DOM ecommerce signals
  const hasAddToCartButton =
    $('button[type="submit"], input[type="submit"], button, a.btn, .add-to-cart, [name="add"]')
      .filter((_, el) => /add to (cart|bag|basket)|buy now/i.test($(el).text() + ' ' + ($(el).attr('value') ?? '')))
      .length > 0;

  const visiblePriceMatch = visibleText.match(/(?:\$|£|€|₹|USD|EUR|GBP)\s*\d+(?:[.,]\d{2})?/);
  const hasProductPriceSignal =
    Boolean(visiblePriceMatch) ||
    $('[class*="price"], [id*="price"], [itemprop="price"], [data-product-price]').length > 0;

  const hasProductGridSignal =
    $('[class*="product-grid"], [class*="product-list"], [class*="collection-grid"], .products .product, .grid__item .card').length >= 2 ||
    $('a[href*="/products/"], a[href*="/product/"]').length >= 3;

  const hasArticleTag = $('article, [itemtype*="Article"], [itemtype*="BlogPosting"], .blog-post, .post-content').length > 0;

  const classification = classifyPage({
    url: params.sourceUrl,
    pathname,
    parameters,
    sitemapSource: params.sitemapSource,
    schemaTypes: rawSchemas.map((s) => s.schemaType),
    hasAddToCartButton,
    hasProductPriceSignal,
    hasProductGridSignal,
    hasArticleTag,
    domSignature: domHash,
  });

  const pageId = `${params.crawlId}:${normalizedUrl}`;

  // Build SchemaRecords with validation and visible price/availability comparison
  const visiblePriceNum = extractFirstPriceNumber($, visibleText);
  const visibleAvailability = detectVisibleAvailability($, visibleText);

  const schemas: SchemaRecord[] = rawSchemas.map((s, idx) => {
    const validation = validateSchemaRecord(
      s.schemaType,
      s.properties,
      visiblePriceNum,
      visibleAvailability
    );
    return {
      schemaId: `${pageId}:schema:${idx}:${s.schemaType}`,
      crawlId: params.crawlId,
      sourceUrl: params.sourceUrl,
      pageType: classification.pageType,
      templateId: classification.templateId,
      schemaType: s.schemaType,
      format: s.format,
      rawProperties: s.properties,
      normalizedProperties: validation.normalized,
      requiredFieldsPresent: validation.requiredPresent,
      requiredFieldsMissing: validation.requiredMissing,
      recommendedFieldsMissing: validation.recommendedMissing,
      isValid: validation.requiredMissing.length === 0,
      priceMatchesVisible: validation.priceMatchesVisible,
      availabilityMatchesVisible: validation.availabilityMatchesVisible,
      extractionMethod: params.extractionMethod,
      originalValueJson: JSON.stringify(s.properties),
      normalizedValueJson: JSON.stringify(validation.normalized),
      confidence: params.extractionMethod === 'C' ? 0.98 : 0.92,
      extractedAt: nowIso,
    };
  });

  // Extract Links (deduplicated per page by destinationNormalizedUrl, capped at 300 unique links)
  const links: LinkRecord[] = [];
  const seenLinkDests = new Set<string>();
  let outboundLinkCount = 0;
  $('a[href]').each((idx, el) => {
    if (links.length >= 300) return false;
    const rawHref = $(el).attr('href')?.trim();
    if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:') || rawHref.startsWith('#')) {
      return;
    }
    const targetNorm = normalizeUrl(rawHref, params.finalUrl || params.sourceUrl);
    if (!targetNorm) return;

    const isInternal = isSameSiteDomain(targetNorm.domain, params.siteDomain);
    if (isInternal) outboundLinkCount++;

    if (seenLinkDests.has(targetNorm.normalizedUrl)) return;
    seenLinkDests.add(targetNorm.normalizedUrl);

    const anchorText = $(el).text().replace(/\s+/g, ' ').trim() || $(el).attr('aria-label')?.trim() || $(el).find('img').attr('alt')?.trim() || '';
    const rel = ($(el).attr('rel') ?? '').toLowerCase();

    let position: LinkRecord['position'] = 'content';
    if ($(el).closest('nav, header, [role="navigation"], .site-header, .navbar, .main-menu').length > 0) {
      position = 'nav';
    } else if ($(el).closest('footer, [role="contentinfo"], .site-footer').length > 0) {
      position = 'footer';
    } else if ($(el).closest('[aria-label*="breadcrumb" i], .breadcrumb, .breadcrumbs').length > 0) {
      position = 'breadcrumb';
    } else if ($(el).closest('.product-grid, .products, .collection-grid, .product-card').length > 0) {
      position = 'product_grid';
    }

    const targetClass = isInternal
      ? classifyPage({
          url: targetNorm.originalUrl,
          pathname: targetNorm.pathname,
          parameters: targetNorm.allParameters,
        }).pageType
      : 'unknown';

    links.push({
      linkId: `${pageId}:link:${idx}`,
      crawlId: params.crawlId,
      sourceUrl: params.sourceUrl,
      destinationUrl: targetNorm.originalUrl,
      destinationNormalizedUrl: targetNorm.normalizedUrl,
      anchorText,
      linkType: isInternal ? 'internal' : 'external',
      targetPageType: targetClass,
      position,
      isNofollow: rel.includes('nofollow'),
      isBroken: false,
      statusCode: null,
      extractionMethod: params.extractionMethod,
      originalValueJson: JSON.stringify({ href: rawHref, anchorText }),
      normalizedValueJson: JSON.stringify({ destinationNormalizedUrl: targetNorm.normalizedUrl, position }),
      confidence: 0.95,
      extractedAt: nowIso,
    });
  });

  // Extract Images (deduplicated per page by imageUrl, capped at 100 unique images)
  const images: ImageRecord[] = [];
  const seenImgUrls = new Set<string>();
  $('img').each((idx, el) => {
    if (images.length >= 100) return false;
    const rawSrc =
      $(el).attr('src')?.trim() ||
      $(el).attr('data-src')?.trim() ||
      $(el).attr('srcset')?.split(',')[0]?.trim().split(/\s+/)[0] ||
      '';
    if (!rawSrc || rawSrc.startsWith('data:')) return;

    const imgNorm = normalizeUrl(rawSrc, params.finalUrl || params.sourceUrl);
    const imageUrl = imgNorm ? imgNorm.originalUrl : rawSrc;
    if (seenImgUrls.has(imageUrl)) return;
    seenImgUrls.add(imageUrl);

    const altAttr = $(el).attr('alt');
    const altText = altAttr !== undefined ? altAttr.replace(/\s+/g, ' ').trim() : '';
    const hasAlt = Boolean(altAttr && altText.length > 0);
    const widthAttr = parseInt($(el).attr('width') ?? '', 10);
    const heightAttr = parseInt($(el).attr('height') ?? '', 10);
    const loadingAttr = ($(el).attr('loading') ?? '').toLowerCase();
    const isLazyLoaded = loadingAttr === 'lazy' || Boolean($(el).attr('data-src')) || ($(el).attr('class') ?? '').includes('lazy');

    const extMatch = imageUrl.match(/\.(webp|avif|jpg|jpeg|png|gif|svg)(?:\?|$)/i);
    const format = extMatch ? extMatch[1].toLowerCase() : 'unknown';

    images.push({
      imageId: `${pageId}:img:${idx}`,
      crawlId: params.crawlId,
      sourceUrl: params.sourceUrl,
      imageUrl,
      altText,
      hasAlt,
      width: !isNaN(widthAttr) ? widthAttr : null,
      height: !isNaN(heightAttr) ? heightAttr : null,
      format,
      weightBytes: null,
      isLazyLoaded,
      extractionMethod: params.extractionMethod,
      originalValueJson: JSON.stringify({ src: rawSrc, alt: altAttr ?? null }),
      normalizedValueJson: JSON.stringify({ imageUrl, hasAlt, format, isLazyLoaded }),
      confidence: 0.95,
      extractedAt: nowIso,
    });
  });

  // Build PageRecord
  const pageRecord: PageRecord = {
    pageId,
    crawlId: params.crawlId,
    sourceUrl: params.sourceUrl,
    normalizedUrl,
    pageType: classification.pageType,
    classificationConfidence: classification.confidence,
    classificationSignals: classification.signals,
    templateId: classification.templateId,
    status: params.status,
    redirectDestination: params.redirectChain.length > 0 ? params.redirectChain[params.redirectChain.length - 1] : null,
    redirectChain: params.redirectChain,
    discoverySource: params.discoverySource,
    sitemapSource: params.sitemapSource,
    lastmod: params.lastmod,
    parameters,
    canonicalUrl,
    normalizedCanonicalUrl,
    title,
    metaDescription,
    h1List,
    h2List,
    h3ToH6Count,
    robotsMeta,
    xRobotsTag,
    isNoindex,
    isNofollow,
    visibleText: visibleText.slice(0, 10000),
    wordCount,
    contentLength: Buffer.byteLength(params.html || '', 'utf-8'),
    responseHeaders: enrichedHeaders,
    contentFingerprint: params.fingerprint,
    etag: params.headers['etag'] ?? null,
    lastModifiedHeader: params.headers['last-modified'] ?? null,
    depth: params.depth,
    inboundLinkCount: 0,
    outboundLinkCount,
    inSitemap: params.inSitemap,
    inNav: params.inNav,
    extractionMethod: params.extractionMethod,
    originalValueJson: JSON.stringify({
      rawTitle,
      rawMetaDesc,
      canonicalHref,
      robotsMeta,
    }),
    normalizedValueJson: JSON.stringify({
      normalizedUrl,
      pageType: classification.pageType,
      templateId: classification.templateId,
      title,
      metaDescription,
      isNoindex,
    }),
    confidence: classification.confidence,
    extractedAt: nowIso,
  };

  // Extract Product + Variants if product page or has Product / ProductGroup schema
  let product: ProductRecord | null = null;
  let variants: VariantRecord[] = [];
  if (
    classification.pageType === 'product' ||
    schemas.some((s) => s.schemaType === 'Product' || s.schemaType === 'ProductGroup')
  ) {
    const prodRes = extractProductAndVariants({
      $,
      crawlId: params.crawlId,
      sourceUrl: params.sourceUrl,
      normalizedUrl,
      templateId: classification.templateId,
      title: h1List[0] || title || normalizedUrl,
      visibleText,
      visiblePriceNum,
      visibleAvailability,
      images,
      schemas,
      links,
      extractionMethod: params.extractionMethod,
      nowIso,
    });
    product = prodRes.product;
    variants = prodRes.variants;
  }

  // Extract Collection if collection or category page
  let collection: CollectionRecord | null = null;
  if (classification.pageType === 'collection' || classification.pageType === 'category') {
    collection = extractCollectionRecord({
      $,
      crawlId: params.crawlId,
      sourceUrl: params.sourceUrl,
      normalizedUrl,
      pathname,
      templateId: classification.templateId,
      title,
      metaDescription,
      h1List,
      canonicalUrl,
      links,
      extractionMethod: params.extractionMethod,
      nowIso,
    });
  }

  // Extract Content if blog or informational page
  let content: ContentRecord | null = null;
  if (classification.pageType === 'blog' || classification.pageType === 'informational') {
    content = extractContentRecord({
      $,
      crawlId: params.crawlId,
      sourceUrl: params.sourceUrl,
      normalizedUrl,
      pathname,
      title: h1List[0] || title || normalizedUrl,
      metaDescription,
      h2List,
      visibleText,
      wordCount,
      schemas,
      links,
      extractionMethod: params.extractionMethod,
      nowIso,
    });
  }

  // Extract Technologies
  const technologies = extractTechnologies({
    externalScriptSrcs,
    html: params.html,
    headers: params.headers,
    crawlId: params.crawlId,
    sourceUrl: params.sourceUrl,
    siteDomain: params.siteDomain,
    extractionMethod: params.extractionMethod,
    nowIso,
  });

  // Extract Conversion & Performance & Faceted Observations
  const observations = extractObservations({
    $,
    externalScriptSrcs,
    html: params.html,
    headers: params.headers,
    crawlId: params.crawlId,
    sourceUrl: params.sourceUrl,
    templateId: classification.templateId,
    pageType: classification.pageType,
    images,
    technologies,
    extractionMethod: params.extractionMethod,
    nowIso,
  });

  return {
    page: pageRecord,
    links,
    images,
    schemas,
    product,
    variants,
    collection,
    content,
    technologies,
    observations,
  };
}

interface RawExtractedSchema {
  schemaType: string;
  format: 'json-ld' | 'microdata' | 'rdfa';
  properties: Record<string, unknown>;
}

function extractAllStructuredData($: cheerio.CheerioAPI, _sourceUrl: string): RawExtractedSchema[] {
  const results: RawExtractedSchema[] = [];

  // 1. JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html()?.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const items = flattenJsonLdItems(parsed);
      for (const item of items) {
        const rawType = item['@type'];
        const types = Array.isArray(rawType) ? rawType.map(String) : rawType ? [String(rawType)] : [];
        for (const t of types) {
          const cleanType = t.replace(/^https?:\/\/schema\.org\//i, '');
          results.push({
            schemaType: cleanType,
            format: 'json-ld',
            properties: item,
          });
          // Unpack ProductGroup -> synthesized Product + Offer + AggregateRating so all tools inspect variants & rich results
          if (cleanType === 'ProductGroup') {
            const variantsArr = Array.isArray(item.hasVariant)
              ? (item.hasVariant as Record<string, unknown>[])
              : [];
            const inStockVar = variantsArr.find((v) => {
              const off = (Array.isArray(v.offers) ? v.offers[0] : v.offers) as Record<string, unknown> | undefined;
              return String(off?.availability ?? '').toLowerCase().includes('instock');
            });
            const firstVar = inStockVar ?? variantsArr[0] ?? {};
            const mergedProd: Record<string, unknown> = {
              ...firstVar,
              name: item.name ?? firstVar.name,
              description: item.description ?? firstVar.description,
              brand: item.brand ?? firstVar.brand,
              sku: firstVar.sku ?? item.productGroupID ?? item.sku,
              image: item.image ?? firstVar.image,
              offers: firstVar.offers ?? item.offers,
              aggregateRating: item.aggregateRating ?? firstVar.aggregateRating,
              hasVariant: variantsArr,
            };
            results.push({
              schemaType: 'Product',
              format: 'json-ld',
              properties: mergedProd,
            });
            if (mergedProd.offers && typeof mergedProd.offers === 'object') {
              const offersArr = Array.isArray(mergedProd.offers) ? mergedProd.offers : [mergedProd.offers];
              for (const off of offersArr) {
                if (off && typeof off === 'object') {
                  results.push({
                    schemaType: 'Offer',
                    format: 'json-ld',
                    properties: off as Record<string, unknown>,
                  });
                }
              }
            }
            if (mergedProd.aggregateRating && typeof mergedProd.aggregateRating === 'object') {
              results.push({
                schemaType: 'AggregateRating',
                format: 'json-ld',
                properties: mergedProd.aggregateRating as Record<string, unknown>,
              });
            }
          }
          // Also unpack embedded Offer and AggregateRating from Product so Tool 3 inspects them directly
          if (cleanType === 'Product') {
            if (item.offers && typeof item.offers === 'object') {
              const offersArr = Array.isArray(item.offers) ? item.offers : [item.offers];
              for (const off of offersArr) {
                if (off && typeof off === 'object') {
                  results.push({
                    schemaType: 'Offer',
                    format: 'json-ld',
                    properties: off as Record<string, unknown>,
                  });
                }
              }
            }
            if (item.aggregateRating && typeof item.aggregateRating === 'object') {
              results.push({
                schemaType: 'AggregateRating',
                format: 'json-ld',
                properties: item.aggregateRating as Record<string, unknown>,
              });
            }
          }
        }
      }
    } catch {
      results.push({
        schemaType: 'InvalidJsonLd',
        format: 'json-ld',
        properties: { parseError: true, rawSnippet: raw.slice(0, 200) },
      });
    }
  });

  // 2. Microdata
  $('[itemscope][itemtype]').each((_, el) => {
    const itemtype = $(el).attr('itemtype')?.trim() ?? '';
    const cleanType = itemtype.replace(/^https?:\/\/schema\.org\//i, '').split('/').pop() || 'Thing';
    const props: Record<string, unknown> = {};
    $(el)
      .find('[itemprop]')
      .each((__, propEl) => {
        const propName = $(propEl).attr('itemprop')?.trim();
        if (!propName) return;
        const val =
          $(propEl).attr('content') ??
          $(propEl).attr('href') ??
          $(propEl).attr('src') ??
          $(propEl).text().replace(/\s+/g, ' ').trim();
        props[propName] = val;
      });
    results.push({
      schemaType: cleanType,
      format: 'microdata',
      properties: props,
    });
  });

  // 3. RDFa
  $('[typeof]').each((_, el) => {
    const rdfType = $(el).attr('typeof')?.trim() ?? '';
    const cleanType = rdfType.replace(/^schema:/i, '');
    const props: Record<string, unknown> = {};
    $(el)
      .find('[property]')
      .each((__, propEl) => {
        const propName = ($(propEl).attr('property') ?? '').replace(/^schema:/i, '').trim();
        if (!propName) return;
        const val = $(propEl).attr('content') ?? $(propEl).text().replace(/\s+/g, ' ').trim();
        props[propName] = val;
      });
    if (cleanType && Object.keys(props).length > 0) {
      results.push({
        schemaType: cleanType,
        format: 'rdfa',
        properties: props,
      });
    }
  });

  return results;
}

function flattenJsonLdItems(input: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (!input) return out;
  if (Array.isArray(input)) {
    for (const item of input) {
      out.push(...flattenJsonLdItems(item));
    }
    return out;
  }
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj['@graph'])) {
      out.push(...flattenJsonLdItems(obj['@graph']));
    }
    if (obj['@type']) {
      out.push(obj);
    }
  }
  return out;
}

const SCHEMA_REQUIREMENTS: Record<string, { required: string[]; recommended: string[] }> = {
  Product: {
    required: ['name', 'offers'],
    recommended: ['image', 'description', 'sku', 'brand', 'aggregateRating'],
  },
  ProductGroup: {
    required: ['name', 'hasVariant'],
    recommended: ['description', 'brand', 'productGroupID'],
  },
  Offer: {
    required: ['price', 'priceCurrency', 'availability'],
    recommended: ['url', 'priceValidUntil', 'itemCondition'],
  },
  AggregateRating: {
    required: ['ratingValue', 'reviewCount'],
    recommended: ['bestRating', 'worstRating'],
  },
  BreadcrumbList: {
    required: ['itemListElement'],
    recommended: [],
  },
  Organization: {
    required: ['name', 'url'],
    recommended: ['logo', 'sameAs', 'contactPoint'],
  },
  WebSite: {
    required: ['name', 'url'],
    recommended: ['potentialAction'],
  },
  Article: {
    required: ['headline', 'datePublished', 'author'],
    recommended: ['dateModified', 'image', 'publisher'],
  },
  BlogPosting: {
    required: ['headline', 'datePublished', 'author'],
    recommended: ['dateModified', 'image', 'publisher'],
  },
};

function validateSchemaRecord(
  schemaType: string,
  props: Record<string, unknown>,
  visiblePrice: number | null,
  visibleAvailability: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown'
): {
  normalized: Record<string, unknown>;
  requiredPresent: string[];
  requiredMissing: string[];
  recommendedMissing: string[];
  priceMatchesVisible: boolean | null;
  availabilityMatchesVisible: boolean | null;
} {
  if (schemaType === 'InvalidJsonLd') {
    return {
      normalized: props,
      requiredPresent: [],
      requiredMissing: ['validJsonSyntax'],
      recommendedMissing: [],
      priceMatchesVisible: null,
      availabilityMatchesVisible: null,
    };
  }

  const spec = SCHEMA_REQUIREMENTS[schemaType] ?? { required: ['name'], recommended: [] };
  const requiredPresent: string[] = [];
  const requiredMissing: string[] = [];
  const recommendedMissing: string[] = [];

  for (const req of spec.required) {
    const val = props[req];
    // For AggregateRating, ratingCount is also accepted in place of reviewCount
    if (req === 'reviewCount' && (val !== undefined || props['ratingCount'] !== undefined)) {
      requiredPresent.push(req);
    } else if (val !== undefined && val !== null && val !== '') {
      requiredPresent.push(req);
    } else {
      requiredMissing.push(req);
    }
  }

  for (const rec of spec.recommended) {
    const val = props[rec];
    if (val === undefined || val === null || val === '') {
      recommendedMissing.push(rec);
    }
  }

  let priceMatchesVisible: boolean | null = null;
  let availabilityMatchesVisible: boolean | null = null;

  if (schemaType === 'Offer' || schemaType === 'Product') {
    const offerObj =
      schemaType === 'Offer'
        ? props
        : Array.isArray(props.offers)
          ? (props.offers[0] as Record<string, unknown> | undefined)
          : (props.offers as Record<string, unknown> | undefined);

    if (offerObj && typeof offerObj === 'object') {
      const schemaPriceRaw = offerObj.price ?? offerObj.lowPrice;
      const schemaPrice = schemaPriceRaw !== undefined ? parseFloat(String(schemaPriceRaw)) : NaN;
      if (!isNaN(schemaPrice) && visiblePrice !== null) {
        priceMatchesVisible = Math.abs(schemaPrice - visiblePrice) < 0.05;
      }

      const schemaAvailRaw = String(offerObj.availability ?? '').toLowerCase();
      if (schemaAvailRaw && visibleAvailability !== 'unknown') {
        const schemaInStock = schemaAvailRaw.includes('instock');
        const schemaOut = schemaAvailRaw.includes('outofstock') || schemaAvailRaw.includes('soldout');
        if (schemaInStock) {
          availabilityMatchesVisible = visibleAvailability === 'in_stock';
        } else if (schemaOut) {
          availabilityMatchesVisible = visibleAvailability === 'out_of_stock';
        }
      }
    }
  }

  return {
    normalized: {
      schemaType,
      requiredPresent,
      requiredMissing,
      recommendedMissing,
    },
    requiredPresent,
    requiredMissing,
    recommendedMissing,
    priceMatchesVisible,
    availabilityMatchesVisible,
  };
}

function extractFirstPriceNumber($: cheerio.CheerioAPI, visibleText: string): number | null {
  const priceAttr =
    $('[itemprop="price"]').attr('content') ||
    $('meta[property="product:price:amount"], meta[property="og:price:amount"]').attr('content') ||
    $('[data-product-price]').attr('data-product-price');
  if (priceAttr) {
    const parsed = parseFloat(priceAttr.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  const priceElText = $(
    '[data-testid*="price" i], .price, .product-price, .product__price, .price-item--regular, .woocommerce-Price-amount'
  )
    .first()
    .text();
  if (priceElText) {
    const match = priceElText.match(/(?:\$|£|€|₹|USD\s*)\s*(\d{1,6}(?:[.,]\d{2})?)/);
    if (match) {
      const num = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(num)) return num;
    }
  }
  const cleanedText = visibleText.replace(/(?:free\s+(?:standard\s+)?(?:shipping|delivery)\s+(?:on\s+orders\s+)?over\s+)(?:\$|£|€|₹|USD\s*)\s*\d+(?:[.,]\d{2})?/gi, '');
  const fallbackMatch = cleanedText.match(/(?:\$|£|€|₹|USD\s*)\s*(\d{1,6}(?:[.,]\d{2})?)/);
  if (fallbackMatch) {
    const num = parseFloat(fallbackMatch[1].replace(',', '.'));
    if (!isNaN(num)) return num;
  }
  return null;
}

function detectVisibleAvailability(
  $: cheerio.CheerioAPI,
  visibleText: string
): 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown' {
  const primaryBtnText = $(
    'button[type="submit"], .add-to-cart, [name="add"], .product-form__submit, [data-testid*="add-to" i]'
  )
    .text()
    .toLowerCase();
  if (
    primaryBtnText.includes('sold out') ||
    primaryBtnText.includes('out of stock') ||
    primaryBtnText.includes('unavailable')
  ) {
    return 'out_of_stock';
  }
  if (primaryBtnText.includes('pre-order') || primaryBtnText.includes('preorder')) {
    return 'preorder';
  }
  if (
    primaryBtnText.includes('add to cart') ||
    primaryBtnText.includes('add to bag') ||
    primaryBtnText.includes('add to basket') ||
    primaryBtnText.includes('buy now')
  ) {
    return 'in_stock';
  }
  const allBtnsText = $('button').text().toLowerCase();
  if (allBtnsText.includes('add to bag') || allBtnsText.includes('add to cart') || allBtnsText.includes('add to basket')) {
    return 'in_stock';
  }
  const lower = visibleText.toLowerCase();
  if (lower.includes('add to bag') || lower.includes('add to cart') || lower.includes('in stock')) return 'in_stock';
  if (lower.includes('out of stock') || lower.includes('currently unavailable')) return 'out_of_stock';
  return 'unknown';
}

function extractProductAndVariants(params: {
  $: cheerio.CheerioAPI;
  crawlId: string;
  sourceUrl: string;
  normalizedUrl: string;
  templateId: string;
  title: string;
  visibleText: string;
  visiblePriceNum: number | null;
  visibleAvailability: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  images: ImageRecord[];
  schemas: SchemaRecord[];
  links: LinkRecord[];
  extractionMethod: ExtractionLevel;
  nowIso: string;
}): { product: ProductRecord; variants: VariantRecord[] } {
  const { $ } = params;
  const productSchema = params.schemas.find((s) => s.schemaType === 'Product')?.rawProperties ?? {};
  const offerSchema = params.schemas.find((s) => s.schemaType === 'Offer')?.rawProperties ?? {};
  const ratingSchema = params.schemas.find((s) => s.schemaType === 'AggregateRating')?.rawProperties ?? {};

  const sku =
    (productSchema.sku ? String(productSchema.sku) : null) ||
    $('[itemprop="sku"], .sku, [data-product-sku]').first().text().trim() ||
    null;

  let brand: string | null = null;
  if (productSchema.brand) {
    if (typeof productSchema.brand === 'object' && productSchema.brand !== null) {
      brand = String((productSchema.brand as Record<string, unknown>).name ?? '');
    } else {
      brand = String(productSchema.brand);
    }
  }
  if (!brand) {
    brand = $('[itemprop="brand"], .product-vendor, .product__vendor').first().text().trim() || null;
  }

  const schemaPrice = offerSchema.price ? parseFloat(String(offerSchema.price)) : null;
  const price =
    schemaPrice !== null && !isNaN(schemaPrice) && schemaPrice > 0
      ? schemaPrice
      : params.visiblePriceNum;

  let originalPrice: number | null = null;
  const compareText = $(
    '.compare-at-price, .price--compare, del .amount, s.price-item--regular, .was-price, [data-compare-price], [data-testid*="compare" i], [data-testid*="was" i], [class*="compare-price" i], [class*="was-price" i]'
  )
    .first()
    .text();
  const compareMatch = compareText.match(/(\d{1,6}(?:[.,]\d{2})?)/);
  if (compareMatch) {
    const parsedCompare = parseFloat(compareMatch[1].replace(',', '.'));
    if (!isNaN(parsedCompare) && price !== null && parsedCompare > price) {
      originalPrice = parsedCompare;
    }
  }

  const discountPercentage =
    price !== null && originalPrice !== null && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : null;

  const currency =
    (offerSchema.priceCurrency ? String(offerSchema.priceCurrency) : null) ||
    $('meta[property="product:price:currency"], meta[property="og:price:currency"]').attr('content') ||
    (params.visibleText.includes('£') ? 'GBP' : params.visibleText.includes('€') ? 'EUR' : 'USD');

  let availability = params.visibleAvailability;
  if (availability === 'unknown' && offerSchema.availability) {
    const av = String(offerSchema.availability).toLowerCase();
    if (av.includes('instock')) availability = 'in_stock';
    else if (av.includes('outofstock')) availability = 'out_of_stock';
    else if (av.includes('preorder')) availability = 'preorder';
  }

  const descDomText = $(
    '.product-description, .product__description, #description, [itemprop="description"], .woocommerce-product-details__short-description, [data-testid*="description" i], [class*="product-description" i]'
  )
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  const descriptionText =
    descDomText ||
    (productSchema.description ? String(productSchema.description).replace(/\s+/g, ' ').trim() : '');
  const descriptionWordCount = descriptionText ? descriptionText.split(/\s+/).filter(Boolean).length : 0;

  // Specifications extraction (HTML tables, definition lists, JSON-LD properties, and feature bullet lists)
  const specs: Record<string, string> = {};
  $('table.shop_attributes tr, .product-specs tr, .specifications tr, table tr').each((_, tr) => {
    const cells = $(tr).find('th, td');
    if (cells.length >= 2) {
      const k = $(cells[0]).text().replace(/\s+/g, ' ').trim();
      const v = $(cells[1]).text().replace(/\s+/g, ' ').trim();
      if (k && v && k.length < 60 && v.length < 200) {
        specs[k] = v;
      }
    }
  });
  $('dl dt').each((_, dt) => {
    const k = $(dt).text().replace(/\s+/g, ' ').trim();
    const v = $(dt).next('dd').text().replace(/\s+/g, ' ').trim();
    if (k && v) specs[k] = v;
  });
  if (Array.isArray(productSchema.additionalProperty)) {
    for (const prop of productSchema.additionalProperty as Record<string, unknown>[]) {
      if (prop && prop.name && prop.value) {
        specs[String(prop.name)] = String(prop.value);
      }
    }
  }
  for (const schemaKey of ['material', 'color', 'pattern', 'weight', 'category']) {
    if (productSchema[schemaKey] && typeof productSchema[schemaKey] === 'string') {
      specs[schemaKey] = String(productSchema[schemaKey]);
    }
  }
  if (Object.keys(specs).length < 2) {
    $(
      '.product-description li, .product__description li, [data-testid*="description" i] li, details li, [class*="accordion" i] li'
    ).each((idx, li) => {
      if (Object.keys(specs).length >= 8) return false;
      const text = $(li).text().replace(/\s+/g, ' ').trim();
      if (text && text.length >= 4 && text.length <= 140) {
        const colonIdx = text.indexOf(':');
        if (colonIdx > 1 && colonIdx < 40) {
          specs[text.slice(0, colonIdx).trim()] = text.slice(colonIdx + 1).trim();
        } else {
          specs[`Feature ${idx + 1}`] = text;
        }
      }
    });
  }
  const specsCount = Object.keys(specs).length;

  const imageCount = params.images.length;
  const imagesWithAltCount = params.images.filter((i) => i.hasAlt).length;

  const hasProductSchema = params.schemas.some((s) => s.schemaType === 'Product');
  const hasOfferSchema = params.schemas.some((s) => s.schemaType === 'Offer');
  const hasAggregateRatingSchema = params.schemas.some((s) => s.schemaType === 'AggregateRating');

  const reviewCountRaw = ratingSchema.reviewCount ?? ratingSchema.ratingCount;
  const reviewCount = reviewCountRaw ? parseInt(String(reviewCountRaw), 10) || 0 : 0;
  const ratingValueRaw = ratingSchema.ratingValue;
  const ratingValue = ratingValueRaw ? parseFloat(String(ratingValueRaw)) || null : null;
  const hasReviews =
    reviewCount > 0 ||
    hasAggregateRatingSchema ||
    $('[class*="review"], #reviews, .jdgm-rev-widg, .yotpo-main-widget, [data-testid*="review" i]').length > 0;

  const relatedProductsCount = $(
    '.related-products a[href*="/product"], .product-recommendations a[href*="/product"], section.related a, [data-testid*="recommend" i] a[href*="/product"], [data-testid*="related" i] a[href*="/product"], [class*="recommend" i] a[href*="/product"]'
  ).length;

  const hasBundleOrSubscription =
    /subscribe\s*&?\s*save|subscription|bundle\s*&?\s*save|frequently bought together/i.test(params.visibleText);

  // Extract Variants from select options, swatches, or JSON-LD ProductGroup hasVariant
  const variants: VariantRecord[] = [];
  const productId = `${params.crawlId}:prod:${params.normalizedUrl}`;
  if (Array.isArray(productSchema.hasVariant)) {
    (productSchema.hasVariant as Record<string, unknown>[]).forEach((vObj, idx) => {
      const vTitle = String(vObj.name ?? vObj.sku ?? `Variant ${idx + 1}`);
      const vSku = vObj.sku ? String(vObj.sku) : null;
      const vOffer = (Array.isArray(vObj.offers) ? vObj.offers[0] : vObj.offers) as Record<string, unknown> | undefined;
      const vPriceRaw = vOffer?.price ? parseFloat(String(vOffer.price)) : null;
      const vAvailStr = String(vOffer?.availability ?? '').toLowerCase();
      const vAvailable = vAvailStr ? vAvailStr.includes('instock') : true;
      variants.push({
        variantId: `${productId}:var:${idx}`,
        crawlId: params.crawlId,
        productId,
        sourceUrl: params.sourceUrl,
        title: vTitle,
        sku: vSku,
        attributes: {
          ...(vObj.size ? { size: String(vObj.size) } : {}),
          ...(vObj.color ? { color: String(vObj.color) } : {}),
        },
        price: vPriceRaw !== null && !isNaN(vPriceRaw) ? vPriceRaw : price,
        available: vAvailable,
        extractionMethod: params.extractionMethod,
        originalValueJson: JSON.stringify({ sku: vSku, name: vTitle }),
        normalizedValueJson: JSON.stringify({ title: vTitle, available: vAvailable }),
        confidence: 0.96,
        extractedAt: params.nowIso,
      });
    });
  }
  $('select[name*="id"], select[id*="variant"], .product-form__input select option, select.variation-select option').each(
    (idx, opt) => {
      if (opt.tagName?.toLowerCase() !== 'option') return;
      const valText = $(opt).text().replace(/\s+/g, ' ').trim();
      if (!valText || /select|choose/i.test(valText)) return;
      const disabled = $(opt).attr('disabled') !== undefined;
      variants.push({
        variantId: `${productId}:var:${idx}`,
        crawlId: params.crawlId,
        productId,
        sourceUrl: params.sourceUrl,
        title: valText,
        sku: $(opt).attr('data-sku') ?? null,
        attributes: { option: valText },
        price,
        available: !disabled && !/sold out|unavailable/i.test(valText),
        extractionMethod: params.extractionMethod,
        originalValueJson: JSON.stringify({ text: valText, disabled }),
        normalizedValueJson: JSON.stringify({ title: valText, available: !disabled }),
        confidence: 0.9,
        extractedAt: params.nowIso,
      });
    }
  );

  // Completeness Scoring (0-100 across 8 dimensions per Tool 4)
  const missingFields: string[] = [];
  let points = 0;

  if (descriptionWordCount >= 30) points += 20;
  else if (descriptionWordCount > 0) {
    points += 10;
    missingFields.push('detailed_description (<30 words)');
  } else {
    missingFields.push('description');
  }

  if (specsCount >= 2) points += 15;
  else missingFields.push('specifications');

  if (imageCount >= 2) points += 15;
  else if (imageCount === 1) {
    points += 8;
    missingFields.push('multiple_images');
  } else {
    missingFields.push('images');
  }

  if (imageCount > 0 && imagesWithAltCount === imageCount) points += 15;
  else missingFields.push('image_alt_text');

  if (hasProductSchema && hasOfferSchema) points += 15;
  else missingFields.push('complete_product_schema');

  if (hasReviews) points += 10;
  else missingFields.push('reviews');

  if (sku && brand) points += 5;
  else missingFields.push('sku_or_brand');

  if (relatedProductsCount > 0 || variants.length > 0) points += 5;
  else missingFields.push('related_products_or_variants');

  const breadcrumbs = $('.breadcrumb a, [aria-label*="breadcrumb" i] a')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t && !/^home$/i.test(t));

  const product: ProductRecord = {
    productId,
    crawlId: params.crawlId,
    sourceUrl: params.sourceUrl,
    normalizedUrl: params.normalizedUrl,
    title: String(productSchema.name ?? params.title),
    sku,
    brand,
    price,
    originalPrice,
    currency,
    discountPercentage,
    availability,
    descriptionText,
    descriptionWordCount,
    specsCount,
    specs,
    imageCount,
    imagesWithAltCount,
    hasProductSchema,
    hasOfferSchema,
    hasAggregateRatingSchema,
    hasReviews,
    reviewCount,
    ratingValue,
    relatedProductsCount,
    variantCount: variants.length,
    hasBundleOrSubscription,
    categoryName: breadcrumbs[0] ?? null,
    templateId: params.templateId,
    completenessScore: points,
    missingFields,
    extractionMethod: params.extractionMethod,
    originalValueJson: JSON.stringify({
      schemaName: productSchema.name,
      visiblePrice: params.visiblePriceNum,
      sku,
      brand,
    }),
    normalizedValueJson: JSON.stringify({
      price,
      originalPrice,
      discountPercentage,
      availability,
      completenessScore: points,
    }),
    confidence: hasProductSchema ? 0.96 : 0.82,
    extractedAt: params.nowIso,
  };

  return { product, variants };
}

function extractCollectionRecord(params: {
  $: cheerio.CheerioAPI;
  crawlId: string;
  sourceUrl: string;
  normalizedUrl: string;
  pathname: string;
  templateId: string;
  title: string | null;
  metaDescription: string | null;
  h1List: string[];
  canonicalUrl: string | null;
  links: LinkRecord[];
  extractionMethod: ExtractionLevel;
  nowIso: string;
}): CollectionRecord {
  const { $ } = params;
  const pathSegments = params.pathname.split('/').filter(Boolean);
  const name = params.h1List[0] || params.title || pathSegments[pathSegments.length - 1] || 'Collection';
  const parentCategory = pathSegments.length > 2 ? pathSegments[pathSegments.length - 2] : null;

  const introDesc = $(
    '.collection-description, .category-description, .collection-hero__description, .term-description, .collection__description, [data-testid*="collection-description" i], [data-testid*="category-description" i], [class*="collection-description" i], [class*="category-description" i]'
  )
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  const descriptionWordCount = introDesc ? introDesc.split(/\s+/).filter(Boolean).length : 0;
  const hasIntroContent = descriptionWordCount >= 15;

  const productLinksOnPage = params.links.filter((l) => l.targetPageType === 'product');
  const productCardsCount = $(
    '.product-card, .grid__item .card, .product-item, li.product, [data-product-id], [data-testid*="product-card" i], article[class*="product" i]'
  ).length;
  const productCount = Math.max(productCardsCount, new Set(productLinksOnPage.map((l) => l.destinationNormalizedUrl)).size);

  const filterFacets: string[] = [];
  $(
    '.facets__summary, .filter-group__title, .widget_layered_nav .widget-title, [data-filter-label], .facet-checkbox, [data-testid*="filter" i], [class*="filter" i] button, [aria-label*="filter" i]'
  ).each((_, el) => {
    const label = $(el).text().replace(/\s+/g, ' ').trim();
    if (label && label.length >= 2 && label.length < 45) filterFacets.push(label);
  });
  const hasFilters =
    filterFacets.length > 0 ||
    $('form.facets, .collection-filters, [id*="FacetFiltersForm"], .woocommerce-widget-layered-nav, [data-testid*="filter" i], button[aria-label*="filter" i]').length > 0;

  const hasSorting =
    $('select[name="sort_by"], select.orderby, [id*="SortBy"], [data-testid*="sort" i], button[aria-label*="sort" i], [class*="sort" i] select').length > 0;

  let paginationType: CollectionRecord['paginationType'] = 'none';
  if ($('.pagination, nav[aria-label*="pagination" i], a[href*="page="]').length > 0) {
    paginationType = 'numbered';
  } else if ($('[data-infinite-scroll], .load-more, button:contains("Load More")').length > 0) {
    paginationType = 'infinite_or_load_more';
  }

  let score = 0;
  if (params.title) score += 20;
  if (params.metaDescription) score += 20;
  if (params.h1List.length === 1) score += 20;
  if (hasIntroContent) score += 25;
  if (productCount > 0) score += 15;

  return {
    collectionId: `${params.crawlId}:col:${params.normalizedUrl}`,
    crawlId: params.crawlId,
    sourceUrl: params.sourceUrl,
    normalizedUrl: params.normalizedUrl,
    name,
    parentCategory,
    hierarchyPath: pathSegments,
    descriptionText: introDesc,
    descriptionWordCount,
    productCount,
    hasIntroContent,
    hasMetaTitle: Boolean(params.title),
    hasMetaDescription: Boolean(params.metaDescription),
    hasH1: params.h1List.length > 0,
    hasFilters,
    filterFacets: Array.from(new Set(filterFacets)).slice(0, 15),
    hasSorting,
    paginationType,
    canonicalUrl: params.canonicalUrl,
    inboundLinkCount: 0,
    templateId: params.templateId,
    completenessScore: score,
    extractionMethod: params.extractionMethod,
    originalValueJson: JSON.stringify({ name, introDesc }),
    normalizedValueJson: JSON.stringify({ productCount, hasIntroContent, completenessScore: score }),
    confidence: 0.9,
    extractedAt: params.nowIso,
  };
}

function extractContentRecord(params: {
  $: cheerio.CheerioAPI;
  crawlId: string;
  sourceUrl: string;
  normalizedUrl: string;
  pathname: string;
  title: string;
  metaDescription: string | null;
  h2List: string[];
  visibleText: string;
  wordCount: number;
  schemas: SchemaRecord[];
  links: LinkRecord[];
  extractionMethod: ExtractionLevel;
  nowIso: string;
}): ContentRecord {
  const { $ } = params;
  const articleSchema = params.schemas.find(
    (s) => s.schemaType === 'Article' || s.schemaType === 'BlogPosting' || s.schemaType === 'NewsArticle'
  )?.rawProperties;

  let author: string | null = null;
  if (articleSchema?.author) {
    if (typeof articleSchema.author === 'object' && articleSchema.author !== null) {
      author = String((articleSchema.author as Record<string, unknown>).name ?? '');
    } else {
      author = String(articleSchema.author);
    }
  }
  if (!author) {
    author =
      $('meta[name="author"]').attr('content')?.trim() ||
      $('[rel="author"], .author-name, .article__author').first().text().trim() ||
      null;
  }

  const publishedDate =
    (articleSchema?.datePublished ? String(articleSchema.datePublished) : null) ||
    $('meta[property="article:published_time"], time[datetime]').first().attr('content') ||
    $('time[datetime]').first().attr('datetime') ||
    null;

  const modifiedDate =
    (articleSchema?.dateModified ? String(articleSchema.dateModified) : null) ||
    $('meta[property="article:modified_time"]').attr('content') ||
    publishedDate;

  let freshnessDays: number | null = null;
  const refDateStr = modifiedDate || publishedDate;
  if (refDateStr) {
    const parsedTime = Date.parse(refDateStr);
    if (!isNaN(parsedTime)) {
      freshnessDays = Math.max(0, Math.round((Date.now() - parsedTime) / (1000 * 86400)));
    }
  }

  const segments = params.pathname.split('/').filter(Boolean);
  const categoryTopic = segments.length >= 2 ? segments[1] : segments[0] || 'general';

  // Deterministic keyword extraction (exact term frequencies from title, H2s, and body)
  const termCounts = new Map<string, number>();
  const combinedSource = `${params.title} ${params.h2List.join(' ')} ${params.visibleText}`.toLowerCase();
  const tokens = combinedSource.match(/[a-z]{4,}/g) ?? [];
  for (const tok of tokens) {
    if (STOPWORDS.has(tok)) continue;
    termCounts.set(tok, (termCounts.get(tok) ?? 0) + 1);
  }
  const extractedKeywords = Array.from(termCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term]) => term);

  const internalLinks = params.links.filter((l) => l.linkType === 'internal');
  const productLinks = Array.from(
    new Set(internalLinks.filter((l) => l.targetPageType === 'product').map((l) => l.destinationNormalizedUrl))
  );
  const categoryLinks = Array.from(
    new Set(
      internalLinks
        .filter((l) => l.targetPageType === 'collection' || l.targetPageType === 'category')
        .map((l) => l.destinationNormalizedUrl)
    )
  );
  const articleLinks = Array.from(
    new Set(internalLinks.filter((l) => l.targetPageType === 'blog').map((l) => l.destinationNormalizedUrl))
  );

  return {
    contentId: `${params.crawlId}:cnt:${params.normalizedUrl}`,
    crawlId: params.crawlId,
    sourceUrl: params.sourceUrl,
    normalizedUrl: params.normalizedUrl,
    title: params.title,
    author,
    publishedDate,
    modifiedDate,
    wordCount: params.wordCount,
    h2Count: params.h2List.length,
    hasMetaDescription: Boolean(params.metaDescription),
    hasArticleSchema: Boolean(articleSchema),
    categoryTopic,
    extractedKeywords,
    productLinks,
    categoryLinks,
    articleLinks,
    inboundLinkCount: 0,
    freshnessDays,
    extractionMethod: params.extractionMethod,
    originalValueJson: JSON.stringify({ publishedDate, modifiedDate, author }),
    normalizedValueJson: JSON.stringify({
      wordCount: params.wordCount,
      freshnessDays,
      productLinksCount: productLinks.length,
    }),
    confidence: 0.92,
    extractedAt: params.nowIso,
  };
}

function extractTechnologies(params: {
  externalScriptSrcs: string[];
  html: string;
  headers: Record<string, string>;
  crawlId: string;
  sourceUrl: string;
  siteDomain: string;
  extractionMethod: ExtractionLevel;
  nowIso: string;
}): TechnologyRecord[] {
  const out: TechnologyRecord[] = [];
  const matchedNames = new Set<string>();
  const scripts = params.externalScriptSrcs;

  const combinedText = `${params.html}\n${JSON.stringify(params.headers)}`;

  for (const sig of TECH_SIGNATURES) {
    for (const pat of sig.patterns) {
      if (pat.test(combinedText)) {
        if (!matchedNames.has(sig.name)) {
          matchedNames.add(sig.name);
          const matchingScript = scripts.find((s) => pat.test(s)) ?? null;
          out.push({
            techId: `${params.crawlId}:tech:${params.sourceUrl}:${sig.name}`,
            crawlId: params.crawlId,
            sourceUrl: params.sourceUrl,
            name: sig.name,
            category: sig.category,
            provider: sig.provider,
            scriptUrl: matchingScript,
            signatureMatched: pat.source,
            isThirdParty: sig.isThirdParty,
            extractionMethod: params.extractionMethod,
            originalValueJson: JSON.stringify({ scriptUrl: matchingScript }),
            normalizedValueJson: JSON.stringify({ name: sig.name, category: sig.category }),
            confidence: 0.95,
            extractedAt: params.nowIso,
          });
        }
        break;
      }
    }
  }

  return out;
}

function extractObservations(params: {
  $: cheerio.CheerioAPI;
  externalScriptSrcs: string[];
  html: string;
  headers: Record<string, string>;
  crawlId: string;
  sourceUrl: string;
  templateId: string;
  pageType: PageRecord['pageType'];
  images: ImageRecord[];
  technologies: TechnologyRecord[];
  extractionMethod: ExtractionLevel;
  nowIso: string;
}): ObservationRecord[] {
  const { $ } = params;
  const obs: ObservationRecord[] = [];
  const bodyText = $('body').text();

  const addObs = (
    category: ObservationRecord['category'],
    metric: string,
    value: string | number | boolean,
    details: Record<string, unknown> = {}
  ) => {
    obs.push({
      observationId: `${params.crawlId}:obs:${params.sourceUrl}:${category}:${metric}`,
      crawlId: params.crawlId,
      sourceUrl: params.sourceUrl,
      templateId: params.templateId,
      pageType: params.pageType,
      category,
      metric,
      value,
      details,
      device: 'desktop',
      extractionMethod: params.extractionMethod,
      originalValueJson: JSON.stringify({ metric, value }),
      normalizedValueJson: JSON.stringify({ metric, value, details }),
      confidence: params.extractionMethod === 'C' ? 0.98 : 0.88,
      extractedAt: params.nowIso,
    });
  };

  // Conversion observations (Tool 11)
  const hasPrimaryCta =
    $('button[type="submit"], .add-to-cart, .btn--primary, [name="add"], a.cta, button.cta, [data-testid*="add-to" i], [data-testid*="cta" i]').length > 0 ||
    $('button, a').filter((_, el) => /add to (cart|bag|basket)|buy now|shop now/i.test($(el).text())).length > 0;
  const hasTrustSignals =
    /secure checkout|money-back guarantee|free returns|verified buyer|ssl encrypted|trusted by|easy returns|30-day return/i.test(bodyText) ||
    $('[class*="trust"], [class*="badge"], [class*="guarantee"], [data-testid*="trust" i]').length > 0;
  const hasDeliveryInfo =
    /free shipping|free standard delivery|delivery in|ships within|estimated delivery|shipping policy|express delivery/i.test(bodyText);
  const hasReviewWidget =
    $('[class*="review"], #reviews, .jdgm-widget, .yotpo, .trustpilot-widget, [data-testid*="review" i]').length > 0;
  const hasLeadCapture =
    $('form[action*="subscribe"], form[action*="newsletter"], input[type="email"], [data-testid*="newsletter" i], [class*="newsletter" i], a[href*="signup"], a[href*="register"]').length > 0;
  const hasPromoBanner =
    $('.announcement-bar, .promo-banner, .header-bar, [class*="announcement"], [data-testid*="banner" i], [data-testid*="promo" i]').length > 0 ||
    /use code|limited time|% off|free shipping on orders over|free standard delivery over/i.test(bodyText);
  const hasStickyOrDrawerCart =
    $('[class*="cart-drawer"], [id*="CartDrawer"], [class*="mini-cart"], [class*="sticky-atc"], [data-testid*="bag" i], [data-testid*="cart" i], button[aria-label*="bag" i], button[aria-label*="cart" i]').length > 0;

  addObs('conversion', 'has_primary_cta', hasPrimaryCta);
  addObs('conversion', 'has_trust_signals', hasTrustSignals);
  addObs('conversion', 'has_delivery_or_returns_info', hasDeliveryInfo);
  addObs('conversion', 'has_review_section', hasReviewWidget);
  addObs('conversion', 'has_lead_capture', hasLeadCapture);
  addObs('conversion', 'has_promo_mechanism', hasPromoBanner);
  addObs('conversion', 'has_cart_drawer_or_sticky_cta', hasStickyOrDrawerCart);

  // Performance observations (Tool 12)
  const scriptCount = params.externalScriptSrcs.length;
  const thirdPartyScripts = params.externalScriptSrcs.filter((src) => /^https?:\/\//i.test(src));
  const stylesheetCount = $('link[rel="stylesheet"]').length;
  const htmlWeightBytes = Buffer.byteLength(params.html || '', 'utf-8');
  const lazyImagesCount = params.images.filter((i) => i.isLazyLoaded).length;
  const lazyImageShare =
    params.images.length > 0 ? Math.round((lazyImagesCount / params.images.length) * 100) : 100;
  const hasCompression = Boolean(params.headers['content-encoding']);
  const hasCacheControl = Boolean(params.headers['cache-control']);

  addObs('performance', 'total_external_scripts', scriptCount, { thirdPartyCount: thirdPartyScripts.length });
  addObs('performance', 'third_party_script_count', thirdPartyScripts.length, { sample: thirdPartyScripts.slice(0, 10) });
  addObs('performance', 'stylesheet_count', stylesheetCount);
  addObs('performance', 'html_document_bytes', htmlWeightBytes);
  addObs('performance', 'lazy_loaded_image_pct', lazyImageShare);
  addObs('performance', 'has_compression', hasCompression);
  addObs('performance', 'has_cache_control', hasCacheControl);

  return obs;
}

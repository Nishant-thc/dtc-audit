import type { PlatformType } from '../types/entities.ts';

export interface AdapterProductFeedItem {
  sourceUrl: string;
  title: string;
  sku: string | null;
  brand: string | null;
  price: number | null;
  originalPrice: number | null;
  currency: string | null;
  availability: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  descriptionText: string;
  imageUrls: Array<{ url: string; alt: string }>;
  variants: Array<{
    title: string;
    sku: string | null;
    price: number | null;
    available: boolean;
    attributes: Record<string, string>;
  }>;
  categoryName: string | null;
  tags: string[];
}

export interface PlatformAdapter {
  platform: PlatformType;
  getPublicFeedEndpoints(baseOrigin: string): string[];
  parsePublicFeedResponse(url: string, jsonText: string, baseOrigin: string): AdapterProductFeedItem[];
}

export function detectPlatform(
  html: string,
  headers: Record<string, string>,
  discoveredUrls: string[] = []
): { platform: PlatformType; signature: string } {
  const lowerHtml = html.toLowerCase();
  const headerKeys = Object.keys(headers).map((k) => k.toLowerCase());

  if (
    lowerHtml.includes('cdn.shopify.com') ||
    lowerHtml.includes('shopify.theme') ||
    headerKeys.some((k) => k.startsWith('x-shopify') || k === 'x-shopid')
  ) {
    return { platform: 'shopify', signature: 'cdn.shopify.com / Shopify.theme / x-shopify header' };
  }

  if (
    lowerHtml.includes('woocommerce') ||
    lowerHtml.includes('/wp-content/plugins/woocommerce') ||
    lowerHtml.includes('wc-blocks')
  ) {
    return { platform: 'woocommerce', signature: 'wp-content/plugins/woocommerce / wc-blocks' };
  }

  if (
    lowerHtml.includes('mage/cookies') ||
    lowerHtml.includes('magento_') ||
    lowerHtml.includes('x-magento-init') ||
    headerKeys.some((k) => k.startsWith('x-magento'))
  ) {
    return { platform: 'magento', signature: 'text/x-magento-init / mage/cookies' };
  }

  if (
    lowerHtml.includes('cdn11.bigcommerce.com') ||
    lowerHtml.includes('bigcommerce.com/s-') ||
    headerKeys.some((k) => k.includes('bigcommerce'))
  ) {
    return { platform: 'bigcommerce', signature: 'cdn11.bigcommerce.com / BigCommerce stencil' };
  }

  if (discoveredUrls.some((u) => u.includes('/collections/') && u.includes('/products/'))) {
    return { platform: 'shopify', signature: 'url-pattern:/collections/*/products/*' };
  }
  if (discoveredUrls.some((u) => u.includes('/product-category/'))) {
    return { platform: 'woocommerce', signature: 'url-pattern:/product-category/*' };
  }

  return { platform: 'generic', signature: 'generic-html-and-jsonld' };
}

export class ShopifyAdapter implements PlatformAdapter {
  public platform: PlatformType = 'shopify';

  public getPublicFeedEndpoints(baseOrigin: string): string[] {
    return [`${baseOrigin}/products.json?limit=50`];
  }

  public parsePublicFeedResponse(_url: string, jsonText: string, baseOrigin: string): AdapterProductFeedItem[] {
    try {
      const data = JSON.parse(jsonText) as { products?: Array<Record<string, unknown>> };
      if (!Array.isArray(data.products)) return [];

      return data.products.map((p) => {
        const handle = String(p.handle ?? '');
        const rawBody = String(p.body_html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const variantsRaw = Array.isArray(p.variants) ? (p.variants as Array<Record<string, unknown>>) : [];
        const imagesRaw = Array.isArray(p.images) ? (p.images as Array<Record<string, unknown>>) : [];

        const firstVariant = variantsRaw[0] ?? {};
        const price = firstVariant.price ? parseFloat(String(firstVariant.price)) : null;
        const compareAt = firstVariant.compare_at_price ? parseFloat(String(firstVariant.compare_at_price)) : null;
        const anyAvailable = variantsRaw.some((v) => Boolean(v.available));

        return {
          sourceUrl: `${baseOrigin}/products/${handle}`,
          title: String(p.title ?? handle),
          sku: firstVariant.sku ? String(firstVariant.sku) : null,
          brand: p.vendor ? String(p.vendor) : null,
          price: price !== null && !isNaN(price) ? price : null,
          originalPrice: compareAt !== null && !isNaN(compareAt) && compareAt > (price ?? 0) ? compareAt : null,
          currency: 'USD',
          availability: anyAvailable ? 'in_stock' : 'out_of_stock',
          descriptionText: rawBody,
          imageUrls: imagesRaw.map((img) => ({
            url: String(img.src ?? ''),
            alt: String(img.alt ?? ''),
          })),
          variants: variantsRaw.map((v) => ({
            title: String(v.title ?? 'Default'),
            sku: v.sku ? String(v.sku) : null,
            price: v.price ? parseFloat(String(v.price)) : null,
            available: Boolean(v.available),
            attributes: {
              ...(v.option1 ? { option1: String(v.option1) } : {}),
              ...(v.option2 ? { option2: String(v.option2) } : {}),
              ...(v.option3 ? { option3: String(v.option3) } : {}),
            },
          })),
          categoryName: p.product_type ? String(p.product_type) : null,
          tags: Array.isArray(p.tags)
            ? p.tags.map(String)
            : typeof p.tags === 'string'
              ? p.tags.split(',').map((t) => t.trim()).filter(Boolean)
              : [],
        };
      });
    } catch {
      return [];
    }
  }
}

export class WooCommerceAdapter implements PlatformAdapter {
  public platform: PlatformType = 'woocommerce';

  public getPublicFeedEndpoints(baseOrigin: string): string[] {
    return [`${baseOrigin}/wp-json/wc/store/v1/products?per_page=25`];
  }

  public parsePublicFeedResponse(_url: string, jsonText: string, _baseOrigin: string): AdapterProductFeedItem[] {
    try {
      const data = JSON.parse(jsonText);
      if (!Array.isArray(data)) return [];
      return data.map((p: Record<string, unknown>) => {
        const prices = (p.prices ?? {}) as Record<string, unknown>;
        const minorUnit = Number(prices.currency_minor_unit ?? 2);
        const divisor = Math.pow(10, minorUnit);
        const rawPrice = prices.price ? parseFloat(String(prices.price)) / divisor : null;
        const regPrice = prices.regular_price ? parseFloat(String(prices.regular_price)) / divisor : null;
        const desc = String(p.description ?? p.short_description ?? '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const images = Array.isArray(p.images) ? (p.images as Array<Record<string, unknown>>) : [];
        const categories = Array.isArray(p.categories) ? (p.categories as Array<Record<string, unknown>>) : [];

        return {
          sourceUrl: String(p.permalink ?? ''),
          title: String(p.name ?? ''),
          sku: p.sku ? String(p.sku) : null,
          brand: null,
          price: rawPrice !== null && !isNaN(rawPrice) ? rawPrice : null,
          originalPrice: regPrice !== null && !isNaN(regPrice) && regPrice > (rawPrice ?? 0) ? regPrice : null,
          currency: prices.currency_code ? String(prices.currency_code) : 'USD',
          availability: p.is_in_stock ? 'in_stock' : 'out_of_stock',
          descriptionText: desc,
          imageUrls: images.map((img) => ({
            url: String(img.src ?? ''),
            alt: String(img.alt ?? ''),
          })),
          variants: [],
          categoryName: categories[0]?.name ? String(categories[0].name) : null,
          tags: [],
        };
      });
    } catch {
      return [];
    }
  }
}

export class MagentoAdapter implements PlatformAdapter {
  public platform: PlatformType = 'magento';
  public getPublicFeedEndpoints(_baseOrigin: string): string[] {
    return [];
  }
  public parsePublicFeedResponse(): AdapterProductFeedItem[] {
    return [];
  }
}

export class BigCommerceAdapter implements PlatformAdapter {
  public platform: PlatformType = 'bigcommerce';
  public getPublicFeedEndpoints(_baseOrigin: string): string[] {
    return [];
  }
  public parsePublicFeedResponse(): AdapterProductFeedItem[] {
    return [];
  }
}

export class GenericAdapter implements PlatformAdapter {
  public platform: PlatformType = 'generic';
  public getPublicFeedEndpoints(_baseOrigin: string): string[] {
    return [];
  }
  public parsePublicFeedResponse(): AdapterProductFeedItem[] {
    return [];
  }
}

export function getPlatformAdapter(platform: PlatformType): PlatformAdapter {
  switch (platform) {
    case 'shopify':
      return new ShopifyAdapter();
    case 'woocommerce':
      return new WooCommerceAdapter();
    case 'magento':
      return new MagentoAdapter();
    case 'bigcommerce':
      return new BigCommerceAdapter();
    default:
      return new GenericAdapter();
  }
}


const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'msclkid',
  'twclid',
  'ttclid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  '_hsenc',
  '_hsmi',
  'hsCtaTracking',
  'yclid',
  'igshid',
]);

const PRIVATE_OR_CHECKOUT_PATH_PATTERNS = [
  /^\/cart(\/|$)/i,
  /^\/checkout(\/|$)/i,
  /^\/account(\/|$)/i,
  /^\/customer\/account(\/|$)/i,
  /^\/my-account(\/|$)/i,
  /^\/login(\/|$)/i,
  /^\/signin(\/|$)/i,
  /^\/register(\/|$)/i,
  /^\/password(\/|$)/i,
  /^\/admin(\/|$)/i,
  /^\/wp-admin(\/|$)/i,
  /^\/wp-login\.php/i,
  /^\/wc-api(\/|$)/i,
];

export interface NormalizedUrlResult {
  originalUrl: string;
  normalizedUrl: string;
  domain: string;
  pathname: string;
  allParameters: Record<string, string[]>;
  functionalParameters: Record<string, string[]>;
  strippedTrackingParameters: string[];
  hadTrailingSlash: boolean;
  hadFragment: boolean;
  isPrivateOrCheckout: boolean;
}

export function normalizeDomain(input: string): string {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) {
    raw = 'https://' + raw;
  }
  const u = new URL(raw);
  return u.hostname.toLowerCase().replace(/^www\./, '');
}

export function isSameSiteDomain(hostA: string, hostB: string): boolean {
  const cleanA = hostA.toLowerCase().replace(/^www\./, '');
  const cleanB = hostB.toLowerCase().replace(/^www\./, '');
  return cleanA === cleanB;
}

export function normalizeUrl(rawUrl: string, baseUrl?: string): NormalizedUrlResult | null {
  try {
    const parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    const resolvedOriginalUrl = parsed.toString();
    const hadFragment = parsed.hash.length > 0;
    parsed.hash = '';

    parsed.hostname = parsed.hostname.toLowerCase();

    const allParameters: Record<string, string[]> = {};
    const functionalParameters: Record<string, string[]> = {};
    const strippedTrackingParameters: string[] = [];

    const sortedKeys = Array.from(new Set(Array.from(parsed.searchParams.keys()))).sort();
    const keptSearchParams = new URLSearchParams();

    for (const key of sortedKeys) {
      const lowerKey = key.toLowerCase();
      const values = parsed.searchParams.getAll(key);
      allParameters[lowerKey] = values;

      if (TRACKING_PARAMS.has(lowerKey) || lowerKey.startsWith('utm_')) {
        strippedTrackingParameters.push(lowerKey);
      } else {
        functionalParameters[lowerKey] = values;
        for (const val of values.sort()) {
          keptSearchParams.append(lowerKey, val);
        }
      }
    }

    let pathname = parsed.pathname.replace(/\/{2,}/g, '/');
    const hadTrailingSlash = pathname.length > 1 && pathname.endsWith('/');
    if (hadTrailingSlash) {
      pathname = pathname.slice(0, -1);
    }
    if (!pathname) {
      pathname = '/';
    }

    const isPrivateOrCheckout = PRIVATE_OR_CHECKOUT_PATH_PATTERNS.some((re) => re.test(pathname));

    const queryString = keptSearchParams.toString();
    const portPart = parsed.port && parsed.port !== '80' && parsed.port !== '443' ? `:${parsed.port}` : '';
    const normalizedUrl = `${parsed.protocol}//${parsed.hostname}${portPart}${pathname}${queryString ? '?' + queryString : ''}`;

    return {
      originalUrl: resolvedOriginalUrl,
      normalizedUrl,
      domain: parsed.hostname.replace(/^www\./, ''),
      pathname,
      allParameters,
      functionalParameters,
      strippedTrackingParameters,
      hadTrailingSlash,
      hadFragment,
      isPrivateOrCheckout,
    };
  } catch {
    return null;
  }
}

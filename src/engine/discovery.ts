import * as cheerio from 'cheerio';
import { normalizeUrl, isSameSiteDomain } from './url-normalizer.ts';

export interface RobotsPolicy {
  rawText: string;
  sitemaps: string[];
  disallowPatterns: string[];
  allowPatterns: string[];
  crawlDelayMs: number;
}

export interface DiscoveredSitemapEntry {
  loc: string;
  lastmod: string | null;
}

export interface ParsedSitemapResult {
  isIndex: boolean;
  childSitemaps: DiscoveredSitemapEntry[];
  urlEntries: DiscoveredSitemapEntry[];
}

export function parseRobotsTxt(rawText: string, baseOrigin: string): RobotsPolicy {
  const sitemaps: string[] = [];
  const disallowPatterns: string[] = [];
  const allowPatterns: string[] = [];
  let crawlDelayMs = 0;

  const lines = rawText.split(/\r?\n/);
  let activeAgentApplies = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const directive = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();

    if (directive === 'sitemap') {
      const n = normalizeUrl(val, baseOrigin);
      if (n) sitemaps.push(n.originalUrl);
      continue;
    }

    if (directive === 'user-agent') {
      const ua = val.toLowerCase();
      activeAgentApplies = ua === '*' || ua.includes('siloseo');
      continue;
    }

    if (!activeAgentApplies) continue;

    if (directive === 'disallow' && val) {
      disallowPatterns.push(val);
    } else if (directive === 'allow' && val) {
      allowPatterns.push(val);
    } else if (directive === 'crawl-delay') {
      const sec = parseFloat(val);
      if (!isNaN(sec) && sec > 0) {
        crawlDelayMs = Math.max(crawlDelayMs, Math.min(5000, Math.round(sec * 1000)));
      }
    }
  }

  return {
    rawText,
    sitemaps: Array.from(new Set(sitemaps)),
    disallowPatterns,
    allowPatterns,
    crawlDelayMs,
  };
}

export function isAllowedByRobots(pathname: string, policy: RobotsPolicy): boolean {
  let matchedAllowLen = -1;
  let matchedDisallowLen = -1;

  for (const allow of policy.allowPatterns) {
    if (matchesRobotsPattern(pathname, allow)) {
      matchedAllowLen = Math.max(matchedAllowLen, allow.length);
    }
  }
  for (const disallow of policy.disallowPatterns) {
    if (matchesRobotsPattern(pathname, disallow)) {
      matchedDisallowLen = Math.max(matchedDisallowLen, disallow.length);
    }
  }

  if (matchedDisallowLen === -1) return true;
  return matchedAllowLen >= matchedDisallowLen;
}

function matchesRobotsPattern(pathname: string, pattern: string): boolean {
  if (pattern === '/') return true;
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const regexStr = '^' + escaped;
  try {
    return new RegExp(regexStr).test(pathname);
  } catch {
    return pathname.startsWith(pattern);
  }
}

export function parseSitemapXml(xmlText: string, baseOrigin: string): ParsedSitemapResult {
  const childSitemaps: DiscoveredSitemapEntry[] = [];
  const urlEntries: DiscoveredSitemapEntry[] = [];

  // Fast regex path for large XML sitemaps (>100KB) to avoid building 10,000+ DOM nodes
  if (xmlText.length > 100_000 && !/<sitemapindex/i.test(xmlText.slice(0, 2000))) {
    const urlBlockRegex = /<url>([\s\S]*?)<\/url>/gi;
    let match: RegExpExecArray | null;
    while ((match = urlBlockRegex.exec(xmlText)) !== null) {
      const block = match[1];
      const locMatch = /<loc>\s*(?:<!\[CDATA\[)?([^\s<]+?)(?:\]\]>)?\s*<\/loc>/i.exec(block);
      if (locMatch && locMatch[1]) {
        const lastmodMatch = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i.exec(block);
        urlEntries.push({
          loc: locMatch[1].trim(),
          lastmod: lastmodMatch ? lastmodMatch[1].trim() : null,
        });
      }
      if (urlEntries.length >= 5000) break;
    }
    return {
      isIndex: false,
      childSitemaps: [],
      urlEntries,
    };
  }

  const $ = cheerio.load(xmlText, { xmlMode: true });

  const sitemapNodes = $('sitemapindex > sitemap, sitemap');
  if (sitemapNodes.length > 0 && $('urlset > url').length === 0) {
    sitemapNodes.each((_, el) => {
      const loc = $(el).find('loc').first().text().trim();
      const lastmod = $(el).find('lastmod').first().text().trim() || null;
      if (loc) {
        const norm = normalizeUrl(loc, baseOrigin);
        if (norm) {
          childSitemaps.push({ loc: norm.originalUrl, lastmod });
        }
      }
    });
    return {
      isIndex: true,
      childSitemaps,
      urlEntries: [],
    };
  }

  $('url').each((_, el) => {
    if (urlEntries.length >= 5000) return false;
    const loc = $(el).find('loc').first().text().trim();
    const lastmod = $(el).find('lastmod').first().text().trim() || null;
    if (loc) {
      urlEntries.push({ loc, lastmod });
    }
  });

  return {
    isIndex: false,
    childSitemaps: [],
    urlEntries,
  };
}

export interface HarvestedNavLinks {
  navUrls: string[];
  footerUrls: string[];
  internalUrls: string[];
  canonicalUrl: string | null;
}

export function harvestDiscoveryLinksFromHtml(
  html: string,
  pageUrl: string,
  siteDomain: string
): HarvestedNavLinks {
  const $ = cheerio.load(html);
  const navUrls = new Set<string>();
  const footerUrls = new Set<string>();
  const internalUrls = new Set<string>();

  const canonicalHref = $('link[rel="canonical"]').attr('href')?.trim() || null;
  let canonicalUrl: string | null = null;
  if (canonicalHref) {
    const cNorm = normalizeUrl(canonicalHref, pageUrl);
    if (cNorm) canonicalUrl = cNorm.originalUrl;
  }

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return;
    }
    const norm = normalizeUrl(href, pageUrl);
    if (!norm || !isSameSiteDomain(norm.domain, siteDomain) || norm.isPrivateOrCheckout) {
      return;
    }

    const inNav = $(el).closest('nav, header, [role="navigation"], .nav, .navbar, .menu, .site-header').length > 0;
    const inFooter = $(el).closest('footer, [role="contentinfo"], .footer, .site-footer').length > 0;

    if (inNav) navUrls.add(norm.originalUrl);
    if (inFooter) footerUrls.add(norm.originalUrl);
    internalUrls.add(norm.originalUrl);
  });

  return {
    navUrls: Array.from(navUrls),
    footerUrls: Array.from(footerUrls),
    internalUrls: Array.from(internalUrls),
    canonicalUrl,
  };
}

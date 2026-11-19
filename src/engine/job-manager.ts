import * as crypto from 'node:crypto';
import type { SharedDatabase } from '../db/database.ts';
import { normalizeDomain, normalizeUrl, isSameSiteDomain } from './url-normalizer.ts';
import { classifyPage } from './classifier.ts';
import { PoliteFetchQueue, type CustomFetcher } from './fetch-queue.ts';
import {
  parseRobotsTxt,
  isAllowedByRobots,
  parseSitemapXml,
  harvestDiscoveryLinksFromHtml,
} from './discovery.ts';
import { detectPlatform, getPlatformAdapter } from './adapters.ts';
import { extractFromHtml } from './extractor.ts';
import { renderRepresentativePageLevelC } from './renderer.ts';
import type {
  CrawlBudgetConfig,
  CrawlRecord,
  CoverageCounters,
  ExtractionLevel,
  PageRecord,
  SitemapRecord,
  DiscoverySource,
} from '../types/entities.ts';

export function getDefaultBudgetConfig(overrides: Partial<CrawlBudgetConfig> = {}): CrawlBudgetConfig {
  return {
    maxDiscoveryUrls: overrides.maxDiscoveryUrls ?? 5000,
    maxLightweightPages: overrides.maxLightweightPages ?? 30,
    maxDeepProductPages: overrides.maxDeepProductPages ?? 15,
    maxDeepCollectionPages: overrides.maxDeepCollectionPages ?? 10,
    maxDeepContentPages: overrides.maxDeepContentPages ?? 10,
    maxBrowserPerfPages: overrides.maxBrowserPerfPages ?? 5,
    concurrency: overrides.concurrency ?? 4,
    perHostDelayMs: overrides.perHostDelayMs ?? 120,
    storeRawHtml: overrides.storeRawHtml ?? true,
    snapshotRetentionDays: overrides.snapshotRetentionDays ?? 30,
    maxLevel: overrides.maxLevel ?? 'B',
  };
}

const LEVEL_RANK: Record<ExtractionLevel, number> = { A: 1, B: 2, C: 3 };

export class JobManager {
  private db: SharedDatabase;
  private activeQueues = new Map<string, PoliteFetchQueue>();
  private customFetcher?: CustomFetcher;

  constructor(db: SharedDatabase, customFetcher?: CustomFetcher) {
    this.db = db;
    this.customFetcher = customFetcher;
  }

  public cancelJob(crawlId: string): boolean {
    const q = this.activeQueues.get(crawlId);
    if (q) {
      q.cancel();
    }
    const crawl = this.db.getCrawl(crawlId);
    if (crawl && (crawl.status === 'running' || crawl.status === 'paused')) {
      crawl.status = 'cancelled';
      crawl.endTime = new Date().toISOString();
      this.db.upsertCrawl(crawl);
      return true;
    }
    return false;
  }

  public pauseJob(crawlId: string): boolean {
    const q = this.activeQueues.get(crawlId);
    if (q) q.pause();
    const crawl = this.db.getCrawl(crawlId);
    if (crawl && crawl.status === 'running') {
      crawl.status = 'paused';
      this.db.upsertCrawl(crawl);
      return true;
    }
    return false;
  }

  public resumeJob(crawlId: string): boolean {
    const q = this.activeQueues.get(crawlId);
    if (q) q.resume();
    const crawl = this.db.getCrawl(crawlId);
    if (crawl && crawl.status === 'paused') {
      crawl.status = 'running';
      this.db.upsertCrawl(crawl);
      return true;
    }
    return false;
  }

  /**
   * Ensures a crawl exists for the domain at the required extraction level.
   * Reuses an existing completed crawl with ZERO additional requests when fresh!
   */
  public async ensureCrawl(params: {
    domainInput: string;
    requiredLevel: ExtractionLevel;
    budget?: Partial<CrawlBudgetConfig>;
    forceRecrawl?: boolean;
  }): Promise<{ crawl: CrawlRecord; reusedExisting: boolean }> {
    const domain = normalizeDomain(params.domainInput);
    const existing = this.db.getLatestCrawlForDomain(domain);

    if (
      existing &&
      !params.forceRecrawl &&
      existing.status === 'completed' &&
      LEVEL_RANK[existing.maxLevel] >= LEVEL_RANK[params.requiredLevel]
    ) {
      return { crawl: existing, reusedExisting: true };
    }

    const budget = getDefaultBudgetConfig({
      ...params.budget,
      maxLevel: params.budget?.maxLevel
        ? LEVEL_RANK[params.budget.maxLevel] >= LEVEL_RANK[params.requiredLevel]
          ? params.budget.maxLevel
          : params.requiredLevel
        : params.requiredLevel,
    });

    const crawl = await this.runCrawl(domain, budget, existing ?? undefined);
    return { crawl, reusedExisting: false };
  }

  public async runCrawl(
    domainInput: string,
    budgetInput: Partial<CrawlBudgetConfig> = {},
    previousCrawl?: CrawlRecord
  ): Promise<CrawlRecord> {
    const domain = normalizeDomain(domainInput);
    const baseOrigin = `https://${domain}`;
    const budget = getDefaultBudgetConfig(budgetInput);
    const crawlId = `crawl_${domain.replace(/[^a-z0-9]/g, '_')}_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const startTime = new Date().toISOString();

    const coverage: CoverageCounters = {
      discovered: 0,
      requested: 0,
      extracted: 0,
      partiallyExtracted: 0,
      skipped: 0,
      blockedOrUnavailable: 0,
      deeplyInspected: 0,
    };

    const crawlRecord: CrawlRecord = {
      crawlId,
      domain,
      platform: 'generic',
      startTime,
      endTime: null,
      budgetJson: JSON.stringify(budget),
      status: 'running',
      maxLevel: budget.maxLevel,
      coverage,
      robotsTxtRaw: null,
      crawlDelayMs: budget.perHostDelayMs,
    };

    this.db.upsertCrawl(crawlRecord);

    const fetchQueue = new PoliteFetchQueue({
      concurrency: budget.concurrency,
      perHostDelayMs: budget.perHostDelayMs,
      customFetcher: this.customFetcher,
    });
    this.activeQueues.set(crawlId, fetchQueue);

    // Map of previous pages for incremental recrawl (ETag / Last-Modified / Fingerprint)
    const prevPageMap = new Map<string, PageRecord>();
    if (previousCrawl) {
      for (const pp of this.db.getPages(previousCrawl.crawlId)) {
        prevPageMap.set(pp.normalizedUrl, pp);
      }
    }

    interface DiscoveredEntry {
      sourceUrl: string;
      normalizedUrl: string;
      pathname: string;
      parameters: Record<string, string[]>;
      discoverySource: DiscoverySource;
      sitemapSource: string | null;
      lastmod: string | null;
      inSitemap: boolean;
      inNav: boolean;
      depth: number;
      isPrivateOrCheckout: boolean;
    }

    const discoveredMap = new Map<string, DiscoveredEntry>();

    const registerDiscoveredUrl = (
      rawUrl: string,
      source: DiscoverySource,
      depth: number,
      meta: { sitemapSource?: string | null; lastmod?: string | null; inNav?: boolean } = {}
    ): DiscoveredEntry | null => {
      const norm = normalizeUrl(rawUrl, baseOrigin);
      if (!norm || !isSameSiteDomain(norm.domain, domain)) return null;

      const existingEntry = discoveredMap.get(norm.normalizedUrl);
      if (existingEntry) {
        if (source === 'sitemap') existingEntry.inSitemap = true;
        if (meta.sitemapSource && !existingEntry.sitemapSource) existingEntry.sitemapSource = meta.sitemapSource;
        if (meta.lastmod && !existingEntry.lastmod) existingEntry.lastmod = meta.lastmod;
        if (meta.inNav) existingEntry.inNav = true;
        existingEntry.depth = Math.min(existingEntry.depth, depth);
        return existingEntry;
      }

      if (discoveredMap.size >= budget.maxDiscoveryUrls) {
        return null;
      }

      const entry: DiscoveredEntry = {
        sourceUrl: norm.originalUrl,
        normalizedUrl: norm.normalizedUrl,
        pathname: norm.pathname,
        parameters: norm.allParameters,
        discoverySource: source,
        sitemapSource: meta.sitemapSource ?? null,
        lastmod: meta.lastmod ?? null,
        inSitemap: source === 'sitemap',
        inNav: Boolean(meta.inNav),
        depth,
        isPrivateOrCheckout: norm.isPrivateOrCheckout,
      };
      discoveredMap.set(norm.normalizedUrl, entry);
      coverage.discovered = discoveredMap.size;
      return entry;
    };

    try {
      // Seed homepage
      registerDiscoveredUrl(`${baseOrigin}/`, 'seed', 0, { inNav: true });

      // STEP 1: Fetch robots.txt
      const robotsUrl = `${baseOrigin}/robots.txt`;
      const robotsRes = await fetchQueue.fetchUrl(robotsUrl, { maxRedirects: 3, timeoutMs: 8000 });
      coverage.requested++;
      const robotsPolicy = parseRobotsTxt(robotsRes.status === 200 ? robotsRes.bodyText : '', baseOrigin);
      crawlRecord.robotsTxtRaw = robotsRes.status === 200 ? robotsRes.bodyText : null;
      crawlRecord.crawlDelayMs = Math.max(budget.perHostDelayMs, robotsPolicy.crawlDelayMs);
      fetchQueue.setPerHostDelay(crawlRecord.crawlDelayMs);

      // STEP 2: Sitemap & Sitemap Index Discovery (parallel child sitemap fetching)
      const sitemapQueue =
        robotsPolicy.sitemaps.length > 0 ? [...robotsPolicy.sitemaps] : [`${baseOrigin}/sitemap.xml`];
      const visitedSitemaps = new Set<string>();

      const processSitemapBatch = async (urlsToFetch: string[]) => {
        const results = await Promise.all(
          urlsToFetch.map(async (smUrl) => {
            if (fetchQueue.isCancelled()) return null;
            const smFetch = await fetchQueue.fetchUrl(smUrl, { maxRedirects: 3, timeoutMs: 10000 });
            coverage.requested++;
            return { smUrl, smFetch };
          })
        );

        const nextChildren: string[] = [];
        for (const item of results) {
          if (!item || item.smFetch.status !== 200 || !item.smFetch.bodyText) continue;
          const { smUrl, smFetch } = item;
          const parsedSm = parseSitemapXml(smFetch.bodyText, baseOrigin);
          const declaredUrls: string[] = [];

          if (parsedSm.isIndex) {
            for (const child of parsedSm.childSitemaps) {
              declaredUrls.push(child.loc);
              // Skip hreflang-only duplicate sitemaps when standard page/product/collection sitemaps exist
              if (!visitedSitemaps.has(child.loc) && !/hreflang/i.test(child.loc)) {
                nextChildren.push(child.loc);
              }
            }
          } else {
            const perSitemapCap = Math.max(
              300,
              Math.floor((budget.maxDiscoveryUrls * 0.85) / Math.max(1, urlsToFetch.length))
            );
            let addedFromThisSitemap = 0;
            for (const uEntry of parsedSm.urlEntries) {
              declaredUrls.push(uEntry.loc);
              if (addedFromThisSitemap < perSitemapCap) {
                const reg = registerDiscoveredUrl(uEntry.loc, 'sitemap', 2, {
                  sitemapSource: smUrl,
                  lastmod: uEntry.lastmod,
                });
                if (reg) addedFromThisSitemap++;
              }
            }
          }

          const smRecord: SitemapRecord = {
            sitemapId: `${crawlId}:sm:${smUrl}`,
            crawlId,
            sourceUrl: smUrl,
            isIndex: parsedSm.isIndex,
            declaredPagesCount: declaredUrls.length,
            declaredUrls: declaredUrls.slice(0, 2000),
            lastmod: null,
            status: smFetch.status,
            errorUrlCount: 0,
            redirectUrlCount: 0,
            extractionMethod: 'A',
            confidence: 0.99,
            extractedAt: new Date().toISOString(),
          };
          this.db.upsertSitemap(smRecord);
        }
        return nextChildren;
      };

      while (sitemapQueue.length > 0 && visitedSitemaps.size < 16 && !fetchQueue.isCancelled()) {
        const batch: string[] = [];
        while (sitemapQueue.length > 0 && batch.length < 5 && visitedSitemaps.size < 16) {
          const nextUrl = sitemapQueue.shift()!;
          if (!visitedSitemaps.has(nextUrl)) {
            visitedSitemaps.add(nextUrl);
            batch.push(nextUrl);
          }
        }
        if (batch.length === 0) break;
        const discoveredChildren = await processSitemapBatch(batch);
        for (const childUrl of discoveredChildren) {
          if (!visitedSitemaps.has(childUrl)) {
            sitemapQueue.push(childUrl);
          }
        }
      }

      // STEP 3: Fetch Homepage for Platform Detection & Navigation Link Harvesting
      const homeFetch = await fetchQueue.fetchUrl(`${baseOrigin}/`, { maxRedirects: 5, timeoutMs: 12000 });
      coverage.requested++;

      let detectedPlatform = detectPlatform(
        homeFetch.bodyText,
        homeFetch.headers,
        Array.from(discoveredMap.values()).map((d) => d.sourceUrl)
      );
      crawlRecord.platform = detectedPlatform.platform;

      if (homeFetch.status === 200 && homeFetch.bodyText) {
        const harvested = harvestDiscoveryLinksFromHtml(homeFetch.bodyText, homeFetch.finalUrl || `${baseOrigin}/`, domain);
        for (const navUrl of harvested.navUrls) {
          registerDiscoveredUrl(navUrl, 'nav', 1, { inNav: true });
        }
        for (const footerUrl of harvested.footerUrls) {
          registerDiscoveredUrl(footerUrl, 'footer', 1);
        }
        for (const intUrl of harvested.internalUrls) {
          registerDiscoveredUrl(intUrl, 'internal_link', 1);
        }
        if (harvested.canonicalUrl) {
          registerDiscoveredUrl(harvested.canonicalUrl, 'canonical', 0);
        }
      }

      // STEP 4: Platform Adapter Public Endpoints (Shopify / WooCommerce feeds)
      const adapter = getPlatformAdapter(crawlRecord.platform);
      for (const feedUrl of adapter.getPublicFeedEndpoints(baseOrigin)) {
        const feedNorm = normalizeUrl(feedUrl, baseOrigin);
        if (feedNorm && !isAllowedByRobots(feedNorm.pathname, robotsPolicy)) continue;
        const feedFetch = await fetchQueue.fetchUrl(feedUrl, { maxRedirects: 3, timeoutMs: 8000 });
        coverage.requested++;
        if (feedFetch.status === 200 && feedFetch.bodyText) {
          const items = adapter.parsePublicFeedResponse(feedUrl, feedFetch.bodyText, baseOrigin);
          for (const item of items) {
            registerDiscoveredUrl(item.sourceUrl, 'adapter', 2);
          }
        }
      }

      // Save initial Level A Page Inventory for all discovered URLs inside a single SQLite transaction
      const nowIso = new Date().toISOString();
      const entryPageTypeMap = new Map<string, PageRecord['pageType']>();
      this.db.runInTransaction(() => {
        for (const entry of discoveredMap.values()) {
          const cls = classifyPage({
            url: entry.sourceUrl,
            pathname: entry.pathname,
            parameters: entry.parameters,
            sitemapSource: entry.sitemapSource,
          });
          entryPageTypeMap.set(entry.normalizedUrl, cls.pageType);

          const pageRec: PageRecord = {
            pageId: `${crawlId}:${entry.normalizedUrl}`,
            crawlId,
            sourceUrl: entry.sourceUrl,
            normalizedUrl: entry.normalizedUrl,
            pageType: cls.pageType,
            classificationConfidence: cls.confidence,
            classificationSignals: cls.signals,
            templateId: cls.templateId,
            status: 200,
            redirectDestination: null,
            redirectChain: [],
            discoverySource: entry.discoverySource,
            sitemapSource: entry.sitemapSource,
            lastmod: entry.lastmod,
            parameters: entry.parameters,
            canonicalUrl: null,
            normalizedCanonicalUrl: null,
            title: null,
            metaDescription: null,
            h1List: [],
            h2List: [],
            h3ToH6Count: 0,
            robotsMeta: null,
            xRobotsTag: null,
            isNoindex: false,
            isNofollow: false,
            visibleText: '',
            wordCount: 0,
            contentLength: 0,
            responseHeaders: {},
            contentFingerprint: null,
            etag: null,
            lastModifiedHeader: null,
            depth: entry.depth,
            inboundLinkCount: 0,
            outboundLinkCount: 0,
            inSitemap: entry.inSitemap,
            inNav: entry.inNav,
            extractionMethod: 'A',
            originalValueJson: JSON.stringify({ discoverySource: entry.discoverySource }),
            normalizedValueJson: JSON.stringify({ normalizedUrl: entry.normalizedUrl, pageType: cls.pageType }),
            confidence: cls.confidence,
            extractedAt: nowIso,
          };
          this.db.upsertPage(pageRec);
        }
      });

      // STEP 5: Stratified Level B Lightweight Extraction across page types (product, collection, category, blog, etc.)
      const buckets = new Map<string, DiscoveredEntry[]>();
      const rawEntries = Array.from(discoveredMap.values()).sort((a, b) => a.depth - b.depth);
      const allEntries: DiscoveredEntry[] = [];

      for (const e of rawEntries) {
        if (e.pathname === '/') {
          allEntries.push(e);
          continue;
        }
        const pType = entryPageTypeMap.get(e.normalizedUrl) ?? 'unknown';
        const b = buckets.get(pType) ?? [];
        b.push(e);
        buckets.set(pType, b);
      }

      // Ecommerce-weighted round-robin stratification: 2 products, 2 collections/categories, 1 blog, 1 informational/other per cycle
      const bucketCursors = new Map<string, number>();
      const takeNextFrom = (pType: string): boolean => {
        const list = buckets.get(pType);
        const idx = bucketCursors.get(pType) ?? 0;
        if (list && idx < list.length) {
          allEntries.push(list[idx]);
          bucketCursors.set(pType, idx + 1);
          return true;
        }
        return false;
      };

      const cycleSchedule = [
        'product',
        'product',
        'collection',
        'collection',
        'category',
        'blog',
        'landing',
        'informational',
        'filtered',
        'unknown',
        'search',
        'utility',
      ];
      while (allEntries.length < rawEntries.length) {
        let addedInCycle = false;
        for (const pType of cycleSchedule) {
          if (takeNextFrom(pType)) {
            addedInCycle = true;
          }
        }
        if (!addedInCycle) break;
      }

      let lightweightExtractedCount = 0;
      const eligibleToFetch: DiscoveredEntry[] = [];

      for (const entry of allEntries) {
        if (entry.isPrivateOrCheckout || !isAllowedByRobots(entry.pathname, robotsPolicy)) {
          coverage.skipped++;
          continue;
        }
        if (eligibleToFetch.length >= budget.maxLightweightPages) {
          coverage.skipped++;
          continue;
        }
        eligibleToFetch.push(entry);
      }

      let cursor = 0;
      const workerCount = Math.max(1, Math.min(budget.concurrency || 4, 4));
      const processEntry = async (entry: DiscoveredEntry) => {
        if (fetchQueue.isCancelled()) return;

        const prevPage = prevPageMap.get(entry.normalizedUrl);
        // Reuse homepage fetch if this is the homepage
        const fetchRes =
          entry.pathname === '/' && homeFetch.status > 0
            ? homeFetch
            : await fetchQueue.fetchUrl(entry.sourceUrl, {
              maxRedirects: 5,
              timeoutMs: 10000,
              ifNoneMatch: prevPage?.etag,
              ifModifiedSince: prevPage?.lastModifiedHeader,
            });

        if (entry.pathname !== '/') {
          coverage.requested++;
        }

        if (fetchRes.status === 304 && prevPage) {
          this.db.upsertPage({
            ...prevPage,
            pageId: `${crawlId}:${entry.normalizedUrl}`,
            crawlId,
            inSitemap: entry.inSitemap,
            inNav: entry.inNav,
          });
          coverage.extracted++;
          lightweightExtractedCount++;
          return;
        }

        if (fetchRes.blockedOrUnavailable) {
          coverage.blockedOrUnavailable++;
          const existingPage = this.db.getPages(crawlId).find((p) => p.normalizedUrl === entry.normalizedUrl);
          if (existingPage) {
            existingPage.status = fetchRes.status;
            this.db.upsertPage(existingPage);
          }
          return;
        }

        lightweightExtractedCount++;

        const extracted = extractFromHtml({
          crawlId,
          sourceUrl: entry.sourceUrl,
          finalUrl: fetchRes.finalUrl || entry.sourceUrl,
          siteDomain: domain,
          status: fetchRes.status,
          redirectChain: fetchRes.redirectChain,
          headers: fetchRes.headers,
          html: fetchRes.bodyText,
          fingerprint: fetchRes.fingerprint,
          discoverySource: entry.discoverySource,
          sitemapSource: entry.sitemapSource,
          lastmod: entry.lastmod,
          depth: entry.depth,
          inSitemap: entry.inSitemap,
          inNav: entry.inNav,
          extractionMethod: budget.maxLevel === 'A' ? 'A' : 'B',
        });

        if (extracted.page.wordCount < 15 && fetchRes.status === 200) {
          coverage.partiallyExtracted++;
        } else {
          coverage.extracted++;
        }

        this.db.runInTransaction(() => {
          if (budget.storeRawHtml && fetchRes.bodyText) {
            this.db.saveHtmlSnapshot(crawlId, entry.normalizedUrl, fetchRes.bodyText, budget.snapshotRetentionDays);
          }

          this.db.upsertPage(extracted.page);

          for (const link of extracted.links) {
            this.db.insertLink(link);
            if (link.linkType === 'internal') {
              const newlyAdded = registerDiscoveredUrl(link.destinationUrl, 'internal_link', entry.depth + 1);
              if (
                newlyAdded &&
                eligibleToFetch.length < budget.maxLightweightPages &&
                !eligibleToFetch.includes(newlyAdded) &&
                !newlyAdded.isPrivateOrCheckout &&
                isAllowedByRobots(newlyAdded.pathname, robotsPolicy)
              ) {
                eligibleToFetch.push(newlyAdded);
              }
            }
          }

          for (const img of extracted.images) {
            this.db.insertImage(img);
          }
          for (const sc of extracted.schemas) {
            this.db.insertSchema(sc);
          }
          if (extracted.product) {
            this.db.upsertProduct(extracted.product);
          }
          for (const v of extracted.variants) {
            this.db.upsertVariant(v);
          }
          if (extracted.collection) {
            this.db.upsertCollection(extracted.collection);
          }
          if (extracted.content) {
            this.db.upsertContent(extracted.content);
          }
          for (const tech of extracted.technologies) {
            this.db.insertTechnology(tech);
          }
          for (const obs of extracted.observations) {
            this.db.insertObservation(obs);
          }

          crawlRecord.coverage = { ...coverage };
          this.db.upsertCrawl(crawlRecord);
        });
      };

      const workers = Array.from({ length: workerCount }, async () => {
        while (cursor < eligibleToFetch.length && !fetchQueue.isCancelled()) {
          const idx = cursor++;
          const targetEntry = eligibleToFetch[idx];
          if (targetEntry) {
            await processEntry(targetEntry);
          }
        }
      });
      await Promise.all(workers);

      // STEP 6: Reconcile Link Graph (inbound link counts, broken internal links, sitemap error/redirect counts)
      this.reconcileGraphAndSitemapMetrics(crawlId);

      // STEP 7: Level C Representative Deep Extraction (when maxLevel === 'C')
      if (budget.maxLevel === 'C' && !fetchQueue.isCancelled()) {
        await this.runLevelCSampling(crawlId, budget, coverage);
      }

      crawlRecord.status = fetchQueue.isCancelled() ? 'cancelled' : 'completed';
      crawlRecord.endTime = new Date().toISOString();
      crawlRecord.coverage = { ...coverage };
      this.db.upsertCrawl(crawlRecord);

      this.db.upsertWebsite({
        domain,
        platform: crawlRecord.platform,
        latestCrawlId: crawlId,
        settingsJson: JSON.stringify(budget),
        createdAt: startTime,
        updatedAt: crawlRecord.endTime,
      });

      return crawlRecord;
    } catch (err) {
      crawlRecord.status = fetchQueue.isCancelled() ? 'cancelled' : 'failed';
      crawlRecord.endTime = new Date().toISOString();
      this.db.upsertCrawl(crawlRecord);
      throw err;
    } finally {
      this.activeQueues.delete(crawlId);
    }
  }

  private reconcileGraphAndSitemapMetrics(crawlId: string): void {
    this.db.runInTransaction(() => {
      const pages = this.db.getPages(crawlId);
      const links = this.db.getLinks(crawlId);
      const collections = this.db.getCollections(crawlId);
      const contents = this.db.getContents(crawlId);
      const sitemaps = this.db.getSitemaps(crawlId);

      const pageByNormUrl = new Map<string, PageRecord>();
      for (const p of pages) {
        pageByNormUrl.set(p.normalizedUrl, p);
      }

      const inboundCounts = new Map<string, number>();
      for (const link of links) {
        if (link.linkType !== 'internal') continue;
        const targetPage = pageByNormUrl.get(link.destinationNormalizedUrl);
        if (targetPage) {
          // Only count links from other pages
          const srcNorm = normalizeUrl(link.sourceUrl)?.normalizedUrl;
          if (srcNorm !== link.destinationNormalizedUrl) {
            inboundCounts.set(
              link.destinationNormalizedUrl,
              (inboundCounts.get(link.destinationNormalizedUrl) ?? 0) + 1
            );
          }
          link.targetPageType = targetPage.pageType;
          link.statusCode = targetPage.status;
          link.isBroken = targetPage.status >= 400;
          this.db.insertLink(link);
        }
      }

      for (const p of pages) {
        p.inboundLinkCount = inboundCounts.get(p.normalizedUrl) ?? 0;
        this.db.upsertPage(p);
      }

      for (const col of collections) {
        col.inboundLinkCount = inboundCounts.get(col.normalizedUrl) ?? 0;
        this.db.upsertCollection(col);
      }

      for (const cnt of contents) {
        cnt.inboundLinkCount = inboundCounts.get(cnt.normalizedUrl) ?? 0;
        this.db.upsertContent(cnt);
      }

      for (const sm of sitemaps) {
        if (sm.isIndex) continue;
        let errCount = 0;
        let redirCount = 0;
        for (const u of sm.declaredUrls) {
          const n = normalizeUrl(u);
          if (!n) continue;
          const p = pageByNormUrl.get(n.normalizedUrl);
          if (p) {
            if (p.status >= 400) errCount++;
            if (p.redirectChain.length > 0 || (p.status >= 300 && p.status < 400)) redirCount++;
          }
        }
        sm.errorUrlCount = errCount;
        sm.redirectUrlCount = redirCount;
        this.db.upsertSitemap(sm);
      }
    });
  }

  private async runLevelCSampling(
    crawlId: string,
    budget: CrawlBudgetConfig,
    coverage: CoverageCounters
  ): Promise<void> {
    const pages = this.db.getPages(crawlId).filter((p) => p.status === 200);
    const sampledPages: PageRecord[] = [];

    const pickSample = (candidates: PageRecord[], maxCount: number) => {
      // Sample evenly across distinct templates first
      const byTemplate = new Map<string, PageRecord[]>();
      for (const c of candidates) {
        const arr = byTemplate.get(c.templateId) ?? [];
        arr.push(c);
        byTemplate.set(c.templateId, arr);
      }
      const picked: PageRecord[] = [];
      let round = 0;
      while (picked.length < maxCount) {
        let addedInRound = false;
        for (const list of byTemplate.values()) {
          if (round < list.length && picked.length < maxCount) {
            picked.push(list[round]);
            addedInRound = true;
          }
        }
        if (!addedInRound) break;
        round++;
      }
      return picked;
    };

    sampledPages.push(
      ...pickSample(
        pages.filter((p) => p.pageType === 'product'),
        budget.maxDeepProductPages
      )
    );
    sampledPages.push(
      ...pickSample(
        pages.filter((p) => p.pageType === 'collection' || p.pageType === 'category'),
        budget.maxDeepCollectionPages
      )
    );
    sampledPages.push(
      ...pickSample(
        pages.filter((p) => p.pageType === 'blog' || p.pageType === 'landing'),
        budget.maxDeepContentPages
      )
    );
    const homepage = pages.find((p) => p.pageType === 'homepage');
    if (homepage && sampledPages.length < budget.maxDeepProductPages + budget.maxBrowserPerfPages) {
      sampledPages.push(homepage);
    }

    const uniqueSampled = Array.from(new Map(sampledPages.map((p) => [p.normalizedUrl, p])).values());

    for (const sp of uniqueSampled) {
      const snapshotHtml = this.db.getHtmlSnapshot(crawlId, sp.normalizedUrl) ?? '';
      const renderRes = await renderRepresentativePageLevelC({
        crawlId,
        url: sp.sourceUrl,
        templateId: sp.templateId,
        pageType: sp.pageType,
        fallbackHtml: snapshotHtml,
      });

      sp.extractionMethod = 'C';
      sp.confidence = 0.99;
      this.db.upsertPage(sp);

      for (const obs of renderRes.observations) {
        this.db.insertObservation(obs);
      }
      coverage.deeplyInspected++;
    }
  }
}

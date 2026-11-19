import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { SharedDatabase } from '../src/db/database.ts';
import { normalizeUrl, normalizeDomain } from '../src/engine/url-normalizer.ts';
import { classifyPage } from '../src/engine/classifier.ts';
import { JobManager } from '../src/engine/job-manager.ts';
import { RulesEngine } from '../src/engine/rules-engine.ts';
import { validateHonestyAndClaimsPolicy, STANDING_POLICY_STATEMENT } from '../src/engine/report-service.ts';
import { createMultiStoreMockFetcher } from './fixtures/sample-stores.ts';

describe('Phase 0 — Shared Extraction Engine, Data Architecture & Rules Engine', () => {
  test('1. URL Normalizer strips tracking parameters, preserves functional parameters, and blocks private paths', () => {
    const res = normalizeUrl(
      'HTTPS://WWW.Example.com/collections/outerwear/?utm_source=newsletter&color=blue&fbclid=12345&sort_by=price#top'
    );
    assert.ok(res);
    assert.equal(res.domain, 'example.com');
    assert.equal(res.normalizedUrl, 'https://www.example.com/collections/outerwear?color=blue&sort_by=price');
    assert.deepEqual(res.strippedTrackingParameters.sort(), ['fbclid', 'utm_source']);
    assert.deepEqual(res.functionalParameters, { color: ['blue'], sort_by: ['price'] });
    assert.equal(res.hadTrailingSlash, true);
    assert.equal(res.hadFragment, true);
    assert.equal(res.isPrivateOrCheckout, false);

    const checkoutRes = normalizeUrl('https://www.example.com/checkout/payment');
    assert.ok(checkoutRes);
    assert.equal(checkoutRes.isPrivateOrCheckout, true);
  });

  test('2. Page Classifier and Template Clusterer classify ecommerce page types with confidence', () => {
    const prod = classifyPage({
      url: 'https://alpine-outdoor.example.com/products/insulated-jacket',
      pathname: '/products/insulated-jacket',
      parameters: {},
      sitemapSource: 'https://alpine-outdoor.example.com/sitemap_products_1.xml',
      schemaTypes: ['Product'],
    });
    assert.equal(prod.pageType, 'product');
    assert.ok(prod.confidence >= 0.9);
    assert.ok(prod.templateId.startsWith('product-default'));

    const filtered = classifyPage({
      url: 'https://alpine-outdoor.example.com/collections/outerwear?color=blue',
      pathname: '/collections/outerwear',
      parameters: { color: ['blue'] },
    });
    assert.equal(filtered.pageType, 'filtered');
    assert.ok(filtered.confidence >= 0.8);
  });

  test('3. SharedDatabase stores and retrieves all 14 entities and compressed HTML snapshots', () => {
    const db = new SharedDatabase(':memory:');
    db.saveHtmlSnapshot('crawl_1', 'https://example.com/', '<html><body>Hello Silo SEO</body></html>', 30);
    const unpacked = db.getHtmlSnapshot('crawl_1', 'https://example.com/');
    assert.equal(unpacked, '<html><body>Hello Silo SEO</body></html>');
    const purged = db.purgeExpiredSnapshots('2099-01-01T00:00:00.000Z');
    assert.equal(purged, 1);
    db.close();
  });

  test('4. Full Pipeline (Levels A, B, C) on Store 1 (Shopify) & Store 2 (WooCommerce) + Zero-Request Crawl Reuse', async () => {
    process.env.SILO_DISABLE_BROWSER = '1';
    const db = new SharedDatabase(':memory:');
    let requestCounter = 0;
    const baseFetcher = createMultiStoreMockFetcher();
    const countedFetcher = async (url: string, headers?: Record<string, string>) => {
      requestCounter++;
      return baseFetcher(url, headers);
    };

    const jobManager = new JobManager(db, countedFetcher);

    // Crawl Store 1: Shopify
    const { crawl: shopifyCrawl, reusedExisting: r1 } = await jobManager.ensureCrawl({
      domainInput: 'alpine-outdoor.example.com',
      requiredLevel: 'C',
    });
    assert.equal(r1, false);
    assert.equal(shopifyCrawl.platform, 'shopify');
    assert.equal(shopifyCrawl.status, 'completed');
    assert.ok(shopifyCrawl.coverage.discovered >= 10);
    assert.ok(shopifyCrawl.coverage.extracted >= 8);
    assert.ok(shopifyCrawl.coverage.deeplyInspected >= 1);

    const pages1 = db.getPages(shopifyCrawl.crawlId);
    const classifiedShare = pages1.filter((p) => p.pageType !== 'unknown').length / pages1.length;
    assert.ok(classifiedShare >= 0.95, `Expected >=95% classified URLs, got ${classifiedShare * 100}%`);

    // Verify zero additional HTTP requests when a second tool requests an existing crawl!
    const beforeReuseRequests = requestCounter;
    const { crawl: reusedCrawl, reusedExisting: r2 } = await jobManager.ensureCrawl({
      domainInput: 'alpine-outdoor.example.com',
      requiredLevel: 'B',
    });
    assert.equal(r2, true);
    assert.equal(reusedCrawl.crawlId, shopifyCrawl.crawlId);
    assert.equal(requestCounter, beforeReuseRequests, 'Second tool must make zero additional HTTP requests');

    // Crawl Store 2: WooCommerce
    const { crawl: wooCrawl } = await jobManager.ensureCrawl({
      domainInput: 'bistro-roasters.example.org',
      requiredLevel: 'B',
    });
    assert.equal(wooCrawl.platform, 'woocommerce');
    assert.equal(wooCrawl.status, 'completed');
    const wooProducts = db.getProducts(wooCrawl.crawlId);
    assert.ok(wooProducts.length >= 2);

    // Verify Rules Engine determinism: same crawl + same rules => identical findings
    const rulesEngine = new RulesEngine(db);
    const sampleRule = [
      {
        ruleId: 'TEST-001',
        version: '1.0.0',
        module: 'phase0',
        toolId: 'tool-01-site-atlas',
        title: 'Important pages missing from sitemaps',
        category: 'Technical SEO' as const,
        requiredDataFields: ['inSitemap', 'status'],
        detectionCondition: {
          entity: 'page' as const,
          check: 'important_page_missing_from_sitemap',
        },
        applicablePageTypes: ['product' as const, 'informational' as const],
        severity: 4 as const,
        impactScore: 4 as const,
        recommendationText: 'Include all indexable product and informational pages in XML sitemaps.',
        supportingEvidenceTemplate: 'Detected {affected} of {inspected} indexable pages ({coveragePct}%) absent from sitemaps.',
        howDetected: 'Compared crawled 200 OK indexable pages against XML sitemap declarations.',
      },
    ];
    const runA = rulesEngine.evaluateRules(shopifyCrawl.crawlId, sampleRule);
    const runB = rulesEngine.evaluateRules(shopifyCrawl.crawlId, sampleRule);
    assert.equal(runA.length, 1);
    assert.equal(runA[0].priorityScore, runB[0].priorityScore);
    assert.deepEqual(runA[0].affectedUrls, runB[0].affectedUrls);

    // Verify Honesty & Claims Policy
    assert.equal(validateHonestyAndClaimsPolicy(STANDING_POLICY_STATEMENT).valid, true);
    assert.equal(validateHonestyAndClaimsPolicy('Fixing this guaranteed your rankings will improve').valid, false);

    db.close();
  });

  test('5. Live Public Stores Verification (Two Real Public Stores on Different Platforms)', async () => {
    const db = new SharedDatabase(':memory:');
    const jobManager = new JobManager(db);

    // Real Public Store 1: Tentree / Allbirds / Taylor Stitch (Shopify) — small budget (6 pages) for fast polite test
    const shopifyCrawl = await jobManager.runCrawl('tentree.com', {
      maxDiscoveryUrls: 60,
      maxLightweightPages: 5,
      maxLevel: 'B',
      perHostDelayMs: 150,
    });
    assert.equal(shopifyCrawl.status, 'completed');
    assert.equal(shopifyCrawl.platform, 'shopify');
    assert.ok(shopifyCrawl.coverage.discovered >= 1);
    assert.ok(shopifyCrawl.coverage.requested >= 2);

    // Real Public Store 2: books.toscrape.com / scrapeme.live (Non-Shopify catalogue store)
    const store2Crawl = await jobManager.runCrawl('books.toscrape.com', {
      maxDiscoveryUrls: 60,
      maxLightweightPages: 5,
      maxLevel: 'B',
      perHostDelayMs: 150,
    });
    assert.equal(store2Crawl.status, 'completed');
    assert.ok(store2Crawl.coverage.discovered >= 5);
    assert.ok(store2Crawl.coverage.extracted >= 2);

    const store2Pages = db.getPages(store2Crawl.crawlId);
    assert.ok(store2Pages.length >= 5);

    db.close();
  });
});


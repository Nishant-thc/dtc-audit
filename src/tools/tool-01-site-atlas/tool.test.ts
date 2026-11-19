import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { SharedDatabase } from '../../db/database.ts';
import { JobManager } from '../../engine/job-manager.ts';
import { toCsv, renderPrintableReportHtml, validateHonestyAndClaimsPolicy } from '../../engine/report-service.ts';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool01SiteAtlas } from './index.ts';

describe('Phase 1 — Tool 1: Site Atlas (Website Architecture Mapper)', () => {
  test('1. Verifies all 8 architecture tables, rules ATLAS-001..004, and exports on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('B');

    // Run on Store 1 (Shopify: alpine-outdoor.example.com)
    const res1 = tool01SiteAtlas.analyze(db, shopifyCrawl, false);
    assert.equal(res1.manifest.toolId, 'tool-01-site-atlas');
    assert.equal(res1.manifest.number, 1);
    assert.equal(res1.headlineMetrics.length, 4);
    assert.ok(res1.coveragePanel.classifiedPercentage >= 95);

    // Verify all 8 tables exist and are populated
    const tableIds = res1.tables.map((t) => t.id);
    assert.deepEqual(tableIds, [
      'url_inventory',
      'page_type_breakdown',
      'sitemap_coverage',
      'sitemap_vs_nav_comparison',
      'hierarchy_map',
      'orphan_candidates',
      'duplicate_url_candidates',
      'redirect_and_error_urls',
    ]);

    const ruleIds1 = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds1.has('ATLAS-001'), 'Detects ATLAS-001 (indexable pages missing from sitemaps)');
    assert.ok(ruleIds1.has('ATLAS-002'), 'Detects ATLAS-002 (sitemap URLs returning 404/301)');
    assert.ok(ruleIds1.has('ATLAS-003'), 'Detects ATLAS-003 (missing or inconsistent canonicals)');
    assert.ok(ruleIds1.has('ATLAS-004'), 'Detects ATLAS-004 (redirect chains)');

    for (const f of res1.findings) {
      assert.ok(f.affectedUrls.length > 0, `Finding ${f.ruleId} must link to affected URLs`);
      assert.ok(f.priorityScore >= 1 && f.priorityScore <= 125);
      assert.equal(validateHonestyAndClaimsPolicy(f.recommendationText).valid, true);
      assert.equal(validateHonestyAndClaimsPolicy(f.evidenceSummary).valid, true);
    }

    // Run on Store 2 (WooCommerce: bistro-roasters.example.org)
    const res2 = tool01SiteAtlas.analyze(db, wooCrawl, true);
    assert.equal(res2.reusedExistingCrawl, true);
    assert.equal(res2.crawl.platform, 'woocommerce');
    assert.ok(res2.tables[0].rows.length >= 5);

    // Verify CSV and Printable HTML report exports
    for (const tbl of res1.tables) {
      if (tbl.rows.length > 0) {
        const csv = toCsv(tbl.rows);
        assert.ok(csv.length > 10, `CSV export for table ${tbl.id} should be non-empty`);
      }
    }

    const html = renderPrintableReportHtml({
      toolName: res1.manifest.name,
      toolPromise: res1.manifest.oneLinePromise,
      crawl: res1.crawl,
      headlineMetrics: res1.headlineMetrics,
      findings: res1.findings,
      tables: res1.tables,
    });
    assert.ok(html.includes('Priority scores rank suggested work; they do not predict revenue or rankings.'));

    db.close();
  });

  test('2. Live Public Stores End-to-End Verification for Tool 1 (Site Atlas)', async () => {
    const db = new SharedDatabase(':memory:');
    const jobManager = new JobManager(db);

    const crawlA = await jobManager.runCrawl('tentree.com', {
      maxDiscoveryUrls: 50,
      maxLightweightPages: 5,
      maxLevel: 'B',
      perHostDelayMs: 150,
    });
    const resA = tool01SiteAtlas.analyze(db, crawlA);
    assert.equal(resA.crawl.platform, 'shopify');
    assert.ok(resA.tables[0].rows.length >= 1);

    const crawlB = await jobManager.runCrawl('books.toscrape.com', {
      maxDiscoveryUrls: 50,
      maxLightweightPages: 5,
      maxLevel: 'B',
      perHostDelayMs: 150,
    });
    const resB = tool01SiteAtlas.analyze(db, crawlB);
    assert.ok(resB.tables[0].rows.length >= 5);
    assert.ok(resB.coveragePanel.classifiedPercentage >= 95);

    db.close();
  });
});

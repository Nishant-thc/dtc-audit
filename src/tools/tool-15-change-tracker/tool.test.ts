import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool15ChangeTracker } from './index.ts';

describe('Tool 15 — Change Tracker', () => {
  test('Tracks SHA-256 fingerprint and title diffs across crawls', async () => {
    const { db, jobManager, shopifyCrawl } = await setupTwoStoreTestDb('B');

    // Run a second crawl and modify one page title to simulate a site change
    const { crawl: crawl2 } = await jobManager.ensureCrawl({
      domainInput: 'alpine-outdoor.example.com',
      requiredLevel: 'B',
      forceRecrawl: true,
      budget: { perHostDelayMs: 1, concurrency: 8, maxLevel: 'B' },
    });
    const pages2 = db.getPages(crawl2.crawlId);
    pages2[0].title = 'Updated Homepage Title After Deploy';
    pages2[0].contentFingerprint = 'changed_hash_12345';
    db.upsertPage(pages2[0]);

    const res = tool15ChangeTracker.analyze(db, crawl2, false);
    assert.equal(res.manifest.toolId, 'tool-15-change-tracker');
    assert.ok(res.tables[0].rows.length >= 1, 'Should detect the modified page between crawl 1 and crawl 2');
    assert.notEqual(crawl2.crawlId, shopifyCrawl.crawlId);
    db.close();
  });
});


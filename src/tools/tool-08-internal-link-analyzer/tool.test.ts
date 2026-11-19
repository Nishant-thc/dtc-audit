import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool08InternalLinkAnalyzer } from './index.ts';

describe('Tool 8 — Internal Link Graph Analyzer', () => {
  test('Unit tests for rules LINK-001 through LINK-003 + End-to-End on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('B');

    // Add a deep page (depth 4) on shopifyCrawl to verify LINK-002 unit detection alongside LINK-001 and LINK-003
    const pages = db.getPages(shopifyCrawl.crawlId);
    const blogPage = pages.find((p) => p.sourceUrl.includes('old-camping-checklist-2021'));
    if (blogPage) {
      blogPage.depth = 4;
      db.upsertPage(blogPage);
    }

    const res1 = tool08InternalLinkAnalyzer.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-08-internal-link-analyzer');

    const ruleIds = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds.has('LINK-001'), 'Detects orphan page (old-camping-checklist-2021 has 0 inbound links)');
    assert.ok(ruleIds.has('LINK-002'), 'Detects deep page (>3 clicks)');
    assert.ok(ruleIds.has('LINK-003'), 'Detects broken internal link to /products/discontinued-gloves (404)');

    const res2 = tool08InternalLinkAnalyzer.analyze(db, wooCrawl, true);
    assert.ok(res2.tables[0].rows.length >= 4);

    db.close();
  });
});


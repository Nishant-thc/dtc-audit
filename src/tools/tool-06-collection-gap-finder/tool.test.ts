import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool06CollectionGapFinder } from './index.ts';

describe('Tool 6 — Collection Content Gap Finder', () => {
  test('Unit tests for rules COLL-001 through COLL-003 + End-to-End on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('B');

    const res1 = tool06CollectionGapFinder.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-06-collection-gap-finder');

    const ruleIds = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds.has('COLL-001'), 'Detects missing intro copy on /collections/footwear');
    assert.ok(ruleIds.has('COLL-002'), 'Detects <3 products on /collections/footwear');
    assert.ok(ruleIds.has('COLL-003'), 'Detects <2 inbound links on /collections/footwear');

    const res2 = tool06CollectionGapFinder.analyze(db, wooCrawl, true);
    assert.ok(res2.tables[0].rows.length >= 1);

    db.close();
  });
});


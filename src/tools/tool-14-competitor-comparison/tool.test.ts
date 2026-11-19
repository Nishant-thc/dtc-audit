import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool14CompetitorComparison } from './index.ts';

describe('Tool 14 — Competitor Comparison View', () => {
  test('Compares two crawled domains side by side using public coverage data', async () => {
    const { db, shopifyCrawl } = await setupTwoStoreTestDb('B');
    const res = tool14CompetitorComparison.analyze(db, shopifyCrawl, true);
    assert.equal(res.manifest.toolId, 'tool-14-competitor-comparison');
    assert.ok(res.tables[0].rows.length >= 10);
    assert.equal(res.tables[0].rows[0].primaryDomain, 'shopify');
    assert.equal(res.tables[0].rows[0].comparisonDomain, 'woocommerce');
    db.close();
  });
});


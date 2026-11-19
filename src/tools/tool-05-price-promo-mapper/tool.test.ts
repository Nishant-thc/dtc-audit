import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool05PricePromoMapper } from './index.ts';

describe('Tool 5 — Price & Promotion Mapper', () => {
  test('Unit tests for rules PRICE-001 through PRICE-003 + End-to-End on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('B');

    const res1 = tool05PricePromoMapper.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-05-price-promo-mapper');

    const ruleIds = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds.has('PRICE-001'), 'Detects out-of-stock trail-boots');
    assert.ok(ruleIds.has('PRICE-002'), 'Detects >=50% discount on ultralight-tent ($399 vs $899)');
    assert.ok(ruleIds.has('PRICE-003'), 'Detects products without bundle/subscription');

    const res2 = tool05PricePromoMapper.analyze(db, wooCrawl, true);
    assert.ok(res2.findings.some((f) => f.ruleId === 'PRICE-001'));

    db.close();
  });
});


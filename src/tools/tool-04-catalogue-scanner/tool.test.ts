import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool04CatalogueScanner } from './index.ts';

describe('Tool 4 — Catalogue Completeness Scanner', () => {
  test('Unit tests for rules CAT-001 through CAT-005 + End-to-End on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('B');

    const res1 = tool04CatalogueScanner.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-04-catalogue-scanner');

    const ruleIds = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds.has('CAT-001'), 'Detects thin product descriptions (<30w)');
    assert.ok(ruleIds.has('CAT-002'), 'Detects missing product specifications');
    assert.ok(ruleIds.has('CAT-003'), 'Detects missing product image alt text');
    assert.ok(ruleIds.has('CAT-004'), 'Detects missing product reviews');
    assert.ok(ruleIds.has('CAT-005'), 'Detects low overall completeness score (<70)');

    const res2 = tool04CatalogueScanner.analyze(db, wooCrawl, true);
    assert.ok(res2.tables[0].rows.length >= 2);

    db.close();
  });
});


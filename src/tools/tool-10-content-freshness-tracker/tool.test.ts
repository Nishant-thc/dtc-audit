import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool10ContentFreshnessTracker } from './index.ts';

describe('Tool 10 — Content Freshness & Completeness Tracker', () => {
  test('Unit tests for rules FRESH-001 & FRESH-002 + End-to-End on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('B');

    const res1 = tool10ContentFreshnessTracker.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-10-content-freshness-tracker');

    const ruleIds1 = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds1.has('FRESH-001'), 'Detects stale 2021 article');
    assert.ok(ruleIds1.has('FRESH-002'), 'Detects thin/unstructured article without Article schema');

    const res2 = tool10ContentFreshnessTracker.analyze(db, wooCrawl, true);
    assert.ok(res2.findings.some((f) => f.ruleId === 'FRESH-002'));

    db.close();
  });
});


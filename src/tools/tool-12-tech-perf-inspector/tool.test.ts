import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool12TechPerfInspector } from './index.ts';

describe('Tool 12 — Tech Stack & Performance Inspector', () => {
  test('Unit tests for rules PERF-001 & PERF-002 + End-to-End on Two Sample Stores (Level C)', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('C');

    const res1 = tool12TechPerfInspector.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-12-tech-perf-inspector');

    const ruleIds1 = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds1.has('PERF-001'), 'Detects >5 third-party scripts on Shopify homepage');
    assert.ok(ruleIds1.has('PERF-002'), 'Detects missing lazy loading on trail-boots');

    const res2 = tool12TechPerfInspector.analyze(db, wooCrawl, true);
    assert.ok(res2.findings.some((f) => f.ruleId === 'PERF-002'));

    db.close();
  });
});


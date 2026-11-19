import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool11ConversionAuditor } from './index.ts';

describe('Tool 11 — Conversion Element Auditor', () => {
  test('Unit tests for rules CRO-001 & CRO-002 + End-to-End on Two Sample Stores (Level C)', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('C');

    const res1 = tool11ConversionAuditor.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-11-conversion-auditor');

    const ruleIds1 = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds1.has('CRO-001'), 'Detects pages missing trust or delivery signals');
    assert.ok(ruleIds1.has('CRO-002'), 'Detects product pages missing review section');

    const res2 = tool11ConversionAuditor.analyze(db, wooCrawl, true);
    assert.ok(res2.findings.some((f) => f.ruleId === 'CRO-001'));

    db.close();
  });
});


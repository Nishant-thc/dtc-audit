import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool16ImageAuditor } from './index.ts';

describe('Tool 16 — Image Optimisation Auditor', () => {
  test('Unit tests for rules IMG-001 through IMG-003 + End-to-End on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('B');

    const res1 = tool16ImageAuditor.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-16-image-auditor');

    const ruleIds1 = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds1.has('IMG-001'), 'Detects missing alt text on boots-1.jpg');
    assert.ok(ruleIds1.has('IMG-002'), 'Detects legacy .jpg format');
    assert.ok(ruleIds1.has('IMG-003'), 'Detects missing width/height on tent-1.webp');

    const res2 = tool16ImageAuditor.analyze(db, wooCrawl, true);
    assert.ok(res2.findings.some((f) => f.ruleId === 'IMG-001'));

    db.close();
  });
});


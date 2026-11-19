import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool17HreflangAuditor } from './index.ts';

describe('Tool 17 — Hreflang & International Auditor', () => {
  test('Unit test for rule INTL-001 + End-to-End on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('B');

    const res1 = tool17HreflangAuditor.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-17-hreflang-auditor');
    assert.ok(res1.findings.some((f) => f.ruleId === 'INTL-001'));

    const res2 = tool17HreflangAuditor.analyze(db, wooCrawl, true);
    assert.ok(res2.tables[0].rows.length >= 4);

    db.close();
  });
});


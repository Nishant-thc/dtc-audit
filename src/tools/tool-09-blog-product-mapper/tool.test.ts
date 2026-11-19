import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool09BlogProductMapper } from './index.ts';

describe('Tool 9 — Blog-to-Product Link Mapper', () => {
  test('Unit tests for rules BLOG-001 & BLOG-002 + End-to-End on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('B');

    const res1 = tool09BlogProductMapper.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-09-blog-product-mapper');

    const ruleIds1 = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds1.has('BLOG-001'), 'Detects blog article without product links (old-camping-checklist-2021)');
    assert.ok(ruleIds1.has('BLOG-002'), 'Detects products without editorial links (trail-boots, ultralight-tent)');

    const res2 = tool09BlogProductMapper.analyze(db, wooCrawl, true);
    assert.ok(res2.findings.some((f) => f.ruleId === 'BLOG-001'));

    db.close();
  });
});


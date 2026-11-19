import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool07FacetedNavAuditor } from './index.ts';

describe('Tool 7 — Faceted Navigation & Parameter Auditor', () => {
  test('Unit tests for rules FACET-001 & FACET-002 + End-to-End on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('B');

    const res1 = tool07FacetedNavAuditor.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-07-faceted-nav-auditor');

    const ruleIds1 = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds1.has('FACET-001'), 'Detects self-canonicalized filtered URL on Shopify store');
    assert.ok(ruleIds1.has('FACET-002'), 'Detects filtered URL declared in sitemap');

    const res2 = tool07FacetedNavAuditor.analyze(db, wooCrawl, true);
    assert.ok(res2.findings.some((f) => f.ruleId === 'FACET-001'));

    db.close();
  });
});


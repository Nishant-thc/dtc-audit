import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool03SchemaInspector } from './index.ts';

describe('Tool 3 — Schema Coverage Inspector', () => {
  test('Unit tests for rules SCHEMA-001 through SCHEMA-004 + End-to-End on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('B');

    const res1 = tool03SchemaInspector.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-03-schema-inspector');

    const ruleIds = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds.has('SCHEMA-001'), 'Detects missing Product schema on ultralight-tent');
    assert.ok(ruleIds.has('SCHEMA-002'), 'Detects incomplete Product/Offer schema on trail-boots');
    assert.ok(ruleIds.has('SCHEMA-003'), 'Detects missing BreadcrumbList schema');
    assert.ok(ruleIds.has('SCHEMA-004'), 'Detects price mismatch ($150 schema vs $180 visible) on trail-boots');

    const res2 = tool03SchemaInspector.analyze(db, wooCrawl, true);
    assert.ok(res2.findings.some((f) => f.ruleId === 'SCHEMA-001'));

    db.close();
  });
});


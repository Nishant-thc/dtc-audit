import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { tool02MetadataAuditor } from './index.ts';

describe('Tool 2 — Metadata & Indexability Auditor', () => {
  test('Unit tests for rules META-001 through META-006 + End-to-End on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('B');

    const res1 = tool02MetadataAuditor.analyze(db, shopifyCrawl, true);
    assert.equal(res1.manifest.toolId, 'tool-02-metadata-auditor');

    const ruleIds = new Set(res1.findings.map((f) => f.ruleId));
    assert.ok(ruleIds.has('META-002'), 'Detects duplicate titles (Buy Gear Online)');
    assert.ok(ruleIds.has('META-003'), 'Detects missing/short meta descriptions');
    assert.ok(ruleIds.has('META-005'), 'Detects multiple H1 tags on trail-boots');
    assert.ok(ruleIds.has('META-006'), 'Detects accidental noindex on ultralight-tent');

    // Also test META-001 and META-004 unit detection by inserting a page with short title and duplicate description
    const pages = db.getPages(shopifyCrawl.crawlId);
    const samplePage = pages[0];
    db.upsertPage({
      ...samplePage,
      pageId: `${shopifyCrawl.crawlId}:https://alpine-outdoor.example.com/pages/short-title-dup-desc`,
      sourceUrl: 'https://alpine-outdoor.example.com/pages/short-title-dup-desc',
      normalizedUrl: 'https://alpine-outdoor.example.com/pages/short-title-dup-desc',
      title: 'Hi',
      metaDescription: samplePage.metaDescription,
    });

    const res1Updated = tool02MetadataAuditor.analyze(db, shopifyCrawl, true);
    const updatedRuleIds = new Set(res1Updated.findings.map((f) => f.ruleId));
    assert.ok(updatedRuleIds.has('META-001'), 'Detects META-001 (<15 char title)');
    assert.ok(updatedRuleIds.has('META-004'), 'Detects META-004 (duplicate meta description)');

    const res2 = tool02MetadataAuditor.analyze(db, wooCrawl, true);
    assert.ok(res2.tables[0].rows.length >= 4);

    db.close();
  });
});


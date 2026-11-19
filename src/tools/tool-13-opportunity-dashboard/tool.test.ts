import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from '../../../tests/fixtures/test-harness.ts';
import { validateHonestyAndClaimsPolicy } from '../../engine/report-service.ts';
import { tool02MetadataAuditor } from '../tool-02-metadata-auditor/index.ts';
import { tool13OpportunityDashboard } from './index.ts';

describe('Tool 13 — Opportunity Dashboard & Report Builder', () => {
  test('Works with partial tool runs AND standalone full evaluation on Two Sample Stores', async () => {
    const { db, shopifyCrawl, wooCrawl } = await setupTwoStoreTestDb('C');

    // Case A: Only Tool 2 has run on wooCrawl -> Tool 13 aggregates Tool 2 findings without requiring all tools
    tool02MetadataAuditor.analyze(db, wooCrawl, true);
    const partialRes = tool13OpportunityDashboard.analyze(db, wooCrawl, true);
    assert.ok(partialRes.findings.length >= 1);
    assert.ok(partialRes.findings.every((f) => f.toolId === 'tool-02-metadata-auditor'));

    // Case B: Standalone full evaluation on shopifyCrawl (where 0 tools have run yet)
    const fullRes = tool13OpportunityDashboard.analyze(db, shopifyCrawl, true);
    assert.equal(fullRes.manifest.toolId, 'tool-13-opportunity-dashboard');
    assert.ok(fullRes.findings.length >= 15, `Expected >=15 aggregated findings, got ${fullRes.findings.length}`);

    // Verify descending priority sort and 100% evidence/affectedUrls + honesty policy compliance
    for (let i = 1; i < fullRes.findings.length; i++) {
      assert.ok(fullRes.findings[i - 1].priorityScore >= fullRes.findings[i].priorityScore);
    }
    for (const f of fullRes.findings) {
      assert.ok(f.affectedUrls.length > 0);
      assert.equal(validateHonestyAndClaimsPolicy(f.recommendationText).valid, true);
      assert.equal(validateHonestyAndClaimsPolicy(f.evidenceSummary).valid, true);
    }

    db.close();
  });
});

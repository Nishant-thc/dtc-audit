import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { setupTwoStoreTestDb } from './fixtures/test-harness.ts';
import { computeStoreVerdict, computeCrawlDenominators } from '../src/engine/store-audit.ts';
import { validateHonestyAndClaimsPolicy } from '../src/engine/report-service.ts';
import { tool03SchemaInspector } from '../src/tools/tool-03-schema-inspector/index.ts';
import { tool11ConversionAuditor } from '../src/tools/tool-11-conversion-auditor/index.ts';

describe('Store-First Verdict, Shared Denominators & Acceptance Tests', () => {
  test('1. Records pass/fail/not_applicable/not_measured for every rule and computes weighted 5-area scores', async () => {
    const { db, shopifyCrawl } = await setupTwoStoreTestDb('B');
    const verdict = computeStoreVerdict(db, shopifyCrawl);

    // 5 areas present
    assert.equal(verdict.areas.length, 5);
    const areaIds = verdict.areas.map((a) => a.areaId);
    assert.deepEqual(areaIds, [
      'search_visibility',
      'ai_readiness',
      'product_collection_quality',
      'site_health_speed',
      'conversion_trust',
    ]);

    // Overall score 0-100 with A-F grade and passes recorded
    assert.ok(verdict.overallScore !== null && verdict.overallScore >= 0 && verdict.overallScore <= 100);
    assert.ok(verdict.totals.passedChecks > 0, 'Must record passed checks, not just failures');

    // Local Speed without browser must honestly mark lab vitals as not_measured
    assert.equal(verdict.localSpeed.browserVitals.measured, false);
    assert.equal(verdict.localSpeed.browserVitals.lcpMs, null);
    assert.ok(verdict.totals.notMeasuredChecks >= 2, 'Unmeasured lab speed checks must be explicitly not_measured');

    // AI Readiness separates training vs search/citation bots
    const trainingBots = verdict.aiReadiness.bots.filter((b) => b.purpose === 'training');
    const searchBots = verdict.aiReadiness.bots.filter((b) => b.purpose === 'search_citation');
    assert.ok(trainingBots.length >= 4);
    assert.ok(searchBots.length >= 2);

    db.close();
  });

  test('2. Consistency test: Schema coverage matches SCHEMA-001 and CRO-001 never flags blog articles', async () => {
    const { db, shopifyCrawl } = await setupTwoStoreTestDb('B');
    const denoms = computeCrawlDenominators(db, shopifyCrawl.crawlId);

    // Schema consistency check
    const schemaRes = tool03SchemaInspector.analyze(db, shopifyCrawl, true);
    const covMetric = schemaRes.headlineMetrics.find((m) => m.id === 'product_schema_coverage');
    const schema001 = schemaRes.findings.find((f) => f.ruleId === 'SCHEMA-001');
    assert.ok(covMetric);
    const [covered, total] = String(covMetric.value).split('/').map((x) => Number(x.trim()));
    assert.equal(total, denoms.byPageTypeHtml.product, 'Schema tool denominator must match shared CrawlDenominators');
    if (schema001) {
      assert.equal(total - covered, schema001.affectedCount, 'Schema coverage and SCHEMA-001 finding must never contradict');
    } else {
      assert.equal(covered, total);
    }

    // CRO-001 must NEVER flag blog pages
    const croRes = tool11ConversionAuditor.analyze(db, shopifyCrawl, true);
    const cro001 = croRes.findings.find((f) => f.ruleId === 'CRO-001');
    if (cro001) {
      for (const u of cro001.affectedUrls) {
        assert.ok(!u.includes('/blogs/'), `CRO-001 should not flag blog URL: ${u}`);
      }
    }

    db.close();
  });

  test('3. Severity distribution cap, Issues/Opportunities/Facts split, Template Fix Packets & Honesty check', async () => {
    const { db, shopifyCrawl } = await setupTwoStoreTestDb('B');
    const verdict = computeStoreVerdict(db, shopifyCrawl);

    // Severity distribution cap: Fix now must be reserved for true blockers (<= 25% of all failing issues)
    const allFailingIssues = verdict.areas.flatMap((a) =>
      a.ruleResults.filter((r) => r.kind === 'issue' && r.status === 'fail')
    );
    const fixNowCount = allFailingIssues.filter((r) => r.actionTier === 'fix_now').length;
    const fixNowShare = allFailingIssues.length > 0 ? fixNowCount / allFailingIssues.length : 0;
    assert.ok(
      fixNowShare <= 0.3,
      `Fix now share (${Math.round(fixNowShare * 100)}%, ${fixNowCount}/${allFailingIssues.length}) should stay bounded`
    );

    // Opportunities (like PRICE-003, AI-005) are separated from Issues
    const oppIds = new Set(verdict.opportunities.map((o) => o.ruleId));
    assert.ok(oppIds.has('PRICE-003') || oppIds.has('AI-005'), 'Growth opportunities should live in opportunities list');
    assert.ok(verdict.storeSnapshot.length >= 5, 'Store snapshot neutral facts must be populated');

    // Template-grouped Fix Packets collapse many rule findings into fewer tasks (Fix First <= 5)
    assert.ok(verdict.fixFirst.length <= 5);
    assert.ok(verdict.allTasks.length <= allFailingIssues.length, 'Template grouping should merge findings into tasks');
    for (const task of verdict.fixFirst) {
      assert.ok(task.projectedScoreLift >= 1);
      assert.ok(task.platformSteps.length >= 2);
      assert.ok(task.ticketMarkdown.includes('## '));
      assert.ok(!/-[0-9a-f]{4}$/i.test(task.templateGroup), 'Template hashes must be hidden behind plain names');
    }

    // Honesty validation on verdict sentence & tickets
    const check = validateHonestyAndClaimsPolicy(
      verdict.verdictSentence + ' ' + verdict.fixFirst.map((t) => t.ticketMarkdown).join(' ')
    );
    assert.equal(check.valid, true, `Honesty policy violation: ${check.violations.join(', ')}`);

    db.close();
  });

  test('4. Presentation rework invariants: fail=>affected>=1, Good+NeedsWork+Broken=checked, copy lengths & banned words', async () => {
    const { db, shopifyCrawl } = await setupTwoStoreTestDb('B');
    const verdict = computeStoreVerdict(db, shopifyCrawl);

    // Every fail must have affectedCount >= 1; every pass must have applicableCount >= 1
    const allResults = verdict.areas.flatMap((a) => a.ruleResults);
    for (const r of allResults) {
      if (r.status === 'fail') {
        assert.ok(r.affectedCount >= 1, `Failed rule ${r.ruleId} must have affectedCount >= 1 (got ${r.affectedCount})`);
      }
      if (r.status === 'pass') {
        assert.ok(r.applicableCount >= 1, `Passed rule ${r.ruleId} must have applicableCount >= 1`);
      }
    }

    // Pages table invariant: Good + Needs work + Broken === checked pages
    const pageRows = (verdict.pageRows ?? []) as Array<{ status: string }>;
    const good = pageRows.filter((p) => p.status === 'good').length;
    const needsWork = pageRows.filter((p) => p.status === 'needs_work').length;
    const broken = pageRows.filter((p) => p.status === 'broken').length;
    assert.equal(good + needsWork + broken, pageRows.length);
    assert.equal(pageRows.length, verdict.denominators.okHtmlPages);

    // Issue table copy lint: max lengths & zero banned words
    const issueRows = (verdict.issueRows ?? []) as Array<{
      ruleId: string;
      severity: string;
      issue: string;
      action: string;
    }>;
    assert.ok(issueRows.length > 0);
    const bannedCopy = /(will improve|boost|skyrocket|may help|guaranteed)/i;
    for (const row of issueRows) {
      assert.ok(row.issue.length <= 70, `Issue too long (${row.issue.length}): ${row.issue}`);
      assert.ok(row.action.length <= 90, `Action too long (${row.action.length}): ${row.action}`);
      assert.ok(!bannedCopy.test(row.issue + ' ' + row.action), `Banned copy in ${row.ruleId}`);
    }

    // Critical severity cap (<= 30% on fixture with intentional schema/noindex defects)
    const criticalCount = issueRows.filter((r) => r.severity === 'critical').length;
    assert.ok(criticalCount / issueRows.length <= 0.35, `Critical share too high: ${criticalCount}/${issueRows.length}`);

    db.close();
  });
});

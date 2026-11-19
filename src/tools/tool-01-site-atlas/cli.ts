import * as fs from 'node:fs';
import * as path from 'node:path';
import { SharedDatabase } from '../../db/database.ts';
import { JobManager } from '../../engine/job-manager.ts';
import { toCsv, renderPrintableReportHtml, STANDING_POLICY_STATEMENT } from '../../engine/report-service.ts';
import { createMultiStoreMockFetcher } from '../../../tests/fixtures/sample-stores.ts';
import { tool01SiteAtlas } from './index.ts';

async function main() {
  const args = process.argv.slice(2);
  const domainInput = args[0];
  if (!domainInput) {
    console.error('Usage: npm run tool:site-atlas -- <live-domain>');
    process.exit(1);
  }
  const outDir = args[1] || path.join(process.cwd(), 'data', 'exports', 'site-atlas');

  const db = new SharedDatabase();
  const jobManager = new JobManager(db);

  console.log(`\n=== Silo SEO — Tool 1: Site Atlas (Website Architecture Mapper) ===`);
  console.log(`Target Domain: ${domainInput}`);
  console.log(`Policy: ${STANDING_POLICY_STATEMENT}\n`);

  const { crawl, reusedExisting } = await jobManager.ensureCrawl({
    domainInput,
    requiredLevel: 'B',
  });

  const result = tool01SiteAtlas.analyze(db, crawl, reusedExisting);

  console.log(`Crawl ID:         ${crawl.crawlId} (${reusedExisting ? 'Reused existing crawl — 0 HTTP requests' : 'Fresh crawl'})`);
  console.log(`Detected Platform: ${crawl.platform}`);
  console.log(`Coverage:         ${crawl.coverage.discovered} discovered | ${crawl.coverage.extracted} extracted | ${result.coveragePanel.classifiedPercentage}% classified\n`);

  console.log(`--- Headline Metrics ---`);
  for (const m of result.headlineMetrics) {
    console.log(`• ${m.label}: ${m.value} (${m.subtitle ?? ''})`);
  }

  console.log(`\n--- Prioritised Findings (${result.findings.length}) ---`);
  for (const f of result.findings) {
    console.log(
      `[${f.ruleId}] (${f.priorityBand} Priority • Score ${f.priorityScore}) ${f.title}\n` +
        `   Evidence: ${f.evidenceSummary}\n` +
        `   Affected URLs (${f.affectedUrls.length}): ${f.affectedUrls.slice(0, 4).join(', ')}`
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  const slugDomain = crawl.domain.replace(/[^a-z0-9.-]/gi, '_');
  const jsonPath = path.join(outDir, `site-atlas-${slugDomain}.json`);
  const csvPath = path.join(outDir, `site-atlas-${slugDomain}-inventory.csv`);
  const htmlPath = path.join(outDir, `site-atlas-${slugDomain}-report.html`);

  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
  fs.writeFileSync(csvPath, toCsv(result.tables[0].rows), 'utf-8');
  fs.writeFileSync(
    htmlPath,
    renderPrintableReportHtml({
      toolName: result.manifest.name,
      toolPromise: result.manifest.oneLinePromise,
      crawl: result.crawl,
      headlineMetrics: result.headlineMetrics,
      findings: result.findings,
      tables: result.tables,
    }),
    'utf-8'
  );

  console.log(`\n--- Exports Written ---`);
  console.log(`• JSON Report:    ${jsonPath}`);
  console.log(`• CSV Inventory:  ${csvPath}`);
  console.log(`• Printable HTML: ${htmlPath}`);

  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


import * as fs from 'node:fs';
import * as path from 'node:path';
import { SharedDatabase } from '../db/database.ts';
import { JobManager } from '../engine/job-manager.ts';
import { toCsv, renderPrintableReportHtml, STANDING_POLICY_STATEMENT } from '../engine/report-service.ts';
import { createMultiStoreMockFetcher } from '../../tests/fixtures/sample-stores.ts';
import { TOOL_REGISTRY, getToolBySlugOrId } from './registry.ts';

async function main() {
  const args = process.argv.slice(2);
  const toolKey = args[0] || 'site-atlas';
  const domainInput = args[1];
  if (!domainInput) {
    console.error('Usage: npm run tool -- <tool-slug-or-number> <live-domain>');
    process.exit(1);
  }

  const tool =
    getToolBySlugOrId(toolKey) ??
    TOOL_REGISTRY.find((t) => String(t.manifest.number) === toolKey);

  if (!tool) {
    console.error(`Unknown tool "${toolKey}". Available tools:`);
    for (const t of TOOL_REGISTRY) {
      console.error(`  ${t.manifest.number}. ${t.manifest.slug} (${t.manifest.name})`);
    }
    process.exit(1);
  }

  const db = new SharedDatabase();
  const jobManager = new JobManager(db);

  const reqLevels = tool.manifest.requiredCrawlLevels;
  const requiredLevel = reqLevels[reqLevels.length - 1] ?? 'B';

  console.log(`\n=== Silo SEO — Tool ${tool.manifest.number}: ${tool.manifest.name} ===`);
  console.log(`Target Domain: ${domainInput} (Required Level: ${requiredLevel})`);
  console.log(`Policy: ${STANDING_POLICY_STATEMENT}\n`);

  const { crawl, reusedExisting } = await jobManager.ensureCrawl({
    domainInput,
    requiredLevel,
  });

  const result = tool.analyze(db, crawl, reusedExisting);

  console.log(`Crawl ID: ${crawl.crawlId} (${reusedExisting ? 'Reused existing crawl — 0 HTTP requests' : 'Fresh crawl'})`);
  console.log(`Platform: ${crawl.platform}\n`);

  console.log(`--- Headline Metrics ---`);
  for (const m of result.headlineMetrics) {
    console.log(`• ${m.label}: ${m.value} (${m.subtitle ?? ''})`);
  }

  console.log(`\n--- Prioritised Findings (${result.findings.length}) ---`);
  for (const f of result.findings) {
    console.log(
      `[${f.ruleId}] (${f.priorityBand} • Score ${f.priorityScore}) ${f.title}\n` +
        `   Evidence: ${f.evidenceSummary}`
    );
  }

  const outDir = path.join(process.cwd(), 'data', 'exports', tool.manifest.slug);
  fs.mkdirSync(outDir, { recursive: true });
  const slugDomain = crawl.domain.replace(/[^a-z0-9.-]/gi, '_');
  const jsonPath = path.join(outDir, `${tool.manifest.slug}-${slugDomain}.json`);
  const htmlPath = path.join(outDir, `${tool.manifest.slug}-${slugDomain}-report.html`);

  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
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

  for (const tbl of result.tables) {
    if (tbl.rows.length > 0) {
      const csvPath = path.join(outDir, `${tool.manifest.slug}-${slugDomain}-${tbl.id}.csv`);
      fs.writeFileSync(csvPath, toCsv(tbl.rows), 'utf-8');
    }
  }

  console.log(`\nExports saved to: ${outDir}`);
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


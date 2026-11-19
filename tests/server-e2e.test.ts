import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { SharedDatabase } from '../src/db/database.ts';
import { createAppServer } from '../src/server/index.ts';
import { TOOL_REGISTRY } from '../src/tools/registry.ts';
import { createMultiStoreMockFetcher } from './fixtures/sample-stores.ts';

describe('Web Server & All 13 Standalone Tool Entry Points E2E', () => {
  test('Serves home gallery, all 13 standalone tool pages, API runs, zero-request crawl reuse, and CSV/JSON/Report exports', async () => {
    process.env.SILO_DISABLE_BROWSER = '1';
    const db = new SharedDatabase(':memory:');
    const { server } = createAppServer(db, createMultiStoreMockFetcher());

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://localhost:${port}`;

    try {
      // 1. Home gallery
      const homeRes = await fetch(`${baseUrl}/`);
      assert.equal(homeRes.status, 200);
      const homeHtml = await homeRes.text();
      assert.ok(homeHtml.includes('Ecommerce Marketing Intelligence Suite'));

      // 2. Registry API
      const regRes = await fetch(`${baseUrl}/api/tools`);
      assert.equal(regRes.status, 200);
      const regJson = (await regRes.json()) as Array<{ slug: string }>;
      assert.equal(regJson.length, 17);

      // 3. Verify every single tool's standalone page and API run
      let firstCrawlId = '';
      for (let i = 0; i < TOOL_REGISTRY.length; i++) {
        const tool = TOOL_REGISTRY[i];
        const slug = tool.manifest.slug;

        const pageRes = await fetch(`${baseUrl}/tools/${slug}`);
        assert.equal(pageRes.status, 200, `Standalone page /tools/${slug} should return 200`);
        const pageHtml = await pageRes.text();
        assert.ok(pageHtml.includes(tool.manifest.name.replace(/&/g, '&amp;')));

        const runRes = await fetch(`${baseUrl}/api/tools/${slug}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domainInput: 'alpine-outdoor.example.com',
            budget: { perHostDelayMs: 1, concurrency: 8, maxLevel: 'C' },
          }),
        });
        assert.equal(runRes.status, 200);
        const runData = (await runRes.json()) as {
          reusedExistingCrawl: boolean;
          crawl: { crawlId: string };
          headlineMetrics: unknown[];
        };
        if (i === 0) {
          assert.equal(runData.reusedExistingCrawl, false);
          firstCrawlId = runData.crawl.crawlId;
        } else {
          assert.equal(runData.reusedExistingCrawl, true, `Tool ${slug} should reuse existing crawl`);
          assert.equal(runData.crawl.crawlId, firstCrawlId);
        }
        assert.ok(runData.headlineMetrics.length > 0);
      }

      // 4. Verify CSV, JSON, and Printable HTML/PDF Report exports
      const csvRes = await fetch(
        `${baseUrl}/api/tools/site-atlas/export/csv?crawlId=${encodeURIComponent(firstCrawlId)}`
      );
      assert.equal(csvRes.status, 200);
      assert.ok((await csvRes.text()).includes('normalizedUrl'));

      const jsonRes = await fetch(
        `${baseUrl}/api/tools/opportunity-dashboard/export/json?crawlId=${encodeURIComponent(firstCrawlId)}`
      );
      assert.equal(jsonRes.status, 200);

      const reportRes = await fetch(
        `${baseUrl}/api/tools/opportunity-dashboard/export/report?crawlId=${encodeURIComponent(firstCrawlId)}`
      );
      assert.equal(reportRes.status, 200);
      const reportHtml = await reportRes.text();
      assert.ok(reportHtml.includes('Priority scores rank suggested work; they do not predict revenue or rankings.'));
    } finally {
      server.close();
      db.close();
    }
  });
});


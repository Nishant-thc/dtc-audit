import * as http from 'node:http';
import { URL } from 'node:url';
import { SharedDatabase } from '../db/database.ts';
import { JobManager } from '../engine/job-manager.ts';
import type { CustomFetcher } from '../engine/fetch-queue.ts';
import { toCsv, renderPrintableReportHtml } from '../engine/report-service.ts';
import { TOOL_REGISTRY, getToolBySlugOrId } from '../tools/registry.ts';
import {
  renderHomePage,
  renderStandaloneToolPage,
  renderCoverageOverviewPage,
} from '../ui/templates.ts';
import { renderStoreFirstHomePage } from '../ui/verdict-page.ts';
import { computeStoreVerdict } from '../engine/store-audit.ts';

export function createAppServer(db = new SharedDatabase(), customFetcher?: CustomFetcher) {
  const jobManager = new JobManager(db, customFetcher);

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const pathname = reqUrl.pathname;

      if (req.method === 'GET' && pathname === '/') {
        const crawls = db.listCrawls();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderStoreFirstHomePage(crawls));
        return;
      }

      if (req.method === 'GET' && pathname === '/tools') {
        const crawls = db.listCrawls();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderHomePage(crawls));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/audit/run') {
        const bodyStr = await readRequestBody(req);
        const body = bodyStr ? JSON.parse(bodyStr) : {};
        let crawl = body.crawlId ? db.getCrawl(String(body.crawlId)) : null;

        if (!crawl) {
          const domainInput = String(body.domainInput ?? '').trim();
          if (!domainInput) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Please enter a valid public domain or URL.' }));
            return;
          }
          const reqLevel = (body.maxLevel === 'A' || body.maxLevel === 'C' ? body.maxLevel : 'B') as 'A' | 'B' | 'C';
          const levelBudget =
            reqLevel === 'C'
              ? {
                  maxLevel: 'C' as const,
                  maxDiscoveryUrls: 10000,
                  maxLightweightPages: 150,
                  maxDeepProductPages: 8,
                  maxDeepCollectionPages: 5,
                  maxDeepContentPages: 4,
                  maxBrowserPerfPages: 5,
                }
              : reqLevel === 'A'
                ? {
                    maxLevel: 'A' as const,
                    maxDiscoveryUrls: 5000,
                    maxLightweightPages: 15,
                  }
                : {
                    maxLevel: 'B' as const,
                    maxDiscoveryUrls: 5000,
                    maxLightweightPages: 50,
                  };
          const ensured = await jobManager.ensureCrawl({
            domainInput,
            requiredLevel: reqLevel,
            forceRecrawl: Boolean(body.forceRecrawl),
            budget: { ...levelBudget, ...(body.budget ?? {}) },
          });
          crawl = ensured.crawl;
        }

        const verdict = computeStoreVerdict(db, crawl);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(verdict));
        return;
      }

      if (req.method === 'GET' && pathname === '/api/audit/verdict') {
        const crawlId = reqUrl.searchParams.get('crawlId') ?? '';
        const crawl = db.getCrawl(crawlId) ?? db.listCrawls()[0] ?? null;
        if (!crawl) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Crawl not found' }));
          return;
        }
        const verdict = computeStoreVerdict(db, crawl);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(verdict));
        return;
      }

      if (req.method === 'GET' && pathname === '/coverage') {
        const crawls = db.listCrawls();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderCoverageOverviewPage(crawls));
        return;
      }

      if (req.method === 'GET' && pathname === '/api/tools') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(TOOL_REGISTRY.map((t) => t.manifest), null, 2));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/pages/override-type') {
        const bodyStr = await readRequestBody(req);
        const body = bodyStr ? JSON.parse(bodyStr) : {};
        const { crawlId, normalizedUrl, newPageType } = body;
        const pages = db.getPages(String(crawlId));
        const target = pages.find((p) => p.normalizedUrl === normalizedUrl || p.sourceUrl === normalizedUrl);
        if (!target) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Page not found in crawl' }));
          return;
        }
        target.pageType = newPageType;
        target.classificationConfidence = 1.0;
        target.classificationSignals = [...target.classificationSignals, 'manual:user_override'];
        db.upsertPage(target);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, page: target }));
        return;
      }

      const crawlControlMatch = pathname.match(/^\/api\/crawls\/([^/]+)\/(status|pause|resume|cancel)$/);
      if (crawlControlMatch) {
        const crawlId = decodeURIComponent(crawlControlMatch[1]);
        const action = crawlControlMatch[2];
        if (action === 'status' && req.method === 'GET') {
          const crawl = db.getCrawl(crawlId);
          res.writeHead(crawl ? 200 : 404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(crawl ?? { error: 'Crawl not found' }));
          return;
        }
        if (req.method === 'POST') {
          const ok =
            action === 'pause'
              ? jobManager.pauseJob(crawlId)
              : action === 'resume'
                ? jobManager.resumeJob(crawlId)
                : jobManager.cancelJob(crawlId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ crawlId, action, ok, crawl: db.getCrawl(crawlId) }));
          return;
        }
      }

      const toolPageMatch = pathname.match(/^\/tools\/([a-z0-9-]+)$/);
      if (req.method === 'GET' && toolPageMatch) {
        const tool = getToolBySlugOrId(toolPageMatch[1]);
        if (!tool) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Tool not found');
          return;
        }
        const crawls = db.listCrawls();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderStandaloneToolPage(tool, crawls));
        return;
      }

      const runMatch = pathname.match(/^\/api\/tools\/([a-z0-9-]+)\/run$/);
      if (req.method === 'POST' && runMatch) {
        const tool = getToolBySlugOrId(runMatch[1]);
        if (!tool) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Tool not found' }));
          return;
        }

        const bodyStr = await readRequestBody(req);
        const body = bodyStr ? JSON.parse(bodyStr) : {};
        const reqLevels = tool.manifest.requiredCrawlLevels;
        const requiredLevel = reqLevels[reqLevels.length - 1] ?? 'B';

        let crawl = body.crawlId ? db.getCrawl(String(body.crawlId)) : null;
        let reusedExisting = true;

        if (!crawl) {
          const domainInput = String(body.domainInput ?? '').trim();
          if (!domainInput) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Please enter a valid public domain or URL.' }));
            return;
          }
          const ensured = await jobManager.ensureCrawl({
            domainInput,
            requiredLevel,
            forceRecrawl: Boolean(body.forceRecrawl),
            budget: body.budget ?? {},
          });
          crawl = ensured.crawl;
          reusedExisting = ensured.reusedExisting;
        }

        if (body.competitorDomain && String(body.competitorDomain).trim()) {
          await jobManager.ensureCrawl({
            domainInput: String(body.competitorDomain).trim(),
            requiredLevel,
            forceRecrawl: Boolean(body.forceRecrawl),
            budget: body.budget ?? {},
          });
        }

        const result = tool.analyze(db, crawl, reusedExisting);
        const verdict = computeStoreVerdict(db, crawl);
        const ownedSet = new Set(
          tool.rules.length > 0 ? tool.rules.map((r) => r.ruleId) : tool.manifest.ownedRuleIds
        );
        const isAll = tool.manifest.slug === 'opportunity-dashboard' || ownedSet.size === 0;
        const allIssueRows = (verdict.issueRows ?? []) as Array<{ ruleId: string }>;
        const toolIssueRows = isAll ? allIssueRows : allIssueRows.filter((r) => ownedSet.has(r.ruleId));
        const allRuleRes = verdict.areas.flatMap((a) => a.ruleResults);
        const toolRuleRes = isAll ? allRuleRes : allRuleRes.filter((r) => ownedSet.has(r.ruleId));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ...result,
            workingView: {
              overallScore: verdict.overallScore,
              overallGrade: verdict.overallGrade,
              overallBand: verdict.overallBand,
              denominators: verdict.denominators,
              issueRows: toolIssueRows,
              pageRows: verdict.pageRows ?? [],
              passedChecks: toolRuleRes.filter((r) => r.kind === 'issue' && r.status === 'pass'),
              notMeasuredChecks: toolRuleRes.filter((r) => r.status === 'not_measured'),
            },
          })
        );
        return;
      }

      const exportMatch = pathname.match(/^\/api\/tools\/([a-z0-9-]+)\/export\/(csv|json|report)$/);
      if (req.method === 'GET' && exportMatch) {
        const tool = getToolBySlugOrId(exportMatch[1]);
        const format = exportMatch[2];
        const crawlId = reqUrl.searchParams.get('crawlId') ?? '';
        const tableId = reqUrl.searchParams.get('tableId') ?? '';
        const crawl = db.getCrawl(crawlId) ?? db.listCrawls()[0] ?? null;

        if (!tool || !crawl) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Tool or crawl not found');
          return;
        }

        const result = tool.analyze(db, crawl, true);

        if (format === 'json') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${tool.manifest.slug}-${crawl.domain}.json"`,
          });
          res.end(JSON.stringify(result, null, 2));
          return;
        }

        if (format === 'csv') {
          const tbl = result.tables.find((t) => t.id === tableId) ?? result.tables[0];
          const csv = tbl ? toCsv(tbl.rows) : '';
          res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${tool.manifest.slug}-${tbl?.id ?? 'export'}.csv"`,
          });
          res.end(csv);
          return;
        }

        if (format === 'report') {
          const html = renderPrintableReportHtml({
            toolName: tool.manifest.name,
            toolPromise: tool.manifest.oneLinePromise,
            crawl: result.crawl,
            headlineMetrics: result.headlineMetrics,
            findings: result.findings,
            tables: result.tables,
          });
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });

  return { server, db, jobManager };
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// Start server if executed directly (100% live crawling, zero pre-seeded data)
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/server/index.ts');
if (isMain) {
  const port = Number(process.env.PORT ?? 3400);
  const { server } = createAppServer();
  server.listen(port, () => {
    console.log(`Silo SEO server listening on http://localhost:${port}`);
  });
}

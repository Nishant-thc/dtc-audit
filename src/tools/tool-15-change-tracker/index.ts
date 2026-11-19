import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SharedDatabase } from '../../db/database.ts';
import type { CrawlRecord, ToolManifest } from '../../types/entities.ts';
import type { StandaloneToolModule, ToolRunResult } from '../types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest: ToolManifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'));

export const tool15ChangeTracker: StandaloneToolModule = {
  manifest,
  rules: [],
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const domainCrawls = db.listCrawls(crawl.domain);
    const prevCrawl = domainCrawls.find((c) => c.crawlId !== crawl.crawlId) ?? crawl;

    const currPages = db.getPages(crawl.crawlId);
    const prevPages = db.getPages(prevCrawl.crawlId);

    const prevMap = new Map(prevPages.map((p) => [p.normalizedUrl, p]));
    const currMap = new Map(currPages.map((p) => [p.normalizedUrl, p]));

    const addedUrls: string[] = [];
    const removedUrls: string[] = [];
    const changedRows: Array<Record<string, unknown>> = [];

    for (const p of currPages) {
      const old = prevMap.get(p.normalizedUrl);
      if (!old) {
        addedUrls.push(p.sourceUrl);
        changedRows.push({
          url: p.sourceUrl,
          changeType: 'Added URL',
          previousStatus: 'N/A',
          currentStatus: p.status,
          previousTitle: 'N/A',
          currentTitle: p.title ?? '(none)',
          fingerprintChanged: true,
        });
      } else {
        const fpChanged = Boolean(
          p.contentFingerprint && old.contentFingerprint && p.contentFingerprint !== old.contentFingerprint
        );
        const titleChanged = p.title !== old.title;
        const statusChanged = p.status !== old.status;
        if (fpChanged || titleChanged || statusChanged) {
          changedRows.push({
            url: p.sourceUrl,
            changeType: [
              statusChanged ? 'Status Changed' : '',
              titleChanged ? 'Title Changed' : '',
              fpChanged ? 'HTML Fingerprint Changed' : '',
            ]
              .filter(Boolean)
              .join(', '),
            previousStatus: old.status,
            currentStatus: p.status,
            previousTitle: old.title ?? '(none)',
            currentTitle: p.title ?? '(none)',
            fingerprintChanged: fpChanged,
          });
        }
      }
    }

    for (const old of prevPages) {
      if (!currMap.has(old.normalizedUrl)) {
        removedUrls.push(old.sourceUrl);
        changedRows.push({
          url: old.sourceUrl,
          changeType: 'Removed URL',
          previousStatus: old.status,
          currentStatus: 'Removed',
          previousTitle: old.title ?? '(none)',
          currentTitle: 'N/A',
          fingerprintChanged: true,
        });
      }
    }

    const classifiedPct =
      currPages.length > 0
        ? Number(((currPages.filter((p) => p.pageType !== 'unknown').length / currPages.length) * 100).toFixed(1))
        : 100;

    return {
      manifest,
      crawl,
      reusedExistingCrawl,
      headlineMetrics: [
        {
          id: 'added_urls',
          label: 'Newly Added URLs',
          value: addedUrls.length,
          subtitle: `Compared against crawl ${prevCrawl.crawlId.slice(0, 18)}`,
          affectedUrls: addedUrls,
          status: 'neutral',
        },
        {
          id: 'removed_urls',
          label: 'Removed URLs',
          value: removedUrls.length,
          subtitle: 'URLs present in prior crawl but absent now',
          affectedUrls: removedUrls,
          status: removedUrls.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'modified_pages',
          label: 'Detected Page Diffs',
          value: changedRows.length,
          subtitle: 'Fingerprint, title, or HTTP status changes',
          affectedUrls: changedRows.map((r) => String(r.url)),
          status: 'neutral',
        },
        {
          id: 'fingerprinted_pages',
          label: 'SHA-256 Fingerprints',
          value: currPages.filter((p) => p.contentFingerprint).length,
          subtitle: 'Pages tracked with cryptographic content hashes',
          affectedUrls: currPages.filter((p) => p.contentFingerprint).map((p) => p.sourceUrl),
          status: 'good',
        },
      ],
      findings: [],
      tables: [
        {
          id: 'crawl_change_diff',
          title: '1. Crawl-to-Crawl Change Diff Log',
          description: 'Added, removed, and modified URLs between the current crawl and prior crawl.',
          rows: changedRows,
        },
        {
          id: 'fingerprint_baseline',
          title: '2. Current Crawl SHA-256 Fingerprint Baseline',
          description: 'Content fingerprints, ETag, and Last-Modified headers for every extracted page.',
          rows: [...currPages]
            .sort((a, b) => (b.contentFingerprint ? 1 : 0) - (a.contentFingerprint ? 1 : 0))
            .map((p) => ({
              url: p.sourceUrl,
              pageType: p.pageType,
              extractionLevel: p.extractionMethod,
              status: p.status,
              title: p.title ?? '(Level A Sitemap Entry)',
              sha256Fingerprint: p.contentFingerprint ? p.contentFingerprint.slice(0, 16) + '...' : '(Level A Stub)',
              etag: p.etag ?? '(none)',
              lastModified: p.lastModifiedHeader ?? p.lastmod ?? '(none)',
            })),
        },
      ],
      coveragePanel: {
        crawlId: crawl.crawlId,
        domain: crawl.domain,
        platform: crawl.platform,
        maxLevel: crawl.maxLevel,
        ...crawl.coverage,
        classifiedPercentage: classifiedPct,
        entityInspectedCount: currPages.length,
        entityName: 'fingerprinted pages',
        notes: [
          prevCrawl.crawlId === crawl.crawlId
            ? 'Baseline crawl established. Run a second crawl on this domain to view diffs.'
            : `Diffed current crawl (${crawl.crawlId}) against previous crawl (${prevCrawl.crawlId}).`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


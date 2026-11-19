import { SharedDatabase } from '../../src/db/database.ts';
import { JobManager } from '../../src/engine/job-manager.ts';
import { createMultiStoreMockFetcher } from './sample-stores.ts';
import type { CrawlRecord, ExtractionLevel } from '../../src/types/entities.ts';

export async function setupTwoStoreTestDb(requiredLevel: ExtractionLevel = 'C'): Promise<{
  db: SharedDatabase;
  jobManager: JobManager;
  shopifyCrawl: CrawlRecord;
  wooCrawl: CrawlRecord;
}> {
  process.env.SILO_DISABLE_BROWSER = '1';
  const db = new SharedDatabase(':memory:');
  const jobManager = new JobManager(db, createMultiStoreMockFetcher());

  const { crawl: shopifyCrawl } = await jobManager.ensureCrawl({
    domainInput: 'alpine-outdoor.example.com',
    requiredLevel,
    budget: { perHostDelayMs: 1, concurrency: 8, maxLevel: requiredLevel },
  });

  const { crawl: wooCrawl } = await jobManager.ensureCrawl({
    domainInput: 'bistro-roasters.example.org',
    requiredLevel,
    budget: { perHostDelayMs: 1, concurrency: 8, maxLevel: requiredLevel },
  });

  return { db, jobManager, shopifyCrawl, wooCrawl };
}


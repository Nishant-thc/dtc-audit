import type { SharedDatabase } from '../db/database.ts';
import type {
  CrawlRecord,
  FindingRecord,
  RuleDefinition,
  ToolManifest,
} from '../types/entities.ts';

export interface ToolHeadlineMetric {
  id: string;
  label: string;
  value: string | number;
  subtitle?: string;
  affectedUrls?: string[];
  status?: 'good' | 'warning' | 'critical' | 'neutral';
}

export interface ToolTableDefinition {
  id: string;
  title: string;
  description: string;
  rows: Array<Record<string, unknown>>;
}

export interface ToolCoveragePanel {
  crawlId: string;
  domain: string;
  platform: string;
  maxLevel: string;
  discovered: number;
  requested: number;
  extracted: number;
  partiallyExtracted: number;
  skipped: number;
  blockedOrUnavailable: number;
  deeplyInspected: number;
  classifiedPercentage: number;
  entityInspectedCount: number;
  entityName: string;
  notes: string[];
}

export interface ToolRunResult {
  manifest: ToolManifest;
  crawl: CrawlRecord;
  reusedExistingCrawl: boolean;
  headlineMetrics: ToolHeadlineMetric[];
  findings: FindingRecord[];
  tables: ToolTableDefinition[];
  coveragePanel: ToolCoveragePanel;
  generatedAt: string;
}

export interface StandaloneToolModule {
  manifest: ToolManifest;
  rules: RuleDefinition[];
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl?: boolean): ToolRunResult;
}


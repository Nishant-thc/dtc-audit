import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SharedDatabase } from '../../db/database.ts';
import type { CrawlRecord, ToolManifest, RuleDefinition } from '../../types/entities.ts';
import type { StandaloneToolModule, ToolRunResult } from '../types.ts';
import { RulesEngine, loadRulesFromFile } from '../../engine/rules-engine.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest: ToolManifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'));

function loadAllSuiteRules(): RuleDefinition[] {
  const toolsDir = path.dirname(__dirname);
  const dirs = fs.readdirSync(toolsDir).filter((d) => d.startsWith('tool-') && d !== 'tool-13-opportunity-dashboard');
  const all: RuleDefinition[] = [];
  for (const d of dirs.sort()) {
    const rPath = path.join(toolsDir, d, 'rules.yaml');
    if (fs.existsSync(rPath)) {
      all.push(...loadRulesFromFile(rPath));
    }
  }
  return all;
}

export const tool13OpportunityDashboard: StandaloneToolModule = {
  manifest,
  rules: [],
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const pages = db.getPages(crawl.crawlId);
    let findings = db.getFindings(crawl.crawlId);

    // If no tools have persisted findings yet, evaluate all available rules on the stored crawl
    // so Tool 13 works standalone on a clean install while also working with partial tool runs!
    if (findings.length === 0) {
      const rulesEngine = new RulesEngine(db);
      findings = rulesEngine.evaluateRules(crawl.crawlId, loadAllSuiteRules());
    }

    findings.sort((a, b) => b.priorityScore - a.priorityScore || b.severity - a.severity);

    const highFindings = findings.filter((f) => f.priorityBand === 'High');
    const medFindings = findings.filter((f) => f.priorityBand === 'Medium');
    const lowFindings = findings.filter((f) => f.priorityBand === 'Low');

    const byCategory = new Map<
      string,
      { count: number; highCount: number; maxPriority: number; totalAffectedUrls: Set<string> }
    >();
    for (const f of findings) {
      const curr = byCategory.get(f.category) ?? {
        count: 0,
        highCount: 0,
        maxPriority: 0,
        totalAffectedUrls: new Set<string>(),
      };
      curr.count++;
      if (f.priorityBand === 'High') curr.highCount++;
      curr.maxPriority = Math.max(curr.maxPriority, f.priorityScore);
      f.affectedUrls.forEach((u) => curr.totalAffectedUrls.add(u));
      byCategory.set(f.category, curr);
    }

    const classifiedPct =
      pages.length > 0
        ? Number(((pages.filter((p) => p.pageType !== 'unknown').length / pages.length) * 100).toFixed(1))
        : 100;

    return {
      manifest,
      crawl,
      reusedExistingCrawl,
      headlineMetrics: [
        {
          id: 'total_opportunities',
          label: 'Total Ranked Findings',
          value: findings.length,
          subtitle: `Across ${byCategory.size} recommendation categories`,
          affectedUrls: Array.from(new Set(findings.flatMap((f) => f.affectedUrls))),
          status: 'neutral',
        },
        {
          id: 'high_priority_count',
          label: 'High Priority (Score ≥45)',
          value: highFindings.length,
          subtitle: 'Immediate high-impact, broad-coverage fixes',
          affectedUrls: Array.from(new Set(highFindings.flatMap((f) => f.affectedUrls))),
          status: highFindings.length > 0 ? 'critical' : 'good',
        },
        {
          id: 'medium_priority_count',
          label: 'Medium Priority (20–44)',
          value: medFindings.length,
          subtitle: 'Secondary roadmap improvements',
          affectedUrls: Array.from(new Set(medFindings.flatMap((f) => f.affectedUrls))),
          status: medFindings.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'low_priority_count',
          label: 'Low Priority (<20)',
          value: lowFindings.length,
          subtitle: 'Localised or lower-coverage items',
          affectedUrls: Array.from(new Set(lowFindings.flatMap((f) => f.affectedUrls))),
          status: 'neutral',
        },
      ],
      findings,
      tables: [
        {
          id: 'prioritised_opportunity_backlog',
          title: 'Prioritised Opportunity Backlog (Impact × Coverage × Confidence)',
          description:
            'Every detected finding ranked by Priority Score. Priority scores rank suggested work; they do not predict revenue or rankings.',
          rows: findings.map((f) => ({
            priorityBand: f.priorityBand,
            priorityScore: f.priorityScore,
            ruleId: f.ruleId,
            category: f.category,
            toolId: f.toolId,
            title: f.title,
            severity: f.severity,
            formula: `${f.impactScore} (Imp) × ${f.coverageScore} (Cov) × ${f.confidenceScore} (Conf)`,
            inspectedSummary: `${f.affectedCount} of ${f.inspectedCount} (${f.coveragePercentage}%)`,
            recommendation: f.recommendationText,
            sampleAffectedUrls: f.affectedUrls.slice(0, 5).join(' | '),
          })),
        },
        {
          id: 'opportunities_by_category',
          title: 'Opportunities Grouped by Recommendation Category',
          description: 'Summary of findings across the 10 ecommerce recommendation categories.',
          rows: Array.from(byCategory.entries()).map(([category, st]) => ({
            category,
            findingCount: st.count,
            highPriorityCount: st.highCount,
            topPriorityScore: st.maxPriority,
            uniqueAffectedUrlsCount: st.totalAffectedUrls.size,
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
        entityInspectedCount: findings.length,
        entityName: 'prioritised findings',
        notes: [
          `Aggregated ${findings.length} deterministic findings (${highFindings.length} High, ${medFindings.length} Medium, ${lowFindings.length} Low).`,
          'This report is based on publicly accessible website data collected within the stated crawl coverage. Priority scores rank suggested work; they do not predict revenue or rankings.',
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};


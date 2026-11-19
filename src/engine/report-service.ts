import type { CrawlRecord, FindingRecord } from '../types/entities.ts';
import { RULE_PLAYBOOK, HUMAN_COLUMN_LABELS } from '../ui/playbook.ts';

export const STANDING_POLICY_STATEMENT =
  'This report is based on publicly accessible website data collected within the stated crawl coverage. Priority scores rank suggested work; they do not predict revenue or rankings.';

const BANNED_CLAIM_PHRASES = [
  /will improve/i,
  /guaranteed/i,
  /losing revenue/i,
  /your rankings will/i,
  /increase conversion rate by/i,
];

export function validateHonestyAndClaimsPolicy(text: string): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const pat of BANNED_CLAIM_PHRASES) {
    if (pat.test(text)) {
      violations.push(pat.source);
    }
  }
  return { valid: violations.length === 0, violations };
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows || rows.length === 0) {
    return '';
  }
  const headers = Object.keys(rows[0]);
  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = Array.isArray(val) ? val.join('; ') : typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(','));
  }
  return lines.join('\n');
}

export function renderPrintableReportHtml(params: {
  toolName: string;
  toolPromise: string;
  crawl: CrawlRecord;
  headlineMetrics: Array<{ label: string; value: string | number; subtitle?: string }>;
  findings: FindingRecord[];
  tables: Array<{ id: string; title: string; rows: Array<Record<string, unknown>> }>;
}): string {
  const { crawl, findings, headlineMetrics, tables } = params;
  const cov = crawl.coverage;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(params.toolName)} — ${escapeHtml(crawl.domain)} Audit Report | Silo SEO</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 32px; line-height: 1.5; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .standing-statement { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 12px 16px; font-size: 13px; color: #334155; margin-bottom: 24px; }
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .metric-card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; background: #fff; }
    .metric-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
    .metric-value { font-size: 24px; font-weight: 700; color: #0f172a; margin-top: 4px; }
    .coverage-panel { border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; padding: 14px; margin-bottom: 24px; font-size: 13px; }
    .finding { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; margin-bottom: 12px; page-break-inside: avoid; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .badge-High { background: #fee2e2; color: #991b1b; }
    .badge-Medium { background: #fef3c7; color: #92400e; }
    .badge-Low { background: #e0f2fe; color: #075985; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; word-break: break-word; }
    th { background: #f1f5f9; font-weight: 600; }
    @media print { .no-print { display: none; } body { margin: 12px; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #0f172a; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Print / Save as PDF</button>
  </div>
  <div class="header">
    <div>
      <h1 style="margin: 0; font-size: 24px;">Silo SEO — ${escapeHtml(params.toolName)}</h1>
      <p style="margin: 4px 0 0 0; color: #475569; font-size: 14px;">${escapeHtml(params.toolPromise)}</p>
    </div>
    <div style="text-align: right; font-size: 13px; color: #475569;">
      <div><strong>Domain:</strong> ${escapeHtml(crawl.domain)} (${escapeHtml(crawl.platform)})</div>
      <div><strong>Crawl ID:</strong> ${escapeHtml(crawl.crawlId)}</div>
      <div><strong>Extracted At:</strong> ${escapeHtml(crawl.endTime || crawl.startTime)}</div>
    </div>
  </div>

  <div class="standing-statement">
    <strong>Standing Honesty &amp; Coverage Statement:</strong> ${escapeHtml(STANDING_POLICY_STATEMENT)}
  </div>

  <div class="coverage-panel">
    <strong>Crawl Coverage &amp; Provenance (Max Level ${escapeHtml(crawl.maxLevel)}):</strong>
    Discovered: <strong>${cov.discovered}</strong> |
    Requested: <strong>${cov.requested}</strong> |
    Extracted: <strong>${cov.extracted}</strong> |
    Partially Extracted: <strong>${cov.partiallyExtracted}</strong> |
    Skipped: <strong>${cov.skipped}</strong> |
    Blocked/Unavailable: <strong>${cov.blockedOrUnavailable}</strong> |
    Deeply Inspected (Level C): <strong>${cov.deeplyInspected}</strong>
  </div>

  <h2>Headline Metrics</h2>
  <div class="metrics-grid">
    ${headlineMetrics
      .map(
        (m) => `<div class="metric-card">
      <div class="metric-label">${escapeHtml(m.label)}</div>
      <div class="metric-value">${escapeHtml(String(m.value))}</div>
      ${m.subtitle ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${escapeHtml(m.subtitle)}</div>` : ''}
    </div>`
      )
      .join('')}
  </div>

  <h2>Executive summary</h2>
  <div class="coverage-panel" style="background:#fff;">
    ${
      findings.length === 0
        ? '<p style="margin:0;"><strong style="color:#0D7A3E;">✓ No issues detected</strong> for this area within the pages inspected.</p>'
        : `<p style="margin:0 0 8px;"><strong>${findings.length} issue${findings.length > 1 ? 's' : ''} need attention.</strong> Start with: <strong>${escapeHtml(
            RULE_PLAYBOOK[findings[0].ruleId]?.plainTitle ?? findings[0].title
          )}</strong>.</p>
          <ol style="margin:0 0 0 18px; padding:0; font-size:13px;">${findings
            .slice(0, 5)
            .map((f) => {
              const p = RULE_PLAYBOOK[f.ruleId];
              return `<li style="margin-bottom:4px;">${escapeHtml(p?.plainTitle ?? f.title)} — ${f.affectedCount} of ${f.inspectedCount} pages${p ? ` · ${escapeHtml(p.owner)} · ${escapeHtml(p.effort)}` : ''}</li>`;
            })
            .join('')}</ol>`
    }
  </div>

  <h2>Action plan (${findings.length})</h2>
  ${
    findings.length === 0
      ? '<p>No rule issues detected within the inspected coverage.</p>'
      : findings
          .map((f) => {
            const p = RULE_PLAYBOOK[f.ruleId];
            return `<div class="finding">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
          <strong style="font-size:15px;">${escapeHtml(p?.plainTitle ?? f.title)}</strong>
          <span class="badge badge-${escapeHtml(f.priorityBand)}">${f.priorityBand === 'High' ? 'Fix first' : f.priorityBand === 'Medium' ? 'Fix next' : 'Fix later'}</span>
        </div>
        <p style="margin: 6px 0; font-size: 12px; color:#475569;">Pages affected: <strong>${f.affectedCount} of ${f.inspectedCount}</strong> (${f.coveragePercentage}%)${
          p ? ` · Owner: ${escapeHtml(p.owner)} · Effort: ${escapeHtml(p.effort)}` : ''
        }</p>
        ${
          p
            ? `<p style="margin: 6px 0; font-size: 13px;"><strong>What's happening:</strong> ${escapeHtml(p.whatIsHappening)}</p>
        <p style="margin: 6px 0; font-size: 13px;"><strong>Why it matters:</strong> ${escapeHtml(p.whyItHurts)}</p>
        <p style="margin: 6px 0; font-size: 13px;"><strong>Found on this store:</strong> ${escapeHtml(f.evidenceSummary)}</p>
        <table style="margin:8px 0;"><tr><th style="width:50%;">Before (now)</th><th>After (correct)</th></tr><tr><td>${escapeHtml(p.beforeExample)}</td><td>${escapeHtml(p.afterExample)}</td></tr></table>
        <p style="margin: 6px 0 2px; font-size: 13px;"><strong>How to fix it:</strong></p>
        <ol style="margin:0 0 6px 18px; padding:0; font-size:13px;">${p.actionSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
            : `<p style="margin: 6px 0; font-size: 13px;"><strong>Evidence:</strong> ${escapeHtml(f.evidenceSummary)}</p>
        <p style="margin: 6px 0; font-size: 13px;"><strong>Recommendation:</strong> ${escapeHtml(f.recommendationText)}</p>`
        }
        <div style="font-size: 12px; color: #334155; margin-top: 6px;">
          <strong>Sample pages to fix (${f.affectedUrls.length} total):</strong>
          <ul style="margin: 4px 0 0 18px; padding: 0;">
            ${f.affectedUrls
              .slice(0, 10)
              .map((u) => `<li><code>${escapeHtml(u)}</code></li>`)
              .join('')}
          </ul>
        </div>
        <p style="margin: 6px 0 0; font-size: 11px; color: #94a3b8;">Check ${escapeHtml(f.ruleId)} · Priority ${f.priorityScore} = Impact ${f.impactScore} × Reach ${f.coverageScore} × Confidence ${f.confidenceScore} · ${escapeHtml(f.howDetected)}</p>
      </div>`;
          })
          .join('')
  }

  ${tables
    .map((tbl) => {
      if (tbl.rows.length === 0) return '';
      const cols = Object.keys(tbl.rows[0]);
      return `<h2>${escapeHtml(tbl.title)} (${tbl.rows.length} rows)</h2>
      <table>
        <thead>
          <tr>${cols.map((c) => `<th>${escapeHtml(HUMAN_COLUMN_LABELS[c] ?? c)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${tbl.rows
            .slice(0, 100)
            .map(
              (r) =>
                `<tr>${cols
                  .map((c) => {
                    const val = r[c];
                    const str = Array.isArray(val) ? val.join(', ') : val === null || val === undefined ? '' : String(val);
                    return `<td>${escapeHtml(str)}</td>`;
                  })
                  .join('')}</tr>`
            )
            .join('')}
        </tbody>
      </table>`;
    })
    .join('')}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


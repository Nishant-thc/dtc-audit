import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_REGISTRY } from '../tools/registry.ts';
import { STANDING_POLICY_STATEMENT } from '../engine/report-service.ts';
import type { CrawlRecord } from '../types/entities.ts';
import { renderSharedHead, renderGlobalTopHeader, escapeHtml } from './templates.ts';
import { TOOL_UX_GUIDE } from './playbook.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INSIGHT_CSS = fs.readFileSync(path.join(__dirname, 'insight.css'), 'utf-8');
const VERDICT_JS = fs.readFileSync(path.join(__dirname, 'verdict-client.js'), 'utf-8');

export const WORKING_SEO_CSS = `
.seo-shell { max-width: 1260px; margin: 0 auto; padding: 24px 24px 64px; }

/* 1. One-line Header Strip */
.hdr-strip { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap;
  background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; margin-bottom: 18px; }
.hdr-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.hdr-domain { font-family: var(--font-serif); font-size: 20px; font-weight: 500; }
.hdr-score { font-family: var(--font-mono); font-size: 12.5px; font-weight: 600; padding: 3px 10px; border-radius: 14px; }
.hdr-score.green { background: var(--good-bg); color: var(--good); }
.hdr-score.amber { background: var(--warn-bg); color: var(--warn); }
.hdr-score.red { background: var(--block-bg); color: var(--block); }
.hdr-score.unmeasured { background: var(--bg); color: var(--ink-faint); }
.hdr-meta { font-size: 12.5px; color: var(--ink-soft); }
.hdr-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* 2. Visual Summary (4 Charts) */
.viz-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 10px; }
.viz-card { background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; }
.viz-title { font-family: var(--font-serif); font-size: 16px; font-weight: 500; color: var(--ink); margin-bottom: 2px; }
.viz-sub { font-size: 11.5px; color: var(--ink-faint); font-family: var(--font-mono); margin-bottom: 12px; }
.vbar-row { display: grid; grid-template-columns: 112px 1fr 44px; gap: 10px; align-items: center; margin-bottom: 8px; cursor: pointer; font-size: 12.5px; }
.vbar-row:hover .vbar-lbl { color: var(--visible); }
.vbar-lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vbar-track { height: 10px; background: #EEF0F4; border-radius: 5px; overflow: hidden; }
.vbar-fill { height: 100%; border-radius: 5px; }
.vbar-val { font-family: var(--font-mono); font-size: 12px; text-align: right; color: var(--ink-soft); }
.stack-track { height: 10px; background: #EEF0F4; border-radius: 5px; overflow: hidden; display: flex; }

.sev-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 8px; }
.sev-tile { border: 1px solid var(--line); border-radius: 8px; padding: 12px; text-align: center; cursor: pointer; background: var(--bg); transition: border-color .15s, transform .15s; }
.sev-tile:hover { transform: translateY(-1px); }
.sev-tile.critical .n { color: var(--block); }
.sev-tile.warning .n { color: var(--warn); }
.sev-tile.minor .n { color: var(--visible); }
.sev-tile.on { background: var(--paper); border-width: 2px; border-color: var(--ink); }
.sev-tile .n { font-family: var(--font-serif); font-size: 28px; line-height: 1.1; }
.sev-tile .l { font-size: 11.5px; font-family: var(--font-mono); color: var(--ink-soft); margin-top: 2px; }
.chart-hint { font-size: 11.5px; color: var(--ink-faint); }

.hm-table { width: 100%; border-collapse: collapse; font-size: 11.5px; font-family: var(--font-mono); }
.hm-table th { font-weight: 500; color: var(--ink-soft); padding: 4px 6px; text-align: center; }
.hm-table td { padding: 6px; text-align: center; border: 2px solid var(--paper); border-radius: 4px; cursor: pointer; }
.hm-table td.hm-row-lbl { text-align: left; font-family: var(--font-sans); color: var(--ink); background: transparent !important; cursor: default; font-weight: 500; }

.cov-line { font-size: 12px; color: var(--ink-soft); font-family: var(--font-mono); margin-bottom: 20px; padding: 8px 12px; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; }

/* 3. Issues & Pages Tables */
.tbl-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.tbl-h2 { font-family: var(--font-serif); font-size: 20px; font-weight: 500; margin: 0; }
.tbl-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.tbl-filters select, .tbl-filters input { font-size: 12.5px; padding: 5px 10px; }

.sev-badge { display: inline-block; font-family: var(--font-mono); font-size: 11px; padding: 2px 8px; border-radius: 10px; white-space: nowrap; font-weight: 500; }
.sev-badge.critical { background: var(--block-bg); color: var(--block); }
.sev-badge.warning { background: var(--warn-bg); color: var(--warn); }
.sev-badge.minor { background: var(--visible-bg); color: var(--visible); }
.sev-badge.good { background: var(--good-bg); color: var(--good); }

.issue-row { cursor: pointer; transition: background .1s; }
.issue-row:hover { background: #F7F8FA; }
.issue-row.open { background: #F4F6FB; }
.issue-row.fixed-row { opacity: .55; }

.pg-cell { display: flex; align-items: center; gap: 8px; }
.mini-tr { width: 46px; height: 6px; background: #E9EBF0; border-radius: 4px; overflow: hidden; display: inline-block; }
.mini-fl { display: block; height: 100%; }
.mini-fl.critical { background: var(--block); }
.mini-fl.warning { background: var(--warn); }
.mini-fl.minor { background: var(--visible); }

/* Inline Expanded Row */
.detail-row td { background: #FAFBFC; padding: 0 !important; border-bottom: 2px solid var(--line); }
.detail-box { padding: 16px 20px; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.detail-head { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-soft); margin-bottom: 8px; font-weight: 600; }
.detail-urls { display: grid; gap: 5px; max-height: 220px; overflow-y: auto; }
.du-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; padding: 4px 8px; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; }
.du-val { color: var(--ink-soft); font-family: var(--font-mono); font-size: 11px; text-align: right; }
.pass-drop, .why-drop { margin-top: 10px; font-size: 12.5px; }
.pass-drop summary, .why-drop summary { cursor: pointer; color: var(--visible); font-weight: 500; }
.why-body { margin-top: 6px; padding: 10px 12px; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; font-size: 12.5px; color: var(--ink-soft); line-height: 1.55; }
.fix-ol { margin: 0 0 10px 18px; font-size: 13px; line-height: 1.6; }
.ba-mini { display: grid; gap: 6px; font-size: 12px; margin-bottom: 10px; }
.ba-c { padding: 6px 10px; background: #FDF7F6; border: 1px solid rgba(166,52,42,.2); border-radius: 6px; }
.ba-s { padding: 6px 10px; background: #F5FBF7; border: 1px solid rgba(13,122,62,.2); border-radius: 6px; }

/* URL Detail Slide-over Panel */
.url-backdrop { position: fixed; inset: 0; background: rgba(13,17,23,.45); z-index: 200; display: none; justify-content: flex-end; }
.url-backdrop.open { display: flex; }
.url-panel { width: 540px; max-width: 95vw; background: var(--paper); height: 100%; overflow-y: auto; padding: 22px 24px; box-shadow: -8px 0 32px rgba(0,0,0,.15); }
.url-chk { padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 8px; font-size: 12.5px; }
.url-chk.fail { border-left: 3px solid var(--block); background: #FDF7F6; }
.url-chk.pass { border-left: 3px solid var(--good); background: var(--paper); }
.uc-v { font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-soft); margin-top: 4px; }
.uc-a { font-size: 12px; color: var(--ink); margin-top: 3px; }

.bf-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.bf-row:last-child { border-bottom: none; }

@media (max-width: 960px) { .viz-grid, .detail-grid { grid-template-columns: 1fr; } }
`;

export function renderStoreFirstHomePage(crawls: CrawlRecord[]): string {
  const quickPicks = ['row.gymshark.com', 'allbirds.com', 'tentree.com'];

  return `${renderSharedHead('Ecommerce Marketing Intelligence Suite').replace('</head>', `<style>${INSIGHT_CSS}\n${WORKING_SEO_CSS}</style>\n</head>`)}
<body>
  ${renderGlobalTopHeader('/')}

  <section class="landing-hero">
    <div class="landing-inner">
      <div class="landing-badge"><span class="landing-badge-dot"></span>Free · public data only · local speed &amp; AI readiness checks</div>
      <h1 class="landing-headline">Find SEO, catalogue, and speed problems — <span class="landing-headline-accent">and where to fix them</span></h1>
      <p class="landing-sub">Enter your ecommerce store domain to inspect products, collections, blog posts, sitemaps, schema, and speed.</p>

      <form id="verdict-scan-form">
        <div class="landing-input-wrap">
          <input type="text" class="landing-input" id="verdict-domain-input" placeholder="yourstore.com" autocomplete="url" />
          <select class="landing-tool-select" id="verdict-scan-mode" aria-label="Scan mode">
            <option value="B" selected>Standard scan (50 pages)</option>
            <option value="C">Deep scan (150 pages + browser vitals)</option>
            <option value="A">Quick scan (15 pages + sitemap)</option>
          </select>
          <button type="submit" class="landing-btn">Scan store →</button>
        </div>
      </form>
      <div class="landing-trust-bar">
        <span>Try:</span>
        ${quickPicks.map((d) => `<a href="javascript:void(0)" onclick="runVerdictFor('${d}')" style="color:#9DB4FF;">${d}</a>`).join(' · ')}
      </div>
    </div>
  </section>

  <main class="seo-shell">
    <section class="progress-panel" id="verdict-progress" style="display:none;">
      <div class="progress-title">
        <div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--visible);display:inline-block;"></span><span id="verdict-progress-title">Scanning store…</span></div>
      </div>
      <div class="progress-step" id="verdict-progress-step">Checking robots.txt and XML sitemaps…</div>
      <div class="progress-bar-track"><div class="progress-bar-fill"></div></div>
    </section>

    <div id="verdict-workspace" style="display:none;">
      <section class="hdr-strip" id="sec-header-strip"></section>
      <section id="sec-visual-summary"></section>
      <section id="sec-issues-table" style="margin-bottom:22px;"></section>
      <section id="sec-pages-table" style="margin-bottom:22px;"></section>
      <section id="sec-below-fold"></section>
      <div class="standing-banner" style="margin-top:18px;">
        <strong>Honesty &amp; coverage statement:</strong> ${escapeHtml(STANDING_POLICY_STATEMENT)}
      </div>
    </div>

    <div id="pre-scan-section">
      <div id="local-recent-scans"></div>
    </div>
  </main>

  <!-- Per-URL Side Panel -->
  <div class="url-backdrop" id="url-drawer-backdrop" onclick="if(event.target===this) closeUrlPanel()">
    <div class="url-panel" id="url-drawer-content"></div>
  </div>

  <script>
    window.__SILO_VERDICT_TOOLS__ = ${JSON.stringify(
      TOOL_REGISTRY.map((t) => ({
        slug: t.manifest.slug,
        name: TOOL_UX_GUIDE[t.manifest.slug]?.shortTitle ?? t.manifest.name,
      }))
    ).replace(/</g, '\\u003c')};
  </script>
  <script>${VERDICT_JS.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
}

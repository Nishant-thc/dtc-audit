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

const VERDICT_CSS = `
.verdict-shell { max-width: 1180px; margin: 0 auto; padding: 28px 24px 64px; }
.verdict-topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
.mode-toggle { display: inline-flex; background: var(--paper); border: 1px solid var(--line); border-radius: 20px; padding: 3px; }
.mode-toggle button { border: none; background: transparent; padding: 5px 14px; font-size: 12px; border-radius: 16px; cursor: pointer; color: var(--ink-soft); font-family: var(--font-sans); }
.mode-toggle button.on { background: var(--ink); color: #fff; font-weight: 500; }

.verdict-card { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 24px 28px; margin-bottom: 20px; }
.verdict-top { display: flex; justify-content: space-between; align-items: center; gap: 24px; flex-wrap: wrap; border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 20px; }
.verdict-domain { font-family: var(--font-serif); font-size: 28px; font-weight: 500; margin-bottom: 6px; }
.verdict-sentence { font-size: 15px; color: var(--ink-soft); max-width: 720px; line-height: 1.6; }
.score-pill-big { display: flex; align-items: center; gap: 14px; }
.score-circle { width: 78px; height: 78px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: var(--font-serif); border: 4px solid var(--line); }
.score-circle.green { border-color: var(--good); color: var(--good); background: var(--good-bg); }
.score-circle.amber { border-color: var(--warn); color: var(--warn); background: var(--warn-bg); }
.score-circle.red { border-color: var(--block); color: var(--block); background: var(--block-bg); }
.score-circle.unmeasured { border-color: var(--line); color: var(--ink-faint); background: var(--bg); }
.score-circle .num { font-size: 28px; line-height: 1; font-weight: 600; }
.score-circle .grd { font-family: var(--font-mono); font-size: 11px; margin-top: 2px; }

.area-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
.area-tile { background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; cursor: pointer; text-align: left; transition: border-color .15s, transform .15s; }
.area-tile:hover, .area-tile.active { border-color: var(--visible); background: var(--paper); transform: translateY(-1px); }
.area-tile .al { font-size: 12.5px; font-weight: 600; color: var(--ink); margin-bottom: 6px; }
.area-tile .as { font-family: var(--font-serif); font-size: 26px; font-weight: 600; }
.area-tile .as.green { color: var(--good); }
.area-tile .as.amber { color: var(--warn); }
.area-tile .as.red { color: var(--block); }
.area-tile .as.unmeasured { color: var(--ink-faint); font-size: 18px; }
.area-tile .am { font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); margin-top: 4px; }

.packet-list { display: grid; gap: 14px; margin-bottom: 24px; }
.packet-card { background: var(--paper); border: 1px solid var(--line); border-left: 4px solid var(--visible); border-radius: 10px; padding: 18px 20px; }
.packet-card.fix_now { border-left-color: var(--block); }
.packet-card.fix_soon { border-left-color: var(--warn); }
.packet-card.done { opacity: .55; border-left-color: var(--good); }
.packet-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
.packet-title { font-family: var(--font-serif); font-size: 18px; font-weight: 500; margin: 4px 0; }
.packet-proof { font-size: 13.5px; color: var(--ink-soft); margin-bottom: 10px; }
.packet-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 12px; color: var(--ink-soft); }
.lift-badge { font-family: var(--font-mono); font-size: 12px; font-weight: 600; background: var(--good-bg); color: var(--good); padding: 3px 9px; border-radius: 12px; }
.tier-badge { font-family: var(--font-mono); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
.tier-badge.fix_now { background: var(--block-bg); color: var(--block); }
.tier-badge.fix_soon { background: var(--warn-bg); color: var(--warn); }
.tier-badge.nice_to_have { background: var(--visible-bg); color: var(--visible); }
.packet-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.packet-drawer { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line); display: none; }
.packet-drawer.open { display: block; }
.ba-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.ba-box { padding: 10px 12px; border-radius: 8px; font-size: 12.5px; line-height: 1.5; }
.ba-box.cur { background: #FDF7F6; border: 1px solid rgba(166,52,42,.2); }
.ba-box.sug { background: #F5FBF7; border: 1px solid rgba(13,122,62,.2); }

.snapshot-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
.snap-item { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.snap-item .sl { font-size: 11px; font-family: var(--font-mono); color: var(--ink-faint); text-transform: uppercase; }
.snap-item .sv { font-family: var(--font-serif); font-size: 18px; margin-top: 3px; }
.snap-item .sd { font-size: 11.5px; color: var(--ink-soft); margin-top: 2px; }

.check-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 13.5px; }
.check-row:last-child { border-bottom: none; }
.status-chip { font-family: var(--font-mono); font-size: 11px; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
.status-chip.pass { background: var(--good-bg); color: var(--good); }
.status-chip.fail { background: var(--block-bg); color: var(--block); }
.status-chip.not_measured { background: var(--bg); color: var(--ink-faint); border: 1px solid var(--line); }

.specialist-only { display: none; }
body.specialist-mode .specialist-only { display: block; }
@media (max-width: 960px) { .area-grid { grid-template-columns: 1fr 1fr; } .ba-grid { grid-template-columns: 1fr; } }
`;

export function renderStoreFirstHomePage(crawls: CrawlRecord[]): string {
  const quickPicks = ['row.gymshark.com', 'allbirds.com', 'tentree.com'];

  return `${renderSharedHead('Ecommerce Marketing Intelligence Suite').replace('</head>', `<style>${INSIGHT_CSS}\n${VERDICT_CSS}</style>\n</head>`)}
<body>
  ${renderGlobalTopHeader('/')}

  <section class="landing-hero" id="landing-hero-box">
    <div class="landing-inner">
      <div class="landing-badge"><span class="landing-badge-dot"></span>Free · local measurement · no AI guesswork · no external APIs</div>
      <h1 class="landing-headline">One clear <span class="landing-headline-accent">store health verdict</span> — and the exact template fixes</h1>
      <p class="landing-sub">Enter your ecommerce store address. Silo SEO inspects your public pages across Search Visibility, AI Readiness, Product &amp; Collection Quality, Site Health &amp; Speed, and Conversion &amp; Trust — and hands your team a short, prioritised fix list.</p>

      <form id="verdict-scan-form">
        <div class="landing-input-wrap">
          <input type="text" class="landing-input" id="verdict-domain-input" placeholder="yourstore.com" autocomplete="url" />
          <select class="landing-tool-select" id="verdict-scan-mode" aria-label="Scan mode">
            <option value="B" selected>Standard scan (fast, ~15s)</option>
            <option value="C">Deep scan (with local browser vitals)</option>
            <option value="A">Quick scan (URL discovery only)</option>
          </select>
          <button type="submit" class="landing-btn">Audit my store →</button>
        </div>
      </form>
      <div class="landing-trust-bar">
        <span>Try:</span>
        ${quickPicks.map((d) => `<a href="javascript:void(0)" onclick="runVerdictFor('${d}')" style="color:#9DB4FF;">${d}</a>`).join(' · ')}
      </div>
    </div>
  </section>

  <main class="verdict-shell">
    <!-- Progress bar -->
    <section class="progress-panel" id="verdict-progress" style="display:none;">
      <div class="progress-title">
        <div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--visible);display:inline-block;"></span><span id="verdict-progress-title">Auditing store…</span></div>
      </div>
      <div class="progress-step" id="verdict-progress-step">1/4 Reading robots.txt and XML sitemaps…</div>
      <div class="progress-bar-track"><div class="progress-bar-fill"></div></div>
    </section>

    <!-- STORE VERDICT WORKSPACE (Layers 0 -> 3) -->
    <div id="verdict-workspace" style="display:none;">
      <div class="verdict-topbar">
        <div class="mode-toggle" role="group" aria-label="View density">
          <button type="button" id="btn-owner-view" class="on" onclick="setViewMode('owner')">Owner view</button>
          <button type="button" id="btn-specialist-view" onclick="setViewMode('specialist')">Specialist view</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button type="button" class="btn" onclick="openComparePrompt()">Compare to another store</button>
          <a class="btn" id="verdict-history-link" href="/tools/change-tracker">History &amp; diffs</a>
          <a class="btn btn-primary" id="verdict-pdf-link" href="#" target="_blank">🖨 Client report (PDF)</a>
        </div>
      </div>

      <!-- LAYER 0: THE 5-SECOND VERDICT -->
      <section class="verdict-card" id="layer-0-verdict"></section>

      <!-- LAYER 1: FIX FIRST (MAX 5 TEMPLATE-GROUPED FIX PACKETS) -->
      <section id="layer-1-fix-first" style="margin-bottom:24px;"></section>

      <!-- LAYER 2: SELECTED AREA DEEP-DIVE (PASSED / FAILED / NOT MEASURED) -->
      <section id="layer-2-area" style="margin-bottom:24px;"></section>

      <!-- OPPORTUNITIES & STORE SNAPSHOT FACTS -->
      <section id="layer-opportunities-facts" style="margin-bottom:24px;"></section>

      <!-- LAYER 3: EVIDENCE DRAWER & SPECIALIST MODULAR ENGINES -->
      <details class="ex-panel" id="layer-3-evidence">
        <summary>
          <div>
            <h3>Evidence drawer &amp; 17 modular audit tools</h3>
            <div class="ex-desc">Rule IDs, shared denominators, crawl coverage, CSV exports, and individual specialist consoles</div>
          </div>
          <span class="ex-count">Specialist layer</span>
        </summary>
        <div style="padding:0 18px 18px;" id="layer-3-body"></div>
      </details>

      <div class="standing-banner" style="margin-top:18px;">
        <strong>Honesty &amp; coverage statement:</strong> ${escapeHtml(STANDING_POLICY_STATEMENT)}
      </div>
    </div>

    <!-- RECENT SAVED SCANS (Shown before an audit runs) -->
    <div id="pre-scan-section">
      ${
        crawls.length > 0
          ? `<section class="panel"><div class="panel-head"><h3>Recent store audits</h3><a href="/coverage" class="btn">All saved scans</a></div><div class="panel-body">
          ${crawls
            .slice(0, 6)
            .map(
              (c) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);font-size:13.5px;">
            <div><strong style="font-family:var(--font-serif);font-size:16px;">${escapeHtml(c.domain)}</strong>
            <span style="color:var(--ink-faint);margin-left:8px;">${escapeHtml(c.platform)} · ${c.coverage.extracted} pages inspected · ${c.coverage.discovered} URLs discovered</span></div>
            <button type="button" class="btn btn-primary" onclick="loadSavedVerdict('${escapeHtml(c.crawlId)}')">Open verdict →</button></div>`
            )
            .join('')}
        </div></section>`
          : ''
      }

      <details class="ex-panel" style="margin-top:18px;">
        <summary>
          <div>
            <h3>Browse individual specialist engines (17 modular tools)</h3>
            <div class="ex-desc">Prefer to jump straight into one module (e.g., Schema, Catalogue, Faceted Nav, Competitor Comparison)?</div>
          </div>
          <span class="ex-count">17 tools</span>
        </summary>
        <div style="padding:0 18px 18px; display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:10px;">
          ${TOOL_REGISTRY.map((t) => {
            const ux = TOOL_UX_GUIDE[t.manifest.slug];
            return `<a href="/tools/${t.manifest.slug}" style="display:block;padding:12px 14px;background:var(--bg);border:1px solid var(--line);border-radius:8px;text-decoration:none;color:var(--ink);">
              <div style="font-family:var(--font-mono);font-size:10.5px;color:var(--visible);">${escapeHtml(ux?.shortTitle ?? t.manifest.name)}</div>
              <div style="font-size:12.5px;color:var(--ink-soft);margin-top:4px;line-height:1.45;">${escapeHtml(ux?.businessQuestion ?? t.manifest.oneLinePromise)}</div>
            </a>`;
          }).join('')}
        </div>
      </details>
    </div>
  </main>

  <script>
    window.__SILO_VERDICT_TOOLS__ = ${JSON.stringify(
      TOOL_REGISTRY.map((t) => ({
        slug: t.manifest.slug,
        name: TOOL_UX_GUIDE[t.manifest.slug]?.shortTitle ?? t.manifest.name,
        q: TOOL_UX_GUIDE[t.manifest.slug]?.businessQuestion ?? t.manifest.oneLinePromise,
      }))
    ).replace(/</g, '\\u003c')};
  </script>
  <script>${VERDICT_JS.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
}

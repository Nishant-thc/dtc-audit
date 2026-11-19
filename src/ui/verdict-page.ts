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
    const ALL_TOOLS = ${JSON.stringify(
      TOOL_REGISTRY.map((t) => ({
        slug: t.manifest.slug,
        name: TOOL_UX_GUIDE[t.manifest.slug]?.shortTitle ?? t.manifest.name,
        q: TOOL_UX_GUIDE[t.manifest.slug]?.businessQuestion ?? t.manifest.oneLinePromise,
      }))
    )};
    let activeVerdict = null;
    let activeAreaId = null;

    function esc(s) {
      return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function doneKey(domain, taskId) { return 'silo_done_' + domain + '_' + taskId; }
    function isDone(domain, taskId) { return localStorage.getItem(doneKey(domain, taskId)) === '1'; }

    window.setViewMode = function(mode) {
      document.body.classList.toggle('specialist-mode', mode === 'specialist');
      document.getElementById('btn-owner-view').classList.toggle('on', mode === 'owner');
      document.getElementById('btn-specialist-view').classList.toggle('on', mode === 'specialist');
      const ev = document.getElementById('layer-3-evidence');
      if (ev) ev.open = (mode === 'specialist');
    };

    window.toggleDone = function(taskId) {
      if (!activeVerdict) return;
      const k = doneKey(activeVerdict.crawl.domain, taskId);
      localStorage.setItem(k, isDone(activeVerdict.crawl.domain, taskId) ? '0' : '1');
      renderFixPackets(activeVerdict);
    };

    window.togglePacketDrawer = function(taskId, panel) {
      const el = document.getElementById('drawer-' + panel + '-' + taskId);
      if (el) el.classList.toggle('open');
    };

    window.copyTicket = function(taskId) {
      if (!activeVerdict) return;
      const t = activeVerdict.allTasks.find(x => x.taskId === taskId);
      if (!t) return;
      navigator.clipboard.writeText(t.ticketMarkdown).then(() => {
        const btn = document.getElementById('copy-btn-' + taskId);
        if (btn) { btn.textContent = '✓ Copied task'; setTimeout(() => { btn.textContent = 'Copy as task'; }, 1500); }
      });
    };

    window.openComparePrompt = function() {
      if (!activeVerdict) return;
      window.location.href = '/tools/competitor-comparison?crawlId=' + encodeURIComponent(activeVerdict.crawl.crawlId) + '&autoScan=true';
    };

    window.selectArea = function(areaId) {
      activeAreaId = areaId;
      document.querySelectorAll('.area-tile').forEach(el => el.classList.toggle('active', el.getAttribute('data-area') === areaId));
      if (activeVerdict) renderAreaDetail(activeVerdict, areaId);
    };

    function renderVerdict(v) {
      activeVerdict = v;
      document.getElementById('pre-scan-section').style.display = 'none';
      document.getElementById('verdict-workspace').style.display = 'block';
      document.getElementById('verdict-history-link').href = '/tools/change-tracker?crawlId=' + encodeURIComponent(v.crawl.crawlId) + '&autoScan=true';
      document.getElementById('verdict-pdf-link').href = '/api/tools/opportunity-dashboard/export/report?crawlId=' + encodeURIComponent(v.crawl.crawlId);

      // Layer 0
      document.getElementById('layer-0-verdict').innerHTML =
        '<div class="verdict-top">' +
          '<div>' +
            '<div class="verdict-domain">' + esc(v.crawl.domain) + '</div>' +
            '<div class="verdict-sentence">' + esc(v.verdictSentence) + '</div>' +
          '</div>' +
          '<div class="score-pill-big">' +
            '<div class="score-circle ' + v.overallBand + '"><div class="num">' + (v.overallScore ?? '—') + '</div><div class="grd">Grade ' + esc(v.overallGrade) + '</div></div>' +
            '<div><div style="font-weight:600;font-size:14px;">Store Health</div><div style="font-size:12px;color:var(--ink-soft);">Weighted pass rate (0–100)</div>' +
            '<div style="font-size:11.5px;color:var(--ink-faint);margin-top:4px;">Passed: ' + v.totals.passedChecks + ' · Issues: ' + v.totals.failedIssues + ' · Not measured: ' + v.totals.notMeasuredChecks + '</div></div>' +
          '</div>' +
        '</div>' +
        '<div class="area-grid">' +
          v.areas.map(a =>
            '<button type="button" class="area-tile" data-area="' + a.areaId + '" onclick="selectArea(\'' + a.areaId + '\')">' +
              '<div class="al">' + esc(a.label) + '</div>' +
              '<div class="as ' + a.band + '">' + (a.score !== null ? a.score + ' <span style="font-size:14px;">(' + a.grade + ')</span>' : 'Not measured') + '</div>' +
              '<div class="am">' + a.passedCount + ' passed · ' + a.failedCount + ' issues' + (a.notMeasuredCount ? ' · ' + a.notMeasuredCount + ' unmeasured' : '') + '</div>' +
            '</button>'
          ).join('') +
        '</div>';

      renderFixPackets(v);

      // Default Layer 2 to weakest area
      const weakest = v.areas.slice().sort((a,b) => (a.score ?? 101) - (b.score ?? 101))[0];
      if (weakest) window.selectArea(weakest.areaId);

      // Opportunities & Store Snapshot Facts
      document.getElementById('layer-opportunities-facts').innerHTML =
        '<div class="panel" style="margin-bottom:16px;"><div class="panel-head"><h3>Store snapshot (neutral facts)</h3><span class="verified">Observed from public pages · not scored as defects</span></div>' +
        '<div class="panel-body"><div class="snapshot-strip">' +
          v.storeSnapshot.map(s => '<div class="snap-item"><div class="sl">' + esc(s.label) + '</div><div class="sv">' + esc(s.value) + '</div><div class="sd">' + esc(s.detail || '') + '</div></div>').join('') +
        '</div></div></div>' +
        (v.opportunities.length ? '<div class="panel"><div class="panel-head"><h3>Growth opportunities (' + v.opportunities.length + ')</h3><span class="verified">Optional business ideas · excluded from health score</span></div><div class="panel-body">' +
          v.opportunities.map(o => '<div class="check-row"><div><strong>' + esc(o.plainTitle) + '</strong><div style="font-size:12.5px;color:var(--ink-soft);">' + o.affectedCount + ' of ' + o.applicableCount + ' ' + esc(o.denominatorNoun) + ' · Owner: ' + esc(o.owner) + '</div></div><span class="tier-badge nice_to_have">Opportunity</span></div>').join('') +
        '</div></div>' : '');

      // Layer 3 Evidence Drawer
      const d = v.denominators;
      document.getElementById('layer-3-body').innerHTML =
        '<p style="font-size:13px;color:var(--ink-soft);margin-bottom:12px;">Shared denominators across every area &amp; tool: <strong>' + d.discoveredUrls + '</strong> discovered URLs · <strong>' + d.okHtmlPages + '</strong> inspected HTML pages (' + d.byPageTypeHtml.product + ' product pages, ' + (d.byPageTypeHtml.collection + d.byPageTypeHtml.category) + ' collection pages, ' + (d.byPageTypeHtml.blog + d.byPageTypeHtml.informational) + ' editorial pages) · <strong>' + d.deepInspectedPages + '</strong> browser-rendered pages.</p>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(230px, 1fr));gap:8px;">' +
          ALL_TOOLS.map(t => '<a class="btn" style="justify-content:flex-start;text-align:left;" href="/tools/' + t.slug + '?crawlId=' + encodeURIComponent(v.crawl.crawlId) + '&autoScan=true">' + esc(t.name) + ' →</a>').join('') +
        '</div>';
    }

    function renderFixPackets(v) {
      const tierText = { fix_now: 'Fix now', fix_soon: 'Fix soon', nice_to_have: 'Nice to have' };
      const confText = { verified: 'Verified', sampled: 'Sampled', small_sample: 'Small sample (<8 pages)', not_measured: 'Not measured' };
      const html = v.fixFirst.length === 0
        ? '<div class="empty-state">✓ No urgent fixes needed — every measured issue check passed.</div>'
        : '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;"><h2 class="ux-section-title" style="margin:0;">Fix first (' + v.fixFirst.length + ' template tasks)</h2><span style="font-size:12.5px;color:var(--ink-soft);">Ordered by score lift per effort · ' + v.allTasks.length + ' total tasks</span></div>' +
          '<div class="packet-list">' + v.fixFirst.map((t, idx) => {
            const done = isDone(v.crawl.domain, t.taskId);
            return '<div class="packet-card ' + t.actionTier + (done ? ' done' : '') + '">' +
              '<div class="packet-head">' +
                '<div style="flex:1;">' +
                  '<div class="packet-meta"><span class="tier-badge ' + t.actionTier + '">' + tierText[t.actionTier] + '</span><span class="lift-badge">+' + t.projectedScoreLift + ' pts</span><span>' + esc(t.owner) + ' · ' + esc(t.effortLabel) + '</span><span class="tag">' + confText[t.confidenceTag] + '</span><span class="specialist-only mono" style="font-size:11px;">[' + esc(t.ruleIds.join(', ')) + ']</span></div>' +
                  '<div class="packet-title">' + (idx + 1) + '. ' + esc(t.title) + '</div>' +
                  '<div class="packet-proof">' + esc(t.proofLine) + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="packet-actions">' +
                '<button type="button" class="btn" onclick="togglePacketDrawer(\'' + t.taskId + '\', \'how\')">How to fix on ' + esc(v.crawl.platform.toUpperCase()) + '</button>' +
                '<button type="button" class="btn" onclick="togglePacketDrawer(\'' + t.taskId + '\', \'pages\')">See pages (' + t.affectedUrls.length + ')</button>' +
                '<button type="button" class="btn" id="copy-btn-' + t.taskId + '" onclick="copyTicket(\'' + t.taskId + '\')">Copy as task</button>' +
                '<button type="button" class="btn" onclick="toggleDone(\'' + t.taskId + '\')">' + (done ? '✓ Marked done' : 'Mark done') + '</button>' +
              '</div>' +
              '<div class="packet-drawer" id="drawer-how-' + t.taskId + '">' +
                (t.beforeAfter.length ? '<div class="ba-grid">' + t.beforeAfter.slice(0, 1).map(ba =>
                  '<div class="ba-box cur"><strong>' + esc(ba.currentLabel) + ':</strong><br/>' + esc(ba.currentValue) + '</div>' +
                  '<div class="ba-box sug"><strong>' + esc(ba.suggestedLabel) + ':</strong><br/>' + esc(ba.suggestedValue) + '</div>'
                ).join('') + '</div>' : '') +
                '<ol style="margin:6px 0 0 18px;font-size:13px;line-height:1.65;">' + t.platformSteps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
              '</div>' +
              '<div class="packet-drawer" id="drawer-pages-' + t.taskId + '">' +
                '<div class="url-list">' + t.affectedUrls.slice(0, 25).map(u => '<a class="ux-url" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + ' ↗</a>').join('') + '</div>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>';
      document.getElementById('layer-1-fix-first').innerHTML = html;
    }

    function renderAreaDetail(v, areaId) {
      const area = v.areas.find(a => a.areaId === areaId);
      if (!area) return;
      const failed = area.ruleResults.filter(r => r.kind === 'issue' && r.status === 'fail');
      const passed = area.ruleResults.filter(r => r.kind === 'issue' && r.status === 'pass');
      const unmeasured = area.ruleResults.filter(r => r.status === 'not_measured');

      let extraPanel = '';
      if (areaId === 'ai_readiness') {
        const ai = v.aiReadiness;
        extraPanel = '<div style="margin:14px 0;padding:14px;background:var(--bg);border:1px solid var(--line);border-radius:8px;font-size:13px;">' +
          '<strong>AI Crawler Access (robots.txt):</strong> Search/Citation bots are scored separately from Training bots.' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' +
            ai.bots.map(b => '<span class="tag">' + esc(b.userAgent) + ' (' + (b.purpose === 'training' ? 'Training' : 'Search') + '): <strong>' + esc(b.robotsStatus) + '</strong></span>').join('') +
          '</div>' +
          '<div style="margin-top:10px;"><strong>Raw HTML vs Rendered DOM:</strong> ' + esc(ai.rawVsRenderedParity.summary) + '</div>' +
        '</div>';
      } else if (areaId === 'site_health_speed') {
        const sp = v.localSpeed;
        extraPanel = '<div style="margin:14px 0;padding:14px;background:var(--bg);border:1px solid var(--line);border-radius:8px;font-size:13px;">' +
          '<strong>Local Speed &amp; Measurement Hygiene</strong> <span class="tag">' + (sp.browserVitals.measured ? 'Lab estimate (local Chromium)' : 'Static HTTP only') + '</span>' +
          '<div style="font-size:12px;color:var(--ink-soft);margin:6px 0 10px;">' + esc(sp.disclaimer) + '</div>' +
          '<div class="snapshot-strip">' +
            '<div class="snap-item"><div class="sl">Avg HTML Size</div><div class="sv">' + sp.staticMetrics.avgHtmlKb + ' KB</div><div class="sd">Max: ' + sp.staticMetrics.maxHtmlKb + ' KB</div></div>' +
            '<div class="snap-item"><div class="sl">3rd-Party Scripts</div><div class="sv">' + sp.staticMetrics.avgThirdPartyScripts + ' avg</div><div class="sd">' + sp.staticMetrics.thirdPartyDomains.length + ' external domains</div></div>' +
            '<div class="snap-item"><div class="sl">Lab LCP (≤2.5s)</div><div class="sv">' + (sp.browserVitals.lcpMs !== null ? (sp.browserVitals.lcpMs / 1000).toFixed(2) + 's' : 'Not measured') + '</div><div class="sd">' + (sp.browserVitals.measured ? 'Lab estimate' : 'Run Deep scan') + '</div></div>' +
            '<div class="snap-item"><div class="sl">Lab CLS (≤0.1)</div><div class="sv">' + (sp.browserVitals.cls !== null ? sp.browserVitals.cls : 'Not measured') + '</div><div class="sd">' + (sp.browserVitals.measured ? 'Lab estimate' : 'Run Deep scan') + '</div></div>' +
          '</div>' +
        '</div>';
      }

      const row = (r) =>
        '<div class="check-row"><div><strong>' + esc(r.status === 'pass' ? r.title : r.plainTitle) + '</strong> <span class="specialist-only mono" style="font-size:11px;color:var(--ink-faint);">[' + esc(r.ruleId) + ']</span>' +
        '<div style="font-size:12.5px;color:var(--ink-soft);">' + (r.status === 'not_measured' ? esc(r.notMeasuredReason || 'Not measured') : (r.status === 'pass' ? 'All ' + r.applicableCount + ' ' + esc(r.denominatorNoun) + ' passed' : r.affectedCount + ' of ' + r.applicableCount + ' ' + esc(r.denominatorNoun) + ' affected')) + '</div></div>' +
        '<span class="status-chip ' + r.status + '">' + (r.status === 'pass' ? '✓ Passed' : r.status === 'fail' ? '✕ Failed' : 'Not measured') + '</span></div>';

      document.getElementById('layer-2-area').innerHTML =
        '<div class="panel"><div class="panel-head"><div><h3>' + esc(area.label) + ' — ' + (area.score !== null ? area.score + '/100 (Grade ' + area.grade + ')' : 'Not measured') + '</h3><span class="verified">' + esc(area.description) + '</span></div></div>' +
        '<div class="panel-body">' + extraPanel +
          (failed.length ? '<h4 style="font-size:13px;color:var(--block);margin:10px 0 4px;">Issues detected (' + failed.length + ')</h4>' + failed.map(row).join('') : '<p style="color:var(--good);font-size:13.5px;">✓ No issues detected in ' + esc(area.label) + '.</p>') +
          (unmeasured.length ? '<h4 style="font-size:13px;color:var(--ink-soft);margin:14px 0 4px;">Not measured (' + unmeasured.length + ')</h4>' + unmeasured.map(row).join('') : '') +
          (passed.length ? '<details style="margin-top:14px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--good);">Passed checks (' + passed.length + ') ▾</summary><div style="margin-top:8px;">' + passed.map(row).join('') + '</div></details>' : '') +
        '</div></div>';
    }

    async function runAuditRequest(payload) {
      document.getElementById('verdict-progress').style.display = 'block';
      document.getElementById('verdict-progress-title').textContent = 'Auditing ' + (payload.domainInput || 'saved scan') + '…';
      try {
        const res = await fetch('/api/audit/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        document.getElementById('verdict-progress').style.display = 'none';
        if (!res.ok) throw new Error(data.error || 'Audit failed');
        renderVerdict(data);
      } catch (err) {
        document.getElementById('verdict-progress-step').textContent = '✕ ' + err.message;
      }
    }

    window.runVerdictFor = function(domain) {
      document.getElementById('verdict-domain-input').value = domain;
      runAuditRequest({ domainInput: domain, maxLevel: document.getElementById('verdict-scan-mode').value });
    };
    window.loadSavedVerdict = function(crawlId) {
      runAuditRequest({ crawlId });
    };

    document.getElementById('verdict-scan-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const d = document.getElementById('verdict-domain-input').value.trim();
      if (!d) return;
      runAuditRequest({ domainInput: d, maxLevel: document.getElementById('verdict-scan-mode').value });
    });

    (function checkUrlParams() {
      const p = new URLSearchParams(window.location.search);
      if (p.get('crawlId')) loadSavedVerdict(p.get('crawlId'));
      else if (p.get('url') && p.get('autoScan') === 'true') runVerdictFor(p.get('url'));
    })();
  </script>
</body>
</html>`;
}

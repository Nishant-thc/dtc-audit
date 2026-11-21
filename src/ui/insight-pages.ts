import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_REGISTRY } from '../tools/registry.ts';
import { STANDING_POLICY_STATEMENT } from '../engine/report-service.ts';
import type { StandaloneToolModule } from '../tools/types.ts';
import type { CrawlRecord } from '../types/entities.ts';
import { renderSharedHead, renderGlobalTopHeader, escapeHtml } from './templates.ts';
import { WORKING_SEO_CSS } from './verdict-page.ts';
import { TOOL_UX_GUIDE, RULE_PLAYBOOK, HUMAN_COLUMN_LABELS, JARGON_GLOSSARY } from './playbook.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INSIGHT_CSS = fs.readFileSync(path.join(__dirname, 'insight.css'), 'utf-8');
const CONSOLE_JS = fs.readFileSync(path.join(__dirname, 'console-client.js'), 'utf-8');

const GOAL_GROUPS: Array<{ key: string; title: string; sub: string }> = [
  { key: 'products', title: 'Product pages & sales', sub: 'Are my product listings complete, trustworthy and ready to convert?' },
  { key: 'structure', title: 'Store structure & collections', sub: 'Can shoppers and Google find every product and category easily?' },
  { key: 'search', title: 'Google search & content', sub: 'Do my pages show up well in Google, and does my content drive sales?' },
  { key: 'speed', title: 'Speed, competitors & monitoring', sub: 'How fast and lean is my store, and how do I compare over time?' },
];

const QUICK_PICKS = ['row.gymshark.com', 'allbirds.com', 'tentree.com'];

function head(title: string): string {
  return renderSharedHead(title).replace('</head>', `<style>${INSIGHT_CSS}\n${WORKING_SEO_CSS}</style>\n</head>`);
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function shortTitle(t: StandaloneToolModule): string {
  return TOOL_UX_GUIDE[t.manifest.slug]?.shortTitle ?? t.manifest.name.split(' (')[0];
}

export function renderHomePage(crawls: CrawlRecord[]): string {
  const master = TOOL_REGISTRY.find((t) => t.manifest.slug === 'opportunity-dashboard');
  const masterGuide = TOOL_UX_GUIDE['opportunity-dashboard'];

  const shelves = GOAL_GROUPS.map((g) => {
    const tools = TOOL_REGISTRY.filter((t) => TOOL_UX_GUIDE[t.manifest.slug]?.primaryGoalGroup === g.key);
    if (tools.length === 0) return '';
    return `
    <section class="goal-shelf">
      <div class="goal-head"><h2>${escapeHtml(g.title)}</h2><span class="count">${tools.length} tools</span></div>
      <p class="goal-sub">${escapeHtml(g.sub)}</p>
      <div class="goal-grid">
        ${tools
          .map((t) => {
            const ux = TOOL_UX_GUIDE[t.manifest.slug];
            return `<div class="q-card">
            <div>
              <div class="q-name">${escapeHtml(ux.shortTitle)}</div>
              <h3>${escapeHtml(ux.businessQuestion)}</h3>
              <p>${escapeHtml(ux.plainSummary)}</p>
              <div class="q-who">Best for: ${escapeHtml(ux.whoIsItFor)}</div>
            </div>
            <div class="q-foot">
              <span class="mono" style="font-size:11px;color:var(--ink-faint);">Score · visuals · fix plan</span>
              <a href="/tools/${t.manifest.slug}" class="btn btn-primary">Open →</a>
            </div>
          </div>`;
          })
          .join('')}
      </div>
    </section>`;
  }).join('');

  const recent = crawls.slice(0, 5);

  return `${head('Ecommerce Marketing Intelligence Suite')}
<body>
  ${renderGlobalTopHeader('/')}

  <section class="landing-hero">
    <div class="landing-inner">
      <div class="landing-badge"><span class="landing-badge-dot"></span>Free · reads only public pages · no AI guesswork</div>
      <h1 class="landing-headline">See what's holding your <span class="landing-headline-accent">online store</span> back — and exactly how to fix it</h1>
      <p class="landing-sub">Enter your store's address. Silo SEO reads your public product, collection and content pages, then tells you in plain English what's working, what's broken, and the specific changes to make first.</p>

      <form id="hero-audit-form">
        <div class="landing-input-wrap">
          <input type="text" class="landing-input" id="hero-domain-input" placeholder="yourstore.com" autocomplete="url" />
          <select class="landing-tool-select" id="hero-tool-select" aria-label="Choose what to check">
            <option value="opportunity-dashboard" selected>Full store audit (recommended)</option>
            ${TOOL_REGISTRY.filter((t) => t.manifest.slug !== 'opportunity-dashboard')
              .map((t) => `<option value="${t.manifest.slug}">${escapeHtml(shortTitle(t))}</option>`)
              .join('')}
          </select>
          <button type="submit" class="landing-btn">Audit my store →</button>
        </div>
      </form>
      <div class="landing-trust-bar">
        <span>Try:</span>
        ${QUICK_PICKS.map((d) => `<a href="/tools/opportunity-dashboard?url=${encodeURIComponent(d)}&autoScan=true" style="color:#9DB4FF;">${d}</a>`).join(' · ')}
      </div>
    </div>
  </section>

  <main class="content-container">
    <div class="how-strip">
      <div class="how-card"><div class="how-step">Step 1 · Scan</div><h3>We read your store like Google does</h3><p>Your sitemap, menus, products, collections and articles — public pages only, politely rate-limited.</p></div>
      <div class="how-card"><div class="how-step">Step 2 · Understand</div><h3>A score, visuals and a clear verdict</h3><p>See what's correct, what shouldn't be happening, and how widespread each problem is.</p></div>
      <div class="how-card"><div class="how-step">Step 3 · Fix</div><h3>Step-by-step fixes with before/after</h3><p>Every issue says who should fix it, how long it takes, and what "correct" looks like.</p></div>
    </div>

    ${
      master
        ? `<div class="start-banner">
      <div>
        <div class="tag">Start here</div>
        <h2>${escapeHtml(masterGuide.shortTitle)}</h2>
        <p>${escapeHtml(masterGuide.plainSummary)}</p>
        <ul><li>One overall store score with a grade</li><li>What's correct vs. what's broken, across every area</li><li>A prioritised to-do list split by team (content, developer, marketing)</li></ul>
      </div>
      <a href="/tools/opportunity-dashboard" class="btn btn-blue">Run full store audit →</a>
    </div>`
        : ''
    }

    <h2 class="ux-section-title" style="font-size:28px;">Or answer one specific question</h2>
    <p class="ux-section-sub">Each tool focuses on one business question. They all share the same scan, so switching between them is instant.</p>
    ${shelves}

    ${
      recent.length
        ? `<section class="panel"><div class="panel-head"><h3>Your recent scans</h3><a href="/coverage" class="btn">All scans</a></div><div class="panel-body">
        ${recent
          .map(
            (c) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);font-size:13.5px;">
          <div><strong style="font-family:var(--font-serif);font-size:16px;">${escapeHtml(c.domain)}</strong>
          <span style="color:var(--ink-faint);margin-left:8px;">${escapeHtml(c.platform)} · ${c.coverage.extracted} pages read · ${c.coverage.discovered} URLs found</span></div>
          <a class="btn btn-primary" href="/tools/opportunity-dashboard?crawlId=${encodeURIComponent(c.crawlId)}&autoScan=true">Open report →</a></div>`
          )
          .join('')}
      </div></section>`
        : ''
    }
  </main>

  <script>
    document.getElementById('hero-audit-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var d = document.getElementById('hero-domain-input').value.trim();
      var slug = document.getElementById('hero-tool-select').value || 'opportunity-dashboard';
      if (!d) { document.getElementById('hero-domain-input').focus(); return; }
      window.location.href = '/tools/' + encodeURIComponent(slug) + '?url=' + encodeURIComponent(d) + '&autoScan=true';
    });
  </script>
</body>
</html>`;
}

export function renderStandaloneToolPage(tool: StandaloneToolModule, crawls: CrawlRecord[]): string {
  const m = tool.manifest;
  const ux = TOOL_UX_GUIDE[m.slug];
  const defaultLevel = m.requiredCrawlLevels[m.requiredCrawlLevels.length - 1] || 'B';

  const rulesMeta: Record<string, { title: string; category: string; impact: number; toolSlug: string }> = {};
  for (const t of TOOL_REGISTRY) {
    for (const r of t.rules) {
      rulesMeta[r.ruleId] = { title: r.title, category: r.category, impact: r.impactScore, toolSlug: t.manifest.slug };
    }
  }
  const ownedRuleIds = tool.rules.length > 0 ? tool.rules.map((r) => r.ruleId) : m.ownedRuleIds;

  const bootstrap = {
    tool: {
      slug: m.slug,
      name: m.name,
      number: m.number,
      promise: m.oneLinePromise,
      ownedRuleIds,
      aggregatesAll: m.slug === 'opportunity-dashboard',
    },
    guide: ux ?? null,
    playbook: RULE_PLAYBOOK,
    rules: rulesMeta,
    labels: HUMAN_COLUMN_LABELS,
    glossary: JARGON_GLOSSARY,
    policy: STANDING_POLICY_STATEMENT,
  };

  const railGroups = [{ key: 'start', title: 'Start here' }, ...GOAL_GROUPS].map((g) => {
    const tools = TOOL_REGISTRY.filter((t) => TOOL_UX_GUIDE[t.manifest.slug]?.primaryGoalGroup === g.key);
    if (!tools.length) return '';
    return `<div class="rail-group-label">${escapeHtml(g.title)}</div>${tools
      .map(
        (t) => `<a href="/tools/${t.manifest.slug}" class="rail-item suite-tool-link ${t.manifest.slug === m.slug ? 'rail-item-active' : ''}" data-slug="${escapeHtml(t.manifest.slug)}" title="${escapeHtml(TOOL_UX_GUIDE[t.manifest.slug]?.businessQuestion ?? '')}"><span class="dot"></span>${escapeHtml(shortTitle(t))}</a>`
      )
      .join('')}`;
  }).join('');

  return `${head(`${ux?.shortTitle ?? m.name} | ${m.name}`)}
<body>
  ${renderGlobalTopHeader(m.slug)}
  <div class="app-shell">
    <aside class="rail">
      <div class="rail-brand">
        <div class="mark">${escapeHtml(ux?.shortTitle ?? m.name)}</div>
        <div class="sub">specialist lens</div>
      </div>
      <nav class="rail-nav" style="margin-bottom:8px;">
        <a href="/" id="rail-back-summary" class="rail-item" style="color:#9DB4FF;font-weight:500;"><span class="dot" style="background:#9DB4FF;"></span>← Store Summary</a>
      </nav>
      <div class="rail-section-label">Switch tool (same scan)</div>
      <nav class="rail-nav">${railGroups}</nav>
      <div class="rail-foot" id="rail-crawl-footer">No scan loaded yet<br/>Enter your store address to begin</div>
    </aside>

    <div class="main-workspace">
      <header class="topbar">
        <div class="scan-target">
          <div class="domain" id="topbar-domain-title">${escapeHtml(ux?.shortTitle ?? m.name)}</div>
          <div class="scan-meta" id="topbar-scan-meta">
            <span>${escapeHtml(m.name)}</span>
            <a href="/" class="mono" style="color:var(--visible);text-decoration:underline;font-size:11.5px;">← Store Summary</a>
          </div>
        </div>
        <div class="topbar-actions">
          <button type="button" class="btn" onclick="toggleSetupPanel()">Configure / Re-scan</button>
          <a class="btn" id="export-json-btn" style="display:none;" href="#" target="_blank">Raw JSON</a>
          <a class="btn btn-primary" id="export-report-btn" style="display:none;" href="#" target="_blank">Client PDF</a>
        </div>
      </header>

      <main class="content-container">
        <section class="setup-card" id="input-screen">
          <h2 class="setup-title">${escapeHtml(ux?.businessQuestion ?? m.name)}</h2>
          <p class="setup-sub">${escapeHtml(ux?.plainSummary ?? m.oneLinePromise)}</p>
          <form id="run-tool-form">
            <div class="form-grid">
              <div style="grid-column: span 4;">
                <label for="domainInput">Store website address</label>
                <input type="text" id="domainInput" name="domainInput" placeholder="yourstore.com" value="" />
              </div>
              ${
                m.slug === 'competitor-comparison'
                  ? `<div style="grid-column: span 4;">
                <label for="competitorDomain">Competitor website address</label>
                <input type="text" id="competitorDomain" name="competitorDomain" placeholder="competitor.com" value="" />
              </div>`
                  : ''
              }
            </div>
            <div class="quick-picks"><span>Try:</span>${QUICK_PICKS.map((d) => `<button type="button" class="quick-chip" onclick="uxQuickPick('${d}')">${d}</button>`).join('')}</div>
            <details class="advanced">
              <summary>Scan depth &amp; local saved scans</summary>
              <div class="form-grid" style="margin-top:12px;">
                <div style="grid-column: span 4;">
                  <label for="existingCrawlSelect">Reuse a scan from this browser (0 requests)</label>
                  <select id="existingCrawlSelect" name="crawlId">
                    <option value="">— Run a fresh scan —</option>
                  </select>
                </div>
                <div>
                  <label for="maxDiscoveryUrls">Max URLs to discover</label>
                  <input type="number" id="maxDiscoveryUrls" value="5000" min="50" max="50000" />
                </div>
                <div>
                  <label for="maxLightweightPages">Pages to check in full</label>
                  <input type="number" id="maxLightweightPages" value="${defaultLevel === 'C' ? '150' : '50'}" min="5" max="5000" />
                </div>
                <div>
                  <label for="maxLevel">Scan mode</label>
                  <select id="maxLevel">
                    <option value="A" ${defaultLevel === 'A' ? 'selected' : ''}>Quick (15 pages + sitemap)</option>
                    <option value="B" ${defaultLevel === 'B' ? 'selected' : ''}>Standard (50 pages)</option>
                    <option value="C" ${defaultLevel === 'C' ? 'selected' : ''}>Deep (150 pages + browser vitals)</option>
                  </select>
                </div>
                <div>
                  <label for="forceRecrawl">Freshness</label>
                  <select id="forceRecrawl">
                    <option value="false">Reuse recent scan if available</option>
                    <option value="true">Always scan fresh</option>
                  </select>
                </div>
              </div>
            </details>
            <div style="margin-top:18px;">
              <button type="submit" class="btn btn-blue" id="run-btn" style="padding:11px 22px;font-size:14px;">Run scan →</button>
            </div>
          </form>
        </section>

        <section class="progress-panel" id="run-screen" style="display:none;">
          <div class="progress-title">
            <div style="display:flex;align-items:center;gap:8px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--visible);display:inline-block;"></span><span>Scanning store</span></div>
          </div>
          <div class="progress-step" id="run-status-text">Starting…</div>
          <div class="progress-bar-track" id="run-progress-track"><div class="progress-bar-fill"></div></div>
        </section>

        <div id="results-screen" style="display:none;">
          <section class="hdr-strip" id="tool-header-strip"></section>
          <section id="tool-visual-summary"></section>
          <section id="tool-issues-table"></section>
          <section id="tool-data-tables"></section>
          <div class="standing-banner" style="margin-top:18px;">
            <strong>Honesty &amp; coverage statement:</strong> ${escapeHtml(STANDING_POLICY_STATEMENT)}
          </div>
        </div>
      </main>
    </div>
  </div>

  <script>window.__SILO__ = ${safeJson(bootstrap)};</script>
  <script>${CONSOLE_JS.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
}

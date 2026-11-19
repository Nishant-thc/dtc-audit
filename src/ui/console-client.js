/* Silo SEO — Insight-First Audit Console (client side).
   Pure browser JS. Reads window.__SILO__ (injected by the server) and the
   tool run JSON returned by /api/tools/:slug/run. No external libraries. */
(function () {
  'use strict';
  const D = window.__SILO__;
  const tool = D.tool;
  const guide = D.guide || {};
  const PB = D.playbook || {};
  const RULES = D.rules || {};
  const LABELS = D.labels || {};
  const GLOSS = D.glossary || [];
  const POLICY = D.policy;

  const state = { result: null, crawlId: null, ckFilter: 'all', timers: [], tables: {} };
  const $ = (id) => document.getElementById(id);

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function isUrl(v) { return typeof v === 'string' && /^https?:\/\//i.test(v); }
  function shortUrl(u) {
    try {
      const x = new URL(u);
      const p = (x.pathname || '/') + (x.search || '');
      return p.length > 64 ? p.slice(0, 61) + '…' : p;
    } catch (e) { return String(u); }
  }
  function urlLink(u) {
    return '<a class="ux-url" href="' + esc(u) + '" target="_blank" rel="noopener" title="' + esc(u) + '">' + esc(shortUrl(u)) + ' ↗</a>';
  }
  function humanize(key) {
    if (LABELS[key]) return LABELS[key];
    return String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }
  function cleanTitle(t) { return String(t || '').replace(/^\s*\d+\.\s*/, ''); }
  function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
  function colorFor(score) { return score >= 80 ? 'var(--good)' : score >= 55 ? 'var(--warn)' : 'var(--block)'; }
  function bandLabel(b) { return b === 'High' ? 'Fix first' : b === 'Medium' ? 'Fix next' : 'Fix later'; }
  function bandColor(b) { return b === 'High' ? 'var(--block)' : b === 'Medium' ? 'var(--warn)' : 'var(--visible)'; }
  function plain(ruleId, fallback) { return (PB[ruleId] && PB[ruleId].plainTitle) || (RULES[ruleId] && RULES[ruleId].title) || fallback || ruleId; }

  /* ---------------- tab switching ---------------- */
  window.uxSwitchTab = function (tabId) {
    document.querySelectorAll('.ux-tab').forEach((el) => el.classList.toggle('active', el.id === tabId));
    document.querySelectorAll('#ux-tab-nav .rail-item').forEach((el) => el.classList.toggle('rail-item-active', el.getAttribute('data-tab') === tabId));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  window.uxGoToFix = function (ruleId) {
    window.uxSwitchTab('tab-actions');
    setTimeout(() => {
      const el = document.getElementById('fix-' + ruleId);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.style.boxShadow = '0 0 0 3px rgba(19,72,228,.25)'; setTimeout(() => { el.style.boxShadow = ''; }, 1600); }
    }, 120);
  };
  window.toggleSetupPanel = function () {
    const s = $('input-screen');
    s.style.display = s.style.display === 'none' ? 'block' : 'none';
  };

  /* ---------------- scoring (deterministic, from rule results) ---------------- */
  function ruleUniverse() {
    const ids = tool.ownedRuleIds && tool.ownedRuleIds.length ? tool.ownedRuleIds : (tool.aggregatesAll ? Object.keys(RULES) : []);
    return ids.filter((id) => RULES[id]);
  }
  function evaluate(result) {
    const ids = ruleUniverse();
    const fmap = {};
    result.findings.forEach((f) => { fmap[f.ruleId] = f; });
    const checks = ids.map((id) => {
      const f = fmap[id];
      const healthyPct = f ? Math.max(0, 100 - f.coveragePercentage) : 100;
      return { ruleId: id, finding: f || null, passed: !f, healthyPct, impact: RULES[id].impact || 3, category: RULES[id].category || 'General' };
    });
    let score = null;
    if (checks.length) {
      const tw = checks.reduce((a, c) => a + c.impact, 0);
      const earned = checks.reduce((a, c) => a + c.impact * (c.healthyPct / 100), 0);
      score = Math.round((earned / tw) * 100);
    }
    // Benchmark / monitoring tools (no rules) intentionally show no grade: a score would be invented.
    const cats = {};
    checks.forEach((c) => {
      const k = c.category;
      cats[k] = cats[k] || { w: 0, e: 0, n: 0, failed: 0 };
      cats[k].w += c.impact; cats[k].e += c.impact * (c.healthyPct / 100); cats[k].n++; if (!c.passed) cats[k].failed++;
    });
    return { checks, score, cats, passed: checks.filter((c) => c.passed), failed: checks.filter((c) => !c.passed) };
  }
  function grade(score) {
    if (score == null) return { g: '—', v: 'Benchmark view', c: 'var(--ink-faint)' };
    if (score >= 90) return { g: 'A', v: 'Excellent · minor polish only', c: 'var(--good)' };
    if (score >= 75) return { g: 'B', v: 'Good · a few fixes recommended', c: 'var(--good)' };
    if (score >= 60) return { g: 'C', v: 'Needs attention', c: 'var(--warn)' };
    if (score >= 40) return { g: 'D', v: 'Significant gaps found', c: 'var(--block)' };
    return { g: 'F', v: 'Action required', c: 'var(--block)' };
  }

  /* ---------------- visual primitives ---------------- */
  function gaugeSvg(score, color) {
    const r = 54, c = 2 * Math.PI * r, p = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
    return '<svg width="140" height="140" viewBox="0 0 140 140">' +
      '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="#E9EBF0" stroke-width="12"/>' +
      '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - p)) + '" transform="rotate(-90 70 70)" style="transition:stroke-dashoffset .8s ease"/>' +
      '<text x="70" y="78" text-anchor="middle" font-size="34" font-family="Fraunces, Georgia, serif" fill="' + color + '">' + (score == null ? '—' : score) + '</text>' +
      '<text x="70" y="98" text-anchor="middle" font-size="11" font-family="IBM Plex Mono, monospace" fill="#8A909C">/ 100</text></svg>';
  }
  function donut(parts, centerLabel) {
    const total = parts.reduce((a, p) => a + p.value, 0) || 1;
    const r = 46, c = 2 * Math.PI * r;
    let offset = 0;
    const arcs = parts.map((p) => {
      const len = (p.value / total) * c;
      const s = '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + p.color + '" stroke-width="16" stroke-dasharray="' + len + ' ' + (c - len) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 60 60)"/>';
      offset += len;
      return s;
    }).join('');
    return '<div class="donut-wrap"><svg width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#EEF0F4" stroke-width="16"/>' + arcs +
      '<text x="60" y="66" text-anchor="middle" font-size="20" font-family="Fraunces, Georgia, serif" fill="#14171C">' + esc(centerLabel) + '</text></svg><div>' +
      parts.map((p) => '<div class="legend-item"><span class="legend-dot" style="background:' + p.color + '"></span>' + esc(p.label) + ' <strong style="margin-left:4px;">' + p.value + '</strong></div>').join('') + '</div></div>';
  }
  function hbars(items, opts) {
    opts = opts || {};
    const max = opts.max || Math.max(1, ...items.map((i) => i.value));
    return items.map((i) =>
      '<div class="hbar"><div class="hbar-label" title="' + esc(i.label) + '">' + esc(i.label) + '</div>' +
      '<div class="hbar-track"><div class="hbar-fill" style="width:' + Math.max(2, (i.value / max) * 100) + '%;background:' + (i.color || 'var(--visible)') + '"></div></div>' +
      '<div class="hbar-val">' + esc(i.display != null ? i.display : i.value) + '</div></div>').join('');
  }
  function chartCard(title, sub, body, note) {
    return '<div class="chart-card"><h4>' + esc(title) + '</h4><div class="chart-sub">' + esc(sub || '') + '</div>' + body + (note ? '<div class="chart-note">' + note + '</div>' : '') + '</div>';
  }
  function meter(pctVal, color) {
    return '<div class="hbar-track"><div class="hbar-fill" style="width:' + Math.max(2, pctVal) + '%;background:' + color + '"></div></div>';
  }

  /* ---------------- auto charts from real tables ---------------- */
  const PREF_CAT = ['pageType', 'titleStatus', 'metaDescStatus', 'format', 'priceBand', 'availability', 'changeType', 'linkType', 'schemaType', 'category', 'discoverySource', 'paginationType', 'detectedLocaleSubfolder', 'htmlLang', 'extractionLevel'];
  const PALETTE = ['#1348E4', '#0D7A3E', '#A9720C', '#A6342A', '#6B4FD8', '#0E7490', '#B45309', '#475569'];
  function tableCharts(tables) {
    const out = [];
    for (const t of tables) {
      if (out.length >= 3) break;
      if (!t.rows || t.rows.length < 2) continue;
      const cols = Object.keys(t.rows[0]);
      if (tool.slug === 'competitor-comparison' && cols.includes('primaryDomain')) continue;
      if (t.rows.length <= 20) {
        const labelCol = cols.find((c) => typeof t.rows[0][c] === 'string' && !isUrl(t.rows[0][c]) && !/url/i.test(c));
        const numCol = cols.find((c) => c !== labelCol && typeof t.rows[0][c] === 'number');
        if (labelCol && numCol) {
          const items = t.rows.slice(0, 12).map((r, i) => ({ label: String(r[labelCol]), value: Number(r[numCol]) || 0, color: PALETTE[i % PALETTE.length] }));
          out.push(chartCard(cleanTitle(t.title), humanize(numCol) + ' by ' + humanize(labelCol).toLowerCase(), hbars(items)));
          continue;
        }
      }
      if (cols.includes('completenessScore')) {
        const bands = [['90–100 Excellent', 90, 101, 'var(--good)'], ['75–89 Good', 75, 90, '#3E9B63'], ['60–74 Fair', 60, 75, 'var(--warn)'], ['Below 60 Poor', 0, 60, 'var(--block)']];
        const items = bands.map((b) => ({ label: b[0], value: t.rows.filter((r) => r.completenessScore >= b[1] && r.completenessScore < b[2]).length, color: b[3] }));
        out.push(chartCard('Quality score distribution', t.rows.length + ' items scored 0–100 · ' + cleanTitle(t.title), hbars(items)));
        continue;
      }
      const cat = PREF_CAT.find((c) => cols.includes(c));
      if (cat) {
        const counts = {};
        t.rows.forEach((r) => { const k = String(r[cat] == null ? '(none)' : r[cat]); counts[k] = (counts[k] || 0) + 1; });
        const keys = Object.keys(counts);
        if (keys.length >= 2 && keys.length <= 15) {
          const items = keys.sort((a, b) => counts[b] - counts[a]).map((k, i) => ({ label: k, value: counts[k], display: counts[k] + ' (' + pct(counts[k], t.rows.length) + '%)', color: PALETTE[i % PALETTE.length] }));
          out.push(chartCard(humanize(cat) + ' breakdown', t.rows.length + ' rows · ' + cleanTitle(t.title), hbars(items)));
        }
      }
    }
    return out;
  }
  function competitorChart(result) {
    const t = result.tables.find((x) => x.rows && x.rows[0] && 'primaryDomain' in x.rows[0]);
    if (!t) return '';
    const p = result.headlineMetrics.find((m) => m.id === 'primary_domain');
    const c = result.headlineMetrics.find((m) => m.id === 'comparison_domain');
    const rows = t.rows.filter((r) => !isNaN(parseFloat(r.primaryDomain)) && !isNaN(parseFloat(r.comparisonDomain)));
    const body = rows.map((r) => {
      const a = parseFloat(r.primaryDomain), b = parseFloat(r.comparisonDomain), mx = Math.max(1, a, b);
      const lead = a === b ? 'Tied' : a > b ? 'You lead' : 'Competitor leads';
      return '<div class="pair-bar"><div class="pl">' + esc(r.metric) + ' <span class="tag" style="margin-left:6px;">' + lead + '</span></div>' +
        '<div class="pair-row"><span class="who">' + esc(p ? p.value : 'You') + '</span>' + meter((a / mx) * 100, 'var(--visible)') + '<span class="hbar-val">' + esc(r.primaryDomain) + '</span></div>' +
        '<div class="pair-row"><span class="who">' + esc(c ? c.value : 'Competitor') + '</span>' + meter((b / mx) * 100, '#8A909C') + '<span class="hbar-val">' + esc(r.comparisonDomain) + '</span></div></div>';
    }).join('');
    const same = p && c && p.value === c.value;
    return chartCard('Head-to-head benchmark', 'Your store vs. competitor on public, measurable signals', body,
      same ? '⚠ Only one store has been scanned so far, so both columns show the same domain. Enter a competitor domain in <strong>Configure / Re-scan</strong> to see a real comparison.' : '');
  }

  /* ---------------- TAB 1: Insights ---------------- */
  function renderInsights(r, ev) {
    const cov = r.coveragePanel;
    const g = grade(ev.score);
    const topFixes = r.findings.slice().sort((a, b) => b.priorityScore - a.priorityScore);
    const verdictLines = [];
    verdictLines.push('We scanned <strong>' + esc(cov.domain) + '</strong> and read <strong>' + cov.extracted + ' pages in full</strong> (out of ' + cov.discovered + ' public URLs found).');
    if (ev.checks.length) {
      verdictLines.push('<strong style="color:var(--good)">' + ev.passed.length + ' of ' + ev.checks.length + ' checks look healthy</strong>' +
        (ev.failed.length ? ' and <strong style="color:var(--block)">' + ev.failed.length + ' need attention</strong>.' : ' — nothing needs fixing in this area.'));
    }
    if (topFixes.length) verdictLines.push('The single most valuable change right now: <strong>' + esc(plain(topFixes[0].ruleId, topFixes[0].title)) + '</strong>.');

    const catRows = Object.keys(ev.cats).map((k) => {
      const c = ev.cats[k]; const s = Math.round((c.e / c.w) * 100);
      return '<div class="cat-row"><div><div class="cat-name">' + esc(k) + '</div><span class="cat-weight">' + c.n + ' check' + (c.n > 1 ? 's' : '') + ' · ' + (c.failed ? c.failed + ' need fixing' : 'all healthy') + '</span></div>' +
        '<div class="cat-track"><div class="cat-fill" style="width:' + s + '%;background:' + colorFor(s) + '"></div></div><div class="cat-score">' + s + '</div></div>';
    }).join('') || r.headlineMetrics.map((m) => '<div class="cat-row"><div><div class="cat-name">' + esc(m.label) + '</div><span class="cat-weight">' + esc(m.subtitle || '') + '</span></div><div></div><div class="cat-score" style="font-size:15px;">' + esc(m.value) + '</div></div>').join('');

    // Diagnosis board
    const goodItems = [];
    ev.passed.slice(0, 6).forEach((c) => {
      const p = PB[c.ruleId];
      goodItems.push({ t: '✓ ' + (p ? p.whatCorrectLooksLike.split('.')[0] : RULES[c.ruleId].title), d: 'No issues detected for "' + plain(c.ruleId) + '" across the pages we inspected.' });
    });
    r.headlineMetrics.filter((m) => m.status === 'good').slice(0, 3).forEach((m) => goodItems.push({ t: '✓ ' + m.label + ': ' + m.value, d: m.subtitle || '' }));
    const badItems = topFixes.slice(0, 5).map((f) => {
      const p = PB[f.ruleId];
      return { t: plain(f.ruleId, f.title), d: (p ? p.whyItHurts : f.evidenceSummary) + ' <em>(' + f.affectedCount + ' of ' + f.inspectedCount + ' pages · ' + f.coveragePercentage + '%)</em>' };
    });
    r.headlineMetrics.filter((m) => m.status === 'critical' || m.status === 'warning').forEach((m) => {
      if (badItems.length < 6 && !r.findings.length) badItems.push({ t: m.label + ': ' + m.value, d: m.subtitle || '' });
    });
    const todo = topFixes.slice(0, 3).map((f, i) => {
      const p = PB[f.ruleId];
      return '<div class="diag-item" style="display:flex;"><span class="diag-num">' + (i + 1) + '</span><div><div class="t">' + esc(p ? p.actionSteps[0] : f.recommendationText) + '</div>' +
        '<div class="d">' + esc(p ? p.owner + ' · ' + p.effort : f.category) + ' · <a href="javascript:void(0)" onclick="uxGoToFix(\'' + f.ruleId + '\')" style="color:var(--visible)">See how to fix →</a></div></div></div>';
    }).join('');
    const item = (x) => '<div class="diag-item"><div class="t">' + esc(x.t) + '</div><div class="d">' + x.d + '</div></div>';

    // Charts
    const charts = [];
    if (ev.checks.length) {
      charts.push(chartCard('Check results', 'How many of this tool\'s checks passed on your store',
        donut([{ label: 'Healthy (correct)', value: ev.passed.length, color: 'var(--good)' }, { label: 'Needs fixing', value: ev.failed.length, color: 'var(--block)' }], pct(ev.passed.length, ev.checks.length) + '%')));
    }
    if (r.findings.length) {
      const items = topFixes.slice(0, 8).map((f) => ({ label: plain(f.ruleId, f.title), value: f.coveragePercentage, display: f.coveragePercentage + '%', color: bandColor(f.priorityBand) }));
      charts.push(chartCard('How widespread is each issue?', 'Share of inspected pages affected — longer bar = more pages to fix', hbars(items, { max: 100 }),
        'Red = fix first · Amber = fix next · Blue = fix later. Issues hitting most pages are usually caused by one shared template, so a single fix resolves them all.'));
    }
    if (tool.slug === 'competitor-comparison') charts.push(competitorChart(r));
    tableCharts(r.tables).forEach((c) => { if (charts.length < 5) charts.push(c); });

    $('tab-insights').innerHTML =
      '<div class="verdict-strip"><div class="verdict-question">The question this answers: ' + esc(guide.businessQuestion || tool.name) + '</div>' + verdictLines.join(' ') + '</div>' +
      '<div class="overview-grid"><div class="score-block"><div class="gauge-wrap">' + gaugeSvg(ev.score, g.c) +
      '<span class="gauge-grade" style="background:' + (ev.score == null ? 'var(--bg)' : g.c) + ';color:' + (ev.score == null ? 'var(--ink-soft)' : '#fff') + '">Grade ' + g.g + '</span></div>' +
      '<div class="score-label" style="margin-top:8px;">' + esc(guide.shortTitle || tool.name) + ' Score</div><div class="score-verdict">' + esc(g.v) + '</div></div>' +
      '<div class="category-bars">' + catRows + '</div></div>' +
      '<div class="metrics-row">' + r.headlineMetrics.map((m, i) => {
        const col = m.status === 'good' ? 'var(--good)' : m.status === 'critical' ? 'var(--block)' : m.status === 'warning' ? 'var(--warn)' : 'var(--ink)';
        const urls = (m.affectedUrls || []).slice(0, 10);
        return '<div class="metric-box" onclick="var e=document.getElementById(\'mu-' + i + '\');e.style.display=e.style.display===\'none\'?\'block\':\'none\'">' +
          '<div class="metric-label">' + esc(m.label) + '</div><div class="metric-val" style="color:' + col + '">' + esc(m.value) + '</div><div class="metric-sub">' + esc(m.subtitle || '') + '</div>' +
          '<div id="mu-' + i + '" style="display:none;margin-top:8px;border-top:1px solid var(--line);padding-top:6px;" class="url-list">' +
          (urls.length ? urls.map(urlLink).join('') + ((m.affectedUrls.length > 10) ? '<span style="font-size:11px;color:var(--ink-faint)">+' + (m.affectedUrls.length - 10) + ' more in Page Data Explorer</span>' : '') : '<span style="font-size:12px;color:var(--ink-faint)">No specific pages</span>') + '</div></div>';
      }).join('') + '</div>' +
      '<div class="diag-board">' +
        '<div class="diag-col good"><h3>🟢 What\'s correct</h3><div class="diag-sub">Working well — keep doing this</div>' + (goodItems.length ? goodItems.map(item).join('') : '<div class="diag-empty">No fully passing checks yet in this area.</div>') + '</div>' +
        '<div class="diag-col bad"><h3>🔴 What shouldn\'t be happening</h3><div class="diag-sub">Problems found and why they matter</div>' + (badItems.length ? badItems.map(item).join('') : '<div class="diag-empty">Nothing wrong detected in the pages we inspected. 🎉</div>') + '</div>' +
        '<div class="diag-col todo"><h3>🎯 Do these 3 things first</h3><div class="diag-sub">Highest-value specific changes</div>' + (todo || '<div class="diag-empty">No changes required right now.</div>') +
        (topFixes.length ? '<button class="btn btn-blue" style="margin-top:12px;width:100%;" onclick="uxSwitchTab(\'tab-actions\')">Open full action plan →</button>' : '') + '</div>' +
      '</div>' +
      (charts.length ? '<h3 class="ux-section-title" style="font-size:20px;">Visual analysis</h3><p class="ux-section-sub">Charts built directly from the data scraped on this scan.</p><div class="chart-grid">' + charts.join('') + '</div>' : '');
  }

  /* ---------------- TAB 2: Action plan ---------------- */
  function renderActions(r) {
    const fs = r.findings.slice().sort((a, b) => b.priorityScore - a.priorityScore);
    if (!fs.length) {
      $('tab-actions').innerHTML = '<h2 class="ux-section-title">Action plan</h2><div class="empty-state">✓ No fixes required — every check in this tool passed on the pages we inspected.</div>' +
        (tool.slug === 'competitor-comparison' || tool.slug === 'change-tracker' ? '<p class="ux-section-sub" style="margin-top:14px;">This tool is a monitoring/benchmark view rather than a rule-based audit. Use the Insights tab to read the comparison.</p>' : '');
      return;
    }
    const owners = { 'Merchandising / Content Team': 0, 'Theme / Web Developer': 0, 'SEO / Marketing Manager': 0 };
    const quads = { quick_win: [], template_project: [], catalogue_hygiene: [], maintenance: [] };
    fs.forEach((f) => {
      const p = PB[f.ruleId];
      if (p) { owners[p.owner]++; quads[p.quadrant].push(f); } else { quads.maintenance.push(f); }
    });
    const quad = (key, title, sub) => '<div class="quad"><h4>' + title + '</h4><div class="qs">' + sub + '</div>' +
      (quads[key].length ? '<ul>' + quads[key].map((f) => '<li onclick="uxGoToFix(\'' + f.ruleId + '\')">' + esc(plain(f.ruleId, f.title)) + '</li>').join('') + '</ul>' : '<div class="none">Nothing here.</div>') + '</div>';

    const cards = fs.map((f) => {
      const p = PB[f.ruleId];
      const sampleUrls = f.affectedUrls.slice(0, 3);
      const nowSide = p
        ? '<p>' + esc(p.whatIsHappening) + '</p><p><strong>Why it matters:</strong> ' + esc(p.whyItHurts) + '</p>' +
          '<div class="found-box"><strong>Found on your store:</strong> ' + esc(f.evidenceSummary) + (sampleUrls.length ? '<div style="margin-top:6px;display:grid;gap:3px;">' + sampleUrls.map(urlLink).join('') + '</div>' : '') + '</div>' +
          '<div class="example-box">' + esc(p.beforeExample) + '</div>'
        : '<p>' + esc(f.evidenceSummary) + '</p>';
      const targetSide = p
        ? '<p>' + esc(p.whatCorrectLooksLike) + '</p><div class="example-box">' + esc(p.afterExample) + '</div>'
        : '<p>' + esc(f.recommendationText) + '</p>';
      const steps = (p ? p.actionSteps : [f.recommendationText]).map((s, i) => '<div class="step"><span class="diag-num">' + (i + 1) + '</span><span>' + esc(s) + '</span></div>').join('');
      return '<div class="fix-card" id="fix-' + f.ruleId + '">' +
        '<div class="fix-head"><div style="flex:1;min-width:280px;"><div class="fix-tags"><span class="pill pill-' + f.priorityBand + '">' + bandLabel(f.priorityBand) + '</span>' +
          (p ? '<span class="tag">👤 ' + esc(p.owner) + '</span><span class="tag">⏱ ' + esc(p.effort) + '</span>' : '') + '</div>' +
          '<h3>' + esc(plain(f.ruleId, f.title)) + '</h3></div>' +
          '<div class="fix-reach"><div class="small">Pages affected</div><div class="big">' + f.affectedCount + ' <span style="font-size:14px;color:var(--ink-faint)">of ' + f.inspectedCount + '</span></div>' + meter(f.coveragePercentage, bandColor(f.priorityBand)) + '<div class="small" style="margin-top:4px;">' + f.coveragePercentage + '% of inspected pages</div></div></div>' +
        '<div class="fix-body"><div class="fix-side now"><h5>🔴 What\'s happening now</h5>' + nowSide + '</div><div class="fix-side target"><h5>🟢 What correct looks like</h5>' + targetSide + '</div></div>' +
        '<div class="fix-steps"><h5>How to fix it — step by step</h5>' + steps + '</div>' +
        '<div class="fix-foot"><details><summary>View all ' + f.affectedUrls.length + ' affected pages ▾</summary><div class="url-list">' + f.affectedUrls.slice(0, 100).map(urlLink).join('') +
          (f.affectedUrls.length > 100 ? '<span style="font-size:11px;color:var(--ink-faint)">Showing first 100 — export JSON for the full list.</span>' : '') + '</div></details>' +
          '<details><summary style="color:var(--ink-faint)">Technical details</summary><div style="margin-top:6px;font-family:var(--font-mono);font-size:11.5px;color:var(--ink-soft);line-height:1.7;">Check ID: ' + esc(f.ruleId) + '<br/>Priority score ' + f.priorityScore + ' = Impact ' + f.impactScore + ' × Reach ' + f.coverageScore + ' × Confidence ' + f.confidenceScore + '<br/>How detected: ' + esc(f.howDetected) + '</div></details></div></div>';
    }).join('');

    $('tab-actions').innerHTML =
      '<h2 class="ux-section-title">Your action plan</h2><p class="ux-section-sub">Every issue below is written in plain language with who should fix it, how long it takes, what\'s wrong today on your actual pages, what "correct" looks like, and the exact steps. Ordered by value — start at the top.</p>' +
      '<div class="team-strip">' + Object.keys(owners).map((k) => '<div class="team-card"><div class="n">' + owners[k] + '</div><div class="l">tasks for ' + esc(k) + '</div></div>').join('') + '</div>' +
      '<div class="quad-grid">' + quad('quick_win', '⚡ Quick wins', 'high value · under 30 minutes') + quad('template_project', '🏗️ One-time theme fixes', 'fix the template once · fixes every page') +
        quad('catalogue_hygiene', '🧹 Catalogue & content clean-up', 'ongoing merchandising work') + quad('maintenance', '🔧 Review & monitor', 'lower urgency · check periodically') + '</div>' + cards;
  }

  /* ---------------- TAB 3: Checklist ---------------- */
  function renderChecklist(r, ev) {
    let rows = [];
    if (ev.checks.length) {
      rows = ev.checks.map((c) => {
        const p = PB[c.ruleId];
        const f = c.finding;
        return {
          status: c.passed ? 'pass' : (f.priorityBand === 'Low' ? 'warn' : 'fail'),
          name: plain(c.ruleId),
          desc: c.passed ? ('Correct — ' + (p ? p.whatCorrectLooksLike : 'no issues detected in the inspected pages.')) : (p ? p.whyItHurts : f.evidenceSummary),
          healthy: c.passed ? 100 : Math.round(c.healthyPct),
          meterLabel: c.passed ? 'All inspected pages healthy' : (f.inspectedCount - f.affectedCount) + ' of ' + f.inspectedCount + ' pages healthy',
          ruleId: c.passed ? null : c.ruleId,
        };
      });
    } else {
      rows = r.headlineMetrics.map((m) => ({
        status: m.status === 'good' ? 'pass' : m.status === 'critical' ? 'fail' : m.status === 'warning' ? 'warn' : 'info',
        name: m.label + ': ' + m.value, desc: m.subtitle || '', healthy: null, meterLabel: '', ruleId: null,
      }));
    }
    const passN = rows.filter((x) => x.status === 'pass').length;
    const failN = rows.filter((x) => x.status === 'fail' || x.status === 'warn').length;
    const filtered = rows.filter((x) => state.ckFilter === 'all' || (state.ckFilter === 'pass' ? x.status === 'pass' : x.status === 'fail' || x.status === 'warn'));
    const icon = { pass: '✓', fail: '✕', warn: '!', info: 'i' };
    $('tab-checklist').innerHTML =
      '<h2 class="ux-section-title">What\'s correct vs. what\'s broken</h2><p class="ux-section-sub">Every check this tool runs, with its verdict. Green checks are already correct on your store — no action needed.</p>' +
      '<div class="checklist-summary">' +
        '<div class="cl-tile"><div class="cl-tile-number" style="color:var(--good)">' + passN + '</div><div class="cl-tile-label">Correct (passed)</div></div>' +
        '<div class="cl-tile"><div class="cl-tile-number" style="color:var(--block)">' + failN + '</div><div class="cl-tile-label">Needs fixing</div></div>' +
        '<div class="cl-tile"><div class="cl-tile-number">' + rows.length + '</div><div class="cl-tile-label">Total checks</div></div>' +
        '<div class="cl-tile"><div class="cl-tile-number" style="color:' + colorFor(pct(passN, rows.length)) + '">' + pct(passN, rows.length) + '%</div><div class="cl-tile-label">Checks healthy</div></div></div>' +
      '<div class="ck-filters">' + [['all', 'All (' + rows.length + ')'], ['pass', '✓ Correct (' + passN + ')'], ['fail', '✕ Needs fix (' + failN + ')']].map((x) =>
        '<button class="ck-pill ' + (state.ckFilter === x[0] ? 'on' : '') + '" onclick="uxCkFilter(\'' + x[0] + '\')">' + x[1] + '</button>').join('') + '</div>' +
      '<div class="panel"><div class="panel-body" style="padding:0;">' + (filtered.length ? filtered.map((x) =>
        '<div class="ck-row ' + (x.ruleId ? 'clickable' : '') + '"' + (x.ruleId ? ' onclick="uxGoToFix(\'' + x.ruleId + '\')"' : '') + '>' +
        '<div class="ck-icon ' + x.status + '">' + icon[x.status] + '</div><div><div class="ck-name">' + esc(x.name) + '</div><div class="ck-desc">' + esc(x.desc) + (x.ruleId ? ' <span style="color:var(--visible)">→ how to fix</span>' : '') + '</div></div>' +
        '<div class="ck-meter">' + (x.healthy != null ? '<div class="lbl">' + esc(x.meterLabel) + '</div>' + meter(x.healthy, colorFor(x.healthy)) : '') + '</div></div>').join('')
        : '<div style="padding:18px;color:var(--ink-faint);font-size:13px;">No checks in this filter.</div>') + '</div></div>';
  }
  window.uxCkFilter = function (f) { state.ckFilter = f; if (state.result) renderChecklist(state.result, evaluate(state.result)); };

  /* ---------------- TAB 4: Explorer ---------------- */
  const BAD_WHEN_TRUE = { isNoindex: 1, fingerprintChanged: 1 };
  function fmtCell(key, v) {
    if (v === null || v === undefined || v === '') return '<span style="color:var(--ink-faint)">—</span>';
    if (typeof v === 'boolean' || v === 'true' || v === 'false') {
      const b = v === true || v === 'true';
      if (BAD_WHEN_TRUE[key]) return b ? '<span class="bad">✕ Yes</span>' : '<span class="yes">✓ No</span>';
      return b ? '<span class="yes">✓ Yes</span>' : '<span class="no">✕ No</span>';
    }
    if (typeof v === 'number') {
      if (/score|pct|Pct|coverage/i.test(key) && v >= 0 && v <= 100) {
        const c = /Pct$|coverage/i.test(key) && /missing|issue/i.test(key) ? 'var(--block)' : colorFor(v);
        return '<span class="mini-bar"><span class="tr"><span class="fl" style="display:block;width:' + v + '%;background:' + c + '"></span></span><span class="mono">' + v + '</span></span>';
      }
      return '<span class="mono">' + v.toLocaleString() + '</span>';
    }
    if (Array.isArray(v)) v = v.join(', ');
    if (typeof v === 'object') v = JSON.stringify(v);
    const s = String(v);
    if (isUrl(s)) return urlLink(s);
    if (s.includes(' | ') && isUrl(s.split(' | ')[0])) {
      const parts = s.split(' | ');
      return parts.slice(0, 2).map(urlLink).join('<br/>') + (parts.length > 2 ? '<br/><span style="font-size:11px;color:var(--ink-faint)">+' + (parts.length - 2) + ' more</span>' : '');
    }
    if (/^(optimal|in_stock|ok)$/i.test(s)) return '<span class="yes">' + esc(s.replace('_', ' ')) + '</span>';
    if (/^\(?missing\)?|too short|too long|not declared|not detected|out_of_stock/i.test(s)) return '<span class="no">' + esc(s.replace(/_/g, ' ')) + '</span>';
    return s.length > 140 ? '<span title="' + esc(s) + '">' + esc(s.slice(0, 137)) + '…</span>' : esc(s);
  }
  function renderTableBody(id) {
    const st = state.tables[id];
    const q = st.q.toLowerCase();
    const rows = q ? st.rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : st.rows;
    const shown = st.all ? rows : rows.slice(0, 20);
    $('exb-' + id).innerHTML = shown.map((r) => '<tr>' + st.cols.map((c) => '<td>' + fmtCell(c, r[c]) + '</td>').join('') + '</tr>').join('') ||
      '<tr><td colspan="' + st.cols.length + '" style="color:var(--ink-faint)">No rows match.</td></tr>';
    $('exm-' + id).innerHTML = 'Showing ' + shown.length + ' of ' + rows.length + ' rows' +
      (rows.length > 20 ? ' <button class="btn" style="padding:3px 10px;font-size:11.5px;" onclick="uxTblAll(\'' + id + '\')">' + (st.all ? 'Show first 20' : 'Show all ' + rows.length) + '</button>' : '');
  }
  window.uxTblFilter = function (id, q) { state.tables[id].q = q; renderTableBody(id); };
  window.uxTblAll = function (id) { state.tables[id].all = !state.tables[id].all; renderTableBody(id); };

  function renderExplorer(r) {
    state.tables = {};
    const html = r.tables.map((t, idx) => {
      const n = t.rows ? t.rows.length : 0;
      const head = '<summary><div><h3>' + esc(cleanTitle(t.title)) + '</h3><div class="ex-desc">' + esc(t.description || '') + '</div></div><span class="ex-count">' + n + ' row' + (n === 1 ? '' : 's') + '</span></summary>';
      if (!n) return '<details class="ex-panel">' + head + '<div style="padding:0 18px 16px;font-size:13px;color:var(--ink-faint);">Nothing detected here within the pages we inspected.</div></details>';
      const cols = Object.keys(t.rows[0]);
      state.tables[t.id] = { rows: t.rows, cols, q: '', all: false };
      return '<details class="ex-panel"' + (idx === 0 ? ' open' : '') + '>' + head +
        '<div class="ex-tools"><input type="text" placeholder="Search these rows…" oninput="uxTblFilter(\'' + t.id + '\', this.value)"/>' +
        '<a class="btn" href="/api/tools/' + tool.slug + '/export/csv?crawlId=' + encodeURIComponent(state.crawlId) + '&tableId=' + encodeURIComponent(t.id) + '">📊 Download CSV</a></div>' +
        '<div class="ex-table-wrap"><table class="ex-table"><thead><tr>' + cols.map((c) => '<th title="' + esc(c) + '">' + esc(humanize(c)) + '</th>').join('') + '</tr></thead><tbody id="exb-' + t.id + '"></tbody></table></div>' +
        '<div class="ex-more" id="exm-' + t.id + '"></div></details>';
    }).join('');
    $('tab-data').innerHTML = '<h2 class="ux-section-title">Page data explorer</h2><p class="ux-section-sub">The raw evidence behind every insight, with plain-English column names. Search, expand, or download any table. You don\'t need this to act — the Action Plan already tells you what to do.</p>' + (html || '<div class="diag-empty">No tables for this tool.</div>');
    Object.keys(state.tables).forEach(renderTableBody);
  }

  /* ---------------- TAB 5: Guide ---------------- */
  function renderGuide(r) {
    const cov = r.coveragePanel;
    $('tab-guide').innerHTML =
      '<h2 class="ux-section-title">Plain-English guide</h2><p class="ux-section-sub">What this tool checks, what a perfect store looks like, and what the technical terms mean.</p>' +
      '<div class="guide-grid"><div class="panel"><div class="panel-head"><h3>What this tool checks</h3></div><div class="panel-body"><p style="font-size:14px;line-height:1.65;margin-bottom:10px;"><strong>' + esc(guide.businessQuestion || '') + '</strong></p><p style="font-size:13.5px;color:var(--ink-soft);line-height:1.65;">' + esc(guide.plainSummary || tool.promise) + '</p><p style="font-size:12.5px;color:var(--ink-faint);margin-top:10px;">Best for: ' + esc(guide.whoIsItFor || '') + '</p></div></div>' +
      '<div class="panel"><div class="panel-head"><h3>🟢 What 100/100 looks like</h3></div><div class="panel-body"><p style="font-size:14px;line-height:1.7;">' + esc(guide.whatHealthyLooksLike || '') + '</p></div></div></div>' +
      '<div class="panel"><div class="panel-head"><h3>How much of your store we looked at</h3><span class="verified">honest coverage</span></div><div class="panel-body"><p style="font-size:14px;line-height:1.75;">' +
        'We found <strong>' + cov.discovered + '</strong> public URLs (from your sitemap, menus and links), sent <strong>' + cov.requested + '</strong> polite requests, and read <strong>' + cov.extracted + '</strong> pages in full' +
        (cov.deeplyInspected ? ', including <strong>' + cov.deeplyInspected + '</strong> opened in a real browser' : '') + '. ' +
        (cov.skipped ? '<strong>' + cov.skipped + '</strong> discovered URLs were listed but not opened, to stay within the scan budget. ' : '') +
        (cov.blockedOrUnavailable ? '<strong>' + cov.blockedOrUnavailable + '</strong> were blocked or unavailable (we never bypass access controls). ' : '') +
        'Percentages in this report refer to the pages actually inspected. Increase the page budget under <em>Configure / Re-scan</em> for wider coverage.</p>' +
        (cov.notes && cov.notes.length ? '<ul style="margin:10px 0 0 18px;font-size:12.5px;color:var(--ink-soft);line-height:1.7;">' + cov.notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '') +
        '<div class="standing-banner" style="margin:14px 0 0;"><strong>Honesty statement:</strong> ' + esc(POLICY) + '</div></div></div>' +
      '<div class="panel"><div class="panel-head"><h3>Jargon buster</h3></div><div class="panel-body">' + GLOSS.map((g) =>
        '<div class="gloss-item"><div class="gloss-term">' + esc(g.term) + '</div><div class="gloss-mean">' + esc(g.plainMeaning) + '</div><div class="gloss-why">Why it matters: ' + esc(g.whyItMatters) + '</div></div>').join('') + '</div></div>';
  }

  /* ---------------- render all ---------------- */
  function renderResults(r) {
    state.result = r;
    state.crawlId = r.crawl.crawlId;
    const cov = r.coveragePanel;
    $('results-screen').style.display = 'block';
    $('topbar-domain-title').textContent = cov.domain + ' — ' + (guide.shortTitle || tool.name);
    $('topbar-scan-meta').innerHTML = '<span class="pill pill-Low">' + esc(String(cov.platform).toUpperCase()) + '</span><span class="mono">' + cov.extracted + ' pages read · ' + cov.discovered + ' URLs found</span><a href="/" class="mono" style="color:var(--visible);text-decoration:underline;">← All tools</a>';
    $('rail-crawl-footer').innerHTML = '<strong>' + esc(cov.domain) + '</strong><br/>' + esc(cov.platform) + ' · ' + cov.extracted + ' pages read<br/><span style="font-size:10px;">' + esc(r.crawl.crawlId) + '</span>';
    document.querySelectorAll('.suite-tool-link').forEach((a) => {
      a.setAttribute('href', '/tools/' + a.getAttribute('data-slug') + '?crawlId=' + encodeURIComponent(state.crawlId) + '&autoScan=true');
    });
    ['export-md-btn', 'export-json-btn', 'export-report-btn'].forEach((id) => { $(id).style.display = 'inline-flex'; });
    $('export-json-btn').href = '/api/tools/' + tool.slug + '/export/json?crawlId=' + encodeURIComponent(state.crawlId);
    $('export-report-btn').href = '/api/tools/' + tool.slug + '/export/report?crawlId=' + encodeURIComponent(state.crawlId);
    $('ux-tab-nav').style.display = 'flex';

    const ev = evaluate(r);
    renderInsights(r, ev);
    renderActions(r);
    renderChecklist(r, ev);
    renderExplorer(r);
    renderGuide(r);
    const badge = $('nav-fix-count');
    if (badge) badge.textContent = r.findings.length ? String(r.findings.length) : '';
    window.uxSwitchTab('tab-insights');
  }

  /* ---------------- markdown export (plain English) ---------------- */
  window.exportMarkdownDossier = function () {
    const r = state.result; if (!r) return;
    const ev = evaluate(r); const g = grade(ev.score); const cov = r.coveragePanel;
    const L = [];
    L.push('# ' + (guide.shortTitle || tool.name) + ' — ' + cov.domain);
    L.push('> ' + POLICY, '');
    L.push('**Score:** ' + (ev.score == null ? 'n/a' : ev.score + '/100 (Grade ' + g.g + ' — ' + g.v + ')'));
    L.push('**Coverage:** ' + cov.extracted + ' pages read in full out of ' + cov.discovered + ' URLs found.', '');
    L.push('## What\'s correct');
    ev.passed.forEach((c) => L.push('- ✓ ' + plain(c.ruleId)));
    if (!ev.passed.length) L.push('- (none fully passing)');
    L.push('', '## What needs fixing (in priority order)');
    r.findings.slice().sort((a, b) => b.priorityScore - a.priorityScore).forEach((f, i) => {
      const p = PB[f.ruleId];
      L.push('', '### ' + (i + 1) + '. ' + plain(f.ruleId, f.title) + ' — ' + bandLabel(f.priorityBand));
      L.push('- **Pages affected:** ' + f.affectedCount + ' of ' + f.inspectedCount + ' (' + f.coveragePercentage + '%)');
      if (p) {
        L.push('- **Owner:** ' + p.owner + ' · **Effort:** ' + p.effort);
        L.push('- **Why it matters:** ' + p.whyItHurts);
        L.push('- **Correct looks like:** ' + p.whatCorrectLooksLike);
        L.push('- **Before:** ' + p.beforeExample);
        L.push('- **After:** ' + p.afterExample);
        L.push('- **Steps:**');
        p.actionSteps.forEach((s, j) => L.push('  ' + (j + 1) + '. ' + s));
      } else {
        L.push('- **Recommendation:** ' + f.recommendationText);
      }
      L.push('- **Sample pages:** ' + f.affectedUrls.slice(0, 5).join(', '));
    });
    const blob = new Blob([L.join('\n')], { type: 'text/markdown;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = tool.slug + '-' + cov.domain + '-action-plan.md';
    a.click();
  };

  /* ---------------- run flow ---------------- */
  function startProgress(label) {
    state.timers.forEach(clearTimeout); state.timers = [];
    $('run-progress-track').style.display = 'block';
    const steps = [
      [0, '1/5 Checking ' + (label || 'your store') + '\'s robots.txt rules (we only read public pages)…'],
      [1200, '2/5 Reading your sitemap to find every product, collection and page…'],
      [3200, '3/5 Opening a balanced sample of product, collection, blog and info pages…'],
      [6500, '4/5 Checking titles, headings, Google schema, images and links…'],
      [9500, '5/5 Scoring results and writing your plain-English action plan…'],
    ];
    steps.forEach((s) => state.timers.push(setTimeout(() => { $('run-status-text').textContent = s[1]; }, s[0])));
  }
  async function executeAudit(override) {
    $('run-screen').style.display = 'block';
    const comp = $('competitorDomain');
    const payload = override || {
      domainInput: $('domainInput').value.trim(),
      competitorDomain: comp ? comp.value.trim() || undefined : undefined,
      crawlId: $('existingCrawlSelect').value || undefined,
      forceRecrawl: $('forceRecrawl').value === 'true',
      budget: {
        maxDiscoveryUrls: Number($('maxDiscoveryUrls').value) || 2500,
        maxLightweightPages: Number($('maxLightweightPages').value) || 25,
        maxLevel: $('maxLevel').value,
      },
    };
    if (!payload.domainInput && !payload.crawlId) { $('run-status-text').textContent = 'Please enter your store\'s website address first.'; $('run-progress-track').style.display = 'none'; return; }
    startProgress(payload.domainInput || 'stored scan');
    try {
      const res = await fetch('/api/tools/' + tool.slug + '/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      state.timers.forEach(clearTimeout);
      $('run-progress-track').style.display = 'none';
      if (!res.ok) throw new Error(data.error || 'The scan could not be completed.');
      $('run-status-text').innerHTML = '✓ Scan complete for <strong>' + esc(data.crawl.domain) + '</strong> — ' +
        (data.reusedExistingCrawl ? 'reused your saved scan instantly (no new requests).' : data.coveragePanel.extracted + ' pages read in full.');
      $('input-screen').style.display = 'none';
      renderResults(data);
    } catch (err) {
      state.timers.forEach(clearTimeout);
      $('run-progress-track').style.display = 'none';
      $('run-status-text').textContent = '✕ ' + err.message;
    }
  }
  window.uxQuickPick = function (d) { $('domainInput').value = d; executeAudit(); };

  $('run-tool-form').addEventListener('submit', (e) => { e.preventDefault(); executeAudit(); });
  ['pause', 'resume', 'cancel'].forEach((act) => {
    const btn = $(act + '-btn');
    if (btn) btn.addEventListener('click', async () => {
      if (!state.crawlId) return;
      const res = await fetch('/api/crawls/' + encodeURIComponent(state.crawlId) + '/' + act, { method: 'POST' });
      const d = await res.json();
      $('run-status-text').textContent = 'Scan ' + act + ' requested (status: ' + ((d.crawl && d.crawl.status) || 'updated') + ').';
    });
  });

  (function autoRun() {
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get('url');
    const crawlIdParam = params.get('crawlId');
    if (urlParam) $('domainInput').value = urlParam;
    if (crawlIdParam) $('existingCrawlSelect').value = crawlIdParam;
    if (params.get('autoScan') === 'true' && (urlParam || crawlIdParam)) {
      executeAudit({
        domainInput: urlParam || '', crawlId: crawlIdParam || undefined, forceRecrawl: false,
        budget: { maxDiscoveryUrls: Number($('maxDiscoveryUrls').value) || 2500, maxLightweightPages: Number($('maxLightweightPages').value) || 25, maxLevel: $('maxLevel').value },
      });
    }
  })();
})();


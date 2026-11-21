/* Silo SEO — Unified Working-SEO Specialist Tool Console (pure browser JS) */
(function () {
  'use strict';

  const D = window.__SILO__;
  const tool = D.tool;
  const guide = D.guide || {};
  const LABELS = D.labels || {};
  const POLICY = D.policy;
  const RECENT_KEY = 'silo_recent_scans_v1';

  const state = {
    result: null,
    crawlId: null,
    sev: 'all',
    where: 'all',
    q: '',
    expandedRows: {},
    showAllUrls: {},
    tables: {},
    timers: [],
  };

  const $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isUrl(v) {
    return typeof v === 'string' && /^https?:\/\//i.test(v);
  }

  function shortPath(u) {
    try {
      const x = new URL(u);
      const p = (x.pathname || '/') + (x.search || '');
      return p.length > 52 ? p.slice(0, 49) + '…' : p;
    } catch (e) {
      return String(u || '');
    }
  }

  function urlLink(u) {
    return '<a class="ux-url" href="' + esc(u) + '" target="_blank" rel="noopener" title="' + esc(u) + '">' + esc(shortPath(u)) + ' ↗</a>';
  }

  function humanize(key) {
    if (LABELS[key]) return LABELS[key];
    return String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
  }

  function cleanTitle(t) {
    return String(t || '').replace(/^\s*\d+\.\s*/, '');
  }

  function pct(a, b) {
    return b > 0 ? Math.round((a / b) * 100) : 0;
  }

  function sevBadge(sev) {
    if (sev === 'critical') return '<span class="sev-badge critical">● Critical</span>';
    if (sev === 'warning') return '<span class="sev-badge warning">● Warning</span>';
    return '<span class="sev-badge minor">● Minor</span>';
  }

  function fixedKey(domain, rowId) {
    return 'silo_fixed_' + domain + '_' + rowId;
  }

  function isFixed(domain, rowId) {
    return localStorage.getItem(fixedKey(domain, rowId)) === '1';
  }

  /* ---------------- Local-Only Recent Scans Dropdown ---------------- */
  function populateLocalCrawlSelect() {
    const sel = $('existingCrawlSelect');
    if (!sel) return;
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return;
      sel.innerHTML = '<option value="">— Run a fresh scan —</option>' +
        list.map(function (c) {
          return '<option value="' + esc(c.crawlId) + '">' + esc(c.domain) + ' · ' + esc(c.platform) + ' · ' + c.pagesChecked + ' pages checked</option>';
        }).join('');
    } catch (e) {
      // ignore
    }
  }

  function saveLocalScanFromTool(r) {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const wv = r.workingView || {};
      const cov = r.coveragePanel || {};
      const next = (Array.isArray(list) ? list : []).filter(function (x) {
        return x.crawlId !== r.crawl.crawlId && x.domain !== r.crawl.domain;
      });
      next.unshift({
        crawlId: r.crawl.crawlId,
        domain: r.crawl.domain,
        platform: r.crawl.platform,
        overallScore: wv.overallScore != null ? wv.overallScore : null,
        overallGrade: wv.overallGrade || '—',
        overallBand: wv.overallBand || 'amber',
        pagesChecked: (wv.denominators && wv.denominators.okHtmlPages) || cov.extracted || 0,
        urlsFound: (wv.denominators && wv.denominators.discoveredUrls) || cov.discovered || 0,
        scannedAt: r.generatedAt || new Date().toISOString(),
      });
      localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, 10)));
      populateLocalCrawlSelect();
    } catch (e) {
      // ignore
    }
  }

  window.toggleSetupPanel = function () {
    const s = $('input-screen');
    if (s) s.style.display = s.style.display === 'none' ? 'block' : 'none';
  };

  /* ---------------- Top Visual Charts (Tool-Adaptive) ---------------- */
  const PALETTE = ['#1348E4', '#0D7A3E', '#A9720C', '#A6342A', '#6B4FD8', '#0E7490', '#B45309', '#475569'];
  const PREF_CAT = ['pageType', 'titleStatus', 'metaDescStatus', 'format', 'priceBand', 'availability', 'changeType', 'linkType', 'schemaType', 'category', 'discoverySource', 'paginationType', 'detectedLocaleSubfolder', 'htmlLang'];

  function buildToolChart(r) {
    // Competitor comparison special paired bar chart
    if (tool.slug === 'competitor-comparison') {
      const t = (r.tables || []).find(function (x) { return x.rows && x.rows[0] && 'primaryDomain' in x.rows[0]; });
      if (t) {
        const rows = t.rows.filter(function (x) { return !isNaN(parseFloat(x.primaryDomain)) && !isNaN(parseFloat(x.comparisonDomain)); }).slice(0, 6);
        const body = rows.map(function (row) {
          const a = parseFloat(row.primaryDomain);
          const b = parseFloat(row.comparisonDomain);
          const mx = Math.max(1, a, b);
          return '<div style="margin-bottom:10px;font-size:12px;">' +
            '<div style="font-weight:500;margin-bottom:3px;">' + esc(row.metric) + '</div>' +
            '<div class="vbar-row" style="margin-bottom:3px;"><div class="vbar-lbl">Your store</div><div class="vbar-track"><div class="vbar-fill" style="width:' + Math.max(3, (a / mx) * 100) + '%;background:var(--visible)"></div></div><div class="vbar-val">' + esc(row.primaryDomain) + '</div></div>' +
            '<div class="vbar-row" style="margin-bottom:0;"><div class="vbar-lbl">Competitor</div><div class="vbar-track"><div class="vbar-fill" style="width:' + Math.max(3, (b / mx) * 100) + '%;background:#8A909C"></div></div><div class="vbar-val">' + esc(row.comparisonDomain) + '</div></div>' +
          '</div>';
        }).join('');
        return '<div class="viz-card"><div class="viz-title">Head-to-head comparison</div><div class="viz-sub">Public store metrics</div>' + body + '</div>';
      }
    }

    for (let i = 0; i < (r.tables || []).length; i++) {
      const t = r.tables[i];
      if (!t.rows || t.rows.length < 2) continue;
      const cols = Object.keys(t.rows[0]);

      if (cols.includes('completenessScore')) {
        const bands = [
          ['90–100 Good', 90, 101, 'var(--good)'],
          ['70–89 Fair', 70, 90, 'var(--warn)'],
          ['Below 70 Needs work', 0, 70, 'var(--block)'],
        ];
        const mx = Math.max(1, t.rows.length);
        const bars = bands.map(function (b) {
          const cnt = t.rows.filter(function (row) { return row.completenessScore >= b[1] && row.completenessScore < b[2]; }).length;
          return '<div class="vbar-row"><div class="vbar-lbl">' + b[0] + '</div><div class="vbar-track"><div class="vbar-fill" style="width:' + Math.max(2, (cnt / mx) * 100) + '%;background:' + b[3] + '"></div></div><div class="vbar-val">' + cnt + '</div></div>';
        }).join('');
        return '<div class="viz-card"><div class="viz-title">Quality score distribution</div><div class="viz-sub">' + t.rows.length + ' items scored (0–100)</div>' + bars + '</div>';
      }

      const cat = PREF_CAT.find(function (c) { return cols.includes(c); });
      if (cat) {
        const counts = {};
        t.rows.forEach(function (row) {
          const k = String(row[cat] == null ? '(none)' : row[cat]);
          counts[k] = (counts[k] || 0) + 1;
        });
        const keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 6);
        const mx = Math.max(1, counts[keys[0]] || 1);
        const bars = keys.map(function (k, idx) {
          return '<div class="vbar-row"><div class="vbar-lbl">' + esc(k) + '</div><div class="vbar-track"><div class="vbar-fill" style="width:' + Math.max(3, (counts[k] / mx) * 100) + '%;background:' + PALETTE[idx % PALETTE.length] + '"></div></div><div class="vbar-val">' + counts[k] + '</div></div>';
        }).join('');
        return '<div class="viz-card"><div class="viz-title">' + esc(humanize(cat)) + ' breakdown</div><div class="viz-sub">' + t.rows.length + ' rows in ' + esc(cleanTitle(t.title)) + '</div>' + bars + '</div>';
      }
    }

    return '<div class="viz-card"><div class="viz-title">' + esc(guide.shortTitle || tool.name) + '</div><div class="viz-sub">' + esc(guide.businessQuestion || tool.promise) + '</div><p style="font-size:13px;color:var(--ink-soft);line-height:1.6;">' + esc(guide.whatHealthyLooksLike || '') + '</p></div>';
  }

  /* ---------------- Render Unified Working-SEO Tool View ---------------- */
  function renderHeaderAndVisuals(r) {
    const cov = r.coveragePanel;
    const wv = r.workingView || { issueRows: [], passedChecks: [], notMeasuredChecks: [] };
    const rows = wv.issueRows || [];
    const crit = rows.filter(function (x) { return x.severity === 'critical'; }).length;
    const warn = rows.filter(function (x) { return x.severity === 'warning'; }).length;
    const minor = rows.filter(function (x) { return x.severity === 'minor'; }).length;
    const checkedN = (wv.denominators && wv.denominators.okHtmlPages) || cov.extracted;

    $('tool-header-strip').innerHTML =
      '<div class="hdr-left">' +
        '<strong class="hdr-domain">' + esc(cov.domain) + ' · ' + esc(guide.shortTitle || tool.name) + '</strong>' +
        '<span class="hdr-score ' + (crit > 0 ? 'red' : warn > 0 ? 'amber' : 'green') + '">' + rows.length + ' issue' + (rows.length === 1 ? '' : 's') + ' · ' + (wv.passedChecks || []).length + ' passed</span>' +
        '<span class="hdr-meta">' + checkedN + ' pages checked of ' + cov.discovered.toLocaleString() + ' found</span>' +
      '</div>' +
      '<div class="hdr-actions">' +
        '<a class="btn" href="/?crawlId=' + encodeURIComponent(state.crawlId) + '">← Store Summary</a>' +
        '<button type="button" class="btn" onclick="exportToolIssuesCsv()">Export CSV</button>' +
        '<a class="btn btn-primary" href="/api/tools/' + tool.slug + '/export/report?crawlId=' + encodeURIComponent(state.crawlId) + '" target="_blank">Client PDF</a>' +
      '</div>';

    const sevCard =
      '<div class="viz-card">' +
        '<div class="viz-title">' + crit + ' critical, ' + warn + ' warnings, ' + minor + ' minor</div>' +
        '<div class="viz-sub">Issues found by this tool</div>' +
        '<div class="sev-tiles">' +
          '<button type="button" class="sev-tile critical ' + (state.sev === 'critical' ? 'on' : '') + '" onclick="toolToggleSev(\'critical\')"><div class="n">' + crit + '</div><div class="l">Critical</div></button>' +
          '<button type="button" class="sev-tile warning ' + (state.sev === 'warning' ? 'on' : '') + '" onclick="toolToggleSev(\'warning\')"><div class="n">' + warn + '</div><div class="l">Warning</div></button>' +
          '<button type="button" class="sev-tile minor ' + (state.sev === 'minor' ? 'on' : '') + '" onclick="toolToggleSev(\'minor\')"><div class="n">' + minor + '</div><div class="l">Minor</div></button>' +
        '</div>' +
        '<div class="chart-hint">Click a severity tile to filter the issues table below.</div>' +
      '</div>';

    const metricStrip =
      '<div class="metrics-row" style="margin-bottom:18px;">' +
        (r.headlineMetrics || []).map(function (m) {
          const col = m.status === 'good' ? 'var(--good)' : m.status === 'critical' ? 'var(--block)' : m.status === 'warning' ? 'var(--warn)' : 'var(--ink)';
          return '<div class="metric-box" style="cursor:default;"><div class="metric-label">' + esc(m.label) + '</div><div class="metric-val" style="color:' + col + ';font-size:22px;">' + esc(m.value) + '</div><div class="metric-sub">' + esc(m.subtitle || '') + '</div></div>';
        }).join('') +
      '</div>';

    $('tool-visual-summary').innerHTML =
      '<div class="viz-grid">' + buildToolChart(r) + sevCard + '</div>' + metricStrip;
  }

  function getFilteredToolIssues() {
    const wv = (state.result && state.result.workingView) || { issueRows: [] };
    let rows = (wv.issueRows || []).slice();
    if (state.sev !== 'all') rows = rows.filter(function (x) { return x.severity === state.sev; });
    if (state.where !== 'all') rows = rows.filter(function (x) { return x.pageType === state.where; });
    if (state.q) {
      const q = state.q.toLowerCase();
      rows = rows.filter(function (x) {
        return (x.issue + ' ' + x.whereLabel + ' ' + x.action + ' ' + (x.exampleUrl || '')).toLowerCase().indexOf(q) !== -1;
      });
    }
    return rows;
  }

  function renderToolIssuesTable() {
    const r = state.result;
    if (!r) return;
    const wv = r.workingView || { issueRows: [] };
    const allRows = wv.issueRows || [];
    const filtered = getFilteredToolIssues();

    if (allRows.length === 0) {
      $('tool-issues-table').innerHTML =
        '<div class="panel" style="margin-bottom:20px;"><div class="panel-body"><span class="yes">✓ No issues flagged by this tool</span> <span style="font-size:13px;color:var(--ink-soft);margin-left:8px;">Inspect the full extracted data tables below.</span></div></div>';
      return;
    }

    const wheres = [];
    allRows.forEach(function (x) {
      if (!wheres.some(function (w) { return w.id === x.pageType; })) wheres.push({ id: x.pageType, lbl: x.whereLabel });
    });

    const bar =
      '<div class="tbl-bar">' +
        '<h2 class="tbl-h2">' + filtered.length + ' issue' + (filtered.length === 1 ? '' : 's') + ' found</h2>' +
        '<div class="tbl-filters">' +
          '<select onchange="toolSetFilter(\'sev\', this.value)">' +
            '<option value="all"' + (state.sev === 'all' ? ' selected' : '') + '>All severities</option>' +
            '<option value="critical"' + (state.sev === 'critical' ? ' selected' : '') + '>Critical</option>' +
            '<option value="warning"' + (state.sev === 'warning' ? ' selected' : '') + '>Warning</option>' +
            '<option value="minor"' + (state.sev === 'minor' ? ' selected' : '') + '>Minor</option>' +
          '</select>' +
          '<select onchange="toolSetFilter(\'where\', this.value)">' +
            '<option value="all">All page types</option>' +
            wheres.map(function (w) { return '<option value="' + w.id + '"' + (state.where === w.id ? ' selected' : '') + '>' + esc(w.lbl) + '</option>'; }).join('') +
          '</select>' +
          '<input type="text" placeholder="Search issues or URLs…" value="' + esc(state.q) + '" oninput="toolSetFilter(\'q\', this.value)" style="width:190px;" />' +
        '</div>' +
      '</div>';

    const body = filtered.map(function (row) {
      const open = Boolean(state.expandedRows[row.rowId]);
      const done = isFixed(r.crawl.domain, row.rowId);
      const showAll = Boolean(state.showAllUrls[row.rowId]);
      const shown = showAll ? row.affectedItems : row.affectedItems.slice(0, 10);

      const mainTr =
        '<tr class="issue-row ' + (open ? 'open' : '') + (done ? ' fixed-row' : '') + '" onclick="toolToggleRow(\'' + row.rowId + '\')">' +
          '<td>' + sevBadge(row.severity) + '</td>' +
          '<td><strong>' + esc(row.issue) + '</strong>' + (done ? ' <span class="yes">Fixed</span>' : '') + '</td>' +
          '<td style="white-space:nowrap;">' + esc(row.whereLabel) + '</td>' +
          '<td style="white-space:nowrap;"><div class="pg-cell"><span class="mono">' + row.affectedCount + ' / ' + row.checkedCount + '</span><span class="mini-tr"><span class="mini-fl ' + row.severity + '" style="width:' + Math.max(4, row.affectedPct) + '%"></span></span></div></td>' +
          '<td>' + (row.exampleUrl ? '<a class="ux-url" href="' + esc(row.exampleUrl) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + esc(shortPath(row.exampleUrl)) + ' ↗</a>' : '—') + '</td>' +
          '<td>' + esc(row.action) + '</td>' +
          '<td style="white-space:nowrap;font-size:12px;color:var(--ink-soft);">' + esc(row.owner) + ' · ' + esc(row.effortLabel) + '</td>' +
          '<td style="text-align:center;color:var(--ink-faint);">' + (open ? '▾' : '▸') + '</td>' +
        '</tr>';

      if (!open) return mainTr;

      const detTr =
        '<tr class="detail-row"><td colspan="8"><div class="detail-box"><div class="detail-grid">' +
          '<div>' +
            '<div class="detail-head">Affected URLs (' + row.affectedCount + ')</div>' +
            '<div class="detail-urls">' + shown.map(function (it) {
              return '<div class="du-row">' + urlLink(it.url) + '<span class="du-val">' + esc(it.currentValue) + '</span></div>';
            }).join('') + '</div>' +
            (row.affectedItems.length > 10 ? '<button type="button" class="btn" style="margin-top:8px;font-size:11.5px;padding:3px 10px;" onclick="toolToggleShowAll(\'' + row.rowId + '\')">' + (showAll ? 'Show first 10' : 'Show all ' + row.affectedItems.length) + '</button>' : '') +
            (row.passingUrls.length > 0 ? '<details class="pass-drop"><summary>' + row.passingUrls.length + ' ' + esc(row.whereLabel.toLowerCase()) + ' pass this check ▸</summary><div class="detail-urls" style="margin-top:6px;">' +
              row.passingUrls.slice(0, 15).map(function (u) { return '<div class="du-row">' + urlLink(u) + '<span class="yes">Pass</span></div>'; }).join('') +
            '</div></details>' : '') +
          '</div>' +
          '<div>' +
            '<div class="detail-head">How to fix (' + esc(r.crawl.platform.toUpperCase()) + ')</div>' +
            '<ol class="fix-ol">' + row.platformSteps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
            (row.beforeAfter.length ? '<div class="ba-mini">' + row.beforeAfter.slice(0, 1).map(function (ba) {
              return '<div class="ba-c"><strong>Now:</strong> ' + esc(ba.currentValue) + '</div><div class="ba-s"><strong>Target:</strong> ' + esc(ba.suggestedValue) + '</div>';
            }).join('') + '</div>' : '') +
            '<details class="why-drop"><summary>▸ What we tested and why it matters</summary><div class="why-body"><p>' + esc(row.whyTested) + '</p><p class="mono" style="font-size:11.5px;color:var(--ink-faint);margin-top:4px;">Threshold: ' + esc(row.threshold) + ' · Check ID: ' + esc(row.ruleId) + '</p></div></details>' +
            '<div style="display:flex;gap:8px;margin-top:12px;">' +
              '<button type="button" class="btn" id="tk-' + row.rowId + '" onclick="toolCopyTicket(\'' + row.rowId + '\')">Copy as ticket</button>' +
              '<button type="button" class="btn" onclick="toolMarkFixed(\'' + row.rowId + '\')">' + (done ? '✓ Marked fixed' : 'Mark as fixed') + '</button>' +
            '</div>' +
          '</div>' +
        '</div></div></td></tr>';

      return mainTr + detTr;
    }).join('');

    $('tool-issues-table').innerHTML =
      '<div class="panel" style="margin-bottom:20px;"><div class="panel-body" style="padding:16px 18px 0;">' + bar + '</div>' +
      '<div class="ex-table-wrap"><table class="ex-table"><thead><tr>' +
        '<th>Severity</th><th>Issue</th><th>Where</th><th>Pages</th><th>Example</th><th>Action</th><th>Owner · time</th><th></th>' +
      '</tr></thead><tbody>' + (body || '<tr><td colspan="8" style="padding:18px;text-align:center;color:var(--ink-faint);">No issues match these filters.</td></tr>') + '</tbody></table></div></div>';
  }

  /* ---------------- Specialist Data Tables (Human-Readable, Paginated) ---------------- */
  const BAD_WHEN_TRUE = { isNoindex: 1, fingerprintChanged: 1 };

  function fmtCell(key, v) {
    if (v === null || v === undefined || v === '') return '<span style="color:var(--ink-faint)">—</span>';
    if (typeof v === 'boolean' || v === 'true' || v === 'false') {
      const b = v === true || v === 'true';
      if (BAD_WHEN_TRUE[key]) return b ? '<span class="bad">✕ Yes</span>' : '<span class="yes">✓ No</span>';
      return b ? '<span class="yes">✓ Yes</span>' : '<span class="no">✕ No</span>';
    }
    if (typeof v === 'number') return '<span class="mono">' + v.toLocaleString() + '</span>';
    if (Array.isArray(v)) v = v.join(', ');
    if (typeof v === 'object') v = JSON.stringify(v);
    const s = String(v);
    if (isUrl(s)) return urlLink(s);
    if (s.indexOf(' | ') !== -1 && isUrl(s.split(' | ')[0])) {
      const parts = s.split(' | ');
      return parts.slice(0, 2).map(urlLink).join('<br/>') + (parts.length > 2 ? '<br/><span style="font-size:11px;color:var(--ink-faint)">+' + (parts.length - 2) + ' more</span>' : '');
    }
    if (/^(optimal|in_stock|ok)$/i.test(s)) return '<span class="yes">' + esc(s.replace('_', ' ')) + '</span>';
    if (/^\(?missing\)?|too short|too long|not declared|not detected|out_of_stock/i.test(s)) return '<span class="no">' + esc(s.replace(/_/g, ' ')) + '</span>';
    return s.length > 130 ? '<span title="' + esc(s) + '">' + esc(s.slice(0, 127)) + '…</span>' : esc(s);
  }

  function renderTableBody(id) {
    const st = state.tables[id];
    const q = st.q.toLowerCase();
    const rows = q ? st.rows.filter(function (row) { return JSON.stringify(row).toLowerCase().indexOf(q) !== -1; }) : st.rows;
    const shown = st.all ? rows : rows.slice(0, 25);
    $('exb-' + id).innerHTML = shown.map(function (row) {
      return '<tr>' + st.cols.map(function (c) { return '<td>' + fmtCell(c, row[c]) + '</td>'; }).join('') + '</tr>';
    }).join('') || '<tr><td colspan="' + st.cols.length + '" style="color:var(--ink-faint);padding:14px;">No rows match.</td></tr>';
    $('exm-' + id).innerHTML = 'Showing ' + shown.length + ' of ' + rows.length + ' rows' +
      (rows.length > 25 ? ' <button type="button" class="btn" style="padding:3px 10px;font-size:11.5px;" onclick="uxTblAll(\'' + id + '\')">' + (st.all ? 'Show first 25' : 'Show all ' + rows.length) + '</button>' : '');
  }

  window.uxTblFilter = function (id, q) { state.tables[id].q = q; renderTableBody(id); };
  window.uxTblAll = function (id) { state.tables[id].all = !state.tables[id].all; renderTableBody(id); };

  function renderToolDataTables(r) {
    state.tables = {};
    const html = (r.tables || []).map(function (t, idx) {
      const n = t.rows ? t.rows.length : 0;
      const head = '<summary><div><h3>' + esc(cleanTitle(t.title)) + '</h3><div class="ex-desc">' + esc(t.description || '') + '</div></div><span class="ex-count">' + n + ' row' + (n === 1 ? '' : 's') + '</span></summary>';
      if (!n) return '<details class="ex-panel">' + head + '<div style="padding:0 18px 16px;font-size:13px;color:var(--ink-faint);">No rows detected within inspected coverage.</div></details>';
      const cols = Object.keys(t.rows[0]);
      state.tables[t.id] = { rows: t.rows, cols: cols, q: '', all: false };
      return '<details class="ex-panel"' + (idx === 0 ? ' open' : '') + '>' + head +
        '<div class="ex-tools"><input type="text" placeholder="Filter rows…" oninput="uxTblFilter(\'' + t.id + '\', this.value)"/>' +
        '<a class="btn" href="/api/tools/' + tool.slug + '/export/csv?crawlId=' + encodeURIComponent(state.crawlId) + '&tableId=' + encodeURIComponent(t.id) + '">Download CSV</a></div>' +
        '<div class="ex-table-wrap"><table class="ex-table"><thead><tr>' + cols.map(function (c) { return '<th title="' + esc(c) + '">' + esc(humanize(c)) + '</th>'; }).join('') + '</tr></thead><tbody id="exb-' + t.id + '"></tbody></table></div>' +
        '<div class="ex-more" id="exm-' + t.id + '"></div></details>';
    }).join('');

    const wv = r.workingView || { passedChecks: [], notMeasuredChecks: [] };
    const passedDrop = (wv.passedChecks || []).length > 0
      ? '<details class="ex-panel"><summary><div><h3>Passed checks (' + wv.passedChecks.length + ')</h3><div class="ex-desc">Checks with zero failures in this tool</div></div><span class="yes">' + wv.passedChecks.length + ' passed</span></summary>' +
        '<div style="padding:0 18px 16px;">' + wv.passedChecks.map(function (c) {
          return '<div class="bf-row"><span><span class="yes">✓</span> ' + esc(c.title) + '</span><span class="mono" style="font-size:12px;color:var(--ink-faint);">' + c.applicableCount + ' ' + esc(c.denominatorNoun) + '</span></div>';
        }).join('') + '</div></details>'
      : '';

    $('tool-data-tables').innerHTML = html + passedDrop;
    Object.keys(state.tables).forEach(renderTableBody);
  }

  function renderResults(r) {
    state.result = r;
    state.crawlId = r.crawl.crawlId;
    saveLocalScanFromTool(r);

    $('results-screen').style.display = 'block';
    const cov = r.coveragePanel;
    $('topbar-domain-title').textContent = cov.domain + ' — ' + (guide.shortTitle || tool.name);
    $('topbar-scan-meta').innerHTML =
      '<span class="pill pill-Low">' + esc(String(cov.platform).toUpperCase()) + '</span>' +
      '<span class="mono">' + cov.extracted + ' pages checked · ' + cov.discovered.toLocaleString() + ' URLs found</span>' +
      '<a href="/?crawlId=' + encodeURIComponent(state.crawlId) + '" class="mono" style="color:var(--visible);text-decoration:underline;">← Store Summary</a>';

    $('rail-crawl-footer').innerHTML =
      '<strong>' + esc(cov.domain) + '</strong><br/>' + esc(cov.platform) + ' · ' + cov.extracted + ' pages checked';

    const backLink = $('rail-back-summary');
    if (backLink) backLink.href = '/?crawlId=' + encodeURIComponent(state.crawlId);

    document.querySelectorAll('.suite-tool-link').forEach(function (a) {
      a.setAttribute('href', '/tools/' + a.getAttribute('data-slug') + '?crawlId=' + encodeURIComponent(state.crawlId) + '&autoScan=true');
    });

    ['export-json-btn', 'export-report-btn'].forEach(function (id) {
      const el = $(id);
      if (el) el.style.display = 'inline-flex';
    });
    if ($('export-json-btn')) $('export-json-btn').href = '/api/tools/' + tool.slug + '/export/json?crawlId=' + encodeURIComponent(state.crawlId);
    if ($('export-report-btn')) $('export-report-btn').href = '/api/tools/' + tool.slug + '/export/report?crawlId=' + encodeURIComponent(state.crawlId);

    renderHeaderAndVisuals(r);
    renderToolIssuesTable();
    renderToolDataTables(r);
  }

  /* ---------------- Interactive Handlers ---------------- */
  window.toolToggleSev = function (s) { state.sev = state.sev === s ? 'all' : s; renderHeaderAndVisuals(state.result); renderToolIssuesTable(); };
  window.toolSetFilter = function (k, v) { state[k] = v; renderToolIssuesTable(); };
  window.toolToggleRow = function (id) { state.expandedRows[id] = !state.expandedRows[id]; renderToolIssuesTable(); };
  window.toolToggleShowAll = function (id) { state.showAllUrls[id] = !state.showAllUrls[id]; renderToolIssuesTable(); };
  window.toolMarkFixed = function (id) {
    if (!state.result) return;
    const k = fixedKey(state.result.crawl.domain, id);
    localStorage.setItem(k, isFixed(state.result.crawl.domain, id) ? '0' : '1');
    renderToolIssuesTable();
  };
  window.toolCopyTicket = function (id) {
    const wv = (state.result && state.result.workingView) || { issueRows: [] };
    const row = (wv.issueRows || []).find(function (x) { return x.rowId === id; });
    if (!row) return;
    navigator.clipboard.writeText(row.ticketMarkdown).then(function () {
      const b = $('tk-' + id);
      if (b) { b.textContent = '✓ Copied'; setTimeout(function () { b.textContent = 'Copy as ticket'; }, 1400); }
    });
  };
  window.exportToolIssuesCsv = function () {
    const rows = getFilteredToolIssues();
    const header = ['Severity', 'Issue', 'Where', 'Affected', 'Checked', 'Example URL', 'Action', 'Owner', 'Effort', 'Rule ID'];
    const escCsv = function (s) {
      const str = String(s == null ? '' : s);
      return /[,"\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
    };
    const lines = [header.join(',')].concat(rows.map(function (r) {
      return [r.severity, r.issue, r.whereLabel, r.affectedCount, r.checkedCount, r.exampleUrl || '', r.action, r.owner, r.effortLabel, r.ruleId].map(escCsv).join(',');
    }));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = tool.slug + '-' + (state.result ? state.result.crawl.domain : 'store') + '-issues.csv';
    a.click();
  };

  /* ---------------- Audit Execution ---------------- */
  async function executeAudit(override) {
    $('run-screen').style.display = 'block';
    const comp = $('competitorDomain');
    const maxLvl = $('maxLevel') ? $('maxLevel').value : 'B';
    const defaultPages = maxLvl === 'C' ? 150 : maxLvl === 'A' ? 15 : 50;
    const payload = override || {
      domainInput: $('domainInput').value.trim(),
      competitorDomain: comp ? comp.value.trim() || undefined : undefined,
      crawlId: $('existingCrawlSelect').value || undefined,
      forceRecrawl: $('forceRecrawl').value === 'true',
      budget: {
        maxDiscoveryUrls: Number($('maxDiscoveryUrls').value) || (maxLvl === 'C' ? 10000 : 5000),
        maxLightweightPages: Number($('maxLightweightPages').value) || defaultPages,
        maxLevel: maxLvl,
      },
    };
    if (!payload.domainInput && !payload.crawlId) {
      $('run-status-text').textContent = 'Enter a store domain first.';
      $('run-progress-track').style.display = 'none';
      return;
    }
    $('run-progress-track').style.display = 'block';
    $('run-status-text').textContent = 'Scanning ' + (payload.domainInput || 'saved crawl') + '…';
    try {
      const res = await fetch('/api/tools/' + tool.slug + '/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      $('run-progress-track').style.display = 'none';
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      $('run-screen').style.display = 'none';
      $('input-screen').style.display = 'none';
      renderResults(data);
    } catch (err) {
      $('run-progress-track').style.display = 'none';
      $('run-status-text').textContent = '✕ ' + err.message;
    }
  }

  window.uxQuickPick = function (d) { $('domainInput').value = d; executeAudit(); };
  if ($('run-tool-form')) {
    $('run-tool-form').addEventListener('submit', function (e) { e.preventDefault(); executeAudit(); });
  }

  (function init() {
    populateLocalCrawlSelect();
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get('url');
    const crawlIdParam = params.get('crawlId');
    if (urlParam && $('domainInput')) $('domainInput').value = urlParam;
    if (params.get('autoScan') === 'true' && (urlParam || crawlIdParam)) {
      executeAudit({
        domainInput: urlParam || '',
        crawlId: crawlIdParam || undefined,
        forceRecrawl: false,
      });
    }
  })();
})();

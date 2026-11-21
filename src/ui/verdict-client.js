/* Silo SEO — Working SEO Table & Visual Summary Client (pure browser JS) */
(function () {
  'use strict';

  const ALL_TOOLS = window.__SILO_VERDICT_TOOLS__ || [];
  let activeReport = null;

  // Filter & UI state
  const ui = {
    sev: 'all',
    area: 'all',
    where: 'all',
    owner: 'all',
    q: '',
    sort: 'severity',
    pageTab: 'all',
    pageQ: '',
    showAllIssues: false,
    expandedRows: {},
    showAllUrls: {},
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shortPath(u) {
    try {
      const x = new URL(u);
      const p = (x.pathname || '/') + (x.search || '');
      return p.length > 48 ? p.slice(0, 45) + '…' : p;
    } catch (e) {
      return String(u || '');
    }
  }

  function fixedKey(domain, rowId) {
    return 'silo_fixed_' + domain + '_' + rowId;
  }

  function isFixed(domain, rowId) {
    return localStorage.getItem(fixedKey(domain, rowId)) === '1';
  }

  function bandColor(score) {
    if (score == null) return 'var(--ink-faint)';
    if (score >= 90) return 'var(--good)';
    if (score >= 50) return 'var(--warn)';
    return 'var(--block)';
  }

  function sevDot(sev) {
    if (sev === 'critical') return '<span class="sev-badge critical">● Critical</span>';
    if (sev === 'warning') return '<span class="sev-badge warning">● Warning</span>';
    return '<span class="sev-badge minor">● Minor</span>';
  }

  function pageStatusBadge(st) {
    if (st === 'broken') return '<span class="sev-badge critical">● Broken</span>';
    if (st === 'needs_work') return '<span class="sev-badge warning">● Needs work</span>';
    return '<span class="sev-badge good">● Good</span>';
  }

  function heatColor(pct) {
    if (pct === null || pct === 0) return 'background:#E8F8EF;color:#0D7A3E;';
    if (pct >= 60) return 'background:#FBEAE8;color:#A6342A;font-weight:600;';
    if (pct >= 25) return 'background:#FBF1DD;color:#A9720C;font-weight:600;';
    return 'background:#F3F4F7;color:#565E6D;';
  }

  /* ---------------- Top Header + 4 Visual Charts ---------------- */
  function renderHeaderAndVisuals(v) {
    const d = v.denominators;
    const vs = v.visualSummary;
    const scannedAt = new Date(v.generatedAt).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    // 1. One-line Header Strip
    document.getElementById('sec-header-strip').innerHTML =
      '<div class="hdr-left">' +
        '<strong class="hdr-domain">' + esc(v.crawl.domain) + '</strong>' +
        '<span class="hdr-score ' + v.overallBand + '">Store health ' + (v.overallScore != null ? v.overallScore + ' (' + v.overallGrade + ')' : '—') + '</span>' +
        '<span class="hdr-meta">' + d.okHtmlPages + ' pages checked of ' + d.discoveredUrls.toLocaleString() + ' found · ' + esc(scannedAt) + '</span>' +
      '</div>' +
      '<div class="hdr-actions">' +
        '<button type="button" class="btn" onclick="rescanCurrent(\'C\')">Run deep scan</button>' +
        '<button type="button" class="btn" onclick="exportIssuesCsv()">Export CSV</button>' +
        '<a class="btn btn-primary" href="/api/tools/opportunity-dashboard/export/report?crawlId=' + encodeURIComponent(v.crawl.crawlId) + '" target="_blank">Client PDF</a>' +
      '</div>';

    // 2. Four Visual Charts
    const areaBars = v.areas.map(function (a) {
      const s = a.score;
      const pct = s != null ? s : 0;
      return (
        '<div class="vbar-row" onclick="filterByArea(\'' + a.areaId + '\')" title="Click to filter issues by ' + esc(a.label) + '">' +
          '<div class="vbar-lbl">' + esc(a.shortLabel) + '</div>' +
          '<div class="vbar-track"><div class="vbar-fill" style="width:' + Math.max(2, pct) + '%;background:' + bandColor(s) + '"></div></div>' +
          '<div class="vbar-val">' + (s != null ? s : '—') + '</div>' +
        '</div>'
      );
    }).join('');

    const pageBars = (vs.pageHealthByType || []).map(function (p) {
      const t = Math.max(1, p.total);
      const gW = (p.good / t) * 100;
      const wW = (p.needsWork / t) * 100;
      const bW = (p.broken / t) * 100;
      return (
        '<div class="vbar-row" onclick="filterByWhere(\'' + p.pageType + '\')" title="Good: ' + p.good + ', Needs work: ' + p.needsWork + ', Broken: ' + p.broken + '">' +
          '<div class="vbar-lbl">' + esc(p.label.replace(/ pages$/, '')) + '</div>' +
          '<div class="stack-track">' +
            (p.good ? '<div style="width:' + gW + '%;background:var(--good)"></div>' : '') +
            (p.needsWork ? '<div style="width:' + wW + '%;background:var(--warn)"></div>' : '') +
            (p.broken ? '<div style="width:' + bW + '%;background:var(--block)"></div>' : '') +
          '</div>' +
          '<div class="vbar-val">' + p.good + '/' + p.total + '</div>' +
        '</div>'
      );
    }).join('');

    const pageLegend =
      '<div class="legend-row">' +
        '<span><i style="background:var(--good)"></i> Good</span>' +
        '<span><i style="background:var(--warn)"></i> Needs work</span>' +
        '<span><i style="background:var(--block)"></i> Broken</span>' +
      '</div>';

    const sc = vs.severityCounts;
    const sevTiles =
      '<div class="sev-tiles">' +
        '<button type="button" class="sev-tile critical ' + (ui.sev === 'critical' ? 'on' : '') + '" onclick="toggleSevFilter(\'critical\')"><div class="n">' + sc.critical + '</div><div class="l">Critical</div></button>' +
        '<button type="button" class="sev-tile warning ' + (ui.sev === 'warning' ? 'on' : '') + '" onclick="toggleSevFilter(\'warning\')"><div class="n">' + sc.warning + '</div><div class="l">Warning</div></button>' +
        '<button type="button" class="sev-tile minor ' + (ui.sev === 'minor' ? 'on' : '') + '" onclick="toggleSevFilter(\'minor\')"><div class="n">' + sc.minor + '</div><div class="l">Minor</div></button>' +
      '</div>' +
      '<div class="chart-hint">Click a severity tile to filter the issues table below.</div>';

    function formatPassedLabel(t) {
      const s = String(t || '').trim();
      if (/^(AI |Clean |Valid |Proper |Good |All )/i.test(s) || /allowed/i.test(s)) return s;
      if (/^Missing /i.test(s)) return s.replace(/^Missing /i, 'Has ');
      if (/^Pages missing /i.test(s)) return s.replace(/^Pages missing /i, 'All pages have ');
      if (/^Product pages missing /i.test(s)) return s.replace(/^Product pages missing /i, 'All products have ');
      return 'No ' + s.charAt(0).toLowerCase() + s.slice(1);
    }

    const passedChecks = v.areas.flatMap(function (a) {
      return a.ruleResults.filter(function (r) { return r.kind === 'issue' && r.status === 'pass'; });
    });
    const topPassed = passedChecks.slice(0, 6);
    const workingPills =
      '<div class="working-pills">' +
        topPassed.map(function (r) {
          return '<span class="work-pill">✓ ' + esc(formatPassedLabel(r.title)) + '</span>';
        }).join('') +
        (passedChecks.length > topPassed.length
          ? '<span class="work-pill" style="background:var(--bg);color:var(--ink-soft);">+' + (passedChecks.length - topPassed.length) + ' more passed</span>'
          : '') +
      '</div>';

    const keyFacts = (v.storeSnapshot || []).slice(0, 3).map(function (s) {
      return '<span><strong>' + esc(s.label) + ':</strong> ' + esc(s.value) + '</span>';
    }).join('');
    const factsStrip = keyFacts ? '<div class="fact-inline">' + keyFacts + '</div>' : '';

    document.getElementById('sec-visual-summary').innerHTML =
      '<div class="viz-grid">' +
        '<div class="viz-card"><div class="viz-title">' + esc(vs.areaChartTitle) + '</div><div class="viz-sub">Score by area (0–100) · click any bar to filter</div>' + areaBars + '</div>' +
        '<div class="viz-card"><div class="viz-title">' + esc(vs.pageHealthChartTitle) + '</div><div class="viz-sub">Page health by template (good / total)</div>' + pageBars + pageLegend + '</div>' +
        '<div class="viz-card"><div class="viz-title">' + sc.critical + ' critical, ' + sc.warning + ' warnings, ' + sc.minor + ' minor</div><div class="viz-sub">Issues by severity</div>' + sevTiles + '</div>' +
        '<div class="viz-card"><div class="viz-title">✓ ' + passedChecks.length + ' checks passed</div><div class="viz-sub">What\'s working well across your store</div>' + workingPills + factsStrip + '</div>' +
      '</div>' +
      '<div class="cov-line">' + esc(vs.coverageLine) + '</div>';
  }

  /* ---------------- Core Issues Table ---------------- */
  function getFilteredIssues() {
    if (!activeReport) return [];
    let rows = (activeReport.issueRows || []).slice();
    if (ui.sev !== 'all') rows = rows.filter(function (r) { return r.severity === ui.sev; });
    if (ui.area !== 'all') rows = rows.filter(function (r) { return r.areaId === ui.area; });
    if (ui.where !== 'all') rows = rows.filter(function (r) { return r.pageType === ui.where; });
    if (ui.owner !== 'all') rows = rows.filter(function (r) { return r.owner === ui.owner; });
    if (ui.q) {
      const q = ui.q.toLowerCase();
      rows = rows.filter(function (r) {
        return (r.issue + ' ' + r.whereLabel + ' ' + r.action + ' ' + r.ruleId + ' ' + (r.exampleUrl || '')).toLowerCase().indexOf(q) !== -1;
      });
    }
    const sevOrder = { critical: 3, warning: 2, minor: 1 };
    if (ui.sort === 'pages') {
      rows.sort(function (a, b) { return b.affectedCount - a.affectedCount; });
    } else if (ui.sort === 'area') {
      rows.sort(function (a, b) { return a.areaLabel.localeCompare(b.areaLabel) || sevOrder[b.severity] - sevOrder[a.severity]; });
    } else {
      rows.sort(function (a, b) { return sevOrder[b.severity] - sevOrder[a.severity] || b.affectedCount - a.affectedCount; });
    }
    return rows;
  }

  function renderIssuesTable() {
    const v = activeReport;
    if (!v) return;
    const allRows = v.issueRows || [];
    const filtered = getFilteredIssues();

    const uniqueAreas = [];
    const uniqueWheres = [];
    const uniqueOwners = [];
    allRows.forEach(function (r) {
      if (!uniqueAreas.some(function (x) { return x.id === r.areaId; })) uniqueAreas.push({ id: r.areaId, lbl: r.areaLabel });
      if (!uniqueWheres.some(function (x) { return x.id === r.pageType; })) uniqueWheres.push({ id: r.pageType, lbl: r.whereLabel });
      if (uniqueOwners.indexOf(r.owner) === -1) uniqueOwners.push(r.owner);
    });

    const visibleRows = (!ui.showAllIssues && filtered.length > 10) ? filtered.slice(0, 10) : filtered;
    const isTruncated = filtered.length > 10 && !ui.showAllIssues;

    const controls =
      '<div class="tbl-bar">' +
        '<div><h2 class="tbl-h2">' + filtered.length + ' issue' + (filtered.length === 1 ? '' : 's') + ' found' +
          (isTruncated ? ' <span style="font-size:12.5px;font-weight:400;color:var(--ink-soft);font-family:var(--font-sans);">(showing top 10 priority)</span>' : '') +
        '</h2></div>' +
        '<div class="tbl-filters">' +
          '<select onchange="setIssueFilter(\'sev\', this.value)">' +
            '<option value="all"' + (ui.sev === 'all' ? ' selected' : '') + '>All severities</option>' +
            '<option value="critical"' + (ui.sev === 'critical' ? ' selected' : '') + '>Critical</option>' +
            '<option value="warning"' + (ui.sev === 'warning' ? ' selected' : '') + '>Warning</option>' +
            '<option value="minor"' + (ui.sev === 'minor' ? ' selected' : '') + '>Minor</option>' +
          '</select>' +
          '<select onchange="setIssueFilter(\'area\', this.value)">' +
            '<option value="all">All areas</option>' +
            uniqueAreas.map(function (a) { return '<option value="' + a.id + '"' + (ui.area === a.id ? ' selected' : '') + '>' + esc(a.lbl) + '</option>'; }).join('') +
          '</select>' +
          '<select onchange="setIssueFilter(\'where\', this.value)">' +
            '<option value="all">All page types</option>' +
            uniqueWheres.map(function (w) { return '<option value="' + w.id + '"' + (ui.where === w.id ? ' selected' : '') + '>' + esc(w.lbl) + '</option>'; }).join('') +
          '</select>' +
          '<select onchange="setIssueFilter(\'owner\', this.value)">' +
            '<option value="all">All owners</option>' +
            uniqueOwners.map(function (o) { return '<option value="' + esc(o) + '"' + (ui.owner === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
          '</select>' +
          '<select onchange="setIssueFilter(\'sort\', this.value)">' +
            '<option value="severity"' + (ui.sort === 'severity' ? ' selected' : '') + '>Sort: Severity</option>' +
            '<option value="pages"' + (ui.sort === 'pages' ? ' selected' : '') + '>Sort: Pages affected</option>' +
            '<option value="area"' + (ui.sort === 'area' ? ' selected' : '') + '>Sort: Area</option>' +
          '</select>' +
          '<input type="text" placeholder="Search issues or URLs…" value="' + esc(ui.q) + '" oninput="setIssueFilter(\'q\', this.value)" />' +
          (ui.sev !== 'all' || ui.area !== 'all' || ui.where !== 'all' || ui.owner !== 'all' || ui.q
            ? '<button type="button" class="btn" onclick="resetIssueFilters()">Clear</button>'
            : '') +
        '</div>' +
      '</div>';

    const bodyHtml = visibleRows.length === 0
      ? '<tr><td colspan="8" style="padding:20px;color:var(--ink-soft);text-align:center;">No issues match these filters.</td></tr>'
      : visibleRows.map(function (r) {
          const open = Boolean(ui.expandedRows[r.rowId]);
          const done = isFixed(v.crawl.domain, r.rowId);
          const showAll = Boolean(ui.showAllUrls[r.rowId]);
          const shownItems = showAll ? r.affectedItems : r.affectedItems.slice(0, 10);

          const mainRow =
            '<tr class="issue-row ' + (open ? 'open' : '') + (done ? ' fixed-row' : '') + '" onclick="toggleIssueRow(\'' + r.rowId + '\')">' +
              '<td>' + sevDot(r.severity) + '</td>' +
              '<td><strong>' + esc(r.issue) + '</strong>' + (done ? ' <span class="yes">Fixed</span>' : '') + '</td>' +
              '<td style="white-space:nowrap;">' + esc(r.whereLabel) + '</td>' +
              '<td style="white-space:nowrap;">' +
                '<div class="pg-cell"><span class="mono">' + r.affectedCount + ' / ' + r.checkedCount + '</span>' +
                '<span class="mini-tr"><span class="mini-fl ' + r.severity + '" style="width:' + Math.max(4, r.affectedPct) + '%"></span></span></div>' +
              '</td>' +
              '<td>' + (r.exampleUrl ? '<a class="ux-url" href="' + esc(r.exampleUrl) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + esc(shortPath(r.exampleUrl)) + ' ↗</a>' : '—') + '</td>' +
              '<td>' + esc(r.action) + '</td>' +
              '<td style="white-space:nowrap;color:var(--ink-soft);font-size:12px;">' + esc(r.owner) + ' · ' + esc(r.effortLabel) + '</td>' +
              '<td style="text-align:center;color:var(--ink-faint);">' + (open ? '▾' : '▸') + '</td>' +
            '</tr>';

          if (!open) return mainRow;

          const detailRow =
            '<tr class="detail-row"><td colspan="8"><div class="detail-box">' +
              '<div class="detail-grid">' +
                '<div>' +
                  '<div class="detail-head">Affected URLs (' + r.affectedCount + ')</div>' +
                  '<div class="detail-urls">' +
                    shownItems.map(function (it) {
                      return '<div class="du-row"><a class="ux-url" href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(shortPath(it.url)) + ' ↗</a><span class="du-val">' + esc(it.currentValue) + '</span></div>';
                    }).join('') +
                  '</div>' +
                  (r.affectedItems.length > 10
                    ? '<button type="button" class="btn" style="margin-top:8px;font-size:11.5px;padding:3px 10px;" onclick="toggleShowAll(\'' + r.rowId + '\')">' + (showAll ? 'Show first 10' : 'Show all ' + r.affectedItems.length) + '</button>'
                    : '') +
                  (r.passingUrls.length > 0
                    ? '<details class="pass-drop"><summary>' + r.passingUrls.length + ' ' + esc(r.whereLabel.toLowerCase()) + ' pass this check ▸</summary><div class="detail-urls" style="margin-top:6px;">' +
                        r.passingUrls.slice(0, 15).map(function (u) {
                          return '<div class="du-row"><a class="ux-url" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(shortPath(u)) + ' ↗</a><span class="yes">Pass</span></div>';
                        }).join('') +
                      '</div></details>'
                    : '') +
                '</div>' +
                '<div>' +
                  '<div class="detail-head">How to fix (' + esc(v.crawl.platform.toUpperCase()) + ')</div>' +
                  '<ol class="fix-ol">' + r.platformSteps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
                  (r.beforeAfter.length
                    ? '<div class="ba-mini">' + r.beforeAfter.slice(0, 1).map(function (ba) {
                        return '<div class="ba-c"><strong>Now:</strong> ' + esc(ba.currentValue) + '</div><div class="ba-s"><strong>Target:</strong> ' + esc(ba.suggestedValue) + '</div>';
                      }).join('') + '</div>'
                    : '') +
                  '<details class="why-drop"><summary>▸ What we tested and why it matters</summary><div class="why-body"><p>' + esc(r.whyTested) + '</p>' +
                    (r.threshold ? '<p class="mono" style="font-size:11.5px;color:var(--ink-faint);margin-top:4px;">Threshold: ' + esc(r.threshold) + ' · Check ID: ' + esc(r.ruleId) + '</p>' : '') +
                  '</div></details>' +
                  '<div style="display:flex;gap:8px;margin-top:12px;">' +
                    '<button type="button" class="btn" id="tk-' + r.rowId + '" onclick="copyRowTicket(\'' + r.rowId + '\')">Copy as ticket</button>' +
                    '<button type="button" class="btn" onclick="toggleMarkFixed(\'' + r.rowId + '\')">' + (done ? '✓ Marked fixed' : 'Mark as fixed') + '</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div></td></tr>';

          return mainRow + detailRow;
        }).join('');

    const showMoreBar = filtered.length > 10
      ? '<div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;justify-content:center;">' +
          '<button type="button" class="btn" onclick="toggleShowAllIssues()">' +
            (ui.showAllIssues ? 'Show top 10 priority issues' : 'Show all ' + filtered.length + ' issues (' + (filtered.length - 10) + ' more)') +
          '</button>' +
        '</div>'
      : '';

    document.getElementById('sec-issues-table').innerHTML =
      '<div class="panel"><div class="panel-body" style="padding:16px 18px 0;">' + controls + '</div>' +
      '<div class="ex-table-wrap"><table class="ex-table"><thead><tr>' +
        '<th>Severity</th><th>Issue</th><th>Where</th><th>Pages</th><th>Example</th><th>Action</th><th>Owner · time</th><th></th>' +
      '</tr></thead><tbody>' + bodyHtml + '</tbody></table></div>' + showMoreBar + '</div>';
  }

  /* ---------------- Pages Table (Good / Needs work / Broken) ---------------- */
  function renderPagesTable() {
    const v = activeReport;
    if (!v) return;
    const all = v.pageRows || [];
    const goodN = all.filter(function (p) { return p.status === 'good'; }).length;
    const warnN = all.filter(function (p) { return p.status === 'needs_work'; }).length;
    const brokN = all.filter(function (p) { return p.status === 'broken'; }).length;

    let rows = all;
    if (ui.pageTab !== 'all') rows = rows.filter(function (p) { return p.status === ui.pageTab; });
    if (ui.pageQ) {
      const q = ui.pageQ.toLowerCase();
      rows = rows.filter(function (p) {
        return (p.url + ' ' + p.pageTypeLabel + ' ' + p.topIssue).toLowerCase().indexOf(q) !== -1;
      });
    }

    const tabs =
      '<div class="tbl-bar">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
          '<h2 class="tbl-h2" style="margin-right:8px;">Checked pages (' + all.length + ')</h2>' +
          '<button type="button" class="ck-pill ' + (ui.pageTab === 'all' ? 'on' : '') + '" onclick="setPageTab(\'all\')">All (' + all.length + ')</button>' +
          '<button type="button" class="ck-pill ' + (ui.pageTab === 'good' ? 'on' : '') + '" onclick="setPageTab(\'good\')">● Good (' + goodN + ')</button>' +
          '<button type="button" class="ck-pill ' + (ui.pageTab === 'needs_work' ? 'on' : '') + '" onclick="setPageTab(\'needs_work\')">● Needs work (' + warnN + ')</button>' +
          '<button type="button" class="ck-pill ' + (ui.pageTab === 'broken' ? 'on' : '') + '" onclick="setPageTab(\'broken\')">● Broken (' + brokN + ')</button>' +
        '</div>' +
        '<input type="text" placeholder="Filter URLs…" value="' + esc(ui.pageQ) + '" oninput="setPageQuery(this.value)" style="width:200px;" />' +
      '</div>';

    const body = rows.slice(0, 50).map(function (p) {
      return (
        '<tr class="issue-row" onclick="openUrlPanel(\'' + esc(p.url).replace(/'/g, '&#39;') + '\')">' +
          '<td>' + pageStatusBadge(p.status) + '</td>' +
          '<td><span class="ux-url">' + esc(p.shortPath) + '</span></td>' +
          '<td>' + esc(p.pageTypeLabel) + '</td>' +
          '<td class="mono">' + (p.issueCount === 0 ? '0' : p.issueCount + (p.criticalCount ? ' (' + p.criticalCount + ' critical)' : '')) + '</td>' +
          '<td>' + esc(p.topIssue) + '</td>' +
          '<td style="font-size:12px;color:var(--ink-soft);">' + esc(p.keyValues) + '</td>' +
        '</tr>'
      );
    }).join('');

    document.getElementById('sec-pages-table').innerHTML =
      '<div class="panel"><div class="panel-body" style="padding:16px 18px 0;">' + tabs + '</div>' +
      '<div class="ex-table-wrap"><table class="ex-table"><thead><tr>' +
        '<th>Status</th><th>URL (click to inspect)</th><th>Page type</th><th>Issues</th><th>Top issue</th><th>Key values</th>' +
      '</tr></thead><tbody>' + (body || '<tr><td colspan="6" style="padding:18px;text-align:center;color:var(--ink-faint);">No pages in this filter.</td></tr>') + '</tbody></table></div></div>';
  }

  /* ---------------- URL Detail Side Panel ---------------- */
  window.openUrlPanel = function (url) {
    if (!activeReport) return;
    const p = (activeReport.pageRows || []).find(function (x) { return x.url === url; });
    if (!p) return;
    const failed = p.checks.filter(function (c) { return c.status === 'fail'; });
    const passed = p.checks.filter(function (c) { return c.status === 'pass'; });

    document.getElementById('url-drawer-content').innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px;">' +
        '<div>' + pageStatusBadge(p.status) + ' <span class="tag">' + esc(p.pageTypeLabel) + '</span>' +
          '<h3 style="font-family:var(--font-serif);font-size:18px;margin-top:8px;word-break:break-all;">' + esc(p.shortPath) + '</h3>' +
          '<a class="ux-url" href="' + esc(p.url) + '" target="_blank" rel="noopener">Open live page ↗</a>' +
        '</div>' +
        '<button type="button" class="btn" onclick="closeUrlPanel()">✕ Close</button>' +
      '</div>' +
      '<div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:16px;padding:10px 12px;background:var(--bg);border-radius:6px;">' + esc(p.keyValues) + '</div>' +
      '<h4 style="font-size:13px;color:var(--block);margin-bottom:6px;">Failed checks (' + failed.length + ')</h4>' +
      (failed.length
        ? failed.map(function (c) {
            return '<div class="url-chk fail"><div>' + sevDot(c.severity) + ' <strong>' + esc(c.issue) + '</strong><div class="uc-v">Measured: ' + esc(c.measuredValue) + '</div><div class="uc-a">Fix: ' + esc(c.action) + '</div></div></div>';
          }).join('')
        : '<p style="font-size:13px;color:var(--good);margin-bottom:12px;">No failed checks on this URL.</p>') +
      '<h4 style="font-size:13px;color:var(--good);margin:16px 0 6px;">Passed checks (' + passed.length + ')</h4>' +
      passed.map(function (c) {
        return '<div class="url-chk pass"><div><span class="yes">✓ Pass</span> <strong>' + esc(c.issue) + '</strong><div class="uc-v">' + esc(c.measuredValue) + '</div></div></div>';
      }).join('');

    document.getElementById('url-drawer-backdrop').classList.add('open');
  };

  window.closeUrlPanel = function () {
    document.getElementById('url-drawer-backdrop').classList.remove('open');
  };

  /* ---------------- Below the Fold (Collapsed) ---------------- */
  function renderBelowFold(v) {
    const passedChecks = v.areas.flatMap(function (a) {
      return a.ruleResults.filter(function (r) { return r.kind === 'issue' && r.status === 'pass'; });
    });
    const unmeasured = v.areas.flatMap(function (a) {
      return a.ruleResults.filter(function (r) { return r.status === 'not_measured'; });
    });

    document.getElementById('sec-below-fold').innerHTML =
      '<details class="ex-panel"><summary><div><h3>Passed checks (' + passedChecks.length + ')</h3><div class="ex-desc">Checks with zero failures across inspected pages</div></div><span class="yes">' + passedChecks.length + ' passed</span></summary>' +
      '<div style="padding:0 18px 16px;">' +
        passedChecks.map(function (r) {
          return '<div class="bf-row"><span><span class="yes">✓</span> ' + esc(r.title) + '</span><span class="mono" style="font-size:12px;color:var(--ink-faint);">' + r.applicableCount + ' ' + esc(r.denominatorNoun) + '</span></div>';
        }).join('') +
      '</div></details>' +

      '<details class="ex-panel"><summary><div><h3>Not measured (' + unmeasured.length + ')</h3><div class="ex-desc">Checks that require a deep scan or missing page types</div></div><span class="ex-count">' + unmeasured.length + '</span></summary>' +
      '<div style="padding:0 18px 16px;">' +
        (unmeasured.length
          ? unmeasured.map(function (r) {
              return '<div class="bf-row"><span>' + esc(r.title) + '</span><span style="font-size:12px;color:var(--ink-soft);">' + esc(r.notMeasuredReason || 'Run deep scan') + '</span></div>';
            }).join('')
          : '<p style="font-size:13px;color:var(--ink-soft);">All checks were measured.</p>') +
      '</div></details>' +

      '<details class="ex-panel"><summary><div><h3>Store facts</h3><div class="ex-desc">Neutral store metadata and speed measurements</div></div><span class="ex-count">' + v.storeSnapshot.length + ' facts</span></summary>' +
      '<div style="padding:0 18px 16px;"><div class="snapshot-strip">' +
        v.storeSnapshot.map(function (s) {
          return '<div class="snap-item"><div class="sl">' + esc(s.label) + '</div><div class="sv">' + esc(s.value) + '</div><div class="sd">' + esc(s.detail || '') + '</div></div>';
        }).join('') +
      '</div><p style="font-size:12px;color:var(--ink-soft);margin-top:10px;">' + esc(v.localSpeed.disclaimer) + '</p></div></details>' +

      '<details class="ex-panel"><summary><div><h3>Growth opportunities (' + v.opportunities.length + ')</h3><div class="ex-desc">Optional merchandising and content ideas (excluded from health score)</div></div><span class="ex-count">' + v.opportunities.length + '</span></summary>' +
      '<div style="padding:0 18px 16px;">' +
        (v.opportunities.length
          ? v.opportunities.map(function (o) {
              return '<div class="bf-row"><span>' + esc(o.plainTitle) + '</span><span style="font-size:12px;color:var(--ink-soft);">' + o.affectedCount + ' of ' + o.applicableCount + ' ' + esc(o.denominatorNoun) + '</span></div>';
            }).join('')
          : '<p style="font-size:13px;color:var(--ink-soft);">No extra opportunities flagged.</p>') +
      '</div></details>' +

      '<details class="ex-panel"><summary><div><h3>Specialist view (17 modular tools)</h3><div class="ex-desc">Open individual diagnostic engines, rule IDs, and raw CSV tables</div></div><span class="ex-count">17 tools</span></summary>' +
      '<div style="padding:0 18px 16px;display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:8px;">' +
        ALL_TOOLS.map(function (t) {
          return '<a class="btn" style="justify-content:flex-start;text-align:left;" href="/tools/' + t.slug + '?crawlId=' + encodeURIComponent(v.crawl.crawlId) + '&autoScan=true">' + esc(t.name) + ' →</a>';
        }).join('') +
      '</div></details>';
  }

  /* ---------------- Interactive Handlers ---------------- */
  window.toggleSevFilter = function (s) { ui.sev = ui.sev === s ? 'all' : s; renderHeaderAndVisuals(activeReport); renderIssuesTable(); };
  window.filterByArea = function (a) { ui.area = ui.area === a ? 'all' : a; renderIssuesTable(); document.getElementById('sec-issues-table').scrollIntoView({ behavior: 'smooth' }); };
  window.filterByWhere = function (w) { ui.where = ui.where === w ? 'all' : w; renderIssuesTable(); document.getElementById('sec-issues-table').scrollIntoView({ behavior: 'smooth' }); };
  window.filterAreaAndWhere = function (a, w) { ui.area = a; ui.where = w; renderIssuesTable(); document.getElementById('sec-issues-table').scrollIntoView({ behavior: 'smooth' }); };
  window.setIssueFilter = function (k, val) { ui[k] = val; renderIssuesTable(); };
  window.resetIssueFilters = function () { ui.sev = 'all'; ui.area = 'all'; ui.where = 'all'; ui.owner = 'all'; ui.q = ''; renderHeaderAndVisuals(activeReport); renderIssuesTable(); };
  window.toggleIssueRow = function (id) { ui.expandedRows[id] = !ui.expandedRows[id]; renderIssuesTable(); };
  window.toggleShowAll = function (id) { ui.showAllUrls[id] = !ui.showAllUrls[id]; renderIssuesTable(); };
  window.toggleShowAllIssues = function () { ui.showAllIssues = !ui.showAllIssues; renderIssuesTable(); };
  window.toggleMarkFixed = function (id) {
    if (!activeReport) return;
    const k = fixedKey(activeReport.crawl.domain, id);
    localStorage.setItem(k, isFixed(activeReport.crawl.domain, id) ? '0' : '1');
    renderIssuesTable();
  };
  window.copyRowTicket = function (id) {
    if (!activeReport) return;
    const r = (activeReport.issueRows || []).find(function (x) { return x.rowId === id; });
    if (!r) return;
    navigator.clipboard.writeText(r.ticketMarkdown).then(function () {
      const b = document.getElementById('tk-' + id);
      if (b) { b.textContent = '✓ Copied'; setTimeout(function () { b.textContent = 'Copy as ticket'; }, 1400); }
    });
  };
  window.setPageTab = function (t) { ui.pageTab = t; renderPagesTable(); };
  window.setPageQuery = function (q) { ui.pageQ = q; renderPagesTable(); };

  window.exportIssuesCsv = function () {
    const rows = getFilteredIssues();
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
    a.download = (activeReport ? activeReport.crawl.domain : 'store') + '-issues.csv';
    a.click();
  };

  /* ---------------- Local-Only Recent Scans (Browser localStorage) ---------------- */
  const RECENT_KEY = 'silo_recent_scans_v1';

  function loadLocalScans() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocalScan(v) {
    try {
      const list = loadLocalScans().filter(function (x) {
        return x.crawlId !== v.crawl.crawlId && x.domain !== v.crawl.domain;
      });
      list.unshift({
        crawlId: v.crawl.crawlId,
        domain: v.crawl.domain,
        platform: v.crawl.platform,
        overallScore: v.overallScore,
        overallGrade: v.overallGrade,
        overallBand: v.overallBand,
        pagesChecked: v.denominators.okHtmlPages,
        urlsFound: v.denominators.discoveredUrls,
        scannedAt: v.generatedAt,
      });
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
    } catch (e) {
      // ignore storage quota errors
    }
  }

  window.clearLocalScans = function () {
    localStorage.removeItem(RECENT_KEY);
    renderLocalRecentScans();
  };

  function renderLocalRecentScans() {
    const box = document.getElementById('local-recent-scans');
    if (!box) return;
    const list = loadLocalScans();
    if (list.length === 0) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML =
      '<section class="panel"><div class="panel-head"><div><h3>Your recent scans</h3><span class="verified">Stored locally in this browser only</span></div>' +
      '<button type="button" class="btn" onclick="clearLocalScans()">Clear history</button></div><div class="panel-body">' +
      list.map(function (c) {
        const dt = c.scannedAt ? new Date(c.scannedAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        return (
          '<div class="bf-row">' +
            '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
              '<strong style="font-family:var(--font-serif);font-size:16px;">' + esc(c.domain) + '</strong>' +
              (c.overallScore != null ? '<span class="hdr-score ' + esc(c.overallBand || 'amber') + '">' + c.overallScore + ' (' + esc(c.overallGrade) + ')</span>' : '') +
              '<span style="color:var(--ink-faint);font-size:12.5px;">' + esc(c.platform) + ' · ' + c.pagesChecked + ' pages checked of ' + Number(c.urlsFound || 0).toLocaleString() + ' · ' + esc(dt) + '</span>' +
            '</div>' +
            '<button type="button" class="btn btn-primary" onclick="loadSavedVerdict(\'' + esc(c.crawlId) + '\')">Open report →</button>' +
          '</div>'
        );
      }).join('') +
      '</div></section>';
  }

  function renderAll(v) {
    activeReport = v;
    ui.showAllIssues = false;
    saveLocalScan(v);
    const heroBox = document.getElementById('landing-hero-box');
    if (heroBox) heroBox.classList.add('compact');
    document.getElementById('pre-scan-section').style.display = 'none';
    document.getElementById('verdict-workspace').style.display = 'block';
    renderHeaderAndVisuals(v);
    renderIssuesTable();
    renderPagesTable();
    renderBelowFold(v);
  }

  async function runAuditRequest(payload) {
    const prog = document.getElementById('verdict-progress');
    const progTitle = document.getElementById('verdict-progress-title');
    const progStep = document.getElementById('verdict-progress-step');
    prog.style.display = 'block';
    progTitle.textContent = 'Scanning ' + (payload.domainInput || 'saved crawl') + '…';
    progStep.textContent = 'Checking robots.txt, sitemaps, and inspecting product, collection, and editorial pages…';
    try {
      const res = await fetch('/api/audit/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      prog.style.display = 'none';
      if (!res.ok) throw new Error(data.error || 'Audit failed');
      renderAll(data);
    } catch (err) {
      progStep.textContent = '✕ ' + err.message;
    }
  }

  window.rescanCurrent = function (level) {
    if (!activeReport) return;
    runAuditRequest({ domainInput: activeReport.crawl.domain, maxLevel: level || 'C', forceRecrawl: true });
  };
  window.runVerdictFor = function (domain) {
    document.getElementById('verdict-domain-input').value = domain;
    runAuditRequest({ domainInput: domain, maxLevel: document.getElementById('verdict-scan-mode').value });
  };
  window.loadSavedVerdict = function (crawlId) {
    runAuditRequest({ crawlId: crawlId });
  };

  const form = document.getElementById('verdict-scan-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const d = document.getElementById('verdict-domain-input').value.trim();
      if (!d) return;
      runAuditRequest({ domainInput: d, maxLevel: document.getElementById('verdict-scan-mode').value });
    });
  }

  (function checkUrlParams() {
    renderLocalRecentScans();
    const p = new URLSearchParams(window.location.search);
    if (p.get('crawlId')) window.loadSavedVerdict(p.get('crawlId'));
    else if (p.get('url') && p.get('autoScan') === 'true') window.runVerdictFor(p.get('url'));
  })();
})();

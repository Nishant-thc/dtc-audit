/* Silo SEO — Store-First Verdict Client (pure browser JS) */
(function () {
  'use strict';

  const ALL_TOOLS = window.__SILO_VERDICT_TOOLS__ || [];
  let activeVerdict = null;
  let activeAreaId = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function doneKey(domain, taskId) {
    return 'silo_done_' + domain + '_' + taskId;
  }

  function isDone(domain, taskId) {
    return localStorage.getItem(doneKey(domain, taskId)) === '1';
  }

  window.setViewMode = function (mode) {
    document.body.classList.toggle('specialist-mode', mode === 'specialist');
    const ownerBtn = document.getElementById('btn-owner-view');
    const specBtn = document.getElementById('btn-specialist-view');
    if (ownerBtn) ownerBtn.classList.toggle('on', mode === 'owner');
    if (specBtn) specBtn.classList.toggle('on', mode === 'specialist');
    const ev = document.getElementById('layer-3-evidence');
    if (ev) ev.open = mode === 'specialist';
  };

  window.toggleDone = function (taskId) {
    if (!activeVerdict) return;
    const k = doneKey(activeVerdict.crawl.domain, taskId);
    localStorage.setItem(k, isDone(activeVerdict.crawl.domain, taskId) ? '0' : '1');
    renderFixPackets(activeVerdict);
  };

  window.togglePacketDrawer = function (taskId, panel) {
    const el = document.getElementById('drawer-' + panel + '-' + taskId);
    if (el) el.classList.toggle('open');
  };

  window.copyTicket = function (taskId) {
    if (!activeVerdict) return;
    const t = activeVerdict.allTasks.find(function (x) {
      return x.taskId === taskId;
    });
    if (!t) return;
    navigator.clipboard.writeText(t.ticketMarkdown).then(function () {
      const btn = document.getElementById('copy-btn-' + taskId);
      if (btn) {
        btn.textContent = '✓ Copied task';
        setTimeout(function () {
          btn.textContent = 'Copy as task';
        }, 1500);
      }
    });
  };

  window.openComparePrompt = function () {
    if (!activeVerdict) return;
    window.location.href =
      '/tools/competitor-comparison?crawlId=' +
      encodeURIComponent(activeVerdict.crawl.crawlId) +
      '&autoScan=true';
  };

  window.selectArea = function (areaId) {
    activeAreaId = areaId;
    document.querySelectorAll('.area-tile').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-area') === areaId);
    });
    if (activeVerdict) renderAreaDetail(activeVerdict, areaId);
  };

  function renderVerdict(v) {
    activeVerdict = v;
    document.getElementById('pre-scan-section').style.display = 'none';
    document.getElementById('verdict-workspace').style.display = 'block';
    document.getElementById('verdict-history-link').href =
      '/tools/change-tracker?crawlId=' + encodeURIComponent(v.crawl.crawlId) + '&autoScan=true';
    document.getElementById('verdict-pdf-link').href =
      '/api/tools/opportunity-dashboard/export/report?crawlId=' + encodeURIComponent(v.crawl.crawlId);

    // Layer 0
    document.getElementById('layer-0-verdict').innerHTML =
      '<div class="verdict-top">' +
        '<div>' +
          '<div class="verdict-domain">' + esc(v.crawl.domain) + '</div>' +
          '<div class="verdict-sentence">' + esc(v.verdictSentence) + '</div>' +
        '</div>' +
        '<div class="score-pill-big">' +
          '<div class="score-circle ' + v.overallBand + '"><div class="num">' + (v.overallScore != null ? v.overallScore : '—') + '</div><div class="grd">Grade ' + esc(v.overallGrade) + '</div></div>' +
          '<div><div style="font-weight:600;font-size:14px;">Store Health</div><div style="font-size:12px;color:var(--ink-soft);">Weighted pass rate (0–100)</div>' +
          '<div style="font-size:11.5px;color:var(--ink-faint);margin-top:4px;">Passed: ' + v.totals.passedChecks + ' · Issues: ' + v.totals.failedIssues + ' · Not measured: ' + v.totals.notMeasuredChecks + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="area-grid">' +
        v.areas.map(function (a) {
          return (
            '<button type="button" class="area-tile" data-area="' + a.areaId + '" onclick="selectArea(\'' + a.areaId + '\')">' +
              '<div class="al">' + esc(a.label) + '</div>' +
              '<div class="as ' + a.band + '">' + (a.score !== null ? a.score + ' <span style="font-size:14px;">(' + a.grade + ')</span>' : 'Not measured') + '</div>' +
              '<div class="am">' + a.passedCount + ' passed · ' + a.failedCount + ' issues' + (a.notMeasuredCount ? ' · ' + a.notMeasuredCount + ' unmeasured' : '') + '</div>' +
            '</button>'
          );
        }).join('') +
      '</div>';

    renderFixPackets(v);

    // Default Layer 2 to weakest area
    const weakest = v.areas.slice().sort(function (a, b) {
      return (a.score != null ? a.score : 101) - (b.score != null ? b.score : 101);
    })[0];
    if (weakest) window.selectArea(weakest.areaId);

    // Opportunities & Store Snapshot Facts
    document.getElementById('layer-opportunities-facts').innerHTML =
      '<div class="panel" style="margin-bottom:16px;"><div class="panel-head"><h3>Store snapshot (neutral facts)</h3><span class="verified">Observed from public pages · not scored as defects</span></div>' +
      '<div class="panel-body"><div class="snapshot-strip">' +
        v.storeSnapshot.map(function (s) {
          return '<div class="snap-item"><div class="sl">' + esc(s.label) + '</div><div class="sv">' + esc(s.value) + '</div><div class="sd">' + esc(s.detail || '') + '</div></div>';
        }).join('') +
      '</div></div></div>' +
      (v.opportunities.length
        ? '<div class="panel"><div class="panel-head"><h3>Growth opportunities (' + v.opportunities.length + ')</h3><span class="verified">Optional business ideas · excluded from health score</span></div><div class="panel-body">' +
            v.opportunities.map(function (o) {
              return '<div class="check-row"><div><strong>' + esc(o.plainTitle) + '</strong><div style="font-size:12.5px;color:var(--ink-soft);">' + o.affectedCount + ' of ' + o.applicableCount + ' ' + esc(o.denominatorNoun) + ' · Owner: ' + esc(o.owner) + '</div></div><span class="tier-badge nice_to_have">Opportunity</span></div>';
            }).join('') +
          '</div></div>'
        : '');

    // Layer 3 Evidence Drawer
    const d = v.denominators;
    document.getElementById('layer-3-body').innerHTML =
      '<p style="font-size:13px;color:var(--ink-soft);margin-bottom:12px;">Shared denominators across every area &amp; tool: <strong>' + d.discoveredUrls + '</strong> discovered URLs · <strong>' + d.okHtmlPages + '</strong> inspected HTML pages (' + d.byPageTypeHtml.product + ' product pages, ' + (d.byPageTypeHtml.collection + d.byPageTypeHtml.category) + ' collection pages, ' + (d.byPageTypeHtml.blog + d.byPageTypeHtml.informational) + ' editorial pages) · <strong>' + d.deepInspectedPages + '</strong> browser-rendered pages.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(230px, 1fr));gap:8px;">' +
        ALL_TOOLS.map(function (t) {
          return '<a class="btn" style="justify-content:flex-start;text-align:left;" href="/tools/' + t.slug + '?crawlId=' + encodeURIComponent(v.crawl.crawlId) + '&autoScan=true">' + esc(t.name) + ' →</a>';
        }).join('') +
      '</div>';
  }

  function renderFixPackets(v) {
    const tierText = { fix_now: 'Fix now', fix_soon: 'Fix soon', nice_to_have: 'Nice to have' };
    const confText = { verified: 'Verified', sampled: 'Sampled', small_sample: 'Small sample (<8 pages)', not_measured: 'Not measured' };
    const html =
      v.fixFirst.length === 0
        ? '<div class="empty-state">✓ No urgent fixes needed — every measured issue check passed.</div>'
        : '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;"><h2 class="ux-section-title" style="margin:0;">Fix first (' + v.fixFirst.length + ' template tasks)</h2><span style="font-size:12.5px;color:var(--ink-soft);">Ordered by score lift per effort · ' + v.allTasks.length + ' total tasks</span></div>' +
          '<div class="packet-list">' +
          v.fixFirst.map(function (t, idx) {
            const done = isDone(v.crawl.domain, t.taskId);
            return (
              '<div class="packet-card ' + t.actionTier + (done ? ' done' : '') + '">' +
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
                  (t.beforeAfter.length
                    ? '<div class="ba-grid">' +
                        t.beforeAfter.slice(0, 1).map(function (ba) {
                          return (
                            '<div class="ba-box cur"><strong>' + esc(ba.currentLabel) + ':</strong><br/>' + esc(ba.currentValue) + '</div>' +
                            '<div class="ba-box sug"><strong>' + esc(ba.suggestedLabel) + ':</strong><br/>' + esc(ba.suggestedValue) + '</div>'
                          );
                        }).join('') +
                      '</div>'
                    : '') +
                  '<ol style="margin:6px 0 0 18px;font-size:13px;line-height:1.65;">' +
                    t.platformSteps.map(function (s) {
                      return '<li>' + esc(s) + '</li>';
                    }).join('') +
                  '</ol>' +
                '</div>' +
                '<div class="packet-drawer" id="drawer-pages-' + t.taskId + '">' +
                  '<div class="url-list">' +
                    t.affectedUrls.slice(0, 25).map(function (u) {
                      return '<a class="ux-url" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + ' ↗</a>';
                    }).join('') +
                  '</div>' +
                '</div>' +
              '</div>'
            );
          }).join('') +
          '</div>';
    document.getElementById('layer-1-fix-first').innerHTML = html;
  }

  function renderAreaDetail(v, areaId) {
    const area = v.areas.find(function (a) {
      return a.areaId === areaId;
    });
    if (!area) return;
    const failed = area.ruleResults.filter(function (r) {
      return r.kind === 'issue' && r.status === 'fail';
    });
    const passed = area.ruleResults.filter(function (r) {
      return r.kind === 'issue' && r.status === 'pass';
    });
    const unmeasured = area.ruleResults.filter(function (r) {
      return r.status === 'not_measured';
    });

    let extraPanel = '';
    if (areaId === 'ai_readiness') {
      const ai = v.aiReadiness;
      extraPanel =
        '<div style="margin:14px 0;padding:14px;background:var(--bg);border:1px solid var(--line);border-radius:8px;font-size:13px;">' +
          '<strong>AI Crawler Access (robots.txt):</strong> Search/Citation bots are scored separately from Training bots.' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' +
            ai.bots.map(function (b) {
              return '<span class="tag">' + esc(b.userAgent) + ' (' + (b.purpose === 'training' ? 'Training' : 'Search') + '): <strong>' + esc(b.robotsStatus) + '</strong></span>';
            }).join('') +
          '</div>' +
          '<div style="margin-top:10px;"><strong>Raw HTML vs Rendered DOM:</strong> ' + esc(ai.rawVsRenderedParity.summary) + '</div>' +
        '</div>';
    } else if (areaId === 'site_health_speed') {
      const sp = v.localSpeed;
      extraPanel =
        '<div style="margin:14px 0;padding:14px;background:var(--bg);border:1px solid var(--line);border-radius:8px;font-size:13px;">' +
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

    function row(r) {
      return (
        '<div class="check-row"><div><strong>' + esc(r.status === 'pass' ? r.title : r.plainTitle) + '</strong> <span class="specialist-only mono" style="font-size:11px;color:var(--ink-faint);">[' + esc(r.ruleId) + ']</span>' +
        '<div style="font-size:12.5px;color:var(--ink-soft);">' + (r.status === 'not_measured' ? esc(r.notMeasuredReason || 'Not measured') : (r.status === 'pass' ? 'All ' + r.applicableCount + ' ' + esc(r.denominatorNoun) + ' passed' : r.affectedCount + ' of ' + r.applicableCount + ' ' + esc(r.denominatorNoun) + ' affected')) + '</div></div>' +
        '<span class="status-chip ' + r.status + '">' + (r.status === 'pass' ? '✓ Passed' : r.status === 'fail' ? '✕ Failed' : 'Not measured') + '</span></div>'
      );
    }

    document.getElementById('layer-2-area').innerHTML =
      '<div class="panel"><div class="panel-head"><div><h3>' + esc(area.label) + ' — ' + (area.score !== null ? area.score + '/100 (Grade ' + area.grade + ')' : 'Not measured') + '</h3><span class="verified">' + esc(area.description) + '</span></div></div>' +
      '<div class="panel-body">' +
        extraPanel +
        (failed.length ? '<h4 style="font-size:13px;color:var(--block);margin:10px 0 4px;">Issues detected (' + failed.length + ')</h4>' + failed.map(row).join('') : '<p style="color:var(--good);font-size:13.5px;">✓ No issues detected in ' + esc(area.label) + '.</p>') +
        (unmeasured.length ? '<h4 style="font-size:13px;color:var(--ink-soft);margin:14px 0 4px;">Not measured (' + unmeasured.length + ')</h4>' + unmeasured.map(row).join('') : '') +
        (passed.length ? '<details style="margin-top:14px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--good);">Passed checks (' + passed.length + ') ▾</summary><div style="margin-top:8px;">' + passed.map(row).join('') + '</div></details>' : '') +
      '</div></div>';
  }

  async function runAuditRequest(payload) {
    const prog = document.getElementById('verdict-progress');
    const progTitle = document.getElementById('verdict-progress-title');
    const progStep = document.getElementById('verdict-progress-step');
    prog.style.display = 'block';
    progTitle.textContent = 'Auditing ' + (payload.domainInput || 'saved scan') + '…';
    progStep.textContent = 'Reading robots.txt, XML sitemaps, and inspecting product/collection/editorial pages…';
    try {
      const res = await fetch('/api/audit/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      prog.style.display = 'none';
      if (!res.ok) throw new Error(data.error || 'Audit failed');
      renderVerdict(data);
    } catch (err) {
      progStep.textContent = '✕ ' + err.message;
    }
  }

  window.runVerdictFor = function (domain) {
    document.getElementById('verdict-domain-input').value = domain;
    runAuditRequest({
      domainInput: domain,
      maxLevel: document.getElementById('verdict-scan-mode').value,
    });
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
      runAuditRequest({
        domainInput: d,
        maxLevel: document.getElementById('verdict-scan-mode').value,
      });
    });
  }

  (function checkUrlParams() {
    const p = new URLSearchParams(window.location.search);
    if (p.get('crawlId')) window.loadSavedVerdict(p.get('crawlId'));
    else if (p.get('url') && p.get('autoScan') === 'true') window.runVerdictFor(p.get('url'));
  })();
})();

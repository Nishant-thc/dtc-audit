import { TOOL_REGISTRY } from '../tools/registry.ts';
import { STANDING_POLICY_STATEMENT } from '../engine/report-service.ts';
import type { CrawlRecord } from '../types/entities.ts';

export function renderSharedHead(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | Silo SEO — Ecommerce Marketing Intelligence | The Hub Content</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    /* ==================== THC SILO SEO — EDITORIAL DESIGN SYSTEM ==================== */
    :root {
      --bg: #F3F4F7;
      --paper: #FFFFFF;
      --ink: #14171C;
      --ink-soft: #565E6D;
      --ink-faint: #8A909C;
      --line: #DEE1E7;

      --rail: #14171C;
      --rail-text: #A9AFBC;
      --rail-text-active: #FFFFFF;

      --visible: #1348E4;
      --visible-bg: #EAEFFD;
      --warn: #A9720C;
      --warn-bg: #FBF1DD;
      --block: #A6342A;
      --block-bg: #FBEAE8;
      --good: #0D7A3E;
      --good-bg: #E8F8EF;
      --neutral: #6B7280;

      --font-serif: 'Fraunces', Georgia, serif;
      --font-sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'IBM Plex Mono', monospace;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    h1, h2, h3, h4 {
      font-family: var(--font-serif);
      font-weight: 500;
      margin: 0;
      letter-spacing: -0.01em;
    }

    .mono {
      font-family: var(--font-mono);
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    /* ---------- Global Sticky Dark Header ---------- */
    .global-headerWrap {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #0D1117;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .global-header {
      max-width: 1440px;
      margin: 0 auto;
      padding: 14px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .logo-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
    }

    .logo-text {
      font-family: var(--font-serif);
      font-size: 20px;
      font-weight: 600;
      color: #FFFFFF;
      letter-spacing: -0.02em;
    }

    .logo-badge {
      font-family: var(--font-mono);
      font-size: 11px;
      color: #93C5FD;
      background: rgba(19, 72, 228, 0.25);
      border: 1px solid rgba(96, 165, 250, 0.3);
      padding: 2px 9px;
      border-radius: 999px;
    }

    .global-nav {
      display: flex;
      align-items: center;
      gap: 18px;
      flex-wrap: wrap;
    }

    .global-nav-link {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.7);
      transition: color 0.15s ease;
      font-weight: 500;
    }
    .global-nav-link:hover, .global-nav-link.active {
      color: #FFFFFF;
    }

    /* ---------- Dark Hero (Landing / Home) ---------- */
    .landing-hero {
      background: #0D1117;
      padding: 64px 24px 68px;
      position: relative;
      overflow: hidden;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .landing-hero::before {
      content: '';
      position: absolute;
      top: -120px;
      left: 50%;
      transform: translateX(-50%);
      width: 920px;
      height: 580px;
      background: radial-gradient(ellipse at center, rgba(19, 72, 228, 0.22) 0%, transparent 70%);
      pointer-events: none;
    }

    .landing-inner {
      position: relative;
      z-index: 1;
      max-width: 820px;
      margin: 0 auto;
      text-align: center;
    }

    .landing-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 20px;
      padding: 5px 14px 5px 10px;
      font-size: 11.5px;
      color: rgba(255, 255, 255, 0.72);
      font-family: var(--font-mono);
      letter-spacing: 0.02em;
      margin-bottom: 28px;
    }

    .landing-badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #4ADE80;
      box-shadow: 0 0 8px #4ADE80;
      animation: pulseDot 2s ease-in-out infinite;
    }

    @keyframes pulseDot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.35; }
    }

    .landing-headline {
      font-family: var(--font-serif);
      font-size: clamp(34px, 5.2vw, 56px);
      font-weight: 500;
      color: #FFFFFF;
      line-height: 1.08;
      letter-spacing: -0.03em;
      margin-bottom: 18px;
    }

    .landing-headline-accent {
      color: #6B8FFF;
    }

    .landing-sub {
      font-size: 15.5px;
      color: rgba(255, 255, 255, 0.6);
      line-height: 1.65;
      max-width: 620px;
      margin: 0 auto 32px;
    }

    .landing-input-wrap {
      display: flex;
      gap: 8px;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 10px;
      padding: 6px 6px 6px 16px;
      max-width: 720px;
      margin: 0 auto 18px;
      align-items: center;
      flex-wrap: wrap;
    }

    .landing-input {
      flex: 1;
      min-width: 220px;
      background: transparent;
      border: none;
      outline: none;
      color: #FFFFFF;
      font-family: var(--font-mono);
      font-size: 14px;
      padding: 8px 4px;
    }
    .landing-input::placeholder {
      color: rgba(255, 255, 255, 0.38);
    }

    .landing-tool-select {
      background: rgba(13, 17, 23, 0.85);
      color: #E2E8F0;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      padding: 9px 12px;
      font-family: var(--font-sans);
      font-size: 12.5px;
      outline: none;
      max-width: 230px;
    }

    .landing-btn {
      background: #1348E4;
      color: #FFFFFF;
      border: none;
      border-radius: 7px;
      padding: 10px 20px;
      font-family: var(--font-sans);
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
      white-space: nowrap;
    }
    .landing-btn:hover {
      background: #1D58F8;
    }

    .landing-trust-bar {
      display: flex;
      justify-content: center;
      gap: 22px;
      flex-wrap: wrap;
      margin-top: 22px;
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: rgba(255, 255, 255, 0.5);
    }

    /* ---------- App Shell (Left Rail + Main Workspace) ---------- */
    .app-shell {
      display: flex;
      min-height: calc(100vh - 53px);
    }

    .rail {
      width: 242px;
      flex-shrink: 0;
      background: var(--rail);
      color: var(--rail-text);
      display: flex;
      flex-direction: column;
      padding: 20px 0 18px;
      position: sticky;
      top: 53px;
      height: calc(100vh - 53px);
      overflow-y: auto;
      border-right: 1px solid rgba(255, 255, 255, 0.06);
    }

    .rail-brand {
      padding: 0 20px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.09);
      margin-bottom: 12px;
    }

    .rail-brand .mark {
      font-family: var(--font-serif);
      font-size: 16px;
      color: #FFFFFF;
      font-weight: 600;
    }

    .rail-brand .sub {
      font-size: 11px;
      color: var(--rail-text);
      margin-top: 2px;
      font-family: var(--font-mono);
    }

    .rail-section-label {
      padding: 10px 20px 4px;
      font-family: var(--font-mono);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.38);
    }

    .rail-nav {
      display: flex;
      flex-direction: column;
    }

    .rail-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      margin: 1px 12px;
      font-size: 12.5px;
      cursor: pointer;
      color: var(--rail-text);
      background: transparent;
      border: none;
      border-radius: 6px;
      text-align: left;
      transition: color 0.15s ease, background 0.15s ease;
      font-family: var(--font-sans);
      text-decoration: none;
    }

    .rail-item .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.35;
      flex-shrink: 0;
    }

    .rail-item:hover {
      color: var(--rail-text-active);
      background: rgba(255, 255, 255, 0.04);
      text-decoration: none;
    }

    .rail-item-active {
      color: var(--rail-text-active) !important;
      background: rgba(255, 255, 255, 0.09) !important;
      font-weight: 500;
    }

    .rail-item-active .dot {
      opacity: 1;
      background: #3B82F6;
      box-shadow: 0 0 6px #3B82F6;
    }

    .rail-foot {
      margin-top: auto;
      padding: 14px 20px 0;
      border-top: 1px solid rgba(255, 255, 255, 0.09);
      font-size: 11px;
      color: var(--ink-faint);
      font-family: var(--font-mono);
      line-height: 1.45;
    }

    /* ---------- Main Editorial Workspace ---------- */
    .main-workspace {
      flex: 1;
      min-width: 0;
      background: var(--bg);
      display: flex;
      flex-direction: column;
    }

    .topbar {
      background: var(--paper);
      border-bottom: 1px solid var(--line);
      padding: 18px 34px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    }

    .scan-target .domain {
      font-family: var(--font-serif);
      font-size: 22px;
      font-weight: 500;
      color: var(--ink);
      letter-spacing: -0.02em;
    }

    .scan-meta {
      font-size: 12px;
      color: var(--ink-soft);
      margin-top: 4px;
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }

    .topbar-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .btn {
      border: 1px solid var(--line);
      background: var(--paper);
      padding: 8px 14px;
      border-radius: 5px;
      font-size: 12.5px;
      font-family: var(--font-sans);
      color: var(--ink);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      font-weight: 500;
      text-decoration: none;
    }
    .btn:hover {
      background: #F8F9FA;
      border-color: #CBD5E1;
      text-decoration: none;
    }

    .btn-primary {
      background: var(--ink) !important;
      color: #FFFFFF !important;
      border-color: var(--ink) !important;
    }
    .btn-primary:hover {
      background: #2D3748 !important;
    }

    .btn-blue {
      background: var(--visible) !important;
      color: #FFFFFF !important;
      border-color: var(--visible) !important;
    }
    .btn-blue:hover {
      background: #1D58F8 !important;
    }

    .content-container {
      padding: 28px 34px 70px;
      max-width: 1360px;
      width: 100%;
      margin: 0 auto;
    }

    .standing-banner {
      background: var(--visible-bg);
      border: 1px solid rgba(19, 72, 228, 0.22);
      border-left: 4px solid var(--visible);
      padding: 11px 16px;
      border-radius: 6px;
      font-size: 12.5px;
      color: var(--ink);
      margin-bottom: 22px;
    }

    /* ---------- Setup Card & Inputs ---------- */
    .setup-card {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 26px 28px;
      margin-bottom: 26px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
    }

    .setup-title {
      font-family: var(--font-serif);
      font-size: 22px;
      font-weight: 500;
      margin-bottom: 6px;
      color: var(--ink);
    }

    .setup-sub {
      font-size: 13px;
      color: var(--ink-soft);
      margin-bottom: 18px;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 14px;
      margin-top: 12px;
    }

    label {
      display: block;
      font-size: 11.5px;
      color: var(--ink-soft);
      margin-bottom: 5px;
      font-weight: 600;
      font-family: var(--font-mono);
    }

    input[type="text"], input[type="number"], select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 5px;
      padding: 9px 12px;
      font-family: var(--font-mono);
      font-size: 12.5px;
      color: var(--ink);
      background: #FAFBFD;
      outline: none;
    }
    input[type="text"]:focus, input[type="number"]:focus, select:focus {
      border-color: var(--visible);
      background: #FFFFFF;
      box-shadow: 0 0 0 2px rgba(19, 72, 228, 0.1);
    }

    /* ---------- Live Diagnostic Progress Console ---------- */
    .progress-panel {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 24px 28px;
      margin-bottom: 26px;
      font-family: var(--font-mono);
      font-size: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
    }

    .progress-title {
      font-family: var(--font-sans);
      font-weight: 600;
      font-size: 13px;
      color: var(--visible);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .progress-step {
      color: var(--ink);
      font-weight: 500;
      padding: 4px 0;
    }

    .progress-bar-track {
      margin-top: 14px;
      height: 5px;
      background: #E2E8F0;
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      width: 68%;
      background: var(--visible);
      animation: pulseBar 1.4s ease-in-out infinite;
    }

    @keyframes pulseBar {
      0%, 100% { opacity: 1; transform: scaleX(0.95); }
      50% { opacity: 0.65; transform: scaleX(1.03); }
    }

    /* ---------- THC Score Overview Grid ---------- */
    .overview-grid {
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 0;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 24px;
    }
    @media (max-width: 860px) {
      .overview-grid { grid-template-columns: 1fr; }
    }

    .score-block {
      padding: 28px 24px;
      border-right: 1px solid var(--line);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: #FAFBFD;
    }

    .score-number {
      font-family: var(--font-serif);
      font-size: 56px;
      font-weight: 500;
      line-height: 1;
      color: var(--ink);
    }

    .score-number .of100 {
      font-size: 19px;
      color: var(--ink-faint);
      font-family: var(--font-mono);
    }

    .score-label {
      font-size: 12px;
      color: var(--ink-soft);
      margin-top: 8px;
      font-weight: 500;
    }

    .score-verdict {
      margin-top: 10px;
      font-size: 11.5px;
      padding: 4px 12px;
      border-radius: 20px;
      font-family: var(--font-mono);
      font-weight: 500;
    }

    .category-bars {
      padding: 20px 28px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .cat-row {
      display: grid;
      grid-template-columns: 210px 1fr 70px;
      align-items: center;
      gap: 14px;
      padding: 8px 0;
      border-bottom: 1px solid var(--line);
    }
    .cat-row:last-child { border-bottom: none; }

    .cat-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--ink);
    }

    .cat-weight {
      font-size: 10.5px;
      color: var(--ink-faint);
      font-family: var(--font-mono);
      display: block;
    }

    .cat-track {
      height: 7px;
      background: #EDEEF1;
      border-radius: 4px;
      overflow: hidden;
    }

    .cat-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.5s ease;
    }

    .cat-score {
      font-family: var(--font-mono);
      font-size: 12.5px;
      text-align: right;
      font-weight: 600;
    }

    /* ---------- Checklist / Findings Summary Tiles ---------- */
    .checklist-summary {
      display: flex;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 22px;
      background: var(--paper);
      flex-wrap: wrap;
    }

    .cl-tile {
      flex: 1;
      min-width: 135px;
      padding: 16px 18px;
      border-right: 1px solid var(--line);
      text-align: center;
    }
    .cl-tile:last-child { border-right: none; }

    .cl-tile-number {
      font-family: var(--font-serif);
      font-size: 26px;
      font-weight: 500;
      line-height: 1;
    }

    .cl-tile-label {
      font-size: 11px;
      color: var(--ink-soft);
      margin-top: 5px;
      font-family: var(--font-mono);
    }

    /* ---------- Headline Metric Chips ---------- */
    .metrics-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
      gap: 14px;
      margin-bottom: 24px;
    }

    .metric-box {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px 18px;
      cursor: pointer;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .metric-box:hover {
      border-color: var(--visible);
      box-shadow: 0 3px 12px rgba(19, 72, 228, 0.07);
    }

    .metric-label {
      font-size: 10.5px;
      font-family: var(--font-mono);
      color: var(--ink-faint);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .metric-val {
      font-family: var(--font-serif);
      font-size: 28px;
      font-weight: 500;
      color: var(--ink);
      margin: 6px 0 4px;
      line-height: 1.1;
    }

    .metric-sub {
      font-size: 12px;
      color: var(--ink-soft);
    }

    /* ---------- Editorial Panels ---------- */
    .panel {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-bottom: 24px;
      overflow: hidden;
    }

    .panel-head {
      padding: 16px 24px;
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      background: #FAFBFD;
    }

    .panel-head h2, .panel-head h3 {
      font-size: 16px;
      color: var(--ink);
    }

    .panel-head .verified {
      font-size: 11px;
      color: var(--ink-faint);
      font-family: var(--font-mono);
    }

    .panel-body {
      padding: 18px 24px 22px;
    }

    /* ---------- Conflict / Finding Callouts ---------- */
    .conflict {
      border-left: 3px solid var(--block);
      background: var(--block-bg);
      padding: 14px 18px;
      border-radius: 0 6px 6px 0;
      margin-bottom: 12px;
    }

    .conflict-Medium {
      border-left-color: var(--warn) !important;
      background: var(--warn-bg) !important;
    }

    .conflict-Low {
      border-left-color: var(--visible) !important;
      background: var(--visible-bg) !important;
    }

    .conflict-title {
      font-size: 13.5px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--ink);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    .conflict-evidence {
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: var(--ink);
      margin-top: 8px;
      background: rgba(255, 255, 255, 0.75);
      padding: 6px 10px;
      border-radius: 4px;
      border: 1px solid rgba(0, 0, 0, 0.06);
    }

    .conflict-meta {
      font-size: 11px;
      color: var(--ink-soft);
      margin-top: 6px;
      font-family: var(--font-mono);
    }

    /* ---------- Pills ---------- */
    .pill {
      display: inline-block;
      font-size: 11px;
      padding: 2px 9px;
      border-radius: 20px;
      font-family: var(--font-mono);
      font-weight: 500;
    }
    .pill-High { background: var(--block-bg); color: var(--block); border: 1px solid rgba(166, 52, 42, 0.25); }
    .pill-Medium { background: var(--warn-bg); color: var(--warn); border: 1px solid rgba(169, 114, 12, 0.25); }
    .pill-Low { background: var(--visible-bg); color: var(--visible); border: 1px solid rgba(19, 72, 228, 0.25); }
    .pill-good { background: var(--good-bg); color: var(--good); }

    /* ---------- Raw Collapsible Details ---------- */
    .raw-details {
      margin-top: 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #FAFAFB;
    }
    .raw-details summary {
      padding: 7px 12px;
      font-size: 11.5px;
      cursor: pointer;
      color: var(--ink-soft);
      font-family: var(--font-mono);
    }
    .raw-content {
      padding: 8px 14px 12px;
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: var(--ink);
      max-height: 220px;
      overflow-y: auto;
      border-top: 1px solid var(--line);
    }

    /* ---------- Tables ---------- */
    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      text-align: left;
      font-size: 11px;
      color: var(--ink-faint);
      font-weight: 600;
      padding: 9px 10px;
      border-bottom: 1px solid var(--line);
      font-family: var(--font-mono);
      background: #FAFBFD;
      position: sticky;
      top: 0;
    }

    td {
      padding: 9px 10px;
      border-bottom: 1px solid var(--line);
      font-size: 12.5px;
      vertical-align: middle;
      color: var(--ink);
      word-break: break-word;
    }

    tr:hover td {
      background: #FAFBFD;
    }

    .table-wrap {
      overflow-x: auto;
      max-height: 480px;
      overflow-y: auto;
      border: 1px solid var(--line);
      border-radius: 6px;
    }

    /* ---------- Tool Suite Gallery Grid ---------- */
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 18px;
      margin-top: 18px;
    }

    .tool-card {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 22px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
    }
    .tool-card:hover {
      border-color: var(--visible);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(19, 72, 228, 0.07);
    }

    .card-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--ink-faint);
      margin-bottom: 10px;
    }

    @media print {
      .global-headerWrap, .rail, .topbar-actions, .setup-card, .no-print {
        display: none !important;
      }
      body, .main-workspace {
        background: #FFFFFF !important;
      }
    }
  </style>
</head>`;
}

export function renderGlobalTopHeader(activePath?: string): string {
  return `
  <div class="global-headerWrap">
    <header class="global-header">
      <a href="/" class="logo-brand">
        <span class="logo-text">Silo SEO</span>
        <span class="logo-badge">The Hub Content · Ecommerce Intelligence v1.0</span>
      </a>
      <nav class="global-nav" aria-label="Shared Platform Navigation">
        <a href="/" class="global-nav-link ${activePath === '/' ? 'active' : ''}">Store audit</a>
        <a href="/tools" class="global-nav-link ${activePath === '/tools' ? 'active' : ''}">Specialist tools</a>
        <a href="/tools/catalogue-scanner" class="global-nav-link ${activePath === 'catalogue-scanner' ? 'active' : ''}">Product quality</a>
        <a href="/tools/metadata-auditor" class="global-nav-link ${activePath === 'metadata-auditor' ? 'active' : ''}">Titles &amp; headings</a>
      </nav>
    </header>
  </div>`;
}

export { renderHomePage, renderStandaloneToolPage } from './insight-pages.ts';

export function renderCoverageOverviewPage(crawls: CrawlRecord[]): string {
  return `${renderSharedHead('Crawl Coverage & Data Quality')}
<body>
  ${renderGlobalTopHeader('/coverage')}
  <main class="content-container">
    <div class="standing-banner">
      <strong>Standing Honesty &amp; Coverage Policy:</strong> ${escapeHtml(STANDING_POLICY_STATEMENT)}
    </div>
    <h1 style="font-size:28px; margin-bottom:6px;">Crawl Coverage &amp; Data Quality Inspector</h1>
    <p style="color:var(--ink-soft); margin-bottom:20px;">Transparent breakdown of discovered, requested, extracted, partially extracted, skipped, blocked, and deeply inspected URLs for every crawl.</p>
    <section class="panel">
      <div class="panel-head">
        <h2>All Stored Crawls (${crawls.length})</h2>
        <span class="verified">Shared SQLite normalized dataset</span>
      </div>
      <div class="panel-body">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Crawl ID</th>
                <th>Domain</th>
                <th>Platform</th>
                <th>Max Level</th>
                <th>Discovered</th>
                <th>Requested</th>
                <th>Extracted</th>
                <th>Partial</th>
                <th>Skipped</th>
                <th>Blocked/403/429</th>
                <th>Level C Deep</th>
                <th>Open Dossier</th>
              </tr>
            </thead>
            <tbody>
              ${crawls
                .map(
                  (c) => `<tr>
                  <td class="mono" style="font-size:11.5px;">${escapeHtml(c.crawlId)}</td>
                  <td><strong style="font-family:var(--font-serif);">${escapeHtml(c.domain)}</strong></td>
                  <td><span class="pill pill-Low">${escapeHtml(c.platform)}</span></td>
                  <td class="mono">Level ${escapeHtml(c.maxLevel)}</td>
                  <td class="mono">${c.coverage.discovered}</td>
                  <td class="mono">${c.coverage.requested}</td>
                  <td class="mono">${c.coverage.extracted}</td>
                  <td class="mono">${c.coverage.partiallyExtracted}</td>
                  <td class="mono">${c.coverage.skipped}</td>
                  <td class="mono">${c.coverage.blockedOrUnavailable}</td>
                  <td class="mono">${c.coverage.deeplyInspected}</td>
                  <td><a href="/tools/opportunity-dashboard?crawlId=${encodeURIComponent(c.crawlId)}&autoScan=true" class="btn btn-primary" style="padding:4px 10px; font-size:11.5px;">Open →</a></td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

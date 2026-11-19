# Silo SEO — Architectural & Technical Decisions (`DECISIONS.md`)

This document records all architectural, runtime, library, and design decisions made where the Product Design & Requirements (PDR v1.0) leaves options open or allows stack replacement.

## ADR-001: Runtime & Primary Language — Node.js v26 (Native TypeScript) Instead of Python
- **Context:** Section 12 suggests a Python stack ( replaceable if recorded in `DECISIONS.md`). On the target machine, Python is not installed (`Python was not found`), whereas **Node.js v26.1.0** and **npm 11.13.0** are installed and include native TypeScript execution, built-in `node:sqlite`, native `fetch`, `node:zlib`, `node:crypto`, and `node:test`.
- **Decision:** Build Silo SEO in **TypeScript on Node.js v26** with ESM/CommonJS compatibility.
- **Consequences:** Zero build-step friction, strong static typing across all 14 shared entities and 13 tools, native SQLite without native C++ compilation issues, and native integration with `playwright-core` for Level C rendering.

## ADR-002: Database Layer — Built-in `node:sqlite` with PostgreSQL-Portable Schema
- **Context:** Section 6 requires one normalized database shared by every tool, using SQLite for local/single-user mode with a schema portable to PostgreSQL for hosted mode, and storing raw HTML snapshots compressed with a retention setting.
- **Decision:** Use Node's built-in `node:sqlite` (`DatabaseSync`) storing data in `data/silo-seo.sqlite` (or in-memory `:memory:` / custom file path for tests). All DDL uses standard SQL types (`TEXT`, `INTEGER`, `REAL`, `BLOB`) compatible with PostgreSQL, and a companion PostgreSQL DDL export (`src/db/schema.postgres.sql`) is maintained alongside the SQLite schema. Raw HTML snapshots are compressed with `zlib.gzipSync` (`BLOB`) and controlled via a configurable retention policy (`snapshotRetentionDays` and `storeRawHtml`).

## ADR-003: HTML & Structured Data Extraction (Level B) — `cheerio` + Custom Deterministic Extractors
- **Context:** Section 5.1 (Level B) and Section 12 require fast, browserless HTML parsing and extraction of JSON-LD, Microdata, and RDFa, plus metadata, headings, links, images, and product fields.
- **Decision:** Use `cheerio` (free, open-source MIT library) for DOM traversal and CSS selector queries, paired with deterministic extractors in `src/engine/extractor.ts` for:
  1. **JSON-LD** (`<script type="application/ld+json">`, handling `@graph`, arrays, and nested entities).
  2. **Microdata** (`[itemscope]`, `itemtype`, `[itemprop]`).
  3. **RDFa** (`[typeof]`, `[property]`, `vocab`).
  4. **Ecommerce product signals** (price, original compare-at price, currency, availability, SKU, brand, ratings, review count, variants, images, alt text, and specifications).

## ADR-004: Representative Deep Extraction (Level C) — `playwright-core` with System Browser Discovery & Graceful Fallback
- **Context:** Section 5.1 (Level C) requires browser rendering on a small representative sample per template to extract rendered DOM content, variants, filters, review widgets, popups, sticky elements, cart drawers, third-party network requests, and runtime performance metrics.
- **Decision:** Use `playwright-core` connected to the locally installed Chrome or Microsoft Edge binary (`channel: 'chrome'` or `'msedge'`). If a browser binary is unavailable or blocked in restricted environments, the renderer degrades gracefully and marks Level C observations with appropriate confidence and provenance.

## ADR-005: Rules Engine Format — Declarative YAML Files per Tool (`rules.yaml`)
- **Context:** Section 7 specifies that every recommendation originates from a rule stored as data (YAML or JSON), not scattered code, with versioned rules and a deterministic `Priority Score = Impact × Coverage × Confidence`.
- **Decision:** Store each tool's rules in `src/tools/<tool-folder>/rules.yaml` parsed via the `yaml` package. Each rule follows the exact 12-field schema from Section 7 and declares a declarative `condition` object evaluated deterministically by `src/engine/rules-engine.ts` against the shared database entities. Priority bands are mapped deterministically:
  - **High:** Priority Score ≥ 45 (out of 125)
  - **Medium:** Priority Score 20 to 44
  - **Low:** Priority Score < 20

## ADR-006: Web Server & Frontend Architecture — Zero-Build Lightweight HTTP Server + Shared Component Library
- **Context:** Section 10 and Section 11 require every tool to be a separate entry point (own route `/tools/<tool-id>`, own page, own README, own tests) that can be used standalone or from the home tool gallery, plus shared navigation, clickable metrics down to affected URLs, coverage panels, and CSV / JSON / printable HTML-PDF exports.
- **Decision:** Use Node's native `node:http` server (`src/server/index.ts`) with a clean REST API (`/api/...`) and server-rendered + interactive vanilla JS UI (`src/ui/`) using a shared accessible design system (`public/styles.css`, `public/app.js`). Every tool is automatically discovered from `src/tools/registry.ts` and exposed at `/tools/<slug>` as an independent web application, as well as via CLI (`npx tsx` / `node`).

## ADR-007: Polite Crawling, Identification & Exclusion Mechanism
- **Context:** Section 12 (Ethics) requires respecting `robots.txt` and `Crawl-delay`, an identifiable user-agent with a contact/exclusion URL, per-host rate limits, and no access to private/login areas.
- **Decision:** Default User-Agent is `SiloSEO-AuditBot/1.0 (+https://github.com/thehubcontent/silo-seo/bot-exclusion; polite-ecommerce-auditor)`. The engine parses `robots.txt` (`Disallow`, `Allow`, `Crawl-delay`, `Sitemap`) before making page requests, enforces a minimum per-host delay (default 250ms or `Crawl-delay`, whichever is higher), skips login/cart/checkout/account paths automatically, and documents opt-out instructions in `BOT_EXCLUSION.md`.


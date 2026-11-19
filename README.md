# Silo SEO — Ecommerce Marketing Intelligence Platform (v1.0)

Free, deterministic, open-source ecommerce marketing intelligence infrastructure built per the Silo SEO Product Design & Requirements (PDR v1.0).

## Core Principles
1. **Evidence First:** Every finding traces to a rule ID, measurable evidence (`X of Y inspected`), and affected source URLs.
2. **One Crawl Powers 13 Standalone Tools:** Tools never re-implement crawling, parsing, or scoring. They read exclusively from the shared normalized SQLite/PostgreSQL data layer and declarative YAML rules engine.
3. **Zero AI / Zero Paid APIs:** The shipped runtime contains zero LLMs, AI APIs, or paid third-party dependencies.
4. **Honest Coverage & Calibrated Language:** Reports state what was discovered, requested, extracted, skipped, blocked, and deeply inspected (`Level C`), and include the standing statement:
   > *"This report is based on publicly accessible website data collected within the stated crawl coverage. Priority scores rank suggested work; they do not predict revenue or rankings."*

---

## Quick Start

```bash
# Run the full test suite (Phase 0 + Live Public Stores + Tools 1–13)
npm test

# Start the web platform & standalone tools server (default: http://localhost:3400)
npm start
```

---

## Architecture Overview

- **Phase 0 Shared Engine (`src/engine/` & `src/db/`)**:
  - `src/db/database.ts` & `src/db/schema.postgres.sql` — 14 shared normalized entities (`Website`, `Crawl`, `Page`, `Sitemap`, `Product`, `Variant`, `Collection`, `Content`, `Link`, `Image`, `Schema`, `Technology`, `Observation`, `Finding`) + compressed HTML snapshots (`gzip`).
  - `src/engine/url-normalizer.ts` — URL normalization, tracking parameter stripping, private/checkout path exclusion.
  - `src/engine/classifier.ts` — Multi-signal page classifier & DOM/URL template clusterer.
  - `src/engine/discovery.ts` — `robots.txt` compliance (`Crawl-delay`, `Disallow`, `Allow`), XML sitemap & sitemap index parser (including `.gz`), link harvesting.
  - `src/engine/adapters.ts` — Platform detection & adapters (`Shopify`, `WooCommerce`, `Magento`, `BigCommerce`, `Generic`).
  - `src/engine/extractor.ts` — Level B lightweight HTML, JSON-LD, Microdata, RDFa, product, collection, content, technology, and observation extractor.
  - `src/engine/renderer.ts` — Level C representative deep extraction per template using `playwright-core`.
  - `src/engine/rules-engine.ts` — Declarative YAML rules evaluator & `Priority Score = Impact × Coverage × Confidence` scorer.
  - `src/engine/job-manager.ts` — Crawl budget controller, zero-request crawl reuse, and incremental recrawl manager.
  - `src/engine/report-service.ts` — CSV, JSON, and printable HTML/PDF report builder + Honesty Policy validator.

---

## The 13 Standalone Tools (`src/tools/`)

| # | Tool Name | Route | Crawl Level | Owned Rules |
|---|-----------|-------|-------------|-------------|
| 1 | **Site Atlas (Website Architecture Mapper)** | `/tools/site-atlas` | Level A/B | `ATLAS-001`..`004` |
| 2 | **Metadata & Indexability Auditor** | `/tools/metadata-auditor` | Level B | `META-001`..`006` |
| 3 | **Schema Coverage Inspector** | `/tools/schema-inspector` | Level B | `SCHEMA-001`..`004` |
| 4 | **Catalogue Completeness Scanner** | `/tools/catalogue-scanner` | Level B | `CAT-001`..`005` |
| 5 | **Price & Promotion Mapper** | `/tools/price-promo-mapper` | Level B | `PRICE-001`..`003` |
| 6 | **Collection Content Gap Finder** | `/tools/collection-gap-finder` | Level B | `COLL-001`..`003` |
| 7 | **Faceted Navigation & Parameter Auditor** | `/tools/faceted-nav-auditor` | Level B | `FACET-001`..`002` |
| 8 | **Internal Link Graph Analyzer** | `/tools/internal-link-analyzer` | Level B | `LINK-001`..`003` |
| 9 | **Blog-to-Product Link Mapper** | `/tools/blog-product-mapper` | Level B | `BLOG-001`..`002` |
| 10 | **Content Freshness & Completeness Tracker** | `/tools/content-freshness-tracker` | Level B | `FRESH-001`..`002` |
| 11 | **Conversion Element Auditor** | `/tools/conversion-auditor` | Level B/C | `CRO-001`..`002` |
| 12 | **Tech Stack & Performance Inspector** | `/tools/tech-perf-inspector` | Level B/C | `PERF-001`..`002` |
| 13 | **Opportunity Dashboard & Report Builder** | `/tools/opportunity-dashboard` | Level A/B/C | Aggregates All |


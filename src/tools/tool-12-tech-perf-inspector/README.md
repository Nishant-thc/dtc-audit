# Tool 12: Tech Stack & Performance Inspector

## Purpose
Detects the store's ecommerce platform, CMS, frameworks, analytics, advertising pixels, review widgets, email/SMS, and chat integrations via deterministic signatures, and measures third-party script load, caching, compression, image lazy-loading, and runtime timings on sampled pages.

## Shared Data Entities Used
- `Technology`, `Observation`, `Image`, `Page` (from `SharedDatabase`).
- Required crawl levels: **Level B** and **Level C** (sampled per template).

## Coverage Limits
- Runtime timings (`level_c_dcl_ms`, `level_c_load_ms`, `level_c_mobile_lcp_ms`) are collected on the Level C representative sample within `maxBrowserPerfPages`.

## Owned Rules (`rules.yaml`)
- `PERF-001`: Excessive third-party script tags (>5 external scripts) detected
- `PERF-002`: Below-the-fold images missing loading="lazy" attribute

## How to Add a Rule
Add a rule definition in `src/tools/tool-12-tech-perf-inspector/rules.yaml` and a unit test in `tool.test.ts`.


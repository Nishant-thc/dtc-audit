# Tool 1: Site Atlas (Website Architecture Mapper)

## Purpose
Discovers all public sitemaps and URLs across an ecommerce store, classifies each URL by page type with a confidence score, verifies HTTP status codes and redirect chains, and compares XML sitemap declarations against navigation and internal links.

## Shared Data Entities Used
- `Website`, `Crawl`, `Page`, `Sitemap`, `Link` (from `SharedDatabase`).
- Required minimum crawl coverage level: **Level A** (enhanced with HTTP status & canonical verification from Level B).

## Coverage Limits
- Only publicly accessible URLs within the configured crawl budget (`maxDiscoveryUrls`) and allowed by `robots.txt` are inspected.
- Orphan pages that are neither listed in sitemaps, linked internally, nor exposed in public platform feeds cannot be discovered without an external URL list.

## Owned Rules (`rules.yaml`)
- `ATLAS-001`: Important indexable pages missing from XML sitemaps
- `ATLAS-002`: Sitemap URLs returning non-200 status codes or redirects
- `ATLAS-003`: Missing or non-self-referencing canonical declarations
- `ATLAS-004`: Internal or sitemap URLs resolving through redirect chains

## How to Add a Rule
Add a new entry under `rules:` in `src/tools/tool-01-site-atlas/rules.yaml` following the 12-field schema in Section 7 of the PDR, and add a corresponding unit test in `tool.test.ts`.


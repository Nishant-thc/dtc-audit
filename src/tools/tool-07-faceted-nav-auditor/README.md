# Tool 7: Faceted Navigation & Parameter Auditor

## Purpose
Inventories query parameters, filter combinations, and pagination patterns across the store, auditing whether filtered URLs are included in sitemaps or left indexable without canonicalization back to the base category.

## Shared Data Entities Used
- `Page`, `Collection`, `Sitemap` (from `SharedDatabase`).
- Required minimum crawl level: **Level B**.

## Coverage Limits
- Evaluates parameterized and faceted URLs discovered via sitemaps, internal links, or facet forms within the crawl budget.

## Owned Rules (`rules.yaml`)
- `FACET-001`: Filtered or parameterized URLs indexable without canonical control
- `FACET-002`: Filtered or parameterized URLs declared inside XML sitemaps

## How to Add a Rule
Add a rule definition in `src/tools/tool-07-faceted-nav-auditor/rules.yaml` and a unit test in `tool.test.ts`.


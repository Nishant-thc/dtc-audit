# Tool 4: Catalogue Completeness Scanner

## Purpose
Builds the full product catalogue from extracted product pages and scores each product (0–100) across description depth, structured specifications, imagery count, image alt text, Product/Offer schema, customer reviews, SKU/brand, and variant/related-product coverage.

## Shared Data Entities Used
- `Product`, `Variant`, `Image`, `Schema`, `Page` (from `SharedDatabase`).
- Required minimum crawl level: **Level B**.

## Coverage Limits
- Scores products extracted within the crawl budget. Tabbed specifications or review widgets loaded asynchronously via client-side scripts may require Level C deep sampling if absent from initial HTML.

## Owned Rules (`rules.yaml`)
- `CAT-001`: Product pages with thin or missing descriptions (<30 words)
- `CAT-002`: Product pages missing structured specifications table or list
- `CAT-003`: Product images missing descriptive alt attributes
- `CAT-004`: Product pages without visible reviews or rating signals
- `CAT-005`: Products with low overall catalogue completeness score (<70/100)

## How to Add a Rule
Add a rule definition in `src/tools/tool-04-catalogue-scanner/rules.yaml` and a unit test in `tool.test.ts`.


# Tool 9: Blog-to-Product Link Mapper

## Purpose
Inventories editorial and blog articles, extracts internal links, classifies them as product, category, article, or other, and maps which articles support product discovery and which products receive zero editorial support.

## Shared Data Entities Used
- `Content`, `Product`, `Collection`, `Link`, `Page` (from `SharedDatabase`).
- Required minimum crawl level: **Level B**.

## Coverage Limits
- Evaluates editorial pages discovered within the crawl budget.

## Owned Rules (`rules.yaml`)
- `BLOG-001`: Blog articles with zero internal links to product pages
- `BLOG-002`: Products receiving zero internal links from editorial content

## How to Add a Rule
Add a rule definition in `src/tools/tool-09-blog-product-mapper/rules.yaml` and a unit test in `tool.test.ts`.


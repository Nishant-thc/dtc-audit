# Tool 3: Schema Coverage Inspector

## Purpose
Extracts JSON-LD, Microdata, and RDFa structured data across all crawled pages, validates required and recommended fields per schema type (`Product`, `Offer`, `AggregateRating`, `BreadcrumbList`, `Organization`, `WebSite`, `Article`), and checks parity between schema price/availability and visible page values.

## Shared Data Entities Used
- `Page`, `Schema`, `Product` (from `SharedDatabase`).
- Required minimum crawl level: **Level B**.

## Coverage Limits
- Validates structured data presence and field completeness deterministically against `schema.org` rules; does not query Google Search Console private APIs.

## Owned Rules (`rules.yaml`)
- `SCHEMA-001`: Missing Product structured data on product pages
- `SCHEMA-002`: Incomplete Product or Offer structured data fields
- `SCHEMA-003`: Missing BreadcrumbList structured data on interior pages
- `SCHEMA-004`: Mismatch between schema Offer price/availability and visible page values

## How to Add a Rule
Add a rule definition in `src/tools/tool-03-schema-inspector/rules.yaml` and a unit test in `tool.test.ts`.


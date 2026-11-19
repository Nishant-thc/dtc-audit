333# Tool 2: Metadata & Indexability Auditor

## Purpose
Extracts and audits `<title>`, `<meta name="description">`, `<h1>`–`<h6>` headings, canonical tags, and robots indexability directives (`meta robots` and `X-Robots-Tag`) across all crawled pages, grouping issues by template.

## Shared Data Entities Used
- `Page` (from `SharedDatabase`).
- Required minimum crawl level: **Level B**.

## Coverage Limits
- Evaluates raw HTTP response HTML (`Level B`) or rendered DOM (`Level C` when available). Client-side JavaScript title mutations not present in SSR/initial HTML require Level C sampling.

## Owned Rules (`rules.yaml`)
- `META-001`: Missing, truncated, or overly short page titles
- `META-002`: Duplicate page titles across multiple URLs
- `META-003`: Missing or poorly sized meta descriptions
- `META-004`: Duplicate meta descriptions across multiple URLs
- `META-005`: Missing or multiple H1 headings on page
- `META-006`: Accidental noindex directive on commercial or editorial pages

## How to Add a Rule
Add a rule block in `src/tools/tool-02-metadata-auditor/rules.yaml` referencing a declarative `detectionCondition` check and add a test case in `tool.test.ts`.

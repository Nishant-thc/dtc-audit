# Tool 8: Internal Link Graph Analyzer

## Purpose
Builds the internal link graph from crawled links, calculating click depth from the homepage, inbound and outbound link counts, anchor text diversity by page type, orphan candidates, and broken internal links.

## Shared Data Entities Used
- `Page`, `Link` (from `SharedDatabase`).
- Required minimum crawl level: **Level B**.

## Coverage Limits
- Inbound and outbound counts reflect links present across pages extracted within the crawl budget.

## Owned Rules (`rules.yaml`)
- `LINK-001`: Orphan pages with zero internal inbound links
- `LINK-002`: Pages buried deeper than 3 clicks from the homepage
- `LINK-003`: Pages containing broken internal links (4xx/5xx targets)

## How to Add a Rule
Add a rule definition in `src/tools/tool-08-internal-link-analyzer/rules.yaml` and a unit test in `tool.test.ts`.


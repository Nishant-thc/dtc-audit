# Tool 6: Collection Content Gap Finder

## Purpose
Analyses collection and category pages for introductory description copy, metadata, headings, product counts, filter facets, sorting controls, pagination types, and internal inbound links.

## Shared Data Entities Used
- `Collection`, `Page`, `Link` (from `SharedDatabase`).
- Required minimum crawl level: **Level B**.

## Coverage Limits
- Evaluates collections discovered within the crawl budget. Infinite-scroll product counts reflect products rendered on the initial page response unless Level C is run.

## Owned Rules (`rules.yaml`)
- `COLL-001`: Collection or category pages missing introductory editorial copy
- `COLL-002`: Thin collection pages displaying fewer than 3 products
- `COLL-003`: Collection pages with weak internal inbound linking (<2 inbound links)

## How to Add a Rule
Add a rule definition in `src/tools/tool-06-collection-gap-finder/rules.yaml` and a unit test in `tool.test.ts`.


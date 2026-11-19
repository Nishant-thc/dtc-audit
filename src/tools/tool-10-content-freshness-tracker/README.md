# Tool 10: Content Freshness & Completeness Tracker

## Purpose
Reads publication and modified dates, word counts, heading structure, metadata, and Article schema across editorial pages, and extracts recurring topic terms deterministically without any LLM.

## Shared Data Entities Used
- `Content`, `Schema`, `Page` (from `SharedDatabase`).
- Required minimum crawl level: **Level B**.

## Coverage Limits
- Relies on dates exposed in JSON-LD (`datePublished`, `dateModified`), OpenGraph meta tags, or `<time datetime>` elements.

## Owned Rules (`rules.yaml`)
- `FRESH-001`: Stale editorial content (>365 days old) or missing publication dates
- `FRESH-002`: Thin (<400 words), unstructured (<2 H2s), or missing Article schema on editorial content

## How to Add a Rule
Add a rule definition in `src/tools/tool-10-content-freshness-tracker/rules.yaml` and a unit test in `tool.test.ts`.


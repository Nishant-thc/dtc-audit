# Tool 13: Opportunity Dashboard & Report Builder

## Purpose
Aggregates findings from all tools that have run (or evaluates all available suite rules on the stored crawl when run standalone), scores and ranks every finding by `Priority Score = Impact × Coverage × Confidence`, and produces exportable CSV, JSON, and print-ready HTML/PDF reports with evidence and affected URLs.

## Shared Data Entities Used
- `Finding`, `Crawl`, `Page` (from `SharedDatabase`).
- Works with whichever tools or crawl levels (`A`, `B`, or `C`) have data; never requires all tools.

## Standing Honesty Statement
Every report includes:
> "This report is based on publicly accessible website data collected within the stated crawl coverage. Priority scores rank suggested work; they do not predict revenue or rankings."


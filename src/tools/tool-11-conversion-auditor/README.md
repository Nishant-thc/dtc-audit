# Tool 11: Conversion Element Auditor

## Purpose
Inspects representative product, collection, and landing pages per template for observable conversion elements: primary CTAs, trust signals, delivery/returns copy, review widgets, lead-capture forms, promo mechanisms, and cart drawers.

## Boundary
Reports observable DOM and rendered UI elements only; never estimates or predicts conversion rates.

## Shared Data Entities Used
- `Observation`, `Page`, `Product` (from `SharedDatabase`).
- Required crawl levels: **Level B** and **Level C** (sampled per template).

## Coverage Limits
- Deep browser rendering (`Level C`) runs on a representative sample per template within `maxDeepProductPages`, `maxDeepCollectionPages`, and `maxDeepContentPages`.

## Owned Rules (`rules.yaml`)
- `CRO-001`: Sampled pages missing observable trust badges or delivery/returns info
- `CRO-002`: Product pages missing observable customer review section

## How to Add a Rule
Add a rule definition in `src/tools/tool-11-conversion-auditor/rules.yaml` and a unit test in `tool.test.ts`.


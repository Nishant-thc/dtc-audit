# Tool 5: Price & Promotion Mapper

## Purpose
Extracts observed public prices, original compare-at prices, markdown percentages, stock availability states, and bundle or subscription signals across the product catalogue.

## Boundary
Reports observed public prices on the target store only; never makes competitor pricing claims or price-setting recommendations.

## Shared Data Entities Used
- `Product`, `Variant`, `Page` (from `SharedDatabase`).
- Required minimum crawl level: **Level B**.

## Coverage Limits
- Evaluates default variant prices and compare-at prices present in HTML/JSON-LD or public platform feeds within the crawl budget. Member-only or checkout-only coupon codes are not inspected.

## Owned Rules (`rules.yaml`)
- `PRICE-001`: Out-of-stock product pages exposed in active catalogue
- `PRICE-002`: Extreme compare-at discount percentages (>=50% off) detected
- `PRICE-003`: Products without observable bundle or subscription options

## How to Add a Rule
Add a rule definition in `src/tools/tool-05-price-promo-mapper/rules.yaml` and a unit test in `tool.test.ts`.


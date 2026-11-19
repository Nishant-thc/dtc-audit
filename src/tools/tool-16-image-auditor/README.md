# Tool 16: Image Optimisation Auditor

## Purpose
Audits all store images (`ImageRecord`) for missing alt text, legacy formats (JPG/PNG vs WebP/AVIF), missing explicit `width` and `height` dimensions (CLS risk), and lazy loading.

## Owned Rules (`rules.yaml`)
- `IMG-001`: Pages containing images without descriptive alt text
- `IMG-002`: Pages serving legacy image formats (JPG/PNG/GIF) instead of WebP or AVIF
- `IMG-003`: Images missing explicit width and height attributes (CLS risk)


# Silo SEO — Site Owner Bot Exclusion & Polite Crawling Policy

Silo SEO (`SiloSEO-AuditBot/1.0`) is an ethical, open-source ecommerce marketing intelligence crawler that only inspects publicly accessible pages within explicit user-configured request budgets.

## How Silo SEO Respects Your Website
1. **Strict `robots.txt` Compliance:** Before requesting any page, Silo SEO fetches `/robots.txt` and honours `Disallow`, `Allow`, and `Crawl-delay` directives for both `SiloSEO-AuditBot` and `*`.
2. **Private & Transactional Area Exclusion:** Silo SEO automatically excludes `/cart`, `/checkout`, `/account`, `/login`, `/admin`, and `/wp-admin` routes and never submits forms or completes checkouts.
3. **Polite Rate Limits:** Requests to any single host are rate-limited with configurable concurrency (default 4 concurrent requests, minimum 250ms per-host delay or your declared `Crawl-delay`, whichever is greater) and automatic backoff on `429 Too Many Requests` or `503 Service Unavailable`.

## How to Exclude Your Domain or Paths
To block Silo SEO from crawling your site or specific directories, add the following to your `robots.txt`:

```txt
User-agent: SiloSEO-AuditBot
Disallow: /
```

Or to set a custom crawl delay:

```txt
User-agent: SiloSEO-AuditBot
Crawl-delay: 5
```

For local/hosted instance administrators, domains can also be added to the local exclusion list in `config/excluded-domains.json`.


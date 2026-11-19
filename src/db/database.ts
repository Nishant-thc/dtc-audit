import { DatabaseSync } from 'node:sqlite';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  WebsiteRecord,
  CrawlRecord,
  PageRecord,
  SitemapRecord,
  ProductRecord,
  VariantRecord,
  CollectionRecord,
  ContentRecord,
  LinkRecord,
  ImageRecord,
  SchemaRecord,
  TechnologyRecord,
  ObservationRecord,
  FindingRecord,
  CrawlBudgetConfig,
  CoverageCounters,
} from '../types/entities.ts';

export class SharedDatabase {
  public db: DatabaseSync;
  public dbPath: string;

  constructor(dbPath = path.join(process.cwd(), 'data', 'silo-seo.sqlite')) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.postgres.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8').replace(/BYTEA/g, 'BLOB');
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec(sql);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pages_crawl ON pages(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_pages_norm_url ON pages(crawl_id, normalized_url);
      CREATE INDEX IF NOT EXISTS idx_sitemaps_crawl ON sitemaps(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_products_crawl ON products(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_variants_crawl ON variants(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_collections_crawl ON collections(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_contents_crawl ON contents(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_links_crawl ON links(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_images_crawl ON images(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_schemas_crawl ON schemas(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_technologies_crawl ON technologies(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_observations_crawl ON observations(crawl_id);
      CREATE INDEX IF NOT EXISTS idx_findings_crawl ON findings(crawl_id);
    `);
  }

  public runInTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  public upsertWebsite(record: WebsiteRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO websites (domain, platform, latest_crawl_id, settings_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(domain) DO UPDATE SET
        platform = excluded.platform,
        latest_crawl_id = excluded.latest_crawl_id,
        settings_json = excluded.settings_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      record.domain,
      record.platform,
      record.latestCrawlId,
      record.settingsJson,
      record.createdAt,
      record.updatedAt
    );
  }

  public getWebsite(domain: string): WebsiteRecord | null {
    const row = this.db.prepare('SELECT * FROM websites WHERE domain = ?').get(domain) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      domain: String(row.domain),
      platform: row.platform as WebsiteRecord['platform'],
      latestCrawlId: String(row.latest_crawl_id),
      settingsJson: String(row.settings_json),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  public listWebsites(): WebsiteRecord[] {
    const rows = this.db.prepare('SELECT * FROM websites ORDER BY updated_at DESC').all() as Record<string, unknown>[];
    return rows.map((row) => ({
      domain: String(row.domain),
      platform: row.platform as WebsiteRecord['platform'],
      latestCrawlId: String(row.latest_crawl_id),
      settingsJson: String(row.settings_json),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  public upsertCrawl(record: CrawlRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO crawls (
        crawl_id, domain, platform, start_time, end_time, budget_json, status, max_level, coverage_json, robots_txt_raw, crawl_delay_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(crawl_id) DO UPDATE SET
        platform = excluded.platform,
        end_time = excluded.end_time,
        budget_json = excluded.budget_json,
        status = excluded.status,
        max_level = excluded.max_level,
        coverage_json = excluded.coverage_json,
        robots_txt_raw = excluded.robots_txt_raw,
        crawl_delay_ms = excluded.crawl_delay_ms
    `);
    stmt.run(
      record.crawlId,
      record.domain,
      record.platform,
      record.startTime,
      record.endTime,
      record.budgetJson,
      record.status,
      record.maxLevel,
      JSON.stringify(record.coverage),
      record.robotsTxtRaw,
      record.crawlDelayMs
    );
  }

  public getCrawl(crawlId: string): CrawlRecord | null {
    const row = this.db.prepare('SELECT * FROM crawls WHERE crawl_id = ?').get(crawlId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapCrawlRow(row);
  }

  public getLatestCrawlForDomain(domain: string): CrawlRecord | null {
    const row = this.db
      .prepare('SELECT * FROM crawls WHERE domain = ? ORDER BY start_time DESC LIMIT 1')
      .get(domain) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapCrawlRow(row);
  }

  public listCrawls(domain?: string): CrawlRecord[] {
    const rows = (
      domain
        ? this.db.prepare('SELECT * FROM crawls WHERE domain = ? ORDER BY start_time DESC').all(domain)
        : this.db.prepare('SELECT * FROM crawls ORDER BY start_time DESC').all()
    ) as Record<string, unknown>[];
    return rows.map((r) => this.mapCrawlRow(r));
  }

  private mapCrawlRow(row: Record<string, unknown>): CrawlRecord {
    return {
      crawlId: String(row.crawl_id),
      domain: String(row.domain),
      platform: row.platform as CrawlRecord['platform'],
      startTime: String(row.start_time),
      endTime: row.end_time ? String(row.end_time) : null,
      budgetJson: String(row.budget_json),
      status: row.status as CrawlRecord['status'],
      maxLevel: row.max_level as CrawlRecord['maxLevel'],
      coverage: JSON.parse(String(row.coverage_json)) as CoverageCounters,
      robotsTxtRaw: row.robots_txt_raw ? String(row.robots_txt_raw) : null,
      crawlDelayMs: Number(row.crawl_delay_ms ?? 250),
    };
  }

  public saveHtmlSnapshot(crawlId: string, normalizedUrl: string, html: string, retentionDays = 30): void {
    const compressed = gzipSync(Buffer.from(html, 'utf-8'));
    const now = new Date();
    const expires = new Date(now.getTime() + retentionDays * 86400 * 1000);
    const stmt = this.db.prepare(`
      INSERT INTO html_snapshots (crawl_id, normalized_url, compressed_html, extracted_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(crawl_id, normalized_url) DO UPDATE SET
        compressed_html = excluded.compressed_html,
        extracted_at = excluded.extracted_at,
        expires_at = excluded.expires_at
    `);
    stmt.run(crawlId, normalizedUrl, compressed, now.toISOString(), expires.toISOString());
  }

  public getHtmlSnapshot(crawlId: string, normalizedUrl: string): string | null {
    const row = this.db
      .prepare('SELECT compressed_html FROM html_snapshots WHERE crawl_id = ? AND normalized_url = ?')
      .get(crawlId, normalizedUrl) as { compressed_html: Uint8Array } | undefined;
    if (!row) return null;
    return gunzipSync(Buffer.from(row.compressed_html)).toString('utf-8');
  }

  public purgeExpiredSnapshots(nowIso = new Date().toISOString()): number {
    const res = this.db.prepare('DELETE FROM html_snapshots WHERE expires_at < ?').run(nowIso);
    return Number(res.changes ?? 0);
  }

  public upsertPage(p: PageRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO pages (
        page_id, crawl_id, source_url, normalized_url, page_type, classification_confidence,
        classification_signals_json, template_id, status, redirect_destination, redirect_chain_json,
        discovery_source, sitemap_source, lastmod, parameters_json, canonical_url, normalized_canonical_url,
        title, meta_description, h1_list_json, h2_list_json, h3_to_h6_count, robots_meta, x_robots_tag,
        is_noindex, is_nofollow, visible_text, word_count, content_length, response_headers_json,
        content_fingerprint, etag, last_modified_header, depth, inbound_link_count, outbound_link_count,
        in_sitemap, in_nav, extraction_method, original_value_json, normalized_value_json, confidence, extracted_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(page_id) DO UPDATE SET
        page_type = excluded.page_type,
        classification_confidence = excluded.classification_confidence,
        classification_signals_json = excluded.classification_signals_json,
        template_id = excluded.template_id,
        status = excluded.status,
        redirect_destination = excluded.redirect_destination,
        redirect_chain_json = excluded.redirect_chain_json,
        sitemap_source = COALESCE(excluded.sitemap_source, pages.sitemap_source),
        lastmod = COALESCE(excluded.lastmod, pages.lastmod),
        parameters_json = excluded.parameters_json,
        canonical_url = excluded.canonical_url,
        normalized_canonical_url = excluded.normalized_canonical_url,
        title = excluded.title,
        meta_description = excluded.meta_description,
        h1_list_json = excluded.h1_list_json,
        h2_list_json = excluded.h2_list_json,
        h3_to_h6_count = excluded.h3_to_h6_count,
        robots_meta = excluded.robots_meta,
        x_robots_tag = excluded.x_robots_tag,
        is_noindex = excluded.is_noindex,
        is_nofollow = excluded.is_nofollow,
        visible_text = excluded.visible_text,
        word_count = excluded.word_count,
        content_length = excluded.content_length,
        response_headers_json = excluded.response_headers_json,
        content_fingerprint = excluded.content_fingerprint,
        etag = excluded.etag,
        last_modified_header = excluded.last_modified_header,
        depth = excluded.depth,
        inbound_link_count = excluded.inbound_link_count,
        outbound_link_count = excluded.outbound_link_count,
        in_sitemap = MAX(pages.in_sitemap, excluded.in_sitemap),
        in_nav = MAX(pages.in_nav, excluded.in_nav),
        extraction_method = excluded.extraction_method,
        original_value_json = excluded.original_value_json,
        normalized_value_json = excluded.normalized_value_json,
        confidence = excluded.confidence,
        extracted_at = excluded.extracted_at
    `);
    stmt.run(
      p.pageId,
      p.crawlId,
      p.sourceUrl,
      p.normalizedUrl,
      p.pageType,
      p.classificationConfidence,
      JSON.stringify(p.classificationSignals),
      p.templateId,
      p.status,
      p.redirectDestination,
      JSON.stringify(p.redirectChain),
      p.discoverySource,
      p.sitemapSource,
      p.lastmod,
      JSON.stringify(p.parameters),
      p.canonicalUrl,
      p.normalizedCanonicalUrl,
      p.title,
      p.metaDescription,
      JSON.stringify(p.h1List),
      JSON.stringify(p.h2List),
      p.h3ToH6Count,
      p.robotsMeta,
      p.xRobotsTag,
      p.isNoindex ? 1 : 0,
      p.isNofollow ? 1 : 0,
      p.visibleText,
      p.wordCount,
      p.contentLength,
      JSON.stringify(p.responseHeaders),
      p.contentFingerprint,
      p.etag,
      p.lastModifiedHeader,
      p.depth,
      p.inboundLinkCount,
      p.outboundLinkCount,
      p.inSitemap ? 1 : 0,
      p.inNav ? 1 : 0,
      p.extractionMethod,
      p.originalValueJson,
      p.normalizedValueJson,
      p.confidence,
      p.extractedAt
    );
  }

  public getPages(crawlId: string): PageRecord[] {
    const rows = this.db.prepare('SELECT * FROM pages WHERE crawl_id = ? ORDER BY depth ASC, normalized_url ASC').all(crawlId) as Record<string, unknown>[];
    return rows.map((row) => ({
      pageId: String(row.page_id),
      crawlId: String(row.crawl_id),
      sourceUrl: String(row.source_url),
      normalizedUrl: String(row.normalized_url),
      pageType: row.page_type as PageRecord['pageType'],
      classificationConfidence: Number(row.classification_confidence),
      classificationSignals: JSON.parse(String(row.classification_signals_json)),
      templateId: String(row.template_id),
      status: Number(row.status),
      redirectDestination: row.redirect_destination ? String(row.redirect_destination) : null,
      redirectChain: JSON.parse(String(row.redirect_chain_json)),
      discoverySource: row.discovery_source as PageRecord['discoverySource'],
      sitemapSource: row.sitemap_source ? String(row.sitemap_source) : null,
      lastmod: row.lastmod ? String(row.lastmod) : null,
      parameters: JSON.parse(String(row.parameters_json)),
      canonicalUrl: row.canonical_url ? String(row.canonical_url) : null,
      normalizedCanonicalUrl: row.normalized_canonical_url ? String(row.normalized_canonical_url) : null,
      title: row.title !== null && row.title !== undefined ? String(row.title) : null,
      metaDescription: row.meta_description !== null && row.meta_description !== undefined ? String(row.meta_description) : null,
      h1List: JSON.parse(String(row.h1_list_json)),
      h2List: JSON.parse(String(row.h2_list_json)),
      h3ToH6Count: Number(row.h3_to_h6_count),
      robotsMeta: row.robots_meta ? String(row.robots_meta) : null,
      xRobotsTag: row.x_robots_tag ? String(row.x_robots_tag) : null,
      isNoindex: Boolean(row.is_noindex),
      isNofollow: Boolean(row.is_nofollow),
      visibleText: String(row.visible_text),
      wordCount: Number(row.word_count),
      contentLength: Number(row.content_length),
      responseHeaders: JSON.parse(String(row.response_headers_json)),
      contentFingerprint: row.content_fingerprint ? String(row.content_fingerprint) : null,
      etag: row.etag ? String(row.etag) : null,
      lastModifiedHeader: row.last_modified_header ? String(row.last_modified_header) : null,
      depth: Number(row.depth),
      inboundLinkCount: Number(row.inbound_link_count),
      outboundLinkCount: Number(row.outbound_link_count),
      inSitemap: Boolean(row.in_sitemap),
      inNav: Boolean(row.in_nav),
      extractionMethod: row.extraction_method as PageRecord['extractionMethod'],
      originalValueJson: String(row.original_value_json),
      normalizedValueJson: String(row.normalized_value_json),
      confidence: Number(row.confidence),
      extractedAt: String(row.extracted_at),
    }));
  }

  public upsertSitemap(s: SitemapRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO sitemaps (
        sitemap_id, crawl_id, source_url, is_index, declared_pages_count, declared_urls_json,
        lastmod, status, error_url_count, redirect_url_count, extraction_method, confidence, extracted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sitemap_id) DO UPDATE SET
        is_index = excluded.is_index,
        declared_pages_count = excluded.declared_pages_count,
        declared_urls_json = excluded.declared_urls_json,
        lastmod = excluded.lastmod,
        status = excluded.status,
        error_url_count = excluded.error_url_count,
        redirect_url_count = excluded.redirect_url_count,
        confidence = excluded.confidence,
        extracted_at = excluded.extracted_at
    `);
    stmt.run(
      s.sitemapId,
      s.crawlId,
      s.sourceUrl,
      s.isIndex ? 1 : 0,
      s.declaredPagesCount,
      JSON.stringify(s.declaredUrls),
      s.lastmod,
      s.status,
      s.errorUrlCount,
      s.redirectUrlCount,
      s.extractionMethod,
      s.confidence,
      s.extractedAt
    );
  }

  public getSitemaps(crawlId: string): SitemapRecord[] {
    const rows = this.db.prepare('SELECT * FROM sitemaps WHERE crawl_id = ?').all(crawlId) as Record<string, unknown>[];
    return rows.map((r) => ({
      sitemapId: String(r.sitemap_id),
      crawlId: String(r.crawl_id),
      sourceUrl: String(r.source_url),
      isIndex: Boolean(r.is_index),
      declaredPagesCount: Number(r.declared_pages_count),
      declaredUrls: JSON.parse(String(r.declared_urls_json)),
      lastmod: r.lastmod ? String(r.lastmod) : null,
      status: Number(r.status),
      errorUrlCount: Number(r.error_url_count),
      redirectUrlCount: Number(r.redirect_url_count),
      extractionMethod: r.extraction_method as SitemapRecord['extractionMethod'],
      confidence: Number(r.confidence),
      extractedAt: String(r.extracted_at),
    }));
  }

  public upsertProduct(p: ProductRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO products (
        product_id, crawl_id, source_url, normalized_url, title, sku, brand, price, original_price,
        currency, discount_percentage, availability, description_text, description_word_count,
        specs_count, specs_json, image_count, images_with_alt_count, has_product_schema,
        has_offer_schema, has_aggregate_rating_schema, has_reviews, review_count, rating_value,
        related_products_count, variant_count, has_bundle_or_subscription, category_name, template_id,
        completeness_score, missing_fields_json, extraction_method, original_value_json, normalized_value_json,
        confidence, extracted_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(product_id) DO UPDATE SET
        title = excluded.title,
        sku = COALESCE(excluded.sku, products.sku),
        brand = COALESCE(excluded.brand, products.brand),
        price = COALESCE(excluded.price, products.price),
        original_price = COALESCE(excluded.original_price, products.original_price),
        currency = COALESCE(excluded.currency, products.currency),
        discount_percentage = COALESCE(excluded.discount_percentage, products.discount_percentage),
        availability = excluded.availability,
        description_text = excluded.description_text,
        description_word_count = excluded.description_word_count,
        specs_count = excluded.specs_count,
        specs_json = excluded.specs_json,
        image_count = excluded.image_count,
        images_with_alt_count = excluded.images_with_alt_count,
        has_product_schema = excluded.has_product_schema,
        has_offer_schema = excluded.has_offer_schema,
        has_aggregate_rating_schema = excluded.has_aggregate_rating_schema,
        has_reviews = excluded.has_reviews,
        review_count = excluded.review_count,
        rating_value = excluded.rating_value,
        related_products_count = excluded.related_products_count,
        variant_count = excluded.variant_count,
        has_bundle_or_subscription = excluded.has_bundle_or_subscription,
        category_name = COALESCE(excluded.category_name, products.category_name),
        template_id = excluded.template_id,
        completeness_score = excluded.completeness_score,
        missing_fields_json = excluded.missing_fields_json,
        extraction_method = excluded.extraction_method,
        original_value_json = excluded.original_value_json,
        normalized_value_json = excluded.normalized_value_json,
        confidence = excluded.confidence,
        extracted_at = excluded.extracted_at
    `);
    stmt.run(
      p.productId,
      p.crawlId,
      p.sourceUrl,
      p.normalizedUrl,
      p.title,
      p.sku,
      p.brand,
      p.price,
      p.originalPrice,
      p.currency,
      p.discountPercentage,
      p.availability,
      p.descriptionText,
      p.descriptionWordCount,
      p.specsCount,
      JSON.stringify(p.specs),
      p.imageCount,
      p.imagesWithAltCount,
      p.hasProductSchema ? 1 : 0,
      p.hasOfferSchema ? 1 : 0,
      p.hasAggregateRatingSchema ? 1 : 0,
      p.hasReviews ? 1 : 0,
      p.reviewCount,
      p.ratingValue,
      p.relatedProductsCount,
      p.variantCount,
      p.hasBundleOrSubscription ? 1 : 0,
      p.categoryName,
      p.templateId,
      p.completenessScore,
      JSON.stringify(p.missingFields),
      p.extractionMethod,
      p.originalValueJson,
      p.normalizedValueJson,
      p.confidence,
      p.extractedAt
    );
  }

  public getProducts(crawlId: string): ProductRecord[] {
    const rows = this.db.prepare('SELECT * FROM products WHERE crawl_id = ? ORDER BY completeness_score ASC').all(crawlId) as Record<string, unknown>[];
    return rows.map((r) => ({
      productId: String(r.product_id),
      crawlId: String(r.crawl_id),
      sourceUrl: String(r.source_url),
      normalizedUrl: String(r.normalized_url),
      title: String(r.title),
      sku: r.sku ? String(r.sku) : null,
      brand: r.brand ? String(r.brand) : null,
      price: r.price !== null && r.price !== undefined ? Number(r.price) : null,
      originalPrice: r.original_price !== null && r.original_price !== undefined ? Number(r.original_price) : null,
      currency: r.currency ? String(r.currency) : null,
      discountPercentage: r.discount_percentage !== null && r.discount_percentage !== undefined ? Number(r.discount_percentage) : null,
      availability: r.availability as ProductRecord['availability'],
      descriptionText: String(r.description_text),
      descriptionWordCount: Number(r.description_word_count),
      specsCount: Number(r.specs_count),
      specs: JSON.parse(String(r.specs_json)),
      imageCount: Number(r.image_count),
      imagesWithAltCount: Number(r.images_with_alt_count),
      hasProductSchema: Boolean(r.has_product_schema),
      hasOfferSchema: Boolean(r.has_offer_schema),
      hasAggregateRatingSchema: Boolean(r.has_aggregate_rating_schema),
      hasReviews: Boolean(r.has_reviews),
      reviewCount: Number(r.review_count),
      ratingValue: r.rating_value !== null && r.rating_value !== undefined ? Number(r.rating_value) : null,
      relatedProductsCount: Number(r.related_products_count),
      variantCount: Number(r.variant_count),
      hasBundleOrSubscription: Boolean(r.has_bundle_or_subscription),
      categoryName: r.category_name ? String(r.category_name) : null,
      templateId: String(r.template_id),
      completenessScore: Number(r.completeness_score),
      missingFields: JSON.parse(String(r.missing_fields_json)),
      extractionMethod: r.extraction_method as ProductRecord['extractionMethod'],
      originalValueJson: String(r.original_value_json),
      normalizedValueJson: String(r.normalized_value_json),
      confidence: Number(r.confidence),
      extractedAt: String(r.extracted_at),
    }));
  }

  public upsertVariant(v: VariantRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO variants (
        variant_id, crawl_id, product_id, source_url, title, sku, attributes_json, price, available,
        extraction_method, original_value_json, normalized_value_json, confidence, extracted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(variant_id) DO UPDATE SET
        title = excluded.title,
        sku = excluded.sku,
        attributes_json = excluded.attributes_json,
        price = excluded.price,
        available = excluded.available,
        extraction_method = excluded.extraction_method,
        extracted_at = excluded.extracted_at
    `);
    stmt.run(
      v.variantId,
      v.crawlId,
      v.productId,
      v.sourceUrl,
      v.title,
      v.sku,
      JSON.stringify(v.attributes),
      v.price,
      v.available ? 1 : 0,
      v.extractionMethod,
      v.originalValueJson,
      v.normalizedValueJson,
      v.confidence,
      v.extractedAt
    );
  }

  public getVariants(crawlId: string): VariantRecord[] {
    const rows = this.db.prepare('SELECT * FROM variants WHERE crawl_id = ?').all(crawlId) as Record<string, unknown>[];
    return rows.map((r) => ({
      variantId: String(r.variant_id),
      crawlId: String(r.crawl_id),
      productId: String(r.product_id),
      sourceUrl: String(r.source_url),
      title: String(r.title),
      sku: r.sku ? String(r.sku) : null,
      attributes: JSON.parse(String(r.attributes_json)),
      price: r.price !== null && r.price !== undefined ? Number(r.price) : null,
      available: Boolean(r.available),
      extractionMethod: r.extraction_method as VariantRecord['extractionMethod'],
      originalValueJson: String(r.original_value_json),
      normalizedValueJson: String(r.normalized_value_json),
      confidence: Number(r.confidence),
      extractedAt: String(r.extracted_at),
    }));
  }

  public upsertCollection(c: CollectionRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO collections (
        collection_id, crawl_id, source_url, normalized_url, name, parent_category, hierarchy_path_json,
        description_text, description_word_count, product_count, has_intro_content, has_meta_title,
        has_meta_description, has_h1, has_filters, filter_facets_json, has_sorting, pagination_type,
        canonical_url, inbound_link_count, template_id, completeness_score, extraction_method,
        original_value_json, normalized_value_json, confidence, extracted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(collection_id) DO UPDATE SET
        name = excluded.name,
        parent_category = excluded.parent_category,
        hierarchy_path_json = excluded.hierarchy_path_json,
        description_text = excluded.description_text,
        description_word_count = excluded.description_word_count,
        product_count = excluded.product_count,
        has_intro_content = excluded.has_intro_content,
        has_meta_title = excluded.has_meta_title,
        has_meta_description = excluded.has_meta_description,
        has_h1 = excluded.has_h1,
        has_filters = excluded.has_filters,
        filter_facets_json = excluded.filter_facets_json,
        has_sorting = excluded.has_sorting,
        pagination_type = excluded.pagination_type,
        canonical_url = excluded.canonical_url,
        inbound_link_count = excluded.inbound_link_count,
        template_id = excluded.template_id,
        completeness_score = excluded.completeness_score,
        extraction_method = excluded.extraction_method,
        extracted_at = excluded.extracted_at
    `);
    stmt.run(
      c.collectionId,
      c.crawlId,
      c.sourceUrl,
      c.normalizedUrl,
      c.name,
      c.parentCategory,
      JSON.stringify(c.hierarchyPath),
      c.descriptionText,
      c.descriptionWordCount,
      c.productCount,
      c.hasIntroContent ? 1 : 0,
      c.hasMetaTitle ? 1 : 0,
      c.hasMetaDescription ? 1 : 0,
      c.hasH1 ? 1 : 0,
      c.hasFilters ? 1 : 0,
      JSON.stringify(c.filterFacets),
      c.hasSorting ? 1 : 0,
      c.paginationType,
      c.canonicalUrl,
      c.inboundLinkCount,
      c.templateId,
      c.completenessScore,
      c.extractionMethod,
      c.originalValueJson,
      c.normalizedValueJson,
      c.confidence,
      c.extractedAt
    );
  }

  public getCollections(crawlId: string): CollectionRecord[] {
    const rows = this.db.prepare('SELECT * FROM collections WHERE crawl_id = ? ORDER BY completeness_score ASC').all(crawlId) as Record<string, unknown>[];
    return rows.map((r) => ({
      collectionId: String(r.collection_id),
      crawlId: String(r.crawl_id),
      sourceUrl: String(r.source_url),
      normalizedUrl: String(r.normalized_url),
      name: String(r.name),
      parentCategory: r.parent_category ? String(r.parent_category) : null,
      hierarchyPath: JSON.parse(String(r.hierarchy_path_json)),
      descriptionText: String(r.description_text),
      descriptionWordCount: Number(r.description_word_count),
      productCount: Number(r.product_count),
      hasIntroContent: Boolean(r.has_intro_content),
      hasMetaTitle: Boolean(r.has_meta_title),
      hasMetaDescription: Boolean(r.has_meta_description),
      hasH1: Boolean(r.has_h1),
      hasFilters: Boolean(r.has_filters),
      filterFacets: JSON.parse(String(r.filter_facets_json)),
      hasSorting: Boolean(r.has_sorting),
      paginationType: r.pagination_type as CollectionRecord['paginationType'],
      canonicalUrl: r.canonical_url ? String(r.canonical_url) : null,
      inboundLinkCount: Number(r.inbound_link_count),
      templateId: String(r.template_id),
      completenessScore: Number(r.completeness_score),
      extractionMethod: r.extraction_method as CollectionRecord['extractionMethod'],
      originalValueJson: String(r.original_value_json),
      normalizedValueJson: String(r.normalized_value_json),
      confidence: Number(r.confidence),
      extractedAt: String(r.extracted_at),
    }));
  }

  public upsertContent(c: ContentRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO contents (
        content_id, crawl_id, source_url, normalized_url, title, author, published_date, modified_date,
        word_count, h2_count, has_meta_description, has_article_schema, category_topic, extracted_keywords_json,
        product_links_json, category_links_json, article_links_json, inbound_link_count, freshness_days,
        extraction_method, original_value_json, normalized_value_json, confidence, extracted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(content_id) DO UPDATE SET
        title = excluded.title,
        author = excluded.author,
        published_date = excluded.published_date,
        modified_date = excluded.modified_date,
        word_count = excluded.word_count,
        h2_count = excluded.h2_count,
        has_meta_description = excluded.has_meta_description,
        has_article_schema = excluded.has_article_schema,
        category_topic = excluded.category_topic,
        extracted_keywords_json = excluded.extracted_keywords_json,
        product_links_json = excluded.product_links_json,
        category_links_json = excluded.category_links_json,
        article_links_json = excluded.article_links_json,
        inbound_link_count = excluded.inbound_link_count,
        freshness_days = excluded.freshness_days,
        extraction_method = excluded.extraction_method,
        extracted_at = excluded.extracted_at
    `);
    stmt.run(
      c.contentId,
      c.crawlId,
      c.sourceUrl,
      c.normalizedUrl,
      c.title,
      c.author,
      c.publishedDate,
      c.modifiedDate,
      c.wordCount,
      c.h2Count,
      c.hasMetaDescription ? 1 : 0,
      c.hasArticleSchema ? 1 : 0,
      c.categoryTopic,
      JSON.stringify(c.extractedKeywords),
      JSON.stringify(c.productLinks),
      JSON.stringify(c.categoryLinks),
      JSON.stringify(c.articleLinks),
      c.inboundLinkCount,
      c.freshnessDays,
      c.extractionMethod,
      c.originalValueJson,
      c.normalizedValueJson,
      c.confidence,
      c.extractedAt
    );
  }

  public getContents(crawlId: string): ContentRecord[] {
    const rows = this.db.prepare('SELECT * FROM contents WHERE crawl_id = ?').all(crawlId) as Record<string, unknown>[];
    return rows.map((r) => ({
      contentId: String(r.content_id),
      crawlId: String(r.crawl_id),
      sourceUrl: String(r.source_url),
      normalizedUrl: String(r.normalized_url),
      title: String(r.title),
      author: r.author ? String(r.author) : null,
      publishedDate: r.published_date ? String(r.published_date) : null,
      modifiedDate: r.modified_date ? String(r.modified_date) : null,
      wordCount: Number(r.word_count),
      h2Count: Number(r.h2_count),
      hasMetaDescription: Boolean(r.has_meta_description),
      hasArticleSchema: Boolean(r.has_article_schema),
      categoryTopic: String(r.category_topic),
      extractedKeywords: JSON.parse(String(r.extracted_keywords_json)),
      productLinks: JSON.parse(String(r.product_links_json)),
      categoryLinks: JSON.parse(String(r.category_links_json)),
      articleLinks: JSON.parse(String(r.article_links_json)),
      inboundLinkCount: Number(r.inbound_link_count),
      freshnessDays: r.freshness_days !== null && r.freshness_days !== undefined ? Number(r.freshness_days) : null,
      extractionMethod: r.extraction_method as ContentRecord['extractionMethod'],
      originalValueJson: String(r.original_value_json),
      normalizedValueJson: String(r.normalized_value_json),
      confidence: Number(r.confidence),
      extractedAt: String(r.extracted_at),
    }));
  }

  public insertLink(l: LinkRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO links (
        link_id, crawl_id, source_url, destination_url, destination_normalized_url, anchor_text,
        link_type, target_page_type, position, is_nofollow, is_broken, status_code, extraction_method,
        original_value_json, normalized_value_json, confidence, extracted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(link_id) DO UPDATE SET
        target_page_type = excluded.target_page_type,
        is_broken = excluded.is_broken,
        status_code = excluded.status_code
    `);
    stmt.run(
      l.linkId,
      l.crawlId,
      l.sourceUrl,
      l.destinationUrl,
      l.destinationNormalizedUrl,
      l.anchorText,
      l.linkType,
      l.targetPageType,
      l.position,
      l.isNofollow ? 1 : 0,
      l.isBroken ? 1 : 0,
      l.statusCode,
      l.extractionMethod,
      l.originalValueJson,
      l.normalizedValueJson,
      l.confidence,
      l.extractedAt
    );
  }

  public getLinks(crawlId: string): LinkRecord[] {
    const rows = this.db.prepare('SELECT * FROM links WHERE crawl_id = ?').all(crawlId) as Record<string, unknown>[];
    return rows.map((r) => ({
      linkId: String(r.link_id),
      crawlId: String(r.crawl_id),
      sourceUrl: String(r.source_url),
      destinationUrl: String(r.destination_url),
      destinationNormalizedUrl: String(r.destination_normalized_url),
      anchorText: String(r.anchor_text),
      linkType: r.link_type as LinkRecord['linkType'],
      targetPageType: r.target_page_type as LinkRecord['targetPageType'],
      position: r.position as LinkRecord['position'],
      isNofollow: Boolean(r.is_nofollow),
      isBroken: Boolean(r.is_broken),
      statusCode: r.status_code !== null && r.status_code !== undefined ? Number(r.status_code) : null,
      extractionMethod: r.extraction_method as LinkRecord['extractionMethod'],
      originalValueJson: String(r.original_value_json),
      normalizedValueJson: String(r.normalized_value_json),
      confidence: Number(r.confidence),
      extractedAt: String(r.extracted_at),
    }));
  }

  public insertImage(img: ImageRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO images (
        image_id, crawl_id, source_url, image_url, alt_text, has_alt, width, height, format,
        weight_bytes, is_lazy_loaded, extraction_method, original_value_json, normalized_value_json,
        confidence, extracted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(image_id) DO UPDATE SET
        alt_text = excluded.alt_text,
        has_alt = excluded.has_alt,
        weight_bytes = COALESCE(excluded.weight_bytes, images.weight_bytes)
    `);
    stmt.run(
      img.imageId,
      img.crawlId,
      img.sourceUrl,
      img.imageUrl,
      img.altText,
      img.hasAlt ? 1 : 0,
      img.width,
      img.height,
      img.format,
      img.weightBytes,
      img.isLazyLoaded ? 1 : 0,
      img.extractionMethod,
      img.originalValueJson,
      img.normalizedValueJson,
      img.confidence,
      img.extractedAt
    );
  }

  public getImages(crawlId: string): ImageRecord[] {
    const rows = this.db.prepare('SELECT * FROM images WHERE crawl_id = ?').all(crawlId) as Record<string, unknown>[];
    return rows.map((r) => ({
      imageId: String(r.image_id),
      crawlId: String(r.crawl_id),
      sourceUrl: String(r.source_url),
      imageUrl: String(r.image_url),
      altText: String(r.alt_text),
      hasAlt: Boolean(r.has_alt),
      width: r.width !== null && r.width !== undefined ? Number(r.width) : null,
      height: r.height !== null && r.height !== undefined ? Number(r.height) : null,
      format: String(r.format),
      weightBytes: r.weight_bytes !== null && r.weight_bytes !== undefined ? Number(r.weight_bytes) : null,
      isLazyLoaded: Boolean(r.is_lazy_loaded),
      extractionMethod: r.extraction_method as ImageRecord['extractionMethod'],
      originalValueJson: String(r.original_value_json),
      normalizedValueJson: String(r.normalized_value_json),
      confidence: Number(r.confidence),
      extractedAt: String(r.extracted_at),
    }));
  }

  public insertSchema(s: SchemaRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO schemas (
        schema_id, crawl_id, source_url, page_type, template_id, schema_type, format,
        raw_properties_json, normalized_properties_json, required_fields_present_json,
        required_fields_missing_json, recommended_fields_missing_json, is_valid,
        price_matches_visible, availability_matches_visible, extraction_method,
        original_value_json, normalized_value_json, confidence, extracted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(schema_id) DO UPDATE SET
        is_valid = excluded.is_valid,
        required_fields_missing_json = excluded.required_fields_missing_json,
        recommended_fields_missing_json = excluded.recommended_fields_missing_json
    `);
    stmt.run(
      s.schemaId,
      s.crawlId,
      s.sourceUrl,
      s.pageType,
      s.templateId,
      s.schemaType,
      s.format,
      JSON.stringify(s.rawProperties),
      JSON.stringify(s.normalizedProperties),
      JSON.stringify(s.requiredFieldsPresent),
      JSON.stringify(s.requiredFieldsMissing),
      JSON.stringify(s.recommendedFieldsMissing),
      s.isValid ? 1 : 0,
      s.priceMatchesVisible === null ? null : s.priceMatchesVisible ? 1 : 0,
      s.availabilityMatchesVisible === null ? null : s.availabilityMatchesVisible ? 1 : 0,
      s.extractionMethod,
      s.originalValueJson,
      s.normalizedValueJson,
      s.confidence,
      s.extractedAt
    );
  }

  public getSchemas(crawlId: string): SchemaRecord[] {
    const rows = this.db.prepare('SELECT * FROM schemas WHERE crawl_id = ?').all(crawlId) as Record<string, unknown>[];
    return rows.map((r) => ({
      schemaId: String(r.schema_id),
      crawlId: String(r.crawl_id),
      sourceUrl: String(r.source_url),
      pageType: r.page_type as SchemaRecord['pageType'],
      templateId: String(r.template_id),
      schemaType: String(r.schema_type),
      format: r.format as SchemaRecord['format'],
      rawProperties: JSON.parse(String(r.raw_properties_json)),
      normalizedProperties: JSON.parse(String(r.normalized_properties_json)),
      requiredFieldsPresent: JSON.parse(String(r.required_fields_present_json)),
      requiredFieldsMissing: JSON.parse(String(r.required_fields_missing_json)),
      recommendedFieldsMissing: JSON.parse(String(r.recommended_fields_missing_json)),
      isValid: Boolean(r.is_valid),
      priceMatchesVisible:
        r.price_matches_visible === null || r.price_matches_visible === undefined
          ? null
          : Boolean(r.price_matches_visible),
      availabilityMatchesVisible:
        r.availability_matches_visible === null || r.availability_matches_visible === undefined
          ? null
          : Boolean(r.availability_matches_visible),
      extractionMethod: r.extraction_method as SchemaRecord['extractionMethod'],
      originalValueJson: String(r.original_value_json),
      normalizedValueJson: String(r.normalized_value_json),
      confidence: Number(r.confidence),
      extractedAt: String(r.extracted_at),
    }));
  }

  public insertTechnology(t: TechnologyRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO technologies (
        tech_id, crawl_id, source_url, name, category, provider, script_url, signature_matched,
        is_third_party, extraction_method, original_value_json, normalized_value_json, confidence, extracted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tech_id) DO UPDATE SET
        confidence = excluded.confidence
    `);
    stmt.run(
      t.techId,
      t.crawlId,
      t.sourceUrl,
      t.name,
      t.category,
      t.provider,
      t.scriptUrl,
      t.signatureMatched,
      t.isThirdParty ? 1 : 0,
      t.extractionMethod,
      t.originalValueJson,
      t.normalizedValueJson,
      t.confidence,
      t.extractedAt
    );
  }

  public getTechnologies(crawlId: string): TechnologyRecord[] {
    const rows = this.db.prepare('SELECT * FROM technologies WHERE crawl_id = ?').all(crawlId) as Record<string, unknown>[];
    return rows.map((r) => ({
      techId: String(r.tech_id),
      crawlId: String(r.crawl_id),
      sourceUrl: String(r.source_url),
      name: String(r.name),
      category: r.category as TechnologyRecord['category'],
      provider: String(r.provider),
      scriptUrl: r.script_url ? String(r.script_url) : null,
      signatureMatched: String(r.signature_matched),
      isThirdParty: Boolean(r.is_third_party),
      extractionMethod: r.extraction_method as TechnologyRecord['extractionMethod'],
      originalValueJson: String(r.original_value_json),
      normalizedValueJson: String(r.normalized_value_json),
      confidence: Number(r.confidence),
      extractedAt: String(r.extracted_at),
    }));
  }

  public insertObservation(o: ObservationRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO observations (
        observation_id, crawl_id, source_url, template_id, page_type, category, metric,
        value_json, details_json, device, extraction_method, original_value_json,
        normalized_value_json, confidence, extracted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(observation_id) DO UPDATE SET
        value_json = excluded.value_json,
        details_json = excluded.details_json,
        extraction_method = excluded.extraction_method,
        confidence = excluded.confidence,
        extracted_at = excluded.extracted_at
    `);
    stmt.run(
      o.observationId,
      o.crawlId,
      o.sourceUrl,
      o.templateId,
      o.pageType,
      o.category,
      o.metric,
      JSON.stringify(o.value),
      JSON.stringify(o.details),
      o.device,
      o.extractionMethod,
      o.originalValueJson,
      o.normalizedValueJson,
      o.confidence,
      o.extractedAt
    );
  }

  public getObservations(crawlId: string, category?: ObservationRecord['category']): ObservationRecord[] {
    const rows = (
      category
        ? this.db.prepare('SELECT * FROM observations WHERE crawl_id = ? AND category = ?').all(crawlId, category)
        : this.db.prepare('SELECT * FROM observations WHERE crawl_id = ?').all(crawlId)
    ) as Record<string, unknown>[];
    return rows.map((r) => ({
      observationId: String(r.observation_id),
      crawlId: String(r.crawl_id),
      sourceUrl: String(r.source_url),
      templateId: String(r.template_id),
      pageType: r.page_type as ObservationRecord['pageType'],
      category: r.category as ObservationRecord['category'],
      metric: String(r.metric),
      value: JSON.parse(String(r.value_json)),
      details: JSON.parse(String(r.details_json)),
      device: r.device as ObservationRecord['device'],
      extractionMethod: r.extraction_method as ObservationRecord['extractionMethod'],
      originalValueJson: String(r.original_value_json),
      normalizedValueJson: String(r.normalized_value_json),
      confidence: Number(r.confidence),
      extractedAt: String(r.extracted_at),
    }));
  }

  public upsertFinding(f: FindingRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO findings (
        finding_id, crawl_id, rule_id, rule_version, tool_id, module, category, title,
        severity, impact_score, coverage_score, confidence_score, priority_score, priority_band,
        recommendation_text, evidence_summary, how_detected, inspected_count, affected_count,
        coverage_percentage, affected_urls_json, template_breakdown_json, extraction_method,
        original_value_json, normalized_value_json, confidence, extracted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(finding_id) DO UPDATE SET
        rule_version = excluded.rule_version,
        severity = excluded.severity,
        impact_score = excluded.impact_score,
        coverage_score = excluded.coverage_score,
        confidence_score = excluded.confidence_score,
        priority_score = excluded.priority_score,
        priority_band = excluded.priority_band,
        recommendation_text = excluded.recommendation_text,
        evidence_summary = excluded.evidence_summary,
        how_detected = excluded.how_detected,
        inspected_count = excluded.inspected_count,
        affected_count = excluded.affected_count,
        coverage_percentage = excluded.coverage_percentage,
        affected_urls_json = excluded.affected_urls_json,
        template_breakdown_json = excluded.template_breakdown_json,
        extracted_at = excluded.extracted_at
    `);
    stmt.run(
      f.findingId,
      f.crawlId,
      f.ruleId,
      f.ruleVersion,
      f.toolId,
      f.module,
      f.category,
      f.title,
      f.severity,
      f.impactScore,
      f.coverageScore,
      f.confidenceScore,
      f.priorityScore,
      f.priorityBand,
      f.recommendationText,
      f.evidenceSummary,
      f.howDetected,
      f.inspectedCount,
      f.affectedCount,
      f.coveragePercentage,
      JSON.stringify(f.affectedUrls),
      JSON.stringify(f.templateBreakdown),
      f.extractionMethod,
      f.originalValueJson,
      f.normalizedValueJson,
      f.confidence,
      f.extractedAt
    );
  }

  public clearFindingsForTool(crawlId: string, toolId: string): void {
    this.db.prepare('DELETE FROM findings WHERE crawl_id = ? AND tool_id = ?').run(crawlId, toolId);
  }

  public getFindings(crawlId: string, toolId?: string): FindingRecord[] {
    const rows = (
      toolId
        ? this.db
            .prepare('SELECT * FROM findings WHERE crawl_id = ? AND tool_id = ? ORDER BY priority_score DESC, severity DESC')
            .all(crawlId, toolId)
        : this.db
            .prepare('SELECT * FROM findings WHERE crawl_id = ? ORDER BY priority_score DESC, severity DESC')
            .all(crawlId)
    ) as Record<string, unknown>[];
    return rows.map((r) => ({
      findingId: String(r.finding_id),
      crawlId: String(r.crawl_id),
      ruleId: String(r.rule_id),
      ruleVersion: String(r.rule_version),
      toolId: String(r.tool_id),
      module: String(r.module),
      category: r.category as FindingRecord['category'],
      title: String(r.title),
      severity: Number(r.severity),
      impactScore: Number(r.impact_score),
      coverageScore: Number(r.coverage_score),
      confidenceScore: Number(r.confidence_score),
      priorityScore: Number(r.priority_score),
      priorityBand: r.priority_band as FindingRecord['priorityBand'],
      recommendationText: String(r.recommendation_text),
      evidenceSummary: String(r.evidence_summary),
      howDetected: String(r.how_detected),
      inspectedCount: Number(r.inspected_count),
      affectedCount: Number(r.affected_count),
      coveragePercentage: Number(r.coverage_percentage),
      affectedUrls: JSON.parse(String(r.affected_urls_json)),
      templateBreakdown: JSON.parse(String(r.template_breakdown_json)),
      extractionMethod: r.extraction_method as FindingRecord['extractionMethod'],
      originalValueJson: String(r.original_value_json),
      normalizedValueJson: String(r.normalized_value_json),
      confidence: Number(r.confidence),
      extractedAt: String(r.extracted_at),
    }));
  }

  public close(): void {
    this.db.close();
  }
}


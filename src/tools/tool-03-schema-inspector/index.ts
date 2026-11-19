import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SharedDatabase } from '../../db/database.ts';
import type { CrawlRecord, ToolManifest } from '../../types/entities.ts';
import type { StandaloneToolModule, ToolRunResult } from '../types.ts';
import { RulesEngine, loadRulesFromFile } from '../../engine/rules-engine.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest: ToolManifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'));
const rules = loadRulesFromFile(path.join(__dirname, 'rules.yaml'));

const EXPECTED_SCHEMAS_BY_PAGE_TYPE: Record<string, string[]> = {
  homepage: ['Organization', 'WebSite'],
  product: ['Product', 'Offer', 'AggregateRating', 'BreadcrumbList'],
  collection: ['BreadcrumbList'],
  category: ['BreadcrumbList'],
  blog: ['BlogPosting', 'Article', 'BreadcrumbList'],
};

export const tool03SchemaInspector: StandaloneToolModule = {
  manifest,
  rules,
  analyze(db: SharedDatabase, crawl: CrawlRecord, reusedExistingCrawl = false): ToolRunResult {
    const allOkPages = db.getPages(crawl.crawlId).filter((p) => p.status === 200);
    const htmlOkPages = allOkPages.filter(
      (p) => p.extractionMethod !== 'A' || p.title !== null || p.contentLength > 0
    );
    const pages = htmlOkPages.length > 0 ? htmlOkPages : allOkPages;
    const schemas = db.getSchemas(crawl.crawlId);
    const products = db.getProducts(crawl.crawlId);

    db.clearFindingsForTool(crawl.crawlId, manifest.toolId);
    const rulesEngine = new RulesEngine(db);
    const findings = rulesEngine.evaluateRules(crawl.crawlId, rules);

    const prodPages = pages.filter((p) => p.pageType === 'product');
    const prodUrlsWithSchema = new Set(schemas.filter((s) => s.schemaType === 'Product').map((s) => s.sourceUrl));
    const prodPagesWithSchema = prodPages.filter((p) => prodUrlsWithSchema.has(p.sourceUrl));
    const invalidOrPartialSchemas = schemas.filter(
      (s) => !s.isValid || s.requiredFieldsMissing.length > 0 || s.recommendedFieldsMissing.length > 0
    );
    const mismatchedSchemas = schemas.filter(
      (s) => s.priceMatchesVisible === false || s.availabilityMatchesVisible === false
    );

    const byTypeMap = new Map<
      string,
      { count: number; validCount: number; formats: Set<string>; templates: Set<string> }
    >();
    for (const s of schemas) {
      const curr = byTypeMap.get(s.schemaType) ?? {
        count: 0,
        validCount: 0,
        formats: new Set<string>(),
        templates: new Set<string>(),
      };
      curr.count++;
      if (s.isValid) curr.validCount++;
      curr.formats.add(s.format);
      curr.templates.add(s.templateId);
      byTypeMap.set(s.schemaType, curr);
    }

    // Expected schema coverage per page type
    const schemasByUrl = new Map<string, Set<string>>();
    for (const s of schemas) {
      const set = schemasByUrl.get(s.sourceUrl) ?? new Set<string>();
      set.add(s.schemaType);
      schemasByUrl.set(s.sourceUrl, set);
    }

    const expectedCoverageRows: Array<Record<string, unknown>> = [];
    for (const [pType, expectedTypes] of Object.entries(EXPECTED_SCHEMAS_BY_PAGE_TYPE)) {
      const pagesOfType = pages.filter((p) => p.pageType === pType);
      if (pagesOfType.length === 0) continue;
      for (const expType of expectedTypes) {
        const covered = pagesOfType.filter((p) => {
          const found = schemasByUrl.get(p.sourceUrl);
          if (!found) return false;
          if (expType === 'BlogPosting' || expType === 'Article') {
            return found.has('BlogPosting') || found.has('Article') || found.has('NewsArticle');
          }
          return found.has(expType);
        });
        expectedCoverageRows.push({
          pageType: pType,
          expectedSchemaType: expType,
          pagesInspected: pagesOfType.length,
          pagesWithSchema: covered.length,
          coveragePct: Number(((covered.length / pagesOfType.length) * 100).toFixed(1)),
          missingCount: pagesOfType.length - covered.length,
        });
      }
    }

    // Visible vs Schema Price/Availability Parity rows
    const prodByUrl = new Map(products.map((p) => [p.sourceUrl, p]));
    const parityRows = schemas
      .filter((s) => s.schemaType === 'Offer' || s.schemaType === 'Product')
      .map((s) => {
        const pr = prodByUrl.get(s.sourceUrl);
        const rawOffer =
          s.schemaType === 'Offer'
            ? s.rawProperties
            : (s.rawProperties.offers as Record<string, unknown> | undefined) ?? {};
        return {
          url: s.sourceUrl,
          templateId: s.templateId,
          schemaType: s.schemaType,
          schemaPrice: rawOffer?.price ?? '(missing)',
          visibleDomPrice: pr?.price ?? '(not detected)',
          priceMatchesVisible: s.priceMatchesVisible === null ? 'Not comparable' : String(s.priceMatchesVisible),
          schemaAvailability: rawOffer?.availability ?? '(missing)',
          visibleDomAvailability: pr?.availability ?? 'unknown',
          availabilityMatchesVisible:
            s.availabilityMatchesVisible === null ? 'Not comparable' : String(s.availabilityMatchesVisible),
        };
      });

    const classifiedPct =
      pages.length > 0
        ? Number(((pages.filter((p) => p.pageType !== 'unknown').length / pages.length) * 100).toFixed(1))
        : 100;

    return {
      manifest,
      crawl,
      reusedExistingCrawl,
      headlineMetrics: [
        {
          id: 'total_schemas',
          label: 'Structured Data Blocks',
          value: schemas.length,
          subtitle: `Across ${byTypeMap.size} distinct schema types`,
          affectedUrls: Array.from(new Set(schemas.map((s) => s.sourceUrl))),
          status: schemas.length > 0 ? 'good' : 'warning',
        },
        {
          id: 'product_schema_coverage',
          label: 'Product Schema Coverage',
          value: `${prodPagesWithSchema.length} / ${prodPages.length}`,
          subtitle: 'Product pages with @type Product',
          affectedUrls: prodPages.filter((p) => !prodUrlsWithSchema.has(p.sourceUrl)).map((p) => p.sourceUrl),
          status: prodPagesWithSchema.length === prodPages.length ? 'good' : 'critical',
        },
        {
          id: 'invalid_or_partial_schemas',
          label: 'Partial / Invalid Schemas',
          value: invalidOrPartialSchemas.length,
          subtitle: 'Missing required or recommended fields',
          affectedUrls: Array.from(new Set(invalidOrPartialSchemas.map((s) => s.sourceUrl))),
          status: invalidOrPartialSchemas.length > 0 ? 'warning' : 'good',
        },
        {
          id: 'price_avail_mismatches',
          label: 'DOM vs Schema Mismatches',
          value: mismatchedSchemas.length,
          subtitle: 'Price or stock state disagrees with visible page',
          affectedUrls: Array.from(new Set(mismatchedSchemas.map((s) => s.sourceUrl))),
          status: mismatchedSchemas.length > 0 ? 'critical' : 'good',
        },
      ],
      findings,
      tables: [
        {
          id: 'schema_type_coverage',
          title: '1. Schema Coverage by Type & Template',
          description: 'Inventory of extracted JSON-LD, Microdata, and RDFa types across templates.',
          rows: Array.from(byTypeMap.entries()).map(([schemaType, info]) => ({
            schemaType,
            totalInstances: info.count,
            validInstances: info.validCount,
            validityPct: Number(((info.validCount / info.count) * 100).toFixed(1)),
            formats: Array.from(info.formats).join(', '),
            templates: Array.from(info.templates).join(', '),
          })),
        },
        {
          id: 'expected_schema_per_page_type',
          title: '2. Expected vs. Detected Schema Coverage by Page Type',
          description: 'Checks expected rich-result schema types (Product, Offer, AggregateRating, BreadcrumbList, Organization, WebSite, Article) per page type.',
          rows: expectedCoverageRows,
        },
        {
          id: 'invalid_or_partial_schema',
          title: '3. Invalid or Partial Structured Data Blocks',
          description: 'Schema blocks missing required or recommended schema.org properties.',
          rows: invalidOrPartialSchemas.map((s) => ({
            sourceUrl: s.sourceUrl,
            templateId: s.templateId,
            schemaType: s.schemaType,
            format: s.format,
            isValid: s.isValid,
            requiredMissing: s.requiredFieldsMissing.join(', ') || '(none)',
            recommendedMissing: s.recommendedFieldsMissing.join(', ') || '(none)',
          })),
        },
        {
          id: 'schema_visible_parity_mismatches',
          title: '4. Schema vs. Visible Page Price & Availability Parity',
          description: 'Compares structured data Offer price and availability against visible DOM values.',
          rows: parityRows,
        },
        {
          id: 'schema_field_audit',
          title: '5. Complete Structured Data Inventory',
          description: 'Every extracted schema entity with required/recommended field completeness.',
          rows: schemas.map((s) => ({
            sourceUrl: s.sourceUrl,
            pageType: s.pageType,
            templateId: s.templateId,
            schemaType: s.schemaType,
            format: s.format,
            isValid: s.isValid,
            requiredPresent: s.requiredFieldsPresent.join(', '),
            requiredMissing: s.requiredFieldsMissing.join(', '),
            recommendedMissing: s.recommendedFieldsMissing.join(', '),
          })),
        },
      ],
      coveragePanel: {
        crawlId: crawl.crawlId,
        domain: crawl.domain,
        platform: crawl.platform,
        maxLevel: crawl.maxLevel,
        ...crawl.coverage,
        classifiedPercentage: classifiedPct,
        entityInspectedCount: schemas.length,
        entityName: 'structured data entities',
        notes: [
          `Inspected ${pages.length} 200 OK pages and extracted ${schemas.length} structured data entities (JSON-LD, Microdata, RDFa).`,
        ],
      },
      generatedAt: new Date().toISOString(),
    };
  },
};

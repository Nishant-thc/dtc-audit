import type { StandaloneToolModule } from './types.ts';
import { tool01SiteAtlas } from './tool-01-site-atlas/index.ts';
import { tool02MetadataAuditor } from './tool-02-metadata-auditor/index.ts';
import { tool03SchemaInspector } from './tool-03-schema-inspector/index.ts';
import { tool04CatalogueScanner } from './tool-04-catalogue-scanner/index.ts';
import { tool05PricePromoMapper } from './tool-05-price-promo-mapper/index.ts';
import { tool06CollectionGapFinder } from './tool-06-collection-gap-finder/index.ts';
import { tool07FacetedNavAuditor } from './tool-07-faceted-nav-auditor/index.ts';
import { tool08InternalLinkAnalyzer } from './tool-08-internal-link-analyzer/index.ts';
import { tool09BlogProductMapper } from './tool-09-blog-product-mapper/index.ts';
import { tool10ContentFreshnessTracker } from './tool-10-content-freshness-tracker/index.ts';
import { tool11ConversionAuditor } from './tool-11-conversion-auditor/index.ts';
import { tool12TechPerfInspector } from './tool-12-tech-perf-inspector/index.ts';
import { tool13OpportunityDashboard } from './tool-13-opportunity-dashboard/index.ts';
import { tool14CompetitorComparison } from './tool-14-competitor-comparison/index.ts';
import { tool15ChangeTracker } from './tool-15-change-tracker/index.ts';
import { tool16ImageAuditor } from './tool-16-image-auditor/index.ts';
import { tool17HreflangAuditor } from './tool-17-hreflang-auditor/index.ts';

export const TOOL_REGISTRY: StandaloneToolModule[] = [
  tool01SiteAtlas,
  tool02MetadataAuditor,
  tool03SchemaInspector,
  tool04CatalogueScanner,
  tool05PricePromoMapper,
  tool06CollectionGapFinder,
  tool07FacetedNavAuditor,
  tool08InternalLinkAnalyzer,
  tool09BlogProductMapper,
  tool10ContentFreshnessTracker,
  tool11ConversionAuditor,
  tool12TechPerfInspector,
  tool13OpportunityDashboard,
  tool14CompetitorComparison,
  tool15ChangeTracker,
  tool16ImageAuditor,
  tool17HreflangAuditor,
];

export function getToolBySlugOrId(key: string): StandaloneToolModule | undefined {
  return TOOL_REGISTRY.find((t) => t.manifest.slug === key || t.manifest.toolId === key);
}

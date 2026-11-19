import type { CustomFetcher } from '../../src/engine/fetch-queue.ts';

export function createMultiStoreMockFetcher(): CustomFetcher {
  const routes = new Map<string, { status: number; headers?: Record<string, string>; body: string }>();

  // ============================================================================
  // STORE 1: alpine-outdoor.example.com (Shopify Platform)
  // ============================================================================
  const shopifyOrigin = 'https://alpine-outdoor.example.com';

  routes.set(`${shopifyOrigin}/robots.txt`, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
    body: [
      'User-agent: *',
      'Disallow: /admin',
      'Disallow: /cart',
      'Disallow: /checkout',
      'Crawl-delay: 0.01',
      `Sitemap: ${shopifyOrigin}/sitemap.xml`,
    ].join('\n'),
  });

  routes.set(`${shopifyOrigin}/sitemap.xml`, {
    status: 200,
    headers: { 'content-type': 'application/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${shopifyOrigin}/sitemap_products_1.xml</loc><lastmod>2026-10-15</lastmod></sitemap>
  <sitemap><loc>${shopifyOrigin}/sitemap_collections_1.xml</loc><lastmod>2026-10-15</lastmod></sitemap>
  <sitemap><loc>${shopifyOrigin}/sitemap_blogs_1.xml</loc><lastmod>2026-10-15</lastmod></sitemap>
</sitemapindex>`,
  });

  routes.set(`${shopifyOrigin}/sitemap_products_1.xml`, {
    status: 200,
    headers: { 'content-type': 'application/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${shopifyOrigin}/products/insulated-jacket</loc><lastmod>2026-10-01</lastmod></url>
  <url><loc>${shopifyOrigin}/products/trail-boots</loc><lastmod>2026-10-02</lastmod></url>
  <url><loc>${shopifyOrigin}/products/old-jacket</loc><lastmod>2025-05-01</lastmod></url>
  <url><loc>${shopifyOrigin}/products/discontinued-gloves</loc><lastmod>2025-01-01</lastmod></url>
</urlset>`,
  });

  routes.set(`${shopifyOrigin}/sitemap_collections_1.xml`, {
    status: 200,
    headers: { 'content-type': 'application/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${shopifyOrigin}/collections/outerwear</loc><lastmod>2026-10-10</lastmod></url>
  <url><loc>${shopifyOrigin}/collections/footwear</loc><lastmod>2026-10-10</lastmod></url>
  <url><loc>${shopifyOrigin}/collections/outerwear?color=blue&amp;sort_by=price-ascending</loc><lastmod>2026-10-10</lastmod></url>
</urlset>`,
  });

  routes.set(`${shopifyOrigin}/sitemap_blogs_1.xml`, {
    status: 200,
    headers: { 'content-type': 'application/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${shopifyOrigin}/blogs/gear-guides/winter-layering-guide</loc><lastmod>2026-10-12</lastmod></url>
  <url><loc>${shopifyOrigin}/blogs/gear-guides/old-camping-checklist-2021</loc><lastmod>2021-03-10</lastmod></url>
</urlset>`,
  });

  routes.set(`${shopifyOrigin}/products.json?limit=50`, {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      products: [
        {
          handle: 'insulated-jacket',
          title: 'Alpine Pro Down Insulated Jacket',
          vendor: 'AlpineGear',
          product_type: 'Outerwear',
          body_html:
            '<p>Engineered for sub-zero expeditions with 800-fill hydrophobic down, ripstop recycled nylon shell, and helmet-compatible storm hood for alpine climbers.</p>',
          variants: [
            { title: 'Medium / Cobalt', sku: 'ALP-JKT-M', price: '249.00', compare_at_price: '299.00', available: true },
            { title: 'Large / Cobalt', sku: 'ALP-JKT-L', price: '249.00', compare_at_price: '299.00', available: true },
          ],
          images: [{ src: `${shopifyOrigin}/images/jacket-1.webp`, alt: 'Alpine Pro Down Jacket front view' }],
        },
        {
          handle: 'trail-boots',
          title: 'Summit Gore-Tex Trail Boots',
          vendor: 'AlpineGear',
          product_type: 'Footwear',
          body_html: '<p>Short description.</p>',
          variants: [{ title: 'US 10', sku: 'ALP-BT-10', price: '180.00', compare_at_price: null, available: false }],
          images: [{ src: `${shopifyOrigin}/images/boots-1.jpg`, alt: '' }],
        },
        {
          handle: 'ultralight-tent',
          title: 'CloudPeak 2P Ultralight Tent',
          vendor: 'AlpineGear',
          product_type: 'Shelters',
          body_html: '<p>Ultralight 2-person backpacking tent weighing just 980g with taped Dyneema seams and dual vestibules.</p>',
          variants: [{ title: '2-Person', sku: 'ALP-TNT-2P', price: '399.00', compare_at_price: '899.00', available: true }],
          images: [{ src: `${shopifyOrigin}/images/tent-1.webp`, alt: 'CloudPeak 2P Tent pitched on ridge' }],
        },
      ],
    }),
  });

  routes.set(`${shopifyOrigin}/`, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-shopify-stage': 'production',
      'content-encoding': 'gzip',
      'cache-control': 'public, max-age=3600',
    },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Alpine Outdoor — Technical Mountain Apparel &amp; Backcountry Gear</title>
  <meta name="description" content="Shop technical alpine jackets, waterproof trail boots, and ultralight tents with free shipping over $100 and lifetime mountain warranty." />
  <link rel="canonical" href="${shopifyOrigin}/" />
  <script src="https://cdn.shopify.com/s/files/1/0001/theme.js"></script>
  <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ALPINE"></script>
  <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
  <script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script>
  <script src="https://cdn.judge.me/widget_preloader.js"></script>
  <script src="https://config.gorgias.chat/gorgias-chat-bundle.js"></script>
  <script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "name": "Alpine Outdoor", "url": "${shopifyOrigin}/", "logo": "${shopifyOrigin}/logo.png" },
      { "@type": "WebSite", "name": "Alpine Outdoor", "url": "${shopifyOrigin}/" }
    ]
  }
  </script>
</head>
<body>
  <div class="announcement-bar">Free shipping on orders over $100 — Use code SUMMIT15 for 15% off!</div>
  <header class="site-header" style="position: sticky; top: 0;">
    <nav role="navigation">
      <a href="${shopifyOrigin}/collections/outerwear">Outerwear</a>
      <a href="${shopifyOrigin}/collections/footwear">Footwear</a>
      <a href="${shopifyOrigin}/blogs/gear-guides/winter-layering-guide">Gear Guides</a>
      <a href="${shopifyOrigin}/pages/shipping-returns">Shipping &amp; Returns</a>
      <a href="${shopifyOrigin}/cart">Cart</a>
    </nav>
    <input type="search" name="q" class="predictive-search" placeholder="Search gear..." />
  </header>
  <main>
    <h1>Built for the Highest Ridges</h1>
    <h2>Featured Expedition Gear</h2>
    <div class="product-grid">
      <a href="${shopifyOrigin}/products/insulated-jacket">Alpine Pro Down Insulated Jacket</a>
      <a href="${shopifyOrigin}/products/trail-boots">Summit Gore-Tex Trail Boots</a>
      <a href="${shopifyOrigin}/products/ultralight-tent">CloudPeak 2P Ultralight Tent</a>
      <a href="${shopifyOrigin}/products/discontinued-gloves">Discontinued Gloves</a>
    </div>
    <form action="/subscribe/newsletter"><input type="email" placeholder="Join expedition club" /><button type="submit">Subscribe</button></form>
  </main>
  <div id="CartDrawer" class="cart-drawer">Your bag</div>
  <footer class="site-footer">
    <a href="${shopifyOrigin}/pages/shipping-returns">Shipping Policy</a>
  </footer>
</body>
</html>`,
  });

  // Product 1: Complete, well-structured product with discount, specs, reviews, schema
  routes.set(`${shopifyOrigin}/products/insulated-jacket`, {
    status: 200,
    headers: { 'content-type': 'text/html', 'content-encoding': 'gzip', 'cache-control': 'max-age=600' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Alpine Pro Down Insulated Jacket | Alpine Outdoor</title>
  <meta name="description" content="Stay warm down to -25C in the Alpine Pro 800-fill hydrophobic down jacket. Ultralight ripstop shell, helmet hood, and lifetime alpine warranty." />
  <link rel="canonical" href="${shopifyOrigin}/products/insulated-jacket" />
  <script src="https://cdn.shopify.com/s/files/1/0001/theme.js"></script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Alpine Pro Down Insulated Jacket",
    "sku": "ALP-JKT-M",
    "description": "Engineered for sub-zero expeditions with 800-fill hydrophobic down, ripstop recycled nylon shell, and helmet-compatible storm hood for alpine climbers and mountaineers.",
    "image": ["${shopifyOrigin}/images/jacket-1.webp", "${shopifyOrigin}/images/jacket-2.webp"],
    "brand": { "@type": "Brand", "name": "AlpineGear" },
    "offers": {
      "@type": "Offer",
      "price": "249.00",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "url": "${shopifyOrigin}/products/insulated-jacket"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "reviewCount": "142"
    }
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Outerwear", "item": "${shopifyOrigin}/collections/outerwear" }
    ]
  }
  </script>
</head>
<body>
  <nav class="breadcrumb"><a href="${shopifyOrigin}/">Home</a> <a href="${shopifyOrigin}/collections/outerwear">Outerwear</a></nav>
  <h1>Alpine Pro Down Insulated Jacket</h1>
  <div class="price">$249.00</div>
  <div class="compare-at-price">$299.00</div>
  <div class="product-description">
    Engineered for sub-zero expeditions with 800-fill hydrophobic down, ripstop recycled nylon shell, and helmet-compatible storm hood for alpine climbers and backcountry skiers. Tested across winter ascents in Patagonia and Alaska with reinforced shoulders and two-way belay zipper.
  </div>
  <select name="id">
    <option value="1">Medium / Cobalt</option>
    <option value="2">Large / Cobalt</option>
  </select>
  <button type="submit" name="add" class="add-to-cart">Add to Cart — Subscribe &amp; Save 10%</button>
  <div class="trust-badges">Secure Checkout • Free Returns within 60 Days • Ships within 24 hours</div>
  <table class="product-specs">
    <tr><th>Fill Power</th><td>800-fill RDS Hydrophobic Goose Down</td></tr>
    <tr><th>Weight</th><td>410g (14.4 oz)</td></tr>
    <tr><th>Shell Fabric</th><td>20D Pertex Quantum Ripstop Nylon</td></tr>
  </table>
  <img src="${shopifyOrigin}/images/jacket-1.webp" alt="Alpine Pro Down Jacket front view" width="800" height="800" loading="lazy" />
  <img src="${shopifyOrigin}/images/jacket-2.webp" alt="Alpine Pro Down Jacket hood detail" width="800" height="800" loading="lazy" />
  <div id="reviews" class="jdgm-widget">4.8 stars from 142 verified buyer reviews</div>
  <div class="related-products"><a href="${shopifyOrigin}/products/trail-boots">Summit Gore-Tex Trail Boots</a></div>
</body>
</html>`,
  });

  // Product 2: Flawed product (duplicate title with tent, missing meta description, multiple H1s, schema price mismatch, out of stock, missing alt text, thin description, no specs, no reviews)
  routes.set(`${shopifyOrigin}/products/trail-boots`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Buy Gear Online</title>
  <link rel="canonical" href="${shopifyOrigin}/products/trail-boots" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Summit Gore-Tex Trail Boots",
    "offers": {
      "@type": "Offer",
      "price": "150.00"
    }
  }
  </script>
</head>
<body>
  <h1>Summit Gore-Tex Trail Boots</h1>
  <h1>Secondary H1 Tag Bug</h1>
  <div class="price">$180.00</div>
  <div class="product-description">Waterproof boots for hiking.</div>
  <button type="submit" class="add-to-cart">Sold Out — Out of Stock</button>
  <img src="${shopifyOrigin}/images/boots-1.jpg" width="1200" height="1200" />
</body>
</html>`,
  });

  // Product 3: Missing from sitemap, missing Product schema entirely, duplicate title "Buy Gear Online", extreme 56% discount, accidental noindex!
  routes.set(`${shopifyOrigin}/products/ultralight-tent`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Buy Gear Online</title>
  <meta name="description" content="Short desc" />
  <meta name="robots" content="noindex, follow" />
</head>
<body>
  <h1>CloudPeak 2P Ultralight Tent</h1>
  <div class="price">$399.00</div>
  <div class="compare-at-price">$899.00</div>
  <div class="product-description">Ultralight 2-person backpacking tent with dual doors.</div>
  <button type="submit" class="add-to-cart">Add to Cart</button>
  <img src="${shopifyOrigin}/images/tent-1.webp" alt="CloudPeak 2P Tent" loading="lazy" />
</body>
</html>`,
  });

  // Redirected product URL in sitemap
  routes.set(`${shopifyOrigin}/products/old-jacket`, {
    status: 301,
    headers: { location: `${shopifyOrigin}/products/insulated-jacket` },
    body: '',
  });

  // Broken 404 product URL in sitemap and homepage links
  routes.set(`${shopifyOrigin}/products/discontinued-gloves`, {
    status: 404,
    headers: { 'content-type': 'text/html' },
    body: '<html><head><title>404 Not Found</title></head><body>Page not found</body></html>',
  });

  // Collection 1: Complete collection with intro content, filters, sorting, pagination
  routes.set(`${shopifyOrigin}/collections/outerwear`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Men's &amp; Women's Alpine Outerwear Collection | Alpine Outdoor</title>
  <meta name="description" content="Explore our complete collection of hardshell jackets, 800-fill down parkas, and breathable midlayers built for high-altitude mountaineering." />
  <link rel="canonical" href="${shopifyOrigin}/collections/outerwear" />
</head>
<body>
  <h1>Alpine Outerwear</h1>
  <div class="collection-description">
    Discover technical outerwear engineered for extreme alpine weather, from lightweight windshells to expedition-grade down parkas and waterproof breathable Gore-Tex Pro shells.
  </div>
  <form class="facets">
    <span class="facets__summary">Color</span>
    <span class="facets__summary">Size</span>
    <span class="facets__summary">Insulation Type</span>
  </form>
  <select name="sort_by"><option value="best-selling">Best Selling</option></select>
  <div class="product-grid">
    <div class="product-card"><a href="${shopifyOrigin}/products/insulated-jacket">Alpine Pro Down Jacket</a></div>
    <div class="product-card"><a href="${shopifyOrigin}/products/trail-boots">Summit Boots</a></div>
    <div class="product-card"><a href="${shopifyOrigin}/products/ultralight-tent">CloudPeak Tent</a></div>
  </div>
  <nav class="pagination"><a href="${shopifyOrigin}/collections/outerwear?page=2">Page 2</a></nav>
</body>
</html>`,
  });

  // Collection 2: Thin category page (missing intro description, missing meta description, only 1 product)
  routes.set(`${shopifyOrigin}/collections/footwear`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Footwear | Alpine Outdoor</title>
  <link rel="canonical" href="${shopifyOrigin}/collections/footwear" />
</head>
<body>
  <h1>Footwear</h1>
  <div class="product-grid">
    <div class="product-card"><a href="${shopifyOrigin}/products/trail-boots">Summit Gore-Tex Trail Boots</a></div>
  </div>
</body>
</html>`,
  });

  // Filtered URL in sitemap without canonical back to base collection!
  routes.set(`${shopifyOrigin}/collections/outerwear?color=blue&sort_by=price-ascending`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Blue Outerwear Sorted by Price | Alpine Outdoor</title>
  <link rel="canonical" href="${shopifyOrigin}/collections/outerwear?color=blue&amp;sort_by=price-ascending" />
</head>
<body>
  <h1>Blue Outerwear</h1>
  <div class="product-grid">
    <div class="product-card"><a href="${shopifyOrigin}/products/insulated-jacket">Alpine Pro Down Jacket</a></div>
  </div>
</body>
</html>`,
  });

  // Blog 1: Fresh, complete article with Article schema and product + category links
  routes.set(`${shopifyOrigin}/blogs/gear-guides/winter-layering-guide`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>How to Layer for Winter Alpine Climbing | Alpine Outdoor</title>
  <meta name="description" content="Learn the 3-layer system for winter mountaineering: moisture-wicking base layers, active insulation, and stormproof shells." />
  <link rel="canonical" href="${shopifyOrigin}/blogs/gear-guides/winter-layering-guide" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "How to Layer for Winter Alpine Climbing",
    "datePublished": "2026-10-01",
    "dateModified": "2026-10-12",
    "author": { "@type": "Person", "name": "Elena Vance" }
  }
  </script>
</head>
<body>
  <article>
    <h1>How to Layer for Winter Alpine Climbing</h1>
    <h2>1. Moisture Management Base Layer</h2>
    <p>${'Merino wool and synthetic base layers regulate skin temperature during steep alpine approaches and high-output ice pitches. '.repeat(20)}</p>
    <h2>2. High-Loft Down Insulation</h2>
    <p>When stopping at cold belays, throw on the <a href="${shopifyOrigin}/products/insulated-jacket">Alpine Pro Down Insulated Jacket</a> from our <a href="${shopifyOrigin}/collections/outerwear">Alpine Outerwear</a> collection.</p>
  </article>
</body>
</html>`,
  });

  // Blog 2: Stale 2021 article with NO product links, NO Article schema, thin word count
  routes.set(`${shopifyOrigin}/blogs/gear-guides/old-camping-checklist-2021`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Summer Camping Checklist 2021</title>
  <meta property="article:published_time" content="2021-03-10" />
</head>
<body>
  <article>
    <h1>Summer Camping Checklist 2021</h1>
    <p>Don't forget a flashlight and water bottle when you go camping this weekend.</p>
  </article>
</body>
</html>`,
  });

  // Informational page
  routes.set(`${shopifyOrigin}/pages/shipping-returns`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Shipping &amp; Returns Policy | Alpine Outdoor</title>
  <meta name="description" content="Free standard shipping on orders over $100 and 60-day hassle-free returns on all unworn mountain gear." />
  <link rel="canonical" href="${shopifyOrigin}/pages/shipping-returns" />
</head>
<body>
  <h1>Shipping &amp; Returns Policy</h1>
  <p>We ship all orders within 24 hours with 60-day hassle-free returns.</p>
</body>
</html>`,
  });

  // ============================================================================
  // STORE 2: bistro-roasters.example.org (WooCommerce Platform)
  // ============================================================================
  const wooOrigin = 'https://bistro-roasters.example.org';

  routes.set(`${wooOrigin}/robots.txt`, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
    body: `User-agent: *\nDisallow: /wp-admin\nDisallow: /cart\nSitemap: ${wooOrigin}/sitemap.xml\n`,
  });

  routes.set(`${wooOrigin}/sitemap.xml`, {
    status: 200,
    headers: { 'content-type': 'application/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${wooOrigin}/</loc><lastmod>2026-10-20</lastmod></url>
  <url><loc>${wooOrigin}/product/ethiopian-yirgacheffe</loc><lastmod>2026-10-18</lastmod></url>
  <url><loc>${wooOrigin}/product/espresso-grinder</loc><lastmod>2026-10-18</lastmod></url>
  <url><loc>${wooOrigin}/product-category/single-origin</loc><lastmod>2026-10-18</lastmod></url>
  <url><loc>${wooOrigin}/blog/how-to-dial-in-espresso</loc><lastmod>2026-10-19</lastmod></url>
</urlset>`,
  });

  routes.set(`${wooOrigin}/wp-json/wc/store/v1/products?per_page=25`, {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([
      {
        name: 'Ethiopian Yirgacheffe Whole Bean',
        permalink: `${wooOrigin}/product/ethiopian-yirgacheffe`,
        sku: 'WOO-ETH-250',
        prices: { price: '2200', regular_price: '2600', currency_code: 'USD', currency_minor_unit: 2 },
        is_in_stock: true,
        description: 'Floral bergamot and jasmine notes roasted light for pour-over.',
        images: [{ src: `${wooOrigin}/uploads/ethiopian.webp`, alt: 'Ethiopian Yirgacheffe bag' }],
        categories: [{ name: 'Single Origin' }],
      },
      {
        name: 'Conical Burr Espresso Grinder',
        permalink: `${wooOrigin}/product/espresso-grinder`,
        sku: 'WOO-GRD-01',
        prices: { price: '19900', regular_price: '19900', currency_code: 'USD', currency_minor_unit: 2 },
        is_in_stock: false,
        description: 'Stepless 48mm stainless steel conical burrs.',
        images: [{ src: `${wooOrigin}/uploads/grinder.jpg`, alt: '' }],
        categories: [{ name: 'Brewing Gear' }],
      },
    ]),
  });

  routes.set(`${wooOrigin}/`, {
    status: 200,
    headers: { 'content-type': 'text/html', 'content-encoding': 'br', 'cache-control': 'max-age=1800' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Bistro Roasters — Specialty Single-Origin Coffee &amp; Espresso Gear</title>
  <meta name="description" content="Small-batch specialty coffee beans roasted daily and precision espresso grinders." />
  <link rel="canonical" href="${wooOrigin}/" />
  <link rel="stylesheet" href="${wooOrigin}/wp-content/plugins/woocommerce/assets/css/woocommerce.css" />
</head>
<body class="woocommerce">
  <header class="site-header">
    <nav>
      <a href="${wooOrigin}/product-category/single-origin">Single Origin</a>
      <a href="${wooOrigin}/blog/how-to-dial-in-espresso">Brew Guides</a>
    </nav>
  </header>
  <h1>Freshly Roasted Specialty Coffee</h1>
  <div class="products">
    <a href="${wooOrigin}/product/ethiopian-yirgacheffe">Ethiopian Yirgacheffe Whole Bean</a>
    <a href="${wooOrigin}/product/espresso-grinder">Conical Burr Espresso Grinder</a>
    <a href="${wooOrigin}/product-category/single-origin?min_price=15&amp;orderby=popularity">Popular Beans Over $15</a>
  </div>
</body>
</html>`,
  });

  routes.set(`${wooOrigin}/product/ethiopian-yirgacheffe`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Ethiopian Yirgacheffe Whole Bean | Bistro Roasters</title>
  <meta name="description" content="Washed heirloom Ethiopian Yirgacheffe coffee beans with jasmine, bergamot, and peach notes. Roasted to order." />
  <link rel="canonical" href="${wooOrigin}/product/ethiopian-yirgacheffe" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Ethiopian Yirgacheffe Whole Bean",
    "sku": "WOO-ETH-250",
    "brand": { "@type": "Brand", "name": "Bistro Roasters" },
    "description": "Washed heirloom Ethiopian Yirgacheffe coffee beans grown at 2,100 meters with bright bergamot, jasmine blossom, and stone fruit sweetness.",
    "image": "${wooOrigin}/uploads/ethiopian.webp",
    "offers": {
      "@type": "Offer",
      "price": "22.00",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "reviewCount": "85"
    }
  }
  </script>
</head>
<body class="woocommerce">
  <h1>Ethiopian Yirgacheffe Whole Bean</h1>
  <span class="woocommerce-Price-amount">$22.00</span>
  <del><span class="amount">$26.00</span></del>
  <div class="woocommerce-product-details__short-description">
    Washed heirloom Ethiopian Yirgacheffe coffee beans grown at 2,100 meters with bright bergamot, jasmine blossom, and stone fruit sweetness. Ideal for V60, Chemex, and AeroPress brewing methods.
  </div>
  <table class="shop_attributes">
    <tr><th>Origin</th><td>Yirgacheffe, Ethiopia</td></tr>
    <tr><th>Altitude</th><td>2,100m MASL</td></tr>
    <tr><th>Process</th><td>Washed</td></tr>
  </table>
  <button type="submit" class="add-to-cart">Add to cart — Subscribe &amp; Save</button>
  <div class="trust-badge">Free Shipping on orders over $40 • Guaranteed Fresh Roast</div>
  <img src="${wooOrigin}/uploads/ethiopian.webp" alt="Ethiopian Yirgacheffe coffee bag" loading="lazy" />
  <div id="reviews">85 reviews</div>
</body>
</html>`,
  });

  routes.set(`${wooOrigin}/product/espresso-grinder`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Conical Burr Espresso Grinder</title>
  <link rel="canonical" href="${wooOrigin}/product/espresso-grinder" />
</head>
<body class="woocommerce">
  <h1>Conical Burr Espresso Grinder</h1>
  <span class="woocommerce-Price-amount">$199.00</span>
  <div class="product-description">Precision burrs.</div>
  <button type="submit" class="add-to-cart">Out of Stock</button>
  <img src="${wooOrigin}/uploads/grinder.jpg" />
</body>
</html>`,
  });

  routes.set(`${wooOrigin}/product-category/single-origin`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Single Origin Coffee Beans | Bistro Roasters</title>
  <meta name="description" content="Explore traceable single-origin coffees from Ethiopia, Colombia, and Kenya." />
  <link rel="canonical" href="${wooOrigin}/product-category/single-origin" />
</head>
<body class="woocommerce">
  <h1>Single Origin Coffee Beans</h1>
  <div class="term-description">Traceable microlot coffees sourced directly from partner farms at high elevation and roasted in small batches every Tuesday.</div>
  <ul class="products">
    <li class="product"><a href="${wooOrigin}/product/ethiopian-yirgacheffe">Ethiopian Yirgacheffe</a></li>
  </ul>
</body>
</html>`,
  });

  routes.set(`${wooOrigin}/product-category/single-origin?min_price=15&orderby=popularity`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Single Origin Filtered</title>
</head>
<body class="woocommerce">
  <h1>Single Origin Coffee Beans</h1>
</body>
</html>`,
  });

  routes.set(`${wooOrigin}/blog/how-to-dial-in-espresso`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>How to Dial In Espresso in 5 Steps | Bistro Roasters</title>
  <meta name="description" content="Master dose, yield, grind size, and extraction time for balanced espresso shots." />
  <link rel="canonical" href="${wooOrigin}/blog/how-to-dial-in-espresso" />
</head>
<body>
  <article>
    <h1>How to Dial In Espresso in 5 Steps</h1>
    <p>Start with freshly roasted beans and a consistent grinder.</p>
  </article>
</body>
</html>`,
  });

  return async (url: string) => {
    const match = routes.get(url);
    if (match) {
      return {
        status: match.status,
        headers: match.headers ?? { 'content-type': 'text/html' },
        body: match.body,
      };
    }
    return {
      status: 404,
      headers: { 'content-type': 'text/html' },
      body: 'Not found',
    };
  };
}


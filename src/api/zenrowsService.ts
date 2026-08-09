/**
 * zenrowsService.ts
 *
 * This file is the core web-scraping service for the smartSHOP application.
 * It is responsible for fetching real-time product prices from e-commerce
 * websites (primarily Amazon and Flipkart) by routing requests through the
 * ZenRows proxy API, which bypasses bot-detection and anti-scraping measures
 * that these platforms employ against direct HTTP requests.
 *
 * How it works at a high level:
 *   1. A product page URL is passed in along with a ZenRows API key.
 *   2. The request is sent to ZenRows, which fetches the page on our behalf
 *      using rotating proxies and, when necessary, a headless browser for
 *      JavaScript-rendered content (e.g. Flipkart's single-page app).
 *   3. ZenRows returns the raw HTML of the fully rendered product page.
 *   4. The HTML is scanned with a series of regex patterns, ordered from most
 *      to least reliable, to extract the selling price in Indian Rupees (INR).
 *   5. The extracted price (or 0 on failure) is returned to the caller.
 *
 * Site-specific handling:
 *   - Amazon (.in / .com): Uses a premium proxy to defeat bot detection.
 *     JS rendering is deliberately DISABLED for Amazon because enabling it
 *     causes the site to serve a stripped-down page with no pricing data.
 *   - Flipkart: Uses JS rendering (headless browser) because Flipkart is a
 *     React single-page app and prices are injected by JavaScript at runtime.
 *   - Generic sites: Falls back to JSON-LD structured data or any rupee symbol
 *     found in the page markup.
 *
 * Public exports:
 *   - scrapeProductPrice          — fetch the INR price for a single product URL
 *   - resolveRedirectUrl          — follow redirect chains and return the final URL
 *   - scrapeAmazonAndFlipkartPrices — fetch both Amazon and Flipkart prices in parallel
 *
 * Prerequisites:
 *   - A valid ZenRows API key (free tier: 1,000 credits/month).
 *     Sign up at https://www.zenrows.com/
 */

// ZenRows Service - real-time price scraping & URL resolution
// ZenRows bypasses anti-bot protections on Amazon, Flipkart, etc.
// Get your free API key at: https://www.zenrows.com/ (1,000 credits/month free)

// The base endpoint for all ZenRows API requests.
// Every call appends query parameters to this URL.
const ZENROWS_URL = 'https://api.zenrows.com/v1/';

// ─── Core fetcher ────────────────────────────────────────────────────────────

// fetchWithZenRows is an internal helper that sends a target URL to the ZenRows
// proxy service and returns the rendered HTML of that page along with the final
// URL after any server-side redirects have been followed.
//
// Parameters:
//   targetUrl — the actual product page we want to scrape
//   apiKey    — the caller's ZenRows API key used for authentication
//   jsRender  — when true, ZenRows runs a headless browser to execute JavaScript
//               before returning HTML (required for React/SPA pages like Flipkart)
const fetchWithZenRows = async (
  targetUrl: string,
  apiKey: string,
  jsRender = false
): Promise<{ html: string; resolvedUrl: string }> => {
  // Build the query string that ZenRows requires.
  // - apikey: authenticates the request
  // - url: the page ZenRows should fetch on our behalf
  // - original_status: tells ZenRows to forward the target site's HTTP status
  //   code so we can detect errors like 404 or 503 on the scraped page itself
  const params = new URLSearchParams({
    apikey: apiKey,
    url: targetUrl,
    original_status: 'true',
  });

  // If the caller requested JavaScript rendering, add the js_render flag.
  // This instructs ZenRows to use a real Chromium browser instead of a plain
  // HTTP fetch, which is needed for pages that load content dynamically.
  if (jsRender) params.append('js_render', 'true');

  // Amazon blocks standard proxies — premium proxy bypasses their bot detection
  if (targetUrl.includes('amazon.in') || targetUrl.includes('amazon.com')) {
    // Enable ZenRows' premium (residential) proxy pool for Amazon requests.
    // Residential proxies look like real home internet connections and are
    // far less likely to be flagged or blocked by Amazon's bot detection.
    params.append('premium_proxy', 'true');
    // Note: js_render is intentionally NOT added for Amazon — combining both
    // causes Amazon to serve a different page with no pricing data.
  }

  // Fire the request to ZenRows with all assembled parameters.
  // ZenRows fetches the target page and returns its content to us.
  const response = await fetch(`${ZENROWS_URL}?${params.toString()}`);

  // If ZenRows itself returned a non-2xx status (e.g. invalid API key, quota
  // exceeded), throw an error immediately so the caller can handle it cleanly.
  if (!response.ok) {
    throw new Error(`ZenRows request failed: ${response.status}`);
  }

  // Read the full HTML body of the scraped page as a plain string.
  const html = await response.text();

  // ZenRows returns the final URL after following redirects in this header.
  // If the header is absent (no redirect occurred), fall back to the original URL.
  const resolvedUrl = response.headers.get('X-Zenrows-Resolved-Url') || targetUrl;

  // Return both the raw HTML content and the resolved (final) URL to the caller.
  return { html, resolvedUrl };
};

// ─── Price extraction helpers ─────────────────────────────────────────────────

// parseRupee converts a price string like "₹1,29,900" or "1,29,900" into a
// plain JavaScript number (129900) by stripping the rupee symbol, commas, and
// whitespace, then parsing the result as a floating-point number.
// Returns 0 if the string cannot be parsed as a valid number.
const parseRupee = (str: string): number => {
  // Remove the ₹ symbol, all commas (Indian number formatting), and whitespace.
  const cleaned = str.replace(/[₹,\s]/g, '');

  // Parse the cleaned string as a decimal number.
  const num = parseFloat(cleaned);

  // Guard against NaN: if parsing fails (e.g. empty string), return 0.
  return isNaN(num) ? 0 : num;
};

// Minimum realistic price threshold — filters out coupon/cashback/shipping amounts
// (e.g. "₹500 off coupon" should not be mistaken for the product price)
const MIN_PRICE = 500;

// extractAmazonPrice tries several regex strategies in descending order of
// reliability to pull the selling price from Amazon's HTML. Because Amazon
// frequently A/B-tests its page layout and has many regional/mobile variants,
// no single pattern is guaranteed to work — hence the layered fallback approach.
const extractAmazonPrice = (html: string): number => {
  // 1. apexPriceToPay — JS-rendered main buybox price (most accurate)
  // This data attribute is embedded by Amazon's JavaScript and represents the
  // final price a customer will pay (including any immediate discounts).
  const apexMatch = html.match(/apexPriceToPay[^]*?₹\s*([\d,]+)/);
  if (apexMatch) {
    const p = parseRupee(apexMatch[1]);
    // Only accept the price if it clears the minimum threshold to avoid
    // accidentally capturing small fee or discount amounts.
    if (p >= MIN_PRICE) return p;
  }

  // 2. Corebox price section
  // The "corePriceDisplay" div is Amazon's desktop buybox container and
  // reliably contains the current selling price on most product pages.
  const coreboxMatch = html.match(/id="corePriceDisplay_desktop_feature_div"[^]*?₹\s*([\d,]+)/);
  if (coreboxMatch) {
    const p = parseRupee(coreboxMatch[1]);
    if (p >= MIN_PRICE) return p;
  }

  // 3. a-price-whole (standard rendered price)
  // Amazon splits prices into whole and fraction parts using these CSS classes.
  // Matching the "a-price-whole" class gives us the integer portion of the price.
  const wholePriceMatch = html.match(/class="a-price-whole"[^>]*>([\d,]+)/);
  if (wholePriceMatch) {
    const p = parseRupee(wholePriceMatch[1]);
    if (p >= MIN_PRICE) return p;
  }

  // 4. priceblock (older Amazon pages)
  // Legacy Amazon product pages (pre-2021 design) used these specific element
  // IDs to mark the primary, deal, or sale price in the buybox.
  const priceBlockMatch = html.match(/id="priceblock_(?:ourprice|dealprice|saleprice)"[^>]*>₹?\s*([\d,]+)/);
  if (priceBlockMatch) {
    const p = parseRupee(priceBlockMatch[1]);
    if (p >= MIN_PRICE) return p;
  }

  // 5. JSON-LD structured data
  // Many pages embed machine-readable product metadata using JSON-LD
  // (<script type="application/ld+json">). The "price" field within this
  // data is often the most parseable representation of the current price.
  const jsonLdMatch = html.match(/"price"\s*:\s*"?([\d,]+(?:\.\d+)?)"?/);
  if (jsonLdMatch) {
    const p = parseRupee(jsonLdMatch[1]);
    if (p >= MIN_PRICE) return p;
  }

  // 6. Fallback: scan all ₹ amounts, take first one >= MIN_PRICE
  // If none of the structured approaches worked, scan the entire HTML for any
  // rupee-prefixed number, collect all values above the minimum threshold,
  // and return the first (topmost) one. This is a last resort because there
  // may be multiple prices on the page (e.g. strike-through MRP).
  const allPrices = [...html.matchAll(/₹\s*([\d,]+)/g)]
    .map(m => parseRupee(m[1]))
    .filter(p => p >= MIN_PRICE);

  // Return the first qualifying price found, or 0 if nothing was usable.
  return allPrices[0] ?? 0;
};

// extractFlipkartPrice pulls the selling price from a Flipkart product page.
// Flipkart uses a React SPA, so ZenRows renders it with a headless browser
// before we receive the HTML — meaning the price elements are present in the
// markup we receive here.
const extractFlipkartPrice = (html: string): number => {
  // Flipkart price class (current design)
  // Flipkart's current stylesheet uses a hashed CSS class (starting with
  // "_30jeq3") on the element that displays the final selling price.
  const classMatch = html.match(/class="_30jeq3[^"]*"[^>]*>₹([\d,]+)/);
  if (classMatch) {
    const p = parseRupee(classMatch[1]);
    // Any positive price is acceptable here — Flipkart prices can be < ₹500
    // (e.g. accessories, cables) so we do not apply the MIN_PRICE floor.
    if (p > 0) return p;
  }

  // JSON-LD structured data
  // Flipkart also embeds product schema with a "price" field, which serves as
  // a reliable secondary source when the CSS class approach fails.
  const jsonMatch = html.match(/"price"\s*:\s*"?([\d,]+(?:\.\d+)?)"?/);
  if (jsonMatch) {
    const p = parseRupee(jsonMatch[1]);
    if (p > 0) return p;
  }

  // Fallback: first ₹ followed by digits
  // If neither of the above matched, grab the very first rupee-prefixed number
  // visible anywhere in the page as a last resort.
  const fallbackMatch = html.match(/₹\s*([\d,]+)/);
  return fallbackMatch ? parseRupee(fallbackMatch[1]) : 0;
};

// extractGenericPrice handles product pages from any e-commerce site other
// than Amazon or Flipkart. It tries two lightweight strategies and returns 0
// if neither finds a price.
const extractGenericPrice = (html: string): number => {
  // Try JSON price first
  // JSON-LD and Open Graph metadata are the most portable structured price
  // formats across different e-commerce platforms.
  const jsonMatch = html.match(/"price"\s*:\s*"?([\d,]+(?:\.\d+)?)"?/);
  if (jsonMatch) {
    const p = parseRupee(jsonMatch[1]);
    if (p > 0) return p;
  }

  // Rupee symbol fallback
  // If no structured data is found, grab the first rupee-prefixed number
  // visible in the raw HTML as a best-effort last resort.
  const match = html.match(/₹\s*([\d,]+)/);
  return match ? parseRupee(match[1]) : 0;
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scrape the real-time price from a product page URL.
 * Automatically detects Amazon / Flipkart / generic store pages.
 *
 * @param url   Direct product page URL (e.g. amazon.in/dp/XXXXXXXX)
 * @param apiKey  ZenRows API key
 * @returns price in INR, or 0 if extraction fails
 */
export const scrapeProductPrice = async (
  url: string,
  apiKey: string
): Promise<number> => {
  try {
    // Log a truncated version of the URL so debugging is readable without
    // flooding the console with full query strings.
    console.log(`🔍 ZenRows scraping price: ${url.substring(0, 70)}`);

    // Use JS rendering for Flipkart (heavy SPA), plain HTML for Amazon
    // Flipkart requires a headless browser; Amazon does NOT (see comment in
    // fetchWithZenRows about why combining premium_proxy + js_render breaks Amazon).
    const jsRender = url.includes('flipkart.com');

    // Fetch the rendered HTML of the product page via ZenRows.
    // We only need the html here; resolvedUrl is used by resolveRedirectUrl.
    const { html } = await fetchWithZenRows(url, apiKey, jsRender);

    // Route to the correct site-specific extraction function based on the URL.
    let price = 0;
    if (url.includes('amazon.in') || url.includes('amazon.com')) {
      // Amazon pages use Amazon-specific HTML patterns and data attributes.
      price = extractAmazonPrice(html);
    } else if (url.includes('flipkart.com')) {
      // Flipkart pages use Flipkart-specific CSS class naming conventions.
      price = extractFlipkartPrice(html);
    } else {
      // For any other store, use the generic extractor which relies on
      // standard JSON-LD schema or raw rupee symbols in the markup.
      price = extractGenericPrice(html);
    }

    // Log the outcome: either the extracted price or a warning that extraction
    // failed, so developers can quickly spot which URLs are causing issues.
    if (price > 0) {
      console.log(`✅ ZenRows price: ₹${price}`);
    } else {
      console.log(`⚠️ ZenRows: could not extract price from ${url.substring(0, 60)}`);
    }

    // Return the extracted price (or 0 if nothing was found).
    return price;
  } catch (error) {
    // Catch any network errors, ZenRows API failures, or unexpected exceptions
    // and return 0 so the caller always receives a numeric value and the app
    // can continue functioning gracefully without crashing.
    console.error('ZenRows scrape error:', error);
    return 0;
  }
};

/**
 * Follow redirects and return the final destination URL.
 * Useful for Google Shopping redirect links or shortened URLs.
 *
 * @param url    Original (possibly redirected) URL
 * @param apiKey ZenRows API key
 * @returns final URL after all redirects
 */
export const resolveRedirectUrl = async (
  url: string,
  apiKey: string
): Promise<string> => {
  try {
    // Log the URL being resolved (truncated for readability).
    console.log(`🔗 ZenRows resolving redirect: ${url.substring(0, 70)}`);

    // Fetch the page without JS rendering — we only care about the final URL,
    // not the page content, so there is no need for a headless browser here.
    const { resolvedUrl } = await fetchWithZenRows(url, apiKey, false);

    // If ZenRows followed one or more redirects, log the destination URL so
    // developers can verify the redirect chain resolved correctly.
    if (resolvedUrl !== url) {
      console.log(`✅ Resolved to: ${resolvedUrl.substring(0, 70)}`);
    }

    // Return the final URL after all redirects have been followed.
    return resolvedUrl;
  } catch (error) {
    // If the resolution fails (network error, invalid URL, etc.), fall back to
    // the original URL so the caller can still attempt to use it downstream.
    console.error('ZenRows redirect resolution error:', error);
    return url;
  }
};

/**
 * Scrape prices for Amazon and Flipkart product pages in parallel.
 * Returns an object with the scraped prices (0 if unavailable).
 */
export const scrapeAmazonAndFlipkartPrices = async (
  amazonUrl: string,
  flipkartUrl: string,
  apiKey: string
): Promise<{ amazonPrice: number; flipkartPrice: number }> => {
  // Run both scrape calls concurrently using Promise.allSettled so that a
  // failure on one platform (e.g. Amazon is unreachable) does not cancel or
  // block the other (e.g. Flipkart still succeeds). allSettled — unlike
  // Promise.all — never rejects; it always resolves with an array describing
  // the outcome (fulfilled or rejected) of each individual promise.
  const [amazonResult, flipkartResult] = await Promise.allSettled([
    // If a URL was not provided for a platform, skip scraping it and resolve
    // immediately with 0, since there is nothing to fetch.
    amazonUrl ? scrapeProductPrice(amazonUrl, apiKey) : Promise.resolve(0),
    flipkartUrl ? scrapeProductPrice(flipkartUrl, apiKey) : Promise.resolve(0),
  ]);

  return {
    // If the Amazon scrape fulfilled successfully, use its price value.
    // If it was rejected (threw an error), default to 0.
    amazonPrice: amazonResult.status === 'fulfilled' ? amazonResult.value : 0,

    // Same pattern for Flipkart: use the scraped price on success, 0 on error.
    flipkartPrice: flipkartResult.status === 'fulfilled' ? flipkartResult.value : 0,
  };
};

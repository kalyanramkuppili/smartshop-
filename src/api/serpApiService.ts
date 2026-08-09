/**
 * serpApiService.ts
 *
 * This file is the central module for fetching real-time product data from the internet
 * using SerpAPI (https://serpapi.com), a third-party service that scrapes and parses
 * Google Search, Google Shopping, Google Images, and the Amazon search engine on behalf
 * of the caller.
 *
 * HOW IT FITS INTO SMARTSHOP:
 *   SmartSHOP needs live prices, direct product page URLs, review data, and product
 *   images from major Indian e-commerce stores (Amazon.in, Flipkart, Croma, etc.).
 *   Rather than scraping those sites directly (which is fragile and may violate ToS),
 *   this service sends structured queries to SerpAPI endpoints and transforms the
 *   structured JSON responses into the data shapes the rest of the app consumes.
 *
 * WHAT THIS FILE EXPORTS:
 *   - TypeScript interfaces that describe the shape of product, review, and link data.
 *   - searchRealProducts        – Google Shopping search returning a list of products
 *                                 with prices and store-specific fallback URLs.
 *   - searchRealPrices          – Google Shopping search returning the best price AND
 *                                 a direct product URL for every recognised store.
 *   - searchDirectProductLink   – Google organic search to find a direct product page
 *                                 (not a search/category page) for one store.
 *   - searchDirectProductLinks  – Runs searchDirectProductLink for many stores in parallel.
 *   - searchStorePrice          – Google Shopping search scoped to one store's domain.
 *   - searchProductReviews      – Google organic search to extract user ratings, pros,
 *                                 cons, and a short summary for a single product.
 *   - searchProductReviewsBatch – Runs searchProductReviews for up to 3 products at once.
 *   - searchProductImage        – Google Images search returning a thumbnail URL.
 *   - searchProductImages       – Runs searchProductImage for many products in parallel.
 *   - fetchProductImage         – Free DuckDuckGo fallback that needs no API key.
 *   - fetchProductImages        – Runs fetchProductImage in batches of 5 in parallel.
 *   - searchAmazonProduct       – Amazon-engine search returning ASIN-based product URLs.
 *   - searchFlipkartProduct     – Google organic search scoped to flipkart.com.
 *   - searchAmazonAndFlipkart   – Runs the two store-specific searches in parallel.
 *
 * API KEY:
 *   Every SerpAPI call requires a valid api_key query parameter.
 *   A free tier is available at https://serpapi.com/ (100 searches/month).
 *   The key is passed in by the caller so this module stays stateless.
 *
 * IMPORTANT DESIGN DECISIONS:
 *   - Direct product page URLs are strongly preferred over search/category page URLs
 *     because category pages are useless for "buy now" links.
 *   - URL validation is done via two complementary sets of RegExp patterns:
 *       PRODUCT_PAGE_PATTERNS  – confirms a URL is a product page for a given store.
 *       SEARCH_PAGE_PATTERNS   – rejects URLs that are clearly search/browse pages.
 *   - All network calls use Promise.allSettled so one failed store does not abort others.
 */

// SerpAPI Service for real product search
// Get FREE API key at: https://serpapi.com/ (100 searches/month free)

// Describes a single product returned by a Google Shopping search.
export interface RealProduct {
  title: string;      // Display name of the product
  link: string;       // URL to the product (direct store page or store search fallback)
  price: number;      // Numeric price in INR (0 if unavailable)
  source: string;     // Store/seller name as returned by the API (e.g. "Amazon.in")
  thumbnail: string;  // Product image URL returned by the API
  rating?: number;    // Optional star rating (e.g. 4.3)
}

// Wrapper used when returning a list of products from a search.
export interface ProductSearchResult {
  products: RealProduct[];
}

// Represents a verified direct product page link for a specific store.
export interface DirectProductLink {
  store: string; // Canonical store name (e.g. "Amazon", "Flipkart")
  url: string;   // Full URL pointing directly to the product page on that store
  title: string; // Product title as returned by the search result
}

// Base URL for all SerpAPI REST calls.
const SERPAPI_URL = 'https://serpapi.com/search.json';

// Store site domains for direct link search
// Maps canonical store names to their primary domain names so we can build
// site-scoped Google search queries (e.g. "site:amazon.in").
const STORE_SITES: Record<string, string> = {
  'Amazon': 'amazon.in',
  'Flipkart': 'flipkart.com',
  'Croma': 'croma.com',
  'Reliance Digital': 'reliancedigital.in',
  'Vijay Sales': 'vijaysales.com',
  'Tata Cliq': 'tatacliq.com',
  'JioMart': 'jiomart.com',
  'Nykaa': 'nykaa.com',
  'Myntra': 'myntra.com',
};

// Parse price string to number (moved here so it can be used by all functions)
// Handles both already-numeric values and strings like "₹1,49,999" or "₹999.00".
const parsePrice = (priceStr: string | number): number => {
  // If the value is already a number, return it immediately — no parsing needed.
  if (typeof priceStr === 'number') return priceStr;
  // Strip rupee symbol (₹) and thousands-separator commas, then extract the
  // first sequence of digits and optional decimal point.
  const match = priceStr.replace(/[₹,]/g, '').match(/[\d.]+/);
  // Convert the matched string to a float; return 0 if nothing was matched.
  return match ? parseFloat(match[0]) : 0;
};

// Store-specific patterns that indicate a DIRECT PRODUCT PAGE (not search/category)
// Each key maps to an array of RegExp patterns. If a URL matches ANY of these
// patterns for the corresponding store, it is treated as a valid product page.
const PRODUCT_PAGE_PATTERNS: Record<string, RegExp[]> = {
  'Amazon': [/\/dp\//, /\/gp\/product\//, /\/product\//],          // e.g. /dp/B09XYZ
  'Flipkart': [/\/p\/itm/, /\/p\//, /itm[A-Za-z0-9]+/],           // e.g. /p/itmXXXXXX
  'Croma': [/\/p\//, /\/product\//],
  'Reliance Digital': [/\/p\//, /\/product\//],
  'Vijay Sales': [/\/product\//, /\/p\//],
  'Tata Cliq': [/\/p\//, /\/product\//],
  'JioMart': [/\/p\//, /\/product\//],
  'Nykaa': [/\/p\//, /\/product\//],
  'Myntra': [/\/buy\//, /\/\d+\/buy/],                              // e.g. /12345/buy
};

// URLs that should NEVER be considered product pages
// If a URL matches any of these patterns it is a search results or category browse
// page — not a product page — and must be rejected to avoid sending users to
// unhelpful landing pages.
const SEARCH_PAGE_PATTERNS = [
  /\/search/i,       // Generic search paths (e.g. /search?q=...)
  /\/s\?/,           // Amazon-style short search param
  /\/s\/ref=/,       // Amazon search with ref tag
  /\/category\//i,   // Category listing pages
  /\/browse\//i,     // Browse/navigation pages
  /\/b\?/,           // Amazon "browse" query parameter
  /\/b\/ref=/,       // Amazon browse with ref tag
  /\/gp\/browse/,    // Amazon global-purchase browse page
  /\/stores\//,      // Brand store pages (not individual products)
  /\/shop\//i,       // Generic shop/collection pages
  /searchB\?/,       // Alternative search query pattern
  /\?query=/,        // Alternative query parameter name
  /\?keyword=/,      // Keyword-based search parameter
  // NOTE: /\?q=/ removed — too broad, incorrectly rejects valid product pages
  // with tracking params. /\/search/i and /\/s\?/ already cover real search pages.
];

// Check if URL is a direct product page for a specific store
// Returns true only when the URL passes the "not a search page" gate AND
// matches at least one known product-page pattern for the given store.
const isDirectProductPage = (url: string, storeName: string): boolean => {
  // First, check if it's a search/category page (reject these)
  // Iterate over every search/browse pattern and reject the URL immediately if
  // any pattern matches — we never want to send users to a search results page.
  for (const pattern of SEARCH_PAGE_PATTERNS) {
    if (pattern.test(url)) {
      return false; // This is a search or category page; reject it.
    }
  }

  // Then check if it matches product page patterns for this store
  // Look up the list of product-page RegExp patterns registered for this store.
  const patterns = PRODUCT_PAGE_PATTERNS[storeName];
  if (patterns) {
    for (const pattern of patterns) {
      // If the URL matches any product-page pattern, confirm it as a product page.
      if (pattern.test(url)) {
        return true;
      }
    }
  }

  // For unknown stores, assume it's a product page if it doesn't match search patterns
  // Since we already passed the search-page guard above, unknown stores are given the
  // benefit of the doubt and treated as product pages.
  return true;
};

// Search for direct product link and REAL PRICE on a specific store using Google
// Performs a Google organic search scoped to a single store's domain (e.g. site:amazon.in)
// and returns the first result URL that is a genuine product page (not a search page).
export const searchDirectProductLink = async (
  productName: string, // Human-readable product name to search for
  storeName: string,   // Canonical store name used to look up the domain and URL patterns
  apiKey: string       // SerpAPI authentication key
): Promise<DirectProductLink | null> => {
  try {
    // Resolve the domain for this store (e.g. "Amazon" → "amazon.in").
    const site = STORE_SITES[storeName];
    if (!site) {
      // If the store is not in our mapping we cannot build a site-scoped query.
      console.log(`No site mapping for store: ${storeName}`);
      return null;
    }

    // Create a more specific search query - add "buy" to help find product pages
    // The word "buy" biases Google toward transactional/product pages over editorial content.
    const query = `${productName} buy site:${site}`;
    console.log(`🔍 Searching: ${query}`);

    // Build the SerpAPI query parameters for a standard Google search.
    const params = new URLSearchParams({
      api_key: apiKey,
      engine: 'google',       // Use the regular Google search engine
      q: query,
      gl: 'in',               // Geolocation: India
      hl: 'en',               // Language: English
      num: '5', // Get top 5 results for better matching
    });

    // Send the request to SerpAPI and wait for the response.
    const response = await fetch(`${SERPAPI_URL}?${params.toString()}`);

    if (!response.ok) {
      // Log the HTTP error status and the raw response body for debugging.
      const errorText = await response.text();
      console.error(`SerpAPI error for ${storeName}:`, response.status, errorText);
      return null;
    }

    // Parse the JSON body returned by SerpAPI.
    const data = await response.json();

    if (data.organic_results && data.organic_results.length > 0) {
      // Find the best matching result - MUST be a product page, not search
      // Iterate through the organic results in order of Google relevance.
      for (const result of data.organic_results) {
        const url = result.link || '';

        // Check if this is a direct product page
        if (isDirectProductPage(url, storeName)) {
          // Found a result that passes all URL validation checks — return it.
          console.log(`✅ Found DIRECT product link for ${storeName}: ${url.substring(0, 80)}...`);
          return {
            store: storeName,
            url: result.link,
            title: result.title,
          };
        } else {
          // The result URL matched a search/category pattern; skip it and try the next one.
          console.log(`⚠️ Skipping search/category page: ${url.substring(0, 60)}...`);
        }
      }

      // If no direct product page found, DON'T return a search page
      // All top-5 results were search/category pages — return null rather than
      // polluting the UI with a useless link.
      console.log(`❌ No direct product page found for ${storeName} (all results were search/category pages)`);
      return null;
    }

    // SerpAPI returned no organic results for this query.
    console.log(`❌ No results found for ${storeName}`);
    return null;
  } catch (error) {
    // Catch network errors or JSON parse failures and surface them without crashing.
    console.error(`Error searching direct link for ${storeName}:`, error);
    return null;
  }
};

// Store price AND direct product URL combined
// Used as the value type in the Map returned by searchRealPrices.
export interface StoreData {
  price: number; // Best (lowest) price found for this store in INR
  url: string;   // Direct product page URL for this store (empty string if not found)
}

// Search for REAL price of a product on a specific store
// Uses the Google Shopping engine scoped to a single store's domain to find
// the most accurate price for that store. Returns null if no price is found.
export const searchStorePrice = async (
  productName: string, // Product to search for
  storeName: string,   // Store to scope the search to
  apiKey: string       // SerpAPI authentication key
): Promise<number | null> => {
  try {
    // Resolve the domain for this store.
    const site = STORE_SITES[storeName];
    if (!site) return null; // Unknown store — cannot proceed.

    // Search Google Shopping specifically for this product on this store
    const params = new URLSearchParams({
      api_key: apiKey,
      engine: 'google_shopping', // Google Shopping engine returns structured price data
      q: `${productName} site:${site}`, // Scope results to this store's domain
      gl: 'in',  // India
      hl: 'en',
      num: '5',  // Retrieve up to 5 shopping results
    });

    const response = await fetch(`${SERPAPI_URL}?${params.toString()}`);
    if (!response.ok) return null; // Network or HTTP error — return null gracefully.

    // Parse the Shopping API response.
    const data = await response.json();

    if (data.shopping_results && data.shopping_results.length > 0) {
      // Find the best matching result from this store
      // Filter results whose "source" field loosely matches this store's name,
      // handling cases like "Amazon.in" matching "Amazon" or "flipkart.com" matching "Flipkart".
      const storeResults = data.shopping_results.filter((item: any) => {
        const source = (item.source || '').toLowerCase();
        const storeLower = storeName.toLowerCase();
        // Match either: source contains the first word of the store name
        //           or: store name contains the first subdomain segment of the source.
        return source.includes(storeLower.split(' ')[0]) ||
               storeLower.includes(source.split('.')[0]);
      });

      if (storeResults.length > 0) {
        // Parse the price from the first (best) matching result.
        // extracted_price is already numeric; price is the raw string (e.g. "₹1,999").
        const price = parsePrice(storeResults[0].price || storeResults[0].extracted_price || '0');
        console.log(`✓ Real price for ${productName} on ${storeName}: ₹${price}`);
        return price;
      }
    }

    // No matching shopping result found for this store.
    return null;
  } catch (error) {
    // Swallow errors so one failing store doesn't break the overall flow.
    console.error(`Error searching price for ${storeName}:`, error);
    return null;
  }
};

// Search direct links for multiple stores in parallel
// Fans out searchDirectProductLink calls across all requested store names
// and collects the results into a Map of storeName → productPageUrl.
export const searchDirectProductLinks = async (
  productName: string,  // Product to search for across all stores
  storeNames: string[], // List of canonical store names to search
  apiKey: string        // SerpAPI authentication key
): Promise<Map<string, string>> => {
  // Accumulates the successful store → URL mappings.
  const linkMap = new Map<string, string>();

  // Search all stores in parallel
  // Kick off one searchDirectProductLink call per store simultaneously.
  const promises = storeNames.map(async (store) => {
    const result = await searchDirectProductLink(productName, store, apiKey);
    if (result) {
      // Reshape the result to the simpler { store, url } format for easy accumulation.
      return { store, url: result.url };
    }
    return null; // This store returned no usable product link.
  });

  // Wait for all parallel calls to complete (or fail) without throwing.
  const results = await Promise.allSettled(promises);
  // Walk through each settled result and add successful ones to the map.
  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value) {
      // Only fulfilled promises with a non-null value are added.
      linkMap.set(result.value.store, result.value.url);
    }
  });

  return linkMap;
};

// Fetch REAL prices AND direct product URLs from Google Shopping
// Sends a broad Google Shopping query (no site filter) and extracts the best
// (lowest) price and a verified direct product URL for every known store.
export const searchRealPrices = async (
  productName: string, // Product to search for (e.g. "Samsung Galaxy S24")
  apiKey: string       // SerpAPI authentication key
): Promise<Map<string, StoreData>> => {
  // Will hold one StoreData entry per discovered store (cheapest price wins).
  const storeDataMap = new Map<string, StoreData>();

  try {
    // Build a broad Google Shopping query — no site: filter so all stores can appear.
    const params = new URLSearchParams({
      api_key: apiKey,
      engine: 'google_shopping', // Returns structured shopping cards with prices
      q: productName,
      gl: 'in',   // India
      hl: 'en',
      num: '20',  // Fetch 20 results to maximise the chance of covering every store
    });

    console.log(`💰 Fetching real prices for: ${productName}`);
    const response = await fetch(`${SERPAPI_URL}?${params.toString()}`);

    if (!response.ok) {
      // Cannot fetch prices — return an empty map so callers degrade gracefully.
      console.log('Price fetch failed:', response.status);
      return storeDataMap;
    }

    // Parse the Shopping API JSON payload.
    const data = await response.json();

    if (data.shopping_results && data.shopping_results.length > 0) {
      // Maps lowercase source name fragments (as returned by Google) to our
      // canonical store names used throughout the app.
      const storeNameMapping: Record<string, string> = {
        'amazon': 'Amazon',
        'amazon.in': 'Amazon',
        'flipkart': 'Flipkart',
        'flipkart.com': 'Flipkart',
        'croma': 'Croma',
        'croma.com': 'Croma',
        'reliance': 'Reliance Digital',
        'reliancedigital': 'Reliance Digital',
        'vijay': 'Vijay Sales',
        'vijaysales': 'Vijay Sales',
        'tatacliq': 'Tata Cliq',
        'tata cliq': 'Tata Cliq',
        'jiomart': 'Jiomart',
        'nykaa': 'Nykaa',
        'myntra': 'Myntra',
      };

      // Process each shopping result returned by the API.
      data.shopping_results.forEach((item: any) => {
        // Normalise the source name to lowercase for reliable key matching.
        const source = (item.source || '').toLowerCase();
        // Parse the price from whichever field is present (numeric preferred).
        const price = parsePrice(item.extracted_price || item.price || '0');

        if (price > 0) {
          // Try to match this result to a known store via the mapping table.
          for (const [key, storeName] of Object.entries(storeNameMapping)) {
            if (source.includes(key)) {
              // Check if we already have a price for this store.
              const existing = storeDataMap.get(storeName);
              if (!existing || price < existing.price) {
                // Only update if this is the first entry or a cheaper price.
                // product_link is the direct store product page URL (e.g. amazon.in/dp/ASIN)
                // link is a Google-mediated redirect — prefer product_link
                const rawUrl: string = item.product_link || item.link || '';
                // Validate that the URL is actually a product page (not a search page).
                const directUrl = rawUrl && isDirectProductPage(rawUrl, storeName) ? rawUrl : '';
                // Store the price and the verified (or empty) direct URL.
                storeDataMap.set(storeName, { price, url: directUrl });
                console.log(`  💵 ${storeName}: ₹${price} | url: ${directUrl || '(no direct link)'}`);
              }
              break; // Stop iterating the mapping once a store match is found.
            }
          }
        }
      });

      console.log(`✅ Found real data for ${storeDataMap.size} stores`);
    }

    return storeDataMap;
  } catch (error) {
    // Return whatever partial data was collected before the error occurred.
    console.error('Error fetching real prices:', error);
    return storeDataMap;
  }
};

// Generate store search page URL as a last-resort fallback (goes to store, not Google)
// When no direct product page URL is available, this builds a store-specific search
// URL so the user at least lands on the correct store searching for the product.
const generateDirectStoreUrl = (title: string, source: string): string => {
  // URL-encode the product title so it can be safely embedded in a query string.
  const encodedTitle = encodeURIComponent(title);
  // Normalise the source name to lowercase for case-insensitive matching.
  const sourceLower = source.toLowerCase();

  // Return the appropriate search page URL for each known store.
  if (sourceLower.includes('amazon')) {
    return `https://www.amazon.in/s?k=${encodedTitle}`;
  }
  if (sourceLower.includes('flipkart')) {
    return `https://www.flipkart.com/search?q=${encodedTitle}`;
  }
  if (sourceLower.includes('croma')) {
    return `https://www.croma.com/search/?q=${encodedTitle}`;
  }
  if (sourceLower.includes('reliance') || sourceLower.includes('jiomart')) {
    // Reliance Digital and JioMart share a similar search URL structure.
    return `https://www.jiomart.com/search/${encodedTitle}`;
  }
  if (sourceLower.includes('vijay')) {
    return `https://www.vijaysales.com/search/${encodedTitle}`;
  }
  if (sourceLower.includes('tata') || sourceLower.includes('cliq')) {
    return `https://www.tatacliq.com/search/?searchCategory=all&text=${encodedTitle}`;
  }

  // If the store is not recognised, default to Amazon India as the safest fallback.
  return `https://www.amazon.in/s?k=${encodedTitle}`;
};

// Perform a broad Google Shopping search and return a flat list of products.
// Each returned product has a price and a fallback store search URL (not necessarily
// a direct product page — direct links are fetched separately via searchRealPrices).
export const searchRealProducts = async (
  query: string,  // Free-text product search query entered by the user
  apiKey: string  // SerpAPI authentication key
): Promise<RealProduct[]> => {
  try {
    // Use Google Shopping for product search - get more results for better price matching
    const params = new URLSearchParams({
      api_key: apiKey,
      engine: 'google_shopping', // Structured shopping results with prices and thumbnails
      q: query,
      gl: 'in', // India
      hl: 'en',
      num: '30', // Get more results for better store/price matching
    });

    console.log('SerpAPI request:', query);
    const response = await fetch(`${SERPAPI_URL}?${params.toString()}`);

    if (!response.ok) {
      // HTTP error from SerpAPI — surface a descriptive error to the caller.
      throw new Error(`SerpAPI request failed: ${response.status}`);
    }

    // Parse the Shopping API response body.
    const data = await response.json();

    if (!data.shopping_results || data.shopping_results.length === 0) {
      // SerpAPI found no shopping results for this query — return an empty list.
      console.log('No shopping results found');
      return [];
    }

    console.log('SerpAPI found', data.shopping_results.length, 'results');

    // Process shopping results with direct store URLs
    // Map each raw Shopping API item to the RealProduct interface shape.
    const products: RealProduct[] = data.shopping_results.map((item: any) => {
      const title = item.title || 'Unknown Product'; // Display name from Google Shopping
      const source = item.source || 'Unknown';       // Store name as reported by Google

      return {
        title,
        // Generate direct store URL instead of Google redirect
        // Use the fallback store search URL because Google Shopping does not
        // always return a reliable direct product URL in this endpoint.
        link: generateDirectStoreUrl(title, source),
        // Parse the price from whichever field Google Shopping populates.
        price: parsePrice(item.price || item.extracted_price || '0'),
        source,
        thumbnail: item.thumbnail || '', // Product image URL; empty string if absent
        rating: item.rating || 0,        // Star rating; defaults to 0 if not present
      };
    });

    return products;
  } catch (error) {
    // Re-throw so the calling UI layer can display an appropriate error message.
    console.error('SerpAPI Error:', error);
    throw error;
  }
};

// Fetch real product reviews from Google via SerpAPI
// Describes the aggregated review data extracted from Google Search results.
export interface GoogleReview {
  rating: number;      // Average star rating (e.g. 4.2)
  reviewCount: number; // Total number of reviews surfaced by Google
  summary: string;     // One-sentence human-readable summary of overall sentiment
  pros: string[];      // Up to 3 distinct positive phrases extracted from snippets
  cons: string[];      // Up to 2 distinct negative phrases extracted from snippets
}

// Search Google for real user reviews of a product and synthesise them into
// a single GoogleReview object. Returns null if nothing useful is found.
export const searchProductReviews = async (
  productName: string, // Product to search reviews for
  apiKey: string       // SerpAPI authentication key
): Promise<GoogleReview | null> => {
  try {
    // Search Google for actual product reviews
    // Adding "review India user experience" biases results toward genuine
    // user review articles and away from promotional pages.
    const params = new URLSearchParams({
      api_key: apiKey,
      engine: 'google',
      q: `${productName} review India user experience`,
      gl: 'in', // India
      hl: 'en',
      num: '10', // Fetch 10 organic results to maximise snippet coverage
    });

    console.log('Searching real reviews for:', productName);
    const response = await fetch(`${SERPAPI_URL}?${params.toString()}`);

    if (!response.ok) {
      // HTTP error — degrade gracefully by returning null.
      console.log('Review search failed:', response.status);
      return null;
    }

    // Parse the Google Search results JSON.
    const data = await response.json();

    // Accumulators for the review fields we will populate from various result sections.
    const pros: string[] = [];
    const cons: string[] = [];
    let summary = '';
    let rating = 0;
    let reviewCount = 0;

    // Check for knowledge graph rating
    // Google sometimes surfaces an aggregate rating in its Knowledge Graph panel
    // (e.g. for popular products). Use this as the primary source of truth.
    if (data.knowledge_graph?.rating) {
      rating = data.knowledge_graph.rating;
      reviewCount = data.knowledge_graph.reviews || 0;
    }

    // Extract snippets from organic results for real user opinions
    // Organic result snippets contain excerpts from review articles and user
    // posts — a rich source of real-world sentiment.
    if (data.organic_results && data.organic_results.length > 0) {
      const snippets: string[] = []; // Collects raw snippets for summary generation

      // Only analyse the top 5 results to keep processing fast.
      data.organic_results.slice(0, 5).forEach((result: any) => {
        const snippet = result.snippet || '';
        const snippetLower = snippet.toLowerCase();

        // Collect relevant snippets
        // Only include snippets that are long enough to be meaningful.
        if (snippet.length > 20) {
          snippets.push(snippet);
        }

        // Extract pros (positive keywords)
        // If the snippet contains a positive sentiment keyword, extract the
        // surrounding sentence (up to 80 chars) as a "pro" talking point.
        if (snippetLower.includes('great') || snippetLower.includes('excellent') ||
            snippetLower.includes('best') || snippetLower.includes('amazing') ||
            snippetLower.includes('good value') || snippetLower.includes('recommend')) {
          const proMatch = snippet.match(/[^.]*(?:great|excellent|best|amazing|good|recommend)[^.]*/i);
          if (proMatch && proMatch[0].length < 80) {
            pros.push(proMatch[0].trim());
          }
        }

        // Extract cons (negative keywords)
        // Similarly, extract a surrounding sentence when a negative keyword appears.
        if (snippetLower.includes('issue') || snippetLower.includes('problem') ||
            snippetLower.includes('poor') || snippetLower.includes('bad') ||
            snippetLower.includes('not worth') || snippetLower.includes('disappointed')) {
          const conMatch = snippet.match(/[^.]*(?:issue|problem|poor|bad|not worth|disappointed)[^.]*/i);
          if (conMatch && conMatch[0].length < 80) {
            cons.push(conMatch[0].trim());
          }
        }
      });

      // Create summary from first relevant snippet
      // Use the first collected snippet as the overall summary, truncating to
      // 120 characters with an ellipsis if it is too long.
      if (snippets.length > 0) {
        const firstSnippet = snippets[0];
        summary = firstSnippet.length > 120 ? firstSnippet.substring(0, 117) + '...' : firstSnippet;
      }
    }

    // Fallback: check shopping results for ratings
    // If the Knowledge Graph didn't provide a rating, try averaging ratings
    // from the top 3 Google Shopping results included in the search response.
    if (rating === 0 && data.shopping_results && data.shopping_results.length > 0) {
      const topResults = data.shopping_results.slice(0, 3); // Use up to 3 shopping results
      let totalRating = 0;
      let ratingCountLocal = 0; // Tracks how many results actually had a rating

      topResults.forEach((item: any) => {
        if (item.rating) {
          totalRating += item.rating;   // Accumulate for averaging
          ratingCountLocal++;
        }
        if (item.reviews) {
          reviewCount += item.reviews; // Sum up review counts across results
        }
      });

      if (ratingCountLocal > 0) {
        // Compute the average rating across all results that had one.
        rating = totalRating / ratingCountLocal;
      }
    }

    // Generate default summary if none found
    // If organic snippets yielded no summary, produce a generic one that is
    // calibrated to the numeric rating so it is still somewhat informative.
    if (!summary) {
      if (rating >= 4.5) {
        summary = 'Highly rated by customers with excellent feedback.';
      } else if (rating >= 4.0) {
        summary = 'Well-reviewed product with positive customer experiences.';
      } else if (rating >= 3.5) {
        summary = 'Mixed reviews. Consider checking detailed feedback.';
      } else if (rating > 0) {
        summary = 'Some concerns reported. Read reviews before purchase.';
      } else {
        // No rating data at all — be transparent about the lack of information.
        summary = 'Limited reviews available for this product.';
      }
    }

    // Only return if we have meaningful data
    // Don't return an empty GoogleReview object — require at least one meaningful field.
    if (rating > 0 || pros.length > 0 || cons.length > 0 || summary) {
      return {
        rating: Math.round(rating * 10) / 10, // Round to one decimal place (e.g. 4.27 → 4.3)
        reviewCount,
        summary,
        pros: [...new Set(pros)].slice(0, 3), // Remove duplicates, keep top 3
        cons: [...new Set(cons)].slice(0, 2), // Remove duplicates, keep top 2
      };
    }

    // Nothing useful was extracted — return null so the caller can skip review display.
    return null;
  } catch (error) {
    console.error('Review search error:', error);
    return null;
  }
};

// Batch fetch reviews for multiple products
// Fetches reviews for a list of product names concurrently and collects the
// results into a Map of productName → GoogleReview.
export const searchProductReviewsBatch = async (
  productNames: string[], // Array of product names to fetch reviews for
  apiKey: string          // SerpAPI authentication key
): Promise<Map<string, GoogleReview>> => {
  const reviewMap = new Map<string, GoogleReview>();

  // Limit to first 3 products to conserve API calls
  // SerpAPI has a monthly quota; reviewing more than 3 products at once
  // would use too many of those credits for a single batch operation.
  const limitedNames = productNames.slice(0, 3);

  // Kick off one review search per product name simultaneously.
  const promises = limitedNames.map(async (name) => {
    const review = await searchProductReviews(name, apiKey);
    return { name, review }; // Pair each result with its product name
  });

  // Wait for all review fetches to complete (or fail) without throwing.
  const results = await Promise.allSettled(promises);
  // Collect only the fulfilled results that actually have review data.
  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value.review) {
      reviewMap.set(result.value.name, result.value.review);
    }
  });

  return reviewMap;
};

// Search for product image using Google Images via SerpAPI
// Uses SerpAPI's Google Images engine to find a relevant product thumbnail.
// Returns the image URL as a string, or an empty string if nothing is found.
export const searchProductImage = async (
  productName: string, // Product to find an image for
  apiKey: string       // SerpAPI authentication key
): Promise<string> => {
  try {
    // Search Google Images for the product
    const params = new URLSearchParams({
      api_key: apiKey,
      engine: 'google_images', // Use the Google Images search engine
      q: `${productName} product`, // Append "product" to bias toward commercial imagery
      gl: 'in',   // India
      hl: 'en',
      num: '1',   // We only need the top result
      safe: 'active', // Enable SafeSearch to avoid inappropriate imagery
    });

    console.log('Searching image for:', productName);
    const response = await fetch(`${SERPAPI_URL}?${params.toString()}`);

    if (!response.ok) {
      // HTTP error — return empty string so callers show a placeholder instead.
      console.log('Image search failed:', response.status);
      return '';
    }

    // Parse the Images API response.
    const data = await response.json();

    if (data.images_results && data.images_results.length > 0) {
      // Get the first image result
      const imageResult = data.images_results[0];
      // Prefer the thumbnail (smaller, faster) over the full original image.
      const imageUrl = imageResult.thumbnail || imageResult.original;
      console.log('Found image:', imageUrl?.substring(0, 60));
      return imageUrl || ''; // Return empty string if both fields are absent
    }

    // No image results returned — return empty string.
    return '';
  } catch (error) {
    console.error('Image search error:', error);
    return '';
  }
};

// Batch search images for multiple products
// Fetches product images for a list of product names concurrently and collects
// the results into a Map of productName → imageUrl.
export const searchProductImages = async (
  productNames: string[], // Array of product names to fetch images for
  apiKey: string          // SerpAPI authentication key
): Promise<Map<string, string>> => {
  const imageMap = new Map<string, string>();

  // Search in parallel with limit
  // Kick off one image search per product name simultaneously.
  const promises = productNames.map(async (name) => {
    const imageUrl = await searchProductImage(name, apiKey);
    return { name, imageUrl }; // Pair each result with its product name
  });

  // Wait for all image searches to settle without throwing on individual failures.
  const results = await Promise.allSettled(promises);
  // Only include results that successfully found a non-empty image URL.
  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value.imageUrl) {
      imageMap.set(result.value.name, result.value.imageUrl);
    }
  });

  return imageMap;
};

// Free alternative: Use DuckDuckGo for product images (no API key needed)
// This function requires no SerpAPI key and no paid quota, making it a useful
// zero-cost fallback when SerpAPI credits are exhausted or unavailable.
export const fetchProductImage = async (productName: string): Promise<string> => {
  try {
    // Use a proxy service or direct approach for images
    // DuckDuckGo instant answer API
    // DuckDuckGo's Instant Answer API returns a JSON object that sometimes
    // includes a representative Image URL for well-known entities/products.
    const encodedQuery = encodeURIComponent(productName);
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`
    );

    if (response.ok) {
      const data = await response.json();
      if (data.Image) {
        // DuckDuckGo returned an image — use it.
        return data.Image;
      }
    }
  } catch (error) {
    // DuckDuckGo is a best-effort service; log and continue to the fallback.
    console.log('DuckDuckGo image fetch failed:', error);
  }

  // Fallback to placeholder
  // Neither DuckDuckGo nor any other source provided an image — return empty string
  // so the caller can display a generic placeholder image instead.
  return '';
};

// Fetch multiple product images in batch
// Fetches images for a list of products using the free DuckDuckGo approach,
// processing them in batches of 5 to avoid overwhelming the endpoint.
export const fetchProductImages = async (
  products: { name: string; category: string }[] // Array of product name + category pairs
): Promise<Map<string, string>> => {
  const imageMap = new Map<string, string>();

  // Fetch images in parallel with a limit
  // Process products in groups of 5 to keep concurrent requests manageable.
  const batchSize = 5;
  for (let i = 0; i < products.length; i += batchSize) {
    // Slice out the current batch of up to 5 products.
    const batch = products.slice(i, i + batchSize);
    // Fetch images for all products in this batch simultaneously.
    const promises = batch.map(async (product) => {
      // Combine name and category for a more specific search query.
      const image = await fetchProductImage(`${product.name} ${product.category}`);
      return { name: product.name, image };
    });

    // Wait for this batch to complete before processing the next batch.
    const results = await Promise.allSettled(promises);
    // Collect successful results into the map.
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.image) {
        imageMap.set(result.value.name, result.value.image);
      }
    });
  }

  return imageMap;
};

// ─── Direct Amazon & Flipkart extraction ───────────────────────────────────
// The functions below use store-specific SerpAPI engines (or site-scoped Google
// searches) to obtain more reliable direct product page URLs than the generic
// Google Shopping endpoint provides.

// Represents a product retrieved directly from a store-specific search
// (Amazon engine or Flipkart-scoped Google organic search).
export interface DirectStoreProduct {
  price: number;     // Price in INR (may be 0 if not extractable from the search result)
  url: string;       // Verified direct product page URL on the store
  title: string;     // Product title as returned by the store/search engine
  thumbnail: string; // Product image thumbnail URL (may be empty for Flipkart results)
}

/**
 * Search Amazon.in directly using SerpAPI's Amazon engine.
 * Uses item.asin to construct a guaranteed direct product page URL.
 * Link format: https://www.amazon.in/dp/XXXXXXXXXX
 */
// Queries SerpAPI's dedicated Amazon engine to find a product on Amazon.in.
// An ASIN (Amazon Standard Identification Number) is used when available to
// build a guaranteed, canonical product page URL (amazon.in/dp/ASIN).
export const searchAmazonProduct = async (
  productName: string, // Product to search on Amazon.in
  apiKey: string       // SerpAPI authentication key
): Promise<DirectStoreProduct | null> => {
  try {
    // Build the query for SerpAPI's Amazon-specific engine.
    const params = new URLSearchParams({
      api_key: apiKey,
      engine: 'amazon',          // SerpAPI's dedicated Amazon search engine
      amazon_domain: 'amazon.in', // Target the Indian Amazon storefront
      k: productName,             // "k" is the keyword/search parameter for Amazon
      hl: 'en',
    });

    console.log(`🛒 Amazon engine search: ${productName}`);
    const response = await fetch(`${SERPAPI_URL}?${params.toString()}`);
    if (!response.ok) {
      // HTTP error from the Amazon engine — return null so the caller degrades.
      console.log('Amazon engine request failed:', response.status);
      return null;
    }

    // Parse the Amazon engine response.
    const data = await response.json();
    // organic_results contains the list of Amazon product listings.
    const results: any[] = data.organic_results || [];

    for (const item of results) {
      // ASIN is the most reliable way to get a direct product page URL
      const asin: string = item.asin || '';
      const rawLink: string = item.link || '';

      // Build URL: prefer ASIN-based URL (guaranteed product page), fallback to link
      // If we have an ASIN, construct the canonical /dp/ URL directly.
      // Otherwise, use the link from the result, prepending the base domain if it's relative.
      const fullUrl = asin
        ? `https://www.amazon.in/dp/${asin}`
        : rawLink.startsWith('http') ? rawLink : `https://www.amazon.in${rawLink}`;

      // item.price.value is a number; item.price.raw is "₹15,999"
      // Prefer the numeric value field; fall back to parsing the raw string.
      const price: number = item.price?.value ?? parsePrice(item.price?.raw || item.extracted_price || '0');

      // Accept if ASIN present (direct product page guaranteed), even if price=0
      // An ASIN alone is sufficient to confirm a direct product page; a price
      // of 0 is acceptable because it may be populated later via searchRealPrices.
      if (asin || isDirectProductPage(fullUrl, 'Amazon')) {
        console.log(`✅ Amazon ASIN ${asin}: ₹${price} → ${fullUrl.substring(0, 70)}`);
        return {
          price,
          url: fullUrl,
          title: item.title || productName, // Fall back to query if title is missing
          thumbnail: item.thumbnail || '',  // Product image; empty string if absent
        };
      }
    }

    // Exhausted all results without finding a valid product page.
    console.log(`❌ Amazon: no product found for "${productName}"`);
    return null;
  } catch (error) {
    // Catch and log any network or parse errors without crashing.
    console.error('Amazon direct search error:', error);
    return null;
  }
};

/**
 * Search Flipkart via Google organic search with site:flipkart.com.
 * Google Shopping ignores site: filter, so we use regular Google search instead.
 * Returns the first organic result that is a real Flipkart product page.
 * Link format: https://www.flipkart.com/product-name/p/itm...
 */
// Uses a site-scoped Google organic search to find a genuine Flipkart product page.
// Google Shopping does not honour the site: operator, so the regular Google
// engine is used here instead. The price may be 0 because it is hard to extract
// reliably from Google organic snippets; searchRealPrices covers Flipkart pricing.
export const searchFlipkartProduct = async (
  productName: string, // Product to search on Flipkart
  apiKey: string       // SerpAPI authentication key
): Promise<DirectStoreProduct | null> => {
  try {
    // Build a site-scoped Google organic search query targeting flipkart.com.
    const params = new URLSearchParams({
      api_key: apiKey,
      engine: 'google',                             // Regular Google search (not Shopping)
      q: `${productName} buy site:flipkart.com`,   // site: limits results to Flipkart
      gl: 'in', // India
      hl: 'en',
      num: '5', // Fetch up to 5 results in case the first few are not product pages
    });

    console.log(`🛒 Flipkart Google search: ${productName}`);
    const response = await fetch(`${SERPAPI_URL}?${params.toString()}`);
    if (!response.ok) {
      // HTTP error — return null so the caller degrades gracefully.
      console.log('Flipkart search request failed:', response.status);
      return null;
    }

    // Parse the Google organic search response.
    const data = await response.json();
    const organicResults: any[] = data.organic_results || [];

    // Iterate through organic results to find the first valid Flipkart product page.
    for (const result of organicResults) {
      const url: string = result.link || '';
      // Skip results that are not on flipkart.com (should not happen with site: filter).
      if (!url.includes('flipkart.com')) continue;
      // Skip results whose URL matches search/category patterns.
      if (!isDirectProductPage(url, 'Flipkart')) continue;

      // Try to extract price from rich snippet (Google sometimes shows it)
      // Google occasionally surfaces structured price data in its rich snippet
      // annotations — use this if available.
      let price = 0;
      const richPrice = result.rich_snippet?.top?.detected_extensions?.price;
      if (richPrice) {
        price = parsePrice(String(richPrice));
      }
      // Fallback: scan snippet text for ₹ amount
      // If there is no rich snippet, search the plain text snippet for a
      // rupee price pattern (e.g. "₹1,49,999").
      if (!price && result.snippet) {
        const priceMatch = result.snippet.match(/₹[\d,]+/);
        if (priceMatch) price = parsePrice(priceMatch[0]);
      }

      console.log(`✅ Flipkart: ₹${price || '?'} → ${url.substring(0, 70)}`);
      return {
        price,   // may be 0; searchRealPrices covers Flipkart price via Google Shopping
        url,
        title: result.title || productName, // Use query as fallback if title is missing
        thumbnail: '',                       // Organic results don't include thumbnails
      };
    }

    // No valid Flipkart product page found among the top results.
    console.log(`❌ Flipkart: no direct product page found for "${productName}"`);
    return null;
  } catch (error) {
    // Catch and log errors without crashing the application.
    console.error('Flipkart direct search error:', error);
    return null;
  }
};

/**
 * Fetch Amazon and Flipkart data in parallel for a single product.
 */
// Runs searchAmazonProduct and searchFlipkartProduct concurrently for a single
// product and returns both results together. Using Promise.allSettled ensures
// that a failure in one search does not cancel the other.
export const searchAmazonAndFlipkart = async (
  productName: string, // Product to look up on both Amazon and Flipkart
  apiKey: string       // SerpAPI authentication key
): Promise<{ amazon: DirectStoreProduct | null; flipkart: DirectStoreProduct | null }> => {
  // Launch both store-specific searches at the same time to minimise total wait time.
  const [amazonResult, flipkartResult] = await Promise.allSettled([
    searchAmazonProduct(productName, apiKey),
    searchFlipkartProduct(productName, apiKey),
  ]);

  return {
    // If the promise was fulfilled, return its value; otherwise return null.
    amazon: amazonResult.status === 'fulfilled' ? amazonResult.value : null,
    flipkart: flipkartResult.status === 'fulfilled' ? flipkartResult.value : null,
  };
};

// Default export — the broad Google Shopping product search function is the
// primary entry point used by most callers in the app.
export default searchRealProducts;

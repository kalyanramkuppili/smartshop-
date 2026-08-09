/*
 * combinedSearchService.ts
 *
 * PURPOSE:
 * This file is the central orchestration layer for the smartSHOP product search pipeline.
 * It coordinates three external services — Groq (AI), SerpAPI (Google), and ZenRows (web scraping) —
 * to produce a unified, enriched list of products for a given search query.
 *
 * HIGH-LEVEL FLOW:
 *   1. Call Groq AI to generate an initial list of product recommendations based on the user's query.
 *   2. On mobile only, call SerpAPI to fetch real product listings from Google Shopping / Google Images.
 *      (SerpAPI is skipped on web due to CORS restrictions.)
 *   3. For each AI-suggested product, enrich it by:
 *       a. Resolving the best available product image (SerpAPI thumbnail > Google Images > Unsplash fallback).
 *       b. Fetching direct product page URLs from major stores (Amazon, Flipkart, etc.)
 *          via three parallel SerpAPI calls: Google site: search, Google Shopping, and store-specific engines.
 *       c. Resolving the most accurate price for each store, in strict priority order:
 *            Priority -1: ZenRows live-scraped price (highest accuracy, mobile only)
 *            Priority  0: Direct Amazon/Flipkart engine price
 *            Priority  1: Google Shopping price
 *            Priority  2: SerpAPI organic result price
 *            Priority  3: AI-estimated price (fallback)
 *       d. Dropping any store that has no resolvable direct product URL (to avoid sending
 *          users to irrelevant search/category pages).
 *       e. Fetching real user review ratings from Google (mobile only).
 *   4. Recalculate the best (lowest) price from whichever stores survived the URL check.
 *   5. Return the fully enriched product list.
 *
 * ADDITIONAL EXPORTS:
 *   - searchProductsWithSerpApi: A simpler alternative that fetches products directly from
 *     SerpAPI (Google Shopping) without using Groq AI recommendations. Useful as a fallback
 *     or for quick price lookups.
 *   - detectCategory (internal helper): Maps a product title string to one of the app's
 *     predefined ProductCategory enum values.
 *
 * IMAGE FALLBACK STRATEGY:
 *   To avoid broken images, the file embeds two lookup tables of pre-validated Unsplash URLs:
 *     - staticCategoryImages: One set of images per broad category (Mobile, Laptop, Audio, etc.)
 *     - productSpecificImages: Keyword-matched images for specific product types (e.g. "fridge",
 *       "headphone", "microwave"). These are tried first, before falling back to the category table.
 *
 * PLATFORM AWARENESS:
 *   The service detects whether it is running on web or mobile via React Native's Platform API.
 *   All SerpAPI and ZenRows calls are suppressed on web to avoid CORS errors.
 */

// Import React Native's Platform module to detect whether the app is running on web or mobile
import { Platform } from 'react-native';

// Import the shared Product and ProductCategory types used throughout the app
import { Product, ProductCategory } from '../types';

// Import the Groq AI service that generates product recommendations from natural language queries
import { searchProductsWithGroq } from './groqService';

// Import all SerpAPI helpers:
//   searchRealProducts      - fetches Google Shopping results for a query
//   RealProduct             - type for a single Google Shopping result
//   StoreData               - type for a store's price + URL from Google Shopping
//   DirectStoreProduct      - type for a product scraped directly from Amazon or Flipkart
//   searchDirectProductLinks - searches Google with "site:storename.com <product>" to get direct URLs
//   searchProductImage      - searches Google Images for a product photo
//   searchProductReviews    - fetches Google review rating and summary for a product
//   searchRealPrices        - queries Google Shopping to find prices per store
//   searchAmazonAndFlipkart - uses Amazon and Flipkart-specific search engines to get direct listings
import { searchRealProducts, RealProduct, StoreData, DirectStoreProduct, searchDirectProductLinks, searchProductImage, searchProductReviews, searchRealPrices, searchAmazonAndFlipkart } from './serpApiService';

// Import config values and API readiness checks
//   config              - holds the actual API keys (serpApiKey, zenRowsApiKey, etc.)
//   isSerpApiConfigured - returns true if a SerpAPI key is present in config
//   isZenRowsConfigured - returns true if a ZenRows API key is present in config
import { config, isSerpApiConfigured, isZenRowsConfigured } from '../config';

// Import the ZenRows service that live-scrapes Amazon and Flipkart product pages for real prices
import { scrapeAmazonAndFlipkartPrices } from './zenrowsService';

// Determine at module load time whether the app is running in a web browser.
// SerpAPI and ZenRows calls will be skipped on web due to CORS restrictions.
const isWeb = Platform.OS === 'web';

// Wraps a promise with a hard timeout. If the promise doesn't resolve within
// `ms` milliseconds, the fallback value is returned instead of waiting forever.
// Used to prevent slow ZenRows scraping from blocking the entire product load.
const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  const timer = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
  return Promise.race([promise, timer]);
};

// Parses a maximum budget (in INR) from the user's search query.
// Handles patterns like "under 30000", "below ₹50,000", "budget 20000", "max 15000", "up to 25000".
// Returns the numeric limit, or null if no budget constraint is present.
const extractBudget = (query: string): number | null => {
  const patterns = [
    /(?:under|below|less\s+than|within|up\s+to|upto|max(?:imum)?|budget(?:\s+of)?)\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*)/i,
    /(?:rs\.?|inr|₹)\s*(\d[\d,]*)\s*(?:or\s+less|and\s+below|max|budget)/i,
    /(\d[\d,]*)\s*(?:rs\.?|inr|₹)?\s*(?:or\s+less|and\s+below|budget|max)/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      const price = parseInt(match[1].replace(/,/g, ''), 10);
      // If the user explicitly wrote ₹/rs/INR, accept any amount (even ₹256 is valid).
      // Without the symbol, require ≥ 1000 to avoid false matches on storage/model numbers
      // (e.g. "iPhone 15 Pro Max 256GB" → "Max 256" has no ₹ → ignored).
      const hasSymbol = /(?:rs\.?|inr|₹)/i.test(match[0]);
      if (hasSymbol || price >= 1000) return price;
    }
  }
  return null;
};


/*
 * staticCategoryImages
 *
 * A lookup table that maps each broad product category to an array of pre-validated
 * Unsplash image URLs. These serve as the last-resort fallback when no real product
 * image is available from SerpAPI or the product-specific keyword table below.
 *
 * All URLs include width/height/fit parameters to ensure consistent 400x400 thumbnails.
 * Multiple URLs per category allow different products in the same category to display
 * visually distinct images (selected by index).
 */
const staticCategoryImages: Record<string, string[]> = {
  'Mobile': [
    'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1605236453806-6ff36851218e?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=400&fit=crop',
  ],
  'Laptop': [
    'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=400&h=400&fit=crop',
  ],
  'Audio': [
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400&h=400&fit=crop',
  ],
  'Tablet': [
    'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1561154464-82e9adf32764?w=400&h=400&fit=crop',
  ],
  'Appliances': [
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?w=400&h=400&fit=crop',
  ],
  'Beauty': [
    'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400&h=400&fit=crop',
  ],
  'Fashion': [
    'https://images.unsplash.com/photo-1445205170230-053b83016050?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop',
  ],
  'Home': [
    'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=400&fit=crop',
  ],
};

/*
 * productSpecificImages
 *
 * A keyword-to-image-array lookup table for common product types.
 * When a product's name contains one of these keywords (case-insensitive),
 * this table is checked before falling back to staticCategoryImages.
 * This produces more contextually accurate images (e.g. a fridge photo for
 * "refrigerator" rather than a generic appliances photo).
 *
 * Multiple images per keyword allow variety across products of the same type.
 */
const productSpecificImages: Record<string, string[]> = {
  'tv': [
    'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1461151304267-38535e780c79?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1567690187548-f07b1d7bf5a9?w=400&h=400&fit=crop',
  ],
  'television': [
    'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1461151304267-38535e780c79?w=400&h=400&fit=crop',
  ],
  'fridge': [
    'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400&h=400&fit=crop',
  ],
  'refrigerator': [
    'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400&h=400&fit=crop',
  ],
  'washing machine': [
    'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1610557892470-55d9e80c0e68?w=400&h=400&fit=crop',
  ],
  'washer': [
    'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=400&h=400&fit=crop',
  ],
  'ac': [
    'https://images.unsplash.com/photo-1631567091196-acbc6252f7d5?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=400&h=400&fit=crop',
  ],
  'air conditioner': [
    'https://images.unsplash.com/photo-1631567091196-acbc6252f7d5?w=400&h=400&fit=crop',
  ],
  'fan': [
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&h=400&fit=crop',
  ],
  'microwave': [
    'https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?w=400&h=400&fit=crop',
  ],
  'oven': [
    'https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?w=400&h=400&fit=crop',
  ],
  'water purifier': [
    'https://images.unsplash.com/photo-1564419320461-6870880221ad?w=400&h=400&fit=crop',
  ],
  'mixer': [
    'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=400&h=400&fit=crop',
  ],
  'blender': [
    'https://images.unsplash.com/photo-1570222094114-d054a817e56b?w=400&h=400&fit=crop',
  ],
  'vacuum': [
    'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=400&h=400&fit=crop',
  ],
  'headphone': [
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=400&h=400&fit=crop',
  ],
  'earbuds': [
    'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=400&h=400&fit=crop',
  ],
  'speaker': [
    'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=400&h=400&fit=crop',
  ],
  'watch': [
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=400&h=400&fit=crop',
  ],
  'smartwatch': [
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=400&h=400&fit=crop',
  ],
  'phone': [
    'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=400&fit=crop',
  ],
  'mobile': [
    'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=400&h=400&fit=crop',
  ],
  'laptop': [
    'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=400&h=400&fit=crop',
  ],
  'tablet': [
    'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400&h=400&fit=crop',
    'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?w=400&h=400&fit=crop',
  ],
};

/*
 * getCategoryImage
 *
 * Returns a static fallback image URL for a product, chosen from the pre-validated
 * Unsplash tables above. The selection logic is:
 *   1. Check productSpecificImages: scan all keywords and return a match if the
 *      product name contains that keyword.
 *   2. Fall back to staticCategoryImages using the product's category string.
 *      If the category is unknown, 'Appliances' is used as the default bucket.
 *
 * The `index` parameter is used to pick different images when multiple products
 * share the same keyword or category, preventing every card from showing the
 * same photo. It wraps around via modulo so it never goes out of bounds.
 */
const getCategoryImage = (category: string, productName: string, index: number = 0): string => {
  // Convert the product name to lowercase for case-insensitive keyword matching
  const productNameLower = productName.toLowerCase();

  // Iterate through every keyword entry in the product-specific image table
  for (const [keyword, imageUrls] of Object.entries(productSpecificImages)) {
    if (productNameLower.includes(keyword)) {
      // Use modulo so the index wraps around if it exceeds the array length
      return imageUrls[index % imageUrls.length];
    }
  }

  // No product-specific keyword matched; fall back to the category-level image array.
  // If the category string is not in the table, default to 'Appliances' as a safe generic bucket.
  const images = staticCategoryImages[category] || staticCategoryImages['Appliances'];
  return images[index % images.length];
};

/*
 * getProductImageUrl
 *
 * Resolves the best available thumbnail URL for a single product (synchronous path).
 * Resolution order:
 *   1. If SerpAPI returned results, try to find a result whose title shares at least
 *      two words with the product name AND has a non-empty thumbnail URL.
 *   2. If no SerpAPI match is found, fall back to getCategoryImage (Unsplash static).
 *
 * Parameters:
 *   productName   - the AI-generated product name to match against SerpAPI titles
 *   category      - the product's category, used if falling back to staticCategoryImages
 *   serpProducts  - the list of products returned by the SerpAPI call (may be empty)
 *   productIndex  - position of this product in the overall list, used to vary images
 */
const getProductImageUrl = (
  productName: string,
  category: string,
  serpProducts: RealProduct[],
  productIndex: number = 0
): string => {
  // Only attempt SerpAPI matching if we actually have SerpAPI results to work with
  if (serpProducts.length > 0) {
    // Split the AI product name into individual words for fuzzy matching
    const nameWords = productName.toLowerCase().split(' ');

    // Find the first SerpAPI product whose title contains at least 2 of the same words
    // AND which has a real thumbnail image attached
    const matchingProduct = serpProducts.find((p) => {
      const titleWords = p.title.toLowerCase();
      const matchCount = nameWords.filter((word) => titleWords.includes(word)).length;
      return matchCount >= 2 && p.thumbnail;
    });

    // If a matching SerpAPI product with a thumbnail was found, return its image URL
    if (matchingProduct?.thumbnail) {
      return matchingProduct.thumbnail;
    }
  }

  // No usable SerpAPI image found; return a pre-validated Unsplash URL instead
  return getCategoryImage(category, productName, productIndex);
};

/*
 * searchProductsCombined  (primary export)
 *
 * The main search function that the app UI calls when the user submits a query.
 * It orchestrates the full multi-source pipeline and returns a list of enriched
 * Product objects ready for display.
 *
 * Parameters:
 *   query      - the user's natural-language search string (e.g. "best noise cancelling headphones")
 *   groqApiKey - the API key used to authenticate requests to the Groq AI service
 *
 * Returns:
 *   A Promise that resolves to an array of Product objects, each with resolved
 *   images, direct store URLs, the most accurate prices, and real review data.
 */
export const searchProductsCombined = async (
  query: string,
  groqApiKey: string
): Promise<Product[]> => {
  console.log('Starting combined search for:', query);

  // Extract any budget constraint from the query upfront so it can be enforced
  // at every stage of the pipeline (AI, store price resolution, final filter).
  const budget = extractBudget(query);
  if (budget) {
    console.log(`💰 Budget constraint detected: ₹${budget.toLocaleString('en-IN')}`);
  }

  try {
    // -------------------------------------------------------------------------
    // STEP 1+2: Run Groq AI and SerpAPI in parallel.
    // Both only need the raw query string, so there is no dependency between them.
    // Running them concurrently saves ~1-2 seconds compared to sequential execution.
    // -------------------------------------------------------------------------
    console.log('Fetching Groq + SerpAPI in parallel...');
    const canUseSerpApi = isSerpApiConfigured() && !isWeb;

    const [groqProducts, serpProducts] = await Promise.all([
      searchProductsWithGroq(query, groqApiKey),
      canUseSerpApi
        ? searchRealProducts(query, config.serpApiKey).catch((err) => {
            console.log('SerpAPI failed, continuing with Groq data only:', err);
            return [] as RealProduct[];
          })
        : Promise.resolve([] as RealProduct[]),
    ]);

    console.log('Groq returned', groqProducts.length, 'products');
    console.log('SerpAPI returned', serpProducts.length, 'products');
    if (!canUseSerpApi) {
      console.log(isWeb ? 'Web platform detected - SerpAPI skipped (CORS).' : 'SerpAPI not configured, using fallback images');
    }

    // -------------------------------------------------------------------------
    // STEP 3: Enrich each AI-suggested product with real images, prices, and URLs
    // All products are processed in parallel via Promise.all for performance.
    // -------------------------------------------------------------------------
    const enhancedProducts = await Promise.all(
      groqProducts.map(async (product, productIndex) => {

        // Extract just the store names (e.g. ["Amazon", "Flipkart"]) from the AI product object
        const storeNames = product.stores.map(s => s.name);

        // -----------------------------------------------------------------------
        // 3a. Try to find a SerpAPI product that closely matches this AI product.
        //     "Closely matches" = the SerpAPI title contains at least 2 words from
        //     the AI product name (words shorter than 3 characters are excluded to
        //     avoid false matches on common short words like "of", "in", etc.).
        // -----------------------------------------------------------------------
        let matchedSerpProduct: RealProduct | undefined;
        if (serpProducts.length > 0) {
          const nameWords = product.name.toLowerCase().split(' ').filter(w => w.length > 2);
          matchedSerpProduct = serpProducts.find((sp) => {
            const titleLower = sp.title.toLowerCase();
            const matchCount = nameWords.filter((word) => titleLower.includes(word)).length;
            return matchCount >= 2;
          });
          if (matchedSerpProduct) {
            console.log(`✓ Matched SerpAPI product: ${matchedSerpProduct.title.substring(0, 40)}...`);
          }
        }

        // -----------------------------------------------------------------------
        // 3b. Resolve the best image URL for this product.
        //
        //     Priority:
        //       1. Thumbnail from the matched SerpAPI product (real product photo)
        //       2. Image provided by Groq AI (if valid — starts with http, not a placeholder)
        //       3. A separate Google Images API call via SerpAPI (mobile only)
        //       4. Static Unsplash fallback via getCategoryImage
        // -----------------------------------------------------------------------

        // Start with whichever of the SerpAPI thumbnail or the AI image is available
        let imageUrl = matchedSerpProduct?.thumbnail || product.image;

        // Determine whether the current candidate URL is actually usable
        const isValidImage = imageUrl &&
          imageUrl.startsWith('http') &&           // must be an absolute HTTP URL
          !imageUrl.includes('placehold');         // reject generic placeholder images

        console.log(`Product: ${product.name}`);
        console.log(`  Image: ${imageUrl?.substring(0, 60)}...`);

        // -----------------------------------------------------------------------
        // 3c. Run image search + all SerpAPI link/price searches in parallel.
        //     Image search (if needed) and the three SerpAPI searches are all
        //     independent — none depends on the output of another — so launching
        //     them all at the same time saves ~1 second per product.
        // -----------------------------------------------------------------------

        let directLinks = new Map<string, string>();
        let realPrices = new Map<string, StoreData>();
        let amazonFlipkartData: { amazon: DirectStoreProduct | null; flipkart: DirectStoreProduct | null } | null = null;

        if (isSerpApiConfigured() && !isWeb) {
          try {
            console.log(`🔗 Parallel: image + direct links + prices for: ${product.name}`);

            const [imageResult, linksResult, pricesResult, afResult] = await Promise.all([
              // Image search — only fires if we don't already have a valid image
              (!isValidImage)
                ? searchProductImage(product.name, config.serpApiKey).catch(() => null)
                : Promise.resolve(null),
              searchDirectProductLinks(product.name, storeNames, config.serpApiKey),
              searchRealPrices(product.name, config.serpApiKey),
              searchAmazonAndFlipkart(product.name, config.serpApiKey),
            ]);

            // Apply image result if we got one
            if (imageResult) {
              imageUrl = imageResult;
              console.log(`✓ Found real image via SerpAPI`);
            }

            directLinks = linksResult;
            realPrices = pricesResult;
            amazonFlipkartData = afResult;

            console.log(`✅ Found ${directLinks.size}/${storeNames.length} direct links`);
            console.log(`💰 Found real prices for ${realPrices.size} stores`);
            console.log(`🛒 Amazon: ${amazonFlipkartData.amazon ? `₹${amazonFlipkartData.amazon.price}` : 'not found'}`);
            console.log(`🛒 Flipkart: ${amazonFlipkartData.flipkart ? `₹${amazonFlipkartData.flipkart.price}` : 'not found'}`);
          } catch (error) {
            console.log('❌ Direct link/price search failed, using fallback:', error);
          }
        } else if (isWeb) {
          console.log(`⚠️ Web mode - SerpAPI disabled (CORS). URLs will be search pages.`);
        } else {
          console.log(`⚠️ SerpAPI not configured - using search page URLs`);
        }

        // Apply Unsplash fallback if image is still missing after all attempts
        if (!imageUrl || imageUrl.includes('placehold')) {
          imageUrl = getProductImageUrl(product.name, product.category, serpProducts, productIndex);
          console.log(`Using fallback image for ${product.name}`);
        }

        // -----------------------------------------------------------------------
        // 3d. ZenRows real-time price scraping (mobile only).
        //
        //     ZenRows bypasses anti-scraping measures to fetch live prices directly
        //     from Amazon and Flipkart product pages. It only runs when we already
        //     have actual product page URLs from the SerpAPI step above — there is
        //     no point scraping a URL we don't have.
        //
        //     These ZenRows prices are given the highest priority in the resolution
        //     logic below (Priority -1) because they are the most accurate and
        //     up-to-date values available.
        // -----------------------------------------------------------------------
        // -----------------------------------------------------------------------
        // 3d. Run ZenRows scraping AND review fetch in parallel.
        //     Reviews don't depend on ZenRows prices, so both can fire at the
        //     same time. ZenRows also has a 5-second hard timeout — if the
        //     premium proxy hasn't responded by then, we fall back to SerpAPI
        //     prices rather than blocking the entire load for one product.
        // -----------------------------------------------------------------------
        let zenRowsPrices = { amazonPrice: 0, flipkartPrice: 0 };
        let googleReviewResult: Awaited<ReturnType<typeof searchProductReviews>> = null;

        const amazonUrl = amazonFlipkartData?.amazon?.url || '';
        const flipkartUrl = amazonFlipkartData?.flipkart?.url || '';
        const canScrapeZenRows = isZenRowsConfigured() && !isWeb && (!!amazonUrl || !!flipkartUrl);

        const [zenRowsResult, reviewResult] = await Promise.all([
          // ZenRows with a 5-second timeout — slow proxy should not stall the UI
          canScrapeZenRows
            ? withTimeout(
                scrapeAmazonAndFlipkartPrices(amazonUrl, flipkartUrl, config.zenRowsApiKey)
                  .catch((err) => { console.log('💎 ZenRows failed:', err); return { amazonPrice: 0, flipkartPrice: 0 }; }),
                5000,
                { amazonPrice: 0, flipkartPrice: 0 }
              )
            : Promise.resolve({ amazonPrice: 0, flipkartPrice: 0 }),

          // Reviews — fully independent of ZenRows
          isSerpApiConfigured() && !isWeb
            ? searchProductReviews(product.name, config.serpApiKey).catch(() => null)
            : Promise.resolve(null),
        ]);

        zenRowsPrices = zenRowsResult;
        googleReviewResult = reviewResult;
        console.log(`💎 ZenRows → Amazon: ₹${zenRowsPrices.amazonPrice}, Flipkart: ₹${zenRowsPrices.flipkartPrice}`);

        // -----------------------------------------------------------------------
        // 3e. Build the final per-store data by merging all sources.
        //
        //     Price priority (highest to lowest):
        //       -1  ZenRows live-scraped price
        //        0  Amazon/Flipkart engine direct result
        //        1  Google Shopping price
        //        2  SerpAPI organic result price
        //        3  AI-estimated price (Groq fallback)
        //
        //     URL priority (highest to lowest):
        //        0  Amazon/Flipkart engine direct URL
        //        1  Google site: search result URL
        //        2  Google Shopping product_link URL
        //        (no fallback — if none found, store is dropped)
        // -----------------------------------------------------------------------
        const updatedStores = product.stores.map((store) => {
          // Look up the direct URL found by the Google site: search for this store
          const directUrl = directLinks.get(store.name);

          // Convert store name to lowercase once for all string comparisons below
          const storeLower = store.name.toLowerCase();

          // Retrieve the Amazon or Flipkart engine result for this specific store,
          // if the store name matches one of those two (otherwise null)
          const storeDirectData =
            store.name === 'Amazon' ? amazonFlipkartData?.amazon ?? null :
            store.name === 'Flipkart' ? amazonFlipkartData?.flipkart ?? null :
            null;

          // Start with the AI-estimated price as the baseline (lowest confidence)
          let finalPrice = store.price;
          let priceSource = 'ai-estimated'; // Tracks which source "won" for logging

          // PRIORITY -1: Use ZenRows scraped price if available for this store
          if (store.name === 'Amazon' && zenRowsPrices.amazonPrice > 0) {
            finalPrice = zenRowsPrices.amazonPrice;
            priceSource = 'zenrows-scraped';
            console.log(`💎 Amazon ZenRows: ₹${finalPrice}`);
          } else if (store.name === 'Flipkart' && zenRowsPrices.flipkartPrice > 0) {
            finalPrice = zenRowsPrices.flipkartPrice;
            priceSource = 'zenrows-scraped';
            console.log(`💎 Flipkart ZenRows: ₹${finalPrice}`);
          }

          // PRIORITY 0: Use the direct Amazon/Flipkart engine price if we don't yet
          // have a better (ZenRows) price and the engine returned a positive value
          if (priceSource === 'ai-estimated' && storeDirectData && storeDirectData.price > 0) {
            finalPrice = storeDirectData.price;
            priceSource = 'direct-store';
            console.log(`✅ ${store.name} engine: ₹${finalPrice}`);
          }

          // PRIORITY 1: Use the Google Shopping price if we still only have the AI estimate
          const googleShoppingData = realPrices.get(store.name);
          if (priceSource === 'ai-estimated' && googleShoppingData && googleShoppingData.price > 0) {
            finalPrice = googleShoppingData.price;
            priceSource = 'google-shopping';
            console.log(`💰 ${store.name} Google Shopping: ₹${finalPrice}`);
          }

          // PRIORITY 2: Scan SerpAPI organic results for a price from this specific store
          if (priceSource === 'ai-estimated' && serpProducts.length > 0) {
            const storeProduct = serpProducts.find((sp) => {
              // Match by checking if the SerpAPI source domain and store name overlap
              const sourceLower = sp.source.toLowerCase();
              return sourceLower.includes(storeLower.split(' ')[0]) ||
                     storeLower.includes(sourceLower.split('.')[0]);
            });
            if (storeProduct && storeProduct.price > 0) {
              finalPrice = storeProduct.price;
              priceSource = 'serp-results';
              console.log(`✓ ${store.name} SerpAPI: ₹${finalPrice}`);
            }
          }

          // PRIORITY 3: Use the price from the single best-matched SerpAPI product
          // (the one whose title most closely matched the AI product name earlier)
          if (priceSource === 'ai-estimated' && matchedSerpProduct && matchedSerpProduct.price > 0) {
            const sourceLower = matchedSerpProduct.source.toLowerCase();
            // Only use if the matched product's source domain corresponds to this store
            if (sourceLower.includes(storeLower.split(' ')[0]) || storeLower.includes(sourceLower.split(' ')[0])) {
              finalPrice = matchedSerpProduct.price;
              priceSource = 'matched-product';
              console.log(`✓ ${store.name} matched: ₹${finalPrice}`);
            }
          }

          // Log a warning if no real price source was found and we are falling back to AI estimate
          if (priceSource === 'ai-estimated') {
            console.log(`⚠️ ${store.name}: using AI estimate ₹${finalPrice}`);
          }

          // Resolve the final URL using priority: engine direct URL > site: search URL > Google Shopping URL > Groq fallback URL
          const directStoreUrl = storeDirectData?.url || '';           // Amazon/Flipkart engine
          const googleShoppingUrl = realPrices.get(store.name)?.url || ''; // Google Shopping
          const resolvedUrl = directStoreUrl || directUrl || googleShoppingUrl || store.url || '';

          // If no URL resolves at all, drop the store.
          if (!resolvedUrl) {
            console.log(`🗑️ ${store.name}: no URL at all — removing from list`);
            return null;
          }

          // Return the store entry with the resolved price and URL replacing the AI estimates
          return {
            ...store,       // preserve all other store fields (name, etc.)
            price: finalPrice,
            url: resolvedUrl,
          };
        }).filter((store): store is NonNullable<typeof store> => store !== null)
        .filter((store) => {
          if (budget && store.price > budget) {
            console.log(`💰 Budget filter: removed ${store.name} (₹${store.price} > ₹${budget})`);
            return false;
          }
          return true;
        });

        // -----------------------------------------------------------------------
        // 3f. Recalculate the displayed "best price" from the surviving stores.
        //     Only considers stores with a positive price. Falls back to the
        //     AI-estimated bestPrice if no valid store prices are available.
        // -----------------------------------------------------------------------
        const validBestPrice = updatedStores.length > 0
          ? Math.min(...updatedStores.map(s => s.price).filter(p => p > 0))
          : product.bestPrice; // AI fallback if all stores were dropped

        // -----------------------------------------------------------------------
        // 3g. Apply the review data already fetched in parallel with ZenRows above.
        //     googleReviewResult holds the result (or null if unavailable/failed).
        // -----------------------------------------------------------------------
        let updatedReviews = product.reviews;
        let updatedRating = product.rating;

        if (googleReviewResult) {
          console.log(`✓ Reviews: ${googleReviewResult.rating} stars, ${googleReviewResult.reviewCount} reviews`);
          if (googleReviewResult.rating > 0) updatedRating = googleReviewResult.rating;
          updatedReviews = {
            summary: googleReviewResult.summary || product.reviews?.summary || 'No reviews available',
            pros: googleReviewResult.pros.length > 0 ? googleReviewResult.pros : (product.reviews?.pros || []),
            cons: googleReviewResult.cons.length > 0 ? googleReviewResult.cons : (product.reviews?.cons || []),
            source: 'google',
            reviewCount: googleReviewResult.reviewCount,
          };
          if (googleReviewResult.reviewCount > 0) {
            updatedReviews.summary = `Based on ${googleReviewResult.reviewCount}+ Google reviews. ${updatedReviews.summary}`;
          }
        }

        // -----------------------------------------------------------------------
        // Return the fully enriched product object, merging all updates into the
        // original AI product shape (spread operator preserves any unmodified fields)
        // -----------------------------------------------------------------------
        return {
          ...product,                  // Keep all original Groq AI fields as defaults
          image: imageUrl,             // Resolved product image (SerpAPI / Google Images / Unsplash)
          stores: updatedStores,       // Stores with real URLs and best-available prices
          bestPrice: validBestPrice,   // Lowest price across stores with confirmed URLs
          rating: updatedRating,       // Real Google rating (or AI estimate as fallback)
          reviews: updatedReviews,     // Real Google reviews (or AI reviews as fallback)
        };
      })
    );

    // Final budget filter: remove any product whose real best price exceeds the
    // user's stated budget. This catches cases where ZenRows or SerpAPI returned
    // prices higher than what the AI estimated, even after per-store filtering.
    const budgetFilteredProducts = budget
      ? enhancedProducts.filter((p) => {
          const keep = p.bestPrice <= budget;
          if (!keep) console.log(`💰 Final budget filter: removed "${p.name}" (₹${p.bestPrice} > ₹${budget})`);
          return keep;
        })
      : enhancedProducts;

    // Return the fully enriched array of products to the caller (app UI)
    return budgetFilteredProducts;
  } catch (error) {
    // Bubble up any unhandled errors so the UI can display an appropriate error state
    console.error('Combined search error:', error);
    throw error;
  }
};

/*
 * searchProductsWithSerpApi  (secondary export)
 *
 * A simpler, Groq-free alternative that fetches products directly from SerpAPI
 * (Google Shopping) and converts them into the app's Product format.
 *
 * Use cases:
 *   - When Groq AI recommendations are not desired or available
 *   - Quick lookups where only Google Shopping data is needed
 *   - Testing SerpAPI connectivity independently of the Groq pipeline
 *
 * This function does NOT enrich results with ZenRows prices, direct store links,
 * or Google reviews — it is a thin wrapper around searchRealProducts.
 *
 * Throws an error if SerpAPI is not configured.
 */
export const searchProductsWithSerpApi = async (query: string): Promise<Product[]> => {
  // Guard: this function requires SerpAPI; throw early if the key is missing
  if (!isSerpApiConfigured()) {
    throw new Error('SerpAPI key not configured');
  }

  // Fetch raw Google Shopping results for the query
  const serpProducts = await searchRealProducts(query, config.serpApiKey);

  // Convert each SerpAPI result into the app's Product shape.
  // Each result becomes a product with a single store (the Google Shopping source).
  return serpProducts.map((sp, index) => ({
    id: String(index + 1),            // Generate a sequential string ID
    name: sp.title,                   // Use the Google Shopping listing title as the product name
    category: detectCategory(sp.title), // Infer category from keywords in the title
    image: sp.thumbnail || '',        // Use the Google Shopping thumbnail (may be empty)
    description: `From ${sp.source}`, // Short description indicating the store source
    bestPrice: sp.price,              // The price from Google Shopping is also the only/best price
    rating: sp.rating || 4.0,        // Use Google's rating, defaulting to 4.0 if not provided
    stores: [
      {
        name: sp.source,   // The retailer name as reported by Google Shopping
        price: sp.price,   // The listed price
        url: sp.link,      // The direct Google Shopping result link
      },
    ],
    reviews: {
      summary: 'Product from Google Shopping',
      pros: ['Real product listing', 'Verified price'],
      cons: ['Limited store comparison'],
    },
  }));
};

/*
 * detectCategory  (internal helper)
 *
 * Infers a ProductCategory enum value from a product title string by scanning
 * for well-known category keywords. The checks are ordered from most specific
 * to least specific.
 *
 * If no keywords match, 'Home' is returned as a generic catch-all category.
 *
 * This function is used by searchProductsWithSerpApi to categorize raw Google
 * Shopping results that don't carry explicit category metadata.
 */
const detectCategory = (title: string): ProductCategory => {
  // Normalize to lowercase once for all comparisons below
  const titleLower = title.toLowerCase();

  // Match smartphones and mobile phones
  if (titleLower.includes('phone') || titleLower.includes('mobile') || titleLower.includes('iphone') || titleLower.includes('samsung galaxy')) {
    return 'Mobile';
  }
  // Match laptops and notebooks
  if (titleLower.includes('laptop') || titleLower.includes('notebook') || titleLower.includes('macbook')) {
    return 'Laptop';
  }
  // Match audio accessories (headphones, earphones, earbuds, speakers)
  if (titleLower.includes('headphone') || titleLower.includes('earphone') || titleLower.includes('earbuds') || titleLower.includes('speaker')) {
    return 'Audio';
  }
  // Match tablets and iPads
  if (titleLower.includes('tablet') || titleLower.includes('ipad')) {
    return 'Tablet';
  }
  // Match large home appliances
  if (titleLower.includes('ac') || titleLower.includes('air conditioner') || titleLower.includes('refrigerator') || titleLower.includes('washing machine')) {
    return 'Appliances';
  }
  // Match beauty and personal care products
  if (titleLower.includes('lipstick') || titleLower.includes('makeup') || titleLower.includes('skincare') || titleLower.includes('perfume')) {
    return 'Beauty';
  }
  // Match clothing and fashion accessories
  if (titleLower.includes('shirt') || titleLower.includes('dress') || titleLower.includes('jeans') || titleLower.includes('shoes')) {
    return 'Fashion';
  }

  // Default category when no specific keyword matched
  return 'Home';
};

// Export searchProductsCombined as the default export for convenience
export default searchProductsCombined;

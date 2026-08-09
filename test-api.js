// Quick verification script for Amazon & Flipkart API calls
// Tests: direct product URLs + real prices
// Run: node test-api.js

const SERPAPI_URL = 'https://serpapi.com/search.json';
const SERP_API_KEY = '4dc5fee8e83314ebe5450af9ad40f8acadb587a6d06eec1147f0e338f5f4ee81';

// ── helpers ────────────────────────────────────────────────────────────────
const parsePrice = (str) => {
  if (typeof str === 'number') return str;
  const m = String(str).replace(/[₹,]/g, '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
};

const PRODUCT_PAGE_PATTERNS = {
  Amazon:  [/\/dp\//, /\/gp\/product\//],
  Flipkart:[/\/p\/itm/, /\/p\//, /itm[A-Za-z0-9]+/],
};
const SEARCH_PAGE_PATTERNS = [/\/search/i, /\/s\?/, /\/s\/ref=/, /\/category\//i, /\?q=/i, /\?query=/i];

const isProductPage = (url, store) => {
  if (SEARCH_PAGE_PATTERNS.some(r => r.test(url))) return false;
  return (PRODUCT_PAGE_PATTERNS[store] || []).some(r => r.test(url));
};

// ── Amazon engine ───────────────────────────────────────────────────────────
async function testAmazon(productName) {
  console.log(`\n🛒  Amazon engine → "${productName}"`);
  const p = new URLSearchParams({ api_key: SERP_API_KEY, engine: 'amazon',
    amazon_domain: 'amazon.in', k: productName, hl: 'en' });

  const res = await fetch(`${SERPAPI_URL}?${p}`);
  if (!res.ok) { console.log(`  ❌ HTTP ${res.status}`); return; }

  const data = await res.json();
  const results = data.organic_results || [];
  console.log(`  Raw results: ${results.length}`);

  for (const item of results.slice(0, 5)) {
    const asin   = item.asin || '';
    const rawLink= item.link || '';
    const url    = asin ? `https://www.amazon.in/dp/${asin}`
                        : rawLink.startsWith('http') ? rawLink : `https://www.amazon.in${rawLink}`;
    const price  = item.price?.value ?? parsePrice(item.price?.raw || item.extracted_price || '0');
    const isProduct = asin || isProductPage(url, 'Amazon');

    console.log(`  ${isProduct ? '✅' : '⚠️ '} ASIN=${asin || 'none'} | ₹${price} | ${url.substring(0, 80)}`);
    if (isProduct) break;
  }
}

// ── Flipkart (Google organic) ───────────────────────────────────────────────
async function testFlipkart(productName) {
  console.log(`\n🛒  Flipkart Google organic → "${productName}"`);
  const p = new URLSearchParams({ api_key: SERP_API_KEY, engine: 'google',
    q: `${productName} buy site:flipkart.com`, gl: 'in', hl: 'en', num: '5' });

  const res = await fetch(`${SERPAPI_URL}?${p}`);
  if (!res.ok) { console.log(`  ❌ HTTP ${res.status}`); return; }

  const data = await res.json();
  const results = data.organic_results || [];
  console.log(`  Raw results: ${results.length}`);

  let found = false;
  for (const item of results) {
    const url = item.link || '';
    if (!url.includes('flipkart.com')) continue;

    const isProduct = isProductPage(url, 'Flipkart');
    let price = 0;
    const richPrice = item.rich_snippet?.top?.detected_extensions?.price;
    if (richPrice) price = parsePrice(String(richPrice));
    if (!price && item.snippet) {
      const m = item.snippet.match(/₹[\d,]+/);
      if (m) price = parsePrice(m[0]);
    }

    console.log(`  ${isProduct ? '✅' : '⚠️ '} ₹${price || '?'} | ${url.substring(0, 80)}`);
    if (isProduct) { found = true; break; }
  }
  if (!found) console.log('  ❌ No direct Flipkart product page found');
}

// ── Google Shopping prices ──────────────────────────────────────────────────
async function testPrices(productName) {
  console.log(`\n💰  Google Shopping prices → "${productName}"`);
  const p = new URLSearchParams({ api_key: SERP_API_KEY, engine: 'google_shopping',
    q: productName, gl: 'in', hl: 'en', num: '20' });

  const res = await fetch(`${SERPAPI_URL}?${p}`);
  if (!res.ok) { console.log(`  ❌ HTTP ${res.status}`); return; }

  const data = await res.json();
  const results = data.shopping_results || [];
  console.log(`  Raw results: ${results.length}`);

  const TARGET = ['amazon', 'flipkart'];
  const seen = new Set();
  for (const item of results) {
    const src = (item.source || '').toLowerCase();
    for (const t of TARGET) {
      if (src.includes(t) && !seen.has(t)) {
        seen.add(t);
        const price = item.extracted_price ?? parsePrice(item.price || '0');
        const rawUrl = item.product_link || item.link || '';
        const isProduct = rawUrl && isProductPage(rawUrl, t === 'amazon' ? 'Amazon' : 'Flipkart');
        console.log(`  ${t === 'amazon' ? '🟠' : '🔵'} ${src} | ₹${price} | direct=${isProduct ? 'yes' : 'no'} | ${rawUrl.substring(0, 70)}`);
      }
    }
    if (seen.size === TARGET.length) break;
  }
  if (!seen.has('amazon'))   console.log('  🟠 Amazon: not found in Shopping results');
  if (!seen.has('flipkart')) console.log('  🔵 Flipkart: not found in Shopping results');
}

// ── run ─────────────────────────────────────────────────────────────────────
async function run() {
  const queries = ['Samsung Galaxy S24', 'boAt Airdopes 141'];

  for (const q of queries) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`PRODUCT: ${q}`);
    console.log('─'.repeat(60));
    await testAmazon(q);
    await testFlipkart(q);
    await testPrices(q);
    await new Promise(r => setTimeout(r, 1500)); // rate-limit pause
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('Done. Check ✅ lines for direct product page URLs.');
  console.log('═'.repeat(60));
}

run().catch(console.error);

import { Product } from '../types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

const systemPrompt = `You are a product price comparison assistant for Indian e-commerce. For ANY product search query:

1. Find relevant products available on Indian e-commerce sites
2. Return ONLY a valid JSON array - no markdown, no explanation, no code blocks
3. Sort stores by price ASCENDING (cheapest first)

Return this exact JSON structure:
[
  {
    "id": "1",
    "name": "Brand Model Name",
    "category": "Appliances",
    "description": "Key specs and features",
    "bestPrice": 2999,
    "rating": 4.5,
    "stores": [
      {"name": "Amazon", "price": 2999, "searchQuery": "Bajaj Frore Table Fan 400mm"},
      {"name": "Flipkart", "price": 3199, "searchQuery": "Bajaj Frore 400mm Table Fan"}
    ],
    "reviews": {
      "summary": "Brief user review summary",
      "pros": ["Pro 1", "Pro 2"],
      "cons": ["Con 1"]
    }
  }
]

RULES:
1. searchQuery MUST be the EXACT product name/model that will find this product on each store
2. Return 4-6 REAL products with actual brand names and model numbers
3. Use REALISTIC 2024-2025 Indian market prices in INR (numbers only)
4. Category must be one of: Mobile|Laptop|Audio|Tablet|Appliances|Beauty|Fashion|Home
   - Use "Appliances" for: fans, ACs, refrigerators, washing machines, water purifiers, kitchen appliances, etc.
   - Use "Home" for: furniture, decor, storage, cleaning supplies, etc.
   - Use "Audio" for: headphones, speakers, earbuds, etc.
5. Include 2-4 stores per product from: Amazon, Flipkart, Croma, Reliance Digital, Vijay Sales, JioMart
6. bestPrice = lowest store price
7. ONLY output the JSON array, nothing else - no markdown, no text before or after
8. BUDGET CONSTRAINT: If the user specifies a price limit (e.g. "under 30000", "below 50000", "budget 20000"), ALL products AND every store price MUST be strictly below that limit. Never suggest any product priced above the stated budget.`;

// Store domain mappings for Google Shopping URLs
const STORE_DOMAINS: Record<string, string> = {
  'Amazon': 'amazon.in',
  'Flipkart': 'flipkart.com',
  'Croma': 'croma.com',
  'Reliance Digital': 'reliancedigital.in',
  'Vijay Sales': 'vijaysales.com',
  'Nykaa': 'nykaa.com',
  'Myntra': 'myntra.com',
  'Tata Cliq': 'tatacliq.com',
  'Jiomart': 'jiomart.com',
};

// Generate Google Shopping URL with store filter
const getStoreUrl = (storeName: string, searchQuery: string): string => {
  const cleanQuery = searchQuery.replace(/\s+/g, ' ').trim();
  const encodedQuery = encodeURIComponent(cleanQuery);
  const domain = STORE_DOMAINS[storeName];

  if (domain) {
    return `https://www.google.com/search?q=${encodedQuery}+site:${domain}&tbm=shop`;
  }

  return `https://www.google.com/search?q=${encodedQuery}+buy+india&tbm=shop`;
};

// Get product image - use placehold.co with category colors
const getProductImage = (category: string, productName: string, _index: number): string => {
  // Category colors and icons
  const categoryConfig: Record<string, { bg: string; fg: string; icon: string }> = {
    'Mobile': { bg: '1a1a2e', fg: '6366f1', icon: '📱' },
    'Laptop': { bg: '1e293b', fg: '22d3ee', icon: '💻' },
    'Audio': { bg: '18181b', fg: 'f97316', icon: '🎧' },
    'Tablet': { bg: '1e1b4b', fg: 'a78bfa', icon: '📲' },
    'Appliances': { bg: '0f172a', fg: '3b82f6', icon: '❄️' },
    'Beauty': { bg: '4a1d4a', fg: 'f472b6', icon: '💄' },
    'Fashion': { bg: '1c1917', fg: 'fbbf24', icon: '👕' },
    'Home': { bg: '1a2e1a', fg: '4ade80', icon: '🏠' },
  };

  const config = categoryConfig[category] || categoryConfig['Appliances'];

  // Create short product label (first 2 words)
  const shortName = productName.split(' ').slice(0, 2).join('+');

  // Use placehold.co for clean placeholder with text
  return `https://placehold.co/400x400/${config.bg}/${config.fg}?text=${encodeURIComponent(config.icon + ' ' + shortName)}`;
};

// Extracts a maximum budget (in INR) from the user's query string.
// Recognises patterns like "under 30000", "below ₹50,000", "budget 20000", "max 15000", "up to 25000".
// Returns the numeric limit, or null if no budget constraint is found.
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

export const searchProductsWithGroq = async (
  query: string,
  apiKey: string
): Promise<Product[]> => {
  try {
    // Extract any budget constraint from the query so we can enforce it in the prompt
    const budget = extractBudget(query);
    const budgetNote = budget
      ? ` IMPORTANT: The user's maximum budget is ₹${budget.toLocaleString('en-IN')}. ONLY suggest products whose price is strictly UNDER ₹${budget.toLocaleString('en-IN')}. Do NOT include any product above this price.`
      : '';

    const messages: GroqMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Search for: ${query}.${budgetNote} Return product comparison data as JSON array only.` },
    ];

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', // Smaller model = fewer tokens, faster
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Groq API Error:', errorData);

      // Handle rate limit specifically
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a few minutes and try again.');
      }
      throw new Error(`API request failed: ${response.status}`);
    }

    const data: GroqResponse = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in response');
    }

    // Clean up the response - remove markdown code blocks if present
    let cleanContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Parse the JSON response
    const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Could not find JSON in response:', content);
      throw new Error('Invalid response format');
    }

    const rawProducts = JSON.parse(jsonMatch[0]);

    // Post-filter: remove any products the AI returned above the stated budget.
    // This acts as a safety net in case the AI ignored the budget instruction.
    const budgetFilteredRaw = budget
      ? rawProducts.filter((p: any) => {
          const lowestPrice = Math.min(...(p.stores || []).map((s: any) => s.price || Infinity));
          const keep = lowestPrice <= budget;
          if (!keep) console.log(`Budget filter removed: ${p.name} (₹${lowestPrice} > ₹${budget})`);
          return keep;
        })
      : rawProducts;

    // Process products: generate real URLs and images
    const products: Product[] = budgetFilteredRaw.map((product: any, index: number) => {
      // Get image - prefer Groq's imageUrl, fallback to generated placeholder
      const category = product.category || 'Appliances';
      const imageUrl = product.imageUrl || getProductImage(category, product.name || 'Product', index);
      console.log(`Product ${product.name} image:`, imageUrl?.substring(0, 60));

      // Process stores with real URLs
      const stores = product.stores.map((store: any) => ({
        name: store.name,
        price: store.price,
        url: getStoreUrl(store.name, store.searchQuery || product.name),
      }));

      // Sort stores by price
      stores.sort((a: any, b: any) => a.price - b.price);

      return {
        id: product.id || String(index + 1),
        name: product.name,
        category: product.category,
        image: imageUrl,
        description: product.description,
        bestPrice: Math.min(...stores.map((s: any) => s.price)),
        rating: product.rating,
        stores,
        reviews: product.reviews,
      };
    });

    return products;
  } catch (error) {
    console.error('Error searching products with Groq:', error);
    throw error;
  }
};

export default searchProductsWithGroq;

// Test script for Groq API (FREE tier)
// Get your FREE API key at: https://console.groq.com/keys

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const systemPrompt = `You are a product price comparison assistant for Indian e-commerce. Return ONLY a valid JSON array of products. No markdown, no explanation.

JSON structure:
[
  {
    "id": "1",
    "name": "Product Name",
    "category": "Mobile",
    "image": "https://via.placeholder.com/400x400.png?text=Product",
    "description": "Brief specs",
    "bestPrice": 29999,
    "rating": 4.5,
    "stores": [
      {"name": "Amazon", "price": 29999, "url": "https://amazon.in"},
      {"name": "Flipkart", "price": 31999, "url": "https://flipkart.com"}
    ],
    "reviews": {
      "summary": "Review summary",
      "pros": ["Pro 1", "Pro 2"],
      "cons": ["Con 1"]
    }
  }
]

Rules: 4-6 products, INR prices as numbers, stores sorted by price ascending.`;

async function testQuery(query, apiKey) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: "${query}"`);
  console.log('='.repeat(60));

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Search for: ${query}` },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error (${response.status}):`, errorText);
      return false;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in response');
      return false;
    }

    // Clean and parse
    let clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = clean.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {
      console.error('No JSON found');
      console.log('Response:', content.substring(0, 300));
      return false;
    }

    const products = JSON.parse(jsonMatch[0]);
    console.log(`\n✅ Found ${products.length} products:\n`);

    products.forEach((p, i) => {
      console.log(`${i + 1}. ${p.name}`);
      console.log(`   💰 Best: ₹${p.bestPrice?.toLocaleString('en-IN')}`);
      console.log(`   ⭐ ${p.rating}/5`);
      p.stores?.forEach((s, j) => {
        console.log(`   ${j === 0 ? '★' : ' '} ${s.name}: ₹${s.price?.toLocaleString('en-IN')}`);
      });
      console.log('');
    });

    return true;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

async function runTests() {
  const apiKey = process.argv[2];

  if (!apiKey) {
    console.log('\n❌ No API key provided!\n');
    console.log('Get your FREE Groq API key:');
    console.log('1. Go to: https://console.groq.com/keys');
    console.log('2. Sign up / Log in');
    console.log('3. Create API Key');
    console.log('4. Run: node test-groq.js YOUR_API_KEY\n');
    return;
  }

  console.log('🔑 Using Groq API with Llama 3.3 70B');

  const queries = [
    'AC under 30000',
    'makeup kit under 1000',
    'earbuds under 2000',
    'laptop under 50000',
    'smartwatch under 5000'
  ];

  let passed = 0;
  for (const q of queries) {
    if (await testQuery(q, apiKey)) passed++;
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Results: ${passed}/${queries.length} successful`);
  console.log('='.repeat(60));
}

runTests();

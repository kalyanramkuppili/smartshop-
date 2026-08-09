import { Product, PromptChip, Category, Feature } from '../types';

export const promptChips: PromptChip[] = [
  { id: '1', text: 'Top 10 mobiles under 20k', query: 'mobile' },
  { id: '2', text: 'Best gaming laptops under 60k', query: 'laptop' },
  { id: '3', text: 'Top wireless earbuds', query: 'audio' },
  { id: '4', text: 'Premium flagship phones 2024', query: 'mobile' },
  { id: '5', text: 'Best tablets for students', query: 'tablet' },
  { id: '6', text: 'Noise cancelling headphones', query: 'audio' },
];

export const categories: Category[] = [
  { id: '0', name: 'All', value: 'all' },
  { id: '1', name: 'Mobile', value: 'Mobile' },
  { id: '2', name: 'Laptop', value: 'Laptop' },
  { id: '3', name: 'Audio', value: 'Audio' },
  { id: '4', name: 'Tablet', value: 'Tablet' },
  { id: '5', name: 'Appliances', value: 'Appliances' },
  { id: '6', name: 'Home', value: 'Home' },
];

export const features: Feature[] = [
  { id: '1', name: 'Price Comparison', icon: 'price' },
  { id: '2', name: 'Expert Reviews', icon: 'star' },
  { id: '3', name: 'Multiple Stores', icon: 'stores' },
  { id: '4', name: 'Smart Search', icon: 'search' },
];

export const mockProducts: Product[] = [
  {
    id: '1',
    name: 'iPhone 15 Pro Max',
    category: 'Mobile',
    image: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400&h=400&fit=crop',
    description: '6.7-inch Super Retina XDR display with ProMotion. A17 Pro chip for blazing performance.',
    bestPrice: 134900,
    rating: 4.8,
    stores: [
      { name: 'Amazon', price: 134900, url: 'https://amazon.in' },
      { name: 'Flipkart', price: 135999, url: 'https://flipkart.com' },
      { name: 'Apple Store', price: 139900, url: 'https://apple.com/in' },
    ],
    reviews: {
      summary: 'Exceptional performance with industry-leading camera system. The titanium design feels premium and durable.',
      pros: [
        'A17 Pro chip delivers incredible performance',
        'Best-in-class camera system',
        'Premium titanium build quality',
        'Excellent battery life',
      ],
      cons: [
        'Expensive compared to competitors',
        'Limited customization options',
      ],
    },
  },
  {
    id: '2',
    name: 'Samsung Galaxy S24 Ultra',
    category: 'Mobile',
    image: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400&h=400&fit=crop',
    description: '6.8-inch Dynamic AMOLED 2X display. Snapdragon 8 Gen 3 processor with S Pen included.',
    bestPrice: 129999,
    rating: 4.7,
    stores: [
      { name: 'Amazon', price: 131999, url: 'https://amazon.in' },
      { name: 'Samsung Store', price: 129999, url: 'https://samsung.com/in' },
      { name: 'Flipkart', price: 130999, url: 'https://flipkart.com' },
    ],
    reviews: {
      summary: 'The ultimate productivity powerhouse with S Pen integration and AI features that set new standards.',
      pros: [
        'Stunning 6.8-inch display',
        'S Pen included with low latency',
        'Galaxy AI features are impressive',
        '200MP camera sensor',
      ],
      cons: [
        'Slightly heavy at 232g',
        'S Pen silo takes up space',
      ],
    },
  },
  {
    id: '3',
    name: 'OnePlus 12',
    category: 'Mobile',
    image: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=400&h=400&fit=crop',
    description: '6.82-inch AMOLED display with 120Hz. Snapdragon 8 Gen 3, 50MP Hasselblad camera.',
    bestPrice: 64999,
    rating: 4.6,
    stores: [
      { name: 'Amazon', price: 64999, url: 'https://amazon.in' },
      { name: 'OnePlus Store', price: 64999, url: 'https://oneplus.in' },
      { name: 'Flipkart', price: 65999, url: 'https://flipkart.com' },
    ],
    reviews: {
      summary: 'Flagship killer returns with incredible value. Hasselblad tuned cameras deliver stunning photos.',
      pros: [
        'Excellent price-to-performance ratio',
        'Hasselblad camera partnership',
        '100W fast charging',
        'Smooth 120Hz display',
      ],
      cons: [
        'No wireless charging in base model',
        'OxygenOS has some bloatware',
      ],
    },
  },
  {
    id: '4',
    name: 'Nothing Phone 2',
    category: 'Mobile',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=400&fit=crop',
    description: '6.7-inch OLED display with unique Glyph interface. Snapdragon 8+ Gen 1 processor.',
    bestPrice: 39999,
    rating: 4.4,
    stores: [
      { name: 'Amazon', price: 41999, url: 'https://amazon.in' },
      { name: 'Flipkart', price: 39999, url: 'https://flipkart.com' },
      { name: 'Nothing Store', price: 39999, url: 'https://nothing.tech' },
    ],
    reviews: {
      summary: 'Unique design language with the iconic Glyph interface. Clean software experience reminiscent of stock Android.',
      pros: [
        'Unique Glyph LED design',
        'Clean, bloat-free software',
        'Solid build quality',
        'Good value for features',
      ],
      cons: [
        'Camera struggles in low light',
        'Average battery life',
      ],
    },
  },
  {
    id: '5',
    name: 'MacBook Air M3',
    category: 'Laptop',
    image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&h=400&fit=crop',
    description: '13.6-inch Liquid Retina display. Apple M3 chip with 8-core CPU and 10-core GPU.',
    bestPrice: 114900,
    rating: 4.9,
    stores: [
      { name: 'Amazon', price: 114900, url: 'https://amazon.in' },
      { name: 'Apple Store', price: 114900, url: 'https://apple.com/in' },
      { name: 'Flipkart', price: 116999, url: 'https://flipkart.com' },
    ],
    reviews: {
      summary: 'The perfect ultrabook for most users. Incredible battery life and silent operation make it a joy to use.',
      pros: [
        'M3 chip is incredibly fast',
        'All-day battery life (18 hours)',
        'Fanless, silent operation',
        'Gorgeous Retina display',
      ],
      cons: [
        'Only two USB-C ports',
        'No Face ID',
      ],
    },
  },
  {
    id: '6',
    name: 'Sony WH-1000XM5',
    category: 'Audio',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop',
    description: 'Industry-leading noise cancellation with 30-hour battery life. Hi-Res Audio certified.',
    bestPrice: 26990,
    rating: 4.7,
    stores: [
      { name: 'Amazon', price: 26990, url: 'https://amazon.in' },
      { name: 'Flipkart', price: 27999, url: 'https://flipkart.com' },
      { name: 'Sony Store', price: 29990, url: 'https://sony.co.in' },
    ],
    reviews: {
      summary: 'The gold standard in noise-cancelling headphones. Exceptional comfort for long listening sessions.',
      pros: [
        'Best-in-class ANC',
        'Incredibly comfortable',
        '30-hour battery life',
        'Multipoint connectivity',
      ],
      cons: [
        'No folding design',
        'Touch controls can be finicky',
      ],
    },
  },
  {
    id: '7',
    name: 'iPad Pro M4',
    category: 'Tablet',
    image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400&h=400&fit=crop',
    description: '11-inch Ultra Retina XDR display with ProMotion. M4 chip with Tandem OLED technology.',
    bestPrice: 99900,
    rating: 4.8,
    stores: [
      { name: 'Amazon', price: 99900, url: 'https://amazon.in' },
      { name: 'Apple Store', price: 99900, url: 'https://apple.com/in' },
      { name: 'Flipkart', price: 101999, url: 'https://flipkart.com' },
    ],
    reviews: {
      summary: 'The most powerful tablet ever made. OLED display and M4 chip make it a laptop replacement for many.',
      pros: [
        'Stunning Tandem OLED display',
        'M4 chip outperforms most laptops',
        'Incredibly thin and light',
        'Apple Pencil Pro support',
      ],
      cons: [
        'iPadOS limitations',
        'Expensive accessories',
      ],
    },
  },
  {
    id: '8',
    name: 'AirPods Pro 2',
    category: 'Audio',
    image: 'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=400&h=400&fit=crop',
    description: 'Active Noise Cancellation with Adaptive Audio. USB-C charging case with speaker.',
    bestPrice: 24900,
    rating: 4.6,
    stores: [
      { name: 'Amazon', price: 24900, url: 'https://amazon.in' },
      { name: 'Apple Store', price: 24900, url: 'https://apple.com/in' },
      { name: 'Flipkart', price: 25999, url: 'https://flipkart.com' },
    ],
    reviews: {
      summary: 'The best earbuds for iPhone users. Seamless integration and excellent ANC make them hard to beat.',
      pros: [
        'Excellent ANC performance',
        'Seamless Apple ecosystem integration',
        'Adaptive Audio is fantastic',
        'Find My case with speaker',
      ],
      cons: [
        'Premium price point',
        'Not ideal for small ears',
      ],
    },
  },
];

export const getProductsByCategory = (category: string): Product[] => {
  if (category === 'all') {
    return mockProducts;
  }
  return mockProducts.filter((product) => product.category === category);
};

export const searchProducts = (query: string): Product[] => {
  const lowerQuery = query.toLowerCase();
  return mockProducts.filter(
    (product) =>
      product.name.toLowerCase().includes(lowerQuery) ||
      product.category.toLowerCase().includes(lowerQuery) ||
      product.description.toLowerCase().includes(lowerQuery)
  );
};

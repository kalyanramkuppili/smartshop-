export interface Store {
  name: string;
  price: number;
  url: string;
}

export interface ProductReviews {
  summary: string;
  pros: string[];
  cons: string[];
  source?: 'google' | 'ai'; // Review source indicator
  reviewCount?: number; // Number of Google reviews
}

export type ProductCategory = 'Mobile' | 'Laptop' | 'Audio' | 'Tablet' | 'Appliances' | 'Beauty' | 'Fashion' | 'Home';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  image: string;
  description: string;
  bestPrice: number;
  rating: number;
  stores: Store[];
  reviews: ProductReviews;
}

export interface PromptChip {
  id: string;
  text: string;
  query: string;
}

export interface Category {
  id: string;
  name: string;
  value: string;
}

export interface Feature {
  id: string;
  name: string;
  icon: string;
}

export type RootStackParamList = {
  Home: undefined;
  Results: { query: string };
};

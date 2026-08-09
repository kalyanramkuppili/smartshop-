import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StatusBar, Text, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Header, SearchBar, CategoryChips, ProductList } from '../components';
import { categories, searchProducts, getProductsByCategory } from '../data/mockData';
import { searchProductsCombined } from '../api';
import { config, isApiKeyConfigured, isSerpApiConfigured } from '../config';
import { RootStackParamList, Product, Category } from '../types';

const isWeb = Platform.OS === 'web';

type ResultsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Results'>;
type ResultsScreenRouteProp = RouteProp<RootStackParamList, 'Results'>;

interface ResultsScreenProps {
  navigation: ResultsScreenNavigationProp;
  route: ResultsScreenRouteProp;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({ navigation: _navigation, route }) => {
  const { query } = route.params;
  const [searchQuery, setSearchQuery] = useState(query);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useApi, setUseApi] = useState(true); // Default to using API

  console.log('ResultsScreen mounted with query:', query);
  console.log('API Key configured:', isApiKeyConfigured());

  const loadProducts = useCallback(async (searchTerm: string, category: string) => {
    console.log('loadProducts called with:', searchTerm, category);
    console.log('useApi:', useApi, 'isApiKeyConfigured:', isApiKeyConfigured());

    setIsLoading(true);
    setError(null);

    try {
      if (useApi && isApiKeyConfigured()) {
        console.log('Using Combined API for search...');
        console.log('Groq API Key:', config.groqApiKey.substring(0, 10) + '...');
        console.log('SerpAPI configured:', isSerpApiConfigured());
        // Use Combined API for real product search (Groq + SerpAPI for images/links)
        const apiResults = await searchProductsCombined(searchTerm, config.groqApiKey);
        console.log('API Results:', apiResults?.length || 0, 'products');
        if (apiResults && apiResults.length > 0) {
          console.log('First product:', JSON.stringify(apiResults[0], null, 2));
        }

        // Filter by category if not "all"
        let filteredResults = apiResults;
        if (category !== 'all') {
          filteredResults = apiResults.filter(
            (p) => p.category.toLowerCase() === category.toLowerCase()
          );
        }

        setProducts(filteredResults);
      } else {
        console.log('Using mock data...');
        // Fallback to mock data
        await new Promise((resolve) => setTimeout(resolve, 1500));

        let results: Product[];
        if (category === 'all') {
          results = searchProducts(searchTerm);
        } else {
          results = getProductsByCategory(category);
        }
        console.log('Mock Results:', results?.length || 0, 'products');
        setProducts(results);
      }
    } catch (err) {
      console.error('Error loading products:', err);
      setError('Failed to fetch products. Using offline data.');

      // Fallback to mock data on error
      let results: Product[];
      if (category === 'all') {
        results = searchProducts(searchTerm);
      } else {
        results = getProductsByCategory(category);
      }
      setProducts(results);
    } finally {
      setIsLoading(false);
    }
  }, [useApi]);

  useEffect(() => {
    console.log('useEffect triggered, loading products for:', searchQuery);
    loadProducts(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory, loadProducts]);

  const handleSearch = (newQuery: string) => {
    console.log('handleSearch called with:', newQuery);
    setSearchQuery(newQuery);
    setSelectedCategory('all');
  };

  const handleCategoryPress = (category: Category) => {
    setSelectedCategory(category.value);
  };

  const toggleApiMode = () => {
    setUseApi(!useApi);
  };

  return (
    <LinearGradient
      colors={['#1a1a2e', '#16213e', '#0f0f1a']}
      style={{ flex: 1 }}
    >
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1 }}>
        <Header showLogo />

        <SearchBar
          initialValue={searchQuery}
          onSearch={handleSearch}
          placeholder="Search for products..."
        />

        {/* API Mode Toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={toggleApiMode}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: useApi ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                borderColor: useApi ? 'rgba(34, 197, 94, 1)' : 'rgba(255,255,255,0.2)',
              }}
            >
              <Text style={{ fontSize: 12, color: useApi ? '#22c55e' : 'rgba(255,255,255,0.6)' }}>
                {useApi ? '🤖 Groq AI' : '📦 Mock'}
              </Text>
            </TouchableOpacity>

            {/* SerpAPI Status */}
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: isSerpApiConfigured() && !isWeb
                  ? 'rgba(34, 197, 94, 0.2)'
                  : isSerpApiConfigured()
                    ? 'rgba(250, 204, 21, 0.2)'
                    : 'rgba(255,255,255,0.05)',
                borderWidth: 1,
                borderColor: isSerpApiConfigured() && !isWeb
                  ? 'rgba(34, 197, 94, 0.5)'
                  : isSerpApiConfigured()
                    ? 'rgba(250, 204, 21, 0.5)'
                    : 'rgba(255,255,255,0.1)',
              }}
            >
              <Text style={{
                fontSize: 11,
                color: isSerpApiConfigured() && !isWeb
                  ? '#22c55e'
                  : isSerpApiConfigured()
                    ? '#facc15'
                    : 'rgba(255,255,255,0.4)'
              }}>
                {isSerpApiConfigured() && !isWeb
                  ? '🔗 Direct Links'
                  : isSerpApiConfigured()
                    ? '🔗 Web Mode (No Direct Links)'
                    : '🔗 No SerpAPI'}
              </Text>
            </View>
          </View>

          {!isApiKeyConfigured() && (
            <Text style={{ color: 'rgba(250, 204, 21, 0.7)', fontSize: 12 }}>
              Add API key
            </Text>
          )}
        </View>

        <CategoryChips
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryPress={handleCategoryPress}
        />

        {/* Error Message */}
        {error && (
          <Animated.View
            entering={FadeIn}
            style={{
              marginHorizontal: 20,
              marginBottom: 12,
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              borderWidth: 1,
              borderColor: 'rgba(239, 68, 68, 0.5)',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <Text style={{ color: '#f87171', fontSize: 14 }}>{error}</Text>
          </Animated.View>
        )}

        {/* Debug Info */}
        <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
            Query: {searchQuery} | Products: {products.length} | Loading: {isLoading ? 'Yes' : 'No'}
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <ProductList products={products} isLoading={isLoading} />
        </ScrollView>
      </View>
    </LinearGradient>
  );
};

export default ResultsScreen;

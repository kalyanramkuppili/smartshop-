import React from 'react';
import { View, Text, ScrollView, Dimensions } from 'react-native';
import { Product } from '../types';
import ProductCard from './ProductCard';
import SkeletonLoader from './SkeletonLoader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ProductListProps {
  products: Product[];
  isLoading: boolean;
}

export const ProductList: React.FC<ProductListProps> = ({ products, isLoading }) => {
  if (isLoading) {
    return <SkeletonLoader count={4} />;
  }

  if (products.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-20">
        <Text className="text-6xl mb-4">🔍</Text>
        <Text className="text-white text-lg font-semibold mb-2">No products found</Text>
        <Text className="text-white/50 text-sm text-center px-10">
          Try adjusting your search or browse different categories
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 12 }}>
        Found <Text style={{ color: '#fff', fontWeight: '700' }}>{products.length}</Text> products
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {products.map((product, index) => (
          <ProductCard key={product.id} product={product} index={index} />
        ))}
      </View>
    </View>
  );
};

export default ProductList;

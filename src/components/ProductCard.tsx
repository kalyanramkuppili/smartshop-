import React, { useState } from 'react';
import { View, Text, Image, Pressable, Dimensions, Linking } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  FadeIn,
} from 'react-native-reanimated';
import { Product } from '../types';
import { formatPrice } from '../utils/helpers';
import RatingCircle from './RatingCircle';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2; // Slightly wider cards for mobile
const CARD_HEIGHT = 330; // Adjusted for 3 store rows

interface ProductCardProps {
  product: Product;
  index: number;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, index }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const rotation = useSharedValue(0);

  // Sort stores by price ascending (cheapest first)
  const sortedStores = [...product.stores].sort((a, b) => a.price - b.price);
  const cheapestPrice = sortedStores[0]?.price || product.bestPrice;
  const highestPrice = sortedStores[sortedStores.length - 1]?.price || cheapestPrice;
  const priceRange = highestPrice - cheapestPrice;

  const handleFlipPress = () => {
    const newFlipped = !isFlipped;
    setIsFlipped(newFlipped);
    rotation.value = withSpring(newFlipped ? 180 : 0, {
      damping: 15,
      stiffness: 100,
    });
  };

  const openStoreUrl = (url: string) => {
    console.log('Opening URL:', url);
    Linking.openURL(url).catch((err) => console.error('Failed:', err));
  };

  const frontAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(rotation.value, [0, 180], [0, 180], Extrapolation.CLAMP)}deg` },
    ],
    backfaceVisibility: 'hidden',
  }));

  const backAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(rotation.value, [0, 180], [180, 360], Extrapolation.CLAMP)}deg` },
    ],
    backfaceVisibility: 'hidden',
  }));

  // Get row styling based on price position - cleaner design with full width colors
  const getRowStyle = (idx: number): { bg: string; border: string; text: string } => {
    if (idx === 0) return { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', text: '#22c55e' }; // Green - Best
    if (idx === 1) return { bg: 'rgba(132, 204, 22, 0.12)', border: '#84cc16', text: '#a3e635' }; // Lime
    if (idx === 2) return { bg: 'rgba(234, 179, 8, 0.12)', border: '#eab308', text: '#fbbf24' }; // Yellow
    return { bg: 'rgba(249, 115, 22, 0.12)', border: '#f97316', text: '#fb923c' }; // Orange
  };

  return (
    <Animated.View
      entering={FadeIn.delay(index * 100).springify()}
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      className="mb-4"
    >
      {/* Front of Card - Price Comparison */}
      <Animated.View
        style={[
          frontAnimatedStyle,
          {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: isFlipped ? 0 : 1,
          },
        ]}
        pointerEvents={isFlipped ? 'none' : 'auto'}
        className="bg-white/8 rounded-2xl overflow-hidden border border-white/10"
      >
        {/* Product Image */}
        <View className="relative">
          <Image
            source={{ uri: product.image }}
            style={{ width: '100%', height: 90 }}
            resizeMode="cover"
          />
          {/* Category Badge */}
          <View className="absolute top-2 right-2 bg-accent-primary/90 px-2 py-0.5 rounded">
            <Text className="text-white text-xs font-medium">{product.category}</Text>
          </View>
        </View>

        {/* Price Section */}
        <View style={{ padding: 10, flex: 1 }}>
          {/* Product Name */}
          <Text
            style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 8 }}
            numberOfLines={1}
          >
            {product.name}
          </Text>

          {/* Store Price Rows - Clean full-width design (show top 3 for mobile) */}
          {sortedStores.slice(0, 3).map((store, idx) => {
            const isLowest = idx === 0;
            const style = getRowStyle(idx);

            return (
              <Pressable
                key={`${store.name}-${idx}`}
                onPress={() => openStoreUrl(store.url)}
                style={({ pressed }) => ({
                  marginBottom: 8,
                  borderRadius: 8,
                  overflow: 'hidden',
                  opacity: pressed ? 0.6 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}
              >
                {/* Full width colored background - optimized for mobile touch */}
                <View
                  style={{
                    backgroundColor: style.bg,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: style.border + '40',
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minHeight: 48, // Better touch target for mobile
                  }}
                >
                  {/* Store name with badge */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {isLowest && (
                      <View style={{
                        backgroundColor: style.border,
                        borderRadius: 4,
                        paddingHorizontal: 4,
                        paddingVertical: 2,
                        marginRight: 6,
                      }}>
                        <Text style={{ color: '#000', fontSize: 8, fontWeight: '800' }}>BEST</Text>
                      </View>
                    )}
                    <Text
                      style={{
                        fontSize: 13,
                        color: isLowest ? style.text : 'rgba(255,255,255,0.9)',
                        fontWeight: isLowest ? '700' : '500',
                      }}
                    >
                      {store.name.split(' ')[0]}
                    </Text>
                  </View>

                  {/* Price with arrow */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: isLowest ? style.text : '#ffffff',
                      }}
                    >
                      {formatPrice(store.price)}
                    </Text>
                    <View style={{
                      marginLeft: 8,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      borderRadius: 10,
                      width: 20,
                      height: 20,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}>
                      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>→</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}

          {/* Reviews Button */}
          <Pressable
            onPress={handleFlipPress}
            style={({ pressed }) => ({
              marginTop: 'auto',
              backgroundColor: pressed ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.2)',
              borderRadius: 8,
              paddingVertical: 10,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(99, 102, 241, 0.4)',
            })}
          >
            <Text style={{ color: '#a5b4fc', fontSize: 12, fontWeight: '600' }}>
              ★ Reviews
            </Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Back of Card - Reviews */}
      <Animated.View
        style={[
          backAnimatedStyle,
          {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: isFlipped ? 1 : 0,
          },
        ]}
        pointerEvents={isFlipped ? 'auto' : 'none'}
        className="bg-white/8 rounded-2xl overflow-hidden border border-white/10"
      >
        <View style={{ padding: 14, flex: 1 }}>
          {/* Header */}
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 4 }} numberOfLines={1}>
            {product.name}
          </Text>

          {/* Review Source Badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <View style={{
              backgroundColor: product.reviews?.source === 'google' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(99, 102, 241, 0.2)',
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderWidth: 1,
              borderColor: product.reviews?.source === 'google' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(99, 102, 241, 0.5)',
            }}>
              <Text style={{
                fontSize: 10,
                fontWeight: '600',
                color: product.reviews?.source === 'google' ? '#22c55e' : '#a5b4fc',
              }}>
                {product.reviews?.source === 'google' ? '🔍 Google Reviews' : '🤖 AI Summary'}
              </Text>
            </View>
            {product.reviews?.reviewCount && product.reviews.reviewCount > 0 && (
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 6 }}>
                {product.reviews.reviewCount}+ reviews
              </Text>
            )}
          </View>

          {/* Rating */}
          <View style={{ alignItems: 'center', marginBottom: 10 }}>
            <RatingCircle rating={product.rating} size="medium" />
          </View>

          {/* Review Summary */}
          {product.reviews?.summary && (
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 10, textAlign: 'center' }} numberOfLines={2}>
              "{product.reviews.summary.replace(/Based on \d+\+ Google reviews\. /g, '')}"
            </Text>
          )}

          {/* Pros */}
          {product.reviews?.pros && product.reviews.pros.length > 0 && (
            <View style={{ marginBottom: 6 }}>
              <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '600', marginBottom: 2 }}>✓ Pros</Text>
              {product.reviews.pros.slice(0, 2).map((pro, idx) => (
                <Text key={idx} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginLeft: 8 }} numberOfLines={1}>
                  • {pro}
                </Text>
              ))}
            </View>
          )}

          {/* Cons */}
          {product.reviews?.cons && product.reviews.cons.length > 0 && (
            <View style={{ marginBottom: 6 }}>
              <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '600', marginBottom: 2 }}>✗ Cons</Text>
              {product.reviews.cons.slice(0, 2).map((con, idx) => (
                <Text key={idx} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginLeft: 8 }} numberOfLines={1}>
                  • {con}
                </Text>
              ))}
            </View>
          )}

          {/* Back to Prices Button */}
          <Pressable
            onPress={handleFlipPress}
            style={({ pressed }) => ({
              marginTop: 'auto',
              backgroundColor: pressed ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.2)',
              borderRadius: 8,
              paddingVertical: 10,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: 'rgba(99, 102, 241, 0.4)',
            })}
          >
            <Text style={{ color: '#a5b4fc', fontSize: 12, fontWeight: '600' }}>
              ← Prices
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
};

export default ProductCard;

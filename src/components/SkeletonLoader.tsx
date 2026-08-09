import React, { useEffect } from 'react';
import { View, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 60) / 2;

interface SkeletonLoaderProps {
  count?: number;
}

const SkeletonCard: React.FC<{ index: number }> = ({ index }) => {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1500 }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          shimmer.value,
          [0, 1],
          [-CARD_WIDTH, CARD_WIDTH]
        ),
      },
    ],
  }));

  return (
    <View
      className="bg-white/5 rounded-2xl overflow-hidden mb-4"
      style={{ width: CARD_WIDTH }}
    >
      {/* Image placeholder */}
      <View className="h-32 bg-white/10 overflow-hidden">
        <Animated.View style={[{ width: '100%', height: '100%' }, animatedStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.1)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: '100%', height: '100%' }}
          />
        </Animated.View>
      </View>

      <View className="p-3">
        {/* Title placeholder */}
        <View className="h-4 bg-white/10 rounded mb-2 w-3/4 overflow-hidden">
          <Animated.View style={[{ width: '100%', height: '100%' }, animatedStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.1)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: '100%', height: '100%' }}
            />
          </Animated.View>
        </View>

        {/* Description placeholder */}
        <View className="h-3 bg-white/10 rounded mb-1 w-full overflow-hidden">
          <Animated.View style={[{ width: '100%', height: '100%' }, animatedStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.1)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: '100%', height: '100%' }}
            />
          </Animated.View>
        </View>
        <View className="h-3 bg-white/10 rounded mb-3 w-2/3 overflow-hidden">
          <Animated.View style={[{ width: '100%', height: '100%' }, animatedStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.1)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: '100%', height: '100%' }}
            />
          </Animated.View>
        </View>

        {/* Price placeholder */}
        <View className="h-5 bg-white/10 rounded w-1/2 overflow-hidden">
          <Animated.View style={[{ width: '100%', height: '100%' }, animatedStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.1)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: '100%', height: '100%' }}
            />
          </Animated.View>
        </View>
      </View>
    </View>
  );
};

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ count = 4 }) => {
  return (
    <View className="flex-row flex-wrap justify-between px-5">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} index={index} />
      ))}
    </View>
  );
};

export default SkeletonLoader;

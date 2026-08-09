import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Category } from '../types';

interface CategoryChipsProps {
  categories: Category[];
  selectedCategory: string;
  onCategoryPress: (category: Category) => void;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const CategoryChip: React.FC<{
  category: Category;
  isSelected: boolean;
  onPress: () => void;
}> = ({ category, isSelected, onPress }) => {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedTouchable
      style={animatedStyle}
      className={`px-5 py-2 rounded-full mr-2 ${
        isSelected ? 'bg-accent-primary' : 'bg-white/10'
      }`}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.7}
    >
      <Text
        className={`text-sm font-medium ${
          isSelected ? 'text-white' : 'text-white/70'
        }`}
      >
        {category.name}
      </Text>
    </AnimatedTouchable>
  );
};

export const CategoryChips: React.FC<CategoryChipsProps> = ({
  categories,
  selectedCategory,
  onCategoryPress,
}) => {
  return (
    <View className="mb-4">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
      >
        <View className="flex-row items-center mr-3">
          <Text className="text-white/50 text-lg">⚙️</Text>
        </View>
        {categories.map((category) => (
          <CategoryChip
            key={category.id}
            category={category}
            isSelected={selectedCategory === category.value}
            onPress={() => onCategoryPress(category)}
          />
        ))}
      </ScrollView>
    </View>
  );
};

export default CategoryChips;

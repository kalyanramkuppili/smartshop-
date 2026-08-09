import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { PromptChip } from '../types';

interface PromptChipsProps {
  chips: PromptChip[];
  onChipPress: (chip: PromptChip) => void;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const Chip: React.FC<{ chip: PromptChip; onPress: () => void }> = ({ chip, onPress }) => {
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
      className="bg-white/10 px-4 py-2.5 rounded-full mr-3 border border-white/20"
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.7}
    >
      <Text className="text-white text-sm">{chip.text}</Text>
    </AnimatedTouchable>
  );
};

export const PromptChips: React.FC<PromptChipsProps> = ({ chips, onChipPress }) => {
  return (
    <View className="mb-6">
      <View className="flex-row items-center px-5 mb-3">
        <Text className="text-yellow-400 mr-2">✨</Text>
        <Text className="text-white/70 text-sm font-medium">Try these searches</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
      >
        {chips.map((chip) => (
          <Chip key={chip.id} chip={chip} onPress={() => onChipPress(chip)} />
        ))}
      </ScrollView>
    </View>
  );
};

export default PromptChips;

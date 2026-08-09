import React from 'react';
import { View, Text } from 'react-native';

const features = [
  { emoji: '💰', label: 'Price Compare' },
  { emoji: '🏪', label: 'Multi-Store' },
  { emoji: '⭐', label: 'AI Reviews' },
  { emoji: '🔗', label: 'Direct Links' },
];

export const FeatureGrid: React.FC = () => {
  return (
    <View className="flex-row justify-center flex-wrap gap-2">
      {features.map((f) => (
        <View
          key={f.label}
          className="flex-row items-center bg-white/8 border border-white/10 rounded-full px-3 py-1.5"
        >
          <Text className="text-sm mr-1.5">{f.emoji}</Text>
          <Text className="text-white/60 text-xs font-medium">{f.label}</Text>
        </View>
      ))}
    </View>
  );
};

export default FeatureGrid;

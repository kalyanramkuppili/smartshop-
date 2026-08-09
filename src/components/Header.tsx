import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface HeaderProps {
  showLogo?: boolean;
  centered?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ showLogo = true, centered = false }) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      className={`px-5 pb-2 ${centered ? 'items-center' : 'items-start'}`}
      style={{ paddingTop: insets.top + 10 }}
    >
      {showLogo && (
        <View className="flex-row items-center">
          <View className="w-8 h-8 bg-accent-primary rounded-lg items-center justify-center mr-2">
            <Text className="text-white text-lg font-bold">S</Text>
          </View>
          <Text className="text-white text-2xl font-bold">
            smart<Text className="text-accent-primary">SHOP</Text>
          </Text>
        </View>
      )}
    </View>
  );
};

export default Header;

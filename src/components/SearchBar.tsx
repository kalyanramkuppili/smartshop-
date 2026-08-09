import React, { useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, Platform, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

interface SearchBarProps {
  initialValue?: string;
  placeholder?: string;
  onSearch: (query: string) => void;
  autoFocus?: boolean;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export const SearchBar: React.FC<SearchBarProps> = ({
  initialValue = '',
  placeholder = 'Search for products, categories...',
  onSearch,
  autoFocus = false,
}) => {
  const [query, setQuery] = useState(initialValue);
  const buttonScale = useSharedValue(1);

  // Update query when initialValue changes
  useEffect(() => {
    if (initialValue) {
      setQuery(initialValue);
    }
  }, [initialValue]);

  const handleSearch = () => {
    const searchTerm = query.trim();
    if (searchTerm) {
      console.log('Searching for:', searchTerm);
      onSearch(searchTerm);
    }
  };

  const handlePressIn = () => {
    buttonScale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    buttonScale.value = withSpring(1);
  };

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  // Web-specific input style
  const inputStyle = Platform.select({
    web: {
      flex: 1,
      color: 'white',
      fontSize: 16,
      backgroundColor: 'transparent',
      border: 'none',
      outline: 'none',
      padding: 0,
      margin: 0,
    },
    default: {
      flex: 1,
      color: 'white',
      fontSize: 16,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <Text style={styles.icon}>🔍</Text>
        <TextInput
          style={inputStyle as any}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.4)"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <AnimatedTouchable
        style={[styles.button, animatedButtonStyle]}
        onPress={handleSearch}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Search</Text>
      </AnimatedTouchable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
    opacity: 0.5,
  },
  button: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    margin: 4,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default SearchBar;

/*
 * screens/HomeScreen.tsx — The landing screen of the smartSHOP app.
 *
 * This is the first screen the user sees when they open the app. It contains:
 *   - A centered logo rendered by the Header component.
 *   - A hero headline and subtitle that explain what the app does.
 *   - A SearchBar where the user types a product query.
 *   - A FeatureGrid that highlights key app capabilities (e.g. price comparison, AI picks).
 *
 * The entire screen uses a dark gradient background and animates each section in
 * sequentially using react-native-reanimated's FadeIn / FadeInDown presets so that
 * the UI feels polished and alive on first load.
 *
 * When the user submits a search, the screen navigates to the Results screen and
 * passes the query string as a route parameter.
 */

import React from 'react';
import { View, Text, StatusBar } from 'react-native'; // Core React Native layout and text primitives
import { LinearGradient } from 'expo-linear-gradient'; // Renders the multi-stop dark background gradient
import { NativeStackNavigationProp } from '@react-navigation/native-stack'; // Type for the stack navigator's navigation prop
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'; // Animated wrapper and entrance animation presets
import { Header, SearchBar, FeatureGrid } from '../components'; // Shared UI components used on this screen
import { RootStackParamList } from '../types'; // Central type definition for all named routes in the app

// Narrows the navigation prop type specifically to the "Home" route so TypeScript
// can validate which screens we are allowed to navigate to from here.
type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

// Describes the props this component expects from the navigator.
// The navigator automatically injects the navigation object.
interface HomeScreenProps {
  navigation: HomeScreenNavigationProp; // Provides navigate(), goBack(), etc.
}

// HomeScreen is a functional component typed with the props interface above.
// It destructures navigation directly from the props for convenience.
export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {

  // Called by the SearchBar when the user submits a search query.
  // Navigates to the Results screen and passes the query as a route parameter
  // so the Results screen knows what products to look up.
  const handleSearch = (query: string) => {
    navigation.navigate('Results', { query });
  };

  return (
    // Full-screen dark gradient — transitions from deep navy (#1a1a2e) through
    // a slightly lighter navy (#16213e) to near-black (#0f0f1a).
    <LinearGradient
      colors={['#1a1a2e', '#16213e', '#0f0f1a']}
      className="flex-1" // Takes up the entire available screen height
    >
      {/* Forces the device status-bar icons (time, battery, etc.) to render in light/white mode
          so they remain visible against the dark gradient background. */}
      <StatusBar barStyle="light-content" />

      {/* Main content column — vertically centered with horizontal padding. */}
      <View className="flex-1 justify-center px-5">

        {/* Logo section — fades in first (100 ms delay) with a spring easing for a bouncy feel. */}
        <Animated.View entering={FadeIn.delay(100).springify()} className="items-center mb-10">
          {/* Renders the smartSHOP logo; showLogo and centered are boolean props that
              tell the Header component to display the logo image and align it to the center. */}
          <Header showLogo centered />
        </Animated.View>

        {/* Hero text section — fades in second (200 ms delay) after the logo has appeared. */}
        <Animated.View entering={FadeIn.delay(200).springify()} className="items-center mb-8">
          {/* Main headline — large, bold, centered white text */}
          <Text className="text-white text-4xl font-bold text-center mb-2">
            Find the Best{' '}
            {/* The word "Deals" is rendered in the app's primary accent colour to draw the eye. */}
            <Text className="text-accent-primary">Deals</Text>
          </Text>
          {/* Supporting sub-headline — dimmed (50 % opacity) to create visual hierarchy */}
          <Text className="text-white/50 text-center text-base leading-6 mt-2">
            Compare prices across Amazon, Flipkart & more
          </Text>
        </Animated.View>

        {/* Search bar — slides in from below (FadeInDown) at 300 ms so it arrives after the text. */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          {/* SearchBar calls handleSearch when the user presses the search button or submit key. */}
          <SearchBar onSearch={handleSearch} placeholder="Search for any product..." />
        </Animated.View>

        {/* Feature grid — slides in last (500 ms) so the eye is drawn down to it after the search bar. */}
        <Animated.View entering={FadeInDown.delay(500).springify()} className="mt-6">
          {/* FeatureGrid renders a set of tag/badge chips that summarise app features
              (e.g. "AI Picks", "Price Alerts", "Multi-store Comparison"). */}
          <FeatureGrid />
        </Animated.View>

      </View>
    </LinearGradient>
  );
};

// Default export so React Navigation (and any lazy-import code) can import this screen
// without having to use named-import syntax.
export default HomeScreen;

/*
 * config/index.ts — Central configuration file for the smartSHOP app.
 *
 * This file stores the API keys used by the three external services the app depends on:
 *   1. Groq  — an AI inference service that powers product recommendations.
 *   2. SerpAPI — a Google Search scraping service that fetches real product images and links.
 *   3. ZenRows — a web-scraping proxy service used to pull live prices and resolve redirect URLs.
 *
 * It also exports three helper functions that other parts of the app can call to check whether
 * each API key has been properly set before making any network requests.
 *
 * NOTE: In a production app, API keys should never be hard-coded here. They should be loaded
 * from environment variables (e.g. via a .env file and a package like react-native-config).
 */

// API Keys for smartSHOP
// In production, use environment variables

// Groq API - for AI-powered product recommendations
// Get FREE key at: https://console.groq.com/keys
// const GROQ_API_KEY = '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';
// Active Groq API key — the key that is actually used at runtime
const GROQ_API_KEY = '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'
// SerpAPI - for real product images and direct links (OPTIONAL)
// Get FREE key at: https://serpapi.com/ (100 searches/month free)
// Abhinav
const SERP_API_KEY = 'a2765f225d6d077650e7b0442bf5c05feaa9f7f6d265a7586a8e88c00e993cd7';
// kalyan
// Active SerpAPI key — swap this line with one of the commented alternatives to switch accounts
// const SERP_API_KEY = '1f230c6a13e3d37ef7e970a242adb32e3f39758decad2bd025f0b7c0886323c8';
// ganga
// const SERP_API_KEY = '4dc5fee8e83314ebe5450af9ad40f8acadb587a6d06eec1147f0e338f5f4ee81';

// ZenRows API - for scraping real-time prices & resolving redirect URLs
// Get your key at: https://www.zenrows.com/ (1,000 free credits/month)
// Replace the placeholder below with your actual ZenRows API key
// Active ZenRows API key used for web scraping and price resolution
const ZENROWS_API_KEY = '91369a3959964c75b0e7f4db8b10f40323e45f54';
// const ZENROWS_API_KEY = '9bcc50fbbb3f3930966f32fc5bf0d43f66a6e7dd';
// const ZENROWS_API_KEY = '';
// TypeScript interface that describes the shape of the app's configuration object.
// Every field is a string because API keys are always string values.
interface AppConfig {
  groqApiKey: string;    // Groq AI service key
  serpApiKey: string;    // SerpAPI search scraping key
  zenRowsApiKey: string; // ZenRows web scraping / proxy key
}

// The single exported config object that bundles all three API keys together.
// Import this object anywhere in the app that needs to make an authenticated API request.
export const config: AppConfig = {
  groqApiKey: GROQ_API_KEY,       // Maps the Groq constant into the typed config shape
  serpApiKey: SERP_API_KEY,       // Maps the SerpAPI constant into the typed config shape
  zenRowsApiKey: ZENROWS_API_KEY, // Maps the ZenRows constant into the typed config shape
};

// Checks whether the Groq API key is present and looks like a valid Groq key.
// Groq keys always start with "gsk_", so that prefix acts as a quick sanity check.
// Returns true if the key is valid, false otherwise.
export const isApiKeyConfigured = (): boolean => {
  const key = config.groqApiKey; // Pull the Groq key out of the shared config object
  // Evaluate: key must exist, be non-empty, and start with the expected "gsk_" prefix
  const configured = Boolean(key && key.length > 0 && key.startsWith('gsk_'));
  // Log the result to the console so developers can quickly diagnose configuration issues
  console.log('isApiKeyConfigured:', configured, 'key starts with:', key?.substring(0, 10));
  return configured; // Return true if all checks passed, false if the key is missing or malformed
};

// Checks whether the SerpAPI key is present and has not been left as the default placeholder.
// Returns true if the key looks like a real key (non-empty and does not contain "your_").
export const isSerpApiConfigured = (): boolean => {
  // Key must be non-empty AND must not still contain the placeholder text "your_"
  return config.serpApiKey.length > 0 && !config.serpApiKey.includes('your_');
};

// Checks whether the ZenRows API key is present and has not been left as the default placeholder.
// Returns true if the key looks like a real key (non-empty and does not contain "YOUR_ZENROWS").
export const isZenRowsConfigured = (): boolean => {
  // Key must be non-empty AND must not still contain the placeholder text "YOUR_ZENROWS"
  return config.zenRowsApiKey.length > 0 && !config.zenRowsApiKey.includes('YOUR_ZENROWS');
};

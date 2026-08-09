/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        dark: {
          primary: '#1a1a2e',
          secondary: '#16213e',
          card: 'rgba(255,255,255,0.08)',
          cardHover: 'rgba(255,255,255,0.12)',
        },
        accent: {
          primary: '#6366f1',
          secondary: '#818cf8',
        },
        rating: {
          high: '#22c55e',
          medium: '#f59e0b',
          low: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};

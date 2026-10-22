/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#05060a', 900: '#090a0f', 850: '#0d0f15', 800: '#12141b', 700: '#1a1d26', 600: '#252935', 500: '#343947' },
        gold: { 200: '#ffe2ad', 300: '#ffd58a', 400: '#f3ba5c', 500: '#e0a043', 600: '#b97f2c', 700: '#7d561f' },
      },
      fontFamily: {
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(243,186,92,.35), 0 0 24px -4px rgba(243,186,92,.45)',
      },
    },
  },
  plugins: [],
};

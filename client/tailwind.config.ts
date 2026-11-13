import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: '#1a1a2e',
          deep: '#13132a',
          raised: '#232343',
        },
        accent: {
          DEFAULT: '#8b7cf6',
          soft: '#b4aaff',
          deep: '#6c5ce7',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 0 0 rgba(139, 124, 246, 0)' },
          '30%': { boxShadow: '0 0 28px 2px rgba(139, 124, 246, 0.45)' },
          '100%': { boxShadow: '0 0 0 0 rgba(139, 124, 246, 0)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        glow: 'glow 1.2s ease-out',
        'fade-in': 'fade-in 0.3s ease',
      },
    },
  },
  plugins: [],
} satisfies Config;

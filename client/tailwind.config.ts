import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0f0f1a',
        surface: '#161625',
        'surface-2': '#1e1e32',
        border: 'rgba(255,255,255,0.08)',
        accent: '#5b6af5',
        'accent-hover': '#4a59e8',
        muted: 'rgba(255,255,255,0.45)',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      backdropBlur: {
        xs: '4px',
      },
    },
  },
  plugins: [],
} satisfies Config;

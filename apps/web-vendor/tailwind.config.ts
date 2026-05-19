import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: '#1E40AF',
        'brand-hover': '#1E3A8A',
        accent: {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
        },
        bg: '#F8FAFC',
        card: '#FFFFFF',
        'text-primary': '#0F172A',
        'text-secondary': '#475569',
        success: '#22C55E',
        danger: '#EF4444',
        warning: '#F59E0B',
        border: '#E2E8F0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        sidebar: '#0F172A',
        'sidebar-hover': '#1E293B',
        accent: {
          DEFAULT: '#3B82F6',
          hover: '#2563EB',
        },
        bg: '#F1F5F9',
        card: '#FFFFFF',
        'text-primary': '#0F172A',
        'text-secondary': '#475569',
        success: '#22C55E',
        danger: '#EF4444',
        border: '#E2E8F0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        sidebar: '260px',
      },
    },
  },
  plugins: [],
};

export default config;

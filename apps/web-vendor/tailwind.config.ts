import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0A1428',
          900: '#0F172A',
          800: '#1E2A4A',
          700: '#1E293B',
        },
        electric: {
          400: '#00F0FF',
          500: '#00B4FF',
          600: '#0099D9',
        },
        success: '#34D399',
        warning: '#FBBF24',
        danger: '#FB7185',

        // Legacy aliases — repointed to light-theme values so any not-yet-rewritten code renders correctly.
        brand: '#00B4FF',
        'brand-hover': '#0099D9',
        accent: {
          DEFAULT: '#00B4FF',
          hover: '#0099D9',
        },
        bg: '#FFFFFF',
        card: '#FFFFFF',
        'text-primary': '#0F172A',
        'text-secondary': 'rgba(15, 23, 42, 0.6)',
        border: 'rgba(15, 23, 42, 0.1)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
      },
      backgroundImage: {
        'light-gradient': 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
        'navy-gradient': 'linear-gradient(135deg, #0A1428 0%, #1E2A4A 100%)',
        'electric-gradient': 'linear-gradient(90deg, #00B4FF, #00F0FF)',
      },
      boxShadow: {
        electric: '0 25px 50px -12px rgba(0, 180, 255, 0.15)',
        'electric-sm': '0 15px 35px -10px rgba(0, 180, 255, 0.35)',
        'electric-ring': '0 0 0 4px rgba(0, 180, 255, 0.25)',
      },
      letterSpacing: {
        widest2: '0.25em',
      },
    },
  },
  plugins: [],
};

export default config;

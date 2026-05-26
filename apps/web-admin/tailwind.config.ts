import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#022448',
          container: '#1e3a5f',
          fixed: '#d5e3ff',
          'fixed-dim': '#adc8f5',
        },
        'on-primary': {
          DEFAULT: '#ffffff',
          container: '#8aa4cf',
          fixed: '#001c3b',
          'fixed-variant': '#2d486d',
        },
        secondary: {
          DEFAULT: '#0051d5',
          container: '#316bf3',
          fixed: '#dbe1ff',
          'fixed-dim': '#b4c5ff',
        },
        'on-secondary': {
          DEFAULT: '#ffffff',
          container: '#fefcff',
          fixed: '#00174b',
          'fixed-variant': '#003ea8',
        },
        tertiary: {
          DEFAULT: '#341f00',
          container: '#503300',
          fixed: '#ffddb2',
          'fixed-dim': '#edbf7f',
        },
        'on-tertiary': {
          DEFAULT: '#ffffff',
          container: '#c69b5f',
          fixed: '#291800',
          'fixed-variant': '#60410c',
        },
        error: {
          DEFAULT: '#ba1a1a',
          container: '#ffdad6',
        },
        'on-error': {
          DEFAULT: '#ffffff',
          container: '#93000a',
        },
        background: '#faf9fc',
        'on-background': '#1a1c1e',
        surface: {
          DEFAULT: '#faf9fc',
          bright: '#faf9fc',
          dim: '#dad9dd',
          variant: '#e3e2e6',
          tint: '#455f87',
        },
        'surface-container': {
          DEFAULT: '#eeedf1',
          lowest: '#ffffff',
          low: '#f4f3f7',
          high: '#e9e7eb',
          highest: '#e3e2e6',
        },
        'on-surface': {
          DEFAULT: '#1a1c1e',
          variant: '#43474e',
        },
        'inverse-surface': '#2f3033',
        'inverse-on-surface': '#f1f0f4',
        'inverse-primary': '#adc8f5',
        outline: {
          DEFAULT: '#74777f',
          variant: '#c4c6cf',
        },
        success: '#22c55e',
        warning: '#f59e0b',

        sidebar: '#022448',
        'sidebar-hover': '#1e3a5f',
        accent: {
          DEFAULT: '#0051d5',
          hover: '#003ea8',
        },
        bg: '#faf9fc',
        card: '#ffffff',
        'text-primary': '#1a1c1e',
        'text-secondary': '#43474e',
        danger: '#ba1a1a',
        border: '#c4c6cf',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-sm': ['11px', { lineHeight: '14px', fontWeight: '500' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '500' }],
        'title-sm': ['16px', { lineHeight: '24px', fontWeight: '600' }],
        'title-lg': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'display-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      spacing: {
        sidebar: '260px',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
      },
    },
  },
  plugins: [],
};

export default config;

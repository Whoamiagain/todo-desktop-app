/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-bg': '#0f172a',
        'brand-surface': '#1e293b',
        'brand-surface-highlight': '#334155',
        'brand-accent': '#3b82f6',
        'brand-accent-hover': '#2563eb',
        'brand-text': '#f8fafc',
        'brand-muted': '#94a3b8',
      },
    },
  },
  plugins: [],
};


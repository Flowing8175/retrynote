/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'oklch(0.95 0.04 175)',
          100: 'oklch(0.90 0.06 175)',
          200: 'oklch(0.80 0.10 175)',
          300: 'oklch(0.75 0.12 175)',
          400: 'oklch(0.70 0.14 175)',
          500: 'oklch(0.65 0.15 175)',
          600: 'oklch(0.58 0.15 175)',
          700: 'oklch(0.50 0.14 175)',
          800: 'oklch(0.42 0.12 175)',
          900: 'oklch(0.35 0.10 175)',
        },
        surface: {
          DEFAULT: 'oklch(0.20 0.01 250)',
          deep: 'oklch(0.13 0.01 250)',
          raised: 'oklch(0.24 0.01 250)',
          hover: 'oklch(0.28 0.01 250)',
          border: 'oklch(0.24 0.01 250)',
          'border-subtle': 'oklch(0.20 0.008 250)',
        },
        content: {
          primary: 'oklch(0.94 0.005 250)',
          secondary: 'oklch(0.72 0.01 250)',
          muted: 'oklch(0.55 0.01 250)',
          inverse: 'oklch(0.15 0.01 250)',
        },
        semantic: {
          success: 'oklch(0.72 0.17 160)',
          'success-bg': 'oklch(0.22 0.04 160)',
          'success-border': 'oklch(0.35 0.06 160)',
          error: 'oklch(0.68 0.18 15)',
          'error-bg': 'oklch(0.22 0.05 15)',
          'error-border': 'oklch(0.35 0.07 15)',
          warning: 'oklch(0.78 0.14 85)',
          'warning-bg': 'oklch(0.24 0.04 85)',
          'warning-border': 'oklch(0.38 0.06 85)',
          info: 'oklch(0.70 0.10 250)',
          'info-bg': 'oklch(0.22 0.03 250)',
          'info-border': 'oklch(0.35 0.04 250)',
        },
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', '-apple-system', 'sans-serif'],
        body: ['SUIT Variable', 'Pretendard Variable', 'Noto Sans KR', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}

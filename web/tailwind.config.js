/** @type {import('tailwindcss').Config} */
export default {
  // `relative: true` resolves these globs from this file (web/), not the cwd.
  content: {
    relative: true,
    files: ['./index.html', './src/**/*.{ts,tsx}'],
  },
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      fontFamily: {
        sans: ['Roboto', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'Consolas', 'SFMono-Regular', 'ui-monospace', 'monospace'],
      },
      boxShadow: { glow: '0 0 32px rgba(35, 123, 255, .22)' },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#71717a",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#09090b",
        },
        signal: {
          red: "#ef4444",
          amber: "#f59e0b",
          green: "#22c55e",
        },
        // Legacy aliases for gradual migration
        cyber: {
          green: "#22c55e",
          blue: "#3b82f6",
          red: "#ef4444",
          orange: "#f59e0b",
          yellow: "#eab308",
          purple: "#a855f7",
          teal: "#14b8a6",
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

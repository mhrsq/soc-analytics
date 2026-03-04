/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Cybersecurity-themed dark palette
        surface: {
          50: "#f0f4f8",
          100: "#d9e2ec",
          200: "#bcccdc",
          300: "#9fb3c8",
          400: "#829ab1",
          500: "#627d98",
          600: "#486581",
          700: "#334e68",
          800: "#243b53",
          900: "#102a43",
          950: "#0a1929",
        },
        cyber: {
          green: "#00e676",
          blue: "#00b0ff",
          red: "#ff1744",
          orange: "#ff9100",
          yellow: "#ffd600",
          purple: "#d500f9",
          teal: "#1de9b6",
        },
      },
      fontFamily: {
        sans: ['"Lato"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
      },
    },
  },
  plugins: [],
};

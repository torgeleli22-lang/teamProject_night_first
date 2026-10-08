import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f1f0ff",
          100: "#e4e2ff",
          200: "#cbc7ff",
          300: "#a9a2fd",
          400: "#8b80f9",
          500: "#6c5ff2",
          600: "#5a48e3",
          700: "#4b3ac4",
          800: "#3d329d",
          900: "#342e7c",
        },
        ink: {
          900: "#1d1b2f",
          700: "#3f3c56",
          500: "#6b6883",
          400: "#8e8ba5",
          300: "#c4c2d4",
          200: "#e6e5ef",
          100: "#f3f2f8",
          50: "#faf9fd",
        },
        mint: { 50: "#ebfaf3", 100: "#d0f3e3", 500: "#20b27a", 600: "#17945f", 700: "#127349" },
        coral: { 50: "#fff2ef", 100: "#ffe0d9", 500: "#f2694b", 600: "#d6513a", 700: "#ad3e2c" },
        sun: { 50: "#fff8e6", 100: "#ffefc2", 500: "#f5b014", 600: "#d4920a" },
        code: { bg: "#1f1d36", line: "#2b2848", text: "#e8e6ff", muted: "#8a87ad" },
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Pretendard", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "D2Coding", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(29,27,47,0.04), 0 4px 16px rgba(29,27,47,0.06)",
        lift: "0 2px 4px rgba(29,27,47,0.06), 0 12px 32px rgba(90,72,227,0.14)",
      },
      borderRadius: { "2xl": "1.125rem", "3xl": "1.5rem" },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pop: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "60%": { transform: "scale(1.04)", opacity: "1" },
          "100%": { transform: "scale(1)" },
        },
        shake: {
          "0%,100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-4px)" },
          "75%": { transform: "translateX(4px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        pop: "pop 0.4s ease-out both",
        shake: "shake 0.3s ease-in-out",
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

/** 공부 노트 콘셉트: 줄 공책 · 빨간 여백선 · 노란 형광펜 · 포스트잇 · 빨간펜 · 파란 볼펜 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        desk: "#ece8de", // 책상 (페이지 바깥)
        paper: { DEFAULT: "#fffdf6", line: "#e9ecf3", edge: "#3b3a36" },
        ink: { 900: "#24231f", 700: "#45433d", 500: "#6f6c64", 400: "#8f8b82", 300: "#c9c5bb", 200: "#e3dfd5", 100: "#f2efe7" },
        pen: { red: "#c0392b", redSoft: "#f6dedb", blue: "#1f3f9a" },
        marker: { DEFAULT: "#fde68a", soft: "#fef3c7", strong: "#fcd34d" },
        sticky: { yellow: "#fdf0a6", mint: "#d8f0e3", pink: "#fbd9df", tape: "#e2d6bd" },
        margin: "#e8a1a1",
        code: { kw: "#7c3aed", str: "#b45309", num: "#0f766e", com: "#8f8b82", fn: "#1f3f9a", bi: "#be185d" },
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Pretendard", "system-ui", "-apple-system", "sans-serif"],
        serif: ["Gowun Batang", "Nanum Myeongjo", "serif"],
        hand: ["Nanum Pen Script", "cursive"],
        mono: ["Nanum Gothic Coding", "D2Coding", "ui-monospace", "Menlo", "monospace"],
      },
      boxShadow: {
        page: "4px 4px 0 rgba(36,35,31,0.12)",
        note: "2px 3px 0 rgba(36,35,31,0.08), 0 6px 14px rgba(36,35,31,0.08)",
        btn: "3px 3px 0 #24231f",
        btnMarker: "3px 3px 0 #fcd34d",
      },
    },
  },
  plugins: [],
};

export default config;

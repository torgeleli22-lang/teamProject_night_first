import type { Metadata, Viewport } from "next";
import { AppHeader } from "@/components/AppHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "코드리딩 — 매일 하나씩 이해하는 코딩",
  description: "코드를 외우지 마세요. 읽고 이해하는 것부터 시작하세요. AI 튜터와 함께하는 JavaScript 코드 읽기 학습.",
};

export const viewport: Viewport = {
  themeColor: "#5a48e3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen">
        <AppHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}

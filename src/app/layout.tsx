import type { Metadata, Viewport } from "next";
import { NoteHeader } from "@/components/NoteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "코드 리딩 노트",
  description: "AI 가 짜 준 코드, 정말 읽을 수 있나요? 코드 옆에 메모로 흐름을 적으면 빨간펜으로 첨삭해 드려요.",
};

export const viewport: Viewport = {
  themeColor: "#ece8de",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Nanum+Gothic+Coding&family=Nanum+Pen+Script&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen">
        <div className="mx-auto max-w-[1440px] px-3 pb-16 pt-4 sm:px-6">
          <NoteHeader />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}

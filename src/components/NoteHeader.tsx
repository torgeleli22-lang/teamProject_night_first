"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 공책 위쪽: 제목(형광펜) + 오른쪽 인덱스 탭 (연습 모드 · 내 코드 점검) */
const TABS = [
  { href: "/practice", label: "연습 모드", color: "bg-sticky-yellow", match: ["/practice", "/read", "/result"] },
  { href: "/check", label: "내 코드 점검", color: "bg-sticky-mint", match: ["/check"] },
  { href: "/study", label: "내 공부", color: "bg-sticky-pink", match: ["/study"] },
];

export function NoteHeader() {
  const path = (usePathname() || "/").replace(/\/$/, "") || "/";
  return (
    <header className="flex items-end justify-between gap-3">
      <Link href="/" className="mb-1 font-serif text-xl font-bold text-ink-900 sm:text-2xl">
        코드 <span className="marker">리딩</span> 노트
      </Link>
      <nav className="flex items-end gap-1" aria-label="학습 모드">
        {TABS.map((t) => {
          const on = t.match.some((m) => path.startsWith(m));
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`border border-b-0 border-paper-edge px-3 text-xs sm:px-4 sm:text-sm ${t.color} ${
                on ? "pb-2.5 pt-2 font-bold text-ink-900" : "pb-1.5 pt-1.5 text-ink-700 hover:pb-2"
              }`}
              style={{ borderRadius: "6px 6px 0 0" }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

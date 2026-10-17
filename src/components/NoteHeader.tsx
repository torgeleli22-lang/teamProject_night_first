"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { loginUrl, logout, takeLoginFromUrl, useApi } from "@/lib/api";
import type { Me } from "@/lib/api-types";

/** 공책 위쪽: 제목(형광펜) + 오른쪽 위 로그인 + 인덱스 탭 (연습 모드 · 내 코드 점검 · 내 공부) */
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
      <div className="flex flex-col items-end gap-1.5">
        <LoginBox />
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
      </div>
    </header>
  );
}

/** 로그인 표시: 로그인 안 함 → [로그인] (Google · GitHub 고르기) / 로그인 → 이름 · 로그아웃 */
function LoginBox() {
  const [failed, setFailed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  // 로그인에서 돌아왔으면 주소의 토큰을 먼저 저장하고 나서 /me 를 부른다
  useEffect(() => {
    setFailed(takeLoginFromUrl());
    setReady(true);
  }, []);
  const { data: me } = useApi<Me>(ready ? "/me" : null);
  if (!me) return <span className="h-5" />;

  if (me.member) {
    return (
      <span className="flex items-center gap-2 text-xs text-ink-700">
        <span className="hand text-base text-pen-blue">{me.name}</span>님 ({me.provider === "github" ? "GitHub" : "Google"})
        <button type="button" className="underline hover:text-pen-red" onClick={() => logout()}>
          로그아웃
        </button>
      </span>
    );
  }
  const any = me.providers.google || me.providers.github;
  if (!any) return <span className="h-5" />;
  return (
    <span className="relative flex items-center gap-2 text-xs">
      {failed && <span className="text-pen-red">{failed}</span>}
      <button type="button" className="btn-small" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        로그인
      </button>
      {open && (
        <span className="sticky-note absolute right-0 top-8 z-50 flex w-56 flex-col gap-2 bg-sticky-yellow p-3">
          <span className="hand text-pen-red">로그인하면 공부 기록이 남아요</span>
          {me.providers.google && (
            <a href={loginUrl("google")} className="btn-line justify-start py-1.5 text-xs">
              Google로 로그인
            </a>
          )}
          {me.providers.github && (
            <a href={loginUrl("github")} className="btn-line justify-start py-1.5 text-xs">
              GitHub로 로그인
            </a>
          )}
          <span className="text-[11px] text-ink-500">이름만 받아요. 지금 탭에서 한 공부도 계정으로 옮겨요.</span>
        </span>
      )}
    </span>
  );
}

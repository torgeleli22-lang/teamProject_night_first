"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import type { MeView } from "@/api/views";
import { MobileNav, NavLinks } from "./NavLinks";

/** 상단 메뉴. 레벨·XP·연속 학습은 API(/me)에서 받아 온다 (요약 테이블만 읽음) */
export function AppHeader() {
  const { data: me } = useApi<MeView>("/me");
  return (
    <>
      {me?.aiMode === "mock" && (
        <div className="relative z-40 bg-sun-100/80 px-4 py-1.5 text-center text-xs font-semibold text-sun-600 backdrop-blur">
          🧪 목업 AI 모드 — AI 응답은 흉내 낸 결과예요.{" "}
          <Link href="/demo" className="underline underline-offset-2">
            데모 데이터 바꾸기
          </Link>
        </div>
      )}
      <header className="sticky top-0 z-30 px-3 pt-3">
        <div className="glass-bar mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-ink-900">
            <span className="glass-orb grid h-8 w-8 place-items-center rounded-xl font-mono text-sm text-white">{"{ }"}</span>
            <span className="text-[15px]">코드리딩</span>
          </Link>
          <NavLinks />
          {me && me.totalSolved > 0 && (
            <div className="ml-auto flex items-center gap-2 text-sm font-semibold">
              <span className="chip bg-sun-50/80 text-sun-600" title="연속 학습일">
                🔥 {me.streak}일
              </span>
              <span className="chip bg-brand-50/80 text-brand-700" title="학습 레벨">
                Lv.{me.level} · {me.xp} XP
              </span>
            </div>
          )}
        </div>
      </header>
      <MobileNav />
    </>
  );
}

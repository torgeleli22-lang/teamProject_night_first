"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { learnerLevel, streakDays, useHydrated, useProgress } from "@/lib/progress-store";

const NAV = [
  { href: "/learn", label: "학습 홈", icon: "🏠" },
  { href: "/concepts", label: "개념", icon: "🧭" },
  { href: "/dashboard", label: "내 학습", icon: "📊" },
];

export function AppHeader() {
  const pathname = usePathname();
  const progress = useProgress();
  const hydrated = useHydrated();
  const inPractice = pathname.startsWith("/practice");
  const streak = streakDays(progress);
  const { level } = learnerLevel(progress.xp);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-ink-200/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-ink-900">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 font-mono text-sm text-white">{"{ }"}</span>
            <span className="text-[15px]">코드리딩</span>
          </Link>
          {!inPractice && (
            <nav className="ml-4 hidden items-center gap-1 sm:flex" aria-label="주요 메뉴">
              {NAV.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      active ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
          {hydrated && progress.attempts.length > 0 && (
            <div className="ml-auto flex items-center gap-2 text-sm font-semibold">
              <span className="chip bg-sun-50 text-sun-600" title="연속 학습일">
                🔥 {streak}일
              </span>
              <span className="chip bg-brand-50 text-brand-700" title="학습 레벨">
                Lv.{level} · {progress.xp} XP
              </span>
            </div>
          )}
        </div>
      </header>
      {!inPractice && pathname !== "/" && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
          aria-label="하단 메뉴"
        >
          <div className="grid grid-cols-3">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${
                    active ? "text-brand-700" : "text-ink-400"
                  }`}
                >
                  <span className="text-lg leading-none" aria-hidden>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}

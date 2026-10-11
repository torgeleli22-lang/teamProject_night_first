"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/learn", label: "학습", icon: "📘" },
  { href: "/review", label: "복습", icon: "🔁" },
  { href: "/ranking", label: "랭킹", icon: "🏆" },
  { href: "/dashboard", label: "내 학습", icon: "📊" },
  { href: "/concepts", label: "탐색", icon: "🧭" },
];
/** 모바일 하단 메뉴는 핵심 4개만 */
const MOBILE_NAV = NAV.slice(0, 4);

export function NavLinks() {
  const pathname = usePathname();
  if (pathname.startsWith("/practice") || pathname.startsWith("/admin")) return null;
  return (
    <nav className="ml-4 hidden items-center gap-1 sm:flex" aria-label="주요 메뉴">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              active ? "glass-pill text-brand-700" : "text-ink-500 hover:bg-white/50 hover:text-ink-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * 모바일 하단 메뉴. 헤더(유리 효과 = backdrop-filter) 안에 두면 position: fixed 의 기준이 헤더가 되어
 * 화면 아래에 붙지 않으므로, 헤더 밖에서 따로 그린다.
 */
export function MobileNav() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/practice") || pathname.startsWith("/admin")) return null;
  return (
    <nav
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 sm:hidden"
      aria-label="하단 메뉴"
    >
      <div className="glass-bar grid grid-cols-4 px-2">
        {MOBILE_NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`my-1.5 flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-semibold ${active ? "glass-pill text-brand-700" : "text-ink-400"}`}
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
  );
}

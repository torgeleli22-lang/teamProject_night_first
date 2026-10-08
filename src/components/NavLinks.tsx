"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/learn", label: "학습 홈", icon: "🏠" },
  { href: "/concepts", label: "탐색", icon: "🧭" },
  { href: "/dashboard", label: "내 학습", icon: "📊" },
];

export function NavLinks() {
  const pathname = usePathname();
  if (pathname.startsWith("/practice") || pathname.startsWith("/admin")) return null;
  return (
    <>
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
      {pathname !== "/" && (
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
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${active ? "text-brand-700" : "text-ink-400"}`}
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

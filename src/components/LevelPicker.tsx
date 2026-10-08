"use client";

import Link from "next/link";
import { useState } from "react";
import { LEVELS } from "@/lib/curriculum";
import type { Level } from "@/lib/types";

/**
 * 오늘의 난이도 선택. 추천 난이도는 보여주기만 하고 자동으로 바꾸지 않는다.
 */
export function LevelPicker({ initial, suggested, concept }: { initial: Level; suggested: Level | null; concept?: string }) {
  const [level, setLevel] = useState<Level>(initial);
  const info = LEVELS[level - 1];
  const href = `/practice?level=${level}${concept ? `&concept=${concept}` : ""}`;

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-ink-500">오늘의 난이도를 선택하세요</p>
      <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="난이도">
        {LEVELS.map((l) => {
          const active = l.level === level;
          return (
            <button
              key={l.level}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setLevel(l.level)}
              className={`relative flex flex-col items-center gap-1 rounded-2xl border px-1 py-3 transition ${
                active ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20" : "border-ink-200 bg-white hover:border-brand-300"
              }`}
            >
              {suggested === l.level && (
                <span className="absolute -top-2 rounded-full bg-sun-500 px-1.5 text-[10px] font-bold text-white">추천</span>
              )}
              <span className="text-xl" aria-hidden>
                {l.emoji}
              </span>
              <span className={`text-[13px] font-bold ${active ? "text-brand-700" : "text-ink-700"}`}>{l.name}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-500">
        <b className="text-ink-700">Level {info.level} · {info.skillLabel}</b> — {info.description}
      </div>
      <Link href={href} className="btn-primary mt-4 w-full py-3.5 text-base">
        학습 시작하기 →
      </Link>
    </div>
  );
}

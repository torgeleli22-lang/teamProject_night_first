"use client";

import { Spinner } from "@/components/ui";

export const HINT_STEPS = ["생각해 보기", "핵심 짚기", "문법 설명", "방향 제시"];

export function HintList({ hints, loading }: { hints: string[]; loading: boolean }) {
  if (hints.length === 0 && !loading) return null;
  return (
    <ol className="grid gap-2.5" aria-live="polite">
      {hints.map((hint, i) => (
        <li key={i} className="animate-fade-up rounded-2xl border border-sun-100 bg-sun-50/70 p-4">
          <p className="mb-1 text-xs font-bold text-sun-600">
            💡 힌트 {i + 1}단계 · {HINT_STEPS[i]}
          </p>
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-700">{hint}</p>
        </li>
      ))}
      {loading && (
        <li className="flex items-center gap-2 rounded-2xl border border-sun-100 bg-sun-50/50 p-4 text-sm text-sun-600">
          <Spinner /> 튜터가 힌트를 고르고 있어요…
        </li>
      )}
    </ol>
  );
}

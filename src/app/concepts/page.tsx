"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConceptSheet } from "@/components/practice/ConceptSheet";
import { DifficultyDots, ProgressBar, masteryTone } from "@/components/ui";
import { CONCEPTS, LEVELS } from "@/lib/curriculum";
import { computeConceptStats, isWeak } from "@/lib/mastery";
import { PROBLEMS, problemsForConcept, typeLabel } from "@/lib/problems";
import { useHydrated, useProgress } from "@/lib/progress-store";
import { currentLevelId } from "@/lib/recommend";
import type { Problem } from "@/lib/types";

const TYPE_FILTERS: { id: string; label: string; match: (p: Problem) => boolean }[] = [
  { id: "all", label: "전체", match: () => true },
  { id: "predict", label: "결과 예측", match: (p) => p.type === "predict" || (p.type === "choice" && p.subtype === "predict") },
  { id: "blank", label: "빈칸·개념", match: (p) => p.type === "choice" && p.subtype !== "predict" },
  { id: "bug", label: "오류 찾기", match: (p) => p.type === "bug" },
  { id: "order", label: "순서 맞추기", match: (p) => p.type === "order" },
  { id: "explain", label: "코드 설명", match: (p) => p.type === "explain" },
];

export default function ConceptsPage() {
  const progress = useProgress();
  const hydrated = useHydrated();
  const stats = useMemo(() => computeConceptStats(progress.attempts), [progress.attempts]);
  const solved = useMemo(() => {
    const map = new Map<string, boolean>();
    progress.attempts.forEach((a) => map.set(a.problemId, map.get(a.problemId) || a.correct));
    return map;
  }, [progress.attempts]);
  const current = currentLevelId(stats);

  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const match = TYPE_FILTERS.find((f) => f.id === filter)!.match;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-8 sm:pb-16">
      <h1 className="text-[26px] font-extrabold tracking-tight">개념별 학습</h1>
      <p className="mt-1 text-ink-500">
        {CONCEPTS.length}개 개념 · {PROBLEMS.length}개 문제. 궁금한 개념을 골라 바로 풀어보세요.
      </p>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="문제 유형">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
              filter === f.id ? "bg-ink-900 text-white" : "bg-white text-ink-500 ring-1 ring-ink-200 hover:text-ink-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-8">
        {LEVELS.map((level) => (
          <section key={level.id} aria-labelledby={`level-${level.id}`}>
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-xl shadow-card">{level.emoji}</span>
              <div>
                <h2 id={`level-${level.id}`} className="font-extrabold">
                  <span className="mr-1.5 font-mono text-xs text-ink-400">LEVEL {level.id}</span>
                  {level.title}
                </h2>
                <p className="text-sm text-ink-500">{level.description}</p>
              </div>
              {hydrated && level.id === current && <span className="chip ml-auto bg-brand-600 text-white">지금 여기</span>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {level.conceptIds.map((id) => {
                const concept = CONCEPTS.find((c) => c.id === id)!;
                const stat = stats.get(id);
                const mastery = hydrated ? (stat?.mastery ?? 0) : 0;
                const problems = problemsForConcept(id).filter(match);
                const expanded = open === id;
                return (
                  <div key={id} className={`card p-4 transition ${expanded ? "sm:col-span-2" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold">{concept.name}</p>
                          {hydrated && isWeak(stat) && <span className="chip bg-sun-50 text-sun-600">복습 추천</span>}
                          {hydrated && mastery >= 80 && <span className="chip bg-mint-50 text-mint-700">✓ 익힘</span>}
                        </div>
                        <p className="mt-0.5 text-sm text-ink-500">{concept.keyIdea}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1">
                        <ProgressBar value={mastery} tone={masteryTone(mastery)} size="sm" label={`${concept.name} 이해도`} />
                      </div>
                      <span className="w-9 text-right font-mono text-xs text-ink-400">{mastery}%</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Link href={`/practice?concept=${id}`} className="btn-primary px-4 py-2 text-sm">
                        풀어보기
                      </Link>
                      <button type="button" onClick={() => setSheet(id)} className="btn-ghost px-3 py-2 text-sm">
                        📖 개념
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : id)}
                        aria-expanded={expanded}
                        className="btn-ghost ml-auto px-3 py-2 text-sm"
                      >
                        문제 {problems.length}개 {expanded ? "▲" : "▼"}
                      </button>
                    </div>
                    {expanded && (
                      <ul className="mt-3 divide-y divide-ink-100 rounded-2xl border border-ink-100">
                        {problems.length === 0 && <li className="px-4 py-3 text-sm text-ink-400">이 유형의 문제가 아직 없어요.</li>}
                        {problems.map((p) => {
                          const s = solved.get(p.id);
                          return (
                            <li key={p.id}>
                              <Link
                                href={`/practice?concept=${id}&ids=${p.id}`}
                                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-ink-50"
                              >
                                <span
                                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                                    s === true ? "bg-mint-500 text-white" : s === false ? "bg-sun-100 text-sun-600" : "bg-ink-100 text-ink-300"
                                  }`}
                                  aria-label={s === true ? "맞힘" : s === false ? "다시 도전" : "안 풂"}
                                >
                                  {s === true ? "✓" : s === false ? "!" : "·"}
                                </span>
                                <span className="chip bg-ink-100 text-ink-500">{typeLabel(p)}</span>
                                <span className="min-w-0 flex-1 truncate text-ink-700">{p.prompt}</span>
                                <DifficultyDots level={p.difficulty} />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {sheet && <ConceptSheet conceptId={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

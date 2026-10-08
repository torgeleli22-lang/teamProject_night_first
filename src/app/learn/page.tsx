"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AIBadge } from "@/components/AIBadge";
import { ProgressBar, SectionTitle, masteryTone } from "@/components/ui";
import { postJSON } from "@/lib/api";
import { getConcept, getLevel } from "@/lib/curriculum";
import { computeConceptStats } from "@/lib/mastery";
import { solvedToday, streakDays, useHydrated, useProgress } from "@/lib/progress-store";
import { currentLevelId, overallProgress, recommendToday, REASON_TEXT, strongConcepts, weakConcepts } from "@/lib/recommend";

export default function LearnHomePage() {
  const progress = useProgress();
  const hydrated = useHydrated();
  const { attempts } = progress;

  const stats = useMemo(() => computeConceptStats(attempts), [attempts]);
  const rec = useMemo(() => recommendToday(attempts), [attempts]);
  const concept = getConcept(rec.conceptId)!;
  const level = getLevel(concept.levelId)!;
  const currentLevel = getLevel(currentLevelId(stats))!;
  const overall = overallProgress(stats);
  const weak = weakConcepts(stats).slice(0, 2);
  const doneToday = solvedToday(progress);
  const goalMet = doneToday >= progress.dailyGoal;
  const streak = streakDays(progress);
  const fallbackMessage = REASON_TEXT[rec.reason](concept.name);

  const [ai, setAi] = useState<{ message: string; source: "ai" | "offline" } | null>(null);

  useEffect(() => {
    if (!hydrated || attempts.length === 0) return;
    const controller = new AbortController();
    const counts = new Map<string, number>();
    attempts.forEach((a) => a.misconception && counts.set(a.misconception, (counts.get(a.misconception) ?? 0) + 1));
    postJSON<{ message: string; source: "ai" | "offline" }>(
      "/api/ai/recommend",
      {
        recommendedConcept: rec.conceptId,
        reason: rec.reason,
        fallback: fallbackMessage,
        weak: weakConcepts(stats).map((s) => ({ conceptId: s.conceptId, mastery: s.mastery })),
        strong: strongConcepts(stats).map((s) => s.conceptId),
        misconceptions: [...counts].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 5),
        totalAttempts: attempts.length,
        streak,
      },
      controller.signal,
    )
      .then(setAi)
      .catch(() => {});
    return () => controller.abort();
    // 풀이 기록이 바뀔 때만 다시 요청
  }, [hydrated, attempts.length]);

  const startHref = `/practice?concept=${rec.conceptId}&ids=${rec.problemIds.join(",")}`;

  if (!hydrated) return <div className="mx-auto max-w-3xl px-4 py-10" />;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-8 sm:pb-16">
      <div className="animate-fade-up">
        <p className="text-[15px] font-semibold text-ink-500">안녕하세요 👋</p>
        <h1 className="mt-1 text-[26px] font-extrabold tracking-tight sm:text-3xl">
          {attempts.length === 0
            ? "오늘은 10분만 공부해볼까요?"
            : goalMet
              ? "오늘 목표 달성! 한 문제 더 해볼까요?"
              : "오늘도 한 문제 풀어볼까요?"}
        </h1>
      </div>

      {/* 오늘의 학습 */}
      <section className="card mt-6 animate-fade-up overflow-hidden [animation-delay:80ms]">
        <div className="bg-gradient-to-br from-brand-600 to-brand-500 p-6 text-white sm:p-7">
          <div className="flex items-center justify-between">
            <span className="chip bg-white/15 text-white">오늘의 학습</span>
            <span className="text-sm font-medium text-brand-100">
              Level {level.id} · {level.title}
            </span>
          </div>
          <p className="mt-5 text-sm font-medium text-brand-100">JavaScript</p>
          <p className="text-[28px] font-extrabold leading-tight">{concept.name}</p>
          <p className="mt-2 text-[15px] text-brand-50/90">{concept.keyIdea}</p>
          <div className="mt-5 flex gap-4 text-sm font-semibold text-brand-50">
            <span>📝 문제 {rec.problemIds.length}개</span>
            <span>⏱ 예상 {rec.minutes}분</span>
          </div>
        </div>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex-1 text-[15px] leading-relaxed text-ink-700">
            <div className="mb-1">
              <AIBadge source={ai?.source ?? (attempts.length ? null : "offline")} />
            </div>
            {ai?.message ?? fallbackMessage}
          </div>
          <Link href={startHref} className="btn-primary shrink-0 px-7 py-3.5 text-base">
            학습 시작하기 →
          </Link>
        </div>
      </section>

      {/* 진행 상황 */}
      <section className="mt-6 grid animate-fade-up gap-4 [animation-delay:160ms] sm:grid-cols-2">
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink-500">오늘의 목표</p>
          <p className="mt-1 text-2xl font-extrabold">
            {Math.min(doneToday, progress.dailyGoal)} <span className="text-base font-bold text-ink-400">/ {progress.dailyGoal} 문제</span>
          </p>
          <div className="mt-3">
            <ProgressBar value={(doneToday / progress.dailyGoal) * 100} tone={goalMet ? "mint" : "brand"} label="오늘의 목표" />
          </div>
          <p className="mt-2 text-sm text-ink-400">
            {goalMet ? "🎉 목표 달성! 내일도 만나요." : streak > 0 ? `🔥 ${streak}일 연속 학습 중이에요` : "하루 3문제면 충분해요"}
          </p>
        </div>
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink-500">현재 진행률</p>
          <p className="mt-1 text-2xl font-extrabold">
            {overall}% <span className="text-base font-bold text-ink-400">· Level {currentLevel.id}</span>
          </p>
          <div className="mt-3">
            <ProgressBar value={overall} label="전체 진행률" />
          </div>
          <p className="mt-2 text-sm text-ink-400">
            {currentLevel.emoji} {currentLevel.title} 단계를 공부하고 있어요
          </p>
        </div>
      </section>

      {/* 복습 */}
      {weak.length > 0 && (
        <section className="mt-8">
          <SectionTitle>한 번 더 보면 좋은 개념</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {weak.map((s) => {
              const c = getConcept(s.conceptId)!;
              return (
                <Link
                  key={s.conceptId}
                  href={`/practice?concept=${s.conceptId}`}
                  className="card group flex items-center gap-4 p-4 transition hover:shadow-lift"
                >
                  <div className="flex-1">
                    <p className="font-bold">{c.name}</p>
                    <div className="mt-2">
                      <ProgressBar value={s.mastery} tone={masteryTone(s.mastery)} size="sm" label={`${c.name} 이해도`} />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-brand-600 group-hover:translate-x-0.5">복습 →</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-8 flex flex-wrap gap-3">
        <Link href="/concepts" className="btn-soft">
          🧭 다른 개념 골라서 공부하기
        </Link>
        <Link href="/dashboard" className="btn-ghost">
          📊 내 학습 기록 보기
        </Link>
      </section>
    </div>
  );
}

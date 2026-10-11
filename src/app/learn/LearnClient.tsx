"use client";

import Link from "next/link";
import { SessionNotice } from "@/components/SessionNotice";
import { StartPanel } from "@/components/StartPanel";
import { TutorAnalysisCard } from "@/components/TutorAnalysisCard";
import { LoadState, ProgressBar } from "@/components/ui";
import type { LearnView } from "@/api/views";
import { useApi } from "@/lib/api";
import { getConcept } from "@/lib/curriculum";

/** 학습 탭: 아직 풀지 않은 새 문제로 다음 개념을 배운다 */
export function LearnClient() {
  const { data, error, slow, reload } = useApi<LearnView>("/learn");
  if (!data) return <div className="px-4">{<LoadState error={error} slow={slow} onRetry={reload} />}</div>;
  const goalMet = data.solvedToday >= data.dailyGoal;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-28 pt-8 sm:pb-16">
      <div className="animate-fade-up">
        <p className="text-[15px] font-semibold text-brand-600">📘 학습 · 새로운 문제</p>
        <h1 className="mt-1 text-[26px] font-extrabold tracking-tight sm:text-3xl">
          {data.attemptCount === 0 ? "오늘은 10분만 공부해볼까요?" : goalMet ? "오늘 목표 달성! 한 세트 더 해볼까요?" : "오늘도 새로운 코드 하나 읽어볼까요?"}
        </h1>
        <p className="mt-1 text-ink-500">아직 풀지 않은 문제만 나와요. 틀린 문제는 복습 탭에서 다시 풀 수 있어요.</p>
      </div>
      <SessionNotice />

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <section className="card animate-fade-up p-5 [animation-delay:80ms] sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">새 학습 시작하기</h2>
            <span className="text-sm text-ink-400">
              {data.unit.emoji} {data.unit.title} 단원 진행 중
            </span>
          </div>
          <StartPanel initialLevel={data.level} suggestedLevel={data.suggestedLevel} recommendedConcept={data.recommendedConcept} />
          {data.suggestion.direction !== "stay" && <p className="mt-3 text-sm text-ink-500">🎯 {data.suggestion.message}</p>}
        </section>

        <div className="space-y-5">
          {/* 복습 안내: 학습과 복습을 섞지 않고, 복습할 것이 있으면 복습 탭으로 안내 */}
          <Link href="/review" className="card group block p-5 transition hover:shadow-lift">
            <div className="flex items-center justify-between">
              <p className="font-bold">🔁 복습</p>
              <span className="text-sm font-semibold text-brand-600 group-hover:translate-x-0.5">복습 탭으로 →</span>
            </div>
            {data.wrongCount + data.weakCount > 0 ? (
              <p className="mt-2 text-[15px] text-ink-700">
                다시 풀어볼 문제 <b className="text-coral-600">{data.wrongCount}개</b> · 다지면 좋은 개념 <b className="text-sun-600">{data.weakCount}개</b>
              </p>
            ) : (
              <p className="mt-2 text-sm text-ink-500">아직 복습할 문제가 없어요. 문제를 풀면 틀린 문제가 여기에 모여요.</p>
            )}
          </Link>

          <section className="card p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold text-ink-500">오늘의 목표</p>
                <p className="mt-1 text-2xl font-extrabold">
                  {Math.min(data.solvedToday, data.dailyGoal)} <span className="text-base font-bold text-ink-400">/ {data.dailyGoal} 문제</span>
                </p>
              </div>
              <p className="text-sm text-ink-400">{data.streak > 0 ? `🔥 ${data.streak}일 연속` : "첫 기록을 남겨보세요"}</p>
            </div>
            <div className="mt-3">
              <ProgressBar value={(data.solvedToday / data.dailyGoal) * 100} tone={goalMet ? "mint" : "brand"} label="오늘의 목표" />
            </div>
            <p className="mt-4 text-sm font-semibold text-ink-500">전체 진행률 {data.overall}%</p>
            <div className="mt-2">
              <ProgressBar value={data.overall} size="sm" label="전체 진행률" />
            </div>
          </section>

          <TutorAnalysisCard analysis={data.analysis} sinceLast={data.sinceLastAnalysis} every={data.analysisEvery} compact />
        </div>
      </div>

      <p className="mt-8 text-sm text-ink-400">
        다음 추천 개념: <b className="text-ink-700">{getConcept(data.recommendedConcept)?.name}</b> · 전체 개념과 문제는{" "}
        <Link href="/concepts" className="font-semibold text-brand-600 hover:underline">
          탐색
        </Link>
        에서 볼 수 있어요.
      </p>
    </div>
  );
}

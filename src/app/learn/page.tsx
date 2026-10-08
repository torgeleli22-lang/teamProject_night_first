import Link from "next/link";
import { LevelPicker } from "@/components/LevelPicker";
import { TutorAnalysisCard } from "@/components/TutorAnalysisCard";
import { ProgressBar, SectionTitle, masteryTone } from "@/components/ui";
import { ANALYSIS_EVERY, type LearnerAnalysis } from "@/lib/ai/analysis";
import { getConcept, getUnit, levelInfo } from "@/lib/curriculum";
import { conceptStats, currentUnitId, overallProgress, solvedToday, streakDays, suggestLevel, weakConcepts } from "@/lib/learner/stats";
import { currentLearner } from "@/lib/server/learner";
import { latestAnalysis, listAttempts } from "@/lib/server/learner-repo";
import { planSession } from "@/lib/server/session";
import type { Level } from "@/lib/types";

export const dynamic = "force-dynamic";

const REASON: Record<string, (name: string) => string> = {
  review: (n) => `${n}에서 헷갈린 부분이 있었어요. 다시 한 번 짚고 넘어가요.`,
  continue: (n) => `지난번에 하던 ${n}, 조금만 더 하면 익숙해질 거예요.`,
  next: (n) => `이제 ${n}을(를) 배울 차례예요.`,
  polish: (n) => `${n}을(를) 조금 더 다듬어 볼까요?`,
  chosen: (n) => `${n}을(를) 공부해요.`,
};

export default async function LearnHomePage() {
  const learner = await currentLearner();
  const attempts = listAttempts(learner.id);
  const stats = conceptStats(attempts);
  const level: Level = learner.preferredLevel ?? 1;
  const suggestion = suggestLevel(attempts, level);
  const analysis = latestAnalysis<LearnerAnalysis>(learner.id);
  const plan = planSession({ attempts, level, size: 6 });
  const concept = getConcept(plan.focusConcept)!;
  const unit = getUnit(currentUnitId(stats))!;
  const doneToday = solvedToday(attempts);
  const goalMet = doneToday >= learner.dailyGoal;
  const streak = streakDays(attempts);
  const weak = weakConcepts(stats).slice(0, 2);
  const codes = new Set(plan.questions.map((q) => q.codeItemId)).size;
  const suggested = analysis?.result.recommendedLevel ?? (suggestion.direction !== "stay" ? suggestion.level : null);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-8 sm:pb-16">
      <div className="animate-fade-up">
        <p className="text-[15px] font-semibold text-ink-500">안녕하세요 👋</p>
        <h1 className="mt-1 text-[26px] font-extrabold tracking-tight sm:text-3xl">
          {attempts.length === 0 ? "오늘은 10분만 공부해볼까요?" : goalMet ? "오늘 목표 달성! 한 세트 더 해볼까요?" : "오늘도 코드 하나 읽어볼까요?"}
        </h1>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        {/* 오늘의 학습 */}
        <section className="card animate-fade-up overflow-hidden [animation-delay:80ms]">
          <div className="bg-gradient-to-br from-brand-600 to-brand-500 p-6 text-white">
            <div className="flex items-center justify-between">
              <span className="chip bg-white/15 text-white">오늘의 학습</span>
              <span className="text-sm font-medium text-brand-100">
                {unit.emoji} {unit.title}
              </span>
            </div>
            <p className="mt-5 text-sm font-medium text-brand-100">JavaScript</p>
            <p className="text-[28px] font-extrabold leading-tight">{concept.name}</p>
            <p className="mt-2 text-[15px] text-brand-50/90">{REASON[plan.reason](concept.name)}</p>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-brand-50">
              <span>🧩 코드 {codes}개</span>
              <span>📝 질문 {plan.questions.length}개</span>
              <span>⏱ 약 {Math.max(5, plan.questions.length * 2)}분</span>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <LevelPicker initial={level} suggested={suggested} />
            {suggestion.direction !== "stay" && (
              <p className="mt-3 text-sm text-ink-500">
                🎯 추천: <b>{levelInfo(suggestion.level).name}</b> — {suggestion.message}
              </p>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <TutorAnalysisCard analysis={analysis} sinceLast={attempts.length - (analysis?.attemptCount ?? 0)} every={ANALYSIS_EVERY} compact />

          <section className="card p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold text-ink-500">오늘의 목표</p>
                <p className="mt-1 text-2xl font-extrabold">
                  {Math.min(doneToday, learner.dailyGoal)} <span className="text-base font-bold text-ink-400">/ {learner.dailyGoal} 문제</span>
                </p>
              </div>
              <p className="text-sm text-ink-400">{streak > 0 ? `🔥 ${streak}일 연속` : "첫 기록을 남겨보세요"}</p>
            </div>
            <div className="mt-3">
              <ProgressBar value={(doneToday / learner.dailyGoal) * 100} tone={goalMet ? "mint" : "brand"} label="오늘의 목표" />
            </div>
            <p className="mt-4 text-sm font-semibold text-ink-500">전체 진행률 {overallProgress(stats)}%</p>
            <div className="mt-2">
              <ProgressBar value={overallProgress(stats)} size="sm" label="전체 진행률" />
            </div>
          </section>
        </div>
      </div>

      {weak.length > 0 && (
        <section className="mt-8">
          <SectionTitle>한 번 더 보면 좋은 개념</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {weak.map((s) => {
              const c = getConcept(s.conceptId)!;
              return (
                <Link key={s.conceptId} href={`/practice?concept=${s.conceptId}&level=${level}`} className="card group flex items-center gap-4 p-4 transition hover:shadow-lift">
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
          🧭 개념·난이도별로 탐색하기
        </Link>
        <Link href="/dashboard" className="btn-ghost">
          📊 내 학습 기록 보기
        </Link>
      </section>
    </div>
  );
}

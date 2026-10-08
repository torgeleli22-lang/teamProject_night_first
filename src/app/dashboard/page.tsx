"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ProgressBar, SectionTitle, masteryTone } from "@/components/ui";
import { CONCEPTS, LEVELS, conceptName } from "@/lib/curriculum";
import { computeConceptStats } from "@/lib/mastery";
import { getProblem, typeLabel } from "@/lib/problems";
import { badges, learnerLevel, resetProgress, streakDays, today, useHydrated, useProgress } from "@/lib/progress-store";
import { currentLevelId, overallProgress, strongConcepts, weakConcepts } from "@/lib/recommend";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export default function DashboardPage() {
  const progress = useProgress();
  const hydrated = useHydrated();
  const { attempts } = progress;
  const stats = useMemo(() => computeConceptStats(attempts), [attempts]);

  if (!hydrated) return <div className="mx-auto max-w-4xl px-4 py-10" />;

  if (attempts.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-5xl">🌱</p>
        <h1 className="mt-4 text-2xl font-extrabold">아직 학습 기록이 없어요</h1>
        <p className="mt-2 text-ink-500">첫 문제를 풀면 여기에서 나의 성장을 확인할 수 있어요.</p>
        <Link href="/learn" className="btn-primary mt-8">
          첫 문제 풀러 가기
        </Link>
      </div>
    );
  }

  const lv = learnerLevel(progress.xp);
  const streak = streakDays(progress);
  const correct = attempts.filter((a) => a.correct).length;
  const accuracy = Math.round((correct / attempts.length) * 100);
  const overall = overallProgress(stats);
  const level = LEVELS.find((l) => l.id === currentLevelId(stats))!;
  const strong = strongConcepts(stats).slice(0, 5);
  const weak = weakConcepts(stats).slice(0, 4);
  const started = CONCEPTS.filter((c) => (stats.get(c.id)?.attempts ?? 0) > 0);
  const notStarted = CONCEPTS.length - started.length;

  const misconceptions = new Map<string, number>();
  attempts.forEach((a) => a.misconception && misconceptions.set(a.misconception, (misconceptions.get(a.misconception) ?? 0) + 1));
  const topMisconceptions = [...misconceptions].filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = today(d);
    return {
      key,
      label: ["일", "월", "화", "수", "목", "금", "토"][d.getDay()],
      count: attempts.filter((a) => today(new Date(a.at)) === key).length,
    };
  });
  const maxDay = Math.max(...last7.map((d) => d.count), 1);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-8 sm:pb-16">
      <h1 className="text-[26px] font-extrabold tracking-tight">내 학습</h1>
      <p className="mt-1 text-ink-500">
        {level.emoji} 지금은 <b className="text-ink-700">Level {level.id} · {level.title}</b> 단계를 공부하고 있어요.
      </p>

      {/* 요약 */}
      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card col-span-2 p-5">
          <p className="text-sm font-semibold text-ink-500">학습 레벨</p>
          <p className="mt-1 text-2xl font-extrabold">
            Lv.{lv.level} <span className="text-base font-bold text-ink-400">· {progress.xp} XP</span>
          </p>
          <div className="mt-3">
            <ProgressBar value={(lv.current / lv.needed) * 100} label="다음 레벨까지" />
          </div>
          <p className="mt-1.5 text-xs text-ink-400">다음 레벨까지 {lv.needed - lv.current} XP</p>
        </div>
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink-500">연속 학습</p>
          <p className="mt-1 text-2xl font-extrabold">🔥 {streak}일</p>
        </div>
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink-500">푼 문제</p>
          <p className="mt-1 text-2xl font-extrabold">{attempts.length}개</p>
          <p className="text-xs text-ink-400">정답률 {accuracy}%</p>
        </div>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        {/* 개념별 이해도 */}
        <section className="card p-5">
          <SectionTitle action={<span className="font-mono text-sm text-ink-400">전체 {overall}%</span>}>개념별 이해도</SectionTitle>
          <ul className="space-y-3">
            {started.map((c) => {
              const m = stats.get(c.id)!.mastery;
              return (
                <li key={c.id} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-sm">
                  <span className="truncate font-semibold">{c.name}</span>
                  <ProgressBar value={m} tone={masteryTone(m)} label={`${c.name} 이해도`} />
                  <span className="text-right font-mono text-ink-500">{m}%</span>
                </li>
              );
            })}
          </ul>
          {notStarted > 0 && <p className="mt-4 text-sm text-ink-400">아직 시작하지 않은 개념 {notStarted}개가 기다리고 있어요.</p>}
        </section>

        <div className="space-y-6">
          {/* 최근 7일 */}
          <section className="card p-5">
            <SectionTitle>최근 7일</SectionTitle>
            <div className="flex h-24 items-end justify-between gap-2">
              {last7.map((d) => (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={`w-full max-w-[28px] rounded-lg ${d.count ? "bg-brand-500" : "bg-ink-100"}`}
                    style={{ height: `${Math.max(8, (d.count / maxDay) * 72)}px` }}
                    title={`${d.count}문제`}
                  />
                  <span className="text-xs text-ink-400">{d.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 강점 / 복습 */}
          <section className="card p-5">
            <SectionTitle>잘 이해하고 있어요 💪</SectionTitle>
            {strong.length ? (
              <div className="flex flex-wrap gap-2">
                {strong.map((s) => (
                  <span key={s.conceptId} className="chip bg-mint-50 px-3 py-1.5 text-sm text-mint-700">
                    {conceptName(s.conceptId)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">같은 개념을 2~3문제 맞히면 여기에 표시돼요.</p>
            )}
            {weak.length > 0 && (
              <>
                <p className="mb-2 mt-5 font-bold">한 번 더 보면 좋아요</p>
                <div className="flex flex-wrap gap-2">
                  {weak.map((s) => (
                    <Link
                      key={s.conceptId}
                      href={`/practice?concept=${s.conceptId}`}
                      className="chip bg-sun-50 px-3 py-1.5 text-sm text-sun-600 hover:bg-sun-100"
                    >
                      {conceptName(s.conceptId)} 복습 →
                    </Link>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {topMisconceptions.length > 0 && (
        <section className="card mt-6 p-5">
          <SectionTitle>자주 하는 착각</SectionTitle>
          <p className="-mt-1 mb-3 text-sm text-ink-500">AI 튜터가 다음 문제를 고를 때 참고하고 있어요.</p>
          <ul className="space-y-2">
            {topMisconceptions.map(([text, n]) => (
              <li key={text} className="flex items-center gap-3 rounded-2xl bg-ink-50 px-4 py-3 text-[15px]">
                <span aria-hidden>🔎</span>
                <span className="flex-1 text-ink-700">{text}</span>
                <span className="chip bg-white text-ink-500">{n}회</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 배지 */}
      <section className="mt-6">
        <SectionTitle>배지</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {badges(progress).map((b) => (
            <div
              key={b.id}
              className={`rounded-2xl p-3 text-center ${b.earned ? "bg-white shadow-card ring-1 ring-ink-200/70" : "bg-ink-100/60 opacity-60"}`}
              title={b.description}
            >
              <p className={`text-2xl ${b.earned ? "" : "grayscale"}`}>{b.emoji}</p>
              <p className="mt-1 text-xs font-bold">{b.title}</p>
              <p className="text-[11px] text-ink-400">{b.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 최근 기록 */}
      <section className="card mt-6 p-5">
        <SectionTitle>최근 학습 기록</SectionTitle>
        <ul className="divide-y divide-ink-100">
          {[...attempts]
            .reverse()
            .slice(0, 8)
            .map((a, i) => {
              const p = getProblem(a.problemId);
              return (
                <li key={i} className="flex items-center gap-3 py-3 text-sm">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      a.correct ? "bg-mint-50 text-mint-700" : a.partial ? "bg-sun-50 text-sun-600" : "bg-coral-50 text-coral-600"
                    }`}
                  >
                    {a.correct ? "✓" : a.partial ? "△" : "✕"}
                  </span>
                  <span className="font-semibold">{conceptName(a.conceptIds[0])}</span>
                  {p && <span className="chip hidden bg-ink-100 text-ink-500 sm:inline-flex">{typeLabel(p)}</span>}
                  {a.hintsUsed > 0 && <span className="text-xs text-ink-400">힌트 {Math.min(a.hintsUsed, 4)}회</span>}
                  <span className="ml-auto text-xs text-ink-400">{timeAgo(a.at)}</span>
                  {p && (
                    <Link href={`/practice?ids=${p.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                      다시 풀기
                    </Link>
                  )}
                </li>
              );
            })}
        </ul>
      </section>

      <div className="mt-10 text-center">
        <button
          type="button"
          onClick={() => {
            if (window.confirm("모든 학습 기록을 지울까요? 되돌릴 수 없어요.")) resetProgress();
          }}
          className="text-xs text-ink-400 underline-offset-2 hover:text-coral-600 hover:underline"
        >
          학습 기록 초기화
        </button>
      </div>
    </div>
  );
}

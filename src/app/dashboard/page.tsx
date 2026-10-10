import Link from "next/link";
import { ActivityCalendar } from "@/components/ActivityCalendar";
import { ResetButton } from "@/components/ResetButton";
import { SessionNotice } from "@/components/SessionNotice";
import { TutorAnalysisCard } from "@/components/TutorAnalysisCard";
import { ProgressBar, SectionTitle, masteryTone } from "@/components/ui";
import { ANALYSIS_EVERY, type LearnerAnalysis } from "@/lib/ai/analysis";
import { CONCEPTS, QUESTION_TYPE_LABEL, conceptName, getUnit, levelInfo } from "@/lib/curriculum";
import {
  badges,
  currentUnitId,
  misconceptionCounts,
  overallProgress,
  repeatedWrong,
  typeStats,
  xpForAttempt,
} from "@/lib/learner/stats";
import { getQuestion } from "@/lib/server/content-repo";
import { loadProgress } from "@/lib/server/progress";
import { currentSession } from "@/lib/server/visitor";
import { latestAnalysis, listAttempts } from "@/lib/server/session-repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 학습 — 코드리딩" };

const sec = (ms: number) => `${Math.round(ms / 1000)}초`;

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export default async function DashboardPage() {
  const me = await currentSession();
  const attempts = listAttempts(me.id);

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

  // 요약 테이블: 개념별 이해도(concept_progress), 캘린더·XP·연속 학습(daily_activity)
  const progress = loadProgress(me.id);
  const { stats, xp } = progress;
  const lv = progress.level;
  const accuracy = Math.round((progress.totalCorrect / Math.max(progress.totalSolved, 1)) * 100);
  const avgTime = progress.totalTimeMs / Math.max(progress.totalSolved, 1);
  const hints = attempts.reduce((s, a) => s + Math.min(a.hintsUsed, 4), 0);
  const unit = getUnit(currentUnitId(stats))!;
  const started = CONCEPTS.map((c) => stats.get(c.id)!).filter((s) => s.attempts > 0);
  const repeated = repeatedWrong(stats).slice(0, 4);
  const misconceptions = misconceptionCounts(attempts).slice(0, 4);
  const types = typeStats(attempts).sort((a, b) => b.attempts - a.attempts);
  const analysis = latestAnalysis<LearnerAnalysis>(me.id);
  const aiGraded = attempts.filter((a) => a.gradedBy === "ai").length;


  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-8 sm:pb-16">
      <h1 className="text-[26px] font-extrabold tracking-tight">내 학습</h1>
      <p className="mt-1 text-ink-500">
        {unit.emoji} 지금은 <b className="text-ink-700">{unit.title}</b> 단원을 공부하고 있어요
        {me.preferredLevel && <> · 선택한 난이도 {levelInfo(me.preferredLevel).emoji} {levelInfo(me.preferredLevel).name}</>}
      </p>
      <SessionNotice />

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card col-span-2 p-5">
          <p className="text-sm font-semibold text-ink-500">학습 레벨</p>
          <p className="mt-1 text-2xl font-extrabold">
            Lv.{lv.level} <span className="text-base font-bold text-ink-400">· {xp} XP</span>
          </p>
          <div className="mt-3">
            <ProgressBar value={(lv.current / lv.needed) * 100} label="다음 레벨까지" />
          </div>
          <p className="mt-1.5 text-xs text-ink-400">다음 레벨까지 {lv.needed - lv.current} XP · 🔥 {progress.streak}일 연속</p>
        </div>
        <Stat label="푼 문제" value={`${progress.totalSolved}개`} sub={`정답률 ${accuracy}%`} />
        <Stat label="평균 풀이 시간" value={sec(avgTime)} sub={`힌트 ${hints}회 사용`} />
      </section>

      <div className="mt-6">
        <TutorAnalysisCard analysis={analysis} sinceLast={attempts.length - (analysis?.attemptCount ?? 0)} every={ANALYSIS_EVERY} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <SectionTitle action={<span className="font-mono text-sm text-ink-400">전체 {overallProgress(stats)}%</span>}>개념별 이해도</SectionTitle>
          <ul className="space-y-3">
            {started.map((s) => (
              <li key={s.conceptId} className="grid grid-cols-[6.5rem_1fr_7.5rem] items-center gap-3 text-sm">
                <span className="truncate font-semibold">{conceptName(s.conceptId)}</span>
                <ProgressBar value={s.mastery} tone={masteryTone(s.mastery)} label={`${conceptName(s.conceptId)} 이해도`} />
                <span className="whitespace-nowrap text-right font-mono text-xs text-ink-500">
                  {s.mastery}% <span className="text-ink-300">· 정답 {s.accuracy}%</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-400">이해도 = 최근 풀이의 정답 여부·힌트 사용·부분 정답을 반영한 점수예요.</p>
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <SectionTitle>학습 캘린더</SectionTitle>
            <ActivityCalendar days={progress.days} />
          </section>

          <section className="card p-5">
            <SectionTitle>문제 유형별</SectionTitle>
            <ul className="space-y-2.5 text-sm">
              {types.map((t) => (
                <li key={t.type} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-3">
                  <span className="font-semibold">{QUESTION_TYPE_LABEL[t.type]}</span>
                  <ProgressBar value={t.accuracy} tone={masteryTone(t.accuracy)} size="sm" label={`${QUESTION_TYPE_LABEL[t.type]} 정답률`} />
                  <span className="text-right font-mono text-xs text-ink-500">{t.accuracy}%</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {(repeated.length > 0 || misconceptions.length > 0) && (
        <section className="card mt-6 p-5">
          <SectionTitle>다시 보면 좋은 부분</SectionTitle>
          {repeated.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {repeated.map((s) => (
                <Link key={s.conceptId} href={`/practice?concept=${s.conceptId}&level=${me.preferredLevel ?? 1}`} className="chip bg-sun-50 px-3 py-1.5 text-sm text-sun-600 hover:bg-sun-100">
                  {conceptName(s.conceptId)} · 최근 {s.recentWrong}번 헷갈림 →
                </Link>
              ))}
            </div>
          )}
          <ul className="space-y-2">
            {misconceptions.map((m) => (
              <li key={m.text} className="flex items-center gap-3 rounded-2xl bg-ink-50 px-4 py-3 text-[15px]">
                <span aria-hidden>🔎</span>
                <span className="flex-1 text-ink-700">{m.text}</span>
                <span className="chip bg-white text-ink-500">{m.count}회</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <SectionTitle>배지</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {badges(attempts).map((b) => (
            <div key={b.id} className={`rounded-2xl p-3 text-center ${b.earned ? "bg-white shadow-card ring-1 ring-ink-200/70" : "bg-ink-100/60 opacity-60"}`} title={b.description}>
              <p className={`text-2xl ${b.earned ? "" : "grayscale"}`}>{b.emoji}</p>
              <p className="mt-1 text-xs font-bold">{b.title}</p>
              <p className="text-[11px] text-ink-400">{b.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card mt-6 p-5">
        <SectionTitle action={<span className="text-xs text-ink-400">AI 채점 {aiGraded}회 · 규칙 채점 {attempts.length - aiGraded}회</span>}>최근 학습 기록</SectionTitle>
        <ul className="divide-y divide-ink-100">
          {[...attempts]
            .reverse()
            .slice(0, 10)
            .map((a) => {
              const q = getQuestion(a.questionId);
              return (
                <li key={a.id} className="flex items-center gap-3 py-3 text-sm">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      a.correct ? "bg-mint-50 text-mint-700" : a.partial ? "bg-sun-50 text-sun-600" : "bg-coral-50 text-coral-600"
                    }`}
                  >
                    {a.correct ? "✓" : a.partial ? "△" : "✕"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">{conceptName(a.concepts[0])}</span>
                    <span className="ml-2 text-ink-400">{q?.question.prompt}</span>
                  </span>
                  <span className="chip hidden bg-ink-100 text-ink-500 sm:inline-flex">{QUESTION_TYPE_LABEL[a.questionType]}</span>
                  <span className="hidden w-12 text-right text-xs text-ink-400 sm:block">{sec(a.timeMs)}</span>
                  {a.gradedBy === "ai" && <span title="AI 가 채점했어요">✨</span>}
                  <span className="w-14 text-right text-xs text-brand-600">+{xpForAttempt(a)} XP</span>
                  <span className="w-14 text-right text-xs text-ink-400">{timeAgo(a.createdAt)}</span>
                </li>
              );
            })}
        </ul>
      </section>

      <div className="mt-10 text-center">
        <ResetButton />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm font-semibold text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      <p className="text-xs text-ink-400">{sub}</p>
    </div>
  );
}

import Link from "next/link";
import { SessionNotice } from "@/components/SessionNotice";
import { ProgressBar, SectionTitle, masteryTone } from "@/components/ui";
import { QUESTION_TYPE_LABEL, conceptName, levelInfo } from "@/lib/curriculum";
import { misconceptionCounts, weakConcepts } from "@/lib/learner/stats";
import { getQuestion } from "@/lib/server/content-repo";
import { wrongQuestions } from "@/lib/server/planner";
import { loadProgress } from "@/lib/server/progress";
import { listAttempts } from "@/lib/server/session-repo";
import { currentSession } from "@/lib/server/visitor";

export const dynamic = "force-dynamic";
export const metadata = { title: "복습 — 코드리딩" };

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

/** 복습 탭: 틀린 문제(오답 노트) → 취약 개념 → 자주 하는 착각 */
export default async function ReviewPage() {
  const me = await currentSession();
  const attempts = listAttempts(me.id);
  const level = me.preferredLevel ?? 1;
  const wrong = wrongQuestions(attempts)
    .map((w) => ({ ...w, found: getQuestion(w.questionId) }))
    .filter((w) => w.found);
  const weak = weakConcepts(loadProgress(me.id).stats);
  const misconceptions = misconceptionCounts(attempts).slice(0, 5);
  const empty = wrong.length === 0 && weak.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-8 sm:pb-16">
      <p className="text-[15px] font-semibold text-sun-600">🔁 복습</p>
      <h1 className="mt-1 text-[26px] font-extrabold tracking-tight sm:text-3xl">
        {empty ? "아직 복습할 문제가 없어요" : "틀렸던 코드를 다시 읽어볼까요?"}
      </h1>
      <p className="mt-1 text-ink-500">틀린 문제를 먼저, 그다음 아직 헷갈리는 개념의 문제를 다시 풀어요. 새로운 문제는 학습 탭에서 풀 수 있어요.</p>
      <SessionNotice />

      {empty ? (
        <div className="card mt-6 p-8 text-center">
          <p className="text-4xl">🌱</p>
          <p className="mt-3 text-ink-700">문제를 풀다가 틀리면 여기 오답 노트에 모여요.</p>
          <Link href="/learn" className="btn-primary mt-6">
            학습 탭에서 새 문제 풀기
          </Link>
        </div>
      ) : (
        <>
          <section className="card mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex gap-6">
              <div>
                <p className="text-sm font-semibold text-ink-500">다시 풀 문제</p>
                <p className="text-3xl font-extrabold text-coral-600">{wrong.length}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-500">다질 개념</p>
                <p className="text-3xl font-extrabold text-sun-600">{weak.length}</p>
              </div>
            </div>
            <div className="flex-1 text-sm text-ink-500">틀린 문제부터 최대 6개를 골라 한 세트로 복습해요. 맞히면 오답 노트에서 빠져요.</div>
            <Link href={`/practice?mode=review&level=${level}`} className="btn-primary px-6 py-3">
              복습 세트 시작 →
            </Link>
          </section>

          {wrong.length > 0 && (
            <section className="mt-8">
              <SectionTitle>오답 노트</SectionTitle>
              <ul className="space-y-2.5">
                {wrong.map((w) => {
                  const { question, item } = w.found!;
                  return (
                    <li key={w.questionId} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="chip bg-brand-50 text-brand-700">{conceptName(item.concepts[0])}</span>
                          <span className="chip bg-ink-100 text-ink-500">{QUESTION_TYPE_LABEL[question.type]}</span>
                          <span className="chip bg-ink-100 text-ink-500">
                            {levelInfo(item.level).emoji} {levelInfo(item.level).name}
                          </span>
                          <span className="text-ink-400">
                            {w.tries}번 시도 · {timeAgo(w.lastAt)}
                          </span>
                        </div>
                        <p className="truncate font-semibold text-ink-900">{question.prompt}</p>
                        {w.misconception && <p className="mt-0.5 text-sm text-sun-600">🔎 {w.misconception}</p>}
                      </div>
                      <Link href={`/practice?mode=review&ids=${w.questionId}&level=${item.level}`} className="btn-soft shrink-0 px-4 py-2 text-sm">
                        다시 풀기
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {weak.length > 0 && (
            <section className="mt-8">
              <SectionTitle>다지면 좋은 개념</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                {weak.map((s) => (
                  <div key={s.conceptId} className="card p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-bold">{conceptName(s.conceptId)}</p>
                      <span className="text-xs text-ink-400">
                        정답률 {s.accuracy}% · {s.attempts}문제
                      </span>
                    </div>
                    <div className="mt-2">
                      <ProgressBar value={s.mastery} tone={masteryTone(s.mastery)} size="sm" label={`${conceptName(s.conceptId)} 이해도`} />
                    </div>
                    <Link href={`/practice?mode=learn&concept=${s.conceptId}&level=${level}`} className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
                      이 개념 새 문제로 다지기 →
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {misconceptions.length > 0 && (
            <section className="mt-8">
              <SectionTitle>자주 하는 착각</SectionTitle>
              <ul className="space-y-2">
                {misconceptions.map((m) => (
                  <li key={m.text} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[15px] ring-1 ring-ink-200/70">
                    <span aria-hidden>🔎</span>
                    <span className="flex-1 text-ink-700">{m.text}</span>
                    <span className="chip bg-ink-100 text-ink-500">{m.count}회</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

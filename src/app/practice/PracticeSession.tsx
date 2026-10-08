"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ProblemView, type ProblemResult } from "@/components/practice/ProblemView";
import { ProgressBar, masteryTone } from "@/components/ui";
import { useAIStatus } from "@/lib/api";
import { conceptName, getConcept } from "@/lib/curriculum";
import { computeConceptStats } from "@/lib/mastery";
import { getProblem } from "@/lib/problems";
import { useHydrated, useProgress } from "@/lib/progress-store";
import { pickProblems, recommendToday } from "@/lib/recommend";

export function PracticeSession() {
  const params = useSearchParams();
  // 같은 페이지에서 다른 세션으로 이동하면(쿼리 변경) 상태를 새로 시작
  return <Session key={params.toString()} params={params} />;
}

function Session({ params }: { params: URLSearchParams }) {
  const hydrated = useHydrated();
  const progress = useProgress();
  const aiEnabled = useAIStatus();

  const [queue, setQueue] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<ProblemResult[]>([]);
  const [done, setDone] = useState(false);

  // 세션 구성: ?ids=a,b,c 가 있으면 그대로, ?concept=x 만 있으면 그 개념에서 추천, 없으면 오늘의 학습
  useEffect(() => {
    if (!hydrated || queue) return;
    const ids = (params.get("ids") ?? "").split(",").filter((id) => getProblem(id));
    const concept = params.get("concept");
    if (ids.length) setQueue(ids);
    else if (concept && getConcept(concept)) setQueue(pickProblems(concept, progress.attempts).map((p) => p.id));
    else setQueue(recommendToday(progress.attempts).problemIds);
  }, [hydrated, queue, params, progress.attempts]);

  if (!queue) return <div className="mx-auto max-w-2xl px-4 py-10" />;

  if (queue.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-lg font-bold">풀 수 있는 문제가 없어요.</p>
        <Link href="/learn" className="btn-primary mt-6">
          학습 홈으로
        </Link>
      </div>
    );
  }

  if (done) return <SessionSummary queue={queue} results={results} />;

  const problem = getProblem(queue[index])!;
  const conceptLabel = conceptName(problem.conceptIds[0]);
  const isLast = index === queue.length - 1;

  const similar = pickProblems(problem.conceptIds[0], progress.attempts, 1, queue)[0];

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <div className="sticky top-14 z-20 -mx-4 mb-6 bg-ink-50/90 px-4 pb-3 pt-4 backdrop-blur">
        <div className="mb-2.5 flex items-center gap-3 text-sm font-semibold">
          <Link href="/learn" className="rounded-lg px-1.5 py-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="학습 홈으로 나가기">
            ←
          </Link>
          <span className="text-ink-700">JavaScript · {conceptLabel}</span>
          <span className="ml-auto font-mono text-ink-400">
            {index + 1} / {queue.length}
          </span>
        </div>
        <ProgressBar value={((index + (results.length > index ? 1 : 0)) / queue.length) * 100} size="sm" label="세션 진행률" />
      </div>

      <ProblemView
        key={problem.id + index}
        problem={problem}
        aiEnabled={aiEnabled}
        isLast={isLast}
        onResult={(r) => setResults((prev) => [...prev, r])}
        onNext={() => (isLast ? setDone(true) : setIndex((i) => i + 1))}
        onSimilar={
          similar
            ? () => {
                setQueue((q) => [...q!.slice(0, index + 1), similar.id, ...q!.slice(index + 1)]);
                setIndex((i) => i + 1);
              }
            : undefined
        }
      />
    </div>
  );
}

function SessionSummary({ queue, results }: { queue: string[]; results: ProblemResult[] }) {
  const progress = useProgress();
  const stats = useMemo(() => computeConceptStats(progress.attempts), [progress.attempts]);
  const correct = results.filter((r) => r.correct).length;
  const xp = results.reduce((s, r) => s + r.xp, 0);
  const concepts = [...new Set(queue.flatMap((id) => getProblem(id)?.conceptIds.slice(0, 1) ?? []))];
  const ratio = results.length ? correct / results.length : 0;
  const next = recommendToday(progress.attempts);

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-10">
      <div className="card animate-pop overflow-hidden text-center">
        <div className="bg-gradient-to-br from-brand-600 to-brand-500 px-6 pb-8 pt-10 text-white">
          <p className="text-5xl" aria-hidden>
            {ratio === 1 ? "🏆" : ratio >= 0.5 ? "🎉" : "🌱"}
          </p>
          <h1 className="mt-3 text-2xl font-extrabold">
            {ratio === 1 ? "완벽해요!" : ratio >= 0.5 ? "오늘의 학습 완료!" : "한 걸음 더 나아갔어요"}
          </h1>
          <p className="mt-1 text-brand-100">
            {ratio >= 0.5 ? "코드를 읽는 눈이 점점 좋아지고 있어요." : "틀린 문제에서 배운 게 가장 오래 남아요."}
          </p>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <Stat label="맞힌 문제" value={`${correct}/${results.length}`} />
            <Stat label="얻은 XP" value={`+${xp}`} />
            <Stat label="힌트 사용" value={`${results.reduce((s, r) => s + Math.min(r.hintsUsed, 4), 0)}회`} />
          </div>
        </div>
        <div className="space-y-4 p-6 text-left">
          <p className="font-bold">개념 이해도</p>
          {concepts.map((id) => {
            const m = stats.get(id)?.mastery ?? 0;
            return (
              <div key={id}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-semibold">{conceptName(id)}</span>
                  <span className="font-mono text-ink-500">{m}%</span>
                </div>
                <ProgressBar value={m} tone={masteryTone(m)} label={`${conceptName(id)} 이해도`} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href={`/practice?concept=${next.conceptId}&ids=${next.problemIds.join(",")}`} className="btn-primary">
          다음 추천: {conceptName(next.conceptId)} →
        </Link>
        <Link href="/learn" className="btn-soft">
          학습 홈으로
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/15 px-2 py-3">
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-xs text-brand-100">{label}</p>
    </div>
  );
}

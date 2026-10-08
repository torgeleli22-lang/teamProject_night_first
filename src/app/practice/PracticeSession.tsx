"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { QuestionView, type QuestionOutcome } from "@/components/practice/QuestionView";
import { ProgressBar, Spinner } from "@/components/ui";
import { postJSON } from "@/lib/api";
import { conceptName, levelInfo } from "@/lib/curriculum";
import type { PublicQuestion, SessionPlan } from "@/lib/server/session";
import type { Level } from "@/lib/types";

type Plan = SessionPlan & { generating: boolean };

const REASON_TEXT: Record<SessionPlan["reason"], string> = {
  review: "헷갈렸던 개념을 다시 짚어봐요",
  continue: "지난번에 하던 개념을 이어서 해요",
  next: "새로운 개념을 배울 차례예요",
  chosen: "선택한 개념을 공부해요",
  polish: "익힌 개념을 더 단단하게 다듬어요",
};

export function PracticeSession() {
  const params = useSearchParams();
  // 쿼리가 바뀌면 세션을 새로 시작
  return <Session key={params.toString()} params={params} />;
}

function Session({ params }: { params: URLSearchParams }) {
  const router = useRouter();
  const level = (Math.min(5, Math.max(1, Number(params.get("level")) || 1)) as Level);
  const concept = params.get("concept") ?? undefined;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [queue, setQueue] = useState<PublicQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<QuestionOutcome[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [noSimilar, setNoSimilar] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    postJSON<Plan>("/api/session", { level, concept }, controller.signal)
      .then((p) => {
        setPlan(p);
        setQueue(p.questions);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message));
    return () => controller.abort();
  }, [level, concept]);

  if (error) return <Centered title="문제를 불러오지 못했어요" text={error} />;
  if (!plan) {
    return (
      <div className="mx-auto flex max-w-2xl items-center justify-center gap-2 px-4 py-24 text-ink-500">
        <Spinner /> 나에게 맞는 문제를 고르고 있어요…
      </div>
    );
  }
  if (queue.length === 0) {
    return (
      <Centered
        title="이 난이도에는 아직 풀 문제가 없어요"
        text={plan.generating ? "AI가 새 문제를 만들고 검증하는 중이에요. 잠시 후 다시 시도하거나 다른 난이도를 골라보세요." : "다른 난이도나 개념을 골라보세요."}
      />
    );
  }
  if (done) return <SessionSummary plan={plan} queue={queue} results={results} />;

  const q = queue[index];
  const isLast = index === queue.length - 1;
  const sameCodeIndex = queue.slice(0, index + 1).filter((x) => x.codeItemId === q.codeItemId).length;
  const conceptLabel = conceptName(q.concepts.find((c) => c === plan.focusConcept) ?? q.concepts[0]);

  async function loadSimilar() {
    setSimilarLoading(true);
    try {
      const p = await postJSON<Plan>("/api/session", { level, concept: plan!.focusConcept, size: 1, exclude: queue.map((x) => x.id) });
      if (p.questions.length) {
        setQueue((list) => [...list.slice(0, index + 1), p.questions[0], ...list.slice(index + 1)]);
        setIndex((i) => i + 1);
      } else {
        setNoSimilar((s) => new Set(s).add(q.id));
      }
    } finally {
      setSimilarLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <div className="sticky top-14 z-20 -mx-4 mb-6 bg-ink-50/90 px-4 pb-3 pt-4 backdrop-blur">
        <div className="mb-2.5 flex items-center gap-3 text-sm font-semibold">
          <Link href="/learn" className="rounded-lg px-1.5 py-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="학습 홈으로 나가기">
            ←
          </Link>
          <span className="text-ink-700">JavaScript · {conceptLabel}</span>
          <span className="ml-auto font-mono text-ink-400">
            {String(index + 1).padStart(2, "0")}/{String(queue.length).padStart(2, "0")}
          </span>
        </div>
        <ProgressBar value={((index + (results.length > index ? 1 : 0)) / queue.length) * 100} size="sm" label="세션 진행률" />
      </div>

      {index === 0 && results.length === 0 && (
        <p className="mb-4 rounded-2xl bg-white px-4 py-3 text-sm text-ink-500 ring-1 ring-ink-200/70">
          {levelInfo(level).emoji} {levelInfo(level).name} · {REASON_TEXT[plan.reason]}
          {plan.generating && " · AI가 이 개념의 새 문제를 준비하고 있어요"}
        </p>
      )}

      <QuestionView
        key={`${q.id}-${index}`}
        question={q}
        sameCodeIndex={sameCodeIndex}
        isLast={isLast}
        onResult={(r) => setResults((prev) => [...prev, r])}
        onNext={() => {
          if (isLast) {
            setDone(true);
            router.refresh(); // 헤더의 XP·연속 학습 갱신
          } else setIndex((i) => i + 1);
        }}
        onSimilar={noSimilar.has(q.id) ? undefined : loadSimilar}
        similarLoading={similarLoading}
      />
    </div>
  );
}

function Centered({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="text-lg font-bold">{title}</p>
      <p className="mt-2 text-ink-500">{text}</p>
      <Link href="/learn" className="btn-primary mt-6">
        학습 홈으로
      </Link>
    </div>
  );
}

function SessionSummary({ plan, queue, results }: { plan: Plan; queue: PublicQuestion[]; results: QuestionOutcome[] }) {
  const correct = results.filter((r) => r.correct).length;
  const xp = results.reduce((s, r) => s + r.xp, 0);
  const ratio = results.length ? correct / results.length : 0;
  const analyzing = results.some((r) => r.analyzing);
  const aiCalls = results.filter((r) => r.gradedBy === "ai").length;
  const codes = new Set(queue.map((q) => q.codeItemId)).size;

  return (
    <div className="mx-auto max-w-xl px-4 pb-24 pt-10">
      <div className="card animate-pop overflow-hidden text-center">
        <div className="bg-gradient-to-br from-brand-600 to-brand-500 px-6 pb-8 pt-10 text-white">
          <p className="text-5xl" aria-hidden>
            {ratio === 1 ? "🏆" : ratio >= 0.5 ? "🎉" : "🌱"}
          </p>
          <h1 className="mt-3 text-2xl font-extrabold">{ratio === 1 ? "완벽해요!" : ratio >= 0.5 ? "오늘의 학습 완료!" : "한 걸음 더 나아갔어요"}</h1>
          <p className="mt-1 text-brand-100">
            코드 {codes}개를 {results.length}가지 질문으로 읽어봤어요.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <Stat label="맞힌 문제" value={`${correct}/${results.length}`} />
            <Stat label="얻은 XP" value={`+${xp}`} />
            <Stat label="AI 분석" value={`${aiCalls}회`} />
          </div>
        </div>
        <div className="space-y-3 p-6 text-left text-[15px] text-ink-700">
          {analyzing ? (
            <p className="rounded-2xl bg-brand-50 px-4 py-3">
              🤖 <b>AI 튜터가 지금까지의 학습 기록을 분석하고 있어요.</b> 잠시 후 내 학습에서 확인할 수 있어요.
            </p>
          ) : (
            <p className="rounded-2xl bg-ink-50 px-4 py-3 text-ink-500">10문제를 풀 때마다 AI 튜터가 학습 상태를 분석해 드려요.</p>
          )}
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <a href={`/practice?level=${plan.level}`} className="btn-primary">
          한 세트 더 풀기 →
        </a>
        <Link href={analyzing ? "/dashboard" : "/learn"} className="btn-soft">
          {analyzing ? "내 학습 보러 가기" : "학습 홈으로"}
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

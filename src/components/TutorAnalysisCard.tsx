import Link from "next/link";
import { AIBadge } from "@/components/AIBadge";
import { ProgressBar } from "@/components/ui";
import type { LearnerAnalysis } from "@/lib/ai/analysis";
import { conceptName, levelInfo } from "@/lib/curriculum";
import type { StoredAnalysis } from "@/lib/server/session-repo";

/** AI 학습자 분석 결과 (일정 문제 수마다 갱신) */
export function TutorAnalysisCard({
  analysis,
  sinceLast,
  every,
  compact = false,
}: {
  analysis: StoredAnalysis<LearnerAnalysis> | null;
  sinceLast: number;
  every: number;
  compact?: boolean;
}) {
  const remaining = Math.max(0, every - sinceLast);
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-sm text-white" aria-hidden>
          🤖
        </span>
        <p className="font-bold">AI Tutor 학습 분석</p>
        <span className="ml-auto">{analysis && <AIBadge source={analysis.source === "ai" ? "ai" : "rule"} />}</span>
      </div>
      <div className="space-y-4 p-5">
        {!analysis ? (
          <>
            <p className="text-[15px] leading-relaxed text-ink-700">
              문제를 <b>{every}개</b> 풀면 AI 튜터가 내가 코드를 어떻게 이해하고 있는지 분석해 드려요.
            </p>
            <div>
              <ProgressBar value={(sinceLast / every) * 100} label="분석까지" />
              <p className="mt-1.5 text-xs text-ink-400">{remaining}문제 남았어요</p>
            </div>
          </>
        ) : (
          <>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-700">{analysis.result.summary}</p>
            {analysis.result.confusions.length > 0 && (
              <ul className="space-y-2">
                {analysis.result.confusions.slice(0, compact ? 1 : 3).map((c, i) => (
                  <li key={i} className="rounded-2xl bg-sun-50 px-4 py-3 text-[15px] text-ink-700">
                    <span className="font-bold text-sun-600">🔎 </span>
                    {c.description}
                  </li>
                ))}
              </ul>
            )}
            {!compact && analysis.result.strengths.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {analysis.result.strengths.map((s) => (
                  <span key={s} className="chip bg-mint-50 px-3 py-1.5 text-sm text-mint-700">
                    💪 {s}
                  </span>
                ))}
              </div>
            )}
            {analysis.result.recommendedLevel && (
              <p className="rounded-2xl bg-brand-50 px-4 py-3 text-[15px] text-ink-700">
                🎯 <b>AI 추천 난이도: {levelInfo(analysis.result.recommendedLevel).name}</b>
                {analysis.result.levelMessage && <> — {analysis.result.levelMessage}</>}
              </p>
            )}
            {analysis.result.focusConcepts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink-500">다음에 집중할 개념</span>
                {analysis.result.focusConcepts.map((c) => (
                  <Link key={c} href={`/practice?concept=${c}&level=${analysis.result.recommendedLevel ?? 2}`} className="chip bg-white px-3 py-1.5 text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
                    {conceptName(c)} →
                  </Link>
                ))}
              </div>
            )}
            {!compact && analysis.result.studyTip && <p className="text-sm text-ink-500">✏️ {analysis.result.studyTip}</p>}
            <p className="text-xs text-ink-400">
              {analysis.attemptCount}문제 기준 분석 · 다음 분석까지 {remaining}문제
            </p>
          </>
        )}
      </div>
    </section>
  );
}

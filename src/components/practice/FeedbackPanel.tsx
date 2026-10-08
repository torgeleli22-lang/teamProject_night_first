"use client";

import { useState } from "react";
import { AIBadge } from "@/components/AIBadge";
import { CodeSnippet } from "@/components/CodeBlock";
import { Spinner, UnderstandingChip } from "@/components/ui";
import type { Feedback, Problem } from "@/lib/types";
import { TutorChat } from "./TutorChat";

interface Props {
  problem: Problem;
  /** 즉시 채점 결과 (설명형은 AI 응답 전까지 null) */
  verdict: boolean | null;
  feedback: Feedback | null;
  revealed: boolean;
  myAnswer: string;
  correctAnswer: string;
  xpGained: number | null;
  isLast: boolean;
  onNext: () => void;
  onSimilar?: () => void;
  onConcept: () => void;
}

export function FeedbackPanel({
  problem,
  verdict,
  feedback,
  revealed,
  myAnswer,
  correctAnswer,
  xpGained,
  isLast,
  onNext,
  onSimilar,
  onConcept,
}: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const correct = feedback?.correct ?? verdict;
  const partial = feedback?.partial;
  const tone = revealed ? "neutral" : correct ? "good" : partial ? "partial" : correct === false ? "bad" : "neutral";

  const headerStyle = {
    good: "bg-mint-50 text-mint-700",
    partial: "bg-sun-50 text-sun-600",
    bad: "bg-coral-50 text-coral-600",
    neutral: "bg-ink-100 text-ink-700",
  }[tone];
  const emoji = { good: "🎉", partial: "👍", bad: "🧐", neutral: "📘" }[tone];
  const fallbackHeadline = revealed
    ? "정답과 해설"
    : correct
      ? "정답이에요!"
      : correct === false
        ? "아쉬워요, 같이 확인해 봐요"
        : "답변을 살펴보고 있어요";

  return (
    <section className="card animate-fade-up overflow-hidden" aria-live="polite">
      <div className={`flex items-center gap-3 px-5 py-4 ${headerStyle}`}>
        <span className="animate-pop text-2xl" aria-hidden>
          {emoji}
        </span>
        <p className="flex-1 text-lg font-extrabold">{feedback?.headline ?? fallbackHeadline}</p>
        {xpGained !== null && <span className="chip animate-pop bg-white/80 text-brand-700">+{xpGained} XP</span>}
      </div>

      <div className="space-y-5 p-5">
        {!feedback ? (
          <p className="flex items-center gap-2 text-[15px] text-ink-500">
            <Spinner /> AI 튜터가 {problem.type === "explain" ? "설명을 읽고 있어요" : "왜 그런지 설명을 준비하고 있어요"}…
          </p>
        ) : (
          <>
            <div>
              <div className="mb-2 flex items-center gap-2">
                <p className="font-bold text-ink-900">{correct ? "왜 그런지 알아볼까요?" : "어디서 생각이 갈라졌을까요?"}</p>
                <AIBadge source={feedback.source} />
              </div>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-700">{feedback.explanation}</p>
            </div>

            {!correct && (
              <div className="grid gap-3 sm:grid-cols-2">
                {!revealed && (
                  <div>
                    <p className="mb-1.5 text-xs font-bold text-coral-600">내 답</p>
                    <pre className="whitespace-pre-wrap rounded-xl bg-coral-50 px-3 py-2.5 font-mono text-[13px] text-ink-700">{myAnswer}</pre>
                  </div>
                )}
                <div className={revealed ? "sm:col-span-2" : ""}>
                  <p className="mb-1.5 text-xs font-bold text-mint-700">{problem.type === "explain" ? "모범 설명" : "정답"}</p>
                  <pre className="whitespace-pre-wrap rounded-xl bg-mint-50 px-3 py-2.5 font-mono text-[13px] text-ink-700">{correctAnswer}</pre>
                </div>
              </div>
            )}

            {feedback.steps.length > 0 && (
              <div>
                <p className="mb-2 font-bold text-ink-900">한 단계씩 따라가기</p>
                <ol className="space-y-1.5">
                  {feedback.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink-700">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                        {i + 1}
                      </span>
                      <span className="whitespace-pre-line">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {problem.output && problem.type !== "predict" && (
              <div>
                <p className="mb-2 text-sm font-bold text-ink-500">실제 실행 결과</p>
                <CodeSnippet code={problem.output} />
              </div>
            )}

            {!revealed && feedback.checks.length > 0 && (
              <div>
                <p className="mb-2 font-bold text-ink-900">이해도 분석</p>
                <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100">
                  {feedback.checks.map((check, i) => (
                    <li key={i} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                      <span className="w-36 shrink-0 font-semibold text-ink-900">{check.label}</span>
                      <UnderstandingChip level={check.level} />
                      <span className="text-sm text-ink-500 sm:ml-1">{check.comment}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {feedback.misconception && !correct && (
              <p className="rounded-2xl bg-sun-50 px-4 py-3 text-[15px] text-ink-700">
                <span className="font-bold">🔎 자주 하는 착각: </span>
                {feedback.misconception}
              </p>
            )}

            <div className="rounded-2xl bg-brand-50 px-4 py-3.5">
              <p className="text-xs font-bold text-brand-600">💡 핵심 개념</p>
              <p className="mt-0.5 font-semibold text-brand-900">{problem.keyPoint}</p>
              {feedback.nextTip && feedback.nextTip !== problem.keyPoint && (
                <p className="mt-1 text-sm text-brand-800/80">{feedback.nextTip}</p>
              )}
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">
          <button type="button" onClick={() => setChatOpen((v) => !v)} className="btn-ghost px-4 py-2.5 text-sm">
            💬 튜터에게 질문
          </button>
          <button type="button" onClick={onConcept} className="btn-ghost px-4 py-2.5 text-sm">
            📖 개념 설명
          </button>
          <div className="ml-auto flex flex-wrap gap-2">
            {onSimilar && (
              <button type="button" onClick={onSimilar} className="btn-soft px-4 py-2.5 text-sm">
                비슷한 문제 풀어보기
              </button>
            )}
            <button type="button" onClick={onNext} className="btn-primary px-5 py-2.5 text-sm" autoFocus>
              {isLast ? "결과 보기" : "다음 문제 →"}
            </button>
          </div>
        </div>
        {chatOpen && <TutorChat problemId={problem.id} solved />}
      </div>
    </section>
  );
}

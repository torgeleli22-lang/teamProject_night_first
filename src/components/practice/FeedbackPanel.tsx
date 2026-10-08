"use client";

import { useState } from "react";
import { AIBadge } from "@/components/AIBadge";
import { CodeSnippet } from "@/components/CodeBlock";
import { Spinner, UnderstandingChip } from "@/components/ui";
import { postJSON } from "@/lib/api";
import type { ShortAnswerFeedback } from "@/lib/ai/tutor";
import type { AttemptResult, TutorNote } from "@/lib/server/grade";
import type { PublicQuestion } from "@/lib/server/session";
import { TutorChat } from "./TutorChat";

interface Props {
  question: PublicQuestion;
  result: AttemptResult;
  /** 주관식 원문 ("AI 에게 자세히 분석 받기" 용) */
  answerText?: string;
  gaveUp: boolean;
  isLast: boolean;
  onNext: () => void;
  onSimilar?: () => void;
  similarLoading?: boolean;
  onConcept: () => void;
}

export function FeedbackPanel({ question, result, answerText, gaveUp, isLast, onNext, onSimilar, similarLoading, onConcept }: Props) {
  const [tutor, setTutor] = useState<TutorNote>(result.tutor);
  const [deepLoading, setDeepLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const { correct, partial } = result;
  const tone = gaveUp ? "neutral" : correct ? "good" : partial ? "partial" : "bad";
  const headerStyle = { good: "bg-mint-50 text-mint-700", partial: "bg-sun-50 text-sun-600", bad: "bg-coral-50 text-coral-600", neutral: "bg-ink-100 text-ink-700" }[tone];
  const emoji = { good: "🎉", partial: "👍", bad: "🧐", neutral: "📘" }[tone];
  const verdictText = gaveUp ? "정답과 해설" : correct ? "정답" : partial ? "부분 정답" : "오답";

  async function deepAnalysis() {
    if (!answerText) return;
    setDeepLoading(true);
    try {
      const fb = await postJSON<ShortAnswerFeedback>("/api/explain", { questionId: question.id, text: answerText });
      setTutor({
        headline: fb.headline,
        message: fb.explanation,
        checks: fb.checks,
        misconception: fb.misconception,
        correction: fb.correction,
        nextTip: fb.nextTip,
        source: fb.gradedBy === "ai" ? "ai" : "rule",
      });
    } finally {
      setDeepLoading(false);
    }
  }

  return (
    <div className="space-y-4" aria-live="polite">
      {/* 결과 */}
      <div className={`flex animate-pop items-center gap-3 rounded-2xl px-5 py-3.5 ${headerStyle}`}>
        <span className="text-2xl" aria-hidden>
          {emoji}
        </span>
        <p className="flex-1 text-lg font-extrabold">{verdictText}</p>
        <span className="chip bg-white/80 text-brand-700">+{result.xp} XP</span>
      </div>

      {/* AI Tutor */}
      <section className="card animate-fade-up overflow-hidden">
        <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-3">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-sm text-white" aria-hidden>
            🤖
          </span>
          <p className="font-bold">AI Tutor</p>
          <span className="ml-auto">
            <AIBadge source={tutor.source} />
          </span>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <p className="text-[17px] font-bold text-ink-900">{tutor.headline}</p>
            <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-ink-700">{tutor.message}</p>
          </div>

          {tutor.checks.length > 0 && (
            <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100">
              {tutor.checks.map((check, i) => (
                <li key={i} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className="shrink-0 font-semibold text-ink-900 sm:w-40">{check.label}</span>
                  <UnderstandingChip level={check.level} />
                  <span className="text-sm text-ink-500">{check.comment}</span>
                </li>
              ))}
            </ul>
          )}

          {(tutor.correction || tutor.misconception) && (
            <div className="rounded-2xl bg-sun-50 px-4 py-3">
              <p className="text-xs font-bold text-sun-600">💡 Hint</p>
              {tutor.misconception && <p className="mt-0.5 text-sm text-ink-500">혹시 이렇게 생각했나요? — {tutor.misconception}</p>}
              {tutor.correction && <p className="mt-1 text-[15px] font-semibold text-ink-900">{tutor.correction}</p>}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {onSimilar && (
              <button type="button" onClick={onSimilar} disabled={similarLoading} className="btn-soft px-4 py-2.5 text-sm">
                {similarLoading ? <Spinner /> : null} 비슷한 문제 풀어보기 →
              </button>
            )}
            {question.type === "short_answer" && tutor.source !== "ai" && answerText && (
              <button type="button" onClick={deepAnalysis} disabled={deepLoading} className="btn-ghost px-4 py-2.5 text-sm">
                {deepLoading ? <Spinner /> : "✨"} AI에게 자세히 분석 받기
              </button>
            )}
            <button type="button" onClick={() => setChatOpen((v) => !v)} className="btn-ghost px-4 py-2.5 text-sm">
              💬 튜터에게 질문
            </button>
          </div>
          {chatOpen && <TutorChat questionId={question.id} solved />}
        </div>
      </section>

      {/* 해설 */}
      <section className="card animate-fade-up space-y-5 p-5 [animation-delay:80ms]">
        {!correct && (
          <div className="grid gap-3 sm:grid-cols-2">
            {!gaveUp && (
              <div>
                <p className="mb-1.5 text-xs font-bold text-coral-600">내 답</p>
                <pre className="whitespace-pre-wrap rounded-xl bg-coral-50 px-3 py-2.5 font-mono text-[13px] text-ink-700">{result.myAnswer}</pre>
              </div>
            )}
            <div className={gaveUp ? "sm:col-span-2" : ""}>
              <p className="mb-1.5 text-xs font-bold text-mint-700">{question.type === "short_answer" ? "모범 설명" : "정답"}</p>
              <pre className="whitespace-pre-wrap rounded-xl bg-mint-50 px-3 py-2.5 font-mono text-[13px] text-ink-700">{result.correctAnswer}</pre>
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 font-bold text-ink-900">한 단계씩 따라가기</p>
          <ol className="space-y-1.5">
            {result.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink-700">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">{i + 1}</span>
                <span className="whitespace-pre-line">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {result.output && question.type !== "predict_output" && question.type !== "find_bug" && (
          <div>
            <p className="mb-2 text-sm font-bold text-ink-500">원본 코드의 실제 실행 결과</p>
            <CodeSnippet code={result.output} />
          </div>
        )}

        <div className="rounded-2xl bg-brand-50 px-4 py-3.5">
          <p className="text-xs font-bold text-brand-600">💡 핵심 개념</p>
          <p className="mt-0.5 font-semibold text-brand-900">{result.keyPoint}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
          <button type="button" onClick={onConcept} className="btn-ghost px-4 py-2.5 text-sm">
            📖 개념 설명
          </button>
          <button type="button" onClick={onNext} className="btn-primary ml-auto px-6 py-2.5 text-sm" autoFocus>
            {isLast ? "결과 보기" : "다음 문제 →"}
          </button>
        </div>
      </section>
    </div>
  );
}

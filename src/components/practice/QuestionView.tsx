"use client";

import { useEffect, useRef, useState } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import { DifficultyDots } from "@/components/ui";
import { postJSON } from "@/lib/api";
import { levelInfo, QUESTION_TYPE_LABEL as TYPE_LABEL, SKILL_LABEL } from "@/lib/curriculum";
import type { AttemptResult } from "@/lib/server/grade";
import type { PublicQuestion } from "@/lib/server/planner";
import type { Answer } from "@/lib/types";
import { ChoiceInput, ShuffleInput, TextAnswer } from "./AnswerInputs";
import { ConceptSheet } from "./ConceptSheet";
import { FeedbackPanel } from "./FeedbackPanel";
import { HintList } from "./HintPanel";
import { TutorChat } from "./TutorChat";


export type QuestionOutcome = AttemptResult & { analyzing: boolean };

interface Props {
  question: PublicQuestion;
  /** 같은 코드에서 나온 몇 번째 문제인지 (1부터). 2 이상이면 "같은 코드, 다른 질문" 표시 */
  sameCodeIndex: number;
  isLast: boolean;
  onResult: (r: QuestionOutcome) => void;
  onNext: () => void;
  onSimilar?: () => void;
  similarLoading?: boolean;
}

export function QuestionView({ question: q, sameCodeIndex, isLast, onResult, onNext, onSimilar, similarLoading }: Props) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [bugLine, setBugLine] = useState<number | null>(null);
  const [order, setOrder] = useState<number[]>([]);

  const [hints, setHints] = useState<string[]>([]);
  const [hintLoading, setHintLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuestionOutcome | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConcept, setShowConcept] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const startedAt = useRef(Date.now());
  const feedbackRef = useRef<HTMLDivElement>(null);

  function currentAnswer(): Answer | null {
    switch (q.type) {
      case "multiple_choice":
      case "fill_blank":
        return choice === null ? null : { type: q.type, index: choice };
      case "predict_output":
        return text.trim() ? { type: q.type, text } : null;
      case "short_answer":
        return text.trim().length >= 4 ? { type: q.type, text } : null;
      case "find_bug":
        return bugLine === null ? null : { type: q.type, line: bugLine };
      case "shuffle":
        return order.length === (q.pieces?.length ?? 0) ? { type: q.type, order } : null;
    }
  }

  const answer = currentAnswer();
  const done = result !== null;

  async function send(giveUp: boolean) {
    if (submitting || done || (!giveUp && !answer)) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await postJSON<QuestionOutcome>("/api/attempts", {
        questionId: q.id,
        answer: giveUp ? undefined : answer,
        giveUp,
        hintsUsed: hints.length,
        timeMs: Date.now() - startedAt.current,
      });
      setGaveUp(giveUp);
      setResult(r);
      onResult(r);
      requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출하지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  async function nextHint() {
    const level = hints.length + 1;
    if (level > 4 || hintLoading) return;
    setHintLoading(true);
    try {
      const { hint } = await postJSON<{ hint: string }>("/api/hint", { questionId: q.id, level });
      setHints((h) => [...h, hint]);
    } finally {
      setHintLoading(false);
    }
  }

  // 키보드: 1~9 로 보기 선택, Enter 로 제출 (텍스트 입력 중에는 제외)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || done) return;
      if (q.choices && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < q.choices.length) setChoice(i);
      }
      if (e.key === "Enter" && target.tagName !== "BUTTON") send(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const level = levelInfo(q.level);

  return (
    <div className="space-y-5">
      <div className="animate-fade-up">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="chip bg-brand-50 text-brand-700">{TYPE_LABEL[q.type]}</span>
          <span className="chip bg-ink-100 text-ink-500">
            {level.emoji} {level.name} · {SKILL_LABEL[q.skill]}
          </span>
          <DifficultyDots level={q.level} />
          {sameCodeIndex > 1 && <span className="chip bg-sun-50 text-sun-600">🔁 같은 코드, 다른 질문</span>}
        </div>
        <h1 className="whitespace-pre-line text-[19px] font-bold leading-snug text-ink-900 sm:text-xl">{q.prompt}</h1>
      </div>

      {q.code && (
        <CodeBlock
          code={q.code}
          onSelectLine={q.type === "find_bug" && !done ? setBugLine : undefined}
          selectedLine={q.type === "find_bug" ? bugLine : null}
          highlightLine={done && result?.bugLine ? result.bugLine : null}
          highlightTone={result?.correct ? "good" : "bad"}
          focusLines={q.focusLines}
        />
      )}

      <div>
        {q.choices && (
          <ChoiceInput
            choices={q.choices}
            value={choice}
            onChange={setChoice}
            answerIndex={result?.answerIndex}
            mono={q.type === "fill_blank" || q.skill === "predict"}
          />
        )}
        {(q.type === "predict_output" || q.type === "short_answer") && (
          <TextAnswer value={text} onChange={setText} locked={done} mode={q.type} onSubmit={() => send(false)} />
        )}
        {q.type === "find_bug" && (
          <p className="rounded-2xl bg-ink-100 px-4 py-3 text-[15px] text-ink-700">
            {bugLine ? (
              <>
                선택한 줄: <b className="text-brand-700">{bugLine}번째 줄</b>
                {done && !result?.correct && result?.bugLine && <> · 정답은 {result.bugLine}번째 줄이에요</>}
              </>
            ) : (
              "👆 코드에서 문제가 있는 줄을 눌러 선택하세요"
            )}
          </p>
        )}
        {q.type === "shuffle" && q.pieces && (
          <ShuffleInput pieces={q.pieces} value={order} onChange={setOrder} locked={done} correct={done ? result!.correct : null} />
        )}
      </div>

      {!done && <HintList hints={hints} loading={hintLoading} />}
      {error && <p className="rounded-2xl bg-coral-50 px-4 py-3 text-sm text-coral-700">{error}</p>}

      {!done && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-3xl border border-ink-200/70 bg-white/90 p-2.5 shadow-card backdrop-blur">
          {hints.length < 4 ? (
            <button type="button" onClick={nextHint} disabled={hintLoading} className="btn-ghost px-4 py-2.5 text-sm">
              💡 힌트 {hints.length > 0 && <span className="text-ink-400">{hints.length}/4</span>}
            </button>
          ) : (
            <button type="button" onClick={() => send(true)} disabled={submitting} className="btn-ghost px-4 py-2.5 text-sm">
              📘 정답과 해설 보기
            </button>
          )}
          <button type="button" onClick={() => setAskOpen((v) => !v)} className="btn-ghost px-4 py-2.5 text-sm">
            💬 질문
          </button>
          <button type="button" onClick={() => setShowConcept(true)} className="btn-ghost hidden px-4 py-2.5 text-sm sm:inline-flex">
            📖 개념
          </button>
          <button type="button" onClick={() => send(false)} disabled={!answer || submitting} className="btn-primary ml-auto px-7 py-2.5">
            {submitting ? (q.type === "short_answer" ? "분석 중…" : "채점 중…") : "제출"}
          </button>
        </div>
      )}
      {!done && askOpen && <TutorChat questionId={q.id} solved={false} />}

      <div ref={feedbackRef} className="scroll-mt-28">
        {result && (
          <FeedbackPanel
            question={q}
            result={result}
            answerText={q.type === "short_answer" ? text : undefined}
            gaveUp={gaveUp}
            isLast={isLast}
            onNext={onNext}
            onSimilar={onSimilar}
            similarLoading={similarLoading}
            onConcept={() => setShowConcept(true)}
          />
        )}
      </div>

      {showConcept && <ConceptSheet conceptId={q.concepts[0]} onClose={() => setShowConcept(false)} />}
    </div>
  );
}

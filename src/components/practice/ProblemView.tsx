"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import { DifficultyDots } from "@/components/ui";
import { postJSON } from "@/lib/api";
import { offlineFeedback } from "@/lib/feedback-offline";
import { describeAnswer, describeCorrect, detectMisconception, gradeAnswer } from "@/lib/grading";
import { typeLabel } from "@/lib/problems";
import { recordAttempt } from "@/lib/progress-store";
import type { Answer, Feedback, Problem } from "@/lib/types";
import { ChoiceInput, OrderInput, TextAnswer } from "./AnswerInputs";
import { ConceptSheet } from "./ConceptSheet";
import { FeedbackPanel } from "./FeedbackPanel";
import { HintList } from "./HintPanel";
import { TutorChat } from "./TutorChat";

export interface ProblemResult {
  problemId: string;
  correct: boolean;
  partial?: boolean;
  hintsUsed: number;
  xp: number;
}

interface Props {
  problem: Problem;
  aiEnabled: boolean | null;
  isLast: boolean;
  onResult: (result: ProblemResult) => void;
  onNext: () => void;
  onSimilar?: () => void;
}

/** 문제 id 로 시드를 만든 결정적 셔플 (원래 순서와 같으면 한 칸 회전) */
function seededShuffle(n: number, seed: string): number[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.every((v, i) => v === i) ? [...arr.slice(1), arr[0]] : arr;
}

export function ProblemView({ problem, aiEnabled, isLast, onResult, onNext, onSimilar }: Props) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [bugLine, setBugLine] = useState<number | null>(null);
  const [order, setOrder] = useState<number[]>([]);

  const [hints, setHints] = useState<string[]>([]);
  const [hintLoading, setHintLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [xp, setXp] = useState<number | null>(null);
  const [showConcept, setShowConcept] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<Answer | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const shuffled = useMemo(
    () => (problem.type === "order" ? seededShuffle(problem.pieces.length, problem.id) : []),
    [problem],
  );

  function currentAnswer(): Answer | null {
    switch (problem.type) {
      case "choice":
        return choice === null ? null : { type: "choice", index: choice };
      case "predict":
        return text.trim() ? { type: "predict", text } : null;
      case "explain":
        return text.trim().length >= 5 ? { type: "explain", text } : null;
      case "bug":
        return bugLine === null ? null : { type: "bug", line: bugLine };
      case "order":
        return order.length === problem.pieces.length ? { type: "order", order } : null;
    }
  }

  const answer = currentAnswer();
  const canSubmit = !!answer && !submitted;

  function finish(correct: boolean, hintsUsed: number, extra: { partial?: boolean; misconception?: string } = {}) {
    const gained = recordAttempt({
      problemId: problem.id,
      conceptIds: problem.conceptIds,
      correct,
      partial: extra.partial,
      hintsUsed,
      misconception: extra.misconception,
      at: Date.now(),
    });
    setXp(gained);
    onResult({ problemId: problem.id, correct, partial: extra.partial, hintsUsed, xp: gained });
  }

  async function submit() {
    const a = currentAnswer();
    if (!a || submitted) return;
    const graded = gradeAnswer(problem, a);
    const misconception = detectMisconception(problem, a);
    const hintsUsed = hints.length;
    setLastAnswer(a);
    setSubmitted(true);
    setVerdict(graded);
    if (graded !== null) finish(graded, hintsUsed, { misconception });
    requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

    let fb: Feedback;
    if (aiEnabled === false) {
      fb = offlineFeedback(problem, a, graded, hintsUsed, misconception);
    } else {
      try {
        fb = await postJSON<Feedback>("/api/ai/feedback", { problemId: problem.id, answer: a, hintsUsed });
      } catch {
        fb = offlineFeedback(problem, a, graded, hintsUsed, misconception);
      }
    }
    setFeedback(fb);
    if (graded === null) finish(fb.correct, hintsUsed, { partial: fb.partial, misconception: fb.misconception });
  }

  async function nextHint() {
    const level = hints.length + 1;
    if (level > 4 || hintLoading) return;
    if (aiEnabled === false) {
      setHints((h) => [...h, problem.hints[level - 1]]);
      return;
    }
    setHintLoading(true);
    try {
      const draft = answer ? describeAnswer(problem, answer) : undefined;
      const res = await postJSON<{ hint: string }>("/api/ai/hint", { problemId: problem.id, level, draft });
      setHints((h) => [...h, res.hint]);
    } catch {
      setHints((h) => [...h, problem.hints[level - 1]]);
    } finally {
      setHintLoading(false);
    }
  }

  function reveal() {
    if (submitted) return;
    setSubmitted(true);
    setRevealed(true);
    setVerdict(false);
    finish(false, 5);
    setFeedback({
      correct: false,
      headline: "정답과 해설",
      explanation: "괜찮아요. 해설을 천천히 읽고, 비슷한 문제로 다시 확인해 봐요.",
      steps: problem.explanation.split("\n").filter(Boolean),
      checks: [],
      nextTip: problem.keyPoint,
      source: "offline",
    });
    requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // 키보드: 1~4 로 보기 선택, Enter 로 제출 (텍스트 입력 중에는 제외)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || submitted) return;
      if (problem.type === "choice" && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < problem.choices.length) setChoice(i);
      }
      if (e.key === "Enter" && target.tagName !== "BUTTON") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const bugMarked = submitted && problem.type === "bug";
  const orderCorrect = submitted && problem.type === "order" ? verdict : null;

  return (
    <div className="space-y-5">
      {/* 질문 */}
      <div className="animate-fade-up">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold">
          <span className="chip bg-brand-50 text-brand-700">{typeLabel(problem)}</span>
          <DifficultyDots level={problem.difficulty} />
        </div>
        <h1 className="whitespace-pre-line text-[19px] font-bold leading-snug text-ink-900 sm:text-xl">{problem.prompt}</h1>
      </div>

      {/* 코드 */}
      {problem.code && (
        <CodeBlock
          code={problem.code}
          onSelectLine={problem.type === "bug" && !submitted ? setBugLine : undefined}
          selectedLine={problem.type === "bug" ? bugLine : null}
          highlightLine={bugMarked ? (problem as { bugLine: number }).bugLine : null}
          highlightTone={verdict ? "good" : "bad"}
        />
      )}

      {/* 답변 영역 */}
      <div>
        {problem.type === "choice" && <ChoiceInput problem={problem} value={choice} onChange={setChoice} locked={submitted} />}
        {(problem.type === "predict" || problem.type === "explain") && (
          <TextAnswer value={text} onChange={setText} locked={submitted} mode={problem.type} onSubmit={submit} />
        )}
        {problem.type === "bug" && (
          <p className="rounded-2xl bg-ink-100 px-4 py-3 text-[15px] text-ink-700">
            {bugLine ? (
              <>
                선택한 줄: <b className="text-brand-700">{bugLine}번째 줄</b>
                {bugMarked && !verdict && <> · 정답은 {(problem as { bugLine: number }).bugLine}번째 줄이에요</>}
              </>
            ) : (
              "👆 코드에서 문제가 있는 줄을 눌러 선택하세요"
            )}
          </p>
        )}
        {problem.type === "order" && (
          <OrderInput problem={problem} shuffled={shuffled} value={order} onChange={setOrder} locked={submitted} correct={orderCorrect} />
        )}
      </div>

      {/* 힌트 */}
      {!submitted && <HintList hints={hints} loading={hintLoading} />}

      {/* 액션 바 */}
      {!submitted && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-3xl border border-ink-200/70 bg-white/90 p-2.5 shadow-card backdrop-blur">
          {hints.length < 4 ? (
            <button type="button" onClick={nextHint} disabled={hintLoading} className="btn-ghost px-4 py-2.5 text-sm">
              💡 힌트 {hints.length > 0 && <span className="text-ink-400">{hints.length}/4</span>}
            </button>
          ) : (
            <button type="button" onClick={reveal} className="btn-ghost px-4 py-2.5 text-sm">
              📘 정답과 해설 보기
            </button>
          )}
          <button type="button" onClick={() => setAskOpen((v) => !v)} className="btn-ghost px-4 py-2.5 text-sm">
            💬 질문
          </button>
          <button type="button" onClick={() => setShowConcept(true)} className="btn-ghost hidden px-4 py-2.5 text-sm sm:inline-flex">
            📖 개념
          </button>
          <button type="button" onClick={submit} disabled={!canSubmit} className="btn-primary ml-auto px-7 py-2.5">
            제출
          </button>
        </div>
      )}
      {!submitted && askOpen && <TutorChat problemId={problem.id} solved={false} />}

      {/* 피드백 */}
      <div ref={feedbackRef} className="scroll-mt-20">
        {submitted && (
          <FeedbackPanel
            problem={problem}
            verdict={verdict}
            feedback={feedback}
            revealed={revealed}
            myAnswer={lastAnswer ? describeAnswer(problem, lastAnswer) : ""}
            correctAnswer={describeCorrect(problem)}
            xpGained={xp}
            isLast={isLast}
            onNext={onNext}
            onSimilar={onSimilar}
            onConcept={() => setShowConcept(true)}
          />
        )}
      </div>

      {showConcept && <ConceptSheet conceptId={problem.conceptIds[0]} problemId={problem.id} onClose={() => setShowConcept(false)} />}
    </div>
  );
}

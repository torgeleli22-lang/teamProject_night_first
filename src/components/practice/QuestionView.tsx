"use client";

import { useEffect, useRef, useState } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import { DifficultyDots } from "@/components/ui";
import { apiPost, notifyChanged } from "@/lib/api";
import { certSubject, conceptName, levelInfo, QUESTION_TYPE_LABEL as TYPE_LABEL, SKILL_LABEL, STAGE_INFO } from "@/lib/curriculum";
import type { AttemptResult } from "@/lib/api-types";
import type { PublicQuestion } from "@/lib/api-types";
import type { Answer } from "@/lib/types";
import { ChoiceInput, TextAnswer, TraceInput } from "./AnswerInputs";
import { ConceptSheet } from "./ConceptSheet";
import { FeedbackPanel } from "./FeedbackPanel";
import { HintList } from "./HintPanel";
import { TutorChat, type Turn } from "./TutorChat";


export type QuestionOutcome = AttemptResult & { analyzing: boolean };

interface Props {
  question: PublicQuestion;
  /** 같은 코드에서 나온 몇 번째 문제인지 (1부터). 코드 학습에서 2 이상이면 "같은 코드, 다음 단계" 표시 */
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
  /** 흐름 따라가기 칸에 적은 값 */
  const [traceValues, setTraceValues] = useState<string[]>([]);

  const [hints, setHints] = useState<string[]>([]);
  const [hintLoading, setHintLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuestionOutcome | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConcept, setShowConcept] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  /** 이 문제에서 튜터와 나눈 대화 (다음 문제로 넘어가면 이 화면과 함께 사라진다) */
  const [chatTurns, setChatTurns] = useState<Turn[]>([]);
  /** 튜터 Lambda 의 대화 id (이 문제 화면이 사라지면 함께 사라진다 → 다음 문제는 새 대화) */
  const [chatId, setChatId] = useState<string | null>(null);
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
      case "trace": {
        const rows = q.trace ?? [];
        return rows.length && rows.every((_, i) => traceValues[i]?.trim()) ? { type: q.type, values: traceValues } : null;
      }
    }
  }

  const answer = currentAnswer();
  const done = result !== null;
  /** 튜터에게 함께 보내는 지금까지의 답 (제출 전이라도, 주관식은 짧게 쓴 것도) */
  const chatAnswer: Answer | null =
    answer ??
    ((q.type === "predict_output" || q.type === "short_answer") && text.trim()
      ? { type: q.type, text }
      : q.type === "trace" && traceValues.some((v) => v?.trim())
        ? { type: q.type, values: (q.trace ?? []).map((_, i) => traceValues[i] ?? "") }
        : null);
  /** 튜터(tutor_chat.py)에 보낼 '지금 내 답' (보기는 화면에 보이는 번호와 글) */
  const answerText = !chatAnswer
    ? ""
    : chatAnswer.type === "multiple_choice" || chatAnswer.type === "fill_blank"
      ? `${chatAnswer.index + 1}번 보기 (${q.choices?.[chatAnswer.index] ?? ""})`
      : chatAnswer.type === "trace"
        ? (q.trace ?? []).map((r, i) => `${r.line}번째 줄 ${r.expr} = ${chatAnswer.values[i]?.trim() || "(빈칸)"}`).join(", ")
        : chatAnswer.text;
  const tutorChat = { answerText, chatId, setChatId };
  /** 이 문제의 힌트 수 (문제마다 1~4개) */
  const hintCount = q.hintCount;

  async function send(giveUp: boolean) {
    if (submitting || done || (!giveUp && !answer)) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await apiPost<QuestionOutcome>("/attempts", {
        questionId: q.id,
        answer: giveUp ? undefined : answer,
        giveUp,
        hintsUsed: hints.length,
        timeMs: Date.now() - startedAt.current,
      });
      setGaveUp(giveUp);
      setResult(r);
      onResult(r);
      // 헤더의 XP·연속 학습을 새로 고친다
      notifyChanged();
      requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출하지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  async function nextHint() {
    const level = hints.length + 1;
    if (level > hintCount || hintLoading) return;
    setHintLoading(true);
    try {
      const { hint } = await apiPost<{ hint: string }>("/hint", { questionId: q.id, level });
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
          {q.stage ? (
            <span className="chip bg-brand-50 text-brand-700">
              {STAGE_INFO[q.stage].emoji} {STAGE_INFO[q.stage].order}단계 · {STAGE_INFO[q.stage].label}
            </span>
          ) : q.track === "theory" ? (
            <span className="chip bg-brand-50 text-brand-700">🧠 {conceptName(q.concepts[0])}</span>
          ) : (
            <span className="chip bg-brand-50 text-brand-700">{TYPE_LABEL[q.type]}</span>
          )}
          <span className="chip bg-ink-100 text-ink-500">
            {level.emoji} {level.name} · {SKILL_LABEL[q.skill]}
          </span>
          <DifficultyDots level={q.level} />
          {q.track === "code" && sameCodeIndex > 1 && <span className="chip bg-sun-50 text-sun-600">🔁 같은 코드, 다음 단계</span>}
          {q.certs?.map((id) => {
            const c = certSubject(id);
            return c ? (
              <span key={id} className="chip bg-mint-50 text-mint-700" title={`${c.cert} · ${c.name}`}>
                🎓 {c.cert}
              </span>
            ) : null;
          })}
        </div>
        {q.stage && <p className="mb-1 text-sm text-ink-400">{STAGE_INFO[q.stage].hint}</p>}
        <h1 className="whitespace-pre-line text-[19px] font-bold leading-snug text-ink-900 sm:text-xl">{q.prompt}</h1>
      </div>

      {q.code && (
        <CodeBlock code={q.code} focusLines={q.focusLines} />
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
        {q.type === "trace" && q.trace && <TraceInput rows={q.trace} values={traceValues} onChange={setTraceValues} cells={result?.cells} />}
        {(q.type === "predict_output" || q.type === "short_answer") && (
          <TextAnswer value={text} onChange={setText} locked={done} mode={q.type} onSubmit={() => send(false)} />
        )}
      </div>

      {!done && <HintList hints={hints} loading={hintLoading} />}
      {error && <p className="rounded-2xl bg-coral-50 px-4 py-3 text-sm text-coral-700">{error}</p>}

      {!done && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-3xl border border-ink-200/70 bg-white/90 p-2.5 shadow-card backdrop-blur">
          {hints.length < hintCount ? (
            <button type="button" onClick={nextHint} disabled={hintLoading} className="btn-ghost px-4 py-2.5 text-sm">
              💡 힌트{" "}
              <span className="text-ink-400">
                {hints.length}/{hintCount}
              </span>
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
      {!done && askOpen && <TutorChat questionId={q.id} solved={false} turns={chatTurns} setTurns={setChatTurns} chat={tutorChat} />}

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
            chat={{ turns: chatTurns, setTurns: setChatTurns, tutor: { ...tutorChat, answerText: gaveUp ? "" : answerText } }}
          />
        )}
      </div>

      {showConcept && <ConceptSheet conceptId={q.concepts[0]} onClose={() => setShowConcept(false)} />}
    </div>
  );
}

"use client";

import { HighlightedLine } from "@/components/CodeBlock";
import type { ChoiceProblem, OrderProblem } from "@/lib/types";

type Mark = "correct" | "wrong" | "answer" | null;

const MARK_STYLE: Record<Exclude<Mark, null>, string> = {
  correct: "border-mint-500 bg-mint-50 ring-2 ring-mint-500/30",
  wrong: "border-coral-500 bg-coral-50 animate-shake",
  answer: "border-mint-500 border-dashed bg-mint-50/60",
};

export function ChoiceInput({
  problem,
  value,
  onChange,
  locked,
}: {
  problem: ChoiceProblem;
  value: number | null;
  onChange: (i: number) => void;
  locked: boolean;
}) {
  const mono = problem.subtype !== "concept";
  return (
    <div role="radiogroup" aria-label="보기" className={`grid gap-2.5 ${mono ? "sm:grid-cols-2" : ""}`}>
      {problem.choices.map((choice, i) => {
        const selected = value === i;
        let mark: Mark = null;
        if (locked) {
          if (i === problem.answerIndex) mark = selected ? "correct" : "answer";
          else if (selected) mark = "wrong";
        }
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={locked}
            onClick={() => onChange(i)}
            className={`group flex items-start gap-3 rounded-2xl border bg-white px-4 py-3.5 text-left transition disabled:cursor-default ${
              mark
                ? MARK_STYLE[mark]
                : selected
                  ? "border-brand-500 bg-brand-50/60 ring-2 ring-brand-500/20"
                  : "border-ink-200 hover:border-brand-300 hover:bg-brand-50/30"
            }`}
          >
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[10px] font-bold ${
                selected ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 text-transparent"
              }`}
              aria-hidden
            >
              ✓
            </span>
            <span className={`${mono ? "whitespace-pre-wrap font-mono text-[14px]" : "text-[15px]"} leading-relaxed text-ink-900`}>
              {choice.text}
            </span>
            {mark === "correct" || mark === "answer" ? (
              <span className="ml-auto shrink-0 text-xs font-bold text-mint-600">정답</span>
            ) : mark === "wrong" ? (
              <span className="ml-auto shrink-0 text-xs font-bold text-coral-600">내 선택</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TextAnswer({
  value,
  onChange,
  locked,
  mode,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  locked: boolean;
  mode: "predict" | "explain";
  onSubmit: () => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-ink-500" htmlFor="answer-input">
        {mode === "predict" ? "예상 출력 (한 줄에 하나씩)" : "내 설명"}
      </label>
      <textarea
        id="answer-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={locked}
        rows={mode === "predict" ? 3 : 5}
        maxLength={mode === "predict" ? 1000 : 2000}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
        }}
        placeholder={
          mode === "predict"
            ? "예) 10 5"
            : "예) count가 함수 안에서 선언되어서 호출할 때마다 …\n어려운 용어를 쓰지 않아도 괜찮아요. 내 말로 적어보세요."
        }
        className={`w-full resize-y rounded-2xl border border-ink-200 bg-white px-4 py-3 text-[15px] leading-relaxed outline-none transition placeholder:text-ink-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:bg-ink-50 ${
          mode === "predict" ? "font-mono" : ""
        }`}
      />
      <p className="mt-1.5 text-xs text-ink-400">
        {mode === "predict" ? "따옴표나 띄어쓰기는 조금 달라도 괜찮아요." : "정답 맞히기보다 '왜'를 설명하는 게 중요해요."} ·
        Ctrl/⌘ + Enter로 제출
      </p>
    </div>
  );
}

export function OrderInput({
  problem,
  shuffled,
  value,
  onChange,
  locked,
  correct,
}: {
  problem: OrderProblem;
  /** 화면에 보여줄 조각 순서 (원래 pieces 의 인덱스) */
  shuffled: number[];
  value: number[];
  onChange: (order: number[]) => void;
  locked: boolean;
  correct: boolean | null;
}) {
  const remaining = shuffled.filter((i) => !value.includes(i));
  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-ink-500">내 코드 {value.length > 0 && !locked && "· 줄을 누르면 빼낼 수 있어요"}</p>
        <div
          className={`min-h-[120px] rounded-2xl bg-code-bg p-3 font-mono text-[13.5px] text-code-text ring-2 ${
            correct === true ? "ring-mint-500" : correct === false ? "ring-coral-500" : "ring-transparent"
          }`}
        >
          {value.length === 0 && <p className="px-2 py-8 text-center text-sm text-code-muted">아래 조각을 순서대로 눌러 코드를 완성하세요</p>}
          {value.map((pieceIndex, pos) => (
            <button
              key={`${pieceIndex}-${pos}`}
              type="button"
              disabled={locked}
              onClick={() => onChange(value.filter((_, i) => i !== pos))}
              className="flex w-full items-center rounded-lg px-2 py-1.5 text-left hover:bg-white/5 disabled:hover:bg-transparent"
            >
              <span className="w-7 shrink-0 select-none text-right text-code-muted/70">{pos + 1}</span>
              <span className="whitespace-pre pl-3">
                <HighlightedLine line={problem.pieces[pieceIndex]} />
              </span>
            </button>
          ))}
        </div>
      </div>
      {!locked && remaining.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-500">코드 조각</p>
          <div className="flex flex-wrap gap-2">
            {remaining.map((pieceIndex) => (
              <button
                key={pieceIndex}
                type="button"
                onClick={() => onChange([...value, pieceIndex])}
                className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-left font-mono text-[13px] text-ink-900 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card"
              >
                <span className="whitespace-pre">{problem.pieces[pieceIndex].trim()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

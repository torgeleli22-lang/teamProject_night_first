"use client";

import { HighlightedLine } from "@/components/CodeBlock";

type Mark = "correct" | "wrong" | "answer" | null;

const MARK_STYLE: Record<Exclude<Mark, null>, string> = {
  correct: "border-mint-500 bg-mint-50 ring-2 ring-mint-500/30",
  wrong: "border-coral-500 bg-coral-50 animate-shake",
  answer: "border-mint-500 border-dashed bg-mint-50/60",
};

export function ChoiceInput({
  choices,
  value,
  onChange,
  answerIndex,
  mono,
}: {
  choices: string[];
  value: number | null;
  onChange: (i: number) => void;
  /** 제출 후 정답 인덱스 (제출 전에는 undefined) */
  answerIndex?: number;
  mono: boolean;
}) {
  const locked = answerIndex !== undefined;
  return (
    <div role="radiogroup" aria-label="보기" className={`grid gap-2.5 ${mono ? "sm:grid-cols-2" : ""}`}>
      {choices.map((choice, i) => {
        const selected = value === i;
        let mark: Mark = null;
        if (locked) {
          if (i === answerIndex) mark = selected ? "correct" : "answer";
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
            className={`group flex items-start gap-3 rounded-2xl border bg-white/75 backdrop-blur px-4 py-3.5 text-left transition disabled:cursor-default ${
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
            <span className={`${mono ? "whitespace-pre-wrap font-mono text-[14px]" : "text-[15px]"} leading-relaxed text-ink-900`}>{choice}</span>
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
  mode: "predict_output" | "short_answer";
  onSubmit: () => void;
}) {
  const predict = mode === "predict_output";
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-ink-500" htmlFor="answer-input">
        {predict ? "예상 출력 (한 줄에 하나씩)" : "내 설명"}
      </label>
      <textarea
        id="answer-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={locked}
        rows={predict ? 3 : 5}
        maxLength={predict ? 1000 : 2000}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit();
        }}
        placeholder={predict ? "예) 10 5" : "어려운 용어를 쓰지 않아도 괜찮아요. 코드가 어떻게 동작하는지 내 말로 적어보세요."}
        className={`w-full resize-y rounded-2xl border border-ink-200/80 bg-white/80 px-4 py-3 text-[15px] leading-relaxed outline-none transition placeholder:text-ink-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:bg-ink-50 ${
          predict ? "font-mono" : ""
        }`}
      />
      <p className="mt-1.5 text-xs text-ink-400">
        {predict ? "따옴표나 띄어쓰기는 조금 달라도 괜찮아요." : "정답 맞히기보다 '왜'를 설명하는 게 중요해요."} · Ctrl/⌘ + Enter로 제출
      </p>
    </div>
  );
}

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

/**
 * 흐름 따라가기 추적표: 줄이 실행된 시점의 값을 칸마다 적는다.
 * 문자열은 따옴표를 써도 안 써도 돼요. 채점 뒤에는 칸마다 정답과 맞았는지 보여 준다.
 */
export function TraceInput({
  rows,
  values,
  onChange,
  cells,
}: {
  rows: { line: number; when: "before" | "after"; context: string; expr: string }[];
  values: string[];
  onChange: (values: string[]) => void;
  /** 채점 결과 (있으면 잠금) */
  cells?: { expected: string; ok: boolean }[];
}) {
  const locked = !!cells;
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-500">강조된 줄이 실행될 때마다 값이 어떻게 바뀌는지 위에서부터 차례로 적어 보세요.</p>
      <ol className="space-y-2">
        {rows.map((r, i) => {
          const cell = cells?.[i];
          return (
            <li
              key={i}
              className={`grid gap-2 rounded-2xl border p-3 sm:grid-cols-[auto_1fr_minmax(8rem,12rem)] sm:items-center ${
                cell ? (cell.ok ? "border-mint-500 bg-mint-50/70" : "border-coral-500 bg-coral-50/70") : "border-white/70 bg-white/70 backdrop-blur"
              }`}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-ink-700">
                  {r.line}번째 줄 {r.when === "before" ? "실행 직전" : "실행 직후"}
                </p>
                {r.context && <p className="truncate font-mono text-[12.5px] text-ink-500">{r.context}</p>}
              </div>
              <label className="flex items-center gap-2 font-mono text-sm">
                <span className="shrink-0 text-ink-700">{r.expr} =</span>
                <input
                  value={values[i] ?? ""}
                  disabled={locked}
                  onChange={(e) => onChange(rows.map((_, k) => (k === i ? e.target.value : (values[k] ?? ""))))}
                  aria-label={`${i + 1}번째 칸: ${r.line}번째 줄 ${r.expr}`}
                  className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-2.5 py-1.5 outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:bg-transparent"
                />
              </label>
              {cell && !cell.ok && (
                <p className="text-sm text-mint-700 sm:col-span-3">
                  정답: <code className="font-mono">{cell.expected}</code>
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {!locked && <p className="text-xs text-ink-400">문자열은 따옴표 없이 써도 돼요. 배열은 [1, 2, 3], 객체는 {"{name: 'Kim'}"} 처럼 적어요.</p>}
    </div>
  );
}

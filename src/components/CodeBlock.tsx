"use client";

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "switch", "case", "break",
  "continue", "default", "new", "async", "await", "true", "false", "null", "undefined", "typeof",
  "instanceof", "of", "in", "class", "this", "try", "catch", "throw",
]);

type Token = { text: string; kind?: "kw" | "str" | "num" | "com" | "fn" | "blank" };

const TOKEN_RE =
  /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|(____)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/gm;

export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN_RE)) {
    if (m.index! > last) tokens.push({ text: line.slice(last, m.index) });
    const [text, com, str, num, blank, fn, word] = m;
    if (com) tokens.push({ text, kind: "com" });
    else if (str) tokens.push({ text, kind: "str" });
    else if (num) tokens.push({ text, kind: "num" });
    else if (blank) tokens.push({ text: " ? ", kind: "blank" });
    else if (fn) tokens.push({ text, kind: KEYWORDS.has(fn) ? "kw" : "fn" });
    else if (word) tokens.push({ text, kind: KEYWORDS.has(word) ? "kw" : undefined });
    last = m.index! + text.length;
  }
  if (last < line.length) tokens.push({ text: line.slice(last) });
  return tokens;
}

export function HighlightedLine({ line }: { line: string }) {
  return (
    <>
      {tokenize(line).map((t, i) =>
        t.kind ? (
          <span key={i} className={`tok-${t.kind}`}>
            {t.text}
          </span>
        ) : (
          <Fragment key={i}>{t.text}</Fragment>
        ),
      )}
    </>
  );
}

interface CodeBlockProps {
  code: string;
  /** 오류 찾기 문제처럼 줄을 선택할 수 있게 할 때 */
  onSelectLine?: (line: number) => void;
  selectedLine?: number | null;
  /** 정답 공개 후 강조할 줄 */
  highlightLine?: number | null;
  highlightTone?: "good" | "bad";
  /** 질문이 가리키는 줄 (역할 찾기 문제 등) */
  focusLines?: number[];
  showLineNumbers?: boolean;
  className?: string;
}

export function CodeBlock({
  code,
  onSelectLine,
  selectedLine,
  highlightLine,
  highlightTone = "good",
  focusLines = [],
  showLineNumbers = true,
  className = "",
}: CodeBlockProps) {
  const [full, setFull] = useState(false);
  const lines = code.split("\n");
  const selectable = !!onSelectLine;
  const linesProps = { lines, onSelectLine, selectedLine, highlightLine, highlightTone, focusLines, showLineNumbers };
  return (
    <div className={`overflow-hidden rounded-2xl bg-code-bg shadow-inner ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-coral-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-sun-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-mint-500/80" />
        <span className="ml-2 text-xs font-medium text-code-muted">JavaScript</span>
        {selectable && <span className="ml-auto text-xs text-code-muted">줄을 눌러 선택하세요</span>}
        <button
          type="button"
          onClick={() => setFull(true)}
          className={`${selectable ? "ml-3" : "ml-auto"} rounded-lg px-2 py-1 text-xs font-semibold text-code-muted hover:bg-white/10 hover:text-code-text`}
          aria-label="코드 크게 보기"
        >
          ⛶ 크게 보기
        </button>
      </div>
      <div className="overflow-x-auto py-3 font-mono text-[13.5px] leading-[1.75] text-code-text sm:text-[14.5px]">
        <CodeLines {...linesProps} />
      </div>
      {full && <FullscreenCode {...linesProps} onClose={() => setFull(false)} />}
    </div>
  );
}

type CodeLinesProps = Pick<CodeBlockProps, "onSelectLine" | "selectedLine" | "highlightLine" | "highlightTone" | "focusLines" | "showLineNumbers"> & {
  lines: string[];
  /** 긴 줄을 화면 너비에 맞춰 접기 */
  wrap?: boolean;
};

function CodeLines({ lines, onSelectLine, selectedLine, highlightLine, highlightTone = "good", focusLines = [], showLineNumbers = true, wrap = false }: CodeLinesProps) {
  const selectable = !!onSelectLine;
  return (
    <>
      {lines.map((line, i) => {
        const n = i + 1;
        const selected = selectedLine === n;
        const highlighted = highlightLine === n;
        const focused = focusLines.includes(n);
        const rowClass = [
          wrap ? "flex w-full pr-5 transition-colors" : "flex min-w-full w-max pr-5 transition-colors",
          selectable ? "cursor-pointer hover:bg-white/5" : "",
          selected ? "bg-brand-500/25 ring-1 ring-inset ring-brand-400/60" : "",
          highlighted ? (highlightTone === "good" ? "bg-mint-500/20" : "bg-coral-500/20") : "",
          focused && !highlighted && !selected ? "bg-sun-500/15 shadow-[inset_3px_0_0_theme(colors.sun.500)]" : "",
        ].join(" ");
        const content = (
          <>
            {showLineNumbers && <span className="w-10 shrink-0 select-none pr-3 text-right text-code-muted/70">{n}</span>}
            <span className={`${wrap ? "min-w-0 whitespace-pre-wrap break-all" : "whitespace-pre"} ${showLineNumbers ? "" : "pl-5"}`}>
              {line ? <HighlightedLine line={line} /> : " "}
            </span>
          </>
        );
        return selectable ? (
          <button
            key={i}
            type="button"
            onClick={() => onSelectLine(n)}
            aria-pressed={selected}
            aria-label={`${n}번째 줄 선택`}
            className={`${rowClass} text-left`}
          >
            {content}
          </button>
        ) : (
          <div key={i} className={rowClass}>
            {content}
          </div>
        );
      })}
    </>
  );
}

/**
 * 코드 전체 화면 보기. 화면 맨 위(body)에 띄워서 유리 효과(backdrop-filter) 안에서도 화면 전체를 덮는다.
 * Esc 또는 닫기 버튼으로 닫는다. 오류 찾기 문제의 줄 선택도 그대로 된다.
 */
function FullscreenCode({ onClose, ...props }: CodeLinesProps & { onClose: () => void }) {
  const [wrap, setWrap] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="코드 크게 보기" className="fixed inset-0 z-[100] flex flex-col bg-code-bg">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="text-sm font-semibold text-code-text">코드 크게 보기</span>
        {props.onSelectLine && <span className="text-xs text-code-muted">줄을 눌러 선택할 수 있어요</span>}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-code-muted">
          <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />긴 줄 접기
        </label>
        <button type="button" onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-code-text hover:bg-white/20">
          닫기 (Esc)
        </button>
      </div>
      <div className="flex-1 overflow-auto py-4 font-mono text-[15px] leading-[1.8] text-code-text sm:text-[17px]">
        <CodeLines {...props} wrap={wrap} />
      </div>
    </div>,
    document.body,
  );
}

/** 짧은 인라인/한 줄 코드 조각 */
export function CodeSnippet({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-code-bg px-4 py-3 font-mono text-[13px] leading-relaxed text-code-text">
      {code.split("\n").map((line, i) => (
        <div key={i} className="whitespace-pre">
          {line ? <HighlightedLine line={line} /> : " "}
        </div>
      ))}
    </pre>
  );
}

"use client";

import type { Language } from "@/lib/api-types";
import { highlightLine, type TokenKind } from "@/lib/highlight";

/** 문법 색칠 종류 → 글자색 (내 공부의 코드 조각도 같이 씀) */
export const TOKEN_COLOR: Record<TokenKind, string> = {
  kw: "text-code-kw",
  str: "text-code-str",
  num: "text-code-num",
  com: "italic text-code-com",
  fn: "text-code-fn",
  bi: "text-code-bi",
  plain: "",
};

export interface Range {
  start: number;
  end: number;
}

/**
 * 줄 번호가 있는 코드 (문법 색칠).
 * - stars: ※ 꼭 설명할 곳의 첫 줄 (왼쪽에 빨간 ※)
 * - highlights: 형광펜 범위 (오른쪽에 번호 ①②). 겹치면 더 진하게
 * - onLineDown·onLineEnter: 눌러서 끌어 범위 고르기 (읽기 화면)
 * - pending: 고르는 중인 범위 (옅게)
 * - from·to: 일부 줄만 보여 줄 때 (첨삭 결과)
 * - tint: 연분홍으로 칠할 줄 (다시 볼 곳)
 * - focus: 지금 보고 있는 범위 (형광펜보다 위에, 분홍 + 왼쪽 빨간 줄)
 * - language: 문법 색칠 언어 (기본 Python)
 * - wrap: 긴 줄을 접어서 (가로 스크롤 없이, 크게 보기 창) · dense: 줄 간격을 좁혀서 (크게 보기 창)
 */
export function CodeView({
  code,
  language = "python",
  wrap = false,
  dense = false,
  stars = [],
  highlights = [],
  labels = [],
  pending = null,
  from = 1,
  to,
  tint = [],
  focus = null,
  onLineClick,
  onLineDown,
  onLineEnter,
}: {
  code: string;
  language?: Language;
  wrap?: boolean;
  dense?: boolean;
  stars?: number[];
  highlights?: Range[];
  labels?: string[];
  pending?: Range | null;
  from?: number;
  to?: number;
  tint?: number[];
  focus?: Range | null;
  onLineClick?: (line: number) => void;
  onLineDown?: (line: number) => void;
  onLineEnter?: (line: number) => void;
}) {
  const lines = code.split("\n");
  const interactive = onLineClick || onLineDown;
  const last = Math.min(to ?? lines.length, lines.length);
  const rows = [];
  for (let no = from; no <= last; no++) {
    const depth = highlights.filter((h) => no >= h.start && no <= h.end).length;
    const startsHere = highlights.map((h, i) => (h.start === no ? labels[i] : "")).filter(Boolean).join("");
    const inPending = pending && no >= pending.start && no <= pending.end;
    const focused = focus && no >= focus.start && no <= focus.end;
    const bg = focused ? "bg-pen-redSoft shadow-[inset_3px_0_0_#c0392b]" : depth >= 2 ? "bg-marker-strong" : depth === 1 ? "bg-marker" : inPending ? "bg-ink-200/70" : tint.includes(no) ? "bg-pen-redSoft/70" : "";
    rows.push(
      <div
        key={no}
        className={`code-line ${dense ? "!text-[12px] !leading-5" : ""} ${interactive ? "" : "cursor-default"} ${bg}`}
        onClick={onLineClick ? () => onLineClick(no) : undefined}
        onPointerDown={onLineDown ? (e) => e.button === 0 && (e.preventDefault(), onLineDown(no)) : undefined}
        onPointerEnter={onLineEnter ? () => onLineEnter(no) : undefined}
        role={onLineClick ? "button" : undefined}
        tabIndex={onLineClick ? 0 : undefined}
        aria-label={onLineClick ? `${no}번 줄` : undefined}
        onKeyDown={onLineClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onLineClick(no)) : undefined}
      >
        <span className="text-center font-sans text-base font-bold text-pen-red">{stars.includes(no) ? "※" : ""}</span>
        <span className="border-r border-margin pr-2 text-right text-ink-400">{no}</span>
        <span className={`code-text pl-3 pr-2 text-ink-900 ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}>
          {highlightLine(lines[no - 1], language).map((t, i) => (
            <span key={i} className={TOKEN_COLOR[t.kind]}>
              {t.text}
            </span>
          ))}
        </span>
        {/* 메모 번호는 가로로 밀어도 보이게 오른쪽에 붙여 둔다 */}
        <span className={`sticky right-0 whitespace-nowrap px-1 text-center font-sans text-base text-pen-blue ${startsHere ? "bg-paper/90" : ""}`}>{startsHere}</span>
      </div>,
    );
  }
  return (
    <div className="overflow-x-auto border border-ink-300 bg-paper py-1">
      <div className={wrap ? "" : "min-w-max"}>{rows}</div>
    </div>
  );
}

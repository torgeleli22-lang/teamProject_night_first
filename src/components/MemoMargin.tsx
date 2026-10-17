"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Memo } from "@/lib/api-types";
import { Sticky } from "./ui";

/** CodeView 한 줄 높이(leading-7)와 위쪽 여백(border 1px + py-1 4px) — 포스트잇을 그 줄 높이에 맞춘다 */
export const ROW = 28;
const TOP = 5;
const GAP = 6;

const topOf = (line: number) => TOP + (line - 1) * ROW;
const anchorOf = (m: Memo) => Math.min(Math.max(m.anchor ?? m.start, m.start), m.end);

export interface Draft {
  start: number;
  end: number;
  text: string;
  /** 고치는 중인 메모 번호 (새 메모면 null) */
  editing: number | null;
}

/**
 * 코드 오른쪽 여백(넓은 화면): 포스트잇을 고른 줄 바로 옆에 붙인다.
 * - 포스트잇 윗부분(테이프)을 잡고 끌면 자기 범위(start~end) 안에서 줄 단위로 위아래로 옮겨진다 (키보드: ↑↓)
 * - 포스트잇끼리 겹치면 아래 것을 밀어 내린다
 * - 새 메모(draft)는 고른 범위의 첫 줄 옆에 뜬다
 */
export function MemoMargin({
  lines,
  memos,
  labels,
  draft,
  maxChars,
  canAdd,
  onDraftChange,
  onDraftRange,
  onSave,
  onCancel,
  onEdit,
  onDelete,
  onMove,
  onHover,
}: {
  lines: number;
  memos: Memo[];
  labels: string[];
  draft: Draft | null;
  maxChars: number;
  canAdd: boolean;
  onDraftChange: (text: string) => void;
  onDraftRange: (start: number, end: number) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit: (i: number) => void;
  onDelete: (i: number) => void;
  onMove: (i: number, anchor: number) => void;
  onHover: (i: number | null) => void;
}) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [heights, setHeights] = useState<number[]>([]);
  const [drag, setDrag] = useState<{ i: number; y0: number; a0: number; anchor: number } | null>(null);

  // 포스트잇 높이를 재서 겹치지 않게 배치한다 (글이 길어지면 다시 잼)
  useLayoutEffect(() => {
    const measure = () => setHeights(refs.current.slice(0, memos.length).map((el) => el?.offsetHeight ?? 60));
    measure();
    const ro = new ResizeObserver(measure);
    refs.current.slice(0, memos.length).forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [memos]);

  // 1. 붙일 위치: 앵커 줄 높이, 앞 포스트잇과 겹치면 아래로 (끄는 중인 것은 손을 따라감)
  const order = memos.map((m, i) => i).sort((a, b) => anchorOf(memos[a]) - anchorOf(memos[b]) || a - b);
  const tops: number[] = [];
  let floor = 0;
  for (const i of order) {
    if (drag?.i === i) continue;
    const t = Math.max(topOf(anchorOf(memos[i])), floor);
    tops[i] = t;
    floor = t + (heights[i] ?? 60) + GAP;
  }
  if (drag) tops[drag.i] = topOf(drag.anchor);
  const height = Math.max(TOP + lines * ROW + TOP, ...memos.map((_, i) => (tops[i] ?? 0) + (heights[i] ?? 60)), draft ? topOf(draft.start) + 220 : 0);

  // 2. 끌어서 옮기기 (자기 범위 안에서 줄 단위)
  useEffect(() => {
    if (!drag) return;
    const m = memos[drag.i];
    const move = (e: PointerEvent) => {
      const anchor = Math.min(Math.max(drag.a0 + Math.round((e.clientY - drag.y0) / ROW), m.start), m.end);
      if (anchor !== drag.anchor) setDrag({ ...drag, anchor });
    };
    const up = () => {
      onMove(drag.i, drag.anchor);
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, memos, onMove]);

  return (
    <div className="relative" style={{ height }}>
      {memos.map((m, i) => {
        const editing = draft?.editing === i;
        const canMove = m.end > m.start;
        return (
          <div
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`absolute left-0 right-0 transition-[top] duration-150 ${drag?.i === i ? "z-30 duration-0" : "z-10"} ${editing ? "opacity-30" : ""}`}
            style={{ top: tops[i] ?? topOf(anchorOf(m)) }}
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
          >
            {/* 이 줄을 가리키는 작은 선 */}
            <span className="absolute -left-3 top-3 h-px w-3 bg-pen-blue/60" aria-hidden />
            <Sticky tilt={drag?.i === i ? 0 : i % 2 ? 0.5 : -0.4} className={`p-2.5 ${drag?.i === i ? "shadow-lg" : ""}`}>
              <div
                className={`-mx-2.5 -mt-2.5 mb-1 flex items-center justify-between px-2.5 pt-1.5 text-xs text-ink-500 ${canMove ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
                onPointerDown={
                  canMove
                    ? (e) => {
                        if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
                        e.preventDefault();
                        setDrag({ i, y0: e.clientY, a0: anchorOf(m), anchor: anchorOf(m) });
                      }
                    : undefined
                }
                tabIndex={canMove ? 0 : undefined}
                role={canMove ? "slider" : undefined}
                aria-label={canMove ? `${labels[i]} 메모 위치 (${m.start}~${m.end}번 줄)` : undefined}
                aria-valuemin={m.start}
                aria-valuemax={m.end}
                aria-valuenow={anchorOf(m)}
                onKeyDown={
                  canMove
                    ? (e) => {
                        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                          e.preventDefault();
                          onMove(i, Math.min(Math.max(anchorOf(m) + (e.key === "ArrowUp" ? -1 : 1), m.start), m.end));
                        }
                      }
                    : undefined
                }
                title={canMove ? "끌어서 범위 안에서 위아래로 옮겨요" : undefined}
              >
                <span>
                  <span className="text-base text-pen-blue">{labels[i]}</span> {m.start === m.end ? `${m.start}번 줄` : `${m.start}~${m.end}번 줄`}
                  {canMove && <span className="ml-1 text-ink-400">· {anchorOf(m)}번 옆 ⇅</span>}
                </span>
                <span className="flex items-center gap-1">
                  <button type="button" className="px-1 hover:text-ink-900 hover:underline" onClick={() => onEdit(i)}>
                    고치기
                  </button>
                  <button type="button" aria-label={`${labels[i]} 메모 떼기`} className="px-1 text-base leading-none hover:text-pen-red" onClick={() => onDelete(i)}>
                    ×
                  </button>
                </span>
              </div>
              <p className="hand whitespace-pre-wrap break-words text-pen-blue">{m.text}</p>
            </Sticky>
          </div>
        );
      })}

      {draft && (
        <div className="absolute left-0 right-0 z-40" style={{ top: topOf(draft.start) }}>
          <DraftNote draft={draft} lines={lines} maxChars={maxChars} canAdd={canAdd} onChange={onDraftChange} onRange={onDraftRange} onSave={onSave} onCancel={onCancel} />
        </div>
      )}
    </div>
  );
}

/** 새 메모 / 고치는 메모: 범위(시작·끝 줄) 조정 + 글쓰기 */
export function DraftNote({
  draft,
  lines,
  maxChars,
  canAdd,
  onChange,
  onRange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  lines: number;
  maxChars: number;
  canAdd: boolean;
  onChange: (text: string) => void;
  onRange: (start: number, end: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const step = (which: "start" | "end", d: number) => {
    const start = which === "start" ? Math.min(Math.max(draft.start + d, 1), draft.end) : draft.start;
    const end = which === "end" ? Math.max(Math.min(draft.end + d, lines), draft.start) : draft.end;
    onRange(start, end);
  };
  const Stepper = ({ which }: { which: "start" | "end" }) => (
    <span className="inline-flex items-center border border-ink-300 bg-paper/70">
      <button type="button" className="px-1.5" aria-label={`${which === "start" ? "시작" : "끝"} 줄 위로`} onClick={() => step(which, -1)}>
        −
      </button>
      <b className="min-w-[2ch] text-center">{draft[which]}</b>
      <button type="button" className="px-1.5" aria-label={`${which === "start" ? "시작" : "끝"} 줄 아래로`} onClick={() => step(which, 1)}>
        +
      </button>
    </span>
  );
  return (
    <Sticky tape className="p-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-1 text-xs text-ink-700">
        <Stepper which="start" />
        <span>~</span>
        <Stepper which="end" />
        <span>번 줄의 흐름을 적어 주세요</span>
      </div>
      <textarea
        autoFocus
        className="hand mt-2 h-28 w-full resize-y border-0 bg-transparent text-pen-blue outline-none placeholder:text-ink-400"
        style={{ backgroundImage: "repeating-linear-gradient(transparent 0 27px, rgba(36,35,31,.12) 27px 28px)", lineHeight: "28px" }}
        maxLength={maxChars}
        placeholder="이 부분은 무엇을 받아서, 어디로 흘러가고, 무엇을 돌려주나요?"
        value={draft.text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onSave();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-[11px] text-ink-400">Ctrl+Enter 로 붙이기</span>
        <span className="flex items-center gap-3">
          <button type="button" className="text-xs text-ink-700" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="btn-ink py-1.5 text-xs" disabled={!draft.text.trim() || (draft.editing === null && !canAdd)} onClick={onSave}>
            {draft.editing !== null ? "메모 고치기" : "메모 붙이기"}
          </button>
        </span>
      </div>
    </Sticky>
  );
}

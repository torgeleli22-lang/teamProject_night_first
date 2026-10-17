"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";
import { MARK_NAMES, type RetryReply, type RetryState } from "@/lib/api-types";
import { MarkText, PenMark, Sticky } from "./ui";

const MAX_CHARS = 500;

/**
 * 힌트(첨삭 코멘트)를 보고 같은 범위를 다시 설명해 보는 칸.
 * 다시 쓴 설명은 그 항목만 다시 채점한다 (POST /review/retry, 항목 하나에 3번).
 * 처음 메모가 있으면 그 글에서 고쳐 쓰게 미리 채워 둔다.
 */
export function RetryBox({
  readingId,
  item,
  firstMark,
  firstText,
  initial,
  onLook,
}: {
  readingId: string;
  item: number;
  firstMark: keyof typeof MARK_NAMES;
  firstText: string;
  initial?: RetryState;
  onLook: (line: number) => void;
}) {
  const [state, setState] = useState<RetryState>(initial ?? { attempts: [], left: 3 });
  const last = state.attempts[state.attempts.length - 1];
  const [text, setText] = useState(last?.text ?? firstText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = last?.mark === "correct";

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<RetryReply>("/review/retry", { readingId, item, text: text.trim() });
      setState({ attempts: r.attempts, left: r.left });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="mt-3 border border-dashed border-pen-red/60 bg-paper p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="hand text-pen-red">힌트를 보고 다시 써 보기</span>
        <span className="text-xs text-ink-500">{done ? "정확해졌어요" : state.left > 0 ? `${state.left}번 더 써 볼 수 있어요` : "다시 쓰기를 다 썼어요"}</span>
      </div>

      {/* 다시 쓴 기록: 처음 → 1번째 → 2번째 … */}
      {state.attempts.length > 0 && (
        <ol className="mt-2 space-y-3">
          {state.attempts.map((a, i) => (
            <li key={i}>
              <Sticky className="p-2.5" tilt={i % 2 ? 0.4 : -0.3}>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p className="text-xs text-ink-500">
                      {i + 1}번째로 다시 쓴 설명 · <PenMark kind={i === 0 ? firstMark : state.attempts[i - 1].mark} inline />
                      {MARK_NAMES[i === 0 ? firstMark : state.attempts[i - 1].mark]} → <PenMark kind={a.mark} inline />
                      <b className="text-pen-red">{MARK_NAMES[a.mark]}</b>
                    </p>
                    <p className="hand mt-1 whitespace-pre-wrap break-words text-pen-blue">{a.text}</p>
                  </div>
                  <PenMark kind={a.mark} size={30} />
                </div>
              </Sticky>
              <p className="hand mt-2 text-pen-red">
                <MarkText text={a.comment} />
              </p>
              {a.lookAt.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.lookAt.map((n) => (
                    <button key={n} type="button" className="btn-small px-2 py-0.5" onClick={() => onLook(n)}>
                      {n}번 줄 보기
                    </button>
                  ))}
                </div>
              )}
              {!a.byAi && <p className="mt-1 text-[11px] text-ink-400">AI 대신 핵심 표현으로 판정했어요.</p>}
            </li>
          ))}
        </ol>
      )}

      {done ? (
        <p className="hand mt-3 text-2xl text-pen-red">잘했어요! 이제 이 부분의 흐름을 정확히 설명했어요.</p>
      ) : state.left > 0 ? (
        <div className="mt-3">
          <textarea
            className="hand h-24 w-full resize-y border border-ink-300 bg-sticky-yellow/40 px-2 text-pen-blue outline-none placeholder:text-ink-400 focus:border-ink-900"
            style={{ backgroundImage: "repeating-linear-gradient(transparent 0 27px, rgba(36,35,31,.12) 27px 28px)", lineHeight: "28px" }}
            maxLength={MAX_CHARS}
            placeholder="위의 힌트를 보고, 이 범위가 무엇을 받아 어떤 순서로 처리해 무엇을 돌려주는지 다시 적어 보세요"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && send()}
            aria-label="다시 쓴 설명"
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-400">{firstText ? "처음 메모에서 고쳐 써도 돼요" : "처음엔 비어 있던 곳이에요"} · Ctrl+Enter</span>
            <button type="button" className="btn-ink py-1.5 text-xs" disabled={busy || !text.trim()} onClick={send}>
              {busy ? "채점하는 중…" : "다시 채점 받기"}
            </button>
          </div>
        </div>
      ) : null}
      {error && <p className="mt-1 text-xs text-pen-red">{error}</p>}
    </div>
  );
}

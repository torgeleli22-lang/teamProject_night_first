"use client";

import { useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api";
import type { TutorChat as Chat, TutorReply } from "@/lib/api-types";

const MAX_CHARS = 300;
/** 처음 물어보기 쉬운 질문 */
const STARTERS = ["왜 이렇게 판정했나요?", "이 부분 흐름을 한 줄씩 설명해 주세요", "예시 값을 넣어서 따라가 보고 싶어요", "제 메모에서 무엇을 고치면 될까요?"];

/**
 * 메모별 첨삭 아래의 AI 튜터 대화.
 * 튜터가 '다시 볼 줄'을 알려 주면 눌러서 왼쪽 전체 코드에서 그 줄을 볼 수 있다 (onLook).
 */
export function TutorChat({
  readingId,
  item,
  initial,
  onLook,
}: {
  readingId: string;
  item: number;
  initial?: Chat;
  onLook: (line: number) => void;
}) {
  const [chat, setChat] = useState<Chat>(initial ?? { turns: [], turnsLeft: 10 });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [byAi, setByAi] = useState(true);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chat.turns.length) end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chat.turns.length]);

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<TutorReply>("/tutor", { readingId, item, message: m });
      setChat({ turns: r.turns, turnsLeft: r.turnsLeft });
      setByAi(r.byAi);
      setText("");
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="mt-3 border border-ink-300 bg-paper">
      <div className="flex items-center justify-between border-b border-dashed border-ink-300 px-3 py-2">
        <span className="hand text-pen-red">AI 튜터에게 물어보기</span>
        <span className="text-xs text-ink-500">{chat.turnsLeft > 0 ? `${chat.turnsLeft}번 더 물을 수 있어요` : "질문을 다 썼어요"}</span>
      </div>

      <div className="max-h-96 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
        {chat.turns.length === 0 && <p className="text-xs text-ink-500">이 범위에서 헷갈리는 점을 물어보세요. 튜터는 바로 답을 주기보다 볼 줄과 생각할 거리를 먼저 짚어 줘요.</p>}
        {chat.turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="hand max-w-[85%] whitespace-pre-wrap break-words border-b-2 border-marker px-1 text-right text-pen-blue">{t.text}</p>
            </div>
          ) : (
            <div key={i} className="max-w-[92%]">
              <p className="whitespace-pre-wrap break-words border-l-2 border-pen-red pl-3 text-sm leading-relaxed text-ink-900">{t.text}</p>
              {t.lookAt.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1 pl-3">
                  {t.lookAt.map((n) => (
                    <button key={n} type="button" className="btn-small px-2 py-0.5" onClick={() => onLook(n)} title="왼쪽 전체 코드에서 보기">
                      {n}번 줄 보기
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
        {busy && <p className="hand text-pen-red">튜터가 코드를 보고 있어요…</p>}
        <div ref={end} />
      </div>

      {!byAi && <p className="px-3 pb-1 text-xs text-ink-500">지금은 AI 대신 첨삭 내용으로 답했어요.</p>}
      {error && <p className="px-3 pb-1 text-xs text-pen-red">{error}</p>}

      {chat.turnsLeft > 0 && (
        <div className="border-t border-dashed border-ink-300 px-3 py-2">
          {chat.turns.length === 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {STARTERS.map((q) => (
                <button key={q} type="button" className="btn-small" disabled={busy} onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              className="field flex-1"
              value={text}
              maxLength={MAX_CHARS}
              placeholder="예: 14번 줄에서 왜 False 를 돌려줘요?"
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              aria-label="튜터에게 물어볼 말"
            />
            <button type="submit" className="btn-ink py-1.5 text-xs" disabled={busy || !text.trim()}>
              묻기
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

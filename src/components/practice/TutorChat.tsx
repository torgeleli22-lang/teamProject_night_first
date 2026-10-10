"use client";

import { useRef, useState } from "react";
import { AIBadge } from "@/components/AIBadge";
import { Spinner } from "@/components/ui";
import { postJSON } from "@/lib/api";

interface Turn {
  role: "user" | "tutor";
  text: string;
  source?: "ai" | "offline";
}

const SUGGESTIONS_BEFORE = ["어디부터 읽어야 할지 모르겠어요", "이 문법이 뭔지 모르겠어요"];
const SUGGESTIONS_AFTER = ["왜 다른 답은 틀린 건가요?", "이 개념을 다른 예시로 보여주세요", "실제로는 어디에 쓰이나요?"];

export function TutorChat({ questionId, solved }: { questionId: string; solved: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    const history = turns.slice(-6).map(({ role, text }) => ({ role, text }));
    setTurns((t) => [...t, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await postJSON<{ answer: string; source: "ai" | "offline" }>("/api/ask", {
        questionId,
        question: q,
        solved,
        history,
      });
      setTurns((t) => [...t, { role: "tutor", text: res.answer, source: res.source }]);
    } catch {
      setTurns((t) => [...t, { role: "tutor", text: "앗, 지금은 답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.", source: "offline" }]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
  }

  const suggestions = solved ? SUGGESTIONS_AFTER : SUGGESTIONS_BEFORE;

  return (
    <div className="rounded-2xl border border-ink-200 bg-white">
      <div className="max-h-80 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 && (
          <p className="text-sm text-ink-500">
            {solved ? "이 코드에 대해 궁금한 점을 AI 튜터에게 물어보세요." : "막힌 부분을 물어보세요. 정답 대신 생각할 실마리를 드려요."}
          </p>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-[15px] text-white">{t.text}</p>
            </div>
          ) : (
            <div key={i} className="max-w-[90%]">
              <div className="mb-1">
                <AIBadge source={t.source} />
              </div>
              <p className="whitespace-pre-line rounded-2xl rounded-bl-md bg-ink-100 px-4 py-2.5 text-[15px] leading-relaxed text-ink-900">{t.text}</p>
            </div>
          ),
        )}
        {loading && (
          <p className="flex items-center gap-2 text-sm text-ink-400">
            <Spinner /> 튜터가 생각하고 있어요…
          </p>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-ink-100 p-3">
        {turns.length === 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="chip bg-ink-100 text-ink-700 hover:bg-brand-50 hover:text-brand-700">
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder="질문을 입력하세요"
            aria-label="튜터에게 질문"
            className="min-w-0 flex-1 rounded-xl border border-ink-200 px-3 py-2.5 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
          />
          <button type="submit" disabled={!input.trim() || loading} className="btn-primary px-4 py-2.5">
            보내기
          </button>
        </form>
      </div>
    </div>
  );
}

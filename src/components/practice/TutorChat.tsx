"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { AIBadge } from "@/components/AIBadge";
import { Spinner } from "@/components/ui";
import { ApiError, apiPost } from "@/lib/api";

export interface Turn {
  role: "user" | "tutor";
  text: string;
  source?: "ai" | "offline";
}

const SUGGESTIONS_BEFORE = ["어디부터 읽어야 할지 모르겠어요", "이 문법이 뭔지 모르겠어요"];
const SUGGESTIONS_AFTER = ["왜 다른 답은 틀린 건가요?", "이 개념을 다른 예시로 보여주세요", "실제로는 어디에 쓰이나요?"];

/**
 * 한 문제에 대한 튜터 대화. 대화 내용(turns)은 문제 화면(QuestionView)이 들고 있어서
 * 제출 전후·창을 닫았다 열어도 이어지고, 다음 문제로 넘어가면 사라진다.
 * 질문은 API(POST /ask, lambda/api/tutor_chat.py)로 보낸다. 이전 대화는 Lambda 가 chatId 로 기억한다.
 */
export function TutorChat({
  questionId,
  solved,
  turns,
  setTurns,
  chat,
}: {
  questionId: string;
  solved: boolean;
  turns: Turn[];
  setTurns: Dispatch<SetStateAction<Turn[]>>;
  /**
   * answerText: 학습자가 지금 고른·쓴 답 (튜터가 이 답을 보고 이야기한다)
   * chatId: 이 문제의 대화 id. 문제 화면이 들고 있어서 다음 문제로 넘어가면 새 대화가 된다
   */
  chat: { answerText: string; chatId: string | null; setChatId: (id: string) => void };
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  // 새 질문·답이 붙으면 대화 칸을 내려서 최신 말풍선을 보여 준다.
  // 긴 답은 처음부터 읽을 수 있게 답의 첫 줄에 맞추고, 대화 칸이 화면 밖(또는 아래 고정 버튼 막대 뒤)이면 화면도 옮긴다.
  useEffect(() => {
    if (turns.length === 0 && !loading) {
      mounted.current = true;
      return;
    }
    const box = boxRef.current;
    const last = lastRef.current;
    if (box) {
      const tutorAnswer = !loading && turns[turns.length - 1]?.role === "tutor";
      box.scrollTo({ top: tutorAnswer && last ? Math.max(0, last.offsetTop - 12) : box.scrollHeight, behavior: "smooth" });
    }
    // 처음 열 때(제출 직후 등)는 화면을 옮기지 않는다 — 새 대화가 붙었을 때만
    const first = !mounted.current;
    mounted.current = true;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!first && rect && (rect.top < 0 || rect.bottom > window.innerHeight - 96)) {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [turns, loading]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setTurns((t) => [...t, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      // tutor_chat.py: 대화 기록은 Lambda 가 chatId 로 DynamoDB 에 보관한다 (화면은 chatId 만 들고 있음)
      const res = await apiPost<{ answer: string; chatId: string; source: "ai" | "offline" }>("/ask", {
        ...(chat.chatId ? { chatId: chat.chatId } : {}),
        questionId,
        question: q,
        solved,
        ...(chat.answerText ? { answerText: chat.answerText } : {}),
      });
      chat.setChatId(res.chatId);
      setTurns((t) => [...t, { role: "tutor", text: res.answer, source: res.source }]);
    } catch (e) {
      // 너무 많이 물어본 경우(429)는 서버가 보낸 안내를 그대로 보여 준다
      const text = e instanceof ApiError && e.status === 429 ? e.message : "앗, 지금은 답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.";
      setTurns((t) => [...t, { role: "tutor", text, source: "offline" }]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = solved ? SUGGESTIONS_AFTER : SUGGESTIONS_BEFORE;

  return (
    <div ref={rootRef} className="glass-soft border border-white/60">
      <div ref={boxRef} className="relative max-h-80 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 && (
          <p className="text-sm text-ink-500">
            {solved ? "이 코드에 대해 궁금한 점을 AI 튜터에게 물어보세요." : "막힌 부분을 물어보세요. 정답 대신 생각할 실마리를 드려요."}
          </p>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} ref={!loading && i === turns.length - 1 ? lastRef : undefined} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-[15px] text-white">{t.text}</p>
            </div>
          ) : (
            <div key={i} ref={!loading && i === turns.length - 1 ? lastRef : undefined} className="max-w-[90%]">
              <div className="mb-1">
                <AIBadge source={t.source} />
              </div>
              <p className="whitespace-pre-line rounded-2xl rounded-bl-md bg-ink-100 px-4 py-2.5 text-[15px] leading-relaxed text-ink-900">{t.text}</p>
            </div>
          ),
        )}
        {loading && (
          <div ref={lastRef} className="flex items-center gap-2 text-sm text-ink-400">
            <Spinner /> 튜터가 생각하고 있어요…
          </div>
        )}
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

"use client";

import { useEffect, useState } from "react";
import { AIBadge } from "@/components/AIBadge";
import { CodeSnippet } from "@/components/CodeBlock";
import { Spinner } from "@/components/ui";
import { postJSON } from "@/lib/api";

interface ConceptExplanation {
  title: string;
  keyIdea: string;
  explanation: string;
  analogy: string;
  example: string;
  checkQuestion: string;
  source: "ai" | "offline";
}

const cache = new Map<string, ConceptExplanation>();

export function ConceptSheet({ conceptId, problemId, onClose }: { conceptId: string; problemId?: string; onClose: () => void }) {
  const key = `${conceptId}:${problemId ?? ""}`;
  const [data, setData] = useState<ConceptExplanation | null>(cache.get(key) ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (cache.has(key)) return;
    const controller = new AbortController();
    postJSON<ConceptExplanation>("/api/ai/concept", { conceptId, problemId }, controller.signal)
      .then((d) => {
        cache.set(key, d);
        setData(d);
      })
      .catch((e) => e.name !== "AbortError" && setError(true));
    return () => controller.abort();
  }, [key, conceptId, problemId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="개념 설명"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full animate-fade-up overflow-y-auto rounded-t-3xl bg-white p-6 shadow-lift sm:max-w-lg sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-brand-600">📖 개념 설명</p>
            <h2 className="text-xl font-extrabold">{data?.title ?? "불러오는 중"}</h2>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost px-3 py-2" aria-label="닫기">
            ✕
          </button>
        </div>
        {error && <p className="text-sm text-coral-600">설명을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
        {!data && !error && (
          <p className="flex items-center gap-2 py-8 text-sm text-ink-400">
            <Spinner /> 튜터가 지금 문제에 맞춰 설명을 준비하고 있어요…
          </p>
        )}
        {data && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-brand-50 p-4 font-semibold text-brand-800">💡 {data.keyIdea}</div>
            <AIBadge source={data.source} />
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-700">{data.explanation}</p>
            {data.analogy && (
              <p className="rounded-2xl bg-sun-50 p-4 text-[15px] leading-relaxed text-ink-700">
                <span className="font-bold">🍳 비유하자면 </span>
                {data.analogy}
              </p>
            )}
            {data.example && <CodeSnippet code={data.example} />}
            {data.checkQuestion && (
              <p className="rounded-2xl border border-dashed border-ink-200 p-4 text-[15px] text-ink-700">
                <span className="font-bold">🤔 스스로 확인해 보기: </span>
                {data.checkQuestion}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

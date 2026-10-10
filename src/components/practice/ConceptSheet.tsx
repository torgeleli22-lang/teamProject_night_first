"use client";

import { useEffect } from "react";
import { CodeSnippet } from "@/components/CodeBlock";
import { getConcept } from "@/lib/curriculum";

/** 미리 작성된 개념 설명 (AI 호출 없음) */
export function ConceptSheet({ conceptId, onClose }: { conceptId: string; onClose: () => void }) {
  const concept = getConcept(conceptId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!concept) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${concept.name} 개념 설명`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full animate-fade-up overflow-y-auto rounded-t-3xl bg-white p-6 shadow-lift sm:max-w-lg sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-brand-600">📖 개념 설명</p>
            <h2 className="text-xl font-extrabold">{concept.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost px-3 py-2" aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl bg-brand-50 p-4 font-semibold text-brand-800">💡 {concept.keyIdea}</div>
          <p className="text-[15px] leading-relaxed text-ink-700">{concept.summary}</p>
          <CodeSnippet code={concept.example} />
        </div>
      </div>
    </div>
  );
}

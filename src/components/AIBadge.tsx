const STYLE = {
  ai: { label: "✨ AI 분석", className: "bg-brand-50 text-brand-700", title: "Claude AI 튜터가 이번 답변을 분석했어요" },
  rule: { label: "⚡ 자동 분석", className: "bg-mint-50 text-mint-700", title: "핵심 개념을 규칙으로 바로 확인했어요 (AI 호출 없음)" },
  stored: { label: "📘 해설", className: "bg-ink-100 text-ink-500", title: "미리 준비된 해설이에요 (AI 호출 없음)" },
  offline: { label: "📘 기본 답변", className: "bg-ink-100 text-ink-500", title: "AI 연결 없이 준비된 답변이에요" },
} as const;

export function AIBadge({ source }: { source: keyof typeof STYLE | null | undefined }) {
  if (!source) return null;
  const s = STYLE[source];
  return (
    <span className={`chip ${s.className}`} title={s.title}>
      {s.label}
    </span>
  );
}

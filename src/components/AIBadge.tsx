export function AIBadge({ source }: { source: "ai" | "offline" | null | undefined }) {
  if (!source) return null;
  return source === "ai" ? (
    <span className="chip bg-brand-50 text-brand-700" title="Claude AI 튜터가 작성했어요">
      ✨ AI 튜터
    </span>
  ) : (
    <span className="chip bg-ink-100 text-ink-500" title="AI 연결 없이 미리 준비된 해설을 보여줘요">
      📘 기본 해설
    </span>
  );
}

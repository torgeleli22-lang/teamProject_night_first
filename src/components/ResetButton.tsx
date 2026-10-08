"use client";

import { useRouter } from "next/navigation";
import { postJSON } from "@/lib/api";

export function ResetButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        if (!window.confirm("모든 학습 기록을 지울까요? 되돌릴 수 없어요.")) return;
        await postJSON("/api/me", { reset: true });
        router.refresh();
      }}
      className="text-xs text-ink-400 underline-offset-2 hover:text-coral-600 hover:underline"
    >
      학습 기록 초기화
    </button>
  );
}

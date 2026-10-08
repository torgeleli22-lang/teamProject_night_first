"use client";

import { useEffect, useState } from "react";

export async function postJSON<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "요청에 실패했어요.");
  }
  return res.json() as Promise<T>;
}

let statusPromise: Promise<boolean> | null = null;

/** 서버에 Claude API 키가 설정되어 있는지 (없으면 오프라인 튜터) */
export function useAIStatus(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    statusPromise ??= fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d: { ai: boolean }) => d.ai)
      .catch(() => false);
    let alive = true;
    statusPromise.then((v) => alive && setEnabled(v));
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}

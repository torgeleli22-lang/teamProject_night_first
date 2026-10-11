"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/ui";
import { apiPost, notifyChanged } from "@/lib/api";

export function PersonaButtons({ personas }: { personas: { id: string; label: string; description: string }[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(id: string) {
    setLoading(id);
    setError(null);
    try {
      await apiPost("/demo", { persona: id });
      notifyChanged();
      router.push(id === "empty" ? "/learn" : "/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요.");
      setLoading(null);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {personas.map((p) => (
        <button key={p.id} type="button" onClick={() => load(p.id)} disabled={!!loading} className="card p-5 text-left transition hover:shadow-lift disabled:opacity-60">
          <p className="flex items-center gap-2 font-bold">
            {loading === p.id && <Spinner />} {p.label}
          </p>
          <p className="mt-1 text-sm text-ink-500">{p.description}</p>
          {loading === p.id && p.id === "confused" && <p className="mt-2 text-xs text-brand-600">AI 분석과 맞춤 복습 생성까지 실행 중… (몇 초)</p>}
        </button>
      ))}
      {error && <p className="text-sm text-coral-600 sm:col-span-3">{error}</p>}
    </div>
  );
}

export function PeerButtons() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const run = async (peers: "add" | "remove") => {
    setLoading(true);
    try {
      await apiPost("/demo", { peers });
      notifyChanged();
      router.push("/ranking");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => run("add")} disabled={loading} className="btn-primary px-5 py-2.5 text-sm">
        {loading && <Spinner />} 가상 참가자 30명 추가
      </button>
      <button type="button" onClick={() => run("remove")} disabled={loading} className="btn-ghost px-5 py-2.5 text-sm">
        가상 참가자 모두 지우기
      </button>
    </div>
  );
}

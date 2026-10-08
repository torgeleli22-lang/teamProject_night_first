"use client";

import { useCallback, useEffect, useState } from "react";
import { CodeSnippet } from "@/components/CodeBlock";
import { SectionTitle, Spinner } from "@/components/ui";
import { CONCEPTS, LEVELS, conceptName } from "@/lib/curriculum";
import type { GenerateResult } from "@/lib/ai/generate";
import type { GeneratedItemRow } from "@/lib/server/content-repo";
import type { Job, UsageRow } from "@/lib/server/ops-repo";

interface Overview {
  ai: boolean;
  models: { fast: string; smart: string };
  coverage: Record<string, number>;
  usage: UsageRow[];
  grading: { rule: number; ai: number };
  jobs: Job[];
  generated: GeneratedItemRow[];
}

/** 표시용 추정 단가 (USD / 1M tokens). 실제 청구는 Anthropic 콘솔 기준 */
const PRICE: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

const LACKING = 4;

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [concept, setConcept] = useState(CONCEPTS[0].id);
  const [level, setLevel] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [last, setLast] = useState<GenerateResult | null>(null);

  useEffect(() => {
    try {
      setToken(sessionStorage.getItem("admin-token") ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  const headers = useCallback(() => ({ "Content-Type": "application/json", "x-admin-token": token }), [token]);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/overview", { headers: headers() });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "불러오지 못했어요.");
      return;
    }
    setData(await res.json());
  }, [headers]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    setLast(null);
    try {
      const res = await fetch("/api/admin/generate", { method: "POST", headers: headers(), body: JSON.stringify({ concept, level }) });
      setLast(await res.json());
      await load();
    } finally {
      setGenerating(false);
    }
  }

  const totalCost = (data?.usage ?? []).reduce((s, u) => {
    const p = PRICE[u.model];
    return p ? s + (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead) / 1e6 : s;
  }, 0);
  const graded = (data?.grading.rule ?? 0) + (data?.grading.ai ?? 0);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">콘텐츠 관리</h1>
          <p className="mt-1 text-ink-500">AI 콘텐츠 생성 → 실행 검증 → AI 검수 → 문제 DB 저장. 학습 중에는 저장된 콘텐츠를 사용해요.</p>
        </div>
        <form
          className="ml-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              sessionStorage.setItem("admin-token", token);
            } catch {
              /* ignore */
            }
            load();
          }}
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ADMIN_TOKEN"
            aria-label="관리자 토큰"
            className="rounded-xl border border-ink-200 px-3 py-2 text-sm"
          />
          <button className="btn-soft px-4 py-2 text-sm">확인</button>
        </form>
      </div>

      {error && <p className="mt-6 rounded-2xl bg-coral-50 px-4 py-3 text-coral-700">{error}</p>}
      {!data && !error && (
        <p className="mt-10 flex items-center gap-2 text-ink-500">
          <Spinner /> 불러오는 중…
        </p>
      )}

      {data && (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-4">
            <Card label="AI 연결" value={data.ai ? "연결됨" : "꺼짐"} sub={`fast: ${data.models.fast} · smart: ${data.models.smart}`} />
            <Card label="AI 호출" value={`${data.usage.reduce((s, u) => s + u.calls, 0)}회`} sub={`추정 비용 $${totalCost.toFixed(3)}`} />
            <Card
              label="규칙 채점 비율"
              value={graded ? `${Math.round((data.grading.rule / graded) * 100)}%` : "-"}
              sub={`규칙 ${data.grading.rule} · AI ${data.grading.ai}`}
            />
            <Card label="AI 생성 콘텐츠" value={`${data.generated.filter((g) => g.status === "published").length}개 공개`} sub={`반려 ${data.generated.filter((g) => g.status === "rejected").length}개`} />
          </section>

          <section className="card mt-6 p-5">
            <SectionTitle>콘텐츠 생성</SectionTitle>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-semibold text-ink-500">개념</span>
                <select value={concept} onChange={(e) => setConcept(e.target.value)} className="rounded-xl border border-ink-200 px-3 py-2">
                  {CONCEPTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold text-ink-500">난이도</span>
                <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="rounded-xl border border-ink-200 px-3 py-2">
                  {LEVELS.map((l) => (
                    <option key={l.level} value={l.level}>
                      {l.level} · {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={generate} disabled={generating || !data.ai} className="btn-primary px-5 py-2.5 text-sm">
                {generating ? (
                  <>
                    <Spinner /> 생성·검증 중 (1~3분)
                  </>
                ) : (
                  "코드 세트 생성"
                )}
              </button>
              {!data.ai && <span className="text-sm text-ink-400">ANTHROPIC_API_KEY 를 설정하면 생성할 수 있어요.</span>}
            </div>
            {last && (
              <p className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${last.status === "published" ? "bg-mint-50 text-mint-700" : "bg-coral-50 text-coral-700"}`}>
                {last.status === "published" ? "✓ 검증을 통과해 공개되었어요." : last.status === "rejected" ? "✕ 검증에 실패해 반려되었어요. 아래 보고서를 확인하세요." : `✕ ${last.error}`}
              </p>
            )}
          </section>

          <section className="card mt-6 overflow-x-auto p-5">
            <SectionTitle>개념 × 난이도별 문제 수</SectionTitle>
            <p className="-mt-1 mb-3 text-sm text-ink-500">{LACKING}개 미만인 칸은 학습자가 그 조합을 고르면 AI 생성이 자동으로 요청돼요.</p>
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-ink-400">
                  <th className="py-1.5 font-semibold">개념</th>
                  {LEVELS.map((l) => (
                    <th key={l.level} className="py-1.5 text-center font-semibold">
                      {l.emoji} {l.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CONCEPTS.map((c) => (
                  <tr key={c.id} className="border-t border-ink-100">
                    <td className="py-1.5 font-semibold">{c.name}</td>
                    {LEVELS.map((l) => {
                      const n = data.coverage[`${c.id}:${l.level}`] ?? 0;
                      return (
                        <td key={l.level} className="py-1 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setConcept(c.id);
                              setLevel(l.level);
                            }}
                            className={`w-12 rounded-lg py-1 font-mono ${n === 0 ? "bg-ink-50 text-ink-300" : n < LACKING ? "bg-sun-50 text-sun-600" : "bg-mint-50 text-mint-700"}`}
                            title="이 조합으로 생성 대상 선택"
                          >
                            {n}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="card p-5">
              <SectionTitle>AI 사용량</SectionTitle>
              {data.usage.length === 0 ? (
                <p className="text-sm text-ink-400">아직 AI 호출이 없어요.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-ink-400">
                      <th className="py-1">작업</th>
                      <th>모델</th>
                      <th className="text-right">호출</th>
                      <th className="text-right">입력/출력 토큰</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.usage.map((u) => (
                      <tr key={`${u.task}-${u.model}`} className="border-t border-ink-100">
                        <td className="py-1.5 font-semibold">{u.task}</td>
                        <td className="text-ink-500">{u.model.replace("claude-", "")}</td>
                        <td className="text-right font-mono">
                          {u.calls}
                          {u.failures > 0 && <span className="text-coral-600"> ({u.failures}✕)</span>}
                        </td>
                        <td className="text-right font-mono text-ink-500">
                          {u.input.toLocaleString()} / {u.output.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="card p-5">
              <SectionTitle>생성 작업</SectionTitle>
              <ul className="space-y-2 text-sm">
                {data.jobs.length === 0 && <li className="text-ink-400">아직 생성 작업이 없어요.</li>}
                {data.jobs.map((j) => (
                  <li key={j.id} className="flex items-center gap-2">
                    <span className={`chip ${j.status === "published" ? "bg-mint-50 text-mint-700" : j.status === "running" ? "bg-brand-50 text-brand-700" : "bg-coral-50 text-coral-600"}`}>
                      {j.status}
                    </span>
                    <span className="font-semibold">{conceptName(j.concept)}</span>
                    <span className="text-ink-400">Lv.{j.level}</span>
                    <span className="truncate text-ink-400">{j.reason}</span>
                    {j.error && <span className="truncate text-xs text-coral-600" title={j.error}>{j.error.split("\n")[0]}</span>}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="mt-6">
            <SectionTitle>AI 생성 콘텐츠와 검증 보고서</SectionTitle>
            <div className="space-y-4">
              {data.generated.length === 0 && <p className="text-sm text-ink-400">아직 AI 가 만든 콘텐츠가 없어요.</p>}
              {data.generated.map((g) => (
                <details key={g.id} className="card p-5">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`chip ${g.status === "published" ? "bg-mint-50 text-mint-700" : "bg-coral-50 text-coral-600"}`}>{g.status}</span>
                    <span className="font-bold">{g.title}</span>
                    <span className="text-sm text-ink-400">
                      {g.concepts.map(conceptName).join(", ")} · Lv.{g.level} · 질문 {g.questionCount}개
                    </span>
                  </summary>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <CodeSnippet code={g.code} />
                    <ul className="space-y-1 text-sm">
                      {g.validation?.checks.map((c, i) => (
                        <li key={i} className={c.pass ? "text-ink-500" : "font-semibold text-coral-600"}>
                          {c.pass ? "✓" : "✕"} {c.name}
                          {c.detail && !c.pass && <span className="block pl-4 text-xs font-normal">{c.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm font-semibold text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      <p className="mt-0.5 truncate text-xs text-ink-400" title={sub}>
        {sub}
      </p>
    </div>
  );
}

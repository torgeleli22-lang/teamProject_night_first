"use client";

import { useCallback, useEffect, useState } from "react";
import { CodeSnippet } from "@/components/CodeBlock";
import { SectionTitle, Spinner } from "@/components/ui";
import { CONCEPTS, LEVELS, UNITS, conceptName } from "@/lib/curriculum";
import type { GenerateResult } from "@/lib/ai/generate";
import type { POLICY as PolicyType, Trigger } from "@/lib/content/policy";
import type { GeneratedItemRow } from "@/lib/server/content-repo";
import type { Job, UsageRow } from "@/lib/server/ops-repo";

interface Overview {
  mode: "live" | "mock" | "off";
  models: { fast: string; smart: string };
  policy: typeof PolicyType;
  triggerLabels: Record<Trigger, string>;
  generatable: Record<string, number[]>;
  coverage: Record<string, number>;
  demand: Record<string, number>;
  fillPlan: { concept: string; level: number; stock: number; sets: number }[];
  usage: UsageRow[];
  cost: { total: number; monthToDate: number };
  grading: { rule: number; ai: number };
  jobs: Job[];
  generated: GeneratedItemRow[];
}

/** 코드 세트 1개 생성의 대략적인 비용 (Opus 입력 ~3K, 출력 ~12K 토큰 + 재생성 가능성). 실제와 다를 수 있음 */
const COST_PER_SET_USD = 0.3;

const MODE_LABEL = { live: "✨ 실제 AI", mock: "🧪 목업", off: "📘 꺼짐" };
const STATUS_STYLE: Record<string, string> = {
  published: "bg-mint-50 text-mint-700",
  running: "bg-brand-50 text-brand-700",
  rejected: "bg-coral-50 text-coral-600",
  failed: "bg-coral-50 text-coral-600",
};

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [concept, setConcept] = useState(CONCEPTS[0].id);
  const [level, setLevel] = useState(2);
  const [busy, setBusy] = useState<"generate" | "fill" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try {
      setToken(sessionStorage.getItem("admin-token") ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  const headers = useCallback(() => ({ "Content-Type": "application/json", "x-admin-token": token }), [token]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/overview", { headers: headers() });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "불러오지 못했어요.");
      return;
    }
    setError(null);
    setData(await res.json());
  }, [headers]);

  useEffect(() => {
    load();
  }, [load]);

  // 생성 작업이 진행 중이면 3초마다 새로고침
  const running = data?.jobs.some((j) => j.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running, load]);

  async function generate() {
    setBusy("generate");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/generate", { method: "POST", headers: headers(), body: JSON.stringify({ concept, level }) });
      const r = (await res.json()) as GenerateResult;
      setMessage({
        ok: r.status === "published",
        text: r.status === "published" ? "✓ 검증을 통과해 공개되었어요." : r.status === "rejected" ? "✕ 검증에 실패해 반려되었어요. 아래 보고서를 확인하세요." : `✕ ${r.error}`,
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function fill() {
    setBusy("fill");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/fill?limit=5", { method: "POST", headers: headers() });
      const r = await res.json();
      setMessage(res.ok ? { ok: true, text: `${r.started}개 칸 생성을 시작했어요. 아래 생성 작업에서 진행 상황을 볼 수 있어요.` } : { ok: false, text: r.error });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const graded = (data?.grading.rule ?? 0) + (data?.grading.ai ?? 0);
  const fillSets = data?.fillPlan.reduce((s, c) => s + c.sets, 0) ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">콘텐츠 관리</h1>
          <p className="mt-1 text-ink-500">AI 생성 → 실행 검증 → AI 검수 → 문제 DB 저장. 학습 중에는 저장된 문제를 모든 학습자가 함께 써요.</p>
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
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_TOKEN" aria-label="관리자 토큰" className="rounded-xl border border-ink-200 px-3 py-2 text-sm" />
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
            <Card label="AI 모드" value={MODE_LABEL[data.mode]} sub={`fast: ${data.models.fast} · smart: ${data.models.smart}`} />
            <Card
              label={data.mode === "mock" ? "이번 달 추정 비용 (목업 포함)" : "이번 달 추정 비용"}
              value={`$${data.cost.monthToDate.toFixed(2)}`}
              sub={`예산 $${data.policy.monthlyBudgetUsd} · 하루 생성 상한 ${data.policy.dailyLimit}회`}
            />
            <Card label="규칙 채점 비율" value={graded ? `${Math.round((data.grading.rule / graded) * 100)}%` : "-"} sub={`규칙 ${data.grading.rule} · AI ${data.grading.ai}`} />
            <Card
              label="AI 생성 콘텐츠"
              value={`${data.generated.filter((g) => g.status === "published").length}개 공개`}
              sub={`반려 ${data.generated.filter((g) => g.status === "rejected").length} · 실패 ${data.jobs.filter((j) => j.status === "failed").length}`}
            />
          </section>

          {message && <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${message.ok ? "bg-mint-50 text-mint-700" : "bg-coral-50 text-coral-700"}`}>{message.text}</p>}

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <section className="card p-5">
              <SectionTitle>생성 기준 (초안)</SectionTitle>
              <ol className="space-y-2.5 text-sm leading-relaxed text-ink-700">
                <li>
                  <b>① 출시 전 채우기</b> — 생성 대상 칸마다 공개 문제 <b>{data.policy.minStock}개</b>(코드 세트 약 2개)까지 미리 만든다.
                </li>
                <li>
                  <b>② 재고 하한</b> — 운영 중 어떤 칸이든 {data.policy.minStock}개 아래면 학습자가 그 칸을 고를 때 생성.
                </li>
                <li>
                  <b>③ 여러 학습자 소진</b> — 안 푼 문제가 {data.policy.learnerLow}개 미만인 학습자가 최근 {data.policy.demandWindowDays}일 동안 <b>{data.policy.demandLearners}명 이상</b>일 때 생성. 한 명만 소진했으면 틀린·오래된 문제를 다시 낸다.
                </li>
                <li>
                  <b>④ 맞춤 복습</b> — 10문제마다 하는 학습자 분석에서 혼동이 발견되고 그 칸에 복습할 문제가 부족하면, 그 혼동을 겨냥한 세트를 생성 (학습자당 하루 {data.policy.personalPerLearnerPerDay}회). 만든 문제는 다른 학습자도 함께 쓴다.
                </li>
                <li>
                  <b>상한</b> — 칸마다 최대 {data.policy.maxStock}개. 난이도·유형을 바꿨다는 이유만으로는 만들지 않는다. DOM·이벤트·fetch 는 실행 검증이 안 돼서 사람이 작성.
                </li>
              </ol>
            </section>

            <section className="card p-5">
              <SectionTitle>출시 전 채우기</SectionTitle>
              <p className="text-sm text-ink-700">
                최소 재고에 못 미치는 칸 <b>{data.fillPlan.length}개</b> · 필요한 코드 세트 <b>{fillSets}개</b> · 추정 비용 약 <b>${(fillSets * COST_PER_SET_USD).toFixed(0)}</b>
                <span className="text-ink-400"> (세트당 약 ${COST_PER_SET_USD}로 가정)</span>
              </p>
              <div className="mt-3 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {data.fillPlan.map((c) => (
                  <span key={`${c.concept}:${c.level}`} className="chip bg-sun-50 text-sun-600">
                    {conceptName(c.concept)} Lv.{c.level} · {c.stock}/{data.policy.minStock}
                  </span>
                ))}
              </div>
              <button type="button" onClick={fill} disabled={!!busy || data.mode === "off" || data.fillPlan.length === 0} className="btn-primary mt-4 px-5 py-2.5 text-sm">
                {busy === "fill" ? <Spinner /> : null} 앞에서부터 5칸 채우기
              </button>
              {data.mode === "off" && <p className="mt-2 text-xs text-ink-400">AI_MODE=mock 이거나 API 키가 있어야 실행할 수 있어요.</p>}
            </section>
          </div>

          <section className="card mt-6 overflow-x-auto p-5">
            <SectionTitle>개념 × 난이도별 공개 문제 수</SectionTitle>
            <div className="-mt-1 mb-3 flex flex-wrap gap-3 text-xs text-ink-500">
              <Legend className="bg-ink-50 text-ink-300 line-through">AI 생성 대상 아님</Legend>
              <Legend className="bg-sun-50 text-sun-600">{`< ${data.policy.minStock} (부족)`}</Legend>
              <Legend className="bg-mint-50 text-mint-700">충분</Legend>
              <Legend className="bg-brand-50 text-brand-700">{`≥ ${data.policy.maxStock} (가득)`}</Legend>
              <span>👥 = 최근 {data.policy.demandWindowDays}일 동안 칸을 소진한 학습자 수 · 칸을 누르면 아래 생성 폼에 선택돼요</span>
            </div>
            <table className="w-full min-w-[620px] text-sm">
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
                {UNITS.flatMap((u) => u.conceptIds).map((id) => (
                  <tr key={id} className="border-t border-ink-100">
                    <td className="py-1.5 font-semibold">{conceptName(id)}</td>
                    {LEVELS.map((l) => {
                      const n = data.coverage[`${id}:${l.level}`] ?? 0;
                      const allowed = data.generatable[id]?.includes(l.level);
                      const demand = data.demand[`${id}:${l.level}`] ?? 0;
                      const style = !allowed
                        ? "bg-ink-50 text-ink-300"
                        : n < data.policy.minStock
                          ? "bg-sun-50 text-sun-600"
                          : n >= data.policy.maxStock
                            ? "bg-brand-50 text-brand-700"
                            : "bg-mint-50 text-mint-700";
                      return (
                        <td key={l.level} className="py-1 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setConcept(id);
                              setLevel(l.level);
                            }}
                            className={`relative w-14 rounded-lg py-1 font-mono ${style} ${concept === id && level === l.level ? "ring-2 ring-brand-500" : ""}`}
                            title={allowed ? "생성 대상 칸" : "AI 생성 대상 아님 (사람 작성 또는 난이도 범위 밖)"}
                          >
                            {n}
                            {demand > 0 && <span className="absolute -right-1 -top-1.5 rounded-full bg-coral-500 px-1 text-[9px] text-white">👥{demand}</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink-100 pt-4">
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
              <button type="button" onClick={generate} disabled={!!busy || data.mode === "off"} className="btn-soft px-5 py-2.5 text-sm">
                {busy === "generate" ? (
                  <>
                    <Spinner /> 생성·검증 중
                  </>
                ) : (
                  "이 칸에 코드 세트 1개 수동 생성"
                )}
              </button>
              {data.mode === "mock" && <span className="text-xs text-ink-400">목업 생성 지원 개념: map, filter, for, if-else, reduce</span>}
            </div>
          </section>

          <section className="card mt-6 p-5">
            <SectionTitle>생성 작업 기록</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-ink-400">
                    <th className="py-1">상태</th>
                    <th>칸</th>
                    <th>생성 기준</th>
                    <th>이유</th>
                    <th className="text-right">시각</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-ink-400">
                        아직 생성 작업이 없어요.
                      </td>
                    </tr>
                  )}
                  {data.jobs.map((j) => (
                    <tr key={j.id} className="border-t border-ink-100 align-top">
                      <td className="py-2">
                        <span className={`chip ${STATUS_STYLE[j.status]}`}>
                          {j.status === "running" && <Spinner className="h-3 w-3" />} {j.status}
                        </span>
                        {j.mock && <span className="chip ml-1 bg-sun-50 text-sun-600">목업</span>}
                      </td>
                      <td className="py-2 font-semibold">
                        {conceptName(j.concept)} · Lv.{j.level}
                      </td>
                      <td className="py-2">{data.triggerLabels[j.trigger] ?? j.trigger}</td>
                      <td className="max-w-xs py-2 text-ink-500">
                        {j.reason}
                        {j.error && <span className="block text-xs text-coral-600">{j.error.split("\n")[0]}</span>}
                      </td>
                      <td className="py-2 text-right text-xs text-ink-400">{new Date(j.createdAt).toLocaleTimeString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6">
            <SectionTitle>AI 생성 콘텐츠와 검증 보고서</SectionTitle>
            <div className="space-y-4">
              {data.generated.length === 0 && <p className="text-sm text-ink-400">아직 AI 가 만든 콘텐츠가 없어요.</p>}
              {data.generated.map((g) => (
                <details key={g.id} className="card p-5">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`chip ${STATUS_STYLE[g.status]}`}>{g.status}</span>
                    <span className="font-bold">{g.title}</span>
                    <span className="text-sm text-ink-400">
                      {g.concepts.map(conceptName).join(", ")} · Lv.{g.level} · 질문 {g.questionCount}개
                    </span>
                  </summary>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <CodeSnippet code={g.code} />
                    <ValidationList checks={g.validation?.checks ?? []} />
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="card mt-6 p-5">
            <SectionTitle action={<span className="text-sm text-ink-400">누적 추정 ${data.cost.total.toFixed(3)}</span>}>AI 사용량</SectionTitle>
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

function Legend({ className, children }: { className: string; children: string }) {
  return <span className={`rounded-md px-2 py-0.5 font-mono ${className}`}>{children}</span>;
}

/** 검증 결과: 실패·참고 항목만 펼쳐 보여주고, 통과한 항목은 개수로 요약 */
function ValidationList({ checks }: { checks: { name: string; pass: boolean; detail?: string }[] }) {
  const notable = checks.filter((c) => !c.pass || c.name.includes("재생성") || c.name.startsWith("AI 검수"));
  const passed = checks.filter((c) => c.pass).length;
  return (
    <div className="text-sm">
      <p className="mb-2 font-semibold text-ink-700">
        검사 {checks.length}개 중 {passed}개 통과
      </p>
      <ul className="space-y-1.5">
        {notable.map((c, i) => (
          <li key={i} className={c.pass ? "text-ink-600" : "font-semibold text-coral-600"}>
            {c.pass ? "✓" : "✕"} {c.name}
            {c.detail && <span className="block whitespace-pre-line pl-4 text-xs font-normal text-ink-500">{c.detail}</span>}
          </li>
        ))}
      </ul>
      <details className="mt-2 text-xs text-ink-400">
        <summary className="cursor-pointer">전체 검사 항목 보기</summary>
        <ul className="mt-1 space-y-0.5">
          {checks.map((c, i) => (
            <li key={i} className={c.pass ? "" : "text-coral-600"}>
              {c.pass ? "✓" : "✕"} {c.name}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import { SectionTitle, Spinner } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { CONCEPTS, LEVELS, UNITS, conceptName } from "@/lib/curriculum";
import { explainCheck } from "@/lib/content/check-explain";
import type { GenerateResult } from "@/lib/ai/generate";
import type { POLICY as PolicyType, Trigger } from "@/lib/content/policy";
import type { GeneratedItemRow } from "@/lib/server/content-repo";
import type { Job, UsageRow } from "@/lib/server/ops-repo";

interface Overview {
  mode: "live" | "mock" | "off";
  autoGeneration: boolean;
  adminCode: { custom: boolean; recovery: boolean };
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

/** 코드 세트 1개 생성의 대략적인 비용 (입력 ~3K, 출력 ~12K 토큰 + 검수·재생성 가능성). 실제와 다를 수 있음 */
const COST_PER_SET_USD = 0.3;
/** Haiku 4.5 (Bedrock) 는 훨씬 싸다 */
const COST_PER_SET_HAIKU_USD = 0.05;

/** '어떤 내용으로 문제를 만들까요?' 칸에 눌러서 넣는 예시 */
const REQUEST_EXAMPLES = [
  "실생활 데이터(쇼핑몰·성적표·날씨)로 만들어 주세요",
  "초보자가 자주 헷갈리는 부분을 핵심 줄 문제로 물어봐 주세요",
  "출력이 두세 줄인 짧은 코드로 만들어 주세요",
  "변수 이름을 한눈에 이해되게 지어 주세요",
];

const MODE_LABEL = { live: "✨ 실제 AI", mock: "🧪 목업", off: "📘 꺼짐" };
const STATUS_STYLE: Record<string, string> = {
  published: "bg-mint-50 text-mint-700",
  running: "bg-brand-50 text-brand-700",
  rejected: "bg-coral-50 text-coral-600",
  failed: "bg-coral-50 text-coral-600",
  cancelled: "bg-ink-100 text-ink-600",
};

export default function AdminPage() {
  /** 확인을 눌러 적용한 관리자 코드 (서버에 보내는 값) */
  const [token, setToken] = useState("");
  /** 입력 칸에 치는 중인 값 — 확인을 누르기 전에는 서버에 보내지 않는다 (치는 도중의 값이 틀린 코드로 세어져 잠기지 않도록) */
  const [codeInput, setCodeInput] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [concept, setConcept] = useState(CONCEPTS[0].id);
  const [level, setLevel] = useState(2);
  const [count, setCount] = useState(1);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState<"generate" | "fill" | "auto" | "stop" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("admin-token") ?? "";
      setToken(saved);
      setCodeInput(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const headers = useCallback(() => ({ "Content-Type": "application/json", "x-admin-token": token }), [token]);

  const load = useCallback(async () => {
    const res = await fetch(`${API_URL}/admin/overview`, { headers: headers() });
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
    // 생성은 끝날 때까지 기다리므로, 진행 중 표시(와 중지 버튼)가 바로 보이게 한 번 새로고침
    setTimeout(load, 800);
    try {
      const res = await fetch(`${API_URL}/admin/generate`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ concept, level, count, instructions: instructions.trim() || undefined }),
      });
      const r = (await res.json()) as GenerateResult | { status: "started"; started: number } | { error: string };
      if (!res.ok || !("status" in r)) {
        setMessage({ ok: false, text: `✕ ${"error" in r ? r.error : "만들지 못했어요."}` });
      } else if (r.status === "started") {
        setMessage({ ok: true, text: `코드 ${r.started}개 만들기를 시작했어요. 아래 생성 작업 기록에서 진행 상황을 볼 수 있어요.` });
      } else {
        setMessage({
          ok: r.status === "published" || r.status === "cancelled",
          text:
            r.status === "published"
              ? "✓ 검증을 통과해 공개되었어요."
              : r.status === "rejected"
                ? "✕ 검증에 실패해 반려되었어요. 아래 보고서를 확인하세요."
                : r.status === "cancelled"
                  ? "생성을 중지했어요."
                  : `✕ ${r.error}`,
        });
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function fill() {
    setBusy("fill");
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/admin/fill?limit=5`, { method: "POST", headers: headers() });
      const r = await res.json();
      setMessage(res.ok ? { ok: true, text: `${r.started}개 칸 생성을 시작했어요. 아래 생성 작업에서 진행 상황을 볼 수 있어요.` } : { ok: false, text: r.error });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleAuto() {
    if (!data) return;
    setBusy("auto");
    setMessage(null);
    try {
      const enabled = !data.autoGeneration;
      const res = await fetch(`${API_URL}/admin/auto`, { method: "POST", headers: headers(), body: JSON.stringify({ enabled }) });
      setMessage(
        res.ok
          ? { ok: true, text: enabled ? "자동 생성을 켰어요. 문제가 부족한 칸은 AI가 알아서 만들어요." : "자동 생성을 껐어요. 이제 관리자가 직접 만들 때만 생성돼요." }
          : { ok: false, text: (await res.json().catch(() => ({}))).error ?? "바꾸지 못했어요." },
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  /** jobId 가 없으면 진행 중인 생성을 모두 멈춘다 */
  async function stop(jobId?: number) {
    if (!jobId && !window.confirm("진행 중인 AI 생성을 모두 멈출까요? 남은 '출시 전 채우기' 칸도 만들지 않아요.")) return;
    setBusy("stop");
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/admin/stop`, { method: "POST", headers: headers(), body: JSON.stringify(jobId ? { jobId } : {}) });
      const r = await res.json().catch(() => ({}));
      setMessage(res.ok ? { ok: true, text: r.stopped ? `생성 작업 ${r.stopped}개를 멈췄어요.` : "진행 중인 생성 작업이 없어요." } : { ok: false, text: r.error ?? "멈추지 못했어요." });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const runningCount = data?.jobs.filter((j) => j.status === "running").length ?? 0;
  const costPerSet = data && /haiku-4-5/.test(data.models.smart) ? COST_PER_SET_HAIKU_USD : COST_PER_SET_USD;
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
              sessionStorage.setItem("admin-token", codeInput);
            } catch {
              /* ignore */
            }
            // 코드가 바뀌면 그 값으로 다시 불러오고(아래 useEffect), 같으면 한 번 더 불러온다
            if (codeInput === token) load();
            else setToken(codeInput);
          }}
        >
          <input
            type="password"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="관리자 코드"
            aria-label="관리자 코드"
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

          <section className="card mt-6 flex flex-wrap items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                AI 자동 생성{" "}
                <span className={`chip ml-1 ${data.autoGeneration ? "bg-mint-50 text-mint-700" : "bg-ink-100 text-ink-600"}`}>{data.autoGeneration ? "켜짐" : "꺼짐"}</span>
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {data.autoGeneration
                  ? "학습자가 고른 칸의 문제가 부족하면 AI가 알아서 새 문제를 만들어요 (아래 생성 기준 ②~④)."
                  : "AI가 알아서 만들지 않아요. 아래 '출시 전 채우기'나 '수동 생성'을 누를 때만 만들어요."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={data.autoGeneration}
              onClick={toggleAuto}
              disabled={!!busy}
              className={data.autoGeneration ? "btn-ghost px-4 py-2.5 text-sm" : "btn-primary px-4 py-2.5 text-sm"}
            >
              {busy === "auto" ? <Spinner /> : null} {data.autoGeneration ? "자동 생성 끄기" : "자동 생성 켜기"}
            </button>
            <button
              type="button"
              onClick={() => stop()}
              disabled={busy === "stop" || runningCount === 0}
              className="rounded-xl bg-coral-50 px-4 py-2.5 text-sm font-semibold text-coral-700 hover:bg-coral-100 disabled:opacity-40"
            >
              {busy === "stop" ? <Spinner /> : "■"} 생성 중지{runningCount > 0 ? ` (${runningCount}개 진행 중)` : ""}
            </button>
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
                  <b>상한</b> — 칸마다 최대 {data.policy.maxStock}개. 난이도를 바꿨다는 이유만으로는 만들지 않는다. AI 생성은 코드 학습만 (개념 학습은 실행으로 정답을 확인할 수 없어 관리자 승인 기능과 함께 다음 단계에서).
                </li>
              </ol>
            </section>

            <section className="card p-5">
              <SectionTitle>출시 전 채우기</SectionTitle>
              <p className="text-sm text-ink-700">
                최소 재고에 못 미치는 칸 <b>{data.fillPlan.length}개</b> · 필요한 코드 세트 <b>{fillSets}개</b> · 추정 비용 약 <b>${(fillSets * costPerSet).toFixed(2)}</b>
                <span className="text-ink-400"> (세트당 약 ${costPerSet}로 가정)</span>
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
              <span>👥 = 최근 {data.policy.demandWindowDays}일 동안 칸을 소진한 학습자 수</span>
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
                {UNITS.filter((u) => u.track === "code").flatMap((u) => u.conceptIds).map((id) => (
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
                              document.getElementById("create")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
            <p className="mt-3 text-xs text-ink-400">칸을 누르면 아래 'AI로 문제 만들기'의 분야·난이도가 그 칸으로 바뀌어요.</p>
          </section>

          <section id="create" className="card mt-6 p-5">
            <SectionTitle>AI로 문제 만들기</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block font-semibold text-ink-500">분야 (개념)</span>
                <select value={concept} onChange={(e) => setConcept(e.target.value)} className="w-full rounded-xl border border-ink-200 px-3 py-2">
                  {UNITS.filter((u) => u.track === "code").map((u) => (
                    <optgroup key={u.id} label={`${u.emoji} ${u.title}`}>
                      {u.conceptIds.map((id) => (
                        <option key={id} value={id}>
                          {conceptName(id)} (공개 문제 {data.coverage[`${id}:${level}`] ?? 0}개)
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold text-ink-500">난이도</span>
                <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="w-full rounded-xl border border-ink-200 px-3 py-2">
                  {LEVELS.map((l) => (
                    <option key={l.level} value={l.level}>
                      Lv.{l.level} {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold text-ink-500">개수</span>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full rounded-xl border border-ink-200 px-3 py-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      코드 {n}개 (문제 약 {n * 6}~{n * 8}개)
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-semibold text-ink-500">
                어떤 내용으로 문제를 만들까요? <span className="font-normal text-ink-400">(선택 — 비워 두면 기본 기준대로 만들어요)</span>
              </span>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="예: 쇼핑몰 장바구니 데이터로 총 가격을 구하는 코드로 만들어 주세요. 초보자가 자주 헷갈리는 줄을 핵심 줄 문제로 물어봐 주세요."
                className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-[15px] leading-relaxed outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REQUEST_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setInstructions((v) => (v ? `${v}\n${ex}` : ex))}
                  className="chip bg-ink-100 text-ink-700 hover:bg-brand-50 hover:text-brand-700"
                >
                  + {ex}
                </button>
              ))}
              <span className="ml-auto self-center text-xs text-ink-400">{instructions.length}/1000</span>
            </div>
            {(data.generatable[concept]?.length ?? 0) === 0 ? (
              <p className="mt-3 rounded-xl bg-coral-50 px-3 py-2 text-sm text-coral-700">
                {conceptName(concept)}은(는) 아직 AI로 만들 수 없어요. 개념 학습 문제는 실행으로 정답을 확인할 수 없어서, 관리자 승인 기능과 함께 다음 단계에서 열려요.
              </p>
            ) : (
              !data.generatable[concept].includes(level) && (
                <p className="mt-3 rounded-xl bg-sun-50 px-3 py-2 text-sm text-sun-600">
                  {conceptName(concept)}의 기본 생성 난이도는 Lv.{data.generatable[concept].join(", Lv.")}이에요. 이 난이도로도 만들 수 있지만, 검증에서 반려될 가능성이 높아요.
                </p>
              )
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-4">
              <button
                type="button"
                onClick={generate}
                disabled={!!busy || data.mode === "off" || (data.generatable[concept]?.length ?? 0) === 0}
                className="btn-primary px-5 py-2.5 text-sm"
              >
                {busy === "generate" ? (
                  <>
                    <Spinner /> 만드는 중 (검증까지 1~2분)
                  </>
                ) : (
                  `${conceptName(concept)} Lv.${level} 코드 ${count}개 만들기`
                )}
              </button>
              <span className="text-xs text-ink-400">
                추정 비용 약 ${(count * costPerSet).toFixed(2)} · 실행 검증과 AI 검수를 통과한 것만 공개돼요
                {count > 1 && " · 여러 개는 뒤에서 차례로 만들고, 아래 생성 작업 기록에서 진행 상황을 볼 수 있어요"}
              </span>
              {data.mode === "mock" && <span className="text-xs text-ink-400">목업 모드는 요청 내용을 반영하지 않아요 (지원 개념: map, filter, for, if-else, reduce)</span>}
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
                        {j.status === "running" && (
                          <button type="button" onClick={() => stop(j.id)} disabled={busy === "stop"} className="ml-1 text-xs font-semibold text-coral-600 hover:underline">
                            중지
                          </button>
                        )}
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
                  {g.status === "rejected" && (
                    <RejectedHelp
                      item={g}
                      verifiable={g.concepts.some((c) => (data.generatable[c]?.length ?? 0) > 0)}
                      busy={!!busy}
                      onRepair={async (instructions) => {
                        setBusy("generate");
                        setMessage(null);
                        setTimeout(load, 800);
                        try {
                          const res = await fetch(`${API_URL}/admin/repair`, {
                            method: "POST",
                            headers: headers(),
                            body: JSON.stringify({ itemId: g.id, instructions: instructions || undefined }),
                          });
                          const r = (await res.json()) as GenerateResult | { error: string };
                          setMessage(
                            !res.ok || !("status" in r)
                              ? { ok: false, text: `✕ ${"error" in r ? r.error : "고치지 못했어요."}` }
                              : r.status === "published"
                                ? { ok: true, text: "✓ 고친 결과가 검증을 통과해 새 콘텐츠로 공개되었어요. (목록 맨 위)" }
                                : r.status === "rejected"
                                  ? { ok: false, text: "✕ 고친 결과도 검증을 통과하지 못했어요. 목록 맨 위의 새 보고서에서 이유를 확인하세요." }
                                  : { ok: r.status === "cancelled", text: r.status === "cancelled" ? "생성을 중지했어요." : `✕ ${r.error}` },
                          );
                          await load();
                        } finally {
                          setBusy(null);
                        }
                      }}
                    />
                  )}
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <CodeBlock code={g.code} className="self-start" />
                    <ValidationList checks={g.validation?.checks ?? []} />
                  </div>
                </details>
              ))}
            </div>
          </section>

          <DataMoveCard headers={headers} onImported={load} />

          <AdminCodeCard
            info={data.adminCode}
            headers={headers}
            onChanged={(code) => {
              setToken(code);
              setCodeInput(code);
              try {
                sessionStorage.setItem("admin-token", code);
              } catch {
                /* ignore */
              }
            }}
          />

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

/**
 * 데이터 옮기기: 서버를 바꿀 때(EC2·RDS → Lambda·DynamoDB 등) AI 생성 콘텐츠·설정·이번 달 사용량을 파일로 옮긴다.
 * 학습 기록은 로그인 없는 임시 기록이라 옮기지 않는다.
 */
function DataMoveCard({ headers, onImported }: { headers: () => Record<string, string>; onImported: () => Promise<void> }) {
  const [working, setWorking] = useState<"export" | "import" | null>(null);
  const [includeUsage, setIncludeUsage] = useState(true);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function exportFile() {
    setWorking("export");
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/admin/export`, { headers: headers() });
      const data = await res.json();
      if (!res.ok) return setResult({ ok: false, text: data.error ?? "내보내지 못했어요." });
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `codereading-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setResult({ ok: true, text: `내보냈어요: AI 콘텐츠 ${data.items.length}개, 설정 ${Object.keys(data.meta).length}개, 이번 달 사용량 ${data.usageThisMonth.length}줄` });
    } finally {
      setWorking(null);
    }
  }

  async function importFile(file: File) {
    setWorking("import");
    setResult(null);
    try {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        return setResult({ ok: false, text: "JSON 파일이 아니에요. 내보내기로 받은 파일을 골라 주세요." });
      }
      const res = await fetch(`${API_URL}/admin/import`, { method: "POST", headers: headers(), body: JSON.stringify({ ...(data as object), includeUsage }) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) return setResult({ ok: false, text: r.error ?? "가져오지 못했어요." });
      setResult({
        ok: true,
        text: `가져왔어요: AI 콘텐츠 ${r.items}개, 설정 ${r.settings}개${includeUsage ? `, 이번 달 사용량 ${r.usage}줄` : ""}${
          r.skippedItems ? ` · 예전 문제 형식의 콘텐츠 ${r.skippedItems}개는 새 학습 구조에 맞지 않아 건너뛰었어요` : ""
        }`,
      });
      await onImported();
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className="card mt-6 p-5">
      <SectionTitle>데이터 옮기기</SectionTitle>
      <p className="text-sm leading-relaxed text-ink-600">
        서버를 바꿀 때 <b>AI가 만든 콘텐츠·관리자 코드·자동 생성 설정·이번 달 AI 사용량</b>을 파일로 옮겨요. 예전 서버의 관리자 화면에서 <b>내보내기</b> → 새
        서버의 관리자 화면에서 <b>가져오기</b>. 학습 기록은 옮기지 않아요.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={exportFile} disabled={!!working} className="btn-soft px-4 py-2.5 text-sm">
          {working === "export" ? <Spinner /> : "⬇"} 내보내기 (파일 받기)
        </button>
        <label className={`btn-ghost cursor-pointer px-4 py-2.5 text-sm ${working ? "pointer-events-none opacity-50" : ""}`}>
          {working === "import" ? <Spinner /> : "⬆"} 가져오기 (파일 고르기)
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importFile(f);
            }}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-ink-600">
          <input type="checkbox" checked={includeUsage} onChange={(e) => setIncludeUsage(e.target.checked)} />
          이번 달 AI 사용량도 더하기 (월 예산이 이어지도록, 같은 파일을 두 번 가져오지 마세요)
        </label>
      </div>
      {result && <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${result.ok ? "bg-mint-50 text-mint-700" : "bg-coral-50 text-coral-700"}`}>{result.text}</p>}
    </section>
  );
}

/** 관리자 코드 바꾸기. 원문은 서버 DB 에도 남지 않고(해시만 저장), 이 브라우저 탭에만 기억한다 */
function AdminCodeCard({
  info,
  headers,
  onChanged,
}: {
  info: { custom: boolean; recovery: boolean };
  headers: () => Record<string, string>;
  onChanged: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const problem =
    code.length === 0
      ? null
      : code.length < 8
        ? "8자 이상으로 정해 주세요."
        : code.trim() !== code
          ? "앞뒤에 공백을 넣을 수 없어요."
          : confirm && confirm !== code
            ? "두 칸의 코드가 서로 달라요."
            : null;

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/admin/code`, { method: "POST", headers: headers(), body: JSON.stringify({ code }) });
      if (res.ok) {
        onChanged(code);
        setCode("");
        setConfirm("");
        setResult({ ok: true, text: "관리자 코드를 바꿨어요. 이제 예전 관리자 코드로는 들어올 수 없어요." });
      } else {
        setResult({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "바꾸지 못했어요." });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card mt-6 p-5">
      <SectionTitle>관리자 코드</SectionTitle>
      <p className="text-sm leading-relaxed text-ink-600">
        {info.custom ? "관리자 화면에서 정한 관리자 코드를 쓰고 있어요." : "아직 관리자 코드를 정하지 않았어요. 지금은 서버의 복구 코드로만 들어올 수 있어요."} 함께 관리하는 사람에게는{" "}
        <b>관리자 코드</b>를 알려 주세요.
        {info.recovery && (
          <>
            {" "}
            서버 <code className="rounded bg-ink-100 px-1">.env</code> 의 <code className="rounded bg-ink-100 px-1">ADMIN_TOKEN</code>(복구 코드)은 코드를 잊었을 때를 위해 항상 쓸 수 있으니, 서버
            관리자만 알고 있어야 해요.
          </>
        )}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-ink-500">새 관리자 코드 (8자 이상)</span>
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={64}
            autoComplete="new-password"
            className="w-full rounded-xl border border-ink-200 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-ink-500">한 번 더 입력</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            maxLength={64}
            autoComplete="new-password"
            className="w-full rounded-xl border border-ink-200 px-3 py-2"
          />
        </label>
        <button type="button" onClick={save} disabled={saving || !code || !!problem || confirm !== code} className="btn-primary px-5 py-2.5 text-sm">
          {saving ? <Spinner /> : null} 관리자 코드 바꾸기
        </button>
      </div>
      {problem && <p className="mt-2 text-sm text-coral-600">{problem}</p>}
      {result && <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${result.ok ? "bg-mint-50 text-mint-700" : "bg-coral-50 text-coral-700"}`}>{result.text}</p>}
    </section>
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

/** 반려된 콘텐츠: 이해하기 쉬운 반려 이유 + AI 로 고쳐서 다시 만들기 */
function RejectedHelp({
  item,
  verifiable,
  busy,
  onRepair,
}: {
  item: GeneratedItemRow;
  verifiable: boolean;
  busy: boolean;
  onRepair: (instructions: string) => Promise<void>;
}) {
  const [extra, setExtra] = useState("");
  const [working, setWorking] = useState(false);
  const reasons = [
    ...new Set(
      (item.validation?.checks ?? [])
        .filter((c) => !c.pass)
        .map((c) => explainCheck(c.name) ?? c.name),
    ),
  ];
  return (
    <div className="mt-4 rounded-2xl bg-coral-50/60 p-4">
      <p className="font-bold text-coral-700">왜 반려됐나요?</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-700">
        {reasons.length === 0 ? <li>검증 기록이 없어요.</li> : reasons.map((r) => <li key={r}>{r}</li>)}
      </ul>
      <p className="mt-2 text-xs text-ink-500">
        자동 검증은 코드를 서버에서 실제로 실행해 정답·해설이 맞는지 확인해요. 하나라도 틀리면 학습자에게 틀린 문제가 나가지 않도록 공개하지 않아요.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          maxLength={1000}
          placeholder="고칠 때 추가로 바랄 점 (선택) — 예: 코드를 조금 더 짧게"
          className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy || working || !verifiable}
          onClick={async () => {
            setWorking(true);
            try {
              await onRepair(extra.trim());
            } finally {
              setWorking(false);
            }
          }}
          className="btn-primary px-4 py-2 text-sm"
        >
          {working ? (
            <>
              <Spinner /> 고치는 중 (1~2분)
            </>
          ) : (
            "✨ AI로 고쳐서 다시 만들기"
          )}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-ink-400">
        {!verifiable && "이 콘텐츠의 개념은 서버에서 실행 검증을 할 수 없어서 고칠 수 없어요. "}
        반려 이유와 실제 실행 결과를 AI에게 알려 주고 고친 완성본을 받아, 검증·검수를 처음부터 다시 해요. 통과하면 새 콘텐츠로 공개돼요 (지금 항목은 그대로 남아요).
      </p>
    </div>
  );
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
            {!c.pass && explainCheck(c.name) && <span className="block pl-4 text-xs font-normal text-ink-700">→ {explainCheck(c.name)}</span>}
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

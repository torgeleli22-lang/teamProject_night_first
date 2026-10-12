import type { Trigger } from "../content/policy";
import type { Level } from "../types";
import { getDb } from "./db";

// ───────────────────────── AI 사용량 (비용 관리) ─────────────────────────

export async function logUsage(task: string, model: string, usage: { input: number; output: number; cacheRead: number }, ok: boolean) {
  await (await getDb()).run(
    "INSERT INTO ai_usage (task, model, input_tokens, output_tokens, cache_read_tokens, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [task, model, usage.input, usage.output, usage.cacheRead, ok, Date.now()],
  );
}

export interface UsageRow {
  task: string;
  model: string;
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  failures: number;
}

export async function usageSummary(sinceMs = 0): Promise<UsageRow[]> {
  const rows = await (await getDb()).all<{ task: string; model: string; calls: number; input: number | null; output: number | null; cache_read: number | null; failures: number | null }>(
    `SELECT task, model, CAST(COUNT(*) AS INTEGER) AS calls, CAST(SUM(input_tokens) AS INTEGER) AS input, CAST(SUM(output_tokens) AS INTEGER) AS output,
            CAST(SUM(cache_read_tokens) AS INTEGER) AS cache_read, CAST(SUM(1 - ok) AS INTEGER) AS failures
     FROM ai_usage WHERE created_at >= ? GROUP BY task, model ORDER BY calls DESC`,
    [sinceMs],
  );
  return rows.map((r) => ({ task: r.task, model: r.model, calls: r.calls, input: r.input ?? 0, output: r.output ?? 0, cacheRead: r.cache_read ?? 0, failures: r.failures ?? 0 }));
}

/** 채점 주체별 풀이 수 — 규칙 채점이 대부분을 처리하고 있는지 확인 */
export async function gradingSplit(): Promise<{ rule: number; ai: number }> {
  const rows = await (await getDb()).all<{ graded_by: string; n: number }>("SELECT graded_by, CAST(COUNT(*) AS INTEGER) AS n FROM attempts GROUP BY graded_by");
  return { rule: rows.find((r) => r.graded_by === "rule")?.n ?? 0, ai: rows.find((r) => r.graded_by === "ai")?.n ?? 0 };
}

// ───────────────────────── 콘텐츠 생성 작업 ─────────────────────────

export interface Job {
  id: number;
  concept: string;
  level: Level;
  trigger: Trigger;
  sessionId: string | null;
  mock: boolean;
  status: "running" | "published" | "rejected" | "failed" | "cancelled";
  reason: string;
  itemId: string | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}

interface JobRow {
  id: number;
  concept: string;
  level: number;
  trigger: string;
  session_id: string | null;
  mock: number;
  status: string;
  reason: string;
  item_id: string | null;
  error: string | null;
  created_at: number;
  finished_at: number | null;
}

const toJob = (r: JobRow): Job => ({
  id: r.id,
  concept: r.concept,
  level: r.level as Level,
  trigger: r.trigger as Trigger,
  sessionId: r.session_id,
  mock: r.mock === 1,
  status: r.status as Job["status"],
  reason: r.reason,
  itemId: r.item_id,
  error: r.error,
  createdAt: r.created_at,
  finishedAt: r.finished_at,
});

export async function createJob(job: { concept: string; level: Level; trigger: Trigger; reason: string; sessionId?: string; mock: boolean }): Promise<number> {
  return (await getDb()).insert(
    "INSERT INTO generation_jobs (concept, level, status, trigger, reason, session_id, mock, created_at) VALUES (?, ?, 'running', ?, ?, ?, ?, ?)",
    [job.concept, job.level, job.trigger, job.reason, job.sessionId ?? null, job.mock, Date.now()],
  );
}

/** 진행 중인 작업만 끝낸다 (관리자가 이미 중지한 작업의 상태는 바꾸지 않음) */
export async function finishJob(id: number, status: Job["status"], itemId: string | null, error: string | null) {
  await (await getDb()).run("UPDATE generation_jobs SET status = ?, item_id = ?, error = ?, finished_at = ? WHERE id = ? AND status = 'running'", [
    status,
    itemId,
    error,
    Date.now(),
    id,
  ]);
}

export async function jobCancelled(id: number): Promise<boolean> {
  const row = await (await getDb()).get<{ status: string }>("SELECT status FROM generation_jobs WHERE id = ?", [id]);
  return row?.status === "cancelled";
}

/**
 * 관리자 '생성 중지': 진행 중인 작업(jobId 가 없으면 전부)을 cancelled 로 바꾸고 그 id 들을 돌려준다.
 * 전부 중지할 때는 시각도 남겨서, 여러 칸을 차례로 만드는 '출시 전 채우기'가 다음 칸으로 넘어가지 않게 한다.
 */
export async function cancelJobs(jobId?: number): Promise<number[]> {
  const db = await getDb();
  const now = Date.now();
  const where = jobId ? "status = 'running' AND id = ?" : "status = 'running'";
  const params = jobId ? [jobId] : [];
  const ids = (await db.all<{ id: number }>(`SELECT id FROM generation_jobs WHERE ${where}`, params)).map((r) => Number(r.id));
  await db.run(`UPDATE generation_jobs SET status = 'cancelled', error = '관리자가 중지했어요', finished_at = ? WHERE ${where}`, [now, ...params]);
  if (!jobId) await setMeta("generation_stop_at", String(now));
  return ids;
}

/** since 이후에 '전부 중지'가 눌렸는지 */
export async function stopRequestedSince(since: number): Promise<boolean> {
  return Number((await getMeta("generation_stop_at")) ?? 0) >= since;
}

// ───────────────────────── 운영 설정 (app_meta) ─────────────────────────

async function getMeta(key: string): Promise<string | null> {
  return (await (await getDb()).get<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", [key]))?.value ?? null;
}

async function setMeta(key: string, value: string) {
  await (await getDb()).run("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
}

/** 문제가 부족할 때 AI 가 알아서 만드는 자동 생성 (재고 하한·소진·맞춤 복습). 관리자 화면에서 켜고 끈다. 기본은 켜짐 */
export async function autoGenerationEnabled(): Promise<boolean> {
  return (await getMeta("auto_generation")) !== "off";
}

export async function setAutoGeneration(enabled: boolean) {
  await setMeta("auto_generation", enabled ? "on" : "off");
}

/** 같은 개념·난이도로 진행 중인 작업 (중복 생성 방지). 10분 넘게 걸린 작업은 무시 */
export async function runningJob(concept: string, level: Level): Promise<Job | null> {
  const row = await (await getDb()).get<JobRow>(
    "SELECT * FROM generation_jobs WHERE concept = ? AND level = ? AND status = 'running' AND created_at > ? LIMIT 1",
    [concept, level, Date.now() - 10 * 60_000],
  );
  return row ? toJob(row) : null;
}

export async function jobsSince(sinceMs: number): Promise<number> {
  return (await (await getDb()).get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM generation_jobs WHERE created_at >= ?", [sinceMs]))?.n ?? 0;
}

export async function listJobs(limit = 20): Promise<Job[]> {
  return (await (await getDb()).all<JobRow>("SELECT * FROM generation_jobs ORDER BY id DESC LIMIT ?", [limit])).map(toJob);
}

/** 이 학습자가 오늘 일으킨 맞춤 복습 생성 수 */
export async function personalJobsSince(sessionId: string, sinceMs: number): Promise<number> {
  return (
    (await (await getDb()).get<{ n: number }>(
      "SELECT CAST(COUNT(*) AS INTEGER) AS n FROM generation_jobs WHERE session_id = ? AND trigger = 'personal_review' AND created_at >= ?",
      [sessionId, sinceMs],
    ))?.n ?? 0
  );
}

// ───────────────────────── 수요 신호 (칸을 소진한 학습자) ─────────────────────────

export async function recordDemand(concept: string, level: Level, sessionId: string) {
  const db = await getDb();
  const exists = await db.get(
    "SELECT 1 AS one FROM demand_signals WHERE concept = ? AND level = ? AND session_id = ? AND created_at >= ? LIMIT 1",
    [concept, level, sessionId, Date.now() - 86400_000],
  );
  if (!exists) await db.run("INSERT INTO demand_signals (concept, level, session_id, created_at) VALUES (?, ?, ?, ?)", [concept, level, sessionId, Date.now()]);
}

/** 최근 기간에 이 칸을 소진한 서로 다른 학습자 수 */
export async function demandCount(concept: string, level: Level, sinceMs: number): Promise<number> {
  return (
    (await (await getDb()).get<{ n: number }>(
      "SELECT CAST(COUNT(DISTINCT session_id) AS INTEGER) AS n FROM demand_signals WHERE concept = ? AND level = ? AND created_at >= ?",
      [concept, level, sinceMs],
    ))?.n ?? 0
  );
}

export async function demandByCell(sinceMs: number): Promise<Record<string, number>> {
  const rows = await (await getDb()).all<{ concept: string; level: number; n: number }>(
    "SELECT concept, level, CAST(COUNT(DISTINCT session_id) AS INTEGER) AS n FROM demand_signals WHERE created_at >= ? GROUP BY concept, level",
    [sinceMs],
  );
  return Object.fromEntries(rows.map((r) => [`${r.concept}:${r.level}`, r.n]));
}

// ───────────────────────── 비용 추정 ─────────────────────────

/** 표시·예산 판단용 추정 단가 (USD / 1M tokens). 실제 청구는 콘솔 기준 */
export const PRICE: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};

/** "mock:", "us.anthropic.", 날짜·버전 꼬리("-20251001-v1:0")를 떼어 가격표 이름으로 맞춘다 */
export function normalizeModel(model: string): string {
  return model.replace(/^mock:/, "").replace(/^(?:[a-z]{2,6}\.)?anthropic\./, "").replace(/-\d{8}(?:-v\d+(?::\d+)?)?$/, "");
}

export function estimateCost(rows: UsageRow[]): number {
  return rows.reduce((s, u) => {
    const p = PRICE[normalizeModel(u.model)];
    return p ? s + (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead) / 1e6 : s;
  }, 0);
}

export async function monthToDateCostUsd(includeMock = false): Promise<number> {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return estimateCost((await usageSummary(start)).filter((u) => includeMock || !u.model.startsWith("mock:")));
}

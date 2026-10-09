import "server-only";
import type { Trigger } from "../content/policy";
import type { Level } from "../types";
import { getDb } from "./db";

// ───────────────────────── AI 사용량 (비용 관리) ─────────────────────────

export function logUsage(task: string, model: string, usage: { input: number; output: number; cacheRead: number }, ok: boolean) {
  getDb()
    .prepare("INSERT INTO ai_usage (task, model, input_tokens, output_tokens, cache_read_tokens, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(task, model, usage.input, usage.output, usage.cacheRead, ok ? 1 : 0, Date.now());
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

export function usageSummary(sinceMs = 0): UsageRow[] {
  return (
    getDb()
      .prepare(
        `SELECT task, model, COUNT(*) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output,
                SUM(cache_read_tokens) AS cacheRead, SUM(1 - ok) AS failures
         FROM ai_usage WHERE created_at >= ? GROUP BY task, model ORDER BY calls DESC`,
      )
      .all(sinceMs) as unknown as UsageRow[]
  ).map((r) => ({ ...r, input: r.input ?? 0, output: r.output ?? 0, cacheRead: r.cacheRead ?? 0 }));
}

/** 채점 주체별 풀이 수 — 규칙 채점이 대부분을 처리하고 있는지 확인 */
export function gradingSplit(): { rule: number; ai: number } {
  const rows = getDb().prepare("SELECT graded_by, COUNT(*) AS n FROM attempts GROUP BY graded_by").all() as { graded_by: string; n: number }[];
  return { rule: rows.find((r) => r.graded_by === "rule")?.n ?? 0, ai: rows.find((r) => r.graded_by === "ai")?.n ?? 0 };
}

// ───────────────────────── 콘텐츠 생성 작업 ─────────────────────────

export interface Job {
  id: number;
  concept: string;
  level: Level;
  trigger: Trigger;
  learnerId: string | null;
  mock: boolean;
  status: "running" | "published" | "rejected" | "failed";
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
  learner_id: string | null;
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
  learnerId: r.learner_id,
  mock: r.mock === 1,
  status: r.status as Job["status"],
  reason: r.reason,
  itemId: r.item_id,
  error: r.error,
  createdAt: r.created_at,
  finishedAt: r.finished_at,
});

export function createJob(job: { concept: string; level: Level; trigger: Trigger; reason: string; learnerId?: string; mock: boolean }): number {
  const r = getDb()
    .prepare(
      "INSERT INTO generation_jobs (concept, level, status, trigger, reason, learner_id, mock, created_at) VALUES (?, ?, 'running', ?, ?, ?, ?, ?)",
    )
    .run(job.concept, job.level, job.trigger, job.reason, job.learnerId ?? null, job.mock ? 1 : 0, Date.now());
  return Number(r.lastInsertRowid);
}

export function finishJob(id: number, status: Job["status"], itemId: string | null, error: string | null) {
  getDb()
    .prepare("UPDATE generation_jobs SET status = ?, item_id = ?, error = ?, finished_at = ? WHERE id = ?")
    .run(status, itemId, error, Date.now(), id);
}

/** 같은 개념·난이도로 진행 중인 작업 (중복 생성 방지). 10분 넘게 걸린 작업은 무시 */
export function runningJob(concept: string, level: Level): Job | null {
  const row = getDb()
    .prepare("SELECT * FROM generation_jobs WHERE concept = ? AND level = ? AND status = 'running' AND created_at > ? LIMIT 1")
    .get(concept, level, Date.now() - 10 * 60_000) as JobRow | undefined;
  return row ? toJob(row) : null;
}

export function jobsSince(sinceMs: number): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM generation_jobs WHERE created_at >= ?").get(sinceMs) as { n: number }).n;
}

export function listJobs(limit = 20): Job[] {
  return (getDb().prepare("SELECT * FROM generation_jobs ORDER BY id DESC LIMIT ?").all(limit) as unknown as JobRow[]).map(toJob);
}

/** 이 학습자가 오늘 일으킨 맞춤 복습 생성 수 */
export function personalJobsSince(learnerId: string, sinceMs: number): number {
  return (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM generation_jobs WHERE learner_id = ? AND trigger = 'personal_review' AND created_at >= ?")
      .get(learnerId, sinceMs) as { n: number }
  ).n;
}

// ───────────────────────── 수요 신호 (칸을 소진한 학습자) ─────────────────────────

export function recordDemand(concept: string, level: Level, learnerId: string) {
  const db = getDb();
  const since = Date.now() - 86400_000;
  const exists = db
    .prepare("SELECT 1 FROM demand_signals WHERE concept = ? AND level = ? AND learner_id = ? AND created_at >= ? LIMIT 1")
    .get(concept, level, learnerId, since);
  if (!exists) db.prepare("INSERT INTO demand_signals (concept, level, learner_id, created_at) VALUES (?, ?, ?, ?)").run(concept, level, learnerId, Date.now());
}

/** 최근 기간에 이 칸을 소진한 서로 다른 학습자 수 */
export function demandCount(concept: string, level: Level, sinceMs: number): number {
  return (
    getDb()
      .prepare("SELECT COUNT(DISTINCT learner_id) AS n FROM demand_signals WHERE concept = ? AND level = ? AND created_at >= ?")
      .get(concept, level, sinceMs) as { n: number }
  ).n;
}

export function demandByCell(sinceMs: number): Record<string, number> {
  const rows = getDb()
    .prepare("SELECT concept, level, COUNT(DISTINCT learner_id) AS n FROM demand_signals WHERE created_at >= ? GROUP BY concept, level")
    .all(sinceMs) as { concept: string; level: number; n: number }[];
  return Object.fromEntries(rows.map((r) => [`${r.concept}:${r.level}`, r.n]));
}

// ───────────────────────── 비용 추정 ─────────────────────────

/** 표시·예산 판단용 추정 단가 (USD / 1M tokens). 실제 청구는 콘솔 기준 */
export const PRICE: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export function estimateCost(rows: UsageRow[]): number {
  return rows.reduce((s, u) => {
    const p = PRICE[u.model.replace(/^anthropic\./, "").replace(/^mock:/, "")];
    return p ? s + (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead) / 1e6 : s;
  }, 0);
}

export function monthToDateCostUsd(includeMock = false): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return estimateCost(usageSummary(start).filter((u) => includeMock || !u.model.startsWith("mock:")));
}

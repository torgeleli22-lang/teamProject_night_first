import "server-only";
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
  status: r.status as Job["status"],
  reason: r.reason,
  itemId: r.item_id,
  error: r.error,
  createdAt: r.created_at,
  finishedAt: r.finished_at,
});

export function createJob(concept: string, level: Level, reason: string): number {
  const r = getDb()
    .prepare("INSERT INTO generation_jobs (concept, level, status, reason, created_at) VALUES (?, ?, 'running', ?, ?)")
    .run(concept, level, reason, Date.now());
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

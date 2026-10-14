import type { Trigger } from "../../content/policy";
import type { Level } from "../../types";
import type { Job, UsageRow } from "../ops-repo";
import { getItem, nowSec, pad, putItem, queryAll, timeId, updateItem, type Item } from "./client";

/**
 * 운영 데이터 (ops-repo 의 DynamoDB 판).
 * - AI 사용량: USAGE / <연-월>#<작업>#<모델> 에 호출 수·토큰을 더해 간다 (월 단위 합계 → 월 예산 판단)
 * - 생성 작업: JOB / <시간순 번호> (90일 뒤 자동 삭제)
 * - 설정: META / <키>,  채점 통계: STATS / GRADED,  수요: DEMAND / <개념>#<난이도>#<세션>
 */

/** 로컬 시각 기준 '연-월' (SQL 판의 월초 계산과 같은 기준) */
export const monthKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export async function logUsage(task: string, model: string, usage: { input: number; output: number; cacheRead: number }, ok: boolean) {
  const month = monthKey(Date.now());
  await updateItem("USAGE", `${month}#${task}#${model}`, {
    set: { task, model, month },
    add: { calls: 1, input: usage.input, output: usage.output, cacheRead: usage.cacheRead, failures: ok ? 0 : 1 },
  });
}

/** sinceMs 가 속한 달부터의 사용량 (월 단위로 모아 두므로 달 중간 시각은 그 달 처음부터로 본다) */
export async function usageSummary(sinceMs: number): Promise<UsageRow[]> {
  const fromMonth = sinceMs > 0 ? monthKey(sinceMs) : "";
  const rows = await queryAll<{ task: string; model: string; month: string; calls: number; input: number; output: number; cacheRead: number; failures: number }>(
    "USAGE",
    fromMonth ? { from: fromMonth } : {},
  );
  const byKey = new Map<string, UsageRow>();
  for (const r of rows) {
    const key = `${r.task}\u0000${r.model}`;
    const cur = byKey.get(key) ?? { task: r.task, model: r.model, calls: 0, input: 0, output: 0, cacheRead: 0, failures: 0 };
    cur.calls += r.calls ?? 0;
    cur.input += r.input ?? 0;
    cur.output += r.output ?? 0;
    cur.cacheRead += r.cacheRead ?? 0;
    cur.failures += r.failures ?? 0;
    byKey.set(key, cur);
  }
  return [...byKey.values()].sort((a, b) => b.calls - a.calls);
}

/** 옮겨 온 사용량 합계를 그대로 더한다 (데이터 가져오기) */
export async function addUsage(row: UsageRow, month: string) {
  await updateItem("USAGE", `${month}#${row.task}#${row.model}`, {
    set: { task: row.task, model: row.model, month },
    add: { calls: row.calls, input: row.input, output: row.output, cacheRead: row.cacheRead, failures: row.failures },
  });
}

export async function gradingSplit(): Promise<{ rule: number; ai: number }> {
  const s = await getItem<{ rule?: number; ai?: number }>("STATS", "GRADED");
  return { rule: s?.rule ?? 0, ai: s?.ai ?? 0 };
}

// ───────────────────────── 생성 작업 ─────────────────────────

const JOB_TTL_SEC = 90 * 86400;
const ONLY_RUNNING = { condition: "#cst = :running", conditionNames: { "#cst": "status" }, conditionValues: { ":running": "running" } };
const jobSk = (id: number) => pad(id);

interface JobItem extends Item {
  id: number;
  concept: string;
  level: number;
  trigger: string;
  sessionId: string | null;
  mock: boolean;
  status: string;
  reason: string;
  itemId: string | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}

const toJob = (r: JobItem): Job => ({
  id: r.id,
  concept: r.concept,
  level: r.level as Level,
  trigger: r.trigger as Trigger,
  sessionId: r.sessionId ?? null,
  mock: !!r.mock,
  status: r.status as Job["status"],
  reason: r.reason,
  itemId: r.itemId ?? null,
  error: r.error ?? null,
  createdAt: r.createdAt,
  finishedAt: r.finishedAt ?? null,
});

/** createdAt 이후에 만든 작업들 (작업 번호가 시각 기반이라 정렬 키 범위로 읽는다) */
const jobsFrom = (sinceMs: number) => queryAll<JobItem>("JOB", { from: jobSk(sinceMs * 1000) });

export async function createJob(job: { concept: string; level: Level; trigger: Trigger; reason: string; sessionId?: string; mock: boolean }): Promise<number> {
  const now = Date.now();
  const id = timeId(now);
  await putItem({
    pk: "JOB",
    sk: jobSk(id),
    id,
    concept: job.concept,
    level: job.level,
    trigger: job.trigger,
    sessionId: job.sessionId ?? null,
    mock: job.mock,
    status: "running",
    reason: job.reason,
    itemId: null,
    error: null,
    createdAt: now,
    finishedAt: null,
    ttl: nowSec() + JOB_TTL_SEC,
  });
  return id;
}

export async function finishJob(id: number, status: Job["status"], itemId: string | null, error: string | null) {
  // 관리자가 이미 중지한 작업의 상태는 바꾸지 않는다
  await updateItem("JOB", jobSk(id), { set: { status, itemId, error, finishedAt: Date.now() }, ...ONLY_RUNNING });
}

export async function jobCancelled(id: number): Promise<boolean> {
  return (await getItem<JobItem>("JOB", jobSk(id), true))?.status === "cancelled";
}

/** 진행 중인 작업을 cancelled 로 (jobId 가 없으면 최근 하루 안의 진행 중 작업 전부) */
export async function cancelJobs(jobId?: number): Promise<number[]> {
  const targets = jobId ? [jobId] : (await jobsFrom(Date.now() - 86400_000)).filter((j) => j.status === "running").map((j) => j.id);
  const stopped: number[] = [];
  for (const id of targets) {
    const r = await updateItem("JOB", jobSk(id), {
      set: { status: "cancelled", error: "관리자가 중지했어요", finishedAt: Date.now() },
      ...ONLY_RUNNING,
    });
    if (r.ok) stopped.push(id);
  }
  return stopped;
}

export async function runningJob(concept: string, level: Level): Promise<Job | null> {
  const r = (await jobsFrom(Date.now() - 10 * 60_000)).find((j) => j.concept === concept && j.level === level && j.status === "running");
  return r ? toJob(r) : null;
}

export async function jobsSince(sinceMs: number): Promise<number> {
  return (await jobsFrom(sinceMs)).length;
}

export async function listJobs(limit: number): Promise<Job[]> {
  return (await queryAll<JobItem>("JOB", { descending: true, limit })).map(toJob);
}

export async function personalJobsSince(sessionId: string, sinceMs: number): Promise<number> {
  return (await jobsFrom(sinceMs)).filter((j) => j.sessionId === sessionId && j.trigger === "personal_review").length;
}

// ───────────────────────── 설정 ─────────────────────────

export async function getMeta(key: string): Promise<string | null> {
  return (await getItem<{ value: string }>("META", key, true))?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  await putItem({ pk: "META", sk: key, value });
}

// ───────────────────────── 수요 신호 ─────────────────────────

export async function recordDemand(concept: string, level: Level, sessionId: string, windowDays: number) {
  await putItem({ pk: "DEMAND", sk: `${concept}#${level}#${sessionId}`, concept, level, sessionId, lastAt: Date.now(), ttl: nowSec() + windowDays * 86400 });
}

export async function demandCount(concept: string, level: Level, sinceMs: number): Promise<number> {
  return (await queryAll<{ lastAt: number }>("DEMAND", { prefix: `${concept}#${level}#` })).filter((d) => d.lastAt >= sinceMs).length;
}

export async function demandByCell(sinceMs: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const d of await queryAll<{ concept: string; level: number; lastAt: number }>("DEMAND")) {
    if (d.lastAt < sinceMs) continue;
    const key = `${d.concept}:${d.level}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

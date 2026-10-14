import crypto from "node:crypto";
import { attemptQuality, dayKey, xpForAttempt } from "../../learner/stats";
import type { Attempt, GradedBy, Level, QuestionType } from "../../types";
import type { ConceptProgressRow, DailyActivity, NewAttempt, RankRow, SessionInfo, StoredAnalysis } from "../session-repo";
import { batchWrite, getItem, nowSec, pad, putItem, queryAll, timeId, updateItem, type Item } from "./client";

/**
 * 학습자·학습 기록 (session-repo 의 DynamoDB 판).
 * - 학습자: LEARNER / <id> — 랭킹을 위해 총 XP·푼 수를 함께 갱신한다 (SQL 의 SUM 대신)
 * - 기록: S#<id> / A#·D#·C#·N# — 학습자 한 명의 기록은 파티션 하나라 한 번에 읽는다
 * - 만료: 학습자는 마지막 사용 + SESSION_TTL, 기록은 쓴 시각 + SESSION_TTL + 7일 (TTL 자동 삭제)
 */

const LEARNER = "LEARNER";
const sessionPk = (id: string) => `S#${id}`;
/** 기록은 학습자보다 넉넉히 남긴다 (학습자가 만료되면 어차피 찾아갈 수 없음) */
const RECORD_EXTRA_SEC = 7 * 86400;

interface LearnerItem extends Item {
  pk: string;
  sk: string;
  nickname: string;
  preferredLevel: number | null;
  dailyGoal: number;
  createdAt: number;
  lastSeen: number;
  ttl: number;
  demo?: boolean;
  xp?: number;
  solved?: number;
}

const ttlFromNow = (ttlMs: number, extraSec = 0) => nowSec() + Math.ceil(ttlMs / 1000) + extraSec;
const alive = (l: { ttl?: number }) => !l.ttl || l.ttl > nowSec();

const toSession = (l: LearnerItem): SessionInfo => ({
  id: l.sk,
  nickname: l.nickname,
  preferredLevel: (l.preferredLevel as Level) ?? null,
  dailyGoal: l.dailyGoal ?? 5,
  createdAt: l.createdAt,
});

export async function touchSession(
  id: string | null,
  valid: boolean,
  ttlMs: number,
  canCreate: () => boolean | Promise<boolean>,
  makeNickname: () => string,
  limitError: () => Error,
): Promise<SessionInfo> {
  const now = Date.now();
  if (id && valid) {
    const found = await getItem<LearnerItem>(LEARNER, id, true);
    if (found && alive(found)) {
      await updateItem(LEARNER, id, { set: { lastSeen: now, ttl: ttlFromNow(ttlMs) } });
      return toSession(found);
    }
  }
  if (!(await canCreate())) throw limitError();
  const fresh: LearnerItem = {
    pk: LEARNER,
    sk: crypto.randomUUID(),
    nickname: makeNickname(),
    preferredLevel: null,
    dailyGoal: 5,
    createdAt: now,
    lastSeen: now,
    ttl: ttlFromNow(ttlMs),
    xp: 0,
    solved: 0,
  };
  await putItem(fresh);
  return toSession(fresh);
}

export async function setNickname(id: string, nickname: string) {
  await updateItem(LEARNER, id, { set: { nickname }, condition: "attribute_exists(pk)" });
}

export async function setPreferredLevel(id: string, level: Level) {
  await updateItem(LEARNER, id, { set: { preferredLevel: level }, condition: "attribute_exists(pk)" });
}

async function deleteRecords(id: string, keep: (sk: string) => boolean = () => false) {
  const items = await queryAll<{ pk: string; sk: string }>(sessionPk(id));
  await batchWrite(items.filter((i) => !keep(i.sk)).map((i) => ({ delete: { pk: i.pk, sk: i.sk } })));
}

export async function resetSession(id: string) {
  await deleteRecords(id);
  await updateItem(LEARNER, id, { set: { preferredLevel: null, xp: 0, solved: 0 }, condition: "attribute_exists(pk)" });
}

// ───────────────────────── 랭킹 ─────────────────────────

/** 지금 참여 중이고 1문제 이상 푼 학습자 (XP 높은 순, 같으면 먼저 시작한 순) */
async function rankedLearners(): Promise<LearnerItem[]> {
  const all = await queryAll<LearnerItem>(LEARNER);
  return all.filter((l) => alive(l) && (l.solved ?? 0) > 0).sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0) || a.createdAt - b.createdAt);
}

export async function ranking(meId: string, limit: number): Promise<{ top: RankRow[]; total: number }> {
  const list = await rankedLearners();
  const top: RankRow[] = [];
  let rank = 0;
  let prevXp: number | null = null;
  list.forEach((l, i) => {
    if ((l.xp ?? 0) !== prevXp) rank = i + 1; // 같은 XP 는 같은 등수 (SQL 의 RANK())
    prevXp = l.xp ?? 0;
    if (i < limit) top.push({ nickname: l.nickname, xp: l.xp ?? 0, solved: l.solved ?? 0, rank, isMe: l.sk === meId });
  });
  return { top, total: list.length };
}

export async function myRank(sessionId: string): Promise<{ rank: number; xp: number; nextXp: number | null } | null> {
  const list = await rankedLearners();
  const me = list.find((l) => l.sk === sessionId);
  if (!me) return null;
  const xp = me.xp ?? 0;
  const above = list.filter((l) => (l.xp ?? 0) > xp);
  return { rank: above.length + 1, xp, nextXp: above.length ? Math.min(...above.map((l) => l.xp ?? 0)) : null };
}

export async function seedDemoPeers(count: number, ttlMs: number, makeNickname: () => string) {
  const now = Date.now();
  const ops: { put: Item }[] = [];
  for (let i = 0; i < count; i++) {
    const id = crypto.randomUUID();
    const xp = Math.round(20 + Math.pow(Math.random(), 2.2) * 600);
    const solved = Math.max(1, Math.round(xp / 11));
    ops.push({
      put: { pk: LEARNER, sk: id, nickname: makeNickname(), preferredLevel: null, dailyGoal: 5, createdAt: now, lastSeen: now, ttl: ttlFromNow(ttlMs), demo: true, xp, solved },
    });
    ops.push({
      put: { pk: sessionPk(id), sk: `D#${dayKey(now)}`, day: dayKey(now), solved, correct: Math.round(solved * 0.7), timeMs: solved * 30_000, xp, ttl: ttlFromNow(ttlMs, RECORD_EXTRA_SEC) },
    });
  }
  await batchWrite(ops);
}

export async function removeDemoPeers() {
  const demo = (await queryAll<LearnerItem>(LEARNER)).filter((l) => l.demo);
  for (const l of demo) await deleteRecords(l.sk);
  await batchWrite(demo.map((l) => ({ delete: { pk: LEARNER, sk: l.sk } })));
}

// ───────────────────────── 풀이 기록 + 요약 갱신 ─────────────────────────

const recent = <T>(list: T[] | undefined, value: T, keep: number) => [...(list ?? []), value].slice(-keep);

/**
 * 풀이 1건 기록 + 하루 요약·개념 요약·학습자 총계·채점 통계 갱신.
 * (DynamoDB 는 여러 테이블을 묶는 트랜잭션 대신 항목마다 원자적 더하기(ADD)로 갱신한다)
 */
export async function insertAttempt(a: NewAttempt, ttlMs: number): Promise<number> {
  const at = a.createdAt ?? Date.now();
  const id = timeId(at);
  const xp = xpForAttempt(a);
  const quality = attemptQuality(a);
  const ttl = ttlFromNow(ttlMs, RECORD_EXTRA_SEC);
  const pk = sessionPk(a.sessionId);
  await putItem({
    pk,
    sk: `A#${pad(id)}`,
    id,
    questionId: a.questionId,
    codeItemId: a.codeItemId,
    questionType: a.questionType,
    concepts: a.concepts,
    level: a.level,
    correct: a.correct,
    partial: a.partial,
    hintsUsed: a.hintsUsed,
    timeMs: a.timeMs,
    misconception: a.misconception,
    gradedBy: a.gradedBy,
    answer: a.answer,
    createdAt: at,
    ttl,
  });
  await updateItem(pk, `D#${dayKey(at)}`, {
    set: { day: dayKey(at), ttl },
    add: { solved: 1, correct: a.correct ? 1 : 0, timeMs: a.timeMs, xp },
  });
  for (const concept of a.concepts) {
    const prev = await getItem<{ recentQuality?: number[]; recentResults?: boolean[] }>(pk, `C#${concept}`, true);
    await updateItem(pk, `C#${concept}`, {
      set: { concept, recentQuality: recent(prev?.recentQuality, quality, 5), recentResults: recent(prev?.recentResults, a.correct, 10), ttl },
      add: { attempts: 1, correct: a.correct ? 1 : 0, timeMs: a.timeMs },
    });
  }
  await updateItem(LEARNER, a.sessionId, { add: { xp, solved: 1 }, condition: "attribute_exists(pk)" });
  await updateItem("STATS", "GRADED", { add: { [a.gradedBy === "ai" ? "ai" : "rule"]: 1 } });
  return id;
}

interface AttemptItem extends Item {
  id: number;
  questionId: string;
  codeItemId: string;
  questionType: string;
  concepts: string[];
  level: number;
  correct: boolean;
  partial: boolean;
  hintsUsed: number;
  timeMs: number;
  misconception: string | null;
  gradedBy: string;
  answer: { text?: string };
  createdAt: number;
}

export async function listAttempts(sessionId: string): Promise<Attempt[]> {
  const rows = await queryAll<AttemptItem>(sessionPk(sessionId), { prefix: "A#" });
  return rows.map((r) => ({
    id: r.id,
    sessionId,
    questionId: r.questionId,
    codeItemId: r.codeItemId,
    questionType: r.questionType as QuestionType,
    concepts: r.concepts,
    level: r.level as Level,
    correct: !!r.correct,
    partial: !!r.partial,
    hintsUsed: r.hintsUsed,
    timeMs: r.timeMs,
    misconception: r.misconception ?? null,
    gradedBy: r.gradedBy as GradedBy,
    createdAt: r.createdAt,
  }));
}

export async function attemptCount(sessionId: string): Promise<number> {
  return (await queryAll(sessionPk(sessionId), { prefix: "A#" })).length;
}

export async function recentShortAnswers(sessionId: string, limit: number): Promise<{ questionId: string; text: string; correct: boolean }[]> {
  const rows = await queryAll<AttemptItem>(sessionPk(sessionId), { prefix: "A#", descending: true });
  return rows
    .filter((r) => r.questionType === "short_answer")
    .slice(0, limit)
    .map((r) => ({ questionId: r.questionId, text: r.answer?.text ?? "", correct: !!r.correct }));
}

export async function dailyActivity(sessionId: string): Promise<DailyActivity[]> {
  const rows = await queryAll<{ day: string; solved: number; correct: number; timeMs: number; xp: number }>(sessionPk(sessionId), { prefix: "D#" });
  return rows.map((r) => ({ day: r.day, solved: r.solved ?? 0, correct: r.correct ?? 0, timeMs: r.timeMs ?? 0, xp: r.xp ?? 0 }));
}

export async function conceptProgress(sessionId: string): Promise<ConceptProgressRow[]> {
  const rows = await queryAll<{ concept: string; attempts: number; correct: number; timeMs: number; recentQuality: number[]; recentResults: boolean[] }>(
    sessionPk(sessionId),
    { prefix: "C#" },
  );
  return rows.map((r) => ({
    concept: r.concept,
    attempts: r.attempts ?? 0,
    correct: r.correct ?? 0,
    timeMs: r.timeMs ?? 0,
    recentQuality: r.recentQuality ?? [],
    recentResults: r.recentResults ?? [],
  }));
}

export async function latestAnalysis<T>(sessionId: string): Promise<StoredAnalysis<T> | null> {
  const [row] = await queryAll<{ id: number; attemptCount: number; result: T; source: string; createdAt: number }>(sessionPk(sessionId), {
    prefix: "N#",
    descending: true,
    limit: 1,
  });
  return row ? { id: row.id, attemptCount: row.attemptCount, result: row.result, source: row.source as "ai" | "rule", createdAt: row.createdAt } : null;
}

export async function insertAnalysis(sessionId: string, attemptCount: number, result: unknown, source: "ai" | "rule", ttlMs: number) {
  const at = Date.now();
  const id = timeId(at);
  await putItem({ pk: sessionPk(sessionId), sk: `N#${pad(id)}`, id, attemptCount, result, source, createdAt: at, ttl: ttlFromNow(ttlMs, RECORD_EXTRA_SEC) });
}

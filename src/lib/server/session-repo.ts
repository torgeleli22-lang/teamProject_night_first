import crypto from "node:crypto";
import { attemptQuality, dayKey, xpForAttempt } from "../learner/stats";
import type { Answer, Attempt, ConceptId, GradedBy, Level, QuestionType } from "../types";
import { getDb, useDynamo } from "./db";
import * as D from "./dynamo/session";

/**
 * ② 사용자(세션) 그룹과 ③ 학습 기록 그룹을 다루는 저장소.
 * 지금은 로그인이 없으므로 브라우저 탭의 세션 하나가 사용자 한 명이다.
 * 세션 id 는 브라우저의 sessionStorage 에만 있어서 창(탭)을 닫으면 사라지고,
 * 서버의 기록도 일정 시간 쓰이지 않으면 자동으로 지운다.
 */

/** 마지막 사용 후 이 시간이 지나면 세션과 학습 기록을 모두 삭제 */
export const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS ?? 12) * 3600_000;

export interface SessionInfo {
  id: string;
  /** 랭킹에 보이는 이름 (자동 생성, 바꿀 수 있음) */
  nickname: string;
  preferredLevel: Level | null;
  dailyGoal: number;
  createdAt: number;
}

let lastPurge = 0;

/** 만료된 세션 삭제 (학습 기록·요약·분석은 ON DELETE CASCADE 로 함께 삭제). 인스턴스마다 10분에 한 번만 */
export async function purgeExpiredSessions(now = Date.now()) {
  if (useDynamo()) return; // DynamoDB 는 TTL 이 자동으로 지운다
  if (now - lastPurge < 10 * 60_000) return;
  lastPurge = now;
  await (await getDb()).run("DELETE FROM sessions WHERE last_seen_at < ?", [now - SESSION_TTL_MS]);
}

/** 세션 id 형식: 서버가 만든 UUID 만 받는다 */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 같은 곳(IP)에서 새 학습자를 너무 많이 만들 때 */
export class SessionLimitError extends Error {
  constructor() {
    super("새로 시작하는 요청이 너무 많아요. 잠시 뒤(최대 1시간)에 다시 시도해 주세요.");
  }
}

/**
 * 요청마다 호출: 알려진 세션이면 마지막 사용 시각을 갱신하고, 없거나 만료됐으면 새 세션을 만든다.
 * (클라이언트가 보낸 임의의 id 로 세션을 만들지 않는다)
 * canCreate 가 false 를 돌려주면 새 세션을 만들지 않고 SessionLimitError.
 */
export async function touchSession(id: string | null, canCreate: () => boolean | Promise<boolean> = () => true): Promise<SessionInfo> {
  if (useDynamo()) return D.touchSession(id, !!id && SESSION_ID.test(id), SESSION_TTL_MS, canCreate, randomNickname, () => new SessionLimitError());
  await purgeExpiredSessions();
  const db = await getDb();
  const now = Date.now();
  if (id && SESSION_ID.test(id) && (await db.run("UPDATE sessions SET last_seen_at = ? WHERE id = ?", [now, id])) > 0) {
    const row = await db.get<SessionRow>("SELECT * FROM sessions WHERE id = ?", [id]);
    if (row) return toSession(row);
  }
  if (!(await canCreate())) throw new SessionLimitError();
  const fresh = crypto.randomUUID();
  await db.run("INSERT INTO sessions (id, nickname, created_at, last_seen_at) VALUES (?, ?, ?, ?)", [fresh, randomNickname(), now, now]);
  return toSession((await db.get<SessionRow>("SELECT * FROM sessions WHERE id = ?", [fresh]))!);
}

interface SessionRow {
  id: string;
  nickname: string;
  preferred_level: number | null;
  daily_goal: number;
  created_at: number;
}

const toSession = (row: SessionRow): SessionInfo => ({
  id: row.id,
  nickname: row.nickname,
  preferredLevel: (row.preferred_level as Level) ?? null,
  dailyGoal: row.daily_goal,
  createdAt: row.created_at,
});

const ADJECTIVES = ["성실한", "호기심 많은", "차분한", "부지런한", "용감한", "꼼꼼한", "즐거운", "끈기 있는", "반짝이는", "느긋한"];
const ANIMALS = ["고양이", "판다", "수달", "펭귄", "다람쥐", "고래", "여우", "부엉이", "코알라", "햄스터"];

export function randomNickname(): string {
  const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)} ${Math.floor(Math.random() * 90) + 10}`;
}

export async function setNickname(id: string, nickname: string) {
  if (useDynamo()) return D.setNickname(id, nickname);
  await (await getDb()).run("UPDATE sessions SET nickname = ? WHERE id = ?", [nickname, id]);
}

export async function setPreferredLevel(id: string, level: Level) {
  if (useDynamo()) return D.setPreferredLevel(id, level);
  await (await getDb()).run("UPDATE sessions SET preferred_level = ? WHERE id = ?", [level, id]);
}

export async function resetSession(id: string) {
  if (useDynamo()) return D.resetSession(id);
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const table of ["attempts", "daily_activity", "concept_progress", "analyses"]) {
      await tx.run(`DELETE FROM ${table} WHERE session_id = ?`, [id]);
    }
    await tx.run("UPDATE sessions SET preferred_level = NULL WHERE id = ?", [id]);
  });
}

// ───────────────────────── 랭킹 ─────────────────────────

/** 다른 사람의 세션 id 는 곧 그 사람의 '열쇠'이므로 응답에 넣지 않고 나인지 여부만 보낸다 */
export interface RankRow {
  nickname: string;
  xp: number;
  solved: number;
  rank: number;
  isMe: boolean;
}

/**
 * 지금 참여 중인 세션(최근 SESSION_TTL 안에 사용) 가운데 XP 순위.
 * 하루 요약 테이블(daily_activity)의 XP 합계만 읽는다. 문제를 1개 이상 푼 세션만 집계.
 */
export async function ranking(meId: string, limit = 10): Promise<{ top: RankRow[]; total: number }> {
  if (useDynamo()) return D.ranking(meId, limit);
  const db = await getDb();
  const rows = await db.all<{ session_id: string; nickname: string; xp: number; solved: number; rank: number }>(
    `SELECT s.id AS session_id, s.nickname, CAST(SUM(d.xp) AS INTEGER) AS xp, CAST(SUM(d.solved) AS INTEGER) AS solved,
            CAST(RANK() OVER (ORDER BY SUM(d.xp) DESC) AS INTEGER) AS rank
     FROM daily_activity d JOIN sessions s ON s.id = d.session_id
     GROUP BY s.id, s.nickname, s.created_at HAVING SUM(d.solved) > 0
     ORDER BY xp DESC, s.created_at ASC LIMIT ?`,
    [limit],
  );
  const total = await db.get<{ n: number }>(
    "SELECT CAST(COUNT(*) AS INTEGER) AS n FROM (SELECT session_id FROM daily_activity GROUP BY session_id HAVING SUM(solved) > 0) t",
  );
  return { top: rows.map((r) => ({ nickname: r.nickname, xp: r.xp, solved: r.solved, rank: r.rank, isMe: r.session_id === meId })), total: total?.n ?? 0 };
}

/** 내 등수: 나보다 XP 가 많은 세션 수 + 1. 바로 위 등수와의 XP 차이도 함께 */
export async function myRank(sessionId: string): Promise<{ rank: number; xp: number; nextXp: number | null } | null> {
  if (useDynamo()) return D.myRank(sessionId);
  const db = await getDb();
  const mine = await db.get<{ xp: number | null; solved: number | null }>(
    "SELECT CAST(SUM(xp) AS INTEGER) AS xp, CAST(SUM(solved) AS INTEGER) AS solved FROM daily_activity WHERE session_id = ?",
    [sessionId],
  );
  if (!mine?.solved) return null;
  const xp = mine.xp ?? 0;
  const above = await db.get<{ n: number; next: number | null }>(
    `SELECT CAST(COUNT(*) AS INTEGER) AS n, CAST(MIN(t) AS INTEGER) AS next
     FROM (SELECT SUM(xp) AS t FROM daily_activity GROUP BY session_id HAVING SUM(solved) > 0 AND SUM(xp) > ?) a`,
    [xp],
  );
  return { rank: (above?.n ?? 0) + 1, xp, nextXp: above?.next ?? null };
}

/** 데모용 가상 참가자 (랭킹 화면 확인용). is_demo = 1 로 표시해 따로 지울 수 있다 */
export async function seedDemoPeers(count: number) {
  if (useDynamo()) return D.seedDemoPeers(count, SESSION_TTL_MS, randomNickname);
  const db = await getDb();
  const now = Date.now();
  await db.transaction(async (tx) => {
    for (let i = 0; i < count; i++) {
      const id = crypto.randomUUID();
      // XP 분포: 대부분 낮고 일부만 높게 (실제 학습자 분포처럼)
      const xp = Math.round(20 + Math.pow(Math.random(), 2.2) * 600);
      const solved = Math.max(1, Math.round(xp / 11));
      await tx.run("INSERT INTO sessions (id, nickname, is_demo, created_at, last_seen_at) VALUES (?, ?, 1, ?, ?)", [id, randomNickname(), now, now]);
      await tx.run("INSERT INTO daily_activity (session_id, day, solved, correct, time_ms, xp) VALUES (?, ?, ?, ?, ?, ?)", [
        id,
        dayKey(now),
        solved,
        Math.round(solved * 0.7),
        solved * 30_000,
        xp,
      ]);
    }
  });
}

export async function removeDemoPeers() {
  if (useDynamo()) return D.removeDemoPeers();
  await (await getDb()).run("DELETE FROM sessions WHERE is_demo = 1");
}

// ───────────────────────── 풀이 기록 + 요약 갱신 ─────────────────────────

export interface NewAttempt {
  sessionId: string;
  questionId: string;
  codeItemId: string;
  questionType: QuestionType;
  concepts: ConceptId[];
  level: Level;
  correct: boolean;
  partial: boolean;
  hintsUsed: number;
  timeMs: number;
  misconception: string | null;
  gradedBy: GradedBy;
  answer: Answer;
  /** 데모 데이터용: 과거 시점으로 기록 */
  createdAt?: number;
}

const pushRecent = <T>(json: string, value: T, keep: number): string => JSON.stringify([...(JSON.parse(json) as T[]), value].slice(-keep));

/**
 * 풀이 1건을 기록하면서 캘린더(하루 요약)와 개념별 이해도 요약을 같은 트랜잭션에서 갱신한다.
 * 화면은 요약 테이블만 읽으므로 기록이 쌓여도 느려지지 않는다.
 */
export async function insertAttempt(a: NewAttempt): Promise<number> {
  if (useDynamo()) return D.insertAttempt(a, SESSION_TTL_MS);
  const db = await getDb();
  const at = a.createdAt ?? Date.now();
  const xp = xpForAttempt(a);
  const quality = attemptQuality(a);
  return db.transaction(async (tx) => {
    const id = await tx.insert(
      `INSERT INTO attempts (session_id, question_id, code_item_id, question_type, concepts, level, correct, partial, hints_used, time_ms, misconception, graded_by, answer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.sessionId, a.questionId, a.codeItemId, a.questionType, JSON.stringify(a.concepts), a.level, a.correct, a.partial, a.hintsUsed, a.timeMs, a.misconception, a.gradedBy, JSON.stringify(a.answer), at],
    );
    await tx.run(
      `INSERT INTO daily_activity (session_id, day, solved, correct, time_ms, xp) VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(session_id, day) DO UPDATE SET solved = daily_activity.solved + 1, correct = daily_activity.correct + excluded.correct,
         time_ms = daily_activity.time_ms + excluded.time_ms, xp = daily_activity.xp + excluded.xp`,
      [a.sessionId, dayKey(at), a.correct, a.timeMs, xp],
    );
    for (const concept of a.concepts) {
      const prev = (await tx.get<{ recent_quality: string; recent_results: string }>(
        "SELECT recent_quality, recent_results FROM concept_progress WHERE session_id = ? AND concept = ?",
        [a.sessionId, concept],
      )) ?? { recent_quality: "[]", recent_results: "[]" };
      await tx.run(
        `INSERT INTO concept_progress (session_id, concept, attempts, correct, time_ms, recent_quality, recent_results) VALUES (?, ?, 1, ?, ?, ?, ?)
         ON CONFLICT(session_id, concept) DO UPDATE SET attempts = concept_progress.attempts + 1, correct = concept_progress.correct + excluded.correct,
           time_ms = concept_progress.time_ms + excluded.time_ms, recent_quality = excluded.recent_quality, recent_results = excluded.recent_results`,
        [a.sessionId, concept, a.correct, a.timeMs, pushRecent(prev.recent_quality, quality, 5), pushRecent(prev.recent_results, a.correct, 10)],
      );
    }
    return id;
  });
}

interface AttemptRow {
  id: number;
  session_id: string;
  question_id: string;
  code_item_id: string;
  question_type: string;
  concepts: string;
  level: number;
  correct: number;
  partial: number;
  hints_used: number;
  time_ms: number;
  misconception: string | null;
  graded_by: string;
  created_at: number;
}

/** 세션의 풀이 기록 (세션 단위라 양이 많지 않다) */
export async function listAttempts(sessionId: string): Promise<Attempt[]> {
  if (useDynamo()) return D.listAttempts(sessionId);
  const rows = await (await getDb()).all<AttemptRow>(
    `SELECT id, session_id, question_id, code_item_id, question_type, concepts, level, correct, partial, hints_used, time_ms, misconception, graded_by, created_at
     FROM attempts WHERE session_id = ? ORDER BY created_at ASC, id ASC`,
    [sessionId],
  );
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    questionId: r.question_id,
    codeItemId: r.code_item_id,
    questionType: r.question_type as QuestionType,
    concepts: JSON.parse(r.concepts),
    level: r.level as Level,
    correct: r.correct === 1,
    partial: r.partial === 1,
    hintsUsed: r.hints_used,
    timeMs: r.time_ms,
    misconception: r.misconception,
    gradedBy: r.graded_by as GradedBy,
    createdAt: r.created_at,
  }));
}

export async function attemptCount(sessionId: string): Promise<number> {
  if (useDynamo()) return D.attemptCount(sessionId);
  return (await (await getDb()).get<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM attempts WHERE session_id = ?", [sessionId]))?.n ?? 0;
}

/** 주관식 답변 원문 (AI 학습자 분석 재료) */
export async function recentShortAnswers(sessionId: string, limit = 5): Promise<{ questionId: string; text: string; correct: boolean }[]> {
  if (useDynamo()) return D.recentShortAnswers(sessionId, limit);
  const rows = await (await getDb()).all<{ question_id: string; answer: string; correct: number }>(
    "SELECT question_id, answer, correct FROM attempts WHERE session_id = ? AND question_type = 'short_answer' ORDER BY created_at DESC LIMIT ?",
    [sessionId, limit],
  );
  return rows.map((r) => ({ questionId: r.question_id, text: (JSON.parse(r.answer) as { text: string }).text, correct: r.correct === 1 }));
}

// ───────────────────────── 요약 테이블 읽기 ─────────────────────────

export interface DailyActivity {
  day: string;
  solved: number;
  correct: number;
  timeMs: number;
  xp: number;
}

export async function dailyActivity(sessionId: string): Promise<DailyActivity[]> {
  if (useDynamo()) return D.dailyActivity(sessionId);
  const rows = await (await getDb()).all<{ day: string; solved: number; correct: number; time_ms: number; xp: number }>(
    "SELECT day, solved, correct, time_ms, xp FROM daily_activity WHERE session_id = ? ORDER BY day",
    [sessionId],
  );
  return rows.map((r) => ({ day: r.day, solved: r.solved, correct: r.correct, timeMs: r.time_ms, xp: r.xp }));
}

export interface ConceptProgressRow {
  concept: ConceptId;
  attempts: number;
  correct: number;
  timeMs: number;
  recentQuality: number[];
  recentResults: boolean[];
}

export async function conceptProgress(sessionId: string): Promise<ConceptProgressRow[]> {
  if (useDynamo()) return D.conceptProgress(sessionId);
  const rows = await (await getDb()).all<{
    concept: string;
    attempts: number;
    correct: number;
    time_ms: number;
    recent_quality: string;
    recent_results: string;
  }>("SELECT concept, attempts, correct, time_ms, recent_quality, recent_results FROM concept_progress WHERE session_id = ?", [sessionId]);
  return rows.map((r) => ({
    concept: r.concept,
    attempts: r.attempts,
    correct: r.correct,
    timeMs: r.time_ms,
    recentQuality: JSON.parse(r.recent_quality),
    recentResults: JSON.parse(r.recent_results),
  }));
}

// ───────────────────────── AI 학습 분석 ─────────────────────────

export interface StoredAnalysis<T> {
  id: number;
  attemptCount: number;
  result: T;
  source: "ai" | "rule";
  createdAt: number;
}

export async function latestAnalysis<T>(sessionId: string): Promise<StoredAnalysis<T> | null> {
  if (useDynamo()) return D.latestAnalysis<T>(sessionId);
  const row = await (await getDb()).get<{ id: number; attempt_count: number; result: string; source: string; created_at: number }>(
    "SELECT id, attempt_count, result, source, created_at FROM analyses WHERE session_id = ? ORDER BY id DESC LIMIT 1",
    [sessionId],
  );
  return row ? { id: row.id, attemptCount: row.attempt_count, result: JSON.parse(row.result), source: row.source as "ai" | "rule", createdAt: row.created_at } : null;
}

export async function insertAnalysis(sessionId: string, attemptCount: number, result: unknown, source: "ai" | "rule") {
  if (useDynamo()) return D.insertAnalysis(sessionId, attemptCount, result, source, SESSION_TTL_MS);
  await (await getDb()).run("INSERT INTO analyses (session_id, attempt_count, result, source, created_at) VALUES (?, ?, ?, ?, ?)", [
    sessionId,
    attemptCount,
    JSON.stringify(result),
    source,
    Date.now(),
  ]);
}

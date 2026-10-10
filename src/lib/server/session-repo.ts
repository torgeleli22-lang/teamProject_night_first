import "server-only";
import { attemptQuality, dayKey, xpForAttempt } from "../learner/stats";
import type { Answer, Attempt, ConceptId, GradedBy, Level, QuestionType } from "../types";
import { getDb } from "./db";

/**
 * ② 사용자(세션) 그룹과 ③ 학습 기록 그룹을 다루는 저장소.
 * 지금은 로그인이 없으므로 브라우저 세션 하나가 사용자 한 명이다.
 * 세션 쿠키는 브라우저를 닫으면 사라지고, 서버의 기록도 일정 시간 뒤 자동으로 지운다.
 */

/** 마지막 사용 후 이 시간이 지나면 세션과 학습 기록을 모두 삭제 */
export const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS ?? 12) * 3600_000;

export interface SessionInfo {
  id: string;
  preferredLevel: Level | null;
  dailyGoal: number;
  createdAt: number;
}

let lastPurge = 0;

/** 만료된 세션 삭제 (학습 기록·요약·분석은 ON DELETE CASCADE 로 함께 삭제). 10분에 한 번만 실행 */
export function purgeExpiredSessions(now = Date.now()) {
  if (now - lastPurge < 10 * 60_000) return;
  lastPurge = now;
  getDb().prepare("DELETE FROM sessions WHERE last_seen_at < ?").run(now - SESSION_TTL_MS);
}

/** 요청마다 호출: 세션이 없으면 만들고, 마지막 사용 시각을 갱신 */
export function touchSession(id: string): SessionInfo {
  purgeExpiredSessions();
  const db = getDb();
  const now = Date.now();
  db.prepare(
    "INSERT INTO sessions (id, created_at, last_seen_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at",
  ).run(id, now, now);
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as {
    id: string;
    preferred_level: number | null;
    daily_goal: number;
    created_at: number;
  };
  return { id: row.id, preferredLevel: (row.preferred_level as Level) ?? null, dailyGoal: row.daily_goal, createdAt: row.created_at };
}

export function setPreferredLevel(id: string, level: Level) {
  getDb().prepare("UPDATE sessions SET preferred_level = ? WHERE id = ?").run(level, id);
}

export function resetSession(id: string) {
  const db = getDb();
  for (const table of ["attempts", "daily_activity", "concept_progress", "analyses"]) {
    db.prepare(`DELETE FROM ${table} WHERE session_id = ?`).run(id);
  }
  db.prepare("UPDATE sessions SET preferred_level = NULL WHERE id = ?").run(id);
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
export function insertAttempt(a: NewAttempt): number {
  const db = getDb();
  const at = a.createdAt ?? Date.now();
  const xp = xpForAttempt(a);
  const quality = attemptQuality(a);
  db.exec("BEGIN");
  try {
    const result = db
      .prepare(
        `INSERT INTO attempts (session_id, question_id, code_item_id, question_type, concepts, level, correct, partial, hints_used, time_ms, misconception, graded_by, answer, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(a.sessionId, a.questionId, a.codeItemId, a.questionType, JSON.stringify(a.concepts), a.level, a.correct ? 1 : 0, a.partial ? 1 : 0, a.hintsUsed, a.timeMs, a.misconception, a.gradedBy, JSON.stringify(a.answer), at);

    db.prepare(
      `INSERT INTO daily_activity (session_id, day, solved, correct, time_ms, xp) VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(session_id, day) DO UPDATE SET solved = solved + 1, correct = correct + excluded.correct,
         time_ms = time_ms + excluded.time_ms, xp = xp + excluded.xp`,
    ).run(a.sessionId, dayKey(at), a.correct ? 1 : 0, a.timeMs, xp);

    const getProgress = db.prepare("SELECT recent_quality, recent_results FROM concept_progress WHERE session_id = ? AND concept = ?");
    const upsertProgress = db.prepare(
      `INSERT INTO concept_progress (session_id, concept, attempts, correct, time_ms, recent_quality, recent_results) VALUES (?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(session_id, concept) DO UPDATE SET attempts = attempts + 1, correct = correct + excluded.correct,
         time_ms = time_ms + excluded.time_ms, recent_quality = excluded.recent_quality, recent_results = excluded.recent_results`,
    );
    for (const concept of a.concepts) {
      const prev = (getProgress.get(a.sessionId, concept) as { recent_quality: string; recent_results: string } | undefined) ?? {
        recent_quality: "[]",
        recent_results: "[]",
      };
      upsertProgress.run(a.sessionId, concept, a.correct ? 1 : 0, a.timeMs, pushRecent(prev.recent_quality, quality, 5), pushRecent(prev.recent_results, a.correct, 10));
    }
    db.exec("COMMIT");
    return Number(result.lastInsertRowid);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
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
export function listAttempts(sessionId: string): Attempt[] {
  const rows = getDb()
    .prepare("SELECT * FROM attempts WHERE session_id = ? ORDER BY created_at ASC, id ASC")
    .all(sessionId) as unknown as AttemptRow[];
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

export function attemptCount(sessionId: string): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM attempts WHERE session_id = ?").get(sessionId) as { n: number }).n;
}

/** 주관식 답변 원문 (AI 학습자 분석 재료) */
export function recentShortAnswers(sessionId: string, limit = 5): { questionId: string; text: string; correct: boolean }[] {
  const rows = getDb()
    .prepare("SELECT question_id, answer, correct FROM attempts WHERE session_id = ? AND question_type = 'short_answer' ORDER BY created_at DESC LIMIT ?")
    .all(sessionId, limit) as { question_id: string; answer: string; correct: number }[];
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

export function dailyActivity(sessionId: string): DailyActivity[] {
  return (
    getDb().prepare("SELECT day, solved, correct, time_ms, xp FROM daily_activity WHERE session_id = ? ORDER BY day").all(sessionId) as {
      day: string;
      solved: number;
      correct: number;
      time_ms: number;
      xp: number;
    }[]
  ).map((r) => ({ day: r.day, solved: r.solved, correct: r.correct, timeMs: r.time_ms, xp: r.xp }));
}

export interface ConceptProgressRow {
  concept: ConceptId;
  attempts: number;
  correct: number;
  timeMs: number;
  recentQuality: number[];
  recentResults: boolean[];
}

export function conceptProgress(sessionId: string): ConceptProgressRow[] {
  return (
    getDb().prepare("SELECT * FROM concept_progress WHERE session_id = ?").all(sessionId) as {
      concept: string;
      attempts: number;
      correct: number;
      time_ms: number;
      recent_quality: string;
      recent_results: string;
    }[]
  ).map((r) => ({
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

export function latestAnalysis<T>(sessionId: string): StoredAnalysis<T> | null {
  const row = getDb().prepare("SELECT * FROM analyses WHERE session_id = ? ORDER BY id DESC LIMIT 1").get(sessionId) as
    | { id: number; attempt_count: number; result: string; source: string; created_at: number }
    | undefined;
  return row ? { id: row.id, attemptCount: row.attempt_count, result: JSON.parse(row.result), source: row.source as "ai" | "rule", createdAt: row.created_at } : null;
}

export function insertAnalysis(sessionId: string, attemptCount: number, result: unknown, source: "ai" | "rule") {
  getDb()
    .prepare("INSERT INTO analyses (session_id, attempt_count, result, source, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(sessionId, attemptCount, JSON.stringify(result), source, Date.now());
}

import "server-only";
import type { Answer, Attempt, ConceptId, GradedBy, Level, QuestionType } from "../types";
import { getDb } from "./db";

export interface Learner {
  id: string;
  preferredLevel: Level | null;
  dailyGoal: number;
  createdAt: number;
}

export function ensureLearner(id: string): Learner {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO learners (id, created_at) VALUES (?, ?)").run(id, Date.now());
  const row = db.prepare("SELECT * FROM learners WHERE id = ?").get(id) as {
    id: string;
    preferred_level: number | null;
    daily_goal: number;
    created_at: number;
  };
  return { id: row.id, preferredLevel: (row.preferred_level as Level) ?? null, dailyGoal: row.daily_goal, createdAt: row.created_at };
}

export function setPreferredLevel(id: string, level: Level) {
  ensureLearner(id);
  getDb().prepare("UPDATE learners SET preferred_level = ? WHERE id = ?").run(level, id);
}

export interface NewAttempt {
  learnerId: string;
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
}

export function insertAttempt(a: NewAttempt): number {
  const result = getDb()
    .prepare(
      `INSERT INTO attempts (learner_id, question_id, code_item_id, question_type, concepts, level, correct, partial, hints_used, time_ms, misconception, graded_by, answer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      a.learnerId,
      a.questionId,
      a.codeItemId,
      a.questionType,
      JSON.stringify(a.concepts),
      a.level,
      a.correct ? 1 : 0,
      a.partial ? 1 : 0,
      a.hintsUsed,
      a.timeMs,
      a.misconception,
      a.gradedBy,
      JSON.stringify(a.answer),
      Date.now(),
    );
  return Number(result.lastInsertRowid);
}

interface AttemptRow {
  id: number;
  learner_id: string;
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

export function listAttempts(learnerId: string): Attempt[] {
  const rows = getDb()
    .prepare("SELECT * FROM attempts WHERE learner_id = ? ORDER BY created_at ASC, id ASC")
    .all(learnerId) as unknown as AttemptRow[];
  return rows.map((r) => ({
    id: r.id,
    learnerId: r.learner_id,
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

/** 주관식 답변 원문 (AI 학습자 분석 재료) */
export function recentShortAnswers(learnerId: string, limit = 5): { questionId: string; text: string; correct: boolean }[] {
  const rows = getDb()
    .prepare(
      "SELECT question_id, answer, correct FROM attempts WHERE learner_id = ? AND question_type = 'short_answer' ORDER BY created_at DESC LIMIT ?",
    )
    .all(learnerId, limit) as { question_id: string; answer: string; correct: number }[];
  return rows.map((r) => ({ questionId: r.question_id, text: (JSON.parse(r.answer) as { text: string }).text, correct: r.correct === 1 }));
}

export function resetLearner(learnerId: string) {
  const db = getDb();
  db.prepare("DELETE FROM attempts WHERE learner_id = ?").run(learnerId);
  db.prepare("DELETE FROM analyses WHERE learner_id = ?").run(learnerId);
  db.prepare("UPDATE learners SET preferred_level = NULL WHERE id = ?").run(learnerId);
}

// ───────────────────────── AI 학습자 분석 ─────────────────────────

export interface StoredAnalysis<T> {
  id: number;
  attemptCount: number;
  result: T;
  source: "ai" | "rule";
  createdAt: number;
}

export function latestAnalysis<T>(learnerId: string): StoredAnalysis<T> | null {
  const row = getDb()
    .prepare("SELECT * FROM analyses WHERE learner_id = ? ORDER BY id DESC LIMIT 1")
    .get(learnerId) as { id: number; attempt_count: number; result: string; source: string; created_at: number } | undefined;
  return row
    ? { id: row.id, attemptCount: row.attempt_count, result: JSON.parse(row.result), source: row.source as "ai" | "rule", createdAt: row.created_at }
    : null;
}

export function insertAnalysis(learnerId: string, attemptCount: number, result: unknown, source: "ai" | "rule") {
  getDb()
    .prepare("INSERT INTO analyses (learner_id, attempt_count, result, source, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(learnerId, attemptCount, JSON.stringify(result), source, Date.now());
}

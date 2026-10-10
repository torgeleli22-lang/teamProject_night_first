import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildSeed } from "../content/seed";

/**
 * 문제 DB + 학습 기록 DB (SQLite, Node 내장 node:sqlite).
 * - code_items / questions: 미리 만들어 둔 학습 콘텐츠 (시드 + AI 생성)
 * - sessions: 로그인 없는 브라우저 세션 (일정 시간 쓰지 않으면 학습 기록과 함께 삭제)
 * - attempts / daily_activity / concept_progress / analyses: 세션의 학습 기록과 요약
 * - generation_jobs: AI 콘텐츠 생성 요청과 검증 결과
 * - ai_usage: AI 호출 기록 (비용 관리)
 */
const SCHEMA = `
-- ───────────── ① 문제 그룹: 모든 사용자가 함께 읽는 콘텐츠 ─────────────
CREATE TABLE IF NOT EXISTS code_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  code TEXT NOT NULL,
  concepts TEXT NOT NULL,
  level INTEGER NOT NULL,
  factors TEXT NOT NULL,
  output TEXT,
  runnable INTEGER NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  validation TEXT,
  job_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  code_item_id TEXT NOT NULL REFERENCES code_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_item ON questions(code_item_id);

-- ───────────── ② 사용자 그룹: 지금은 로그인 없이 브라우저 세션 단위 ─────────────
-- (로그인을 붙이면 users 테이블을 추가하고 세션을 계정에 연결한다)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  preferred_level INTEGER,
  daily_goal INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_seen ON sessions(last_seen_at);

-- ───────────── ③ 학습 기록 그룹: 세션이 끝나면 함께 삭제 ─────────────
-- 문제 풀이 기록 (이전 문제 피하기, 틀린 문제 다시 내기, 상세 기록)
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  code_item_id TEXT NOT NULL,
  question_type TEXT NOT NULL,
  concepts TEXT NOT NULL,
  level INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  partial INTEGER NOT NULL DEFAULT 0,
  hints_used INTEGER NOT NULL DEFAULT 0,
  time_ms INTEGER NOT NULL DEFAULT 0,
  misconception TEXT,
  graded_by TEXT NOT NULL,
  answer TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_session ON attempts(session_id, created_at);
-- 캘린더용 하루 요약 (세션 × 날짜당 1줄): 캘린더·연속 학습·오늘의 목표는 이것만 읽는다
CREATE TABLE IF NOT EXISTS daily_activity (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  solved INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  time_ms INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, day)
);
-- 개념별 이해도 요약 (세션 × 개념당 1줄): 풀 때마다 그 줄만 갱신하고 전체 기록을 다시 계산하지 않는다
CREATE TABLE IF NOT EXISTS concept_progress (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  time_ms INTEGER NOT NULL DEFAULT 0,
  recent_quality TEXT NOT NULL DEFAULT '[]',
  recent_results TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (session_id, concept)
);
-- 10문제마다 하는 AI 학습 분석
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  attempt_count INTEGER NOT NULL,
  result TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS analyses_session ON analyses(session_id, created_at);

-- ───────────── 운영 그룹: 콘텐츠 생성과 비용 관리 (개인 기록 아님) ─────────────
CREATE TABLE IF NOT EXISTS generation_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concept TEXT NOT NULL,
  level INTEGER NOT NULL,
  status TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'manual',
  reason TEXT NOT NULL,
  session_id TEXT,
  mock INTEGER NOT NULL DEFAULT 0,
  item_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
-- 칸(개념 × 난이도)을 다 푼 세션 수 — 생성 기준의 '수요'. 문제 내용이나 답은 저장하지 않는다
CREATE TABLE IF NOT EXISTS demand_signals (
  concept TEXT NOT NULL,
  level INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS demand_cell ON demand_signals(concept, level, created_at);
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`;

const globalForDb = globalThis as unknown as { __codereadingDb?: DatabaseSync };

function open(): DatabaseSync {
  const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrateLegacy(db);
  db.exec(SCHEMA);
  syncSeed(db);
  return db;
}

/**
 * 예전 구조(익명 쿠키 learners)로 만들어진 개발용 DB 정리.
 * 학습 기록은 세션 단위로 바뀌었으므로 예전 기록 테이블은 지우고 새로 만든다 (콘텐츠는 유지).
 */
function migrateLegacy(db: DatabaseSync) {
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
  const has = (table: string, column: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
  if (tables.includes("learners")) {
    db.exec("DROP TABLE IF EXISTS attempts; DROP TABLE IF EXISTS analyses; DROP TABLE IF EXISTS demand_signals; DROP TABLE learners;");
  }
  if (tables.includes("generation_jobs")) {
    if (!has("generation_jobs", "trigger")) db.exec("ALTER TABLE generation_jobs ADD COLUMN trigger TEXT NOT NULL DEFAULT 'manual'");
    if (!has("generation_jobs", "mock")) db.exec("ALTER TABLE generation_jobs ADD COLUMN mock INTEGER NOT NULL DEFAULT 0");
    if (has("generation_jobs", "learner_id")) db.exec("ALTER TABLE generation_jobs RENAME COLUMN learner_id TO session_id");
    else if (!has("generation_jobs", "session_id")) db.exec("ALTER TABLE generation_jobs ADD COLUMN session_id TEXT");
  }
}

/** 코드에 들어 있는 시드 콘텐츠를 DB 와 동기화한다 (AI 생성 콘텐츠는 건드리지 않음) */
function syncSeed(db: DatabaseSync) {
  const { items, questions } = buildSeed(Date.now());
  const upsertItem = db.prepare(`
    INSERT INTO code_items (id, title, code, concepts, level, factors, output, runnable, source, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seed', 'published', ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, code = excluded.code, concepts = excluded.concepts,
      level = excluded.level, factors = excluded.factors, output = excluded.output, runnable = excluded.runnable`);
  const upsertQuestion = db.prepare(`
    INSERT INTO questions (id, code_item_id, type, payload) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET code_item_id = excluded.code_item_id, type = excluded.type, payload = excluded.payload`);
  db.exec("BEGIN");
  try {
    for (const i of items) {
      upsertItem.run(i.id, i.title, i.code, JSON.stringify(i.concepts), i.level, JSON.stringify(i.factors), i.output, i.runnable ? 1 : 0, i.createdAt);
    }
    for (const q of questions) upsertQuestion.run(q.id, q.codeItemId, q.type, JSON.stringify(q));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function getDb(): DatabaseSync {
  // 개발 모드의 핫 리로드에서도 연결을 하나만 유지
  globalForDb.__codereadingDb ??= open();
  return globalForDb.__codereadingDb;
}

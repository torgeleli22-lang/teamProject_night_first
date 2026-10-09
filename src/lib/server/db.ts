import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildSeed } from "../content/seed";

/**
 * 문제 DB + 학습 기록 DB (SQLite, Node 내장 node:sqlite).
 * - code_items / questions: 미리 만들어 둔 학습 콘텐츠 (시드 + AI 생성)
 * - attempts: 문제 풀이 기록 (정답, 시간, 힌트, 채점 주체)
 * - analyses: 일정 문제 수마다 수행한 AI 학습자 분석
 * - generation_jobs: AI 콘텐츠 생성 요청과 검증 결과
 * - ai_usage: AI 호출 기록 (비용 관리)
 */
const SCHEMA = `
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
CREATE TABLE IF NOT EXISTS learners (
  id TEXT PRIMARY KEY,
  preferred_level INTEGER,
  daily_goal INTEGER NOT NULL DEFAULT 5,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS attempts_learner ON attempts(learner_id, created_at);
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,
  result TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS analyses_learner ON analyses(learner_id, created_at);
CREATE TABLE IF NOT EXISTS generation_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concept TEXT NOT NULL,
  level INTEGER NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  item_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS demand_signals (
  concept TEXT NOT NULL,
  level INTEGER NOT NULL,
  learner_id TEXT NOT NULL,
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
  db.exec(SCHEMA);
  migrate(db);
  syncSeed(db);
  return db;
}

/** 이미 만들어진 DB 에 새 컬럼 추가 */
function migrate(db: DatabaseSync) {
  const has = (table: string, column: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
  if (!has("generation_jobs", "trigger")) db.exec("ALTER TABLE generation_jobs ADD COLUMN trigger TEXT NOT NULL DEFAULT 'manual'");
  if (!has("generation_jobs", "learner_id")) db.exec("ALTER TABLE generation_jobs ADD COLUMN learner_id TEXT");
  if (!has("generation_jobs", "mock")) db.exec("ALTER TABLE generation_jobs ADD COLUMN mock INTEGER NOT NULL DEFAULT 0");
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

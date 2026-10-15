import type { Dialect } from "./types";

/**
 * 테이블은 목적별로 나눈다.
 * ① 문제: code_items, questions — 모든 사용자가 함께 읽는 콘텐츠 (시드 + AI 생성). code_items 한 줄 = 코드 학습의 코드 하나 또는 개념 학습의 주제 묶음 하나
 * ② 사용자: sessions — 로그인 없는 브라우저 세션 (일정 시간 쓰지 않으면 학습 기록과 함께 삭제)
 * ③ 학습 기록: attempts, daily_activity, concept_progress, analyses — 세션이 지워지면 함께 삭제
 * ④ 운영: generation_jobs, demand_signals, ai_usage, app_meta — 콘텐츠 생성과 비용 관리 (개인 기록 아님)
 *
 * SQLite 와 PostgreSQL 이 같은 구조를 쓰도록 자동 증가 id 와 시각(ms) 열만 방언에 맞춰 바꾼다.
 */
export function schema(dialect: Dialect): string {
  const ID = dialect === "postgres" ? "BIGSERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
  /** epoch ms — 32비트 정수를 넘으므로 PostgreSQL 은 BIGINT */
  const MS = dialect === "postgres" ? "BIGINT" : "INTEGER";
  return `
CREATE TABLE IF NOT EXISTS code_items (
  id TEXT PRIMARY KEY,
  track TEXT NOT NULL DEFAULT 'code',
  language TEXT,
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
  created_at ${MS} NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  code_item_id TEXT NOT NULL REFERENCES code_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_item ON questions(code_item_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 0,
  preferred_level INTEGER,
  daily_goal INTEGER NOT NULL DEFAULT 5,
  created_at ${MS} NOT NULL,
  last_seen_at ${MS} NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_seen ON sessions(last_seen_at);

CREATE TABLE IF NOT EXISTS attempts (
  id ${ID},
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  code_item_id TEXT NOT NULL,
  question_type TEXT NOT NULL,
  concepts TEXT NOT NULL,
  level INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  partial INTEGER NOT NULL DEFAULT 0,
  hints_used INTEGER NOT NULL DEFAULT 0,
  time_ms ${MS} NOT NULL DEFAULT 0,
  misconception TEXT,
  graded_by TEXT NOT NULL,
  answer TEXT,
  created_at ${MS} NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_session ON attempts(session_id, created_at);
CREATE TABLE IF NOT EXISTS daily_activity (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  solved INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  time_ms ${MS} NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, day)
);
CREATE TABLE IF NOT EXISTS concept_progress (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  time_ms ${MS} NOT NULL DEFAULT 0,
  recent_quality TEXT NOT NULL DEFAULT '[]',
  recent_results TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (session_id, concept)
);
CREATE TABLE IF NOT EXISTS analyses (
  id ${ID},
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  attempt_count INTEGER NOT NULL,
  result TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at ${MS} NOT NULL
);
CREATE INDEX IF NOT EXISTS analyses_session ON analyses(session_id, created_at);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id ${ID},
  concept TEXT NOT NULL,
  level INTEGER NOT NULL,
  status TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'manual',
  reason TEXT NOT NULL,
  session_id TEXT,
  mock INTEGER NOT NULL DEFAULT 0,
  item_id TEXT,
  error TEXT,
  created_at ${MS} NOT NULL,
  finished_at ${MS}
);
CREATE TABLE IF NOT EXISTS demand_signals (
  concept TEXT NOT NULL,
  level INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  created_at ${MS} NOT NULL
);
CREATE INDEX IF NOT EXISTS demand_cell ON demand_signals(concept, level, created_at);
CREATE TABLE IF NOT EXISTS ai_usage (
  id ${ID},
  task TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL,
  created_at ${MS} NOT NULL
);
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`;
}

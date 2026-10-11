import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeParams, type Db, type Param } from "./types";

/** 로컬 개발·테스트용. 연결 하나를 쓰므로 트랜잭션은 차례로 실행한다 */
class SqliteDb implements Db {
  readonly dialect = "sqlite" as const;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly raw: DatabaseSync,
    private readonly inTx = false,
  ) {}

  async all<T>(sql: string, params?: Param[]) {
    return this.raw.prepare(sql).all(...(normalizeParams(params) as (string | number | null)[])) as T[];
  }
  async get<T>(sql: string, params?: Param[]) {
    return this.raw.prepare(sql).get(...(normalizeParams(params) as (string | number | null)[])) as T | undefined;
  }
  async run(sql: string, params?: Param[]) {
    return Number(this.raw.prepare(sql).run(...(normalizeParams(params) as (string | number | null)[])).changes);
  }
  async insert(sql: string, params?: Param[]) {
    return Number(this.raw.prepare(sql).run(...(normalizeParams(params) as (string | number | null)[])).lastInsertRowid);
  }
  async exec(sql: string) {
    this.raw.exec(sql);
  }
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    const run = async () => {
      this.raw.exec("BEGIN");
      try {
        const result = await fn(new SqliteDb(this.raw, true));
        this.raw.exec("COMMIT");
        return result;
      } catch (e) {
        this.raw.exec("ROLLBACK");
        throw e;
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

export function openSqlite(file: string): SqliteDb {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrateLegacy(raw);
  return new SqliteDb(raw);
}

/**
 * 예전 구조로 만들어진 개발용 SQLite 파일 정리 (콘텐츠는 유지).
 * - 익명 쿠키(learners) 시절 기록 테이블 삭제, 이후 추가된 열 보충
 */
function migrateLegacy(db: DatabaseSync) {
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
  const has = (table: string, column: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
  if (tables.includes("learners")) {
    db.exec("DROP TABLE IF EXISTS attempts; DROP TABLE IF EXISTS analyses; DROP TABLE IF EXISTS demand_signals; DROP TABLE learners;");
  }
  if (tables.includes("sessions") && !has("sessions", "nickname")) {
    db.exec("ALTER TABLE sessions ADD COLUMN nickname TEXT NOT NULL DEFAULT ''; ALTER TABLE sessions ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;");
  }
  if (tables.includes("generation_jobs")) {
    if (!has("generation_jobs", "trigger")) db.exec("ALTER TABLE generation_jobs ADD COLUMN trigger TEXT NOT NULL DEFAULT 'manual'");
    if (!has("generation_jobs", "mock")) db.exec("ALTER TABLE generation_jobs ADD COLUMN mock INTEGER NOT NULL DEFAULT 0");
    if (has("generation_jobs", "learner_id")) db.exec("ALTER TABLE generation_jobs RENAME COLUMN learner_id TO session_id");
    else if (!has("generation_jobs", "session_id")) db.exec("ALTER TABLE generation_jobs ADD COLUMN session_id TEXT");
  }
}

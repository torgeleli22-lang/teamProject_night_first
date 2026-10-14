import crypto from "node:crypto";
import path from "node:path";
import { buildSeed } from "../../content/seed";
import { schema } from "./schema";
import type { Db } from "./types";

export type { Db, Param } from "./types";

/**
 * DB 선택 (환경 변수 DB_DRIVER)
 * - sqlite (기본): DATABASE_PATH 또는 ./data/app.db — 로컬 개발·테스트·콘텐츠 검증
 * - postgres     : DATABASE_URL — PostgreSQL 직접 연결
 * - data-api     : DB_CLUSTER_ARN, DB_SECRET_ARN, DB_NAME — Aurora Data API (Lambda 권장)
 * - dynamodb     : DYNAMODB_TABLE — DynamoDB (Lambda 실행 역할 권한, VPC 불필요). SQL 을 쓰지 않고 src/lib/server/dynamo 를 쓴다
 */
export type DbDriver = "sqlite" | "postgres" | "data-api" | "dynamodb";

export function dbDriver(): DbDriver {
  const d = process.env.DB_DRIVER;
  return d === "postgres" || d === "data-api" || d === "dynamodb" ? d : "sqlite";
}

/** DynamoDB 를 쓰는지 (저장소 함수들이 SQL 대신 src/lib/server/dynamo 로 보낸다) */
export const useDynamo = () => dbDriver() === "dynamodb";

let ready: Promise<Db> | null = null;

async function open(): Promise<Db> {
  const driver = dbDriver();
  let db: Db;
  if (driver === "postgres") {
    if (!process.env.DATABASE_URL) throw new Error("DB_DRIVER=postgres 에는 DATABASE_URL 이 필요해요.");
    db = (await import("./postgres")).openPostgres(process.env.DATABASE_URL);
  } else if (driver === "data-api") {
    const { DB_CLUSTER_ARN, DB_SECRET_ARN, DB_NAME } = process.env;
    if (!DB_CLUSTER_ARN || !DB_SECRET_ARN || !DB_NAME) throw new Error("DB_DRIVER=data-api 에는 DB_CLUSTER_ARN, DB_SECRET_ARN, DB_NAME 이 필요해요.");
    db = (await import("./data-api")).openDataApi({ resourceArn: DB_CLUSTER_ARN, secretArn: DB_SECRET_ARN, database: DB_NAME });
  } else {
    db = (await import("./sqlite")).openSqlite(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db"));
  }
  await ensureSchema(db);
  await resetForContentModel(db);
  await syncSeed(db);
  return db;
}

/**
 * 학습 구조를 "개념 / 코드" 두 갈래로 바꾸면서 예전 문제·학습 기록·랭킹을 한 번 지운다 (관리자 결정: 전부 지우고 새로 시작).
 * AI 사용량(월 예산)과 설정(관리자 코드, 자동 생성 스위치)은 남긴다.
 * 콘텐츠 표는 새 열(track, language)이 생기도록 지우고 다시 만든다.
 */
export const CONTENT_MODEL = "2";

async function resetForContentModel(db: Db) {
  const row = await db.get<{ value: string }>("SELECT value FROM app_meta WHERE key = 'content_model'");
  if (row?.value === CONTENT_MODEL) return;
  await db.transaction(async (tx) => {
    for (const table of ["attempts", "daily_activity", "concept_progress", "analyses", "sessions", "demand_signals", "generation_jobs"]) {
      await tx.run(`DELETE FROM ${table}`);
    }
    await tx.run("DROP TABLE IF EXISTS questions");
    await tx.run("DROP TABLE IF EXISTS code_items");
    await tx.run("DELETE FROM app_meta WHERE key IN ('seed_hash', 'schema_hash')");
  });
  await ensureSchema(db);
  await db.run("INSERT INTO app_meta (key, value) VALUES ('content_model', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [CONTENT_MODEL]);
  console.log("[db] 새 학습 구조로 바꾸며 예전 문제·학습 기록을 지웠어요 (AI 사용량·설정은 유지)");
}

const hashOf = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

/**
 * 스키마가 바뀌었을 때만 CREATE TABLE IF NOT EXISTS 를 실행한다.
 * (Data API 는 문장마다 HTTPS 요청이라, Lambda 가 새로 뜰 때마다 20여 번 부르지 않도록)
 */
async function ensureSchema(db: Db) {
  const ddl = schema(db.dialect);
  const hash = hashOf(ddl);
  try {
    const row = await db.get<{ value: string }>("SELECT value FROM app_meta WHERE key = 'schema_hash'");
    if (row?.value === hash) return;
  } catch {
    // 처음 실행이라 app_meta 테이블이 아직 없음
  }
  await db.exec(ddl);
  await db.run("INSERT INTO app_meta (key, value) VALUES ('schema_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [hash]);
}

/** 처음 부를 때 연결·스키마·시드 동기화를 한 번만 한다 */
export function getDb(): Promise<Db> {
  if (useDynamo()) throw new Error("DB_DRIVER=dynamodb 에서는 SQL DB 를 쓰지 않아요 (src/lib/server/dynamo).");
  ready ??= open().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/**
 * 코드에 들어 있는 시드 콘텐츠를 DB 와 맞춘다 (AI 생성 콘텐츠는 건드리지 않음).
 * 시드가 바뀌었을 때만 실행해서, Lambda 가 새로 뜰 때마다 수백 건을 쓰지 않게 한다. 코드에서 빠진 시드 문제는 지운다.
 */
async function syncSeed(db: Db) {
  const { items, questions } = buildSeed(0);
  const hash = hashOf({ items, questions });
  const current = await db.get<{ value: string }>("SELECT value FROM app_meta WHERE key = 'seed_hash'");
  if (current?.value === hash) return;
  const now = Date.now();
  await db.transaction(async (tx) => {
    const seedIds = new Set(items.map((i) => i.id));
    const questionIds = new Set(questions.map((q) => q.id));
    for (const r of await tx.all<{ id: string }>("SELECT id FROM code_items WHERE source = 'seed'")) {
      if (!seedIds.has(r.id)) {
        await tx.run("DELETE FROM questions WHERE code_item_id = ?", [r.id]);
        await tx.run("DELETE FROM code_items WHERE id = ?", [r.id]);
      }
    }
    for (const r of await tx.all<{ id: string }>("SELECT q.id FROM questions q JOIN code_items c ON c.id = q.code_item_id WHERE c.source = 'seed'")) {
      if (!questionIds.has(r.id)) await tx.run("DELETE FROM questions WHERE id = ?", [r.id]);
    }
    for (const i of items) {
      await tx.run(
        `INSERT INTO code_items (id, track, language, title, code, concepts, level, factors, output, runnable, source, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', 'published', ?)
         ON CONFLICT(id) DO UPDATE SET track = excluded.track, language = excluded.language, title = excluded.title, code = excluded.code,
           concepts = excluded.concepts, level = excluded.level, factors = excluded.factors, output = excluded.output, runnable = excluded.runnable`,
        [i.id, i.track, i.language, i.title, i.code, JSON.stringify(i.concepts), i.level, JSON.stringify(i.factors), i.output, i.runnable, now],
      );
    }
    for (const q of questions) {
      await tx.run(
        `INSERT INTO questions (id, code_item_id, type, payload) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET code_item_id = excluded.code_item_id, type = excluded.type, payload = excluded.payload`,
        [q.id, q.codeItemId, q.type, JSON.stringify(q)],
      );
    }
    await tx.run("INSERT INTO app_meta (key, value) VALUES ('seed_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [hash]);
  });
}

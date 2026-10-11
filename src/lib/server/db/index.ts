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
 */
export type DbDriver = "sqlite" | "postgres" | "data-api";

export function dbDriver(): DbDriver {
  const d = process.env.DB_DRIVER;
  return d === "postgres" || d === "data-api" ? d : "sqlite";
}

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
  await syncSeed(db);
  return db;
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
  ready ??= open().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/**
 * 코드에 들어 있는 시드 콘텐츠를 DB 와 맞춘다 (AI 생성 콘텐츠는 건드리지 않음).
 * 시드가 바뀌었을 때만 실행해서, Lambda 가 새로 뜰 때마다 수백 건을 쓰지 않게 한다.
 */
async function syncSeed(db: Db) {
  const { items, questions } = buildSeed(0);
  const hash = hashOf({ items, questions });
  const current = await db.get<{ value: string }>("SELECT value FROM app_meta WHERE key = 'seed_hash'");
  if (current?.value === hash) return;
  const now = Date.now();
  await db.transaction(async (tx) => {
    for (const i of items) {
      await tx.run(
        `INSERT INTO code_items (id, title, code, concepts, level, factors, output, runnable, source, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seed', 'published', ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, code = excluded.code, concepts = excluded.concepts,
           level = excluded.level, factors = excluded.factors, output = excluded.output, runnable = excluded.runnable`,
        [i.id, i.title, i.code, JSON.stringify(i.concepts), i.level, JSON.stringify(i.factors), i.output, i.runnable, now],
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

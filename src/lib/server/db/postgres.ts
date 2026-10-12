import pg from "pg";
import { normalizeParams, numbered, type Db, type Param } from "./types";

// BIGINT(시각 ms, id)·NUMERIC 을 문자열이 아니라 숫자로 받는다
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

type Queryable = Pick<pg.Pool, "query">;

class PgDb implements Db {
  readonly dialect = "postgres" as const;
  constructor(
    private readonly pool: pg.Pool,
    private readonly client?: pg.PoolClient,
  ) {}
  private get q(): Queryable {
    return this.client ?? this.pool;
  }
  private async query(sql: string, params?: Param[]) {
    try {
      return await this.q.query(numbered(sql), normalizeParams(params));
    } catch (e) {
      // Aurora Serverless 가 일시 중지에서 깨어나는 중이면 연결이 끊길 수 있어 한 번 더 시도
      if (!this.client && isTransient(e)) return this.q.query(numbered(sql), normalizeParams(params));
      throw e;
    }
  }
  async all<T>(sql: string, params?: Param[]) {
    return (await this.query(sql, params)).rows as T[];
  }
  async get<T>(sql: string, params?: Param[]) {
    return (await this.query(sql, params)).rows[0] as T | undefined;
  }
  async run(sql: string, params?: Param[]) {
    return (await this.query(sql, params)).rowCount ?? 0;
  }
  async insert(sql: string, params?: Param[]) {
    return Number((await this.query(`${sql} RETURNING id`, params)).rows[0].id);
  }
  async exec(sql: string) {
    await this.q.query(sql);
  }
  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (this.client) return fn(this);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(new PgDb(this.pool, client));
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
}

const isTransient = (e: unknown) => /ECONNRESET|ECONNREFUSED|timeout|terminat/i.test(e instanceof Error ? e.message : String(e));

export function openPostgres(url: string): Db {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // 원래 오류에는 주소 전체(암호 포함)가 들어 있어 로그에 남으므로, 암호 없는 안내로 바꿔서 던진다
    throw new Error("DATABASE_URL 형식이 올바르지 않아요. 예: postgres://사용자:암호@호스트:5432/DB이름 (꺾쇠 <> 는 빼고, 암호에 @ : / ? # % 가 없어야 해요)");
  }
  const local = host === "localhost" || host === "127.0.0.1";
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    // Aurora Serverless v2 가 0 ACU 에서 깨어나는 데 10~20초 걸린다
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 60_000,
    // RDS 는 TLS 를 요구한다. VPC 안의 연결이라 인증서 검증은 생략 (DATABASE_SSL=disable 로 끌 수 있음)
    ssl: process.env.DATABASE_SSL === "disable" || local ? undefined : { rejectUnauthorized: false },
  });
  return new PgDb(pool);
}

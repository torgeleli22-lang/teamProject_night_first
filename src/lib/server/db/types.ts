/**
 * DB 접근 공통 인터페이스. SQL 은 `?` 자리표시자로 쓰고, 드라이버가 각자 형식으로 바꾼다.
 * - sqlite  : 로컬 개발·테스트 (Node 내장 node:sqlite, 파일 하나)
 * - postgres: PostgreSQL 에 직접 연결 (pg). 로컬 PostgreSQL, VPC 안의 Lambda/EC2
 * - data-api: Aurora Data API (HTTP). VPC 밖의 Lambda 에서 연결 없이 쿼리
 *
 * 규칙
 * - 참/거짓은 INTEGER 0/1 로 저장한다 (boolean 매개변수는 자동으로 1/0 으로 바뀐다).
 * - 집계(COUNT, SUM)는 CAST(... AS INTEGER) 로 감싸서 모든 드라이버가 숫자를 돌려주게 한다.
 * - ON CONFLICT ... DO UPDATE SET 의 기존 값은 `테이블명.열` 로 쓴다 (PostgreSQL 호환).
 */
export type Param = string | number | boolean | null;
export type Dialect = "sqlite" | "postgres";

export interface Db {
  readonly dialect: Dialect;
  all<T>(sql: string, params?: Param[]): Promise<T[]>;
  get<T>(sql: string, params?: Param[]): Promise<T | undefined>;
  /** 바뀐 행 수 */
  run(sql: string, params?: Param[]): Promise<number>;
  /** INSERT 후 새 id (id 열이 자동 증가인 테이블) */
  insert(sql: string, params?: Param[]): Promise<number>;
  /** 매개변수 없는 여러 문장 (스키마) */
  exec(sql: string): Promise<void>;
  /** 안에서 쓰는 쿼리는 모두 tx 로 */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export const normalizeParams = (params: Param[] = []) => params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p));

/** `?` → `$1, $2 …` (SQL 문자열 안에 ? 를 쓰지 않는다는 전제) */
export function numbered(sql: string, prefix = "$"): string {
  let n = 0;
  return sql.replace(/\?/g, () => `${prefix}${++n}`);
}

/** 스키마처럼 여러 문장을 하나씩 나눈다 (문장 안에 ; 를 쓰지 않는다는 전제) */
export const splitStatements = (sql: string) =>
  sql
    .split(";")
    .map((s) => s.replace(/--.*$/gm, "").trim())
    .filter(Boolean);

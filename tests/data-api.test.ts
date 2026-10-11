/**
 * Aurora Data API 드라이버 점검. 실제 AWS 대신 같은 요청을 로컬 PostgreSQL 로 실행하는 가짜 클라이언트를 쓴다.
 * TEST_DATABASE_URL 이 없으면 건너뛴다.  예) TEST_DATABASE_URL=postgres://postgres@localhost:5433/jobase npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { openDataApi } from "../src/lib/server/db/data-api";

const url = process.env.TEST_DATABASE_URL;

test("Data API 드라이버: 매개변수·조회·INSERT id·트랜잭션", { skip: !url }, async () => {
  const pool = new pg.Pool({ connectionString: url });
  const txs = new Map<string, pg.PoolClient>();
  let resumingOnce = true;
  const fake = {
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      const input = command.input;
      switch (command.constructor.name) {
        case "BeginTransactionCommand": {
          const id = `tx${txs.size + 1}`;
          const client = await pool.connect();
          await client.query("BEGIN");
          txs.set(id, client);
          return { transactionId: id };
        }
        case "CommitTransactionCommand":
        case "RollbackTransactionCommand": {
          const client = txs.get(input.transactionId as string)!;
          await client.query(command.constructor.name.startsWith("Commit") ? "COMMIT" : "ROLLBACK");
          client.release();
          txs.delete(input.transactionId as string);
          return {};
        }
        default: {
          // 일시 중지에서 깨어나는 상황을 한 번 흉내 낸다
          if (resumingOnce) {
            resumingOnce = false;
            throw Object.assign(new Error("resuming"), { name: "DatabaseResumingException" });
          }
          const params = (input.parameters as { value: Record<string, unknown> }[]).map((p) => (p.value.isNull ? null : Object.values(p.value)[0]));
          const sql = (input.sql as string).replace(/:p(\d+)/g, "$$$1");
          const q = input.transactionId ? txs.get(input.transactionId as string)! : pool;
          const res = await q.query(sql, params);
          return { formattedRecords: res.rows.length || res.command === "SELECT" ? JSON.stringify(res.rows) : undefined, numberOfRecordsUpdated: res.rowCount };
        }
      }
    },
  };
  const db = openDataApi({ resourceArn: "arn", secretArn: "arn", database: "x" }, fake as never);
  await db.exec("DROP TABLE IF EXISTS da_test; CREATE TABLE da_test (id BIGSERIAL PRIMARY KEY, name TEXT, flag INTEGER, ms BIGINT)");
  const id = await db.insert("INSERT INTO da_test (name, flag, ms) VALUES (?, ?, ?)", ["가", true, 1_790_000_000_000]);
  assert.equal(id, 1);
  assert.deepEqual(await db.get("SELECT name, flag FROM da_test WHERE id = ?", [id]), { name: "가", flag: 1 });
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.run("INSERT INTO da_test (name) VALUES (?)", [null]);
      throw new Error("롤백 확인");
    }),
  );
  await db.transaction(async (tx) => {
    await tx.run("UPDATE da_test SET name = ? WHERE id = ?", ["나", id]);
  });
  const rows = await db.all<{ n: number }>("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM da_test");
  assert.equal(rows[0].n, 1);
  assert.equal((await db.get<{ name: string }>("SELECT name FROM da_test"))!.name, "나");
  await db.exec("DROP TABLE da_test");
  await pool.end();
});

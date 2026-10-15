import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeed } from "../src/lib/content/seed";
import { autoTraceQuestion, checkExpr, pickWatch, traceCode, validateItem } from "../lambda/generate-code/checks.mjs";
import { CONCEPTS } from "../src/lib/curriculum";
import type { TraceQuestion } from "../src/lib/types";

const IDS = CONCEPTS.map((c) => c.id);

const { items, questions } = buildSeed();
const cart = items.find((i) => i.id === "set-cart")!;
const cartTrace = questions.find((q) => q.id === "cart-trace") as TraceQuestion;

test("지정한 줄을 실제로 실행하며 값을 기록한다 (반복문은 바퀴마다)", async () => {
  const t = await traceCode("javascript", cart.code, [{ line: 10, given: ["item.name"], ask: ["total"] }]);
  assert.equal(t.ok, true, t.problems.join());
  assert.deepEqual(
    t.rows.map((r) => [r.context, r.value]),
    [
      ["item.name = '펜'", "3000"],
      ["item.name = '노트'", "8000"],
      ["item.name = '지우개'", "10000"],
    ],
  );
});

test("기록을 넣을 수 없는 줄·값을 바꾸는 식은 거절한다", async () => {
  assert.ok(checkExpr("total = 0"));
  assert.ok(checkExpr("i++"));
  assert.ok(checkExpr("getGrade(95)"));
  assert.equal(checkExpr("score >= 90"), null);
  assert.equal(checkExpr("labels[0]"), null);
  // 여러 줄짜리 배열 선언의 첫 줄 뒤에는 기록을 넣을 수 없다
  const bad = await traceCode("javascript", cart.code, [{ line: 1, ask: ["cart"] }]);
  assert.equal(bad.ok, false);
});

test("시드의 추적표 정답이 실제 실행과 다르면 검증에서 걸린다", async () => {
  const tampered = { ...cartTrace, rows: cartTrace.rows.map((r, i) => (i === 1 ? { ...r, value: "5000" } : r)) };
  const report = await validateItem({ code: cart.code, concepts: cart.concepts, output: cart.output, runnable: true, questions: [tampered] }, IDS);
  assert.ok(report.checks.some((c) => c.name.includes("추적표 정답 = 실제 실행 기록") && !c.pass));
});

test("AI 가 만든 코드에서도 따라갈 줄을 규칙으로 골라 문제를 만든다", async () => {
  assert.deepEqual(pickWatch(cart.code), [{ line: 10, when: "after", ask: ["total"], given: ["item"] }]);
  const q = await autoTraceQuestion("javascript", cart.code, "ai-x");
  assert.ok(q && q.rows.length === 3 && q.rows[2].value === "10000");
  const report = await validateItem({ code: cart.code, concepts: cart.concepts, output: cart.output, runnable: true, questions: [q!] }, IDS);
  assert.equal(report.ok, true, JSON.stringify(report.checks.filter((c) => !c.pass)));
});

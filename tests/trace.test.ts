import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeed } from "../src/lib/content/seed";
import { autoTraceQuestion, checkExpr, pickWatch, traceCode } from "../src/lib/content/tracer";
import { validateItem } from "../src/lib/content/validate";
import { gradeTrace, sameValue } from "../src/lib/grading";
import { toPublic } from "../src/lib/server/planner";
import type { TraceQuestion } from "../src/lib/types";

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
  const report = await validateItem({ code: cart.code, concepts: cart.concepts, output: cart.output, runnable: true, questions: [tampered] });
  assert.ok(report.checks.some((c) => c.name.includes("추적표 정답 = 실제 실행 기록") && !c.pass));
});

test("칸마다 채점하고, 문자열은 따옴표를 써도 안 써도 맞다", () => {
  assert.deepEqual(gradeTrace(cartTrace, ["3000", "8000", "9000"]), [true, true, false]);
  assert.ok(sameValue("민지님은 21살", "'민지님은 21살'"));
  assert.ok(sameValue('"민지님은 21살"', "'민지님은 21살'"));
  assert.ok(sameValue("[77,100,93,69]", "[77, 100, 93, 69]"));
});

test("클라이언트에는 칸 이름만 가고 값(정답)은 가지 않는다", () => {
  const pub = toPublic(cartTrace, cart);
  assert.equal(pub.trace?.length, 3);
  assert.ok(!JSON.stringify(pub).includes("8000"));
  assert.deepEqual(pub.focusLines, [10]);
});

test("AI 가 만든 코드에서도 따라갈 줄을 규칙으로 골라 문제를 만든다", async () => {
  assert.deepEqual(pickWatch(cart.code), [{ line: 10, when: "after", ask: ["total"], given: ["item"] }]);
  const q = await autoTraceQuestion("javascript", cart.code, "ai-x");
  assert.ok(q && q.rows.length === 3 && q.rows[2].value === "10000");
  const report = await validateItem({ code: cart.code, concepts: cart.concepts, output: cart.output, runnable: true, questions: [q!] });
  assert.equal(report.ok, true, JSON.stringify(report.checks.filter((c) => !c.pass)));
});

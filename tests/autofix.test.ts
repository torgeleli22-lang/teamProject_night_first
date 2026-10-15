import assert from "node:assert/strict";
import { test } from "node:test";
import { autoFixQuestions, validateCode, validateItem } from "../lambda/generate-code/checks.mjs";
import { buildSeed } from "../src/lib/content/seed";
import { CONCEPTS } from "../src/lib/curriculum";
import type { Question } from "../src/lib/types";

const IDS = CONCEPTS.map((c) => c.id);

const { items, questions } = buildSeed();
const lessons = items.filter((i) => i.track === "code");
const setOf = (id: string) => questions.filter((q) => q.codeItemId === id);

/** AI 가 흔히 틀리는 방식으로 정답을 망가뜨린다 */
function corrupt(q: Question): Question {
  switch (q.type) {
    case "predict_output":
      return { ...q, output: "[ { name: 'Kim' } ]" };
    case "fill_blank":
      return { ...q, answerIndex: (q.answerIndex + 1) % q.choices.length };
    default:
      return q;
  }
}

test("코드만 먼저 실행해서 실제 결과를 얻는다", async () => {
  for (const item of lessons) {
    const r = await validateCode(item.code, item.concepts, item.level, IDS);
    assert.equal(r.ok, true, `${item.id}: ${JSON.stringify(r.checks.filter((c) => !c.pass))}`);
    assert.ok(r.actualOutput?.trim());
  }
  const broken = await validateCode("const a = 1;\nconsole.log(b);", ["variables"], 1, IDS);
  assert.equal(broken.ok, false);
  assert.ok(broken.checks.some((c) => c.name === "코드가 오류 없이 실행됨" && !c.pass));
});

test("틀린 정답은 실행 결과로 자동 수정되어 검증을 통과한다", async () => {
  for (const item of lessons) {
    const { actualOutput } = await validateCode(item.code, item.concepts, item.level, IDS);
    const broken = setOf(item.id).map(corrupt);
    const before = await validateItem({ code: item.code, concepts: item.concepts, output: actualOutput, runnable: true, questions: broken }, IDS);
    assert.equal(before.ok, false, `${item.id}: 망가뜨린 세트는 검증에 실패해야 함`);
    const { questions: fixed, fixes } = autoFixQuestions(item.code, actualOutput, broken);
    assert.ok(fixes.length >= 1, fixes.join("\n"));
    const after = await validateItem({ code: item.code, concepts: item.concepts, output: actualOutput, runnable: true, questions: fixed }, IDS);
    assert.equal(after.ok, true, `${item.id}: ${JSON.stringify(after.checks.filter((c) => !c.pass))}`);
  }
});

test("맞는 문제는 건드리지 않는다", async () => {
  for (const item of lessons) {
    const { actualOutput } = await validateCode(item.code, item.concepts, item.level, IDS);
    const { questions: same, fixes } = autoFixQuestions(item.code, actualOutput, setOf(item.id));
    assert.deepEqual(fixes, [], item.id);
    assert.deepEqual(same, setOf(item.id));
  }
});

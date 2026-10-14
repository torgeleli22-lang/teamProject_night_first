import assert from "node:assert/strict";
import { test } from "node:test";
import { autoFixQuestions } from "../src/lib/content/autofix";
import { buildSeed } from "../src/lib/content/seed";
import { validateCode, validateItem } from "../src/lib/content/validate";
import type { Question } from "../src/lib/types";

const { items, questions } = buildSeed();
const item = items.find((i) => i.id === "set-adults")!;
const set = questions.filter((q) => q.codeItemId === "set-adults");

/** AI 가 흔히 틀리는 방식으로 정답을 망가뜨린다 */
function corrupt(q: Question): Question {
  switch (q.type) {
    case "predict_output":
      return { ...q, output: "[ { name: 'Kim' } ]" };
    case "fill_blank":
      return { ...q, answerIndex: (q.answerIndex + 1) % q.choices.length };
    case "find_bug":
      return { ...q, bugLine: q.bugLine === 1 ? 2 : 1, fixedLine: "  // 잘못 적은 줄" };
    default:
      return q;
  }
}

test("코드만 먼저 실행해서 실제 결과를 얻는다", async () => {
  const r = await validateCode(item.code, item.concepts, item.level);
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => !c.pass)));
  assert.ok(r.actualOutput?.trim());
  const broken = await validateCode("const a = 1;\nconsole.log(b);", ["variables"], 1);
  assert.equal(broken.ok, false);
  assert.ok(broken.checks.some((c) => c.name === "코드가 오류 없이 실행됨" && !c.pass));
});

test("틀린 정답은 실행 결과로 자동 수정되어 검증을 통과한다", async () => {
  const { actualOutput } = await validateCode(item.code, item.concepts, item.level);
  const broken = set.map(corrupt);
  const before = await validateItem({ code: item.code, concepts: item.concepts, output: actualOutput, runnable: true, questions: broken });
  assert.equal(before.ok, false, "망가뜨린 세트는 검증에 실패해야 함");

  const { questions: fixed, fixes } = autoFixQuestions(item.code, actualOutput, broken);
  assert.ok(fixes.length >= 3, fixes.join("\n"));
  const after = await validateItem({ code: item.code, concepts: item.concepts, output: actualOutput, runnable: true, questions: fixed });
  assert.equal(after.ok, true, JSON.stringify(after.checks.filter((c) => !c.pass)));
});

test("맞는 문제는 건드리지 않는다", async () => {
  const { actualOutput } = await validateCode(item.code, item.concepts, item.level);
  const { questions: same, fixes } = autoFixQuestions(item.code, actualOutput, set);
  assert.deepEqual(fixes, []);
  assert.deepEqual(same, set);
});

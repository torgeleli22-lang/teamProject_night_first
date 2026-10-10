import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFactors, estimateLevel } from "../src/lib/content/analyzer";
import { runJs } from "../src/lib/content/runner";
import { validateItem, type ItemDraft } from "../src/lib/content/validate";

const hints: [string, string, string, string] = ["a", "b", "c", "d"];
const base = { prompt: "?", skill: "predict" as const, hints, explanation: "e", keyPoint: "k" };

const good: ItemDraft = {
  code: "const nums = [1, 2, 3];\nconst doubled = nums.map(n => n * 2);\nconsole.log(doubled);",
  concepts: ["map"],
  output: "[2, 4, 6]",
  runnable: true,
  questions: [
    { ...base, id: "q1", type: "predict_output", output: "[2, 4, 6]" },
    {
      ...base,
      id: "q2",
      type: "multiple_choice",
      choices: [{ text: "[1, 2, 3]" }, { text: "[2, 4, 6]" }, { text: "오류" }],
      answerIndex: 1,
    },
  ],
};

const failedNames = async (item: ItemDraft) => (await validateItem(item)).checks.filter((c) => !c.pass).map((c) => c.name);

test("올바른 콘텐츠는 통과", async () => {
  assert.deepEqual(await failedNames(good), []);
});

test("AI 가 제시한 실행 결과가 실제와 다르면 실패", async () => {
  assert.ok((await failedNames({ ...good, output: "[1, 2, 3]" })).includes("제시한 실행 결과 = 실제 실행 결과"));
});

test("실행 결과 보기가 정답이 아니거나 두 개면 실패", async () => {
  const ambiguous: ItemDraft = {
    ...good,
    questions: [{ ...base, id: "q", type: "multiple_choice", choices: [{ text: "[2, 4, 6]" }, { text: "[2,4,6]" }, { text: "x" }], answerIndex: 0 }],
  };
  const names = await failedNames(ambiguous);
  assert.ok(names.some((n) => n.includes("중복 보기") || n.includes("정답 하나뿐")));
});

test("빈칸의 다른 보기도 같은 결과를 내면 실패", async () => {
  const item: ItemDraft = {
    code: "let a = 1;\nconsole.log(a);",
    concepts: ["variables"],
    output: "1",
    runnable: true,
    questions: [
      { ...base, id: "b", type: "fill_blank", blankedCode: "____ a = 1;", choices: [{ text: "let" }, { text: "var" }, { text: "number" }], answerIndex: 0 },
    ],
  };
  assert.ok((await failedNames(item)).some((n) => n.includes("원래 결과를 만드는 보기가 정답 하나뿐")));
});

test("오류 찾기의 '오류 코드'가 같은 결과를 내면 실패", async () => {
  const item: ItemDraft = {
    ...good,
    questions: [{ ...base, id: "f", type: "find_bug", buggyCode: good.code.replace("n * 2", "2 * n"), bugLine: 2, fixedLine: "const doubled = nums.map(n => n * 2);" }],
  };
  assert.ok((await failedNames(item)).some((n) => n.includes("오류 코드는 다른 결과")));
});

test("위험한 코드·무한 루프는 실행하지 않거나 시간 초과로 끊는다", async () => {
  assert.ok((await failedNames({ ...good, code: "require('fs')" })).includes("안전한 코드 (require/eval/무한 루프 등 없음)"));
  const loop = await runJs("let i = 0; for (;;) { i++; }");
  assert.equal(loop.timedOut, true);
});

test("목표 난이도에 맞지 않는 문법은 실패", async () => {
  const names = await failedNames({ ...good, targetLevel: 1 });
  assert.ok(names.includes("난이도에 비해 어려운 문법 없음"));
});

test("난이도 요소: 긴 파이프라인은 짧은 변수 코드보다 어렵다", () => {
  const easy = estimateLevel(computeFactors("let a = 1;\nconsole.log(a);", 1));
  const hard = estimateLevel(
    computeFactors(
      "const s = [1,2,3];\nconst a = s.filter(x => x > 1);\nconst b = a.map(x => x * 2);\nconst c = b.reduce((t, x) => t + x, 0) / b.length;\nfor (let i = 0; i < 2; i++) { if (c > i && i % 2 === 0) console.log(i); }",
      4,
    ),
  );
  assert.ok(hard > easy);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeed } from "../src/lib/content/seed";
import { evaluateShortAnswer, gradeObjective, sameOutput } from "../src/lib/grading";
import type { ShortAnswerQuestion } from "../src/lib/types";

const { questions } = buildSeed();
const byId = (id: string) => questions.find((q) => q.id === id)!;
const adults = byId("adults-explain") as ShortAnswerQuestion;

test("객관식·빈칸·오류 찾기·셔플·결과 예측은 규칙으로 채점된다", () => {
  assert.equal(gradeObjective(byId("adults-count"), { type: "multiple_choice", index: 1 }), true);
  assert.equal(gradeObjective(byId("adults-count"), { type: "multiple_choice", index: 2 }), false);
  assert.equal(gradeObjective(byId("adults-blank"), { type: "fill_blank", index: 0 }), true);
  assert.equal(gradeObjective(byId("adults-bug"), { type: "find_bug", line: 7 }), true);
  assert.equal(gradeObjective(byId("adults-shuffle"), { type: "shuffle", order: [0, 1, 2] }), true);
  assert.equal(gradeObjective(byId("adults-shuffle"), { type: "shuffle", order: [1, 0, 2] }), false);
  assert.equal(
    gradeObjective(byId("adults-predict"), { type: "predict_output", text: '[{ name: "Kim", age: 25 }, { name: "Park", age: 31 }]' }),
    true,
    "따옴표·띄어쓰기 차이는 허용",
  );
});

test("출력 비교는 줄 수가 다르면 오답", () => {
  assert.equal(sameOutput("1\n2", "12"), false);
  assert.equal(sameOutput(" 10 5 ", "10 5"), true);
});

test("핵심 개념을 모두 담은 주관식은 AI 없이 정답 처리", () => {
  const r = evaluateShortAnswer(adults, "20살 이상인 사용자만 골라서 새로운 배열에 넣습니다.");
  assert.equal(r.verdict, "correct");
  assert.deepEqual(r.aiReasons, []);
});

test("오개념 표현이 있으면 AI 평가로 넘긴다", () => {
  const r = evaluateShortAnswer(adults, "filter는 배열의 값을 변경하는 함수입니다.");
  assert.ok(r.aiReasons.includes("오개념 표현 포함"));
  assert.equal(r.misconceptions[0].label, "filter 가 배열의 값을 변경한다고 생각");
});

test("핵심 요소 일부가 빠지거나 너무 짧으면 AI 평가로 넘긴다", () => {
  assert.ok(evaluateShortAnswer(adults, "filter로 골라서 adults에 저장해요").aiReasons.includes("핵심 요소 일부 누락"));
  assert.ok(evaluateShortAnswer(adults, "조건으로 골라냄").aiReasons.includes("답변이 짧음"));
});

test("성의 없는 답(3글자 이하)은 AI 를 부르지 않고 오답", () => {
  const r = evaluateShortAnswer(adults, "몰라");
  assert.equal(r.verdict, "incorrect");
  assert.deepEqual(r.aiReasons, []);
});

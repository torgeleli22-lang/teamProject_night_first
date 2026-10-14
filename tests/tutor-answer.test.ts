import assert from "node:assert/strict";
import { test } from "node:test";
import { describeLearnerAnswer } from "../src/lib/ai/tutor";
import { buildSeed } from "../src/lib/content/seed";
import { unshuffle } from "../src/lib/server/planner";

const { questions } = buildSeed();
const byId = (id: string) => questions.find((q) => q.id === id)!;

test("튜터는 순서 맞추기에서 학습자가 놓은 순서를 줄마다 본다", () => {
  const q = byId("adults-shuffle");
  if (q.type !== "shuffle") throw new Error("shuffle 문제가 아니에요");
  const text = describeLearnerAnswer(q, { type: "shuffle", order: [1, 0, 2] }, true);
  assert.match(text, /3\/3개 놓음/);
  assert.match(text, new RegExp(`1\\. ${q.pieces[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*이 자리에 올 조각이 아님`));
  assert.match(text, /오답/);
  // 일부만 놓은 경우: 채점하지 않고 놓은 만큼만 보여준다
  const partial = describeLearnerAnswer(q, { type: "shuffle", order: [0] }, false);
  assert.match(partial, /1\/3개 놓음, 아직 다 놓지 않음/);
  assert.doesNotMatch(partial, /정답입니다|오답입니다/);
});

test("화면 순서 번호는 원래 조각 번호로 되돌린 뒤 설명한다", () => {
  const q = byId("adults-shuffle");
  if (q.type !== "shuffle") throw new Error("shuffle 문제가 아니에요");
  // 화면에서 섞인 순서를 그대로 고르면, 되돌린 결과는 0..n-1 의 어떤 순열
  const restored = unshuffle(q, q.pieces.map((_, i) => i));
  assert.deepEqual([...restored].sort(), q.pieces.map((_, i) => i));
});

test("객관식 답과 정오도 튜터에게 전달된다", () => {
  const q = byId("adults-count");
  assert.match(describeLearnerAnswer(q, { type: "multiple_choice", index: 2 }, true), /학습자의 답: .*\n이 답은 오답입니다/);
  assert.equal(describeLearnerAnswer(q, undefined, true), "");
  assert.equal(describeLearnerAnswer(q, { type: "find_bug", line: 1 }, true), "");
});

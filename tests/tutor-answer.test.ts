import assert from "node:assert/strict";
import { test } from "node:test";
import { describeLearnerAnswer } from "../src/lib/ai/tutor";
import { buildSeed } from "../src/lib/content/seed";
import { displayChoiceIndex, displayedChoices, toPublic, unshuffleAnswer } from "../src/lib/server/planner";
import type { MultipleChoiceQuestion } from "../src/lib/types";

const { items, questions } = buildSeed();
const byId = (id: string) => questions.find((q) => q.id === id)!;
const itemOf = (id: string) => items.find((i) => i.id === byId(id).codeItemId)!;

test("보기는 화면에서 섞이고, 고른 번호는 원래 보기로 되돌아간다", () => {
  const q = byId("osi-routing") as MultipleChoiceQuestion;
  const pub = toPublic(q, itemOf(q.id));
  assert.deepEqual([...pub.choices!].sort(), q.choices.map((c) => c.text).sort());
  assert.deepEqual(pub.choices, displayedChoices(q));
  // 화면에서 정답 글을 고르면 원래 정답 번호로 되돌아간다
  const shown = pub.choices!.indexOf(q.choices[q.answerIndex].text);
  assert.equal(shown, displayChoiceIndex(q, q.answerIndex));
  assert.deepEqual(unshuffleAnswer(q, { type: "multiple_choice", index: shown }), { type: "multiple_choice", index: q.answerIndex });
});

test("정답을 맨 앞에 쓴 문제도 화면에서는 대부분 다른 자리에 정답이 있다", () => {
  const firsts = questions.filter((q) => q.type === "multiple_choice" && q.answerIndex === 0);
  const stillFirst = firsts.filter((q) => displayChoiceIndex(q, 0) === 0).length;
  assert.ok(stillFirst / firsts.length < 0.5, `${stillFirst}/${firsts.length}`);
});

test("클라이언트로 가는 문제에는 정답·해설이 없다", () => {
  for (const q of questions) {
    const item = itemOf(q.id);
    const json = JSON.stringify(toPublic(q, item));
    // 해설 첫 줄이 코드 그 자체인 경우(예: 'for (const item of cart)')는 코드와 겹치므로 빼고 본다
    const snippet = q.explanation.split("\n")[0];
    if (!item.code.includes(snippet)) assert.ok(!json.includes(snippet), q.id);
    assert.ok(!/answerIndex|explanation|modelAnswer|rubric/.test(json), q.id);
  }
});

test("튜터는 학습자가 고른 보기와 정오를 본다", () => {
  const q = byId("osi-routing");
  const text = describeLearnerAnswer(q, { type: "multiple_choice", index: 1 }, true);
  assert.match(text, /학습자의 답: 데이터 링크 계층/);
  assert.match(text, /이 답은 오답입니다/);
  assert.equal(describeLearnerAnswer(q, undefined, true), "");
  assert.equal(describeLearnerAnswer(q, { type: "predict_output", text: "x" }, true), "");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { hit, isAiRequest } from "../src/api/rate-limit";

test("한도까지는 허용하고, 넘으면 막고, 시간이 지나면 다시 센다", () => {
  const t0 = 5_000_000;
  for (let i = 0; i < 3; i++) assert.equal(hit("t:a", 3, 60_000, t0), true);
  assert.equal(hit("t:a", 3, 60_000, t0), false);
  assert.equal(hit("t:b", 3, 60_000, t0), true); // 다른 키는 따로
  assert.equal(hit("t:a", 3, 60_000, t0 + 60_000), true);
  assert.equal(hit("t:off", 0, 60_000, t0), true); // 0 이면 제한 없음
});

test("AI 를 부를 수 있는 요청만 AI 한도에 센다", () => {
  assert.equal(isAiRequest("POST", "/ask", {}), true);
  assert.equal(isAiRequest("POST", "/explain", {}), true);
  assert.equal(isAiRequest("POST", "/attempts", { answer: { type: "short_answer", text: "x" } }), true);
  assert.equal(isAiRequest("POST", "/attempts", { answer: { type: "multiple_choice", index: 0 } }), false);
  assert.equal(isAiRequest("POST", "/hint", {}), false);
  assert.equal(isAiRequest("GET", "/ask", {}), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateCost, normalizeModel } from "../src/lib/server/ops-repo";

test("Bedrock 모델 ID 도 가격표 이름으로 맞춘다", () => {
  assert.equal(normalizeModel("us.anthropic.claude-haiku-4-5-20251001-v1:0"), "claude-haiku-4-5");
  assert.equal(normalizeModel("anthropic.claude-haiku-4-5"), "claude-haiku-4-5");
  assert.equal(normalizeModel("mock:claude-opus-5-5"), "claude-opus-5-5");
});

test("Haiku 4.5 비용: 입력 $1, 출력 $5 (100만 토큰당)", () => {
  const row = { task: "t", model: "us.anthropic.claude-haiku-4-5-20251001-v1:0", calls: 1, input: 1_000_000, output: 100_000, cacheRead: 0, failures: 0 };
  assert.equal(estimateCost([row]), 1.5);
});

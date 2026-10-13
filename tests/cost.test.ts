import assert from "node:assert/strict";
import { test } from "node:test";
import { exceedsBudget } from "../src/lib/ai/client";
import { estimateCost, normalizeModel, worstCaseCostUsd } from "../src/lib/server/ops-repo";

test("Bedrock 모델 ID 도 가격표 이름으로 맞춘다", () => {
  assert.equal(normalizeModel("us.anthropic.claude-haiku-4-5-20251001-v1:0"), "claude-haiku-4-5");
  assert.equal(normalizeModel("anthropic.claude-haiku-4-5"), "claude-haiku-4-5");
  assert.equal(normalizeModel("mock:claude-opus-5-5"), "claude-opus-5-5");
});

test("Haiku 4.5 비용: 입력 $1, 출력 $5 (100만 토큰당)", () => {
  const row = { task: "t", model: "us.anthropic.claude-haiku-4-5-20251001-v1:0", calls: 1, input: 1_000_000, output: 100_000, cacheRead: 0, failures: 0 };
  assert.equal(estimateCost([row]), 1.5);
});

test("호출 한 번의 최대 비용: 출력 최대 길이를 다 쓴다고 본다 (Haiku 4.5, 16,000 토큰 → $0.08)", () => {
  assert.equal(Math.round(worstCaseCostUsd("anthropic.claude-haiku-4-5", 0, 16000) * 1000) / 1000, 0.08);
  // 가격표에 없는 모델은 가장 비싼 가격으로
  assert.ok(worstCaseCostUsd("unknown-model", 0, 1000) >= worstCaseCostUsd("claude-haiku-4-5", 0, 1000));
});

test("월 예산: 쓴 금액 + 진행 중 + 이번 호출 최대 비용이 예산을 넘으면 호출하지 않는다", () => {
  assert.equal(exceedsBudget(9.9, 0, 0.08, 10), false); // 9.98 ≤ 10
  assert.equal(exceedsBudget(9.95, 0, 0.08, 10), true); // 10.03 > 10
  assert.equal(exceedsBudget(9.85, 0.08, 0.08, 10), true); // 동시에 다른 호출이 진행 중
  assert.equal(exceedsBudget(10, 0, 0, 10), false);
});

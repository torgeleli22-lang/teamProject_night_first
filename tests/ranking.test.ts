import assert from "node:assert/strict";
import { test } from "node:test";
import { topPercent } from "../src/lib/learner/stats";

test("상위 % 계산", () => {
  assert.equal(topPercent(1, 31), 4);
  assert.equal(topPercent(16, 31), 52);
  assert.equal(topPercent(31, 31), 100);
  assert.equal(topPercent(1, 1), 100);
  assert.equal(topPercent(1, 2000), 0.1, "1% 미만은 소수점 한 자리");
});

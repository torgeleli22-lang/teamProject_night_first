import assert from "node:assert/strict";
import { test } from "node:test";
import { clearFailures, isLockedOut, recordFailure } from "../src/lib/server/admin-auth";

test("관리자 코드를 10번 틀리면 15분 동안 막고, 맞히면 기록을 지운다", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 9; i++) recordFailure("1.2.3.4", t0);
  assert.equal(isLockedOut("1.2.3.4", t0), false);
  recordFailure("1.2.3.4", t0);
  assert.equal(isLockedOut("1.2.3.4", t0), true);
  assert.equal(isLockedOut("5.6.7.8", t0), false); // 다른 주소는 영향 없음
  assert.equal(isLockedOut("1.2.3.4", t0 + 16 * 60_000), false); // 15분 지나면 풀림
  recordFailure("9.9.9.9", t0);
  clearFailures("9.9.9.9");
  assert.equal(isLockedOut("9.9.9.9", t0), false);
});

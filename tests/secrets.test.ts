/** 민감 정보 가리기 (src/lib/secrets.ts) — lambda/api/inspect_code.py 의 mask_secrets 와 같은 결과여야 한다 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkUpload, MASK, maskSecrets, normalizeCode } from "../src/lib/secrets";

test("값만 가리고 코드 모양은 그대로", () => {
  const code = ['API_KEY = "abcd1234efgh"', `key = "AKIA${"A".repeat(16)}"`, 'name = "민지"', "token: 'ghp_" + "x".repeat(24) + "'"].join("\n");
  const r = maskSecrets(code);
  const lines = r.code.split("\n");
  assert.equal(lines[0], `API_KEY = "${MASK}"`);
  assert.ok(!r.code.includes("AKIA"));
  assert.equal(lines[2], 'name = "민지"');
  assert.equal(lines.length, 4);
  assert.deepEqual([...new Set(r.masked.map((m) => m.line))], [1, 2, 4]);
});

test("이미 가린 코드는 다시 세지 않음 (서버에서 한 번 더 가려도 같음)", () => {
  const once = maskSecrets('password = "hunter2hunter2"').code;
  assert.deepEqual(maskSecrets(once), { code: once, masked: [] });
});

test("올리기 전 확인: Python 만, 300줄까지", () => {
  assert.match(checkUpload("console.log(1)", "a.js")!, /Python\(\.py\) 코드만/);
  assert.match(checkUpload("x", "a.txt")!, /\.py\) 파일만/);
  assert.match(checkUpload("x = 1\n".repeat(301), "a.py")!, /301줄/);
  assert.equal(checkUpload("x = 1\n".repeat(300), "a.py"), null);
  assert.equal(normalizeCode("\r\n\ta = 1\r\n"), "    a = 1");
});

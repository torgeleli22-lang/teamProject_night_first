/** Python 문법 색칠 (src/lib/highlight.ts) 과 메모 도우미 (src/lib/memos.ts) */
import assert from "node:assert/strict";
import { test } from "node:test";
import { highlightLine } from "../src/lib/highlight";
import { circled, overlaps } from "../src/lib/memos";

test("글자를 잃지 않고 종류를 나눈다", () => {
  const line = '    if count == 0:  # 품절 "확인"';
  const tokens = highlightLine(line);
  assert.equal(tokens.map((t) => t.text).join(""), line);
  assert.equal(tokens.find((t) => t.text === "if")?.kind, "kw");
  assert.equal(tokens.find((t) => t.text === "0")?.kind, "num");
  assert.equal(tokens.at(-1)?.kind, "com");
});

test("문자열·함수 호출", () => {
  const tokens = highlightLine('print(f"{item}: 판매 불가")');
  assert.equal(tokens[0].kind, "bi");
  assert.ok(tokens.some((t) => t.kind === "str" && t.text.startsWith('f"')));
  assert.equal(highlightLine("status = check_stock(item)").find((t) => t.text === "check_stock")?.kind, "fn");
});

test("범위 겹침과 메모 번호", () => {
  assert.ok(overlaps({ start: 8, end: 16 }, { start: 16, end: 20 }));
  assert.ok(!overlaps({ start: 8, end: 15 }, { start: 16, end: 20 }));
  assert.equal(circled(1), "①");
  assert.equal(circled(20), "⑳");
});

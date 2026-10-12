import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMessages } from "../src/lib/ai/client";

test("이전 대화 + 이번 질문을 user/assistant 가 번갈아 오는 대화로 만든다", () => {
  const m = buildMessages(
    [
      { role: "user", text: "변수가 뭐예요?" },
      { role: "assistant", text: "값을 담는 상자예요." },
    ],
    "더 자세히 알려 주세요",
  );
  assert.deepEqual(m.map((x) => x.role), ["user", "assistant", "user"]);
  assert.equal(m[2].text, "더 자세히 알려 주세요");
});

test("assistant 로 시작하거나 같은 역할이 이어지면 정리한다", () => {
  const m = buildMessages(
    [
      { role: "assistant", text: "안녕하세요" },
      { role: "user", text: "질문 1" },
      { role: "user", text: "질문 2" },
      { role: "assistant", text: "  " },
    ],
    "질문 3",
  );
  assert.deepEqual(m, [{ role: "user", text: "질문 1\n\n질문 2\n\n질문 3" }]);
});

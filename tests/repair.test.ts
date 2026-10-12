import assert from "node:assert/strict";
import { test } from "node:test";
import * as z from "zod/v4";
import { repairForSchema } from "../src/lib/ai/client";

const Schema = z.object({
  title: z.string(),
  questions: z.array(
    z.object({
      type: z.enum(["multiple_choice", "short_answer"]),
      choices: z.array(z.object({ text: z.string(), misconception: z.string().nullable() })).nullable(),
      answerIndex: z.number().int().nullable(),
      output: z.string().nullable(),
      hints: z.array(z.string()),
    }),
  ),
});
const json = (() => {
  const { $schema: _s, ...rest } = z.toJSONSchema(Schema) as Record<string, unknown>;
  return rest;
})();

test("빠뜨린 null 칸, 문자열로 감싼 배열, 문자열 숫자를 고쳐서 검증을 통과한다", () => {
  const raw = {
    title: "제목",
    questions: [
      { type: "short_answer", hints: '["힌트1","힌트2"]' },
      { type: "multiple_choice", choices: '[{"text":"1명"},{"text":"2명","misconception":"x"}]', answerIndex: "1", hints: [] },
    ],
  };
  assert.equal(Schema.safeParse(raw).success, false);
  const fixed = Schema.parse(repairForSchema(raw, json));
  assert.equal(fixed.questions[0].choices, null);
  assert.deepEqual(fixed.questions[0].hints, ["힌트1", "힌트2"]);
  assert.equal(fixed.questions[1].answerIndex, 1);
  assert.equal(fixed.questions[1].choices?.[0].misconception, null);
});

test("고칠 수 없는 오류(필수 문자열 누락, 잘못된 enum)는 그대로 실패한다", () => {
  assert.equal(Schema.safeParse(repairForSchema({ questions: [] }, json)).success, false);
  assert.equal(Schema.safeParse(repairForSchema({ title: "t", questions: [{ type: "essay", hints: [] }] }, json)).success, false);
});

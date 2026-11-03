/** 화면이 경로로 고르는 함수가 lambda/functions.json 의 paths 와 같은지 (경로 → 함수 표는 한 벌씩, 이 시험이 맞춰 줘요) */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { baseFor, FUNCTION_PATHS, functionFor, parseApiUrls } from "../src/lib/api-routes";

type Fn = { key: string; paths: string[]; legacy?: boolean };
const spec = JSON.parse(fs.readFileSync(new URL("../lambda/functions.json", import.meta.url), "utf8")) as { functions: Fn[] };
const functions = spec.functions.filter((f) => !f.legacy);

test("경로 앞부분 → 함수가 functions.json 과 같음", () => {
  assert.deepEqual(Object.fromEntries(functions.map((f) => [f.key, f.paths])), FUNCTION_PATHS);
  for (const f of functions) {
    for (const p of f.paths) {
      assert.equal(functionFor(p), f.key, p);
      assert.equal(functionFor(`${p}/x?y=1`), f.key, p);
    }
  }
  assert.equal(functionFor("/review/retry"), "review");
  assert.equal(functionFor("/code?codeId=1"), "review");
  assert.equal(functionFor("/auth/start?provider=google"), "auth");
  assert.equal(functionFor("/reviews"), null); // 앞부분이 글자만 같은 것은 아님
});

test("함수별 주소, 없으면 주소 하나로", () => {
  const urls = parseApiUrls('{"review": "https://r.example/", "auth": "https://a.example", "x": "https://bad", "study": 3}');
  assert.deepEqual(urls, { review: "https://r.example", auth: "https://a.example" });
  assert.equal(baseFor("/review", urls, "https://one"), "https://r.example");
  assert.equal(baseFor("/practice", urls, "https://one"), "https://one");
  assert.deepEqual(parseApiUrls("{깨짐"), {});
  assert.deepEqual(parseApiUrls(undefined), {});
});

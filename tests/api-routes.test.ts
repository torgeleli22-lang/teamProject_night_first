/** 화면이 경로로 고르는 함수가 lambda/jojo_<함수> 폴더의 ROUTES 와 같은지 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { baseFor, FUNCTION_PATHS, functionFor, parseApiUrls } from "../src/lib/api-routes";

/** lambda/jojo_<key>/ 의 .py 에 적힌 "GET /경로" · "POST /경로" */
function routesOf(key: string): string[] {
  const dir = path.join("lambda", `jojo_${key}`);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".py"))
    .flatMap((f) => [...fs.readFileSync(path.join(dir, f), "utf8").matchAll(/"(?:GET|POST) (\/[\w/]*)"/g)].map((m) => m[1]));
}

test("경로 → 함수가 Lambda 의 ROUTES 와 같음", () => {
  for (const key of Object.keys(FUNCTION_PATHS)) {
    const routes = routesOf(key);
    assert.ok(routes.length > 0, key);
    for (const p of routes) assert.equal(functionFor(p), key, p);
  }
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

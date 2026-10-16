/**
 * 화면(정적 페이지)과 Lambda 의 경계 점검.
 * 화면 코드가 Lambda 코드(lambda/ 폴더)를 가져오면 정답·채점 기준이나 DB 코드가 브라우저로 새어 나갈 수 있다.
 * 화면은 Lambda 를 src/lib/api.ts 로 부르기만 하고, 응답 모양은 src/lib/api-types.ts 로 안다.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const UI_DIRS = ["src/app", "src/components", "src/lib"];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test("화면 코드는 Lambda 코드를 가져오지 않는다 (시드 난이도 계산만 예외)", () => {
  const offenders: string[] = [];
  for (const file of UI_DIRS.flatMap(files)) {
    if (file.includes(`${path.sep}content${path.sep}seed${path.sep}`)) continue; // 빌드·검증용 시드 (화면에서 쓰지 않음)
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (/from\s+"[^"]*lambda\//.test(line)) offenders.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("화면은 시드 문제(정답 포함)를 가져오지 않는다", () => {
  const offenders = ["src/app", "src/components"].flatMap(files).filter((f) => /content\/seed/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});

test("Lambda 는 함수 두 개: Python(lambda/api) 하나 + 코드 문제 생성 Node.js(lambda/generate-code)", () => {
  const folders = fs.readdirSync("lambda", { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "tests").map((e) => e.name);
  assert.deepEqual(folders.sort(), ["api", "generate-code"]);
  assert.ok(fs.existsSync("lambda/api/lambda_function.py") && fs.existsSync("lambda/api/common.py"));
  assert.ok(fs.existsSync("lambda/generate-code/index.mjs"));
});

test("Next.js 서버 기능(API 라우트·미들웨어)을 쓰지 않는다 (정적 내보내기)", () => {
  assert.equal(fs.existsSync("src/app/api"), false);
  assert.equal(fs.existsSync("src/middleware.ts"), false);
});

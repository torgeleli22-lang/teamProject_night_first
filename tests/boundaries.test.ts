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

test("Lambda 경로 표가 화면(api.ts)과 로컬 서버(local_lambdas.py)에서 같다", () => {
  const ts = fs.readFileSync("src/lib/api.ts", "utf8");
  const py = fs.readFileSync("scripts/local_lambdas.py", "utf8");
  const names: Record<string, string> = { questions: "questions", submitAnswer: "submit-answer", tutorChat: "tutor-chat", admin: "admin" };
  for (const [, prefix, lambda] of ts.matchAll(/\["(\/[a-z]+)", "([a-zA-Z]+)"\]/g)) {
    if (prefix === "/admin") continue;
    assert.match(py, new RegExp(`"${prefix}": "${names[lambda]}"`), `${prefix} → ${names[lambda]}`);
  }
});

test("모든 Python Lambda 가 같은 common.py 를 쓴다 (폴더에 따로 복사하지 않음)", () => {
  const folders = fs.readdirSync("lambda", { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join("lambda", e.name, "lambda_function.py")));
  assert.ok(folders.length >= 8);
  for (const f of folders) assert.equal(fs.existsSync(path.join("lambda", f.name, "common.py")), false, `lambda/${f.name}/common.py`);
});

test("Next.js 서버 기능(API 라우트·미들웨어)을 쓰지 않는다 (정적 내보내기)", () => {
  assert.equal(fs.existsSync("src/app/api"), false);
  assert.equal(fs.existsSync("src/middleware.ts"), false);
});

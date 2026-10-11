/**
 * 화면(정적 페이지)과 서버(Lambda API)의 경계 점검.
 * 화면 코드가 서버 코드를 '실행용'으로 가져오면 정답·채점 기준이나 DB 코드가 브라우저로 새어 나갈 수 있다.
 * 화면에서는 서버 코드를 `import type`(타입만)으로만 가져올 수 있다.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const UI_DIRS = ["src/app", "src/components"];
const SERVER_ONLY = /from\s+"@\/(lib\/server|lib\/ai|api)(\/[^"]*)?"/;

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test("화면 코드는 서버 코드를 타입으로만 가져온다", () => {
  const offenders: string[] = [];
  for (const file of UI_DIRS.flatMap(files)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (SERVER_ONLY.test(line) && !/^\s*(import|export)\s+type\s/.test(line)) offenders.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("Next.js 서버 기능(API 라우트·미들웨어)을 쓰지 않는다 (정적 내보내기)", () => {
  assert.equal(fs.existsSync("src/app/api"), false);
  assert.equal(fs.existsSync("src/middleware.ts"), false);
});

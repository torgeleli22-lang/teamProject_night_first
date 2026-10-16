/** 화면(src/)은 lambda/ 를 가져오지 않고 src/lib/api.ts 로만 서버를 부른다 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

test("화면 코드가 lambda/ 를 가져오지 않음", () => {
  for (const f of files("src").filter((f) => /\.(ts|tsx)$/.test(f))) {
    const text = fs.readFileSync(f, "utf8");
    assert.ok(!/from\s+["'][^"']*lambda\//.test(text), `${f} 가 lambda/ 를 가져와요`);
    if (!f.endsWith(path.join("lib", "api.ts"))) assert.ok(!/\bfetch\(/.test(text), `${f} 는 src/lib/api.ts 로만 서버를 불러요`);
  }
});

test("화면의 민감 정보 모양이 Lambda 와 같음", () => {
  const py = fs.readFileSync("lambda/api/inspect_code.py", "utf8");
  const ts = fs.readFileSync("src/lib/secrets.ts", "utf8");
  for (const kind of ["AWS 액세스 키", "API 키", "GitHub 토큰", "Slack 토큰", "Google API 키", "비밀 값"]) {
    assert.ok(py.includes(`"${kind}"`) && ts.includes(`"${kind}"`), kind);
  }
});

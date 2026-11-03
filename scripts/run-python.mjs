/**
 * Python 명령 실행 (npm run test:lambda 등). .venv(npm run setup:python) → python3 → python 순서로 찾는다. 다른 Python 을 쓰려면 PYTHON=경로
 * --plain: Lambda 라이브러리 없이 표준 라이브러리만 쓰는 스크립트 (npm run package · deploy)
 */
import { spawnSync } from "node:child_process";
import { findPython } from "./python-path.mjs";

const plain = process.argv[2] === "--plain";
const args = process.argv.slice(plain ? 3 : 2);
const python = findPython({ libs: !plain });
if (!python) {
  console.error(plain ? "✗ Python 3 이 필요해요" : "✗ Python 과 Lambda 라이브러리가 필요해요. 준비: npm run setup:python");
  process.exit(1);
}
const result = spawnSync(python, args, { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
process.exit(result.status ?? 1);

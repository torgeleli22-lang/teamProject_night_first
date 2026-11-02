/**
 * Python 명령 실행 (npm run test:lambda 등). .venv(npm run setup:python) → python3 → python 순서로 찾는다. 다른 Python 을 쓰려면 PYTHON=경로
 */
import { spawnSync } from "node:child_process";
import { findPython } from "./python-path.mjs";

const python = findPython();
if (!python) {
  console.error("✗ Python 과 Lambda 라이브러리가 필요해요. 준비: npm run setup:python");
  process.exit(1);
}
const result = spawnSync(python, process.argv.slice(2), { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
process.exit(result.status ?? 1);

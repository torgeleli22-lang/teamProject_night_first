/**
 * Python 명령 실행 (npm run test:lambda 등). python3 → python 순서로 찾는다. 다른 Python 을 쓰려면 PYTHON=경로
 */
import { spawnSync } from "node:child_process";

const candidates = process.env.PYTHON ? [process.env.PYTHON] : ["python3", "python"];
const python = candidates.find((p) => spawnSync(p, ["-c", "import boto3"], { stdio: "ignore" }).status === 0);
if (!python) {
  console.error("✗ Python 과 boto3 가 필요해요. 설치: python3 -m pip install boto3");
  process.exit(1);
}
const result = spawnSync(python, process.argv.slice(2), { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
process.exit(result.status ?? 1);

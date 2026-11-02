/**
 * 내 컴퓨터의 Python 준비 (npm run setup:python): 저장소 안 .venv 에 Lambda 가 쓰는 라이브러리(lambda/requirements.txt)와 boto3 를 설치한다.
 * npm run api · test · verify 는 .venv 가 있으면 그 Python 을 쓴다 (scripts/python-path.mjs).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { venvPython } from "./python-path.mjs";

const base = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (!fs.existsSync(venvPython)) run(base, ["-m", "venv", ".venv"]);
run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
run(venvPython, ["-m", "pip", "install", "-r", "lambda/requirements.txt", "boto3"]);
console.log("✓ .venv 준비 완료 (Lambda 라이브러리 + boto3)");

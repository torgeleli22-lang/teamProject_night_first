/** 쓸 Python 고르기: PYTHON=경로 → 저장소의 .venv (npm run setup:python) → python3 → python. boto3 와 Lambda 라이브러리(lambda/requirements.txt)가 불러와지는 것만 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
export const venvPython = path.join(ROOT, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

const NEEDED = "import boto3, aws_lambda_powertools, pydantic, tree_sitter, tree_sitter_javascript";

/** libs: false 면 표준 라이브러리만 쓰는 스크립트용 (묶기·배포 — CloudShell 의 기본 Python 이면 돼요) */
export function findPython({ libs = true } = {}) {
  const candidates = process.env.PYTHON ? [process.env.PYTHON] : [...(fs.existsSync(venvPython) ? [venvPython] : []), "python3", "python"];
  return candidates.find((p) => spawnSync(p, ["-c", libs ? NEEDED : "import json, zipfile"], { stdio: "ignore" }).status === 0);
}

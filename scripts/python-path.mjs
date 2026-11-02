/** 쓸 Python 고르기: PYTHON=경로 → 저장소의 .venv (npm run setup:python) → python3 → python. boto3 가 불러와지는 것만 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
export const venvPython = path.join(ROOT, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

export function findPython() {
  const candidates = process.env.PYTHON ? [process.env.PYTHON] : [...(fs.existsSync(venvPython) ? [venvPython] : []), "python3", "python"];
  return candidates.find((p) => spawnSync(p, ["-c", "import boto3"], { stdio: "ignore" }).status === 0);
}

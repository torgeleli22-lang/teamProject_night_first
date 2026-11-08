"""
예시 코드 검증 (npm run verify): lambda/jojo_practice/samples.py 의 코드를 실제로 실행해 보고 흐름 단위를 확인한다.
- 실행: 오류 없이 끝나고 무언가를 출력해야 한다 (5초 제한, Python · JavaScript 는 node). 출력은 손으로 따라갈 크기 안 (levels.TRACE_SIZE)
- 규칙 검사 1(문법)을 통과해야 한다
- 흐름 단위: 코드 줄 범위 안, 빈 줄로 시작·끝나지 않음, 모범 설명(300자 이하)·핵심 표현(설명 안의 말)이 있음, 설명할 곳(key) 1곳 이상·서로 겹치지 않음
- 언어 × 난이도마다 하나씩, 랜덤 주제는 겹치지 않고 50자 이하
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path[:0] = [os.path.join(ROOT, "lambda", "shared"), os.path.join(ROOT, "lambda", "jojo_practice")]
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-northeast-2")

from core import LANGUAGES, LEVELS  # noqa: E402
from generate import EXPLANATION_MAX, MAX_TOPIC_CHARS  # noqa: E402
from levels import TRACE_SIZE  # noqa: E402
from rules import code_problems  # noqa: E402
from samples import SAMPLES, TOPIC_POOL  # noqa: E402

failures = []
squash = lambda t: "".join(str(t).split())

for s in SAMPLES:
    sid, language, lines = s["id"], s["language"], s["code"].split("\n")
    bad = lambda msg: failures.append(f"{sid}: {msg}")
    # 1. 실제 실행
    if language == "javascript":
        node = shutil.which("node")
        run = subprocess.run([node, "-e", s["code"]], capture_output=True, text=True, timeout=5) if node else None
        if not node:
            bad("node 가 없어 JavaScript 예시 코드를 실행해 보지 못했어요")
    else:
        run = subprocess.run([sys.executable, "-I", "-c", s["code"]], capture_output=True, text=True, timeout=5,
                             env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    if run and run.returncode != 0:
        bad("실행 오류\n" + run.stderr.strip())
    elif run and not run.stdout.strip():
        bad("출력이 없어요")
    elif run and [x for x in run.stdout.split("\n") if x.strip()] != s.get("output"):
        bad("output(화면에 보여 줄 출력)이 실제 실행 출력과 달라요")
    elif run and len([x for x in run.stdout.split("\n") if x.strip()]) > TRACE_SIZE[s["level"]]["output"]:
        bad(f"출력이 {TRACE_SIZE[s['level']]['output']}줄을 넘어요 (손으로 따라갈 크기, docs/GENERATION_STANDARD.md 3.1)")
    # 2. 규칙 검사 1
    for p in code_problems(s["code"], language):
        bad(f"규칙 검사: {p}")
    # 3. 흐름 단위
    keys = sorted((u for u in s["units"] if u["key"]), key=lambda u: u["start"])
    if not keys:
        bad("설명할 곳(key)이 없어요")
    if any(keys[i]["end"] >= keys[i + 1]["start"] for i in range(len(keys) - 1)):
        bad("설명할 곳끼리 겹쳐요")
    for u in s["units"]:
        where = f"{u['start']}~{u['end']}번 줄"
        if not (1 <= u["start"] <= u["end"] <= len(lines)):
            bad(f"{where}이 코드 밖이에요")
            continue
        if not lines[u["start"] - 1].strip() or not lines[u["end"] - 1].strip():
            bad(f"{where}이 빈 줄로 시작하거나 끝나요")
        outside = [k for k in u.get("keywords", []) if squash(k) not in squash(u.get("explanation", ""))]
        if not u.get("explanation") or len(u["explanation"]) > EXPLANATION_MAX or not u.get("keywords") or outside:
            bad(f"{where}의 모범 설명·핵심 표현이 기준과 달라요 ({EXPLANATION_MAX}자 이하, 핵심 표현은 설명 안의 말: {outside})")
    mark = "✗" if any(f.startswith(sid + ":") for f in failures) else "✓"
    print(f"{mark} {sid} ({language}, {LEVELS.get(s['level'], {}).get('name')}, {len(lines)}줄, 설명할 곳 {len(keys)}곳)")

have = {(s["language"], s["level"]) for s in SAMPLES}
missing = [(lang, lv) for lang in LANGUAGES for lv in LEVELS if (lang, lv) not in have]
if missing:
    failures.append(f"예시 코드가 없는 언어·난이도: {missing}")
if len({s["id"] for s in SAMPLES}) != len(SAMPLES):
    failures.append("예시 코드 id 가 겹쳐요")
if len(set(TOPIC_POOL)) != len(TOPIC_POOL) or any(len(t) > MAX_TOPIC_CHARS for t in TOPIC_POOL):
    failures.append(f"랜덤 주제가 겹치거나 {MAX_TOPIC_CHARS}자를 넘어요")

if failures:
    print("\n".join(["", "검증 실패:"] + failures))
    sys.exit(1)
print(f"\n예시 코드 {len(SAMPLES)}개 · 랜덤 주제 {len(TOPIC_POOL)}개 검증 통과")

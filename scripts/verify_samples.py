"""
예시 코드 검증 (npm run verify): lambda/api/samples.py 의 코드를 실제로 실행해 보고 ※ 지점을 확인한다.
- 실행: 오류 없이 끝나고 무언가를 출력해야 한다 (5초 제한, 따로 띄운 Python 에서)
- ※ 지점: 코드 줄 범위 안, 겹치지 않음, 빈 줄로 시작·끝나지 않음, 모범 설명·핵심 표현이 있음
- 목업 AI 응답으로 바꿨다가 다시 줄 번호를 찾으면 같은 범위가 나와야 한다
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "lambda", "api"))
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-northeast-2")

import practice  # noqa: E402
from common import LEVELS, clean_marks  # noqa: E402
from samples import ADVANCED_TOPIC_POOL, SAMPLES, TOPIC_POOL  # noqa: E402

failures = []


def fail(sample_id, message):
    failures.append(f"{sample_id}: {message}")


for s in SAMPLES:
    sid = s["id"]
    # 1. 실제 실행
    run = subprocess.run([sys.executable, "-I", "-c", s["code"]], capture_output=True, text=True, timeout=5,
                         env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    if run.returncode != 0:
        fail(sid, "실행 오류\n" + run.stderr.strip())
    elif not run.stdout.strip():
        fail(sid, "출력이 없어요")
    # 2. 난이도·길이
    lines = s["code"].split("\n")
    if s["level"] not in LEVELS:
        fail(sid, f"없는 난이도 {s['level']}")
    elif not practice.MIN_LINES[s["level"]] <= len(lines) <= practice.MAX_LINES[s["level"]]:
        fail(sid, f"{len(lines)}줄이에요 ({practice.MIN_LINES[s['level']]}~{practice.MAX_LINES[s['level']]}줄이어야 해요)")
    elif len(s["marks"]) != practice.MARK_COUNT[s["level"]] and s["level"] == 4:
        fail(sid, f"고급은 ※ 지점이 {practice.MARK_COUNT[4]}곳이어야 해요")
    # 3. ※ 지점
    if len(clean_marks(s["code"], s["marks"], limit=5)) != len(s["marks"]) or len(s["marks"]) < 2:
        fail(sid, "※ 지점이 2곳보다 적거나, 범위를 벗어났거나, 겹쳐요")
    for m in s["marks"]:
        if not (1 <= m["start"] <= m["end"] <= len(lines)):
            continue
        if not lines[m["start"] - 1].strip() or not lines[m["end"] - 1].strip():
            fail(sid, f"※ {m['start']}~{m['end']}번 줄이 빈 줄로 시작하거나 끝나요")
        if not m.get("explanation") or not m.get("keywords") or not m.get("why"):
            fail(sid, f"※ {m['start']}~{m['end']}번 줄에 why·explanation·keywords 가 필요해요")
    # 4. 목업 AI 응답 왕복
    _, marks, problems = practice.check_generated(practice.sample_as_ai(s), s["level"])
    if problems or [(m["start"], m["end"]) for m in marks] != [(m["start"], m["end"]) for m in s["marks"]]:
        fail(sid, f"줄 글자로 ※ 지점을 다시 찾지 못했어요 {problems}")
    print(f"{'✗' if any(f.startswith(sid + ':') for f in failures) else '✓'} {sid} ({LEVELS.get(s['level'], {}).get('name')}, {len(lines)}줄, ※ {len(s['marks'])}곳)")

if len(set(s["id"] for s in SAMPLES)) != len(SAMPLES):
    failures.append("예시 코드 id 가 겹쳐요")
if any(len(set(p)) != len(p) or any(len(t) > 50 for t in p) for p in (TOPIC_POOL, ADVANCED_TOPIC_POOL)):
    failures.append("랜덤 주제가 겹치거나 50자를 넘어요")

if failures:
    print("\n".join(["", "검증 실패:"] + failures))
    sys.exit(1)
print(f"\n예시 코드 {len(SAMPLES)}개 · 랜덤 주제 {len(TOPIC_POOL)}개 검증 통과")

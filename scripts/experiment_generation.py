"""
문항 생성·검증 실험 (논문 표 1) — 실제 Lambda 코드(lambda/api/practice.make_code)로 연습 문항을 만들고 단계별 결과를 기록한다.

  언어 2(Python·JavaScript) × 난이도 4 × 반복 5 = 40문항 (기본값)
  문항마다: ① 출제 → ② 규칙 검사 → ③ AI 교차 검토(모범 설명 교정) → (걸리면 한 번 재생성) → 그래도 안 되면 예시 코드
  서비스 코드는 바꾸지 않고, 단계 함수를 감싸서 결과만 옆에 적는다.

실행 (AWS CloudShell 권장 — docs/EXPERIMENT.md):
  python3.11 scripts/experiment_generation.py                 # 실제 AI(Bedrock), 40문항, 4개씩 동시에
  python3.11 scripts/experiment_generation.py --resume DIR    # 중간에 끊겼으면 이어서
  AI_MODE=mock python3 scripts/experiment_generation.py --offline-db --reps 1   # 비용 없이 스크립트만 확인

결과 (experiment_out/<시각>/):
  results.jsonl  문항 하나당 한 줄 (모든 단계 기록)      results.csv  표로 보기
  summary.md     표 1 값 + 언어·난이도별 표               verify.md    무작위 AI 문항 10개: 실제 실행 출력 ↔ ※ 모범 설명 (연구진이 일치 여부 표시)
"""
import argparse
import csv
import json
import os
import random
import statistics
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

# 1. Lambda 코드 불러오기 (환경 변수는 import 전에 정한다)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "lambda", "api"))
os.environ.setdefault("AI_MODE", "live")
os.environ.setdefault("TABLE_NAME", "jojo_table")

import common    # noqa: E402
import practice  # noqa: E402
from samples import ADVANCED_TOPIC_POOL, TOPIC_POOL  # noqa: E402

LEVEL_NAMES = {1: "입문", 2: "초급", 3: "중급", 4: "고급"}
_local = threading.local()   # 지금 이 스레드가 만들고 있는 문항의 기록


def rec():
    return getattr(_local, "rec", None)


# ───────────────────────── 2. 단계 함수 감싸기 (결과만 기록, 동작은 그대로) ─────────────────────────

_orig = {
    "check_generated": practice.check_generated,
    "ai_check_code": practice.ai_check_code,
    "ask_ai": practice.ask_ai,
    "log_usage": common.log_usage,
}


def check_generated(r, level, language="python"):
    """② 규칙 검사: 시도마다 문제 목록을 적는다"""
    code, marks, problems = _orig["check_generated"](r, level, language)
    rec()["attempts"].append({"lines": len(code.split("\n")), "marks": len(marks), "rule_problems": problems,
                              "check_problems": None, "check_ran": False, "fixed": 0})
    return code, marks, problems


def ai_check_code(code, marks, level, language):
    """③ 교차 검토: 재생성할 문제와, 교체된 모범 설명 수를 적는다"""
    before = {m["id"]: m["explanation"] for m in marks}
    problems, fixed_marks = _orig["ai_check_code"](code, marks, level, language)
    attempt = rec()["attempts"][-1]
    attempt["check_ran"] = not rec().pop("_check_unavailable", False)
    attempt["check_problems"] = problems
    attempt["fixed"] = sum(1 for m in fixed_marks if before.get(m["id"]) != m["explanation"])
    attempt["fixed_ids"] = [m["id"] for m in fixed_marks if before.get(m["id"]) != m["explanation"]]
    return problems, fixed_marks


def ask_ai(task, *args, **kwargs):
    """AI 호출 시간·실패 이유를 적는다 (code_generation · code_check)"""
    started = time.time()
    try:
        return _orig["ask_ai"](task, *args, **kwargs)
    except common.AiUnavailable as e:
        rec()["ai_errors"].append(f"{task}: {e}")
        if task == "code_check":
            rec()["_check_unavailable"] = True
        raise
    finally:
        rec()["ai_calls"].append({"task": task, "sec": round(time.time() - started, 2)})


def log_usage(task, model, inp, out, cache_read, ok, error=None, ms=0):
    """토큰 수를 문항 기록에 더한다 (원래 기록 — OPS#USAGE · OPS#AILOG — 도 그대로)"""
    r = rec()
    if r is not None:
        r["tokens_in"] += int(inp or 0)
        r["tokens_out"] += int(out or 0)
    return _orig["log_usage"](task, model, inp, out, cache_read, ok, error=error, ms=ms)


def install_hooks(offline_db):
    practice.check_generated = check_generated
    practice.ai_check_code = ai_check_code
    practice.ask_ai = ask_ai
    common.log_usage = log_usage
    practice.ai_allowed = lambda req: True   # 실험은 요청 수 한도(1시간 30번)에 막히지 않게. 월 예산 확인(check_budget)은 그대로
    if offline_db:   # DynamoDB 없이 (내 컴퓨터에서 스크립트만 확인할 때)
        common.month_cost_usd = lambda include_mock=False: 0.0
        common.ai_switch_on = lambda: True
        _orig["log_usage"] = lambda *a, **k: None
        practice.log_ai_event = lambda *a, **k: None


# ───────────────────────── 3. 문항 하나 만들기 ─────────────────────────


def make_one(item):
    _local.rec = r = {**item, "attempts": [], "ai_calls": [], "ai_errors": [], "tokens_in": 0, "tokens_out": 0}
    user = {"userId": "experiment", "recentTopics": [], "member": False}
    req = {"ip": "experiment", "headers": {}, "user": user}
    started = time.time()
    try:
        made = practice.make_code(req, item["level"], item["topic"], user, prompt_extra="", language=item["language"])
        r.update(origin=made["origin"], note=made.get("note"), title=made["title"], code=made["code"],
                 marks=[{k: m[k] for k in ("id", "start", "end", "concept", "explanation", "keywords")} for m in made["marks"]])
    except Exception as e:   # 예상하지 못한 오류도 기록하고 다음 문항으로
        r.update(origin="error", note=repr(e), title="", code="", marks=[])
    r["seconds"] = round(time.time() - started, 2)
    r.pop("_check_unavailable", None)
    _local.rec = None
    return r


def plan(reps, seed):
    """언어 × 난이도 × 반복. 주제는 서비스의 랜덤 주제 목록에서 (고급은 알고리즘 주제), 같은 seed 면 같은 순서"""
    rnd = random.Random(seed)
    items = []
    for language in ("python", "javascript"):
        for level in (1, 2, 3, 4):
            pool = list(ADVANCED_TOPIC_POOL if level == 4 else TOPIC_POOL)
            rnd.shuffle(pool)
            for i in range(reps):
                items.append({"no": len(items) + 1, "language": language, "level": level, "rep": i + 1, "topic": pool[i % len(pool)]})
    return items


# ───────────────────────── 4. 표 1 계산 ─────────────────────────


def pct(n, d):
    return f"{n}/{d} ({100 * n / d:.1f}%)" if d else "0/0"


def summarize(rows):
    n = len(rows)
    first = [r["attempts"][0] for r in rows if r["attempts"]]
    rule_first = sum(1 for a in first if a["rule_problems"])
    check_first = sum(1 for a in first if not a["rule_problems"] and a["check_problems"])
    rule_any = sum(1 for r in rows if any(a["rule_problems"] for a in r["attempts"]))
    check_any = sum(1 for r in rows if any(a["check_problems"] for a in r["attempts"]))
    ai = [r for r in rows if r["origin"] == "ai"]
    sample = [r for r in rows if r["origin"] == "sample"]
    errors = [r for r in rows if r["origin"] == "error"]
    final = [r["attempts"][-1] for r in ai if r["attempts"]]   # 최종 제공된 AI 문항의 마지막(통과한) 시도
    fixed = sum(a["fixed"] for a in final)
    marks_total = sum(len(r["marks"]) for r in ai)
    fixed_items = sum(1 for a in final if a["fixed"])
    no_check = sum(1 for r in ai if r["attempts"] and not r["attempts"][-1]["check_ran"])
    secs = [r["seconds"] for r in rows]
    table = [
        ("생성 문항 수", f"{n}개"),
        ("규칙 검사 재생성 판정 (첫 생성 기준)", pct(rule_first, n)),
        ("교차 검토 재생성 판정 (첫 생성 기준, 규칙 검사 통과 후)", pct(check_first, n)),
        ("교차 검토의 모범 설명 교정 (최종 AI 문항의 ※ 지점 기준)", f"{fixed}개 / {marks_total}곳 ({100 * fixed / marks_total:.1f}%) · 문항 {fixed_items}개" if marks_total else "0"),
        ("AI 문항 최종 제공", pct(len(ai), n)),
        ("예시 코드 대체", pct(len(sample), n)),
        ("모범 설명 실행 확인 (10문항)", "verify.md 에 표시 후 직접 집계"),
        ("문항당 평균 생성 시간", f"{statistics.mean(secs):.1f}초 (중앙값 {statistics.median(secs):.1f}초)" if secs else "-"),
    ]
    extra = [
        ("규칙 검사에 걸린 문항 (두 번째 시도 포함)", pct(rule_any, n)),
        ("교차 검토에 걸린 문항 (두 번째 시도 포함)", pct(check_any, n)),
        ("교차 검토를 하지 못하고 통과한 AI 문항 (검토 호출 실패)", f"{no_check}개"),
        ("실험 오류", f"{len(errors)}개"),
        ("AI 문항 평균 생성 시간", f"{statistics.mean([r['seconds'] for r in ai]):.1f}초" if ai else "-"),
        ("토큰 합계 (입력 / 출력)", f"{sum(r['tokens_in'] for r in rows):,} / {sum(r['tokens_out'] for r in rows):,}"),
    ]
    return table, extra


def breakdown(rows):
    out = ["| 언어 | 난이도 | 문항 | 규칙 재생성 | 교차 재생성 | 설명 교정 | AI 제공 | 예시 대체 | 평균 시간 |", "|---|---|---|---|---|---|---|---|---|"]
    for language in ("python", "javascript"):
        for level in (1, 2, 3, 4):
            g = [r for r in rows if r["language"] == language and r["level"] == level]
            if not g:
                continue
            first = [r["attempts"][0] for r in g if r["attempts"]]
            out.append(f"| {language} | {LEVEL_NAMES[level]} | {len(g)} | {sum(1 for a in first if a['rule_problems'])} | "
                       f"{sum(1 for a in first if not a['rule_problems'] and a['check_problems'])} | "
                       f"{sum(r['attempts'][-1]['fixed'] for r in g if r['origin'] == 'ai' and r['attempts'])} | "
                       f"{sum(1 for r in g if r['origin'] == 'ai')} | {sum(1 for r in g if r['origin'] == 'sample')} | "
                       f"{statistics.mean(r['seconds'] for r in g):.1f}초 |")
    return "\n".join(out)


def problem_examples(rows, limit=12):
    """논문에 예로 들 만한 검출 사례 (규칙 검사·교차 검토가 잡은 문제)"""
    out = []
    for r in rows:
        for i, a in enumerate(r["attempts"], 1):
            for p in (a["rule_problems"] or []) + (a["check_problems"] or []):
                out.append(f"- #{r['no']} {r['language']} {LEVEL_NAMES[r['level']]} 「{r['topic']}」 {i}차: {p}")
    return "\n".join(out[:limit]) or "- (없음)"


# ───────────────────────── 5. 모범 설명 실행 확인용 시트 ─────────────────────────


def run_code(code, language, folder, name):
    path = os.path.join(folder, f"{name}.{'py' if language == 'python' else 'js'}")
    with open(path, "w", encoding="utf-8") as f:
        f.write(code)
    cmd = [sys.executable, path] if language == "python" else ["node", path]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        return (p.stdout + (("\n[stderr]\n" + p.stderr) if p.stderr.strip() else "")).strip()
    except FileNotFoundError:
        return f"(실행기 {cmd[0]} 없음)"
    except subprocess.TimeoutExpired:
        return "(15초 안에 끝나지 않음)"


def verify_sheet(rows, out_dir, count, seed):
    ai = [r for r in rows if r["origin"] == "ai"]
    picked = sorted(random.Random(seed).sample(ai, min(count, len(ai))), key=lambda r: r["no"])
    folder = os.path.join(out_dir, "verify_code")
    os.makedirs(folder, exist_ok=True)
    lines = ["# 모범 설명 실행 확인", "",
             f"최종 제공된 AI 문항 {len(ai)}개 중 무작위 {len(picked)}개 (seed {seed}). 코드를 실제로 실행한 출력과 ※ 모범 설명의 값·순서·결과를 비교해",
             "각 ※ 지점에 `[x] 일치` 또는 `[x] 불일치` 를 표시하세요. 문항의 ※ 지점이 모두 일치하면 그 문항은 '일치'로 셉니다.", ""]
    for r in picked:
        name = f"q{r['no']:02d}_{r['language']}_L{r['level']}"
        output = run_code(r["code"], r["language"], folder, name)
        numbered = "\n".join(f"{i + 1:3}| {line}" for i, line in enumerate(r["code"].split("\n")))
        lines += [f"## #{r['no']} {r['title']} — {r['language']} · {LEVEL_NAMES[r['level']]} · 주제 「{r['topic']}」", "",
                  f"파일: `verify_code/{name}.{'py' if r['language'] == 'python' else 'js'}`", "",
                  "```", numbered, "```", "", "**실제 실행 출력**", "", "```", output or "(출력 없음)", "```", ""]
        for m in r["marks"]:
            lines += [f"- ※ {m['id']} ({m['start']}~{m['end']}번 줄, {m.get('concept', '')}): {m['explanation']}",
                      "  - [ ] 일치  [ ] 불일치  — 메모: "]
        lines += ["", "**문항 판정**: [ ] 일치  [ ] 불일치", "", "---", ""]
    with open(os.path.join(out_dir, "verify.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return len(picked)


# ───────────────────────── 6. 실행 ─────────────────────────


def main():
    ap = argparse.ArgumentParser(description="문항 생성·검증 실험 (논문 표 1)")
    ap.add_argument("--reps", type=int, default=5, help="언어·난이도마다 만들 문항 수 (기본 5 → 40문항)")
    ap.add_argument("--workers", type=int, default=4, help="동시에 만들 문항 수 (기본 4)")
    ap.add_argument("--seed", type=int, default=2026, help="주제 순서·확인 문항 고르기 (같은 값이면 같은 결과)")
    ap.add_argument("--verify", type=int, default=10, help="실행 확인할 AI 문항 수 (기본 10)")
    ap.add_argument("--resume", help="이어서 할 결과 폴더 (experiment_out/…)")
    ap.add_argument("--offline-db", action="store_true", help="DynamoDB 없이 (월 예산 확인·사용량 기록 생략) — 스크립트 확인용")
    args = ap.parse_args()

    if sys.version_info < (3, 10):
        sys.exit("Python 3.10 이상이 필요해요 (Lambda 는 3.13). CloudShell: sudo dnf install -y python3.11 → python3.11 로 실행")
    install_hooks(args.offline_db)
    out_dir = args.resume or os.path.join(ROOT, "experiment_out", datetime.now().strftime("%Y%m%d-%H%M%S"))
    os.makedirs(out_dir, exist_ok=True)
    jsonl = os.path.join(out_dir, "results.jsonl")
    done = {}
    if os.path.exists(jsonl):
        with open(jsonl, encoding="utf-8") as f:
            done = {(r := json.loads(line))["no"]: r for line in f if line.strip()}
    items = [i for i in plan(args.reps, args.seed) if i["no"] not in done]
    total = len(items) + len(done)
    print(f"AI_MODE={common.AI_MODE} · 모델 {common.MODEL_ID} · 문항 {total}개 (남은 {len(items)}개) · 동시 {args.workers}개 → {out_dir}")

    # 미리 확인: 실제 AI 를 부를 수 있는지 (권한·모델 접근 문제면 바로 멈춘다 — 전부 예시 코드가 되는 것을 막기)
    if common.AI_MODE == "live" and items:
        try:
            common.ask_ai("experiment_preflight", "짧게 답해.", "ok 라고만 답해.", {"type": "object", "properties": {"ok": {"type": "string"}}, "required": ["ok"]},
                          max_tokens=50)
        except common.AiUnavailable as e:
            sys.exit(f"✗ AI 를 부를 수 없어요: {e}\n  CloudShell 의 권한(Bedrock InvokeModel, us-east-1)·월 예산·관리자 AI 끄기를 확인해 주세요.")

    lock = threading.Lock()

    def work(item):
        r = make_one(item)
        with lock:
            with open(jsonl, "a", encoding="utf-8") as f:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
            done[r["no"]] = r
            first = r["attempts"][0] if r["attempts"] else {}
            print(f"[{len(done):2}/{total}] #{r['no']:02d} {r['language']:10} {LEVEL_NAMES[r['level']]} {r['origin']:6} {r['seconds']:6.1f}초 "
                  f"규칙 {'✗' if first.get('rule_problems') else '✓'} 검토 {'✗' if first.get('check_problems') else '✓'} 교정 {r['attempts'][-1]['fixed'] if r['attempts'] else 0} · {r['topic']}",
                  flush=True)

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        list(pool.map(work, items))

    # 결과 파일
    rows = [done[k] for k in sorted(done)]
    with open(os.path.join(out_dir, "results.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["no", "language", "level", "topic", "origin", "seconds", "attempts", "rule_problems_1", "check_problems_1",
                    "rule_problems_2", "check_problems_2", "fixed_final", "marks", "lines", "tokens_in", "tokens_out", "ai_errors", "note"])
        for r in rows:
            a = r["attempts"] + [{}] * (2 - len(r["attempts"]))
            w.writerow([r["no"], r["language"], r["level"], r["topic"], r["origin"], r["seconds"], len(r["attempts"]),
                        " | ".join(a[0].get("rule_problems") or []), " | ".join(a[0].get("check_problems") or []),
                        " | ".join(a[1].get("rule_problems") or []), " | ".join(a[1].get("check_problems") or []),
                        r["attempts"][-1]["fixed"] if r["origin"] == "ai" and r["attempts"] else 0, len(r["marks"]),
                        r["attempts"][-1]["lines"] if r["attempts"] else "", r["tokens_in"], r["tokens_out"], " | ".join(r["ai_errors"]), r["note"] or ""])
    picked = verify_sheet(rows, out_dir, args.verify, args.seed)
    table, extra = summarize(rows)
    md = ["# 문항 생성·검증 실험 결과", "",
          f"- 실행: {datetime.now():%Y-%m-%d %H:%M} · AI_MODE={common.AI_MODE} · 모델 `{common.MODEL_ID}` · seed {args.seed}",
          f"- 문항: 언어 2 × 난이도 4 × {args.reps}회 = {len(rows)}개 (주제는 서비스의 랜덤 주제 목록)", "",
          "## 표 1", "", "| 항목 | 결과 |", "|---|---|", *[f"| {k} | {v} |" for k, v in table], "",
          "## 참고 값", "", "| 항목 | 값 |", "|---|---|", *[f"| {k} | {v} |" for k, v in extra], "",
          "## 언어 · 난이도별", "", breakdown(rows), "",
          "## 검출 사례 (일부)", "", problem_examples(rows), "",
          "## 정의", "",
          "- 규칙 검사 재생성: 첫 생성 결과가 규칙 검사(ast 문법·정의 안 된 이름·금지 모듈/함수, JS 괄호·따옴표·금지 기능, 줄 수, ※ 줄 위치)에서 문제 ≥1 → 재생성",
          "- 교차 검토 재생성: 첫 생성이 규칙 검사는 통과했지만 교차 검토(같은 모델이 머릿속으로 실행)가 실행 오류·난이도 불일치를 찾아 재생성",
          "- 모범 설명 교정: 최종 제공된 AI 문항에서 교차 검토가 틀렸다고 판단해 교체한 ※ 모범 설명 수 / 그 문항들의 ※ 지점 총수 (재생성으로 버려진 시도의 교정은 세지 않음)",
          "- AI 최종 제공 / 예시 코드 대체: 최종 결과의 origin (ai / sample)",
          "- 생성 시간: 문항 하나를 요청해 최종 결과가 나올 때까지 (출제·검사·검토·재생성 포함)",
          f"- 모범 설명 실행 확인: verify.md ({picked}문항) — 연구진이 실제 실행 출력과 비교해 표시", ""]
    with open(os.path.join(out_dir, "summary.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md))
    print("\n" + "\n".join(f"  {k}: {v}" for k, v in table))
    print(f"\n✓ 결과: {out_dir}/summary.md · results.csv · verify.md")


if __name__ == "__main__":
    main()

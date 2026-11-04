"""
코드 생성·검증 실험 — 서비스와 똑같이 POST /practice 로 만들고, 관리자 코드(x-admin-token)로 단계별 기록을 함께 받는다.

  언어 2(Python·JavaScript) × 난이도 3(초급·중급·고급) × 반복 5 = 30문항 (기본값)
  문항마다: ① 생성 → 규칙 검사 1 → ② 검토(실행 추적·동작·난이도 6요소·모범 설명) → 규칙 검사 2 → (부분 수정·다시 만들기) → 그래도 안 되면 예시 코드

  python3 scripts/experiment_generation.py --url https://<jojo_practice 함수 URL>     # 관리자 코드를 물어봄 (화면에 보이지 않음)
  내 컴퓨터(목업): npm run api 를 켠 뒤 ADMIN_TOKEN=x 로 띄우고 EXPERIMENT_ADMIN_CODE=x python3 scripts/experiment_generation.py --url http://localhost:8787 --reps 1
  중간에 끊겼으면 같은 명령에 --resume experiment_out/<시각>

결과 (experiment_out/<시각>/):
  results.jsonl  문항 하나당 한 줄 (단계 기록 전부)   results.csv  표로 보기
  summary.md     결과 표 + 언어·난이도별 표            verify.md    무작위 AI 문항: 코드 + 실제 실행 출력 + 검토 기록·모범 설명 (연구진이 일치 여부 표시)
Python 3.9 이상, 표준 라이브러리만 씀 (CloudShell 기본 python3 로 돼요)
"""
import argparse
import csv
import getpass
import json
import os
import random
import re
import statistics
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "lambda", "jojo_practice"))
from samples import TOPIC_POOL  # noqa: E402

LEVEL_NAMES = {1: "초급", 2: "중급", 3: "고급"}
PRICE_PER_M = {"input": 1.0, "output": 5.0}   # Claude Haiku 4.5 (USD / 100만 토큰)


# ───────────────────────── 1. 문항 하나 만들기 ─────────────────────────


def make(url, admin_code, item):
    """POST <함수 URL>/practice (관리자 코드 → 응답에 debug)"""
    body = {"language": item["language"], "level": item["level"], "topic": item["topic"]}
    req = urllib.request.Request(url.rstrip("/") + "/practice", data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "x-admin-token": admin_code})
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=630) as res:
            out = json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        message = e.read().decode(errors="replace")
        if e.code in (403, 429):
            raise SystemExit(f"✗ 관리자 코드를 확인해 주세요 ({e.code}): {message}  — jojo_practice 의 환경 변수 ADMIN_TOKEN 과 같아야 해요")
        raise RuntimeError(f"#{item['no']} HTTP {e.code}: {message[:200]}")
    except Exception as e:
        raise RuntimeError(f"#{item['no']} 요청 실패: {e!r}")
    if "debug" not in out:
        raise SystemExit("✗ 단계 기록(debug)이 없어요. --url 이 jojo_practice 의 함수 URL 인지, 최신 코드를 붙여넣었는지 확인해 주세요.")
    d = out["debug"]
    return {**item, "seconds": round(time.time() - started, 1), "origin": d["origin"], "title": out["title"], "code": out["code"],
            "attempts": d["attempts"], "calls": d["calls"], "units": d["units"], "output": d.get("output"), "levelCheck": d.get("levelCheck"),
            "note": out.get("note")}


def plan(reps, seed):
    rnd = random.Random(seed)
    items = []
    for language in ("python", "javascript"):
        for level in (1, 2, 3):
            pool = rnd.sample(TOPIC_POOL, len(TOPIC_POOL))
            for i in range(reps):
                items.append({"no": len(items) + 1, "language": language, "level": level, "rep": i + 1, "topic": pool[i % len(pool)]})
    return items


# ───────────────────────── 2. 실제 실행 (이 컴퓨터) ─────────────────────────


def run_code(code, language, path):
    with open(path, "w", encoding="utf-8") as f:
        f.write(code)
    cmd = [sys.executable, path] if language == "python" else ["node", path]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=15, input="")
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except FileNotFoundError:
        return None, "", f"실행기 {cmd[0]} 없음"
    except subprocess.TimeoutExpired:
        return None, "", "15초 안에 끝나지 않음"


def real_runs(rows, out_dir):
    """AI 문항을 두 번 실행: 오류 없이 끝나는지, 출력이 매번 같은지(같을 때만 검토 출력과 비교)"""
    folder = os.path.join(out_dir, "run_code")
    os.makedirs(folder, exist_ok=True)
    squash = lambda lines: re.sub(r"\s+", "", "".join(lines))
    for r in rows:
        if r["origin"] != "ai":
            continue
        path = os.path.join(folder, f"q{r['no']:02d}.{'py' if r['language'] == 'python' else 'js'}")
        first, second = run_code(r["code"], r["language"], path), run_code(r["code"], r["language"], path)
        r["runOk"] = first[0] == 0
        r["runOutput"] = first[1]
        r["runError"] = first[2][-300:] if first[0] != 0 else ""
        r["deterministic"] = first == second
        guess = [x.strip() for x in "\n".join(r.get("output") or []).split("\n") if x.strip()]
        real = [x.strip() for x in first[1].split("\n") if x.strip()]
        r["outputMatch"] = (squash(real) == squash(guess)) if (r["runOk"] and r["deterministic"] and guess) else None


# ───────────────────────── 3. 표 ─────────────────────────


def pct(n, d):
    return f"{n}/{d} ({100 * n / d:.1f}%)" if d else "-"


def cost(r):
    return sum(c["input"] for c in r["calls"]) / 1e6 * PRICE_PER_M["input"] + sum(c["output"] for c in r["calls"]) / 1e6 * PRICE_PER_M["output"]


def first_review(r):
    return next((a["review"] for a in r["attempts"] if a.get("review") and "runnable" in a["review"]), None)


def table(rows):
    n = len(rows)
    ai = [r for r in rows if r["origin"] == "ai"]
    first = [r["attempts"][0] for r in rows if r["attempts"]]
    reviewed = [first_review(r) for r in rows if first_review(r)]
    ran = [r for r in ai if r.get("runOk") is not None]
    compared = [r for r in ai if r.get("outputMatch") is not None]
    out = [
        ("문항 수", n),
        ("AI 문항 최종 제공", pct(len(ai), n)),
        ("첫 생성 그대로 통과 (부분 수정·다시 만들기 없이)", pct(sum(1 for r in ai if len(r["attempts"]) == 1 and not r["attempts"][0]["fixed"]), n)),
        ("규칙 검사 1에 걸림 (첫 생성: 문법·정의 안 된 이름)", pct(sum(1 for a in first if a["rule"]), len(first))),
        ("검토: 동작하지 않는다고 판정 (첫 검토)", pct(sum(1 for v in reviewed if not v["runnable"] or v["problems"]), len(reviewed))),
        ("검토: 요청한 난이도와 맞음 (첫 검토)", pct(sum(1 for v in reviewed if v["level"]["match"]), len(reviewed))),
        ("검토: 함수·반복문을 빠뜨림 (첫 검토)", pct(sum(1 for v in reviewed if v.get("missing")), len(reviewed))),
        ("부분 수정을 쓴 문항", pct(sum(1 for r in rows if any(a["fixed"] for a in r["attempts"])), n)),
        ("다시 만든 문항", pct(sum(1 for r in rows if len(r["attempts"]) > 1), n)),
        ("예시 코드 대체", pct(n - len(ai), n)),
        ("AI 문항이 실제로 오류 없이 실행됨 (이 컴퓨터)", pct(sum(1 for r in ran if r["runOk"]), len(ran))),
        ("검토 출력 = 실제 출력 (출력이 매번 같은 코드만)", pct(sum(1 for r in compared if r["outputMatch"]), len(compared))),
        ("문항당 AI 호출 (평균)", f"{statistics.mean(len(r['calls']) for r in rows):.1f}" if rows else "-"),
        ("문항당 AI 비용 (평균 · 합계)", f"${statistics.mean(cost(r) for r in rows):.4f} · ${sum(cost(r) for r in rows):.3f}" if rows else "-"),
        ("문항당 생성 시간 (평균 · 중앙값)", f"{statistics.mean(r['seconds'] for r in rows):.1f}초 · {statistics.median(r['seconds'] for r in rows):.1f}초" if rows else "-"),
    ]
    return out


def by_group(rows):
    lines = ["| 언어 | 난이도 | 문항 | AI 제공 | 난이도 맞음(첫 검토) | 검토가 본 난이도 | 실제 실행 OK | 평균 비용 |", "|---|---|---|---|---|---|---|---|"]
    for language in ("python", "javascript"):
        for level in (1, 2, 3):
            g = [r for r in rows if r["language"] == language and r["level"] == level]
            if not g:
                continue
            reviewed = [first_review(r) for r in g if first_review(r)]
            judged = ", ".join(f"{LEVEL_NAMES.get(v['level']['overall'], '?')}" for v in reviewed)
            ai = [r for r in g if r["origin"] == "ai"]
            lines.append(f"| {language} | {LEVEL_NAMES[level]} | {len(g)} | {len(ai)} | {sum(1 for v in reviewed if v['level']['match'])}/{len(reviewed)} | {judged} | "
                         f"{sum(1 for r in ai if r.get('runOk'))}/{len(ai)} | ${statistics.mean(cost(r) for r in g):.4f} |")
    return lines


def verify_sheet(rows, out_dir, count, seed):
    ai = [r for r in rows if r["origin"] == "ai"]
    picked = sorted(random.Random(seed).sample(ai, min(count, len(ai))), key=lambda r: r["no"])
    lines = ["# 검토 기록·모범 설명 확인", "",
             f"AI 문항 {len(ai)}개 중 무작위 {len(picked)}개. 실제 실행 출력과 검토 기록(넣은 값·과정·결과)·모범 설명의 흐름이 맞는지 표시하세요.", ""]
    for r in picked:
        numbered = "\n".join(f"{i + 1:3}| {line}" for i, line in enumerate(r["code"].split("\n")))
        lines += [f"## #{r['no']:02d} {r['language']} · {LEVEL_NAMES[r['level']]} · {r['topic']} — {r['title']}", "",
                  "```", numbered, "```", "", "**실제 실행 출력**" + ("" if r.get("deterministic", True) else " (실행마다 달라짐)"), "",
                  "```", r.get("runOutput") or r.get("runError") or "(출력 없음)", "```", ""]
        for u in r["units"]:
            trace = "; ".join(x for x in [u.get("inputs"), *u.get("steps", []), f"횟수 {u['count']}" if u.get("count") is not None else "",
                                           u.get("stop"), u.get("result")] if x)
            lines += [f"- {'※ ' if u.get('key') else ''}{u['id']} ({u['start']}~{u['end']}번 줄, {u.get('kind')}): {u['explanation']}",
                      f"  - 기록: {trace or '(없음)'}", "  - [ ] 일치  [ ] 불일치  — 메모: "]
        lines += ["", "---", ""]
    with open(os.path.join(out_dir, "verify.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return len(picked)


# ───────────────────────── 4. 실행 ─────────────────────────


def main():
    ap = argparse.ArgumentParser(description="코드 생성·검증 실험")
    ap.add_argument("--url", required=True, help="jojo_practice 함수 URL")
    ap.add_argument("--reps", type=int, default=5, help="언어·난이도마다 만들 문항 수 (기본 5 → 30문항)")
    ap.add_argument("--workers", type=int, default=4, help="동시에 만들 문항 수")
    ap.add_argument("--seed", type=int, default=2026, help="주제 순서·확인 문항 고르기")
    ap.add_argument("--verify", type=int, default=10, help="verify.md 에 넣을 AI 문항 수")
    ap.add_argument("--resume", help="이어서 할 결과 폴더 (experiment_out/…)")
    args = ap.parse_args()
    code = os.environ.get("EXPERIMENT_ADMIN_CODE") or getpass.getpass("관리자 코드 (입력해도 화면에 보이지 않아요): ")
    out_dir = args.resume or os.path.join(ROOT, "experiment_out", datetime.now().strftime("%Y%m%d-%H%M%S"))
    os.makedirs(out_dir, exist_ok=True)
    jsonl = os.path.join(out_dir, "results.jsonl")
    done = {}
    if os.path.exists(jsonl):
        with open(jsonl, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    r = json.loads(line)
                    done[r["no"]] = r
    items = [i for i in plan(args.reps, args.seed) if i["no"] not in done]
    total = len(items) + len(done)
    print(f"{args.url} · 문항 {total}개 (남은 {len(items)}개) · 동시 {args.workers}개 → {out_dir}", flush=True)
    lock = threading.Lock()

    def work(item):
        try:
            r = make(args.url, code, item)
        except RuntimeError as e:
            print(f"  ! {e}", flush=True)
            return
        with lock:
            with open(jsonl, "a", encoding="utf-8") as f:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
            done[r["no"]] = r
            v = first_review(r) or {}
            level = v.get("level") or {}
            print(f"[{len(done):2}/{total}] #{r['no']:02d} {r['language']:10} {LEVEL_NAMES[r['level']]} {r['origin']:6} {r['seconds']:6.1f}초 "
                  f"호출 {len(r['calls'])} ${cost(r):.4f} 규칙 {'✗' if r['attempts'] and r['attempts'][0]['rule'] else '✓'} "
                  f"동작 {'-' if not v else ('✓' if v['runnable'] and not v['problems'] else '✗')} "
                  f"난이도 {'-' if not level else ('✓' if level['match'] else '✗ ' + LEVEL_NAMES.get(level['overall'], '?'))} "
                  f"수정 {'✓' if any(a['fixed'] for a in r['attempts']) else '-'} 다시 {len(r['attempts']) - 1} · {r['topic']}", flush=True)

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        list(pool.map(work, items))

    rows = [done[k] for k in sorted(done)]
    real_runs(rows, out_dir)
    with open(os.path.join(out_dir, "results.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["no", "language", "level", "topic", "origin", "seconds", "attempts", "calls", "cost_usd", "rule_1", "runnable_1", "problems_1",
                    "level_match_1", "level_judged_1", "fixed", "run_ok", "deterministic", "output_match", "note"])
        for r in rows:
            v = first_review(r) or {}
            w.writerow([r["no"], r["language"], r["level"], r["topic"], r["origin"], r["seconds"], len(r["attempts"]), len(r["calls"]), f"{cost(r):.5f}",
                        " | ".join(r["attempts"][0]["rule"]) if r["attempts"] else "", v.get("runnable"), " | ".join(v.get("problems") or []),
                        (v.get("level") or {}).get("match"), (v.get("level") or {}).get("overall"), any(a["fixed"] for a in r["attempts"]),
                        r.get("runOk"), r.get("deterministic"), r.get("outputMatch"), r.get("note") or ""])
    picked = verify_sheet(rows, out_dir, args.verify, args.seed)
    tab = table(rows)
    md = ["# 코드 생성·검증 실험 결과", "", f"- 실행: {datetime.now():%Y-%m-%d %H:%M} · {args.url} · seed {args.seed}",
          f"- 문항: 언어 2 × 난이도 3 × {args.reps}회 = {len(rows)}개", "", "| 항목 | 결과 |", "|---|---|", *[f"| {k} | {v} |" for k, v in tab], "",
          "## 언어·난이도별", "", *by_group(rows), "",
          f"- verify.md: 무작위 AI 문항 {picked}개 — 연구진이 실제 실행 출력과 검토 기록·모범 설명을 비교해 표시",
          f"- 비용: 입력 {PRICE_PER_M['input']}달러 · 출력 {PRICE_PER_M['output']}달러 / 100만 토큰 (Claude Haiku 4.5)"]
    with open(os.path.join(out_dir, "summary.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")
    print("\n" + "\n".join(f"  {k}: {v}" for k, v in tab))
    print(f"\n✓ 결과: {os.path.join(out_dir, 'summary.md')} · results.csv · verify.md")


if __name__ == "__main__":
    main()

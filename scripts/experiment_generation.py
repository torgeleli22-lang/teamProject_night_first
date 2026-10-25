"""
문항 생성·검증 실험 (논문 표 1) — 서비스와 같은 코드(practice.make_code)로 연습 문항을 만들고 단계별 결과를 모은다.

  언어 2(Python·JavaScript) × 난이도 4 × 반복 5 = 40문항 (기본값)
  문항마다: ① 출제 → ② 규칙 검사 → ③ AI 교차 검토(모범 설명 교정) → (걸리면 한 번 재생성) → 그래도 안 되면 예시 코드
  단계 기록은 lambda/api/experiment.py 가 한다 (서비스 코드는 그대로, 단계 함수를 감싸서 기록만)

두 가지 방법:
  Lambda 로 (권장 — Bedrock 권한은 Lambda 실행 역할에 있음, 서비스와 같은 Python 3.13·모델):
    python3 scripts/experiment_generation.py --url https://<함수 URL>        # 관리자 코드를 물어봄 (화면에 보이지 않음)
  이 컴퓨터에서 직접 (Bedrock·DynamoDB 권한이 있는 AWS 계정일 때):
    python3.11 scripts/experiment_generation.py --local
  비용 없이 스크립트만 확인:
    AI_MODE=mock MOCK_DELAY_SEC=0 python3 scripts/experiment_generation.py --local --offline-db --reps 1
  중간에 끊겼으면 같은 명령에 --resume experiment_out/<시각>

결과 (experiment_out/<시각>/):
  results.jsonl  문항 하나당 한 줄 (모든 단계 기록)      results.csv  표로 보기
  summary.md     표 1 값 + 언어·난이도별 표               verify.md    무작위 AI 문항 10개: 실제 실행 출력 ↔ ※ 모범 설명 (연구진이 일치 여부 표시)
"""
import argparse
import csv
import getpass
import json
import os
import random
import statistics
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

# 1. 주제 목록 (서비스의 랜덤 주제) — samples.py 는 boto3 없이 읽힌다
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "lambda", "api"))
from samples import ADVANCED_TOPIC_POOL, TOPIC_POOL  # noqa: E402

LEVEL_NAMES = {1: "입문", 2: "초급", 3: "중급", 4: "고급"}


# ───────────────────────── 2. 문항 하나 만들기 (Lambda 로 / 이 컴퓨터에서) ─────────────────────────


def remote_maker(url, admin_code):
    """POST <함수 URL>/admin/experiment — Lambda 가 만들고 단계 기록을 돌려준다"""
    def make(item):
        req = urllib.request.Request(url.rstrip("/") + "/admin/experiment", data=json.dumps(item).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "x-admin-token": admin_code})
        try:
            with urllib.request.urlopen(req, timeout=630) as res:   # Lambda 제한 시간(10분)보다 조금 길게
                return json.loads(res.read().decode())
        except urllib.error.HTTPError as e:
            message = e.read().decode(errors="replace")
            if e.code in (401, 429):
                raise SystemExit(f"✗ 관리자 코드를 확인해 주세요 ({e.code}): {message}")
            if e.code == 404:
                raise SystemExit("✗ Lambda 에 실험 경로가 없어요. 콘솔에 experiment.py 를 추가하고 lambda_function.py 를 바꾼 뒤 Deploy 해 주세요.")
            return {**item, "origin": "error", "note": f"HTTP {e.code}: {message[:300]}", "attempts": [], "ai_calls": [], "ai_errors": [],
                    "tokens_in": 0, "tokens_out": 0, "seconds": 0, "code": "", "marks": [], "title": ""}
        except Exception as e:   # 연결 끊김·시간 초과 → 이 문항만 오류로 남기고 계속 (--resume 으로 다시 할 수 있게 저장하지 않음)
            raise RuntimeError(f"#{item['no']} 요청 실패: {e!r}")
    return make


def local_maker(offline_db):
    """이 컴퓨터에서 Lambda 코드를 직접 실행 (AWS 권한 필요)"""
    if sys.version_info < (3, 10):
        sys.exit("Python 3.10 이상이 필요해요 (Lambda 는 3.13). CloudShell: sudo dnf install -y python3.11 → python3.11 로 실행")
    os.environ.setdefault("AI_MODE", "live")
    import common
    import experiment
    import practice
    experiment.install()
    if offline_db:   # DynamoDB 없이 (월 예산 확인·사용량 기록 생략)
        common.month_cost_usd = lambda include_mock=False: 0.0
        common.ai_switch_on = lambda: True
        experiment._orig["log_usage"] = lambda *a, **k: None
        practice.log_ai_event = lambda *a, **k: None
    if common.AI_MODE == "live":   # 권한·모델 접근 문제면 바로 멈춘다 (전부 예시 코드가 되는 것을 막기)
        try:
            common.ask_ai("experiment_preflight", "짧게 답해.", "ok 라고만 답해.",
                          {"type": "object", "properties": {"ok": {"type": "string"}}, "required": ["ok"]}, max_tokens=50)
        except common.AiUnavailable as e:
            sys.exit(f"✗ AI 를 부를 수 없어요: {e}\n  이 계정에 Bedrock 권한이 없으면 --url <함수 URL> 로 Lambda 에서 실행하세요.")
    return experiment.make_one


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
    ap.add_argument("--url", help="Lambda 함수 URL — 이 Lambda 에서 만든다 (권장)")
    ap.add_argument("--local", action="store_true", help="이 컴퓨터에서 Lambda 코드를 직접 실행 (AWS 권한 필요)")
    ap.add_argument("--offline-db", action="store_true", help="--local 과 함께: DynamoDB 없이 — 스크립트 확인용")
    args = ap.parse_args()
    if bool(args.url) == bool(args.local):
        sys.exit("--url <함수 URL> 또는 --local 중 하나를 골라 주세요 (docs/EXPERIMENT.md)")
    if args.url:
        code = os.environ.get("EXPERIMENT_ADMIN_CODE") or getpass.getpass("관리자 코드 (입력해도 화면에 보이지 않아요): ")
        make_one = remote_maker(args.url, code)
        where = f"Lambda {args.url}"
    else:
        make_one = local_maker(args.offline_db)
        where = f"이 컴퓨터 (AI_MODE={os.environ.get('AI_MODE')})"
    out_dir = args.resume or os.path.join(ROOT, "experiment_out", datetime.now().strftime("%Y%m%d-%H%M%S"))
    os.makedirs(out_dir, exist_ok=True)
    jsonl = os.path.join(out_dir, "results.jsonl")
    done = {}
    if os.path.exists(jsonl):
        with open(jsonl, encoding="utf-8") as f:
            done = {(r := json.loads(line))["no"]: r for line in f if line.strip()}
    items = [i for i in plan(args.reps, args.seed) if i["no"] not in done]
    total = len(items) + len(done)
    print(f"{where} · 문항 {total}개 (남은 {len(items)}개) · 동시 {args.workers}개 → {out_dir}", flush=True)

    lock = threading.Lock()

    def work(item):
        try:
            r = make_one(item)
        except RuntimeError as e:   # 연결 실패 — 저장하지 않고 넘어감 (--resume 으로 다시)
            print(f"  ! {e}", flush=True)
            return
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
          f"- 실행: {datetime.now():%Y-%m-%d %H:%M} · {where} · AI_MODE={rows[0].get('aiMode', '?') if rows else '?'} · 모델 `{rows[0].get('model', '?') if rows else '?'}` · seed {args.seed}",
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

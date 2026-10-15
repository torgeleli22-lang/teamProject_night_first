/**
 * 코드 실행·검사 도구 (generate-code Lambda 와 npm run verify 가 함께 쓴다)
 *
 *   1. runJs / runJsTraced   학습용 코드를 격리된 곳에서 실행하고 console.log 출력을 받는다
 *   2. traceCode / autoTraceQuestion   흐름 따라가기: 지정한 줄의 값을 실제 실행으로 기록한다 (정답은 언제나 실행 기록)
 *   3. computeFactors / estimateLevel  코드의 난이도 요소 (규칙)
 *   4. validateCode / validateItem     AI 가 만든 코드·문제를 실제로 실행해서 검사한다
 *   5. autoFixQuestions                AI 가 계산을 조금 틀린 정답을 실행 결과로 바로잡는다
 *   6. sameOutput 등                   출력 비교·주관식 규칙 평가
 *
 * 외부 라이브러리 없이 Node.js 기본 기능만 쓴다.
 */
import { Worker } from "node:worker_threads";

// ───────────────────────── 1. 코드 실행 ─────────────────────────

/**
 * 워커 스레드 + vm 컨텍스트에서 실행한다.
 * - require/process/fs 등 Node 기능은 코드 안에서 쓸 수 없다.
 * - 동기 코드는 0.5초, 전체는 2초 안에 끝나지 않으면 멈춘다.
 * - 출력은 브라우저 콘솔 표기([2, 4, 6], ['a', 'b'], {name: 'Kim'})로 맞춘다.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");

function fmt(value, nested) {
  if (typeof value === "string") return nested ? "'" + value + "'" : value;
  if (Array.isArray(value)) return "[" + value.map((v) => fmt(v, true)).join(", ") + "]";
  if (value && typeof value === "object") {
    if (typeof value.then === "function") return "Promise {<pending>}";
    return "{" + Object.entries(value).map(([k, v]) => k + ": " + fmt(v, true)).join(", ") + "}";
  }
  if (typeof value === "function") return "ƒ " + (value.name || "anonymous") + "()";
  return String(value);
}

const lines = [];
const records = [];
const maxRecords = workerData.maxRecords || 0;
const capture = (fn) => {
  try {
    return fmt(fn(), true);
  } catch (e) {
    return "(아직 없음)";
  }
};
let timedOut = false;
const pushError = (e, prefix) => {
  if (e && e.code === "ERR_SCRIPT_EXECUTION_TIMEOUT") { timedOut = true; lines.push("Uncaught Timeout"); return; }
  lines.push(prefix + ((e && e.name) || "Error"));
};
process.on("unhandledRejection", (e) => pushError(e, "Uncaught (in promise) "));

const context = vm.createContext({
  console: { log: (...args) => lines.push(args.map((a) => fmt(a, false)).join(" ")) },
  __trace: (watch, ask, given) => {
    if (records.length < maxRecords) records.push({ watch, ask: ask.map(capture), given: given.map(capture) });
  },
  setTimeout: (fn, ms) => setTimeout(() => { try { fn(); } catch (e) { pushError(e, "Uncaught "); } }, Math.min(Number(ms) || 0, 200)),
});

try {
  vm.runInContext(workerData.code, context, { timeout: 500 });
} catch (e) {
  pushError(e, "Uncaught ");
}
setTimeout(() => parentPort.postMessage({ output: lines.join("\\n"), timedOut, records }), 300);
`;

/** 코드 실행 → { output, timedOut, threw } */
export function runJs(code) {
  return runJsTraced(code, 0);
}

/** runJs + 코드에 끼워 넣은 __trace(...) 기록 (최대 maxRecords 개) */
export function runJsTraced(code, maxRecords) {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { code, maxRecords },
      resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8 },
    });
    const finish = (result) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ ...result, records: result.records ?? [], threw: /(^|\n)Uncaught /.test(result.output) });
    };
    const timer = setTimeout(() => finish({ output: "Uncaught Timeout", timedOut: true }), 2000);
    worker.once("message", finish);
    worker.once("error", () => finish({ output: "Uncaught Error", timedOut: false }));
  });
}

// ───────────────────────── 2. 흐름 따라가기 (추적표) ─────────────────────────

/** 학습자가 채울 칸의 최대 수 */
export const MAX_TRACE_ROWS = 8;

/** 물어볼 수 있는 식: 변수·속성·인덱스·비교·산술만 (호출·대입처럼 값을 바꾸는 식은 안 됨) */
const SAFE_EXPR = /^[\p{L}\w$.[\]'" +\-*/%<>=!&|?:]+$/u;
const MUTATING = /(^|[^=!<>])=(?!=)|\+\+|--|\w\s*\(/;

export function checkExpr(expr) {
  if (!expr.trim() || expr.length > 60) return `식이 비었거나 너무 길어요: ${expr}`;
  if (!SAFE_EXPR.test(expr) || MUTATING.test(expr)) return `값을 바꾸거나 함수를 부르는 식은 물어볼 수 없어요: ${expr}`;
  return null;
}

/**
 * 코드의 지정한 줄 앞(before)·뒤(after)에 기록 문장을 끼워 넣고 실행해서, 그 시점의 값을 줄마다 기록한다.
 * watch: [{ line, when?: "before"|"after", ask: [식], given?: [상황 설명용 식] }]
 * 결과: { ok, rows: [{ line, when, context, expr, value }], output, problems }
 */
export async function traceCode(language, code, watch, maxRows = MAX_TRACE_ROWS) {
  if (language !== "javascript") return { ok: false, rows: [], output: "", problems: [`${language} 는 아직 따라갈 수 없어요`] };
  const problems = [];
  const lines = code.split("\n");
  for (const w of watch) {
    if (w.line < 1 || w.line > lines.length || !lines[w.line - 1].trim()) problems.push(`${w.line}번째 줄은 따라갈 수 없는 줄이에요`);
    for (const e of [...w.ask, ...(w.given ?? [])]) {
      const bad = checkExpr(e);
      if (bad) problems.push(bad);
    }
    if (!w.ask.length) problems.push(`${w.line}번째 줄에 물어볼 값이 없어요`);
  }
  const original = await runJs(code);
  if (problems.length) return { ok: false, rows: [], output: original.output, problems };

  // 아래 줄부터 끼워 넣어야 위쪽 줄 번호가 바뀌지 않는다. 같은 줄의 before 는 after 보다 위에
  const inserts = watch
    .map((w, i) => ({ w, i, at: w.when === "before" ? w.line - 1 : w.line }))
    .sort((a, b) => b.at - a.at || (a.w.when === "before" ? 1 : -1));
  const out = [...lines];
  for (const { w, i, at } of inserts) {
    const fns = (list) => `[${list.map((e) => `() => (${e})`).join(", ")}]`;
    const indent = lines[w.line - 1].match(/^\s*/)?.[0] ?? "";
    out.splice(at, 0, `${indent}__trace(${i}, ${fns(w.ask)}, ${fns(w.given ?? [])});`);
  }
  const traced = await runJsTraced(out.join("\n"), maxRows);
  if (traced.output !== original.output) {
    problems.push("따라갈 줄에 기록을 넣으면 실행 결과가 달라져요 (여러 줄에 걸친 문장의 중간 줄일 수 있어요)");
  }
  if (original.threw || original.timedOut) problems.push("코드가 오류 없이 실행되지 않아요");

  const rows = [];
  for (const r of traced.records) {
    const w = watch[r.watch];
    const context = (w.given ?? []).map((g, k) => `${g} = ${r.given[k]}`).join(", ");
    w.ask.forEach((expr, k) => rows.push({ line: w.line, when: w.when ?? "after", context, expr, value: r.ask[k] }));
  }
  watch.forEach((w, i) => {
    if (!traced.records.some((r) => r.watch === i)) problems.push(`${w.line}번째 줄은 실행되지 않아서 따라갈 수 없어요`);
  });
  const capped = rows.slice(0, maxRows);
  if (!capped.length) problems.push("기록된 값이 없어요");
  if (capped.some((r) => r.value === "(아직 없음)")) problems.push("아직 만들어지지 않은 값을 묻는 칸이 있어요");
  return { ok: problems.length === 0, rows: capped, output: original.output, problems };
}

/**
 * 따라갈 줄을 규칙으로 고른다 (AI 호출 없음).
 * 변수에 값을 넣거나 바꾸는 한 줄짜리 문장(;로 끝남)을 찾고, 반복문 안의 줄을 먼저 고른다.
 * for (const x of …) 안이면 x 를 상황 설명(given)으로 보여 준다.
 */
export function pickWatch(code) {
  const lines = code.split("\n");
  const candidates = [];
  lines.forEach((text, i) => {
    const m = text.match(/^\s*(?:(?:let|const|var)\s+)?([A-Za-z_$][\w$]*)\s*(?:[+\-*/]?=(?!=)|\+\+|--)/);
    if (!m || !/;\s*$/.test(text) || /=>\s*\{?\s*$/.test(text)) return;
    // 값을 그대로 적은 선언(const prices = [1, 2] / let total = 0)은 물어볼 거리가 없다
    if (/^\s*(?:let|const|var)\s+[\w$]+\s*=\s*(?:\[|\{|["'`\d-]|true|false|null)[^;]*;\s*$/.test(text) && !/[+*/%]|\.\w+\(/.test(text.split("=").slice(1).join("="))) return;
    // 여러 줄짜리 배열·객체 선언은 끝 줄이 아니면 건너뛴다 (그 줄 뒤에 기록을 넣을 수 없음)
    if (/[[{(,]\s*$/.test(text)) return;
    const indent = text.match(/^\s*/)[0].length;
    let given = [];
    for (let j = i - 1; j >= 0 && indent > 0; j--) {
      const loop = lines[j].match(/for\s*\(\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s+of\b/);
      if (loop && lines[j].match(/^\s*/)[0].length < indent) {
        given = [loop[1]];
        break;
      }
    }
    candidates.push({ w: { line: i + 1, when: "after", ask: [m[1]], ...(given.length ? { given } : {}) }, score: indent > 0 ? 2 : 1 });
  });
  const inLoop = candidates.filter((c) => c.score === 2);
  return (inLoop.length ? inLoop.slice(0, 1) : candidates.slice(0, 2)).map((c) => c.w);
}

/** 흐름 따라가기 문제를 규칙으로 만든다 (정답은 실제 실행 기록). 따라갈 만한 줄이 없으면 null */
export async function autoTraceQuestion(language, code, codeItemId) {
  const watch = pickWatch(code);
  if (!watch.length) return null;
  const t = await traceCode(language, code, watch);
  if (!t.ok) return null;
  const lines = [...new Set(watch.map((w) => w.line))].join("·");
  const asks = [...new Set(watch.flatMap((w) => w.ask))].join(", ");
  return {
    id: `${codeItemId}-trace`,
    codeItemId,
    type: "trace",
    stage: "trace",
    skill: "predict",
    prompt: `${lines}번째 줄이 실행된 직후 ${asks} 의 값을 차례로 적어 보세요.`,
    watch,
    rows: t.rows,
    hints: ["강조된 줄 바로 위까지 값이 어떻게 만들어졌는지 먼저 확인해 보세요.", "반복문 안이라면 한 바퀴씩 따로 계산해서, 이전 값에서 무엇이 바뀌는지 적어 보세요."],
    explanation: t.rows.map((r) => `${r.line}번째 줄${r.context ? ` (${r.context})` : ""} → ${r.expr} = ${r.value}`).join("\n"),
    keyPoint: "한 줄씩 실행하며 값이 어떻게 바뀌는지 따라가기",
  };
}

// ───────────────────────── 3. 난이도 요소 ─────────────────────────

const SYNTAX_FEATURES = [
  ["const", /\bconst\b/], ["let", /\blet\b/], ["if", /\bif\s*\(/], ["else", /\belse\b/], ["switch", /\bswitch\s*\(/],
  ["for", /\bfor\s*\(/], ["while", /\bwhile\s*\(/], ["function", /\bfunction\b/], ["arrow", /=>/], ["return", /\breturn\b/],
  ["array", /\[[^\]]*,/], ["object", /\{\s*\w+\s*:/], ["template", /`[^`]*\$\{/], ["map", /\.map\(/], ["filter", /\.filter\(/],
  ["forEach", /\.forEach\(/], ["find", /\.find\(/], ["reduce", /\.reduce\(/], ["push", /\.push\(/], ["length", /\.length\b/],
  ["strict-eq", /[!=]==/], ["logical", /&&|\|\|/], ["modulo", /\s%\s/], ["typeof", /\btypeof\b/], ["ternary", /\?[^.?][^:]*:/],
  ["increment", /\+\+|--|\+=|-=/], ["async", /\basync\b/], ["await", /\bawait\b/], ["promise", /\bPromise\b|\.then\(/],
  ["timer", /\bsetTimeout\b/], ["dom", /\bdocument\./], ["event", /addEventListener/], ["fetch", /\bfetch\(/],
];

const clamp = (n, max = 5) => Math.max(0, Math.min(max, Math.round(n)));
const count = (code, re) => (code.match(re) ?? []).length;

function maxNesting(code) {
  let depth = 0;
  let max = 0;
  for (const ch of code.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "")) {
    if (ch === "{" || ch === "(") max = Math.max(max, ++depth);
    else if (ch === "}" || ch === ")") depth--;
  }
  return max;
}

/** 줄 수·문법 수·분기·데이터 흐름·추론 깊이 */
export function computeFactors(code, conceptCount) {
  const meaningful = code
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !/^[}\])];?,?$/.test(l));
  const body = code.replace(/\/\/.*$/gm, "");
  const branches = count(body, /\bif\s*\(|\bcase\b|\?[^.?][^:\n]*:/g);
  const loops = count(body, /\bfor\s*\(|\bwhile\s*\(/g);
  const logical = count(body, /&&|\|\|/g);
  const callbacks = count(body, /=>|\bfunction\s*\(/g);
  const reassign = count(body, /(?<![=!<>])=(?![=>])/g) - count(body, /\b(const|let|var)\b/g);
  const chains = count(body, /\)\s*\n?\s*\.\w+\(/g);
  const asyncOps = count(body, /\bawait\b|\.then\(|\bsetTimeout\b|addEventListener/g);
  return {
    lines: meaningful.length,
    syntaxCount: SYNTAX_FEATURES.filter(([, re]) => re.test(body)).length,
    conceptCount,
    logic: clamp(branches + loops * 1.5 + logical * 0.5),
    dataFlow: clamp(Math.max(0, reassign) * 0.7 + chains + count(body, /\.(map|filter|reduce|find)\(/g) * 0.8),
    reasoning: clamp(Math.max(0, maxNesting(body) - 2) + asyncOps * 1.2 + loops + callbacks * 0.3),
  };
}

/** 요소들을 합쳐 1~5 단계로 */
export function estimateLevel(f) {
  const score = f.lines * 0.12 + f.syntaxCount * 0.18 + f.conceptCount * 0.3 + f.logic * 0.35 + f.dataFlow * 0.35 + f.reasoning * 0.45;
  if (score < 1.8) return 1;
  if (score < 2.8) return 2;
  if (score < 3.9) return 3;
  if (score < 5.2) return 4;
  return 5;
}

// ───────────────────────── 6. 출력 비교·주관식 규칙 평가 ─────────────────────────

/** 출력 비교용: 줄마다 공백 제거, 따옴표 통일, 끝 세미콜론·빈 줄 제거 */
export function normalizeOutput(text) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim().replace(/[“”"`‘’]/g, "'").replace(/;$/, "").replace(/\s+/g, ""))
    .filter((line) => line.length > 0);
}

export function sameOutput(a, b) {
  const na = normalizeOutput(a);
  const nb = normalizeOutput(b);
  return na.length === nb.length && na.every((line, i) => line === nb[i]);
}

const squashLower = (s) => s.toLowerCase().replace(/\s+/g, "");

/** 주관식 규칙 평가 (채점 기준 표현이 들어 있는지, 오개념 표현이 있는지) — submit-answer Lambda 와 같은 규칙 */
export function evaluateShortAnswer(q, text) {
  const length = squashLower(text).length;
  const mentions = (k) => squashLower(text).includes(squashLower(k));
  const checks = q.rubric.map((point) => {
    const hit = point.keywords.some(mentions);
    return { label: point.label, level: hit ? "good" : "weak", comment: hit ? "설명에 담겨 있어요." : "이 부분에 대한 설명이 빠져 있어요." };
  });
  const misconceptions = q.misconceptions.filter((m) => m.keywords.every(mentions));
  const hits = checks.filter((c) => c.level === "good").length;
  if (length < 4) return { verdict: "incorrect", checks, misconceptions, aiReasons: [] };
  const aiReasons = [];
  if (length < 15) aiReasons.push("답변이 짧음");
  if (misconceptions.length) aiReasons.push("오개념 표현 포함");
  if (hits > 0 && hits < checks.length) aiReasons.push("핵심 요소 일부 누락");
  if (hits === 0) aiReasons.push("규칙으로 판단 어려움");
  const verdict = hits === checks.length && !misconceptions.length ? "correct" : hits * 2 >= checks.length ? "partial" : "incorrect";
  return { verdict, checks, misconceptions, aiReasons };
}

const squash = (s) => s.replace(/\s+/g, "");

/** 공백 차이를 무시하고 code 안에서 fragment 의 [시작, 끝) 위치 */
export function locate(code, fragment) {
  const target = squash(fragment);
  if (!target) return null;
  for (let start = 0; start < code.length; start++) {
    if (/\s/.test(code[start])) continue;
    let i = start;
    let j = 0;
    while (i < code.length && j < target.length) {
      if (/\s/.test(code[i])) {
        i++;
        continue;
      }
      if (code[i] !== target[j]) break;
      i++;
      j++;
    }
    if (j === target.length) return [start, i];
  }
  return null;
}

// ───────────────────────── 4. 검사 ─────────────────────────

/** 학습 코드에 들어가면 안 되는 것 (보안 + 학습 범위) */
const UNSAFE = /\b(require|import|process|globalThis|eval|Function|constructor|__proto__|while\s*\(\s*true\s*\))\b/;
const ASYNC_OR_BROWSER = /\basync\b|\bawait\b|\bPromise\b|\bfetch\(|\bdocument\./;

/** 난이도별로 아직 나오면 안 되는 문법 */
const TOO_ADVANCED = {
  1: [["함수", /=>|\bfunction\b/], ["반복문", /\bfor\s*\(|\bwhile\s*\(/], ["배열 메서드", /\.(map|filter|reduce|forEach|find)\(/], ["비동기/브라우저", ASYNC_OR_BROWSER]],
  2: [["reduce", /\.reduce\(/], ["비동기/브라우저", ASYNC_OR_BROWSER]],
  3: [["비동기/브라우저", ASYNC_OR_BROWSER]],
  4: [],
  5: [],
};

/**
 * 문제를 만들기 전에 코드만 먼저 검사한다: 안전·난이도·문법 범위, 그리고 실제로 실행해서 출력이 나오는지.
 * conceptIds: 커리큘럼의 개념 id 목록
 */
export async function validateCode(code, concepts, targetLevel, conceptIds) {
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass, ...(detail ? { detail } : {}) });
  const known = new Set(conceptIds);
  const unknown = concepts.filter((c) => !known.has(c));
  check("개념이 커리큘럼에 존재", unknown.length === 0, unknown.join(", "));
  const safe = !UNSAFE.test(code);
  check("안전한 코드 (require/eval/무한 루프 등 없음)", safe);
  const factors = computeFactors(code, concepts.length);
  const estimatedLevel = estimateLevel(factors);
  check("난이도가 목표에 맞음", Math.abs(estimatedLevel - targetLevel) <= 1, `목표 ${targetLevel}, 측정 ${estimatedLevel}`);
  const advanced = TOO_ADVANCED[targetLevel].filter(([, re]) => re.test(code)).map(([n]) => n);
  check("난이도에 비해 어려운 문법 없음", advanced.length === 0, advanced.join(", "));
  let actualOutput = null;
  if (safe) {
    const run = await runJs(code);
    actualOutput = run.output;
    check("코드가 시간 안에 실행됨", !run.timedOut);
    check("코드가 오류 없이 실행됨", !run.threw, run.threw ? run.output.split("\n").find((l) => l.startsWith("Uncaught")) : undefined);
    check("console.log 출력이 있음", run.output.trim().length > 0);
  }
  return { ok: checks.every((c) => c.pass), checks, actualOutput, factors, estimatedLevel };
}

/**
 * 코드 + 문제 전체 검사. item: { code, concepts, output, runnable, targetLevel?, questions }
 * 객관식·빈칸·출력 예측의 정답, 흐름 따라가기 기록, 주관식 모범 답안을 실제 실행·규칙으로 확인한다.
 */
export async function validateItem(item, conceptIds) {
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass, ...(detail ? { detail } : {}) });
  const known = new Set(conceptIds);
  const unknown = item.concepts.filter((c) => !known.has(c));
  check("개념이 커리큘럼에 존재", unknown.length === 0, unknown.join(", "));
  check("안전한 코드 (require/eval/무한 루프 등 없음)", !UNSAFE.test(item.code));
  check("문제가 1개 이상", item.questions.length > 0);

  const factors = computeFactors(item.code, item.concepts.length);
  const estimatedLevel = estimateLevel(factors);
  if (item.targetLevel) {
    check("난이도가 목표에 맞음", Math.abs(estimatedLevel - item.targetLevel) <= 1, `목표 ${item.targetLevel}, 측정 ${estimatedLevel}`);
    const advanced = TOO_ADVANCED[item.targetLevel].filter(([, re]) => re.test(item.code)).map(([n]) => n);
    check("난이도에 비해 어려운 문법 없음", advanced.length === 0, advanced.join(", "));
  }

  // 1) 코드 실행 → 출력 일치
  let actualOutput = null;
  if (item.runnable && !UNSAFE.test(item.code)) {
    const run = await runJs(item.code);
    actualOutput = run.output;
    check("코드가 시간 안에 실행됨", !run.timedOut);
    if (item.output !== null) check("제시한 실행 결과 = 실제 실행 결과", sameOutput(run.output, item.output), `실제: ${JSON.stringify(run.output)}`);
  }
  const expected = item.output ?? actualOutput;

  // 2) 문제별 검사
  const ids = new Set();
  for (const q of item.questions) {
    const tag = `[${q.id}]`;
    check(`${tag} id 중복 없음`, !ids.has(q.id));
    ids.add(q.id);
    check(`${tag} 힌트 1~4개·해설·핵심 개념`, q.hints.length >= 1 && q.hints.length <= 4 && q.hints.every((h) => h.trim()) && !!q.explanation.trim() && !!q.keyPoint.trim());

    switch (q.type) {
      case "multiple_choice": {
        const texts = q.choices.map((c) => normalizeOutput(c.text).join("\n"));
        check(`${tag} 보기 3개 이상, 정답 인덱스 유효`, q.choices.length >= 3 && q.answerIndex >= 0 && q.answerIndex < q.choices.length);
        check(`${tag} 중복 보기 없음`, new Set(texts).size === texts.length);
        // 실행 결과를 묻는 문제라면, 실제 결과와 일치하는 보기가 정확히 하나여야 한다
        if (q.skill === "predict" && expected && texts.some((t) => t === normalizeOutput(expected).join("\n"))) {
          const matching = q.choices.filter((c) => sameOutput(c.text, expected)).length;
          check(`${tag} 실행 결과와 일치하는 보기가 정답 하나뿐`, matching === 1 && sameOutput(q.choices[q.answerIndex].text, expected));
        }
        break;
      }
      case "fill_blank": {
        const blanks = q.blankedCode.split("____").length - 1;
        check(`${tag} 빈칸이 정확히 1개`, blanks === 1);
        check(`${tag} 보기 3개 이상, 정답 인덱스 유효`, q.choices.length >= 3 && q.answerIndex >= 0 && q.answerIndex < q.choices.length);
        const filled = q.blankedCode.replace("____", q.choices[q.answerIndex]?.text ?? "");
        const inCode = squash(item.code).includes(squash(filled));
        check(`${tag} 정답을 채운 코드가 원본 코드와 일치`, inCode);
        if (item.runnable && expected && inCode) {
          // 각 보기를 넣어 실행해 보고, 원래 결과가 나오는 보기가 정답 하나뿐인지 확인
          const start = locate(item.code, filled);
          const results = await Promise.all(
            q.choices.map(async (c) => {
              if (start === null) return false;
              const variant = item.code.slice(0, start[0]) + q.blankedCode.replace("____", c.text) + item.code.slice(start[1]);
              return sameOutput((await runJs(variant)).output, expected);
            }),
          );
          check(`${tag} 원래 결과를 만드는 보기가 정답 하나뿐`, results.filter(Boolean).length === 1 && results[q.answerIndex]);
        }
        break;
      }
      case "predict_output":
        if (expected) check(`${tag} 정답 = 실제 실행 결과`, sameOutput(q.output, expected), `정답: ${JSON.stringify(q.output)}`);
        break;
      case "trace": {
        if (!item.runnable) {
          check(`${tag} 흐름 따라가기는 실행할 수 있는 코드에만`, false);
          break;
        }
        const t = await traceCode("javascript", item.code, q.watch);
        check(`${tag} 따라갈 줄을 실행해 기록할 수 있음`, t.ok, t.problems.join(" / "));
        const same =
          t.rows.length === q.rows.length &&
          t.rows.every((r, i) => {
            const w = q.rows[i];
            return r.line === w.line && r.when === w.when && r.context === w.context && r.expr === w.expr && r.value === w.value;
          });
        check(`${tag} 추적표 정답 = 실제 실행 기록`, same, same ? undefined : `실제: ${JSON.stringify(t.rows)}`);
        break;
      }
      case "short_answer": {
        check(`${tag} 채점 기준 2개 이상`, q.rubric.length >= 2 && q.rubric.every((r) => r.keywords.length > 0));
        const self = evaluateShortAnswer(q, q.modelAnswer);
        check(`${tag} 모범 답안이 채점 기준을 통과`, self.verdict === "correct", self.checks.filter((c) => c.level === "weak").map((c) => c.label).join(", "));
        break;
      }
    }
  }
  return { ok: checks.every((c) => c.pass), checks, actualOutput, factors, estimatedLevel };
}

// ───────────────────────── 5. 자동 수정 ─────────────────────────

/**
 * AI 가 만든 문제에서 '코드만 보면 정답이 정해지는 값'을 규칙으로 바로잡는다 (AI 호출 없음).
 * - 출력 예측: 정답을 실제 실행 결과로
 * - 실행 결과를 묻는 객관식: 실제 결과와 같은 보기가 하나뿐이면 그 보기를 정답으로
 * - 빈칸: 채웠을 때 원본 코드와 같아지는 보기가 하나뿐이면 그 보기를 정답으로
 * - 주관식: 모범 답안에도 들어 있는 '오개념 표현'은 뺀다
 */
export function autoFixQuestions(code, actualOutput, questions) {
  const fixes = [];
  const fixed = questions.map((q) => {
    const tag = `[${q.id}]`;
    switch (q.type) {
      case "predict_output": {
        if (actualOutput === null || !actualOutput.trim() || sameOutput(q.output, actualOutput)) return q;
        fixes.push(`${tag} 출력 예측 정답을 실제 실행 결과로 바꿈`);
        return { ...q, output: actualOutput.trimEnd() };
      }
      case "multiple_choice": {
        if (q.skill !== "predict" || actualOutput === null || !actualOutput.trim()) return q;
        const matching = q.choices.map((c, i) => (sameOutput(c.text, actualOutput) ? i : -1)).filter((i) => i >= 0);
        if (matching.length !== 1 || matching[0] === q.answerIndex) return q;
        fixes.push(`${tag} 실행 결과와 같은 보기(${matching[0] + 1}번)를 정답으로 바꿈`);
        return { ...q, answerIndex: matching[0] };
      }
      case "fill_blank": {
        if (q.blankedCode.split("____").length - 1 !== 1) return q;
        const whole = squash(code);
        const matching = q.choices.map((c, i) => (whole.includes(squash(q.blankedCode.replace("____", c.text))) ? i : -1)).filter((i) => i >= 0);
        if (matching.length !== 1 || matching[0] === q.answerIndex) return q;
        fixes.push(`${tag} 원본 코드와 같아지는 보기(${matching[0] + 1}번)를 정답으로 바꿈`);
        return { ...q, answerIndex: matching[0] };
      }
      case "short_answer": {
        const kept = q.misconceptions.filter((m) => !evaluateShortAnswer({ ...q, rubric: [], misconceptions: [m] }, q.modelAnswer).misconceptions.length);
        if (kept.length === q.misconceptions.length) return q;
        fixes.push(`${tag} 모범 답안에도 들어 있는 오개념 표현 ${q.misconceptions.length - kept.length}개를 뺌`);
        return { ...q, misconceptions: kept };
      }
      default:
        return q;
    }
  });
  return { questions: fixed, fixes };
}

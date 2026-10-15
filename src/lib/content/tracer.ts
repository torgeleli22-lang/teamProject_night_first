import type { Language, TraceQuestion, TraceRow, TraceWatch } from "../types";
import { runJs, runJsTraced } from "./runner";

/**
 * 흐름 따라가기(추적표)의 정답을 만드는 실행기.
 * 코드의 지정한 줄 앞(before)·뒤(after)에 기록 문장을 끼워 넣고 실제로 실행해서, 그 시점의 값을 줄마다 기록한다.
 * 정답은 AI 나 사람이 계산하지 않고 언제나 이 실행 결과로 정한다.
 *
 * 언어를 늘릴 때는 TRACERS 에 같은 모양(코드 + 따라갈 줄 → 기록)의 실행기를 추가한다 (예: Python 은 sys.settrace).
 */

/** 학습자가 채울 칸의 최대 수 (한 문제가 너무 길어지지 않게) */
export const MAX_TRACE_ROWS = 8;

export interface TraceResult {
  ok: boolean;
  rows: TraceRow[];
  /** 기록 문장을 넣기 전 원래 코드의 출력 */
  output: string;
  /** 추적표를 만들 수 없는 이유 (학습자용이 아니라 관리자·검증용) */
  problems: string[];
}

type Tracer = (code: string, watch: TraceWatch[], maxRows: number) => Promise<TraceResult>;

/** 물어볼 수 있는 식: 변수·속성·인덱스·비교·산술만 (호출·대입처럼 값을 바꾸는 식은 안 됨) */
const SAFE_EXPR = /^[\p{L}\w$.[\]'" +\-*/%<>=!&|?:]+$/u;
const MUTATING = /(^|[^=!<>])=(?!=)|\+\+|--|\w\s*\(/;

export function checkExpr(expr: string): string | null {
  if (!expr.trim() || expr.length > 60) return `식이 비었거나 너무 길어요: ${expr}`;
  if (!SAFE_EXPR.test(expr) || MUTATING.test(expr)) return `값을 바꾸거나 함수를 부르는 식은 물어볼 수 없어요: ${expr}`;
  return null;
}

const traceJs: Tracer = async (code, watch, maxRows) => {
  const problems: string[] = [];
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
    const fns = (list: string[]) => `[${list.map((e) => `() => (${e})`).join(", ")}]`;
    const indent = lines[w.line - 1].match(/^\s*/)?.[0] ?? "";
    out.splice(at, 0, `${indent}__trace(${i}, ${fns(w.ask)}, ${fns(w.given ?? [])});`);
  }
  const traced = await runJsTraced(out.join("\n"), maxRows);
  if (traced.output !== original.output) {
    problems.push("따라갈 줄에 기록을 넣으면 실행 결과가 달라져요 (여러 줄에 걸친 문장의 중간 줄일 수 있어요)");
  }
  if (original.threw || original.timedOut) problems.push("코드가 오류 없이 실행되지 않아요");

  const rows: TraceRow[] = [];
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
};

const TRACERS: Record<Language, Tracer> = { javascript: traceJs };

export function traceCode(language: Language, code: string, watch: TraceWatch[], maxRows = MAX_TRACE_ROWS): Promise<TraceResult> {
  return TRACERS[language](code, watch, maxRows);
}

/**
 * AI 가 만든 코드에서 따라갈 줄을 규칙으로 고른다 (AI 호출 없음).
 * 변수에 값을 넣거나 바꾸는 한 줄짜리 문장(;로 끝남)을 찾고, 반복문 안의 줄을 먼저 고른다.
 * for (const x of …) 안이면 x 를 상황 설명(given)으로 보여 준다.
 */
export function pickWatch(code: string): TraceWatch[] {
  const lines = code.split("\n");
  const candidates: { w: TraceWatch; score: number }[] = [];
  lines.forEach((text, i) => {
    const m = text.match(/^\s*(?:(?:let|const|var)\s+)?([A-Za-z_$][\w$]*)\s*(?:[+\-*/]?=(?!=)|\+\+|--)/);
    if (!m || !/;\s*$/.test(text) || /=>\s*\{?\s*$/.test(text)) return;
    // 값을 그대로 적은 선언(const prices = [1, 2] / let total = 0)은 물어볼 거리가 없다
    if (/^\s*(?:let|const|var)\s+[\w$]+\s*=\s*(?:\[|\{|["'`\d-]|true|false|null)[^;]*;\s*$/.test(text) && !/[+*/%]|\.\w+\(/.test(text.split("=").slice(1).join("="))) return;
    // 여러 줄짜리 배열·객체 선언은 끝 줄이 아니면 건너뛴다 (그 줄 뒤에 기록을 넣을 수 없음)
    if (/[[{(,]\s*$/.test(text)) return;
    const indent = text.match(/^\s*/)![0].length;
    let given: string[] = [];
    for (let j = i - 1; j >= 0 && indent > 0; j--) {
      const loop = lines[j].match(/for\s*\(\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s+of\b/);
      if (loop && lines[j].match(/^\s*/)![0].length < indent) {
        given = [loop[1]];
        break;
      }
    }
    candidates.push({ w: { line: i + 1, when: "after", ask: [m[1]], ...(given.length ? { given } : {}) }, score: indent > 0 ? 2 : 1 });
  });
  const inLoop = candidates.filter((c) => c.score === 2);
  const picked = (inLoop.length ? inLoop.slice(0, 1) : candidates.slice(0, 2)).map((c) => c.w);
  return picked;
}

/**
 * AI 가 만든 코드로 흐름 따라가기 문제를 규칙으로 만든다 (AI 호출 없음, 정답은 실제 실행 기록).
 * 따라갈 만한 줄이 없거나 기록할 수 없으면 null — 그 코드는 흐름 따라가기 없이 나머지 단계만 쓴다.
 */
export async function autoTraceQuestion(language: Language, code: string, codeItemId: string): Promise<TraceQuestion | null> {
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

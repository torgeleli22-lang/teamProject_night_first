/**
 * 문제 은행 검증 스크립트.
 * - 구조 검사 (id 중복, 개념 존재, 정답 인덱스, 오류 줄 범위 등)
 * - runnable 문제는 실제로 코드를 실행해서 output 과 일치하는지 검사
 *   (bug 문제는 수정된 코드, blank 문제는 정답을 채운 코드, order 문제는 올바른 순서의 코드를 실행)
 *
 * 실행: npm run verify
 */
import vm from "node:vm";
import { CONCEPTS } from "../src/lib/curriculum";
import { normalizeOutput } from "../src/lib/grading";
import { PROBLEMS } from "../src/lib/problems";
import type { Problem } from "../src/lib/types";

function fmt(value: unknown, nested = false): string {
  if (typeof value === "string") return nested ? `'${value}'` : value;
  if (Array.isArray(value)) return `[${value.map((v) => fmt(v, true)).join(", ")}]`;
  if (value && typeof value === "object") {
    if (typeof (value as { then?: unknown }).then === "function") return "Promise";
    const entries = Object.entries(value).map(([k, v]) => `${k}: ${fmt(v, true)}`);
    return `{${entries.join(", ")}}`;
  }
  return String(value);
}

function runnableCode(p: Problem): string {
  switch (p.type) {
    case "order":
      return p.pieces.join("\n");
    case "bug": {
      const lines = p.code.split("\n");
      lines[p.bugLine - 1] = p.fixedLine;
      return lines.join("\n");
    }
    case "choice":
      return p.subtype === "blank" ? p.code.replace("____", p.choices[p.answerIndex].text) : p.code;
    default:
      return p.code;
  }
}

async function execute(code: string): Promise<string> {
  const lines: string[] = [];
  const context = vm.createContext({
    console: { log: (...args: unknown[]) => lines.push(args.map((a) => fmt(a)).join(" ")) },
    setTimeout,
  });
  try {
    vm.runInContext(code, context, { timeout: 1000 });
  } catch (err) {
    lines.push(`Uncaught ${(err as Error).name}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 30));
  return lines.join("\n");
}

const conceptIds = new Set(CONCEPTS.map((c) => c.id));
const errors: string[] = [];
const seen = new Set<string>();
let executed = 0;

async function main() {
  for (const p of PROBLEMS) {
    const fail = (msg: string) => errors.push(`[${p.id}] ${msg}`);
    if (seen.has(p.id)) fail("중복 id");
    seen.add(p.id);
    p.conceptIds.forEach((c) => conceptIds.has(c) || fail(`존재하지 않는 개념 ${c}`));
    if (p.hints.length !== 4 || p.hints.some((h) => !h.trim())) fail("힌트는 4개여야 합니다");
    if (!p.explanation.trim() || !p.keyPoint.trim()) fail("해설/핵심 개념 누락");

    if (p.type === "choice") {
      if (!p.choices[p.answerIndex]) fail("answerIndex 범위 오류");
      if (p.subtype === "blank" && !p.code.includes("____")) fail("빈칸(____) 없음");
      if (p.subtype === "predict" && p.output && !p.output.startsWith("Uncaught")) {
        const a = normalizeOutput(p.choices[p.answerIndex].text).join("\n");
        if (a !== normalizeOutput(p.output).join("\n")) fail(`정답 보기와 output 불일치: ${p.output}`);
      }
      const texts = p.choices.map((c) => c.text);
      if (new Set(texts).size !== texts.length) fail("중복 보기");
    }
    if (p.type === "bug") {
      const lines = p.code.split("\n");
      if (p.bugLine < 1 || p.bugLine > lines.length) fail("bugLine 범위 오류");
      if (lines[p.bugLine - 1] === p.fixedLine) fail("fixedLine 이 원래 줄과 같음");
    }
    if (p.type === "explain" && p.rubric.length === 0) fail("루브릭 없음");

    if (p.runnable !== false && p.output !== undefined) {
      const actual = await execute(runnableCode(p));
      executed++;
      if (normalizeOutput(actual).join("\n") !== normalizeOutput(p.output).join("\n")) {
        fail(`실행 결과 불일치\n  expected: ${JSON.stringify(p.output)}\n  actual:   ${JSON.stringify(actual)}`);
      }
    }
  }

  const covered = new Set(PROBLEMS.flatMap((p) => p.conceptIds));
  CONCEPTS.forEach((c) => covered.has(c.id) || errors.push(`[concept ${c.id}] 문제가 없습니다`));

  if (errors.length) {
    console.error(errors.join("\n"));
    console.error(`\n✗ ${errors.length}개 문제 발견`);
    process.exit(1);
  }
  console.log(`✓ 문제 ${PROBLEMS.length}개 검증 완료 (실제 실행 ${executed}개)`);
}

main();

import { CONCEPTS } from "../curriculum";
import { evaluateShortAnswer, normalizeOutput, sameOutput } from "../grading";
import type { DifficultyFactors, Level, QuestionDraft } from "../types";
import { computeFactors, estimateLevel } from "./analyzer";
import { locate } from "./code-utils";
import { runJs } from "./runner";

export interface ValidationCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface ValidationReport {
  ok: boolean;
  checks: ValidationCheck[];
  /** 실제 실행 결과 (실행 가능한 코드일 때) */
  actualOutput: string | null;
  factors: DifficultyFactors;
  estimatedLevel: Level;
}

export interface ItemDraft {
  code: string;
  concepts: string[];
  output: string | null;
  runnable: boolean;
  /** AI 에게 요청한 목표 난이도. 있으면 난이도·문법 범위를 검사한다 */
  targetLevel?: Level;
  questions: QuestionDraft[];
}

/** 학습 코드에 들어가면 안 되는 것 (보안 + 학습 범위) */
const UNSAFE = /\b(require|import|process|globalThis|eval|Function|constructor|__proto__|while\s*\(\s*true\s*\))\b/;

/** 난이도별로 아직 등장하면 안 되는 문법 (불필요하게 어려운 개념 방지) */
const TOO_ADVANCED: Record<Level, [string, RegExp][]> = {
  1: [
    ["함수", /=>|\bfunction\b/],
    ["반복문", /\bfor\s*\(|\bwhile\s*\(/],
    ["배열 메서드", /\.(map|filter|reduce|forEach|find)\(/],
    ["비동기/브라우저", /\basync\b|\bawait\b|\bPromise\b|\bfetch\(|\bdocument\./],
  ],
  2: [
    ["reduce", /\.reduce\(/],
    ["비동기/브라우저", /\basync\b|\bawait\b|\bPromise\b|\bfetch\(|\bdocument\./],
  ],
  3: [["비동기/브라우저", /\basync\b|\bawait\b|\bPromise\b|\bfetch\(|\bdocument\./]],
  4: [],
  5: [],
};

const squashCode = (s: string) => s.replace(/\s+/g, "");

export async function validateItem(item: ItemDraft): Promise<ValidationReport> {
  const checks: ValidationCheck[] = [];
  const check = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  const conceptIds = new Set(CONCEPTS.map((c) => c.id));
  const unknown = item.concepts.filter((c) => !conceptIds.has(c));
  check("개념이 커리큘럼에 존재", unknown.length === 0, unknown.join(", ") || undefined);
  check("안전한 코드 (require/eval/무한 루프 등 없음)", !UNSAFE.test(item.code));
  check("문제가 1개 이상", item.questions.length > 0);

  const factors = computeFactors(item.code, item.concepts.length);
  const estimatedLevel = estimateLevel(factors);
  if (item.targetLevel) {
    check(
      "난이도가 목표에 맞음",
      Math.abs(estimatedLevel - item.targetLevel) <= 1,
      `목표 ${item.targetLevel}, 측정 ${estimatedLevel}`,
    );
    const advanced = TOO_ADVANCED[item.targetLevel].filter(([, re]) => re.test(item.code)).map(([n]) => n);
    check("난이도에 비해 어려운 문법 없음", advanced.length === 0, advanced.join(", ") || undefined);
  }

  // 1) 코드 실행 → 출력 일치
  let actualOutput: string | null = null;
  if (item.runnable && !UNSAFE.test(item.code)) {
    const run = await runJs(item.code);
    actualOutput = run.output;
    check("코드가 시간 안에 실행됨", !run.timedOut);
    if (item.output !== null) {
      check("제시한 실행 결과 = 실제 실행 결과", sameOutput(run.output, item.output), `실제: ${JSON.stringify(run.output)}`);
    }
  }
  const expected = item.output ?? actualOutput;

  // 2) 문제별 검사
  const ids = new Set<string>();
  for (const q of item.questions) {
    const tag = `[${q.id}]`;
    check(`${tag} id 중복 없음`, !ids.has(q.id));
    ids.add(q.id);
    check(`${tag} 힌트 4단계·해설·핵심 개념`, q.hints.length === 4 && q.hints.every((h) => h.trim()) && !!q.explanation.trim() && !!q.keyPoint.trim());

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
        const inCode = squashCode(item.code).includes(squashCode(filled));
        check(`${tag} 정답을 채운 코드가 원본 코드와 일치`, inCode);
        if (item.runnable && expected && inCode) {
          // 각 보기를 넣어 실행해 보고, 원래 결과가 나오는 보기가 정답 하나뿐인지 확인
          const flat = item.code;
          const start = locate(flat, filled);
          const results = await Promise.all(
            q.choices.map(async (c) => {
              if (start === null) return false;
              const variant = flat.slice(0, start[0]) + q.blankedCode.replace("____", c.text) + flat.slice(start[1]);
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
      case "find_bug": {
        const lines = q.buggyCode.split("\n");
        check(`${tag} 오류 줄 번호 유효`, q.bugLine >= 1 && q.bugLine <= lines.length);
        check(`${tag} 수정한 줄이 원래 줄과 다름`, lines[q.bugLine - 1] !== q.fixedLine);
        if (item.runnable && expected) {
          const fixed = [...lines];
          fixed[q.bugLine - 1] = q.fixedLine;
          const [buggyRun, fixedRun] = await Promise.all([runJs(q.buggyCode), runJs(fixed.join("\n"))]);
          check(`${tag} 수정하면 기대 결과가 나옴`, sameOutput(fixedRun.output, expected), `수정 후: ${JSON.stringify(fixedRun.output)}`);
          check(`${tag} 오류 코드는 다른 결과를 냄`, buggyRun.timedOut || !sameOutput(buggyRun.output, expected));
        }
        break;
      }
      case "shuffle": {
        check(`${tag} 조각 3개 이상`, q.pieces.length >= 3);
        if (item.runnable) {
          const run = await runJs(q.pieces.join("\n"));
          check(`${tag} 올바른 순서가 오류 없이 실행됨`, !run.threw && !run.timedOut, run.output);
          if (squashCode(q.pieces.join("")) === squashCode(item.code) && expected) {
            check(`${tag} 올바른 순서의 결과 = 원본 결과`, sameOutput(run.output, expected));
          }
        }
        break;
      }
      case "short_answer": {
        check(`${tag} 채점 기준 2개 이상`, q.rubric.length >= 2 && q.rubric.every((r) => r.keywords.length > 0));
        const self = evaluateShortAnswer({ ...q, codeItemId: "" }, q.modelAnswer);
        check(`${tag} 모범 답안이 채점 기준을 통과`, self.verdict === "correct", self.checks.filter((c) => c.level === "weak").map((c) => c.label).join(", ") || undefined);
        break;
      }
    }
  }

  return { ok: checks.every((c) => c.pass), checks, actualOutput, factors, estimatedLevel };
}

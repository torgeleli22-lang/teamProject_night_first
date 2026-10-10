import type { QuestionDraft } from "../../types";
import type { LegacyProblem } from "./legacy-types";
import { LEVEL_1_2 } from "./legacy/level1-2";
import { LEVEL_3_4 } from "./legacy/level3-4";
import { LEVEL_5 } from "./legacy/level5";
import { LEVEL_6_7 } from "./legacy/level6-7";
import type { SeedSet } from "./types";

/** 1차 MVP 의 '문제 1개 = 코드 1개' 형식을 코드 세트 형식으로 변환한다. */
export function convertLegacy(p: LegacyProblem): SeedSet {
  const base = {
    id: p.id,
    prompt: p.prompt,
    hints: p.hints,
    explanation: p.explanation,
    keyPoint: p.keyPoint,
  };
  let code = p.code;
  let question: QuestionDraft;

  switch (p.type) {
    case "choice":
      if (p.subtype === "blank") {
        code = p.code.replace("____", p.choices[p.answerIndex].text);
        question = { ...base, type: "fill_blank", skill: "recall", blankedCode: p.code, choices: p.choices, answerIndex: p.answerIndex };
      } else {
        question = {
          ...base,
          type: "multiple_choice",
          skill: p.subtype === "concept" ? "analyze" : "predict",
          choices: p.choices,
          answerIndex: p.answerIndex,
        };
      }
      break;
    case "predict":
      question = { ...base, type: "predict_output", skill: "predict", output: p.output, accepted: p.accepted };
      break;
    case "bug": {
      const lines = p.code.split("\n");
      lines[p.bugLine - 1] = p.fixedLine;
      code = lines.join("\n");
      question = { ...base, type: "find_bug", skill: "analyze", buggyCode: p.code, bugLine: p.bugLine, fixedLine: p.fixedLine };
      break;
    }
    case "order":
      code = p.pieces.join("\n");
      question = { ...base, type: "shuffle", skill: "analyze", pieces: p.pieces };
      break;
    case "explain":
      question = {
        ...base,
        type: "short_answer",
        skill: p.difficulty === 3 ? "synthesize" : "analyze",
        rubric: p.rubric,
        misconceptions: [],
        modelAnswer: p.modelAnswer,
      };
      break;
  }

  return {
    id: `item-${p.id}`,
    title: p.keyPoint,
    code,
    concepts: p.conceptIds,
    output: p.output ?? null,
    runnable: p.runnable !== false,
    questions: [question],
  };
}

export const LEGACY_SETS: SeedSet[] = [...LEVEL_1_2, ...LEVEL_3_4, ...LEVEL_5, ...LEVEL_6_7].map(convertLegacy);

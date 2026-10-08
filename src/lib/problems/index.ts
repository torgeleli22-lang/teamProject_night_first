import type { ConceptId, Problem } from "../types";
import { LEVEL_1_2 } from "./level1-2";
import { LEVEL_3_4 } from "./level3-4";
import { LEVEL_5 } from "./level5";
import { LEVEL_6_7 } from "./level6-7";

export const PROBLEMS: Problem[] = [...LEVEL_1_2, ...LEVEL_3_4, ...LEVEL_5, ...LEVEL_6_7];

const problemMap = new Map(PROBLEMS.map((p) => [p.id, p]));

export function getProblem(id: string): Problem | undefined {
  return problemMap.get(id);
}

/** 문제의 대표(첫 번째) 개념 */
export function primaryConcept(problem: Problem): ConceptId {
  return problem.conceptIds[0];
}

export function problemsForConcept(conceptId: ConceptId): Problem[] {
  return PROBLEMS.filter((p) => p.conceptIds.includes(conceptId)).sort(
    (a, b) => Number(primaryConcept(b) === conceptId) - Number(primaryConcept(a) === conceptId) || a.difficulty - b.difficulty,
  );
}

export const TYPE_LABEL: Record<Problem["type"] | "blank" | "concept", string> = {
  choice: "실행 결과 예측",
  predict: "결과 직접 입력",
  bug: "오류 찾기",
  order: "순서 맞추기",
  explain: "코드 설명하기",
  blank: "빈칸 채우기",
  concept: "개념 선택",
};

export function typeLabel(problem: Problem): string {
  if (problem.type === "choice" && problem.subtype !== "predict") return TYPE_LABEL[problem.subtype];
  return TYPE_LABEL[problem.type];
}

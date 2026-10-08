import { getConcept } from "../../curriculum";
import type { CodeItem, Level, Question } from "../../types";
import { computeFactors, estimateLevel } from "../analyzer";
import { LEGACY_SETS } from "./legacy";
import { SEED_SETS } from "./sets";
import type { SeedSet } from "./types";

export const ALL_SEED_SETS: SeedSet[] = [...SEED_SETS, ...LEGACY_SETS];

/** 단원별 기본 난이도: 코드 요소 분석 결과와 평균을 내서 시드 난이도를 정한다 */
const UNIT_BASE: Record<number, number> = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4, 7: 4 };

export function seedLevel(set: SeedSet): Level {
  if (set.level) return set.level;
  const factors = computeFactors(set.code, set.concepts.length);
  const unit = Math.max(...set.concepts.map((c) => UNIT_BASE[getConcept(c)?.unitId ?? 1] ?? 1));
  return Math.min(5, Math.max(1, Math.round((estimateLevel(factors) + unit) / 2))) as Level;
}

export function buildSeed(now = 0): { items: CodeItem[]; questions: Question[] } {
  const items: CodeItem[] = [];
  const questions: Question[] = [];
  for (const set of ALL_SEED_SETS) {
    items.push({
      id: set.id,
      title: set.title,
      code: set.code,
      concepts: set.concepts,
      level: seedLevel(set),
      factors: computeFactors(set.code, set.concepts.length),
      output: set.output,
      runnable: set.runnable !== false,
      source: "seed",
      status: "published",
      createdAt: now,
    });
    for (const q of set.questions) questions.push({ ...q, codeItemId: set.id } as Question);
  }
  return { items, questions };
}

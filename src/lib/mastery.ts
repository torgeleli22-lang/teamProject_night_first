import { CONCEPTS } from "./curriculum";
import type { Attempt, ConceptId } from "./types";

export interface ConceptStat {
  conceptId: ConceptId;
  attempts: number;
  correct: number;
  /** 0~100 */
  mastery: number;
}

/** 한 번의 풀이가 이해도에 기여하는 정도 (0~1) */
export function attemptQuality(a: Pick<Attempt, "correct" | "partial" | "hintsUsed">): number {
  if (a.correct) return Math.max(0.4, 1 - 0.15 * a.hintsUsed);
  if (a.partial) return 0.5;
  return 0;
}

const WINDOW = 5;
const FULL_CONFIDENCE_AT = 3;

/**
 * 개념별 이해도: 최근 5회 풀이 품질의 평균 × 풀이 수에 따른 신뢰도.
 * 한 문제 맞혔다고 바로 100%가 되지 않고, 최근 실수가 더 크게 반영된다.
 */
export function computeConceptStats(attempts: Attempt[]): Map<ConceptId, ConceptStat> {
  const byConcept = new Map<ConceptId, Attempt[]>();
  for (const a of attempts) {
    for (const c of a.conceptIds) {
      const list = byConcept.get(c) ?? [];
      list.push(a);
      byConcept.set(c, list);
    }
  }
  const stats = new Map<ConceptId, ConceptStat>();
  for (const concept of CONCEPTS) {
    const list = byConcept.get(concept.id) ?? [];
    const recent = list.slice(-WINDOW);
    const avg = recent.length ? recent.reduce((s, a) => s + attemptQuality(a), 0) / recent.length : 0;
    const confidence = Math.min(list.length / FULL_CONFIDENCE_AT, 1);
    stats.set(concept.id, {
      conceptId: concept.id,
      attempts: list.length,
      correct: list.filter((a) => a.correct).length,
      mastery: Math.round(avg * confidence * 100),
    });
  }
  return stats;
}

export const MASTERED = 80;
export const WEAK = 60;

export function isWeak(stat: ConceptStat | undefined): boolean {
  return !!stat && stat.attempts >= 2 && stat.mastery < WEAK;
}

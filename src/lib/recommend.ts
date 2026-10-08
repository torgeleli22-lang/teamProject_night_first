import { CONCEPTS, LEVELS, getConcept } from "./curriculum";
import { computeConceptStats, isWeak, MASTERED, type ConceptStat } from "./mastery";
import { PROBLEMS, problemsForConcept } from "./problems";
import type { Attempt, ConceptId, Problem } from "./types";

export interface Recommendation {
  conceptId: ConceptId;
  reason: "start" | "continue" | "review" | "next" | "polish";
  problemIds: string[];
  minutes: number;
}

const SESSION_SIZE = 3;

/** 현재 학습 중인 레벨: 아직 모든 개념을 익히지 못한 가장 낮은 레벨 */
export function currentLevelId(stats: Map<ConceptId, ConceptStat>): number {
  for (const level of LEVELS) {
    if (level.conceptIds.some((c) => (stats.get(c)?.mastery ?? 0) < MASTERED)) return level.id;
  }
  return LEVELS[LEVELS.length - 1].id;
}

export function weakConcepts(stats: Map<ConceptId, ConceptStat>): ConceptStat[] {
  return [...stats.values()].filter(isWeak).sort((a, b) => a.mastery - b.mastery);
}

export function strongConcepts(stats: Map<ConceptId, ConceptStat>): ConceptStat[] {
  return [...stats.values()].filter((s) => s.mastery >= MASTERED).sort((a, b) => b.mastery - a.mastery);
}

/**
 * 개념 하나에 대해 풀 문제 고르기:
 * 아직 안 푼 문제 → 틀렸던 문제 → 오래전에 푼 문제 순.
 */
export function pickProblems(conceptId: ConceptId, attempts: Attempt[], count = SESSION_SIZE, exclude: string[] = []): Problem[] {
  const lastResult = new Map<string, Attempt>();
  attempts.forEach((a) => lastResult.set(a.problemId, a));
  const candidates = problemsForConcept(conceptId).filter((p) => !exclude.includes(p.id));
  const score = (p: Problem) => {
    const last = lastResult.get(p.id);
    if (!last) return 0;
    if (!last.correct) return 1;
    return 2 + last.at / 1e15; // 오래전에 맞힌 문제가 먼저
  };
  return [...candidates].sort((a, b) => score(a) - score(b)).slice(0, count);
}

/** "오늘의 학습" 추천 (규칙 기반). AI 추천 메시지는 이 결과를 바탕으로 덧붙인다. */
export function recommendToday(attempts: Attempt[]): Recommendation {
  const stats = computeConceptStats(attempts);
  const build = (conceptId: ConceptId, reason: Recommendation["reason"]): Recommendation => {
    const problems = pickProblems(conceptId, attempts);
    return { conceptId, reason, problemIds: problems.map((p) => p.id), minutes: Math.max(5, problems.length * 3) };
  };

  if (attempts.length === 0) return build(LEVELS[0].conceptIds[0], "start");

  // 1) 취약 개념이 있으면 복습 우선
  const weak = weakConcepts(stats);
  if (weak.length) return build(weak[0].conceptId, "review");

  // 2) 최근에 공부하던 개념을 아직 익히지 못했다면 이어서
  const last = attempts[attempts.length - 1];
  const lastConcept = last.conceptIds[0];
  if ((stats.get(lastConcept)?.mastery ?? 0) < MASTERED && pickProblems(lastConcept, attempts, 1).length) {
    return build(lastConcept, "continue");
  }

  // 3) 현재 레벨에서 아직 익히지 못한 다음 개념
  const level = LEVELS.find((l) => l.id === currentLevelId(stats))!;
  const next = level.conceptIds.find((c) => (stats.get(c)?.mastery ?? 0) < MASTERED);
  if (next) return build(next, (stats.get(next)?.attempts ?? 0) > 0 ? "continue" : "next");

  // 4) 모두 익혔다면 가장 이해도가 낮은 개념 다듬기
  const lowest = [...stats.values()].sort((a, b) => a.mastery - b.mastery)[0];
  return build(lowest.conceptId, "polish");
}

export const REASON_TEXT: Record<Recommendation["reason"], (name: string) => string> = {
  start: (n) => `첫 걸음은 ${n}부터 시작해요. 가볍게 몸풀기!`,
  continue: (n) => `지난번에 하던 ${n}, 조금만 더 하면 익숙해질 거예요.`,
  review: (n) => `${n}에서 헷갈린 부분이 있었어요. 다시 한 번 짚고 넘어가요.`,
  next: (n) => `이제 ${n}을(를) 배울 차례예요.`,
  polish: (n) => `모든 개념을 한 번씩 익혔어요! ${n}을(를) 조금 더 다듬어 볼까요?`,
};

export function overallProgress(stats: Map<ConceptId, ConceptStat>): number {
  const total = CONCEPTS.reduce((s, c) => s + (stats.get(c.id)?.mastery ?? 0), 0);
  return Math.round(total / CONCEPTS.length);
}

export function conceptLabel(id: ConceptId) {
  return getConcept(id)?.name ?? id;
}

export const TOTAL_PROBLEMS = PROBLEMS.length;

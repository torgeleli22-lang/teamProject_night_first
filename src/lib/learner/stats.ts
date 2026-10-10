import { CONCEPTS, UNITS } from "../curriculum";
import type { Attempt, ConceptId, Level, QuestionType } from "../types";

/**
 * 학습 통계는 모두 일반 로직으로 계산한다 (AI 호출 없음).
 * 정답률, 풀이 시간, 힌트, 문제 유형별/개념별 정답률, 반복 오답, 이해도(mastery), XP, 연속 학습.
 */

/** 한 번의 풀이가 이해도에 기여하는 정도 (0~1) */
export function attemptQuality(a: Pick<Attempt, "correct" | "partial" | "hintsUsed">): number {
  if (a.correct) return Math.max(0.4, 1 - 0.15 * Math.min(a.hintsUsed, 4));
  if (a.partial) return 0.5;
  return 0;
}

export interface ConceptStat {
  conceptId: ConceptId;
  attempts: number;
  correct: number;
  /** 정답률 0~100 */
  accuracy: number;
  /** 이해도 0~100: 최근 5회 풀이 품질 × 풀이 수에 따른 신뢰도 */
  mastery: number;
  avgTimeMs: number;
  /** 최근 10회 중 오답 수 */
  recentWrong: number;
}

/**
 * 요약 테이블(concept_progress)로 개념별 통계를 만든다 — 화면에서는 이걸 쓴다 (전체 기록을 다시 읽지 않음).
 * conceptStats(attempts) 와 같은 공식이다.
 */
export function conceptStatsFromProgress(
  rows: { concept: ConceptId; attempts: number; correct: number; timeMs: number; recentQuality: number[]; recentResults: boolean[] }[],
): Map<ConceptId, ConceptStat> {
  const by = new Map(rows.map((r) => [r.concept, r]));
  const out = new Map<ConceptId, ConceptStat>();
  for (const c of CONCEPTS) {
    const r = by.get(c.id);
    const n = r?.attempts ?? 0;
    const quality = r?.recentQuality.length ? r.recentQuality.reduce((s, q) => s + q, 0) / r.recentQuality.length : 0;
    out.set(c.id, {
      conceptId: c.id,
      attempts: n,
      correct: r?.correct ?? 0,
      accuracy: n ? Math.round(((r?.correct ?? 0) / n) * 100) : 0,
      mastery: Math.round(quality * Math.min(n / 3, 1) * 100),
      avgTimeMs: n ? Math.round((r?.timeMs ?? 0) / n) : 0,
      recentWrong: r?.recentResults.filter((ok) => !ok).length ?? 0,
    });
  }
  return out;
}

export const MASTERED = 80;
export const WEAK = 60;

export function conceptStats(attempts: Attempt[]): Map<ConceptId, ConceptStat> {
  const by = new Map<ConceptId, Attempt[]>();
  for (const a of attempts) for (const c of a.concepts) by.set(c, [...(by.get(c) ?? []), a]);
  const out = new Map<ConceptId, ConceptStat>();
  for (const c of CONCEPTS) {
    const list = by.get(c.id) ?? [];
    const recent = list.slice(-5);
    const quality = recent.length ? recent.reduce((s, a) => s + attemptQuality(a), 0) / recent.length : 0;
    const correct = list.filter((a) => a.correct).length;
    out.set(c.id, {
      conceptId: c.id,
      attempts: list.length,
      correct,
      accuracy: list.length ? Math.round((correct / list.length) * 100) : 0,
      mastery: Math.round(quality * Math.min(list.length / 3, 1) * 100),
      avgTimeMs: list.length ? Math.round(list.reduce((s, a) => s + a.timeMs, 0) / list.length) : 0,
      recentWrong: list.slice(-10).filter((a) => !a.correct).length,
    });
  }
  return out;
}

export const isWeak = (s: ConceptStat | undefined) => !!s && s.attempts >= 2 && s.mastery < WEAK;

export function weakConcepts(stats: Map<ConceptId, ConceptStat>): ConceptStat[] {
  return [...stats.values()].filter(isWeak).sort((a, b) => a.mastery - b.mastery);
}

export function strongConcepts(stats: Map<ConceptId, ConceptStat>): ConceptStat[] {
  return [...stats.values()].filter((s) => s.mastery >= MASTERED).sort((a, b) => b.mastery - a.mastery);
}

/** 최근 10회 안에서 2번 이상 틀린 개념 */
export function repeatedWrong(stats: Map<ConceptId, ConceptStat>): ConceptStat[] {
  return [...stats.values()].filter((s) => s.recentWrong >= 2).sort((a, b) => b.recentWrong - a.recentWrong);
}

export interface TypeStat {
  type: QuestionType;
  attempts: number;
  accuracy: number;
  avgTimeMs: number;
}

export function typeStats(attempts: Attempt[]): TypeStat[] {
  const by = new Map<QuestionType, Attempt[]>();
  for (const a of attempts) by.set(a.questionType, [...(by.get(a.questionType) ?? []), a]);
  return [...by].map(([type, list]) => ({
    type,
    attempts: list.length,
    accuracy: Math.round((list.filter((a) => a.correct).length / list.length) * 100),
    avgTimeMs: Math.round(list.reduce((s, a) => s + a.timeMs, 0) / list.length),
  }));
}

export function misconceptionCounts(attempts: Attempt[]): { text: string; count: number }[] {
  const counts = new Map<string, number>();
  attempts.forEach((a) => a.misconception && counts.set(a.misconception, (counts.get(a.misconception) ?? 0) + 1));
  return [...counts].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count);
}

export function overallProgress(stats: Map<ConceptId, ConceptStat>): number {
  return Math.round([...stats.values()].reduce((s, c) => s + c.mastery, 0) / CONCEPTS.length);
}

/** 현재 공부 중인 단원: 아직 모든 개념을 익히지 못한 첫 단원 */
export function currentUnitId(stats: Map<ConceptId, ConceptStat>): number {
  return UNITS.find((u) => u.conceptIds.some((c) => (stats.get(c)?.mastery ?? 0) < MASTERED))?.id ?? UNITS[UNITS.length - 1].id;
}

// ───────────────────────── 난이도 추천 (규칙 기반) ─────────────────────────

export interface LevelSuggestion {
  level: Level;
  direction: "up" | "stay" | "down";
  message: string;
}

/**
 * 선택한 난이도에서의 최근 풀이로 추천 난이도를 계산한다.
 * 추천만 할 뿐 사용자의 난이도를 자동으로 바꾸지 않는다.
 */
export function suggestLevel(attempts: Attempt[], current: Level): LevelSuggestion {
  const recent = attempts.filter((a) => a.level === current).slice(-8);
  if (recent.length < 5) return { level: current, direction: "stay", message: "조금 더 풀어보면 알맞은 난이도를 추천해 드릴게요." };
  const accuracy = recent.filter((a) => a.correct).length / recent.length;
  const hints = recent.reduce((s, a) => s + Math.min(a.hintsUsed, 4), 0) / recent.length;
  if (accuracy >= 0.8 && hints < 1 && current < 5) {
    return { level: (current + 1) as Level, direction: "up", message: "지금 난이도를 안정적으로 해결하고 있어요. 조금 더 어려운 문제에 도전해 보세요." };
  }
  if (accuracy < 0.4 && current > 1) {
    return { level: (current - 1) as Level, direction: "down", message: "한 단계 낮은 난이도로 개념을 다지고 다시 올라와도 좋아요." };
  }
  return { level: current, direction: "stay", message: "지금 난이도가 딱 알맞아요. 이대로 꾸준히 가 봐요." };
}

// ───────────────────────── 게임화 ─────────────────────────

export function xpForAttempt(a: Pick<Attempt, "correct" | "partial" | "hintsUsed" | "level">): number {
  const base = a.correct ? (a.hintsUsed === 0 ? 15 : 10) : a.partial ? 6 : 2;
  return base + (a.correct ? a.level - 1 : 0) * 2;
}

export function totalXp(attempts: Attempt[]): number {
  return attempts.reduce((s, a) => s + xpForAttempt(a), 0);
}

export function learnerLevel(xp: number) {
  let level = 1;
  while (50 * (level + 1) * level <= xp) level++;
  const base = 50 * level * (level - 1);
  const next = 50 * (level + 1) * level;
  return { level, current: xp - base, needed: next - base };
}

/** 날짜 키 (한국 시간 기준) */
export function dayKey(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

export function streakDays(attempts: Attempt[], now = Date.now()): number {
  return streakFromDays(attempts.map((a) => dayKey(a.createdAt)), now);
}

/** 캘린더 요약(공부한 날짜 목록)으로 연속 학습일 계산 */
export function streakFromDays(dayList: string[], now = Date.now()): number {
  const days = new Set(dayList);
  let cursor = now;
  if (!days.has(dayKey(cursor))) cursor -= 86400_000;
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n++;
    cursor -= 86400_000;
  }
  return n;
}

export function solvedToday(attempts: Attempt[], now = Date.now()): number {
  const today = dayKey(now);
  return attempts.filter((a) => dayKey(a.createdAt) === today).length;
}

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  description: string;
  earned: boolean;
}

export function badges(attempts: Attempt[]): Badge[] {
  const stats = conceptStats(attempts);
  const mastered = (ids: string[]) => ids.every((c) => (stats.get(c)?.mastery ?? 0) >= MASTERED);
  return [
    { id: "first", emoji: "🌱", title: "첫 걸음", description: "첫 문제 풀기", earned: attempts.length > 0 },
    { id: "ten", emoji: "🔟", title: "꾸준함의 시작", description: "문제 10개 풀기", earned: attempts.length >= 10 },
    { id: "streak3", emoji: "🔥", title: "3일 연속", description: "3일 연속 학습", earned: streakDays(attempts) >= 3 },
    { id: "nohint", emoji: "🧠", title: "스스로 해결", description: "힌트 없이 5문제 맞히기", earned: attempts.filter((a) => a.correct && a.hintsUsed === 0).length >= 5 },
    { id: "explain", emoji: "🗣️", title: "설명왕", description: "주관식 문제 통과", earned: attempts.some((a) => a.questionType === "short_answer" && a.correct) },
    { id: "level3", emoji: "🌳", title: "초급 돌파", description: "초급(Lv.3) 문제 5개 맞히기", earned: attempts.filter((a) => a.level >= 3 && a.correct).length >= 5 },
    { id: "arrays", emoji: "🛠️", title: "배열 장인", description: "map·filter·forEach 익히기", earned: mastered(["map", "filter", "for-each"]) },
  ];
}

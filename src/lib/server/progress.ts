import "server-only";
import { conceptStatsFromProgress, dayKey, learnerLevel, streakFromDays, type ConceptStat } from "../learner/stats";
import type { ConceptId } from "../types";
import { conceptProgress, dailyActivity, type DailyActivity } from "./session-repo";

export interface ProgressSummary {
  stats: Map<ConceptId, ConceptStat>;
  days: DailyActivity[];
  xp: number;
  level: ReturnType<typeof learnerLevel>;
  streak: number;
  solvedToday: number;
  totalSolved: number;
  totalCorrect: number;
  totalTimeMs: number;
}

/** 헤더·학습 홈·내 학습 화면이 읽는 요약. 요약 테이블 두 개만 읽는다 */
export function loadProgress(sessionId: string): ProgressSummary {
  const days = dailyActivity(sessionId);
  const xp = days.reduce((s, d) => s + d.xp, 0);
  const today = dayKey(Date.now());
  return {
    stats: conceptStatsFromProgress(conceptProgress(sessionId)),
    days,
    xp,
    level: learnerLevel(xp),
    streak: streakFromDays(days.map((d) => d.day)),
    solvedToday: days.find((d) => d.day === today)?.solved ?? 0,
    totalSolved: days.reduce((s, d) => s + d.solved, 0),
    totalCorrect: days.reduce((s, d) => s + d.correct, 0),
    totalTimeMs: days.reduce((s, d) => s + d.timeMs, 0),
  };
}

import { aiMode } from "../lib/ai/client";
import { ANALYSIS_EVERY, type LearnerAnalysis } from "../lib/ai/analysis";
import { CONCEPTS, getUnit } from "../lib/curriculum";
import {
  badges,
  currentUnitId,
  isWeak,
  learnerLevel,
  misconceptionCounts,
  overallProgress,
  repeatedWrong,
  suggestLevel,
  topPercent,
  typeStats,
  weakConcepts,
  xpForAttempt,
} from "../lib/learner/stats";
import { getQuestion, loadContent } from "../lib/server/content-repo";
import { PERSONAS } from "../lib/server/demo";
import { planSession, wrongQuestions } from "../lib/server/planner";
import { loadProgress } from "../lib/server/progress";
import { latestAnalysis, listAttempts, myRank, ranking, SESSION_TTL_MS, type SessionInfo } from "../lib/server/session-repo";
import type { Level, QuestionType } from "../lib/types";

/**
 * 화면별로 필요한 데이터를 한 번의 요청으로 돌려준다 (브라우저 ↔ Lambda 왕복을 화면당 1번으로).
 * 정답·해설·채점 기준은 넣지 않는다.
 */

/** 헤더: 이름, 레벨·XP, 연속 학습 */
export async function meView(me: SessionInfo) {
  const p = await loadProgress(me.id);
  return {
    nickname: me.nickname,
    preferredLevel: me.preferredLevel,
    dailyGoal: me.dailyGoal,
    xp: p.xp,
    level: p.level.level,
    streak: p.streak,
    solvedToday: p.solvedToday,
    totalSolved: p.totalSolved,
    aiMode: aiMode(),
  };
}

/** 학습 탭 */
export async function learnView(me: SessionInfo) {
  const [attempts, progress, analysis, content] = await Promise.all([
    listAttempts(me.id),
    loadProgress(me.id),
    latestAnalysis<LearnerAnalysis>(me.id),
    loadContent(),
  ]);
  const level: Level = me.preferredLevel ?? 1;
  const suggestion = suggestLevel(attempts, level);
  const plan = planSession({ content, attempts, level, mode: "learn", size: 6 });
  const unit = getUnit(currentUnitId(progress.stats))!;
  return {
    attemptCount: attempts.length,
    level,
    suggestion,
    suggestedLevel: analysis?.result.recommendedLevel ?? (suggestion.direction !== "stay" ? suggestion.level : null),
    recommendedConcept: plan.focusConcept,
    unit: { emoji: unit.emoji, title: unit.title },
    solvedToday: progress.solvedToday,
    dailyGoal: me.dailyGoal,
    streak: progress.streak,
    overall: overallProgress(progress.stats),
    wrongCount: wrongQuestions(attempts).length,
    weakCount: weakConcepts(progress.stats).length,
    analysis,
    analysisEvery: ANALYSIS_EVERY,
    sinceLastAnalysis: attempts.length - (analysis?.attemptCount ?? 0),
  };
}

/** 복습 탭: 오답 노트 → 다질 개념 → 자주 하는 착각 */
export async function reviewView(me: SessionInfo) {
  const [attempts, progress] = await Promise.all([listAttempts(me.id), loadProgress(me.id)]);
  const wrong = [];
  for (const w of wrongQuestions(attempts)) {
    const found = await getQuestion(w.questionId);
    if (!found) continue;
    wrong.push({
      ...w,
      prompt: found.question.prompt,
      type: found.question.type,
      concept: found.item.concepts[0],
      level: found.item.level,
    });
  }
  return {
    level: me.preferredLevel ?? 1,
    wrong,
    weak: weakConcepts(progress.stats),
    misconceptions: misconceptionCounts(attempts).slice(0, 5),
  };
}

/** 랭킹 */
export async function rankingView(me: SessionInfo) {
  const [{ top, total }, mine] = await Promise.all([ranking(me.id, 10), myRank(me.id)]);
  return {
    nickname: me.nickname,
    top: top.map((r) => ({ ...r, level: learnerLevel(r.xp).level })),
    total,
    mine: mine ? { ...mine, level: learnerLevel(mine.xp).level, topPercent: topPercent(mine.rank, total) } : null,
    ttlHours: Math.round(SESSION_TTL_MS / 3600_000),
  };
}

/** 내 학습 */
export async function dashboardView(me: SessionInfo) {
  const attempts = await listAttempts(me.id);
  if (attempts.length === 0) return { empty: true as const };
  const [progress, analysis] = await Promise.all([loadProgress(me.id), latestAnalysis<LearnerAnalysis>(me.id)]);
  const { stats } = progress;
  const unit = getUnit(currentUnitId(stats))!;
  const recent = [];
  for (const a of [...attempts].reverse().slice(0, 10)) {
    recent.push({
      id: a.id,
      correct: a.correct,
      partial: a.partial,
      concept: a.concepts[0],
      prompt: (await getQuestion(a.questionId))?.question.prompt ?? "",
      type: a.questionType,
      timeMs: a.timeMs,
      gradedBy: a.gradedBy,
      xp: xpForAttempt(a),
      createdAt: a.createdAt,
    });
  }
  return {
    empty: false as const,
    unit: { emoji: unit.emoji, title: unit.title },
    preferredLevel: me.preferredLevel,
    xp: progress.xp,
    level: progress.level,
    streak: progress.streak,
    totalSolved: progress.totalSolved,
    accuracy: Math.round((progress.totalCorrect / Math.max(progress.totalSolved, 1)) * 100),
    avgTimeMs: progress.totalTimeMs / Math.max(progress.totalSolved, 1),
    hints: attempts.reduce((s, a) => s + Math.min(a.hintsUsed, 4), 0),
    overall: overallProgress(stats),
    started: CONCEPTS.map((c) => stats.get(c.id)!).filter((s) => s.attempts > 0),
    days: progress.days,
    types: typeStats(attempts).sort((a, b) => b.attempts - a.attempts),
    repeated: repeatedWrong(stats).slice(0, 4),
    misconceptions: misconceptionCounts(attempts).slice(0, 4),
    badges: badges(attempts),
    analysis,
    analysisEvery: ANALYSIS_EVERY,
    sinceLastAnalysis: attempts.length - (analysis?.attemptCount ?? 0),
    attemptCount: attempts.length,
    aiGraded: attempts.filter((a) => a.gradedBy === "ai").length,
    recent,
  };
}

/** 탐색: 코드와 문제 목록 (문제 지문만, 정답 없음) */
export async function conceptsView(me: SessionInfo) {
  const [attempts, progress, { items, byItem }] = await Promise.all([listAttempts(me.id), loadProgress(me.id), loadContent()]);
  const solved = new Map<string, boolean>();
  attempts.forEach((a) => solved.set(a.questionId, solved.get(a.questionId) || a.correct));
  return {
    initialLevel: me.preferredLevel,
    mastery: Object.fromEntries([...progress.stats.values()].map((s) => [s.conceptId, { mastery: s.mastery, weak: isWeak(s) }])),
    items: [...items.values()].map((item) => ({
      id: item.id,
      title: item.title,
      concepts: item.concepts,
      level: item.level,
      source: item.source,
      lines: item.factors.lines,
      questions: (byItem.get(item.id) ?? []).map((q) => ({ id: q.id, type: q.type as QuestionType, prompt: q.prompt, solved: solved.get(q.id) ?? null })),
    })),
  };
}

export function demoView() {
  return { mode: aiMode(), personas: Object.entries(PERSONAS).map(([id, p]) => ({ id, ...p })) };
}

export type MeView = Awaited<ReturnType<typeof meView>>;
export type LearnView = Awaited<ReturnType<typeof learnView>>;
export type ReviewView = Awaited<ReturnType<typeof reviewView>>;
export type RankingView = Awaited<ReturnType<typeof rankingView>>;
export type DashboardView = Awaited<ReturnType<typeof dashboardView>>;
export type ConceptsView = Awaited<ReturnType<typeof conceptsView>>;
export type ExploreItem = ConceptsView["items"][number];
export type DemoView = ReturnType<typeof demoView>;

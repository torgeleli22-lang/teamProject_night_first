import "server-only";
import * as z from "zod/v4";
import { CONCEPTS, conceptName } from "../curriculum";
import { generateCodeSet } from "./generate";
import { decidePersonal } from "../content/policy";
import { conceptStats, misconceptionCounts, repeatedWrong, strongConcepts, suggestLevel, typeStats, weakConcepts } from "../learner/stats";
import { coverage } from "../server/content-repo";
import { personalJobsSince } from "../server/ops-repo";
import { unsolvedCount } from "../server/session";
import { getQuestion } from "../server/content-repo";
import { insertAnalysis, latestAnalysis, listAttempts, recentShortAnswers } from "../server/learner-repo";
import type { ConceptId, Level } from "../types";
import { askStructured, withFallback } from "./client";
import { TUTOR_SYSTEM } from "./prompts";

/** 학습자 분석은 매 문제가 아니라 이 수만큼 새로 풀 때마다 한 번 한다 (AI 비용 관리 원칙 4) */
export const ANALYSIS_EVERY = 10;

export interface LearnerAnalysis {
  summary: string;
  strengths: string[];
  /** 혼동하는 개념 쌍/오개념. 예: "map 과 filter 를 혼동하는 경향" */
  confusions: { concepts: ConceptId[]; description: string }[];
  focusConcepts: ConceptId[];
  recommendedLevel: Level | null;
  levelMessage: string;
  studyTip: string;
}

const conceptIds = CONCEPTS.map((c) => c.id) as [string, ...string[]];

const AnalysisSchema = z.object({
  summary: z.string().describe("학습자의 현재 이해 상태를 2~3문장으로. 긍정적인 점부터"),
  strengths: z.array(z.string()).describe("잘 이해하고 있는 점 1~3개 (짧은 구절)"),
  confusions: z
    .array(
      z.object({
        concepts: z.array(z.enum(conceptIds)),
        description: z.string().describe("예: 'map 과 filter 의 차이를 혼동하는 경향이 있어요'"),
      }),
    )
    .describe("데이터에서 근거가 보이는 혼동/오개념만. 근거가 없으면 빈 배열"),
  focusConcepts: z.array(z.enum(conceptIds)).describe("다음에 집중할 개념 1~3개"),
  recommendedLevel: z.number().int().min(1).max(5).nullable().describe("추천 난이도 1~5. 판단 근거가 부족하면 null"),
  levelMessage: z.string().describe("추천 난이도에 대한 한 문장 설명"),
  studyTip: z.string().describe("다음 학습에서 시도해 볼 구체적인 한 가지"),
});

/** 새로 푼 문제가 ANALYSIS_EVERY 개 이상 쌓였는지 */
export function analysisDue(learnerId: string, attemptCount: number): boolean {
  const last = latestAnalysis(learnerId);
  return attemptCount - (last?.attemptCount ?? 0) >= ANALYSIS_EVERY;
}

/** 학습 기록을 분석해 저장한다. AI 가 없으면 규칙 기반 요약을 저장한다. */
export async function runLearnerAnalysis(learnerId: string, preferredLevel: Level | null): Promise<void> {
  const attempts = listAttempts(learnerId);
  if (attempts.length === 0) return;
  const stats = conceptStats(attempts);
  const attempted = [...stats.values()].filter((s) => s.attempts > 0);
  const misconceptions = misconceptionCounts(attempts).slice(0, 6);
  const previous = latestAnalysis<LearnerAnalysis>(learnerId);

  const ruleResult = (): { result: LearnerAnalysis; source: "ai" | "rule" } => {
    const weak = weakConcepts(stats);
    const strong = strongConcepts(stats);
    return {
      source: "rule",
      result: {
        summary: `지금까지 ${attempts.length}문제를 풀었어요. ${strong.length ? `${strong.map((s) => conceptName(s.conceptId)).slice(0, 3).join(", ")}은(는) 잘 이해하고 있어요.` : "개념을 하나씩 쌓아가는 중이에요."}`,
        strengths: strong.slice(0, 3).map((s) => conceptName(s.conceptId)),
        confusions: misconceptions.filter((m) => m.count >= 2).map((m) => ({ concepts: [], description: m.text })),
        focusConcepts: weak.slice(0, 3).map((s) => s.conceptId),
        recommendedLevel: null,
        levelMessage: "",
        studyTip: weak.length ? `${conceptName(weak[0].conceptId)} 문제를 몇 개 더 풀어보세요.` : "다음 개념으로 넘어가 보세요.",
      },
    };
  };

  const { result, source } = await withFallback(async () => {
    const shortAnswers = recentShortAnswers(learnerId, 5).map((s) => ({
      question: getQuestion(s.questionId)?.question.prompt ?? s.questionId,
      answer: s.text.slice(0, 400),
      correct: s.correct,
    }));
    const data = {
      totalAttempts: attempts.length,
      preferredLevel,
      accuracy: Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 100),
      byConcept: attempted.map((s) => ({
        concept: s.conceptId,
        name: conceptName(s.conceptId),
        attempts: s.attempts,
        accuracy: s.accuracy,
        mastery: s.mastery,
        avgSeconds: Math.round(s.avgTimeMs / 1000),
        recentWrong: s.recentWrong,
      })),
      byType: typeStats(attempts).map((t) => ({ ...t, avgSeconds: Math.round(t.avgTimeMs / 1000) })),
      repeatedWrong: repeatedWrong(stats).map((s) => s.conceptId),
      misconceptionsFromWrongChoices: misconceptions,
      hintsPerAttempt: +(attempts.reduce((s, a) => s + Math.min(a.hintsUsed, 4), 0) / attempts.length).toFixed(2),
      recentLevels: attempts.slice(-10).map((a) => ({ level: a.level, correct: a.correct })),
      recentShortAnswers: shortAnswers,
      previousSummary: previous?.result.summary ?? null,
    };
    const r = await askStructured({
      task: "learner_analysis",
      tier: "smart",
      effort: "medium",
      maxTokens: 8000,
      system: TUTOR_SYSTEM,
      schema: AnalysisSchema,
      mock: () => {
        // 목업: 통계로 AI 분석처럼 보이는 문장을 만든다
        const weak = weakConcepts(stats);
        const strong = strongConcepts(stats);
        const suggestion = suggestLevel(attempts, preferredLevel ?? 1);
        const conceptOf = (text: string) => attempts.find((a) => a.misconception === text)?.concepts[0];
        return {
          summary: `${attempts.length}문제를 풀면서 정답률 ${data.accuracy}%를 기록했어요. ${strong.length ? `${strong.slice(0, 2).map((s) => conceptName(s.conceptId)).join(", ")}은(는) 이제 코드를 보면 바로 읽히는 수준이에요.` : "기초 개념을 차근차근 쌓아가고 있어요."}${weak.length ? ` 다만 ${conceptName(weak[0].conceptId)}에서는 아직 실수가 반복되고 있어요.` : ""}`,
          strengths: strong.slice(0, 3).map((s) => `${conceptName(s.conceptId)} 코드를 정확하게 읽어요`),
          confusions: misconceptions
            .filter((m) => m.count >= 2)
            .slice(0, 2)
            .map((m) => ({ concepts: [conceptOf(m.text)].filter((c): c is string => !!c), description: `'${m.text}' 경향이 ${m.count}번 보였어요.` })),
          focusConcepts: weak.slice(0, 2).map((s) => s.conceptId),
          recommendedLevel: suggestion.direction === "stay" ? null : suggestion.level,
          levelMessage: suggestion.message,
          studyTip: weak.length ? `${conceptName(weak[0].conceptId)} 코드를 읽을 때 각 줄이 끝난 뒤 값이 어떻게 바뀌는지 직접 적어 보세요.` : "다음 단원으로 넘어가 새로운 개념에 도전해 보세요.",
        };
      },
      prompt: [
        "학습자의 문제 풀이 기록 통계입니다. 이 데이터를 근거로 학습자가 코드를 어떻게 이해하고 있는지 분석하세요.",
        `<learner_answer>\n${JSON.stringify(data, null, 2)}\n</learner_answer>`,
        `분석 지침:
- 정답률이 낮은 개념, 반복 오답, 오답 보기에 연결된 오개념, 주관식 답변 내용에서 '무엇을 헷갈리는지'를 찾으세요. 정답을 맞혔더라도 주관식 설명에 잘못된 개념이 있으면 포함하세요.
- 풀이 시간이 유독 긴 개념이나 힌트를 많이 쓴 패턴도 근거가 됩니다.
- 데이터에 근거가 없는 추측은 하지 마세요.
- 추천 난이도는 최근 난이도별 정답률을 보고 정하되, 근거가 부족하면 null.
- 학습자에게 직접 보여지므로 부담을 주지 말고 긍정적으로 쓰세요.`,
      ].join("\n\n"),
    });
    return { result: { ...r, recommendedLevel: (r.recommendedLevel as Level | null) ?? null }, source: "ai" as "ai" | "rule" };
  }, ruleResult);

  insertAnalysis(learnerId, attempts.length, result, source);

  // 혼동이 발견되면 그 개념의 맞춤 복습 세트를 만들지 판단한다 (policy.ts: personal_review)
  const confusion = result.confusions.find((c) => c.concepts.length > 0);
  if (confusion) {
    const concept = confusion.concepts[0];
    const level = preferredLevel ?? 2;
    const decision = decidePersonal({
      concept,
      level,
      stock: coverage().get(`${concept}:${level}`) ?? 0,
      unsolved: unsolvedCount(attempts, concept, level),
      personalToday: personalJobsSince(learnerId, Date.now() - 86400_000),
    });
    if (decision.generate) {
      await generateCodeSet({ concept, level, trigger: decision.trigger, reason: `${decision.reason}: ${confusion.description}`, learnerId, focus: [confusion.description] });
    }
  }
}

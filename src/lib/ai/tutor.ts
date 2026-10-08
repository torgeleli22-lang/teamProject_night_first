import * as z from "zod/v4";
import { conceptName, getConcept } from "../curriculum";
import { describeAnswer, detectMisconception, gradeAnswer } from "../grading";
import { offlineFeedback } from "../feedback-offline";
import type { Answer, ConceptId, Feedback, Problem } from "../types";
import { aiEnabled, askStructured } from "./client";
import { problemContext, TUTOR_SYSTEM } from "./prompts";

type Source = "ai" | "offline";

/** AI 호출이 실패하면 항상 오프라인 튜터로 대체한다 (학습 흐름이 끊기지 않도록). */
async function withFallback<T>(ai: () => Promise<T>, offline: () => T): Promise<T> {
  if (!aiEnabled()) return offline();
  try {
    return await ai();
  } catch (err) {
    console.error("[tutor] AI 호출 실패, 오프라인 튜터로 대체:", err instanceof Error ? err.message : err);
    return offline();
  }
}

// ───────────────────────── 답변 분석 / 피드백 ─────────────────────────

const FeedbackSchema = z.object({
  verdict: z.enum(["correct", "partial", "incorrect"]),
  headline: z.string().describe("한 줄 제목. 예: '정답이에요!', '거의 다 왔어요', '여기서 생각이 갈라졌어요'"),
  explanation: z.string().describe("학습자의 답과 연결한 2~4문장 설명. 맞은 부분을 먼저 인정하고, 어디서 달라졌는지 짚기"),
  steps: z.array(z.string()).describe("코드가 실행되는 과정을 한 줄씩 따라가는 2~6단계"),
  checks: z
    .array(
      z.object({
        label: z.string().describe("이해 요소. 예: '조건문', '>= 연산자', '실행 흐름'"),
        level: z.enum(["good", "ok", "weak"]),
        comment: z.string().describe("한 문장 코멘트"),
      }),
    )
    .describe("학습자의 이해도를 2~4개 요소로 나눠 평가"),
  misconception: z.string().nullable().describe("드러난 오개념을 짧은 구절로. 없으면 null"),
  nextTip: z.string().describe("다음에 비슷한 코드를 읽을 때 기억할 한 문장"),
});

export async function analyzeAnswer(problem: Problem, answer: Answer, hintsUsed: number): Promise<Feedback> {
  const graded = gradeAnswer(problem, answer);
  const misconception = detectMisconception(problem, answer);

  return withFallback(
    async () => {
      const result = await askStructured({
        system: TUTOR_SYSTEM,
        schema: FeedbackSchema,
        effort: problem.type === "explain" ? "medium" : "low",
        prompt: [
          problemContext(problem),
          `<learner_answer>\n${describeAnswer(problem, answer)}\n</learner_answer>`,
          graded === null
            ? "이 문제는 설명형입니다. 채점 기준의 각 요소를 학습자가 자신의 말로 담았는지 보고 verdict 를 정하세요. 표현이 서툴러도 의미가 맞으면 인정합니다. 모든 요소를 담았으면 correct, 일부만 담았으면 partial, 핵심을 놓쳤거나 틀린 설명이면 incorrect 입니다. checks 는 채점 기준 요소별로 평가하세요."
            : `채점 결과: ${graded ? "정답" : "오답"} (이 결과는 확정이며 verdict 는 ${graded ? "correct" : "incorrect"} 로 하세요).`,
          misconception ? `학습자가 고른 보기에 연결된 대표 오개념: ${misconception}` : "",
          hintsUsed > 0 ? `학습자는 힌트를 ${hintsUsed}단계까지 봤습니다.` : "학습자는 힌트 없이 풀었습니다.",
          "학습자에게 보여줄 피드백을 작성하세요.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      const correct = graded ?? result.verdict === "correct";
      return {
        correct,
        partial: graded === null ? result.verdict === "partial" : undefined,
        headline: result.headline,
        explanation: result.explanation,
        steps: result.steps,
        checks: result.checks,
        misconception: result.misconception ?? misconception,
        nextTip: result.nextTip,
        source: "ai" as Source,
      };
    },
    () => offlineFeedback(problem, answer, graded, hintsUsed, misconception),
  );
}

// ───────────────────────── 단계별 힌트 ─────────────────────────

const HINT_GUIDE: Record<number, string> = {
  1: "1단계: 관련 개념을 떠올리게 하는 질문 하나만 던지세요. 코드의 어느 부분을 봐야 하는지도 아직 말하지 마세요.",
  2: "2단계: 문제의 핵심이 되는 코드 부분(줄 또는 식)을 짚어 주세요. 그 부분이 어떻게 동작하는지는 아직 설명하지 마세요.",
  3: "3단계: 핵심 부분과 관련된 문법/개념을 이 코드에 맞춰 짧게 설명하세요.",
  4: "4단계: 정답에 아주 가까운 방향을 제시하세요. 다만 최종 정답 자체(출력값, 정답 보기, 줄 번호)는 말하지 마세요.",
};

const HintSchema = z.object({ hint: z.string().describe("1~3문장의 힌트") });

export async function generateHint(problem: Problem, level: number, draft?: string): Promise<{ hint: string; source: "ai" | "offline" }> {
  const step = Math.min(Math.max(level, 1), 4);
  return withFallback(
    async () => {
      const { hint } = await askStructured({
        system: TUTOR_SYSTEM,
        schema: HintSchema,
        effort: "low",
        maxTokens: 4000,
        prompt: [
          problemContext(problem),
          `이전 단계 힌트(이미 보여줌):\n${problem.hints.slice(0, step - 1).join("\n") || "(없음)"}`,
          `이번 단계 참고 힌트: ${problem.hints[step - 1]}`,
          draft?.trim() ? `<learner_answer>\n학습자가 지금까지 생각한 답: ${draft.trim()}\n</learner_answer>` : "",
          HINT_GUIDE[step],
          "학습자의 현재 생각이 주어졌다면 그 생각에 맞춰 힌트를 조정하세요. 참고 힌트를 그대로 반복하지 말고 이 학습자에게 맞게 다시 쓰세요.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      return { hint, source: "ai" as Source };
    },
    () => ({ hint: problem.hints[step - 1], source: "offline" as Source }),
  );
}

// ───────────────────────── 개념 설명 ─────────────────────────

const ConceptSchema = z.object({
  explanation: z.string().describe("초보자용 3~5문장 설명"),
  analogy: z.string().describe("일상생활 비유 한두 문장"),
  example: z.string().describe("짧은 JavaScript 예시 코드 (주석으로 결과 표시, 5줄 이내)"),
  checkQuestion: z.string().describe("이해했는지 스스로 확인해 볼 질문 하나"),
});

export type ConceptExplanation = z.infer<typeof ConceptSchema> & { title: string; keyIdea: string; source: "ai" | "offline" };

export async function explainConcept(conceptId: ConceptId, problem?: Problem): Promise<ConceptExplanation | null> {
  const concept = getConcept(conceptId);
  if (!concept) return null;
  const base = { title: concept.name, keyIdea: concept.keyIdea };
  return withFallback(
    async () => {
      const result = await askStructured({
        system: TUTOR_SYSTEM,
        schema: ConceptSchema,
        effort: "low",
        maxTokens: 6000,
        prompt: [
          `개념: ${concept.name}\n핵심: ${concept.keyIdea}\n참고 설명: ${concept.summary}`,
          problem ? `학습자가 지금 보고 있는 문제와 연결해서 설명하세요. 단, 이 문제의 정답은 말하지 마세요.\n${problemContext(problem)}` : "",
          "이 개념을 처음 배우는 사람에게 설명해 주세요.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      return { ...base, ...result, source: "ai" as Source };
    },
    () => ({
      ...base,
      explanation: concept.summary,
      analogy: "",
      example: concept.example,
      checkQuestion: "",
      source: "offline" as Source,
    }),
  );
}

// ───────────────────────── 문제에 대해 질문하기 ─────────────────────────

const AskSchema = z.object({ answer: z.string().describe("2~5문장의 답변. 필요하면 되묻는 질문으로 마무리") });

export interface ChatTurn {
  role: "user" | "tutor";
  text: string;
}

export async function askAboutProblem(
  problem: Problem,
  question: string,
  history: ChatTurn[],
  solved: boolean,
): Promise<{ answer: string; source: "ai" | "offline" }> {
  return withFallback(
    async () => {
      const { answer } = await askStructured({
        system: TUTOR_SYSTEM,
        schema: AskSchema,
        effort: "low",
        maxTokens: 6000,
        prompt: [
          problemContext(problem),
          solved
            ? "학습자는 이미 이 문제를 제출했으므로 정답을 이야기해도 됩니다."
            : "학습자는 아직 이 문제를 풀고 있습니다. 정답을 직접 말하지 말고 스스로 생각할 수 있게 도와주세요.",
          history.length
            ? `이전 대화:\n${history.map((t) => `${t.role === "user" ? "학습자" : "튜터"}: ${t.text}`).join("\n")}`
            : "",
          `<learner_answer>\n학습자 질문: ${question}\n</learner_answer>`,
          "코드 읽기 학습과 관계없는 요청(다른 코드 작성 대행 등)은 정중히 이 문제로 돌아오게 하세요.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      return { answer, source: "ai" as Source };
    },
    () => {
      const concept = getConcept(problem.conceptIds[0]);
      return {
        answer: `지금은 AI 튜터가 연결되어 있지 않아 자유 질문에 답할 수 없어요. 대신 이 문제의 핵심 개념을 정리해 드릴게요.\n\n${concept?.name}: ${concept?.summary}`,
        source: "offline" as Source,
      };
    },
  );
}

// ───────────────────────── 다음 학습 추천 메시지 ─────────────────────────

const RecommendSchema = z.object({ message: z.string().describe("학습자에게 건네는 1~2문장의 추천 메시지") });

export interface LearnerSummary {
  recommendedConcept: ConceptId;
  reason: string;
  weak: { conceptId: ConceptId; mastery: number }[];
  strong: ConceptId[];
  misconceptions: { text: string; count: number }[];
  totalAttempts: number;
  streak: number;
}

export async function recommendMessage(summary: LearnerSummary, fallback: string): Promise<{ message: string; source: "ai" | "offline" }> {
  return withFallback(
    async () => {
      const { message } = await askStructured({
        system: TUTOR_SYSTEM,
        schema: RecommendSchema,
        effort: "low",
        maxTokens: 3000,
        prompt: [
          "학습자의 학습 기록 요약입니다.",
          `<learner_answer>\n${JSON.stringify(
            {
              ...summary,
              recommendedConcept: conceptName(summary.recommendedConcept),
              weak: summary.weak.map((w) => ({ concept: conceptName(w.conceptId), mastery: w.mastery })),
              strong: summary.strong.map(conceptName),
            },
            null,
            2,
          )}\n</learner_answer>`,
          `오늘 추천 학습은 '${conceptName(summary.recommendedConcept)}'로 정해졌습니다 (이유: ${summary.reason}).`,
          "이 학습자에게 왜 오늘 이 개념을 하면 좋은지, 부담 없이 시작할 수 있게 1~2문장으로 말해 주세요. 반복되는 오개념이 있으면 자연스럽게 언급하세요. 부족한 점을 나열하지 말고 긍정적으로.",
        ].join("\n\n"),
      });
      return { message, source: "ai" as Source };
    },
    () => ({ message: fallback, source: "offline" as Source }),
  );
}

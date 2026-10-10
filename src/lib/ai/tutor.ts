import "server-only";
import * as z from "zod/v4";
import { getConcept } from "../curriculum";
import type { RuleEvaluation } from "../grading";
import type { CodeItem, ConceptCheck, Question, ShortAnswerQuestion } from "../types";
import { askStructured, withFallback } from "./client";
import { questionContext, TUTOR_SYSTEM } from "./prompts";

// ───────────────────────── 주관식 AI 평가 ─────────────────────────

const EvaluationSchema = z.object({
  verdict: z.enum(["correct", "partial", "incorrect"]),
  headline: z.string().describe("AI 튜터의 한 줄 첫 마디. 예: '정답은 맞았어요!', '거의 다 왔어요'"),
  explanation: z.string().describe("학습자의 답과 연결한 2~4문장 피드백. 이해한 부분을 먼저 인정하고, 빠졌거나 잘못된 부분을 짚기"),
  checks: z
    .array(
      z.object({
        label: z.string().describe("이해 요소. 예: 'filter() 개념', '배열 개념', '실행 흐름'"),
        level: z.enum(["good", "ok", "weak"]),
        comment: z.string().describe("한 문장 코멘트"),
      }),
    )
    .describe("이해도를 2~4개 요소로 나눠 평가"),
  misconception: z.string().nullable().describe("답변에서 드러난 잘못된 개념을 짧은 구절로. 없으면 null"),
  correction: z.string().nullable().describe("잘못된 개념이 있다면 바로잡는 1~2문장 설명. 없으면 null"),
  nextTip: z.string().describe("다음에 비슷한 코드를 읽을 때 기억할 한 문장"),
});

export interface ShortAnswerFeedback {
  verdict: "correct" | "partial" | "incorrect";
  headline: string;
  explanation: string;
  checks: ConceptCheck[];
  misconception: string | null;
  correction: string | null;
  nextTip: string;
  gradedBy: "rule" | "ai";
}

/**
 * 규칙 평가 결과(rule)를 받아, AI 가 필요하다고 판단된 경우에만 AI 로 다시 평가한다.
 * force = 학습자가 "AI 에게 자세히 분석 받기" 를 요청한 경우.
 */
export async function evaluateShortAnswer(
  q: ShortAnswerQuestion,
  item: CodeItem,
  text: string,
  rule: RuleEvaluation,
  force = false,
): Promise<ShortAnswerFeedback> {
  const fromRule = (): ShortAnswerFeedback => ruleFeedback(q, rule);
  if (rule.aiReasons.length === 0 && !force) return fromRule();

  return withFallback(async () => {
    const r = await askStructured({
      task: "short_answer_eval",
      tier: "smart",
      effort: "medium",
      maxTokens: 8000,
      system: TUTOR_SYSTEM,
      schema: EvaluationSchema,
      mock: () => mockEvaluation(q, text, rule),
      prompt: [
        questionContext(q, item),
        `모범 답안: ${q.modelAnswer}`,
        `<learner_answer>\n${text}\n</learner_answer>`,
        `1차 규칙 평가: ${rule.verdict} (AI 평가 요청 이유: ${rule.aiReasons.join(", ") || "학습자가 자세한 분석을 요청"})`,
        `규칙이 찾은 요소: ${rule.checks.map((c) => `${c.label}=${c.level === "good" ? "언급" : "누락"}`).join(", ")}`,
        rule.misconceptions.length ? `규칙이 감지한 오개념 표현: ${rule.misconceptions.map((m) => m.label).join(", ")}` : "",
        `학습자가 채점 기준의 각 요소를 자신의 말로 담았는지 평가하세요. 표현이 서툴러도 의미가 맞으면 인정합니다.
키워드가 들어 있어도 의미가 틀렸으면 인정하지 않습니다. 정답 요소를 담았더라도 잘못된 개념이 섞여 있으면 misconception 과 correction 에 적고 verdict 는 partial 로 하세요.
모든 요소를 정확히 담았으면 correct, 일부만 담았으면 partial, 핵심을 놓쳤거나 틀린 설명이면 incorrect 입니다.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    return { ...r, gradedBy: "ai" as const };
  }, fromRule);
}

/** 목업: 규칙 평가 결과를 AI 가 쓴 것 같은 문장으로 풀어 쓴다 */
function mockEvaluation(q: ShortAnswerQuestion, text: string, rule: RuleEvaluation): z.infer<typeof EvaluationSchema> {
  const good = rule.checks.filter((c) => c.level === "good").map((c) => c.label);
  const missing = rule.checks.filter((c) => c.level === "weak").map((c) => c.label);
  const m = rule.misconceptions[0];
  const verdict = m ? (good.length === rule.checks.length ? "partial" : "incorrect") : rule.verdict;
  return {
    verdict,
    headline: m && good.length === rule.checks.length ? "정답 요소는 담겼는데, 한 가지 오해가 보여요" : verdict === "correct" ? "정확하게 설명했어요!" : verdict === "partial" ? "거의 다 왔어요" : "같이 다시 짚어 볼까요?",
    explanation: [
      good.length ? `${good.join(", ")}은(는) 잘 짚었어요.` : `"${text.slice(0, 30)}${text.length > 30 ? "…" : ""}" 라고 적어 주셨네요.`,
      m ? `그런데 '${m.label}' 부분은 실제 동작과 달라요.` : "",
      missing.length ? `${missing.join(", ")}까지 설명하면 완벽해요.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    checks: rule.checks.map((c) => ({ ...c, comment: c.level === "good" ? "자신의 말로 잘 설명했어요." : "설명에서 빠져 있어요." })),
    misconception: m?.label ?? null,
    correction: m?.correction ?? null,
    nextTip: q.keyPoint,
  };
}

function ruleFeedback(q: ShortAnswerQuestion, rule: RuleEvaluation): ShortAnswerFeedback {
  const missing = rule.checks.filter((c) => c.level === "weak").map((c) => c.label);
  const m = rule.misconceptions[0];
  return {
    verdict: rule.verdict,
    headline: rule.verdict === "correct" ? "핵심을 잘 설명했어요!" : rule.verdict === "partial" ? "절반 이상 왔어요" : "조금 더 자세히 설명해 볼까요?",
    explanation:
      rule.verdict === "correct"
        ? "코드가 왜 그렇게 동작하는지 필요한 요소를 모두 짚었어요. 모범 설명과 비교해 보세요."
        : `${missing.length ? `${missing.join(", ")}에 대한 설명이 더 필요해요. ` : ""}모범 설명과 비교해 보세요.`,
    checks: rule.checks,
    misconception: m?.label ?? null,
    correction: m?.correction ?? null,
    nextTip: q.keyPoint,
    gradedBy: "rule",
  };
}

// ───────────────────────── 문제에 대해 질문하기 ─────────────────────────

function mockChat(q: Question, item: CodeItem, question: string, solved: boolean): string {
  const concept = getConcept(item.concepts[0]);
  const firstLine = item.code.split("\n").find((l) => l.trim()) ?? "";
  if (/어디|모르겠|시작/.test(question)) {
    return `좋은 질문이에요. 먼저 첫 줄 \`${firstLine.trim()}\` 에서 어떤 값이 만들어지는지부터 적어 보세요. 그다음 줄마다 '이 줄이 끝나면 값이 어떻게 바뀌었지?'를 하나씩 따라가면 돼요. 어느 줄에서 막혔나요?`;
  }
  if (/예시|다른/.test(question) && concept) {
    return `${concept.name}을(를) 다른 예시로 볼게요.\n\n${concept.example}\n\n핵심은 '${concept.keyIdea}' 예요. 지금 문제 코드와 어떤 점이 같은지 찾아볼까요?`;
  }
  if (solved) return `이 문제의 핵심은 '${q.keyPoint}' 예요. ${concept?.summary ?? ""}`;
  return `정답을 바로 알려드리기보다 힌트를 드릴게요. ${concept ? `이 코드는 '${concept.name}'이 핵심이에요 — ${concept.keyIdea}.` : ""} 이 생각을 바탕으로 코드를 한 줄씩 다시 읽어 보세요.`;
}

const AskSchema = z.object({ answer: z.string().describe("2~5문장의 답변. 필요하면 되묻는 질문으로 마무리") });

export interface ChatTurn {
  role: "user" | "tutor";
  text: string;
}

export async function askAboutQuestion(
  q: Question,
  item: CodeItem,
  question: string,
  history: ChatTurn[],
  solved: boolean,
): Promise<{ answer: string; source: "ai" | "offline" }> {
  return withFallback(
    async () => {
      const { answer } = await askStructured({
        task: "tutor_chat",
        tier: "fast",
        maxTokens: 4000,
        system: TUTOR_SYSTEM,
        schema: AskSchema,
        mock: () => ({ answer: mockChat(q, item, question, solved) }),
        prompt: [
          questionContext(q, item),
          solved
            ? "학습자는 이미 이 문제를 제출했으므로 정답을 이야기해도 됩니다."
            : "학습자는 아직 이 문제를 풀고 있습니다. 정답을 직접 말하지 말고 스스로 생각할 수 있게 실마리를 주세요.",
          history.length ? `이전 대화:\n${history.map((t) => `${t.role === "user" ? "학습자" : "튜터"}: ${t.text}`).join("\n")}` : "",
          `<learner_answer>\n학습자 질문: ${question}\n</learner_answer>`,
          "코드 읽기 학습과 관계없는 요청(다른 코드 작성 대행 등)은 정중히 이 문제로 돌아오게 하세요.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      return { answer, source: "ai" as "ai" | "offline" };
    },
    () => {
      const concept = getConcept(item.concepts[0]);
      return {
        answer: `지금은 AI 튜터가 연결되어 있지 않아 자유 질문에 답할 수 없어요. 대신 이 코드의 핵심 개념을 정리해 드릴게요.\n\n${concept?.name}: ${concept?.summary}`,
        source: "offline" as "ai" | "offline",
      };
    },
  );
}

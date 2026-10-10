import "server-only";
import crypto from "node:crypto";
import * as z from "zod/v4";
import { computeFactors } from "../content/analyzer";
import { validateItem, type ValidationReport } from "../content/validate";
import { CONCEPTS, getConcept, levelInfo } from "../curriculum";
import { saveGeneratedItem } from "../server/content-repo";
import { POLICY, isGeneratable, type Trigger } from "../content/policy";
import { createJob, finishJob, jobsSince, monthToDateCostUsd, runningJob } from "../server/ops-repo";
import type { ConceptId, Level, Question, Skill } from "../types";
import { AIUnavailableError, aiEnabled, aiMode, askStructured } from "./client";
import { MOCK_GENERATIONS } from "./mock-content";

/**
 * AI 콘텐츠 생성 파이프라인 (사용자가 문제를 풀 때마다가 아니라, 콘텐츠가 부족할 때만 실행).
 *
 *   AI 코드 + 문제 생성 (smart) → 구조 변환 → 실제 실행 검증 (validate.ts)
 *   → AI 검수 (fast: 해설-동작 일치, 정답 유일성, 난이도, 불필요한 개념) → DB 저장 (통과: published / 실패: rejected)
 *
 * 검증에 실패하면 실패 이유를 알려주고 한 번 다시 생성한다.
 */

const QUESTION_TYPES = ["multiple_choice", "short_answer", "fill_blank", "shuffle", "predict_output", "find_bug"] as const;
const SKILLS = ["recall", "predict", "analyze", "infer", "synthesize"] as const;
const conceptIds = CONCEPTS.map((c) => c.id) as [string, ...string[]];

const nullableStr = z.string().nullable();

const GeneratedSchema = z.object({
  title: z.string().describe("코드의 짧은 제목. 예: '성인 사용자 골라내기'"),
  code: z.string().describe("학습용 JavaScript 코드 (5~15줄, console.log 로 결과 출력)"),
  concepts: z.array(z.enum(conceptIds)).describe("코드에 쓰인 개념"),
  expectedOutput: z.string().describe("코드를 실행했을 때 콘솔 출력 (브라우저 콘솔 표기, 여러 줄은 줄바꿈)"),
  questions: z.array(
    z.object({
      type: z.enum(QUESTION_TYPES),
      skill: z.enum(SKILLS),
      prompt: z.string(),
      choices: z.array(z.object({ text: z.string(), misconception: nullableStr })).nullable().describe("multiple_choice, fill_blank 에서만. 4개"),
      answerIndex: z.number().int().nullable().describe("multiple_choice, fill_blank 정답 인덱스 (0부터)"),
      blankedCode: nullableStr.describe("fill_blank: 원본 코드의 한 줄(또는 몇 줄)에서 핵심 부분을 ____ 로 바꾼 것"),
      pieces: z.array(z.string()).nullable().describe("shuffle: 올바른 순서의 코드 조각 3~6개. 순서가 하나로만 정해져야 함"),
      output: nullableStr.describe("predict_output: 정답 출력"),
      buggyCode: nullableStr.describe("find_bug: 원본 코드에서 한 줄만 바꿔 오류를 넣은 전체 코드"),
      bugLine: z.number().int().nullable().describe("find_bug: 바뀐 줄 번호 (1부터)"),
      fixedLine: nullableStr.describe("find_bug: 그 줄의 올바른 코드 (원본 코드의 해당 줄과 같음)"),
      rubric: z
        .array(z.object({ label: z.string(), keywords: z.array(z.string()) }))
        .nullable()
        .describe("short_answer: 설명에 담겨야 할 요소 2~4개와, 그 요소를 언급했다고 볼 짧은 표현들(한국어 동의어 포함 4개 이상)"),
      misconceptions: z
        .array(z.object({ label: z.string(), keywords: z.array(z.string()), correction: z.string() }))
        .nullable()
        .describe("short_answer: 흔한 오개념과, 함께 나타나면 오개념으로 볼 표현들, 바로잡는 설명"),
      modelAnswer: nullableStr.describe("short_answer: 모범 답안 (rubric 의 표현을 실제로 포함)"),
      focusLines: z.array(z.number().int()).nullable().describe("코드의 특정 부분 역할을 묻는 문제라면 그 줄 번호"),
      hints: z.array(z.string()).describe("4단계 힌트: 1 개념을 떠올리는 질문, 2 핵심 부분 짚기, 3 관련 문법 설명, 4 정답에 가까운 방향 (정답 자체는 말하지 않음)"),
      explanation: z.string().describe("정답 해설. 실행 과정을 한 줄에 한 단계씩"),
      keyPoint: z.string().describe("핵심 개념 한 줄"),
    }),
  ),
});

type Generated = z.infer<typeof GeneratedSchema>;

const GENERATOR_SYSTEM = `당신은 프로그래밍 입문자를 위한 'JavaScript 코드 읽기' 학습 콘텐츠를 만드는 교육 콘텐츠 설계자입니다.
학습자는 코드를 작성하지 않고, 주어진 코드를 읽고 이해하는 연습을 합니다.

하나의 코드를 만든 뒤, 그 코드를 여러 관점에서 읽게 하는 문제들로 변환합니다.

코드 규칙:
- Node.js 에서 그대로 실행되는 순수 JavaScript. DOM, fetch, require, import, Math.random, Date 같은 외부 의존/비결정적 요소 금지.
- 결과는 console.log 로만 출력. 출력이 결정적이어야 합니다.
- 실생활에 가까운 친근한 예시(장바구니, 점수, 회원 목록 등). 변수명은 영어, 문자열 값은 한국어 가능.
- 요청한 난이도에 맞는 문법만 사용하고, 학습 목표와 관계없는 어려운 개념은 넣지 않습니다.

문제 규칙:
- 객관식은 정답이 정확히 하나. 오답 보기에는 그 보기를 고르는 학습자의 오개념을 misconception 에 적습니다.
- 빈칸 보기 중 원래 결과를 만드는 것은 정답 하나뿐이어야 합니다.
- 오류 찾기는 원본에서 정확히 한 줄만 바꾸고, 바꾼 코드는 다른 결과를 내거나 에러가 나야 합니다.
- 셔플 조각은 변수 의존 관계 때문에 올바른 순서가 하나로 정해져야 합니다.
- 해설은 실제 코드 동작과 정확히 일치해야 합니다.
- 모든 문장은 한국어 존댓말("~해요" 체), 초보자가 이해할 수 있게 짧게.
- 출력 표기는 브라우저 콘솔 형식: 배열 [1, 2, 3], 문자열 배열 ['a', 'b'], 객체 {name: 'Kim', age: 25}.`;

const SKILL_FOR_LEVEL: Record<Level, Skill[]> = {
  1: ["recall", "predict"],
  2: ["recall", "predict", "analyze"],
  3: ["predict", "analyze", "infer"],
  4: ["analyze", "infer", "synthesize"],
  5: ["infer", "synthesize"],
};

function toQuestions(g: Generated, itemId: string): { questions: Question[]; problems: string[] } {
  const problems: string[] = [];
  const questions: Question[] = [];
  g.questions.forEach((raw, n) => {
    const id = `${itemId}-q${n + 1}`;
    const hints = [...raw.hints, "", "", "", ""].slice(0, 4) as [string, string, string, string];
    const base = {
      id,
      codeItemId: itemId,
      prompt: raw.prompt,
      skill: raw.skill,
      hints,
      explanation: raw.explanation,
      keyPoint: raw.keyPoint,
      ...(raw.focusLines?.length ? { focusLines: raw.focusLines } : {}),
    };
    const choices = raw.choices?.map((c) => ({ text: c.text, ...(c.misconception ? { misconception: c.misconception } : {}) }));
    const missing = (field: string) => problems.push(`[${id}] ${raw.type} 에 ${field} 가 없음`);
    switch (raw.type) {
      case "multiple_choice":
        if (!choices || raw.answerIndex === null) return missing("choices/answerIndex");
        questions.push({ ...base, type: raw.type, choices, answerIndex: raw.answerIndex });
        break;
      case "fill_blank":
        if (!choices || raw.answerIndex === null || !raw.blankedCode) return missing("choices/answerIndex/blankedCode");
        questions.push({ ...base, type: raw.type, choices, answerIndex: raw.answerIndex, blankedCode: raw.blankedCode });
        break;
      case "shuffle":
        if (!raw.pieces) return missing("pieces");
        questions.push({ ...base, type: raw.type, pieces: raw.pieces });
        break;
      case "predict_output":
        if (!raw.output) return missing("output");
        questions.push({ ...base, type: raw.type, output: raw.output });
        break;
      case "find_bug":
        if (!raw.buggyCode || raw.bugLine === null || !raw.fixedLine) return missing("buggyCode/bugLine/fixedLine");
        questions.push({ ...base, type: raw.type, buggyCode: raw.buggyCode, bugLine: raw.bugLine, fixedLine: raw.fixedLine });
        break;
      case "short_answer":
        if (!raw.rubric || !raw.modelAnswer) return missing("rubric/modelAnswer");
        questions.push({ ...base, type: raw.type, rubric: raw.rubric, misconceptions: raw.misconceptions ?? [], modelAnswer: raw.modelAnswer });
        break;
    }
  });
  const types = new Set(questions.map((q) => q.type));
  for (const t of QUESTION_TYPES) if (!types.has(t)) problems.push(`문제 유형 ${t} 가 없음`);
  return { questions, problems };
}

// ───────────────────────── AI 검수 (저비용 모델) ─────────────────────────

const ReviewSchema = z.object({
  approve: z.boolean(),
  issues: z.array(z.string()).describe("발견한 문제. 없으면 빈 배열"),
});

async function reviewContent(g: Generated, actualOutput: string | null, level: Level): Promise<{ approve: boolean; issues: string[] }> {
  return askStructured({
    task: "content_review",
    tier: "fast",
    maxTokens: 4000,
    system: "당신은 프로그래밍 입문자용 학습 콘텐츠를 검수하는 꼼꼼한 검토자입니다. 사소한 표현 차이는 문제 삼지 말고, 학습자에게 잘못된 지식을 주거나 정답이 모호한 경우만 지적하세요.",
    schema: ReviewSchema,
    mock: () => ({ approve: true, issues: [] }),
    prompt: [
      `목표 난이도: ${level} (${levelInfo(level).name} — ${levelInfo(level).description})`,
      `코드:\n\`\`\`js\n${g.code}\n\`\`\``,
      `실제 실행 결과 (검증됨):\n${actualOutput ?? "(실행 불가)"}`,
      `문제들:\n${JSON.stringify(g.questions, null, 1)}`,
      `다음을 확인하세요:
1. 각 해설이 실제 코드 동작·실행 결과와 일치하는가?
2. 객관식/빈칸의 정답이 하나로 명확한가? (다른 보기도 정답으로 볼 여지가 있는가?)
3. 문제가 목표 난이도에 적절한가?
4. 학습 목표와 관계없이 불필요하게 어려운 개념이 들어 있지 않은가?
5. 힌트가 정답을 그대로 말하고 있지 않은가?
하나라도 학습자에게 해가 되는 문제가 있으면 approve=false.`,
    ].join("\n\n"),
  });
}

// ───────────────────────── 생성 실행 ─────────────────────────

export interface GenerateResult {
  jobId: number;
  status: "published" | "rejected" | "failed" | "skipped";
  itemId?: string;
  report?: ValidationReport;
  issues?: string[];
  error?: string;
}

export async function generateCodeSet(opts: {
  concept: ConceptId;
  level: Level;
  /** 생성 기준 (policy.ts) */
  trigger: Trigger;
  reason: string;
  /** 맞춤 복습 생성을 일으킨 학습자 */
  sessionId?: string;
  /** 학습자에게서 발견된 오개념/혼동 (개인화된 복습 콘텐츠) */
  focus?: string[];
}): Promise<GenerateResult> {
  const skip = (error: string): GenerateResult => ({ jobId: 0, status: "skipped", error });
  if (!aiEnabled()) return skip("AI 가 설정되어 있지 않습니다.");
  if (!getConcept(opts.concept)) return skip("알 수 없는 개념");
  if (opts.trigger !== "manual" && !isGeneratable(opts.concept, opts.level)) return skip("AI 생성 대상이 아닌 칸입니다.");
  if (runningJob(opts.concept, opts.level)) return skip("같은 개념·난이도로 생성 중입니다.");
  if (jobsSince(Date.now() - 86400_000) >= POLICY.dailyLimit) return skip("오늘의 생성 한도에 도달했습니다.");
  if (aiMode() === "live" && monthToDateCostUsd() >= POLICY.monthlyBudgetUsd) return skip("이번 달 AI 예산에 도달했습니다.");

  const jobId = createJob({ ...opts, mock: aiMode() === "mock" });
  const concept = getConcept(opts.concept)!;
  const info = levelInfo(opts.level);
  let feedback = "";
  let firstFailure = "";

  try {
    for (let round = 0; round < 2; round++) {
      const g = await askStructured({
        task: "content_generation",
        tier: "smart",
        effort: "high",
        maxTokens: 32000,
        system: GENERATOR_SYSTEM,
        schema: GeneratedSchema,
        mockDelayMs: 2500,
        mock: () => {
          const pool = MOCK_GENERATIONS[opts.concept];
          if (!pool) throw new AIUnavailableError(`목업 예시가 없는 개념입니다 (목업 지원: ${Object.keys(MOCK_GENERATIONS).join(", ")})`);
          return pool[Math.min(round, pool.length - 1)] as Generated;
        },
        prompt: [
          `중심 개념: ${concept.name} — ${concept.keyIdea}`,
          `난이도: Level ${opts.level} ${info.name} (${info.description}). 이 난이도의 주된 사고: ${info.skillLabel}.`,
          `문제마다 skill 은 ${SKILL_FOR_LEVEL[opts.level].join(", ")} 중에서 고르세요.`,
          `다음 문제 유형을 각각 최소 1개씩, 총 6~8문제: ${QUESTION_TYPES.join(", ")}. 객관식 중 하나는 '코드의 특정 부분의 역할'을 묻고 focusLines 를 지정하세요.`,
          opts.focus?.length ? `이 학습자에게서 발견된 혼동: ${opts.focus.join("; ")}. 이 혼동을 바로잡을 수 있도록 보기·오류·주관식을 설계하세요.` : "",
          feedback,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });

      const itemId = `ai-${opts.concept}-${crypto.randomUUID().slice(0, 8)}`;
      const { questions, problems } = toQuestions(g, itemId);
      const report = await validateItem({
        code: g.code,
        concepts: g.concepts,
        output: g.expectedOutput,
        runnable: true,
        targetLevel: opts.level,
        questions,
      });
      if (problems.length) report.checks.push(...problems.map((p) => ({ name: p, pass: false })));
      report.ok = report.ok && problems.length === 0;

      let issues: string[] = [];
      if (report.ok) {
        const review = await reviewContent(g, report.actualOutput, opts.level);
        issues = review.issues;
        report.checks.push({ name: "AI 검수 (해설 일치·정답 유일성·난이도·불필요한 개념)", pass: review.approve, detail: issues.join(" / ") || undefined });
        report.ok = review.approve;
      }

      if (feedback) report.checks.unshift({ name: "1차 생성물이 검증에 실패해 재생성함", pass: true, detail: firstFailure });
      const lastRound = round === 1;
      if (report.ok || lastRound) {
        const status = report.ok ? "published" : "rejected";
        saveGeneratedItem(
          {
            id: itemId,
            title: g.title,
            code: g.code,
            concepts: g.concepts.includes(opts.concept) ? g.concepts : [opts.concept, ...g.concepts],
            level: opts.level,
            factors: computeFactors(g.code, g.concepts.length),
            output: report.actualOutput ?? g.expectedOutput,
            runnable: true,
            status,
          },
          questions,
          report,
          jobId,
        );
        finishJob(jobId, status, itemId, report.ok ? null : failed(report));
        return { jobId, status, itemId, report, issues };
      }
      // 실패한 검증 항목을 알려주고 한 번 더 생성
      firstFailure = failed(report);
      feedback = `이전 생성물이 자동 검증에서 실패했습니다. 다음 문제를 고쳐서 처음부터 다시 만드세요:\n${firstFailure}`;
    }
    throw new Error("unreachable");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishJob(jobId, "failed", null, message);
    return { jobId, status: "failed", error: message };
  }
}

function failed(report: ValidationReport): string {
  return report.checks
    .filter((c) => !c.pass)
    .map((c) => `- ${c.name}${c.detail ? ` (${c.detail})` : ""}`)
    .join("\n");
}


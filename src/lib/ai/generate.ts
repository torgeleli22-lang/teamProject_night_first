import crypto from "node:crypto";
import * as z from "zod/v4";
import { computeFactors } from "../content/analyzer";
import { autoFixQuestions } from "../content/autofix";
import { autoTraceQuestion } from "../content/tracer";
import { validateCode, validateItem, type ValidationReport } from "../content/validate";
import { CONCEPTS, getConcept, levelInfo } from "../curriculum";
import { saveGeneratedItem } from "../server/content-repo";
import { POLICY, generatableLevels, isGeneratable, type Trigger } from "../content/policy";
import { autoGenerationEnabled, createJob, finishJob, jobCancelled, jobsSince, monthToDateCostUsd, runningJob, stopRequestedSince } from "../server/ops-repo";
import type { ConceptId, Level, Question, Skill } from "../types";
import { AIUnavailableError, aiEnabled, aiMode, askStructured } from "./client";
import { MOCK_GENERATIONS } from "./mock-content";

/**
 * AI 콘텐츠 생성 파이프라인 (사용자가 문제를 풀 때마다가 아니라, 콘텐츠가 부족할 때만 실행).
 * 흐름 따라가기(trace) 문제는 AI 가 만들지 않고, 코드를 실제로 실행한 기록으로 규칙에 따라 만든다 (tracer.ts).
 *
 *   AI 코드 + 문제 생성 (smart) → 구조 변환 → 실제 실행 검증 (validate.ts)
 *   → AI 검수 (fast: 해설-동작 일치, 정답 유일성, 난이도, 불필요한 개념) → DB 저장 (통과: published / 실패: rejected)
 *
 * 검증에 실패하면 실패 이유를 알려주고 한 번 다시 생성한다.
 */

const QUESTION_TYPES = ["multiple_choice", "short_answer", "fill_blank", "predict_output"] as const;
/** 코드 학습의 읽기 단계 (흐름 따라가기(trace)는 실행 기록으로 만드는 별도 형식이라 AI 가 만들지 않는다) */
const STAGES = ["overview", "key", "wrapup"] as const;
const SKILLS = ["recall", "predict", "analyze", "infer", "synthesize"] as const;
const conceptIds = CONCEPTS.map((c) => c.id) as [string, ...string[]];

const nullableStr = z.string().nullable();

const GeneratedQuestionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  stage: z.enum(STAGES).describe("읽기 단계: overview 훑어보기, key 핵심 줄, wrapup 정리"),
  skill: z.enum(SKILLS),
  prompt: z.string(),
  choices: z.array(z.object({ text: z.string(), misconception: nullableStr })).nullable().describe("multiple_choice, fill_blank 에서만. 4개"),
  answerIndex: z.number().int().nullable().describe("multiple_choice, fill_blank 정답 인덱스 (0부터)"),
  blankedCode: nullableStr.describe("fill_blank: 원본 코드의 한 줄(또는 몇 줄)에서 핵심 부분을 ____ 로 바꾼 것"),
  output: nullableStr.describe("predict_output: 정답 출력"),
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
  hints: z.array(z.string()).describe("힌트 2~4개: 생각할 질문 → 핵심 부분 짚기 → 관련 문법 → 정답에 가까운 방향 (정답 자체는 말하지 않음)"),
  explanation: z.string().describe("정답 해설. 실행 과정을 한 줄에 한 단계씩 (모든 문제에 반드시)"),
  keyPoint: z.string().describe("핵심 개념 한 줄 (모든 문제에 반드시)"),
});

/** 쓸 수 있는 문제가 이보다 적으면 세트 전체를 실패로 본다 */
const MIN_SALVAGED_QUESTIONS = 3;

/**
 * AI 가 일부 문제에서 해설·핵심 같은 칸을 빠뜨리면, 그 문제만 버리고 나머지로 계속한다.
 * (빠진 유형은 아래 검증에서 잡혀 한 번 더 생성하게 된다)
 */
function salvageGenerated(value: unknown): unknown {
  if (!value || typeof value !== "object" || !Array.isArray((value as { questions?: unknown }).questions)) return value;
  const all = (value as { questions: unknown[] }).questions;
  const kept = all.filter((q) => GeneratedQuestionSchema.safeParse(q).success);
  if (kept.length < MIN_SALVAGED_QUESTIONS) return value;
  if (kept.length < all.length) console.warn(`[generate] 칸이 빠진 문제 ${all.length - kept.length}개를 버리고 ${kept.length}개로 계속`);
  return { ...value, questions: kept };
}

/** 1단계: 코드만 (작은 호출). 서버가 실행해서 실제 출력을 얻는다 */
const CodeSchema = z.object({
  title: z.string().describe("코드의 짧은 제목. 예: '성인 사용자 골라내기'"),
  code: z.string().describe("학습용 JavaScript 코드 (5~15줄, console.log 로 결과 출력)"),
  concepts: z.array(z.enum(conceptIds)).describe("코드에 쓰인 개념"),
});

/** 2단계: 코드와 실제 실행 결과를 보고 만든 문제들 */
const QuestionsSchema = z.object({
  questions: z.array(GeneratedQuestionSchema),
});

/** 저장·검수에 쓰는 코드 세트 전체 */
interface Generated {
  title: string;
  code: string;
  concepts: z.infer<typeof CodeSchema>["concepts"];
  questions: z.infer<typeof GeneratedQuestionSchema>[];
}

const CODE_RULES = `코드 규칙:
- Node.js 에서 그대로 실행되는 순수 JavaScript. DOM, fetch, require, import, Math.random, Date 같은 외부 의존/비결정적 요소 금지.
- 결과는 console.log 로만 출력. 출력이 결정적이어야 합니다.
- 실생활에 가까운 친근한 예시(장바구니, 점수, 회원 목록 등). 변수명은 영어, 문자열 값은 한국어 가능.
- 요청한 난이도에 맞는 문법만 사용하고, 학습 목표와 관계없는 어려운 개념은 넣지 않습니다.`;

const CODE_SYSTEM = `당신은 프로그래밍 입문자를 위한 'JavaScript 코드 읽기' 학습 콘텐츠를 만드는 교육 콘텐츠 설계자입니다.
학습자는 코드를 작성하지 않고, 주어진 코드를 읽고 이해하는 연습을 합니다.
지금은 문제의 바탕이 될 코드 하나만 만듭니다. 서버가 이 코드를 실제로 실행해서 결과를 확인합니다.

${CODE_RULES}`;

const GENERATOR_SYSTEM = `당신은 프로그래밍 입문자를 위한 'JavaScript 코드 읽기' 학습 콘텐츠를 만드는 교육 콘텐츠 설계자입니다.
학습자는 코드를 작성하지 않고, 주어진 코드를 읽고 이해하는 연습을 합니다.

이미 만들어져 서버에서 실행까지 끝난 코드 하나와 그 실제 실행 결과가 주어집니다. 학습자가 이 코드를 읽는 순서대로 단계별 문제를 만듭니다.

단계 (stage) 와 문제 구성 — 정확히 4문제:
1. overview (훑어보기) 객관식 1개: "이 코드는 전체적으로 무엇을 하나요?" 처럼 코드 전체의 목적을 묻습니다. 오답 보기는 흔한 잘못 읽기(고르기와 바꾸기 혼동 등).
2. key (핵심 줄) 1개: 가장 중요한 한 줄(또는 몇 줄)의 역할을 묻는 객관식(focusLines 지정) 또는 그 줄의 핵심을 비운 빈칸(fill_blank).
3. wrapup (정리) 2개: 실행 결과 예측(predict_output) 1개 + 실행 과정을 내 말로 설명하는 주관식(short_answer) 1개.
실행 결과는 서버가 실제로 실행한 값이므로, 직접 계산하지 말고 그대로 믿고 쓰세요. 해설도 이 결과와 맞아야 합니다.

문제 규칙:
- 객관식은 정답이 정확히 하나. 오답 보기에는 그 보기를 고르는 학습자의 오개념을 misconception 에 적습니다.
- 실행 결과를 묻는 객관식(skill=predict)은 실제 실행 결과와 똑같은 보기가 정답 하나뿐이어야 합니다.
- 빈칸(fill_blank)의 blankedCode 는 원본 코드의 한 줄(또는 연속된 몇 줄)을 그대로 옮긴 뒤 한 곳만 ____ 로 바꿉니다. 정답 보기를 채우면 원본과 글자 그대로 같아야 하고, 다른 보기를 넣으면 실행 결과가 달라지거나 오류가 나야 합니다.
- 출력 예측(predict_output)의 정답은 주어진 실제 실행 결과 그대로.
- 주관식(short_answer)의 rubric keywords 는 모범 답안(modelAnswer)에 실제로 들어 있는 짧은 표현을 포함해야 합니다. 오개념(misconceptions) 표현은 모범 답안에 들어 있으면 안 됩니다.
- 해설은 실제 코드 동작과 정확히 일치해야 합니다.
- 모든 문제에 stage, prompt, hints(2~4개), explanation, keyPoint 를 빠짐없이 채웁니다. 그 유형에 해당하지 않는 칸은 null 로 씁니다.
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
    const hints = raw.hints.filter((h) => h.trim()).slice(0, 4);
    const base = {
      id,
      codeItemId: itemId,
      stage: raw.stage,
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
      case "predict_output":
        if (!raw.output) return missing("output");
        questions.push({ ...base, type: raw.type, output: raw.output });
        break;
      case "short_answer":
        if (!raw.rubric || !raw.modelAnswer) return missing("rubric/modelAnswer");
        questions.push({ ...base, type: raw.type, rubric: raw.rubric, misconceptions: raw.misconceptions ?? [], modelAnswer: raw.modelAnswer });
        break;
    }
  });
  const stages = new Set(questions.map((q) => q.stage));
  for (const st of STAGES) if (!stages.has(st)) problems.push(`읽기 단계 ${st} 문제가 없음`);
  const wrapTypes = new Set(questions.filter((q) => q.stage === "wrapup").map((q) => q.type));
  for (const t of ["predict_output", "short_answer"] as const) if (!wrapTypes.has(t)) problems.push(`정리 단계에 ${t} 문제가 없음`);
  return { questions, problems };
}

// ───────────────────────── AI 검수 (저비용 모델) ─────────────────────────

const ReviewSchema = z.object({
  approve: z.boolean(),
  issues: z.array(z.string()).describe("발견한 문제. 없으면 빈 배열"),
});

async function reviewContent(
  code: string,
  questions: Question[],
  actualOutput: string | null,
  level: Level,
  signal?: AbortSignal,
): Promise<{ approve: boolean; issues: string[] }> {
  return askStructured({
    signal,
    task: "content_review",
    tier: "fast",
    maxTokens: 4000,
    system: "당신은 프로그래밍 입문자용 학습 콘텐츠를 검수하는 꼼꼼한 검토자입니다. 사소한 표현 차이는 문제 삼지 말고, 학습자에게 잘못된 지식을 주거나 정답이 모호한 경우만 지적하세요.",
    schema: ReviewSchema,
    mock: () => ({ approve: true, issues: [] }),
    prompt: [
      `목표 난이도: ${level} (${levelInfo(level).name} — ${levelInfo(level).description})`,
      `코드:\n\`\`\`js\n${code}\n\`\`\``,
      `실제 실행 결과 (서버가 실행해서 확인함 — 정답·출력은 이미 이 값과 맞는지 자동으로 검사했습니다):\n${actualOutput ?? "(실행 불가)"}`,
      `문제들 (정답은 answerIndex·output 등에 있음):\n${JSON.stringify(
        questions.map(({ id: _id, codeItemId: _c, ...q }) => q),
        null,
        1,
      )}`,
      `다음을 확인하세요:
A. 해설(explanation)이 실제 코드 동작·실행 결과와 어긋나서 잘못된 지식을 주는가?
B. 객관식·빈칸에서 정답 말고 다른 보기도 정답으로 볼 수 있을 만큼 모호한가?
C. (참고) 난이도가 맞지 않거나, 불필요하게 어려운 개념이 있거나, 힌트가 정답을 그대로 말하는가?
A 또는 B 에 해당하는 문제가 있을 때만 approve=false. C 는 issues 에 적되 approve 는 true 로 두세요.
issues 는 어느 문제(prompt 앞부분)의 무엇이 문제인지 한 문장씩.`,
    ].join("\n\n"),
  });
}

// ───────────────────────── 생성 실행 ─────────────────────────

export interface GenerateResult {
  jobId: number;
  status: "published" | "rejected" | "failed" | "skipped" | "cancelled";
  itemId?: string;
  report?: ValidationReport;
  issues?: string[];
  error?: string;
}

/** DOM·이벤트·fetch 처럼 서버에서 실행해 정답을 확인할 수 없는 개념 */
export const NOT_VERIFIABLE =
  "이 주제는 아직 AI로 만들 수 없어요. 개념 학습(네트워크·개발·운영·보안) 문제는 실행으로 정답을 확인할 수 없어서, 관리자 승인 기능과 함께 다음 단계에서 열려요.";

/** 이 서버에서 진행 중인 생성 작업 (관리자가 중지하면 기다리던 AI 응답을 끊는다) */
const running = new Map<number, AbortController>();

/** 중지된 작업의 AI 호출을 끊는다. 다른 서버(인스턴스)에서 도는 작업은 DB 상태를 보고 결과를 버린다 */
export function abortJobs(ids: number[]) {
  for (const id of ids) running.get(id)?.abort();
}

/** 문제가 부족할 때 AI 가 알아서 일으키는 생성 (관리자 화면의 '자동 생성' 스위치 대상) */
const AUTO_TRIGGERS: Trigger[] = ["stock_floor", "demand", "personal_review"];

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
  /** 관리자가 적은 요청 ("어떤 내용으로 문제를 만들까요?"). 없으면 기본 기준대로 만든다 */
  instructions?: string;
  /** 반려된 콘텐츠를 고쳐서 다시 만들 때: 이전 결과물과 실패 이유 */
  repairFrom?: { title: string; code: string; actualOutput: string | null; questions: unknown[]; failures: string };
  /** 여러 칸을 차례로 만드는 작업(출시 전 채우기)의 시작 시각 — 그 뒤에 '전부 중지'가 눌렸으면 멈춘다 */
  stopSince?: number;
}): Promise<GenerateResult> {
  const skip = (error: string): GenerateResult => ({ jobId: 0, status: "skipped", error });
  if (!aiEnabled()) return skip("AI 가 설정되어 있지 않습니다.");
  if (!getConcept(opts.concept)) return skip("알 수 없는 개념");
  if (generatableLevels(opts.concept).length === 0) return skip(NOT_VERIFIABLE);
  if (opts.trigger !== "manual" && !isGeneratable(opts.concept, opts.level)) return skip("AI 생성 대상이 아닌 칸입니다.");
  if (AUTO_TRIGGERS.includes(opts.trigger) && !(await autoGenerationEnabled())) return skip("자동 생성이 꺼져 있습니다.");
  if (await runningJob(opts.concept, opts.level)) return skip("같은 개념·난이도로 생성 중입니다.");
  if ((await jobsSince(Date.now() - 86400_000)) >= POLICY.dailyLimit) return skip("오늘의 생성 한도에 도달했습니다.");
  if (aiMode() === "live" && (await monthToDateCostUsd()) >= POLICY.monthlyBudgetUsd) return skip("이번 달 AI 예산에 도달했습니다.");

  const jobId = await createJob({ ...opts, mock: aiMode() === "mock" });
  const controller = new AbortController();
  running.set(jobId, controller);
  const cancelled = async () =>
    controller.signal.aborted || (await jobCancelled(jobId)) || (opts.stopSince !== undefined && (await stopRequestedSince(opts.stopSince)));
  const stopped = async (): Promise<GenerateResult> => {
    await finishJob(jobId, "cancelled", null, "관리자가 중지했어요");
    return { jobId, status: "cancelled", error: "관리자가 중지했어요" };
  };
  const concept = getConcept(opts.concept)!;
  const info = levelInfo(opts.level);
  const mockPool = () => {
    const pool = MOCK_GENERATIONS[opts.concept];
    if (!pool) throw new AIUnavailableError(`목업 예시가 없는 개념입니다 (목업 지원: ${Object.keys(MOCK_GENERATIONS).join(", ")})`);
    return pool;
  };
  const adminRequest = opts.instructions
    ? `관리자가 원하는 내용입니다. 위의 개념·난이도·규칙을 지키는 범위에서 최대한 반영하세요 (규칙과 부딪히면 규칙이 우선):\n<admin_request>\n${opts.instructions}\n</admin_request>`
    : "";
  const focus = opts.focus?.length ? `이 학습자에게서 발견된 혼동: ${opts.focus.join("; ")}. 이 혼동을 바로잡을 수 있도록 설계하세요.` : "";
  /** 관리자 화면의 '검증 결과'에 함께 보여줄 진행 기록 (재시도·자동 수정) */
  const notes: ValidationReport["checks"] = [];

  try {
    // ── 1단계: 코드 만들기 → 서버에서 실행 (코드만 다시 만드는 건 싸므로 최대 3번) ──
    let picked: { code: z.infer<typeof CodeSchema>; report: ValidationReport } | null = null;
    let codeFeedback = "";
    let lastCodeReport: ValidationReport | null = null;
    // 고쳐서 다시 만들기: 이전 코드가 코드 검사를 통과하면 코드는 그대로 두고 문제만 다시 만든다
    if (opts.repairFrom) {
      const prev = { title: opts.repairFrom.title, code: opts.repairFrom.code, concepts: [opts.concept] as z.infer<typeof CodeSchema>["concepts"] };
      const report = await validateCode(prev.code, prev.concepts, opts.level);
      if (report.ok) picked = { code: prev, report };
      else codeFeedback = `이전 코드가 다음 검사에 실패했습니다. 주제와 흐름은 살리되 고친 코드를 만드세요:\n<previous_code>\n${prev.code}\n</previous_code>\n${failed(report)}`;
    }
    for (let attempt = 0; !picked && attempt < 3; attempt++) {
      if (await cancelled()) return stopped();
      const code = await askStructured({
        signal: controller.signal,
        task: "content_generation",
        tier: "smart",
        effort: "high",
        maxTokens: 3000,
        system: CODE_SYSTEM,
        schema: CodeSchema,
        mockDelayMs: 800,
        mock: () => {
          const pool = mockPool();
          const set = pool[Math.min(attempt, pool.length - 1)];
          return { title: set.title, code: set.code, concepts: set.concepts as z.infer<typeof CodeSchema>["concepts"] };
        },
        prompt: [
          `중심 개념: ${concept.name} — ${concept.keyIdea}`,
          `난이도: Level ${opts.level} ${info.name} (${info.description}). 이 난이도의 주된 사고: ${info.skillLabel}.`,
          "코드는 5~15줄. 출력 예측·빈칸·오류 찾기·순서 맞추기 문제를 만들 수 있게, 변수 의존 관계가 분명하고 console.log 출력이 1~3줄인 코드가 좋습니다.",
          focus,
          adminRequest,
          codeFeedback,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      const report = await validateCode(code.code, code.concepts, opts.level);
      lastCodeReport = report;
      if (report.ok) {
        picked = { code, report };
        if (attempt > 0) notes.push({ name: `코드를 ${attempt + 1}번째 시도에서 통과시킴`, pass: true });
        break;
      }
      codeFeedback = `방금 만든 코드가 서버 검사에 실패했습니다. 다음을 고친 새 코드를 만드세요:\n<previous_code>\n${code.code}\n</previous_code>\n${failed(report)}`;
    }
    if (!picked) {
      const reason = `코드가 검사를 3번 모두 통과하지 못했어요:\n${lastCodeReport ? failed(lastCodeReport) : ""}`;
      await finishJob(jobId, "failed", null, reason);
      return { jobId, status: "failed", error: reason, report: lastCodeReport ?? undefined };
    }
    const { code: base, report: codeReport } = picked;
    const actualOutput = codeReport.actualOutput ?? "";

    // ── 2단계: 코드 + 실제 실행 결과를 보고 문제 만들기 → 규칙 자동 수정 → 실행 검증 → AI 검수 (최대 2번) ──
    let feedback = "";
    for (let round = 0; round < 2; round++) {
      if (await cancelled()) return stopped();
      let questionsOut: z.infer<typeof QuestionsSchema>;
      try {
        questionsOut = await askStructured({
          signal: controller.signal,
          task: "content_generation",
          tier: "smart",
          effort: "high",
          maxTokens: 16000,
          system: GENERATOR_SYSTEM,
          schema: QuestionsSchema,
          salvage: salvageGenerated,
          mockDelayMs: 1500,
          mock: () => {
            const pool = mockPool();
            const set = pool.find((p) => p.code === base.code) ?? pool[0];
            return { questions: set.questions } as z.infer<typeof QuestionsSchema>;
          },
          prompt: [
            `중심 개념: ${concept.name} — ${concept.keyIdea}`,
            `난이도: Level ${opts.level} ${info.name} (${info.description}). 이 난이도의 주된 사고: ${info.skillLabel}.`,
            `코드 (줄 번호는 참고용이며 코드의 일부가 아닙니다):\n\`\`\`js\n${base.code
              .split("\n")
              .map((l, i) => `${String(i + 1).padStart(2)}| ${l}`)
              .join("\n")}\n\`\`\``,
            `서버에서 실제로 실행한 결과 (정확함):\n<actual_output>\n${actualOutput}\n</actual_output>`,
            `문제마다 skill 은 ${SKILL_FOR_LEVEL[opts.level].join(", ")} 중에서 고르세요.`,
            "단계 구성(훑어보기 1, 핵심 줄 1, 정리 2 = 4문제)을 지키세요.",
            focus,
            opts.repairFrom
              ? [
                  "아래는 이전에 이 코드로 만든 문제들인데 자동 검증에서 반려됐습니다. 실패한 항목을 모두 고친 문제 전체를 다시 제출하세요.",
                  `<failed_checks>\n${opts.repairFrom.failures}\n</failed_checks>`,
                  opts.repairFrom.code === base.code ? `<previous_questions>\n${JSON.stringify(opts.repairFrom.questions)}\n</previous_questions>` : "",
                ]
                  .filter(Boolean)
                  .join("\n")
              : "",
            adminRequest,
            feedback,
          ]
            .filter(Boolean)
            .join("\n\n"),
        });
      } catch (err) {
        // 응답이 형식에 맞지 않거나 잘렸으면, 이유를 알려 주고 한 번 더 만든다
        const message = err instanceof Error ? err.message : String(err);
        if (round === 0 && /could not parse response|response was truncated/.test(message)) {
          notes.push({ name: "1차 문제 응답이 형식에 맞지 않아 다시 만듦", pass: true, detail: message });
          feedback = `이전 응답이 형식에 맞지 않았습니다 (${message}). 모든 문제에 stage·prompt·hints·explanation·keyPoint 를 빠짐없이 채우고, 4문제로 간결하게 만드세요.`;
          continue;
        }
        throw err;
      }

      const g: Generated = { ...base, questions: questionsOut.questions };
      const itemId = `ai-${opts.concept}-${crypto.randomUUID().slice(0, 8)}`;
      const converted = toQuestions(g, itemId);
      const fixed = autoFixQuestions(base.code, actualOutput, converted.questions);
      const fixes = fixed.fixes;
      // 흐름 따라가기는 AI 가 아니라 실제 실행 기록으로 만든다 (만들 수 없는 코드면 그 단계 없이)
      const trace = await autoTraceQuestion("javascript", base.code, itemId);
      const questions = trace ? [...fixed.questions, trace] : fixed.questions;
      const report = await validateItem({
        code: base.code,
        concepts: base.concepts,
        output: actualOutput,
        runnable: true,
        targetLevel: opts.level,
        questions,
      });
      if (converted.problems.length) report.checks.push(...converted.problems.map((p) => ({ name: p, pass: false })));
      report.ok = report.ok && converted.problems.length === 0;
      if (fixes.length) report.checks.unshift({ name: `AI 가 틀린 정답 ${fixes.length}곳을 실행 결과로 자동 수정`, pass: true, detail: fixes.join(" / ") });

      let issues: string[] = [];
      if (report.ok) {
        if (await cancelled()) return stopped();
        const review = await reviewContent(base.code, questions, actualOutput, opts.level, controller.signal);
        issues = review.issues;
        report.checks.push({ name: "AI 검수 (해설 일치·정답 유일성·난이도·불필요한 개념)", pass: review.approve, detail: issues.join(" / ") || undefined });
        report.ok = review.approve;
      }
      report.checks.unshift(...notes);

      const lastRound = round === 1;
      if (await cancelled()) return stopped();
      if (report.ok || lastRound) {
        const status = report.ok ? "published" : "rejected";
        await saveGeneratedItem(
          {
            id: itemId,
            track: "code",
            language: "javascript",
            title: base.title,
            code: base.code,
            concepts: base.concepts.includes(opts.concept) ? base.concepts : [opts.concept, ...base.concepts],
            level: opts.level,
            factors: computeFactors(base.code, base.concepts.length),
            output: report.actualOutput ?? actualOutput,
            runnable: true,
            status,
          },
          questions,
          report,
          jobId,
        );
        await finishJob(jobId, status, itemId, report.ok ? null : failed(report));
        return { jobId, status, itemId, report, issues };
      }
      // 실패한 검증 항목을 알려주고 문제만 한 번 더 생성 (코드는 그대로)
      const failures = failed(report);
      notes.push({ name: "1차 문제가 검증에 실패해 문제만 다시 만듦", pass: true, detail: failures });
      feedback = `이전에 만든 문제들이 자동 검증에서 실패했습니다. 같은 코드로, 다음 문제를 고쳐서 문제 전체를 다시 만드세요:\n${failures}`;
    }
    throw new Error("unreachable");
  } catch (err) {
    if (await cancelled()) return stopped();
    const message = err instanceof Error ? err.message : String(err);
    await finishJob(jobId, "failed", null, message);
    return { jobId, status: "failed", error: message };
  } finally {
    running.delete(jobId);
  }
}

function failed(report: ValidationReport): string {
  return report.checks
    .filter((c) => !c.pass)
    .map((c) => `- ${c.name}${c.detail ? ` (${c.detail})` : ""}`)
    .join("\n");
}


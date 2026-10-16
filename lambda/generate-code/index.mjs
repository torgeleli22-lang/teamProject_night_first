/**
 * 코드 문제 만들기 Lambda (generate-code) — Node.js 22.x, 핸들러: index.handler
 *
 * jojo_api(lambda/api)가 문제가 부족할 때(questions.py), 학습자 분석에서 혼동이 보일 때(learner_analysis.py),
 * 관리자가 만들 때(admin.py) 부른다. 부른 쪽은 기다리지 않는다.
 * AI 가 만든 코드를 '실제로 실행해서' 정답을 확인해야 해서, 이 기능만 Node.js 로 만들었다.
 *
 *   ① AI 가 코드만 만든다 → 실제로 실행해 검사 (최대 3번)
 *   ② 코드 + 실제 실행 결과를 보고 AI 가 단계별 문제(훑어보기·핵심 줄·정리)를 만든다
 *   ③ 정답을 실행 결과로 자동 수정 → 흐름 따라가기 문제는 실행 기록으로 직접 만든다 → 실행 검증 → AI 검수 (최대 2번)
 *   ④ 통과하면 공개(published), 아니면 반려(rejected)로 저장
 *
 * 받는 값 (이벤트)
 *   { "concept": "map", "level": 3, "trigger": "stock_floor", "reason": "...", "sessionId": "...", "focus": ["학습자의 혼동"],
 *     "count": 1, "instructions": "관리자 요청(선택)", "repairFrom": {...반려된 콘텐츠(선택)} }
 *   { "fill": [{ "concept": "map", "level": 3, "stock": 0 }, ...] }   출시 전 채우기 (칸마다 하나씩)
 *
 * 파일: index.mjs(이 파일, 흐름) · checks.mjs(코드 실행·검사) · mock-content.json(AI_MODE=mock 일 때 쓰는 예시)
 * AWS SDK 는 Lambda 런타임에 들어 있는 것을 쓴다 (따로 넣을 것 없음).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { autoFixQuestions, autoTraceQuestion, computeFactors, validateCode, validateItem } from "./checks.mjs";

// ───────────────────────── 설정 ─────────────────────────

const TABLE_NAME = process.env.TABLE_NAME || "jojo_table";
const TTL_ATTR = process.env.TTL_ATTR || "jojo_ttl";
const MODEL_ID = process.env.MODEL_ID || "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const AI_MODE = process.env.AI_MODE || "live"; // live: 실제 AI, mock: 예시 응답(비용 없음), off: 만들지 않음
const DAILY_LIMIT = Number(process.env.AI_GENERATION_DAILY_LIMIT || 30); // 하루 전체 생성 상한
const MONTHLY_BUDGET_USD = Number(process.env.AI_MONTHLY_BUDGET_USD || 10); // 한 달 AI 예산
const PRICE = { "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 } }; // USD / 100만 토큰 (추정)
// 단원별로 AI 생성을 허용하는 난이도 (lambda/api/common.py 의 LEVELS_BY_UNIT 과 같게)
const LEVELS_BY_UNIT = { 1: [1, 2, 3], 2: [1, 2, 3], 3: [2, 3, 4], 4: [2, 3, 4], 5: [3, 4, 5], 7: [4, 5] };
const AUTO_TRIGGERS = ["stock_floor", "demand", "personal_review"];

const db = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.DB_REGION || "ap-northeast-2", ...(process.env.DYNAMODB_ENDPOINT ? { endpoint: process.env.DYNAMODB_ENDPOINT } : {}) }),
  { marshallOptions: { removeUndefinedValues: true } },
);
const bedrock = new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION || "us-east-1", maxAttempts: 2 });
const MOCK = JSON.parse(fs.readFileSync(new URL("./mock-content.json", import.meta.url), "utf8"));

// ───────────────────────── 시작 ─────────────────────────

export const handler = async (event) => {
  // 1. 할 일 목록: 출시 전 채우기는 칸마다 하나, 그 밖에는 같은 칸에 count 개
  const startedAt = Date.now();
  const count = Math.max(1, Math.min(Number(event.count) || 1, 5));
  const tasks = event.fill
    ? event.fill.map((c) => ({ concept: c.concept, level: c.level, trigger: "launch_fill", reason: `출시 전 채우기: 공개 문제 ${c.stock}개` }))
    : Array.from({ length: count }, (_, i) => ({
        ...event,
        reason: count > 1 ? String(event.reason ?? "").replace("관리자 수동 생성", `관리자 수동 생성 ${i + 1}/${count}`) : event.reason,
      }));

  // 2. 차례로 만든다 (관리자가 '전부 중지'를 누르면 남은 것은 만들지 않음)
  const results = [];
  for (const task of tasks) {
    if (await stopRequestedSince(startedAt)) break;
    results.push(await generateCodeSet(task, startedAt));
  }
  return { results };
};

// ───────────────────────── 코드 세트 하나 만들기 ─────────────────────────

async function generateCodeSet(opts, startedAt) {
  const curriculum = await loadCurriculum();
  const concept = curriculum.concepts.find((c) => c.id === opts.concept);
  const conceptIds = curriculum.concepts.map((c) => c.id);
  const level = Number(opts.level);

  // 1. 만들어도 되는지 확인하고 작업 기록(JOB) 만들기
  const skip = await checkCanGenerate(opts, concept, level);
  if (skip) return { jobId: 0, status: "skipped", error: skip };
  const jobId = await createJob(opts, level);
  const cancelled = async () => (await getItem("JOB", pad(jobId)))?.status === "cancelled" || (await stopRequestedSince(startedAt));
  const stopped = async () => {
    await finishJob(jobId, "cancelled", null, "관리자가 중지했어요");
    return { jobId, status: "cancelled", error: "관리자가 중지했어요" };
  };

  const info = curriculum.levels[level - 1];
  const mockPool = () => {
    const pool = MOCK[opts.concept];
    if (!pool) throw new Error(`목업 예시가 없는 개념입니다 (목업 지원: ${Object.keys(MOCK).join(", ")})`);
    return pool;
  };
  const adminRequest = opts.instructions
    ? `관리자가 원하는 내용입니다. 위의 개념·난이도·규칙을 지키는 범위에서 최대한 반영하세요 (규칙과 부딪히면 규칙이 우선):\n<admin_request>\n${opts.instructions}\n</admin_request>`
    : "";
  const focus = opts.focus?.length ? `이 학습자에게서 발견된 혼동: ${opts.focus.join("; ")}. 이 혼동을 바로잡을 수 있도록 설계하세요.` : "";
  const notes = []; // 관리자 화면의 '검증 결과'에 함께 보여 줄 진행 기록

  try {
    // 2. 코드 만들기 → 실제로 실행해 검사 (코드만 다시 만드는 건 싸므로 최대 3번)
    let picked = null;
    let codeFeedback = "";
    let lastReport = null;
    if (opts.repairFrom) {
      // 반려된 콘텐츠 고치기: 이전 코드가 검사를 통과하면 코드는 그대로 두고 문제만 다시 만든다
      const prev = { title: opts.repairFrom.title, code: opts.repairFrom.code, concepts: [opts.concept] };
      const report = await validateCode(prev.code, prev.concepts, level, conceptIds);
      if (report.ok) picked = { code: prev, report };
      else codeFeedback = `이전 코드가 다음 검사에 실패했습니다. 주제와 흐름은 살리되 고친 코드를 만드세요:\n<previous_code>\n${prev.code}\n</previous_code>\n${failed(report)}`;
    }
    for (let attempt = 0; !picked && attempt < 3; attempt++) {
      if (await cancelled()) return stopped();
      const code = await askAi({
        task: "content_generation",
        system: CODE_SYSTEM,
        schema: codeSchema(conceptIds),
        maxTokens: 3000,
        mock: () => {
          const set = mockPool()[Math.min(attempt, mockPool().length - 1)];
          return { title: set.title, code: set.code, concepts: set.concepts };
        },
        prompt: [
          `중심 개념: ${concept.name} — ${concept.keyIdea}`,
          `난이도: Level ${level} ${info.name} (${info.description}). 이 난이도의 주된 사고: ${info.skillLabel}.`,
          "코드는 5~15줄. 출력 예측·빈칸·핵심 줄 문제를 만들 수 있게, 변수 의존 관계가 분명하고 console.log 출력이 1~3줄인 코드가 좋습니다.",
          focus,
          adminRequest,
          codeFeedback,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      const report = await validateCode(code.code, code.concepts, level, conceptIds);
      lastReport = report;
      if (report.ok) {
        picked = { code, report };
        if (attempt > 0) notes.push({ name: `코드를 ${attempt + 1}번째 시도에서 통과시킴`, pass: true });
        break;
      }
      codeFeedback = `방금 만든 코드가 서버 검사에 실패했습니다. 다음을 고친 새 코드를 만드세요:\n<previous_code>\n${code.code}\n</previous_code>\n${failed(report)}`;
    }
    if (!picked) {
      const reason = `코드가 검사를 3번 모두 통과하지 못했어요:\n${lastReport ? failed(lastReport) : ""}`;
      await finishJob(jobId, "failed", null, reason);
      return { jobId, status: "failed", error: reason };
    }
    const base = picked.code;
    const actualOutput = picked.report.actualOutput ?? "";

    // 3. 코드 + 실제 실행 결과로 문제 만들기 → 자동 수정 → 흐름 따라가기 → 실행 검증 → AI 검수 (최대 2번)
    let feedback = "";
    for (let round = 0; round < 2; round++) {
      if (await cancelled()) return stopped();
      let generated;
      try {
        generated = await askAi({
          task: "content_generation",
          system: GENERATOR_SYSTEM,
          schema: QUESTIONS_SCHEMA,
          maxTokens: 16000,
          salvage: salvageQuestions,
          mock: () => ({ questions: (mockPool().find((p) => p.code === base.code) ?? mockPool()[0]).questions }),
          prompt: [
            `중심 개념: ${concept.name} — ${concept.keyIdea}`,
            `난이도: Level ${level} ${info.name} (${info.description}). 이 난이도의 주된 사고: ${info.skillLabel}.`,
            `코드 (줄 번호는 참고용이며 코드의 일부가 아닙니다):\n\`\`\`js\n${base.code
              .split("\n")
              .map((l, i) => `${String(i + 1).padStart(2)}| ${l}`)
              .join("\n")}\n\`\`\``,
            `서버에서 실제로 실행한 결과 (정확함):\n<actual_output>\n${actualOutput}\n</actual_output>`,
            `문제마다 skill 은 ${SKILL_FOR_LEVEL[level].join(", ")} 중에서 고르세요.`,
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
        if (round === 0 && /could not parse response|response was truncated/.test(err.message)) {
          notes.push({ name: "1차 문제 응답이 형식에 맞지 않아 다시 만듦", pass: true, detail: err.message });
          feedback = `이전 응답이 형식에 맞지 않았습니다 (${err.message}). 모든 문제에 stage·prompt·hints·explanation·keyPoint 를 빠짐없이 채우고, 4문제로 간결하게 만드세요.`;
          continue;
        }
        throw err;
      }

      const itemId = `ai-${opts.concept}-${crypto.randomUUID().slice(0, 8)}`;
      const converted = toQuestions(generated.questions, itemId);
      const fixed = autoFixQuestions(base.code, actualOutput, converted.questions);
      // 흐름 따라가기는 AI 가 아니라 실제 실행 기록으로 만든다 (만들 수 없는 코드면 그 단계 없이)
      const trace = await autoTraceQuestion("javascript", base.code, itemId);
      const questions = trace ? [...fixed.questions, trace] : fixed.questions;
      const report = await validateItem({ code: base.code, concepts: base.concepts, output: actualOutput, runnable: true, targetLevel: level, questions }, conceptIds);
      if (converted.problems.length) report.checks.push(...converted.problems.map((p) => ({ name: p, pass: false })));
      report.ok = report.ok && converted.problems.length === 0;
      if (fixed.fixes.length) report.checks.unshift({ name: `AI 가 틀린 정답 ${fixed.fixes.length}곳을 실행 결과로 자동 수정`, pass: true, detail: fixed.fixes.join(" / ") });

      let issues = [];
      if (report.ok) {
        if (await cancelled()) return stopped();
        const review = await reviewContent(base.code, questions, actualOutput, info);
        issues = review.issues;
        report.checks.push({ name: "AI 검수 (해설 일치·정답 유일성·난이도·불필요한 개념)", pass: review.approve, ...(issues.length ? { detail: issues.join(" / ") } : {}) });
        report.ok = review.approve;
      }
      report.checks.unshift(...notes);

      // 4. 통과했거나 마지막 시도면 저장 (통과: 공개, 실패: 반려)
      if (await cancelled()) return stopped();
      if (report.ok || round === 1) {
        const status = report.ok ? "published" : "rejected";
        const now = Date.now();
        await putItem({
          pk: "CONTENT",
          sk: itemId,
          source: "ai",
          status,
          validation: report,
          jobId,
          createdAt: now,
          questions,
          item: {
            id: itemId,
            track: "code",
            language: "javascript",
            title: base.title,
            code: base.code,
            concepts: base.concepts.includes(opts.concept) ? base.concepts : [opts.concept, ...base.concepts],
            level,
            factors: computeFactors(base.code, base.concepts.length),
            output: report.actualOutput ?? actualOutput,
            runnable: true,
            status,
            source: "ai",
            createdAt: now,
          },
        });
        await putItem({ pk: "META", sk: "content_version", value: `${now}-${crypto.randomUUID().slice(0, 6)}` });
        await finishJob(jobId, status, itemId, report.ok ? null : failed(report));
        return { jobId, status, itemId, issues };
      }
      // 실패한 검증 항목을 알려 주고 문제만 한 번 더 (코드는 그대로)
      notes.push({ name: "1차 문제가 검증에 실패해 문제만 다시 만듦", pass: true, detail: failed(report) });
      feedback = `이전에 만든 문제들이 자동 검증에서 실패했습니다. 같은 코드로, 다음 문제를 고쳐서 문제 전체를 다시 만드세요:\n${failed(report)}`;
    }
    throw new Error("unreachable");
  } catch (err) {
    if (await cancelled()) return stopped();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-code]", message);
    await finishJob(jobId, "failed", null, message);
    return { jobId, status: "failed", error: message };
  }
}

// ───────────────────────── AI 에게 주는 지시 ─────────────────────────

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

const SKILL_FOR_LEVEL = {
  1: ["recall", "predict"],
  2: ["recall", "predict", "analyze"],
  3: ["predict", "analyze", "infer"],
  4: ["analyze", "infer", "synthesize"],
  5: ["infer", "synthesize"],
};

// ───────────────────────── AI 응답 형식 (JSON Schema) ─────────────────────────

const str = (description) => ({ type: "string", ...(description ? { description } : {}) });
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });

const codeSchema = (conceptIds) => ({
  type: "object",
  properties: {
    title: str("코드의 짧은 제목. 예: '성인 사용자 골라내기'"),
    code: str("학습용 JavaScript 코드 (5~15줄, console.log 로 결과 출력)"),
    concepts: { type: "array", items: { type: "string", enum: conceptIds }, description: "코드에 쓰인 개념" },
  },
  required: ["title", "code", "concepts"],
});

const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["multiple_choice", "short_answer", "fill_blank", "predict_output"] },
    stage: { type: "string", enum: ["overview", "key", "wrapup"], description: "읽기 단계: overview 훑어보기, key 핵심 줄, wrapup 정리" },
    skill: { type: "string", enum: ["recall", "predict", "analyze", "infer", "synthesize"] },
    prompt: str(),
    choices: nullable({ type: "array", items: { type: "object", properties: { text: str(), misconception: nullable(str()) }, required: ["text", "misconception"] }, description: "multiple_choice, fill_blank 에서만. 4개" }),
    answerIndex: nullable({ type: "integer", description: "multiple_choice, fill_blank 정답 인덱스 (0부터)" }),
    blankedCode: nullable(str("fill_blank: 원본 코드의 한 줄(또는 몇 줄)에서 핵심 부분을 ____ 로 바꾼 것")),
    output: nullable(str("predict_output: 정답 출력")),
    rubric: nullable({
      type: "array",
      items: { type: "object", properties: { label: str(), keywords: { type: "array", items: str() } }, required: ["label", "keywords"] },
      description: "short_answer: 설명에 담겨야 할 요소 2~4개와, 그 요소를 언급했다고 볼 짧은 표현들(한국어 동의어 포함 4개 이상)",
    }),
    misconceptions: nullable({
      type: "array",
      items: { type: "object", properties: { label: str(), keywords: { type: "array", items: str() }, correction: str() }, required: ["label", "keywords", "correction"] },
      description: "short_answer: 흔한 오개념과, 함께 나타나면 오개념으로 볼 표현들, 바로잡는 설명",
    }),
    modelAnswer: nullable(str("short_answer: 모범 답안 (rubric 의 표현을 실제로 포함)")),
    focusLines: nullable({ type: "array", items: { type: "integer" }, description: "코드의 특정 부분 역할을 묻는 문제라면 그 줄 번호" }),
    hints: { type: "array", items: str(), description: "힌트 2~4개: 생각할 질문 → 핵심 부분 짚기 → 관련 문법 → 정답에 가까운 방향 (정답 자체는 말하지 않음)" },
    explanation: str("정답 해설. 실행 과정을 한 줄에 한 단계씩 (모든 문제에 반드시)"),
    keyPoint: str("핵심 개념 한 줄 (모든 문제에 반드시)"),
  },
  required: ["type", "stage", "skill", "prompt", "choices", "answerIndex", "blankedCode", "output", "rubric", "misconceptions", "modelAnswer", "focusLines", "hints", "explanation", "keyPoint"],
};
const QUESTIONS_SCHEMA = { type: "object", properties: { questions: { type: "array", items: QUESTION_SCHEMA } }, required: ["questions"] };
const REVIEW_SCHEMA = {
  type: "object",
  properties: { approve: { type: "boolean" }, issues: { type: "array", items: str(), description: "발견한 문제. 없으면 빈 배열" } },
  required: ["approve", "issues"],
};

/** 일부 문제에서 칸을 빠뜨렸으면 그 문제만 버리고 나머지로 계속 (3개 미만이면 그대로) */
function salvageQuestions(value) {
  if (!Array.isArray(value?.questions)) return value;
  const kept = value.questions.filter((q) => checkSchema(q, QUESTION_SCHEMA).length === 0);
  return kept.length >= 3 ? { ...value, questions: kept } : value;
}

/** AI 응답 → 저장할 문제 모양. 유형에 꼭 필요한 칸이 빠지면 problems 에 적는다 */
function toQuestions(raw, itemId) {
  const problems = [];
  const questions = [];
  raw.forEach((r, n) => {
    const id = `${itemId}-q${n + 1}`;
    const base = {
      id,
      codeItemId: itemId,
      stage: r.stage,
      prompt: r.prompt,
      skill: r.skill,
      hints: r.hints.filter((h) => h.trim()).slice(0, 4),
      explanation: r.explanation,
      keyPoint: r.keyPoint,
      ...(r.focusLines?.length ? { focusLines: r.focusLines } : {}),
    };
    const choices = r.choices?.map((c) => ({ text: c.text, ...(c.misconception ? { misconception: c.misconception } : {}) }));
    const missing = (f) => problems.push(`[${id}] ${r.type} 에 ${f} 가 없음`);
    if (r.type === "multiple_choice") {
      if (!choices || r.answerIndex === null) return missing("choices/answerIndex");
      questions.push({ ...base, type: r.type, choices, answerIndex: r.answerIndex });
    } else if (r.type === "fill_blank") {
      if (!choices || r.answerIndex === null || !r.blankedCode) return missing("choices/answerIndex/blankedCode");
      questions.push({ ...base, type: r.type, choices, answerIndex: r.answerIndex, blankedCode: r.blankedCode });
    } else if (r.type === "predict_output") {
      if (!r.output) return missing("output");
      questions.push({ ...base, type: r.type, output: r.output });
    } else if (r.type === "short_answer") {
      if (!r.rubric || !r.modelAnswer) return missing("rubric/modelAnswer");
      questions.push({ ...base, type: r.type, rubric: r.rubric, misconceptions: r.misconceptions ?? [], modelAnswer: r.modelAnswer });
    }
  });
  const stages = new Set(questions.map((q) => q.stage));
  for (const st of ["overview", "key", "wrapup"]) if (!stages.has(st)) problems.push(`읽기 단계 ${st} 문제가 없음`);
  const wrapTypes = new Set(questions.filter((q) => q.stage === "wrapup").map((q) => q.type));
  for (const t of ["predict_output", "short_answer"]) if (!wrapTypes.has(t)) problems.push(`정리 단계에 ${t} 문제가 없음`);
  return { questions, problems };
}

/** AI 검수 (해설-동작 일치, 정답 유일성). 사소한 표현은 문제 삼지 않는다 */
function reviewContent(code, questions, actualOutput, info) {
  return askAi({
    task: "content_review",
    system: "당신은 프로그래밍 입문자용 학습 콘텐츠를 검수하는 꼼꼼한 검토자입니다. 사소한 표현 차이는 문제 삼지 말고, 학습자에게 잘못된 지식을 주거나 정답이 모호한 경우만 지적하세요.",
    schema: REVIEW_SCHEMA,
    maxTokens: 4000,
    mock: () => ({ approve: true, issues: [] }),
    prompt: [
      `목표 난이도: ${info.level} (${info.name} — ${info.description})`,
      `코드:\n\`\`\`js\n${code}\n\`\`\``,
      `실제 실행 결과 (서버가 실행해서 확인함 — 정답·출력은 이미 이 값과 맞는지 자동으로 검사했습니다):\n${actualOutput ?? "(실행 불가)"}`,
      `문제들 (정답은 answerIndex·output 등에 있음):\n${JSON.stringify(questions.map(({ id: _id, codeItemId: _c, ...q }) => q), null, 1)}`,
      `다음을 확인하세요:
A. 해설(explanation)이 실제 코드 동작·실행 결과와 어긋나서 잘못된 지식을 주는가?
B. 객관식·빈칸에서 정답 말고 다른 보기도 정답으로 볼 수 있을 만큼 모호한가?
C. (참고) 난이도가 맞지 않거나, 불필요하게 어려운 개념이 있거나, 힌트가 정답을 그대로 말하는가?
A 또는 B 에 해당하는 문제가 있을 때만 approve=false. C 는 issues 에 적되 approve 는 true 로 두세요.
issues 는 어느 문제(prompt 앞부분)의 무엇이 문제인지 한 문장씩.`,
    ].join("\n\n"),
  });
}

function failed(report) {
  return report.checks
    .filter((c) => !c.pass)
    .map((c) => `- ${c.name}${c.detail ? ` (${c.detail})` : ""}`)
    .join("\n");
}

// ───────────────────────── AI 호출 (Bedrock Converse, 월 예산·사용량 기록·목업) ─────────────────────────

async function askAi({ task, system, prompt, schema, maxTokens, mock, salvage }) {
  if (AI_MODE === "mock") {
    await new Promise((r) => setTimeout(r, Number(process.env.MOCK_DELAY_SEC ?? 0.8) * 1000));
    const result = mock();
    await logUsage(task, `mock:${MODEL_ID}`, Math.round((system.length + prompt.length) / 2), Math.round(JSON.stringify(result).length / 2), 0, true);
    return result;
  }
  if (AI_MODE !== "live") throw new Error("AI 가 꺼져 있어요");
  // 이번 달 추정 비용 + 이번 호출의 최대 비용이 예산을 넘으면 부르지 않는다
  const p = PRICE[normalizeModel(MODEL_ID)] ?? { input: 5, output: 25 };
  const worst = ((system.length + prompt.length) * p.input + maxTokens * p.output) / 1e6;
  if ((await monthCostUsd()) + worst > MONTHLY_BUDGET_USD) throw new Error("monthly AI budget reached");

  let ok = false;
  let usage = {};
  try {
    const out = await bedrock.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens },
        toolConfig: {
          tools: [{ toolSpec: { name: "answer", description: "결과를 이 형식(JSON)으로 제출한다. 모든 칸을 빠짐없이 쓰고, 해당 없는 칸은 null 로 쓴다. 배열·객체를 문자열로 감싸지 않는다.", inputSchema: { json: schema } } }],
          toolChoice: { tool: { name: "answer" } },
        },
      }),
    );
    usage = out.usage ?? {};
    if (out.stopReason === "max_tokens") throw new Error("response was truncated");
    const input = out.output?.message?.content?.find((c) => c.toolUse)?.toolUse?.input;
    if (input == null) throw new Error("could not parse response: 응답에 결과(JSON)가 없음");
    let value = repairForSchema(input, schema);
    let issues = checkSchema(value, schema);
    if (issues.length && salvage) {
      const kept = salvage(value);
      if (!checkSchema(kept, schema).length) [value, issues] = [kept, []];
    }
    if (issues.length) throw new Error(`could not parse response: ${issues.slice(0, 3).join("; ")}`);
    ok = true;
    return value;
  } finally {
    await logUsage(task, MODEL_ID, usage.inputTokens ?? 0, usage.outputTokens ?? 0, usage.cacheReadInputTokens ?? 0, ok);
  }
}

const allows = (schema, kind) =>
  schema.anyOf ? schema.anyOf.some((s) => allows(s, kind)) : [schema.type].flat().includes(kind) || (kind === "number" && [schema.type].flat().includes("integer"));

/** 도구 입력에서 자주 어긋나는 것만 고친다: 빠진 칸 → null, 문자열로 감싼 배열·객체 → 풀기, "3" → 3 */
function repairForSchema(value, schema) {
  if (typeof value === "string" && (allows(schema, "array") || allows(schema, "object")) && !allows(schema, "string") && /^\s*[[{]/.test(value)) {
    try {
      value = JSON.parse(value);
    } catch {
      /* 그대로 */
    }
  }
  if (typeof value === "string" && allows(schema, "number") && !allows(schema, "string") && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  const branch = schema.anyOf?.find((s) => (Array.isArray(value) ? allows(s, "array") : value && typeof value === "object" ? allows(s, "object") : false)) ?? schema;
  if (Array.isArray(value) && branch.items) return value.map((v) => repairForSchema(v, branch.items));
  if (value && typeof value === "object" && !Array.isArray(value) && branch.properties) {
    const obj = { ...value };
    for (const [key, sub] of Object.entries(branch.properties)) {
      if (obj[key] === undefined) {
        if (allows(sub, "null")) obj[key] = null;
      } else obj[key] = repairForSchema(obj[key], sub);
    }
    return obj;
  }
  return value;
}

/** 간단한 JSON Schema 검사 → 문제 목록 */
function checkSchema(value, schema, path = "(전체)") {
  if (schema.anyOf) return schema.anyOf.some((s) => checkSchema(value, s, path).length === 0) ? [] : [`${path}: 형식이 맞지 않음`];
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
  const types = schema.type ? [schema.type].flat() : [];
  if (types.length && !(types.includes(kind) || (kind === "integer" && types.includes("number")))) return [`${path}: ${types.join("/")} 이어야 함`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: 허용되지 않은 값`];
  const issues = [];
  if (kind === "object") {
    for (const key of schema.required ?? []) if (!(key in value)) issues.push(`${path}.${key}: 없음`);
    for (const [key, sub] of Object.entries(schema.properties ?? {})) if (key in value) issues.push(...checkSchema(value[key], sub, `${path}.${key}`));
  }
  if (kind === "array" && schema.items) value.forEach((v, i) => issues.push(...checkSchema(v, schema.items, `${path}.${i}`)));
  return issues;
}

const normalizeModel = (m) => m.replace(/^mock:/, "").replace(/^(?:[a-z]{2,6}\.)?anthropic\./, "").replace(/-\d{8}(?:-v\d+(?::\d+)?)?$/, "");
const monthKey = () => new Date().toISOString().slice(0, 7);

async function monthCostUsd() {
  const rows = await queryAll("USAGE", { start: monthKey() });
  return rows.reduce((s, u) => {
    const p = PRICE[normalizeModel(u.model ?? "")];
    return p && !String(u.model).startsWith("mock:") ? s + ((u.input ?? 0) * p.input + (u.output ?? 0) * p.output + (u.cacheRead ?? 0) * p.cacheRead) / 1e6 : s;
  }, 0);
}

async function logUsage(task, model, input, output, cacheRead, ok) {
  const month = monthKey();
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: "USAGE", sk: `${month}#${task}#${model}` },
        UpdateExpression: "SET #t = :t, #m = :m, #mo = :mo ADD calls :one, #i :i, #o :o, cacheRead :c, failures :f",
        ExpressionAttributeNames: { "#t": "task", "#m": "model", "#mo": "month", "#i": "input", "#o": "output" },
        ExpressionAttributeValues: { ":t": task, ":m": model, ":mo": month, ":one": 1, ":i": input, ":o": output, ":c": cacheRead, ":f": ok ? 0 : 1 },
      }),
    );
  } catch (e) {
    console.error("[usage]", e.message);
  }
}

// ───────────────────────── 작업 기록·확인 (DynamoDB) ─────────────────────────

async function loadCurriculum() {
  const item = await getItem("META", "curriculum");
  if (!item) throw new Error("META / curriculum 이 없어요. jojo_api 에서 {\"task\": \"load-content\"} 를 먼저 실행해 주세요.");
  return item.data;
}

/** 만들면 안 되는 이유 (없으면 null) */
async function checkCanGenerate(opts, concept, level) {
  if (AI_MODE !== "live" && AI_MODE !== "mock") return "AI 가 설정되어 있지 않습니다.";
  if (!concept) return "알 수 없는 개념";
  const levels = LEVELS_BY_UNIT[concept.unitId] ?? [];
  if (!levels.length) return "코드 주제가 아니거나 AI 생성 대상이 아닌 주제입니다.";
  if (opts.trigger !== "manual" && !levels.includes(level)) return "AI 생성 대상이 아닌 칸입니다.";
  if (AUTO_TRIGGERS.includes(opts.trigger) && (await getItem("META", "auto_generation"))?.value === "off") return "자동 생성이 꺼져 있습니다.";
  const recent = await queryAll("JOB", { start: pad((Date.now() - 86400_000) * 1000) });
  if (recent.some((j) => j.concept === opts.concept && j.level === level && j.status === "running" && j.createdAt > Date.now() - 600_000)) return "같은 개념·난이도로 생성 중입니다.";
  if (recent.length >= DAILY_LIMIT) return "오늘의 생성 한도에 도달했습니다.";
  if (AI_MODE === "live" && (await monthCostUsd()) >= MONTHLY_BUDGET_USD) return "이번 달 AI 예산에 도달했습니다.";
  return null;
}

async function createJob(opts, level) {
  const now = Date.now();
  const id = now * 1000 + Math.floor(Math.random() * 1000);
  await putItem({
    pk: "JOB",
    sk: pad(id),
    id,
    concept: opts.concept,
    level,
    trigger: opts.trigger,
    sessionId: opts.sessionId ?? null,
    mock: AI_MODE === "mock",
    status: "running",
    reason: opts.reason ?? "",
    itemId: null,
    error: null,
    createdAt: now,
    finishedAt: null,
    [TTL_ATTR]: Math.floor(now / 1000) + 90 * 86400,
  });
  return id;
}

/** 진행 중인 작업만 끝낸다 (관리자가 이미 중지한 작업은 그대로) */
async function finishJob(id, status, itemId, error) {
  try {
    await db.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: "JOB", sk: pad(id) },
        UpdateExpression: "SET #st = :st, itemId = :item, #err = :err, finishedAt = :at",
        ConditionExpression: "#st = :running",
        ExpressionAttributeNames: { "#st": "status", "#err": "error" },
        ExpressionAttributeValues: { ":st": status, ":item": itemId, ":err": error, ":at": Date.now(), ":running": "running" },
      }),
    );
  } catch (e) {
    if (e.name !== "ConditionalCheckFailedException") throw e;
  }
}

async function stopRequestedSince(since) {
  return Number((await getItem("META", "generation_stop_at"))?.value ?? 0) >= since;
}

const pad = (n) => String(Math.max(0, Math.floor(n))).padStart(16, "0");

async function getItem(pk, sk) {
  return (await db.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk, sk }, ConsistentRead: true }))).Item ?? null;
}

async function putItem(item) {
  await db.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

async function queryAll(pk, { start } = {}) {
  const out = [];
  let ExclusiveStartKey;
  do {
    const r = await db.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: start ? "pk = :pk AND sk >= :s" : "pk = :pk",
        ExpressionAttributeValues: start ? { ":pk": pk, ":s": start } : { ":pk": pk },
        ExclusiveStartKey,
      }),
    );
    out.push(...(r.Items ?? []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

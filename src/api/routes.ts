import * as z from "zod/v4";
import { analysisDue } from "../lib/ai/analysis";
import { aiEnabled, aiMode, MODELS } from "../lib/ai/client";
import { NOT_VERIFIABLE, abortJobs, generateCodeSet } from "../lib/ai/generate";
import { manualReason } from "./background";
import { ADMIN_CODE_MAX, ADMIN_CODE_MIN, adminCodeIsSet, setAdminCode } from "../lib/server/admin-auth";
import { askAboutQuestion, evaluateShortAnswer as aiEvaluate } from "../lib/ai/tutor";
import { decideOnSession, generatableLevels, launchFillPlan, POLICY, TRIGGER_LABEL } from "../lib/content/policy";
import { CONCEPTS, getConcept } from "../lib/curriculum";
import { evaluateShortAnswer } from "../lib/grading";
import { misconceptionCounts } from "../lib/learner/stats";
import { AnswerSchema, LevelSchema, QuestionTypeSchema } from "../lib/schemas";
import { coverage, getGeneratedItem, getQuestion, listGeneratedItems, loadContent } from "../lib/server/content-repo";
import type { Level } from "../lib/types";
import { dbDriver } from "../lib/server/db";
import { loadPersona, PERSONAS } from "../lib/server/demo";
import { gradeAttempt } from "../lib/server/grade";
import {
  autoGenerationEnabled,
  cancelJobs,
  demandByCell,
  demandCount,
  estimateCost,
  gradingSplit,
  listJobs,
  monthToDateCostUsd,
  recordDemand,
  runningJob,
  setAutoGeneration,
  usageSummary,
} from "../lib/server/ops-repo";
import { ALL_CONCEPTS, planSession } from "../lib/server/planner";
import { attemptCount, listAttempts, removeDemoPeers, resetSession, seedDemoPeers, setNickname, setPreferredLevel } from "../lib/server/session-repo";
import { HttpError, isProduction, notFound, parse, requireAdmin, type Ctx } from "./core";
import { conceptsView, dashboardView, demoView, learnView, meView, rankingView, reviewView } from "./views";

type Handler = (ctx: Ctx) => Promise<unknown>;

// ───────────────────────── 학습 ─────────────────────────

const SessionBody = z.object({
  level: LevelSchema,
  /** 개념 id 또는 "all"(전체 개념 섞기) */
  concept: z.string().max(50).refine((c) => c === ALL_CONCEPTS || !!getConcept(c)).optional(),
  types: z.array(QuestionTypeSchema).max(6).optional(),
  size: z.number().int().min(1).max(10).optional(),
  /** 이미 이번 세션에 나온 문제 ("비슷한 문제 풀어보기") */
  exclude: z.array(z.string().max(120)).max(50).optional(),
  /** learn: 새로운 문제, review: 틀린 문제·취약 개념 */
  mode: z.enum(["learn", "review"]).default("learn"),
  /** 특정 문제 다시 풀기 (오답 노트) */
  ids: z.array(z.string().max(120)).max(20).optional(),
});

/**
 * 학습 세션 시작: 일반 추천 알고리즘으로 저장된 문제를 고른다 (AI 호출 없음).
 * 생성 기준(policy.ts)에 해당하면 응답을 기다리게 하지 않고 백그라운드로 새 콘텐츠를 만든다.
 */
const startSession: Handler = async (ctx) => {
  const body = parse(SessionBody, ctx.req.body);
  const me = await ctx.session();
  if (!body.exclude && body.mode === "learn") await setPreferredLevel(me.id, body.level);
  const [attempts, content] = await Promise.all([listAttempts(me.id), loadContent()]);
  const plan = planSession({ ...body, content, attempts });

  // 복습·다시 풀기·전체 개념 섞기는 특정 칸(개념 × 난이도)을 고른 게 아니므로 생성 판단을 하지 않는다
  if (body.mode !== "learn" || body.ids?.length || body.concept === ALL_CONCEPTS) return { ...plan, generating: false };

  const concept = plan.focusConcept;
  const stock = (await coverage()).get(`${concept}:${body.level}`) ?? 0;
  const demand = await demandCount(concept, body.level, Date.now() - POLICY.demandWindowDays * 86400_000);
  // 이번 학습자가 소진한 상태라면 수요에 포함해서 판단
  const exhausted = plan.unsolvedAtLevel < POLICY.learnerLow;
  const decision = decideOnSession({ concept, level: body.level, stock, unsolved: plan.unsolvedAtLevel, demand: demand + (exhausted ? 1 : 0) });
  if (!decision.generate && decision.recordDemand) await recordDemand(concept, body.level, me.id);

  let generating = !!(await runningJob(concept, body.level));
  if (decision.generate && aiEnabled() && !generating && (await autoGenerationEnabled())) {
    generating = true;
    const focus = misconceptionCounts(attempts.filter((a) => a.concepts.includes(concept)))
      .slice(0, 3)
      .map((m) => m.text);
    await ctx.background({ kind: "generate", concept, level: body.level, trigger: decision.trigger, reason: decision.reason, sessionId: me.id, focus });
  }
  return { ...plan, generating, generation: { stock, demand, decision } };
};

const AttemptBody = z.object({
  questionId: z.string().max(120),
  /** giveUp = "정답과 해설 보기" (5단계 힌트): 오답으로 기록하고 해설을 돌려준다 */
  answer: AnswerSchema.optional(),
  giveUp: z.boolean().default(false),
  hintsUsed: z.number().int().min(0).max(5).default(0),
  timeMs: z.number().int().min(0).max(60 * 60_000).default(0),
});

/** 답안 제출: 서버에서 채점하고 기록한다. 일정 문제 수마다 학습자 분석을 백그라운드로 실행 */
const submitAttempt: Handler = async (ctx) => {
  const body = parse(AttemptBody, ctx.req.body);
  if (!body.answer && !body.giveUp) throw new HttpError(400, "답을 입력해 주세요.");
  const me = await ctx.session();
  const result = await gradeAttempt(me, body.questionId, body.giveUp ? null : body.answer!, body.hintsUsed, body.timeMs, !ctx.aiLimited);
  if (!result) throw notFound("문제");
  const analyzing = await analysisDue(me.id, await attemptCount(me.id));
  if (analyzing) await ctx.background({ kind: "analysis", sessionId: me.id, level: me.preferredLevel });
  return { ...result, analyzing };
};

/** 미리 저장된 단계별 힌트 (AI 호출 없음). 한 번에 한 단계씩만 보낸다 */
const hint: Handler = async (ctx) => {
  const body = parse(z.object({ questionId: z.string().max(120), level: z.number().int().min(1).max(4) }), ctx.req.body);
  const found = await getQuestion(body.questionId);
  if (!found) throw notFound("문제");
  return { hint: found.question.hints[body.level - 1] };
};

const AskBody = z.object({
  questionId: z.string().max(120),
  question: z.string().min(1).max(500),
  solved: z.boolean().default(false),
  history: z
    .array(z.object({ role: z.enum(["user", "tutor"]), text: z.string().max(4000) }))
    .max(12)
    .default([]),
});

/** 학습자가 직접 요청한 경우에만 AI 튜터가 답한다 (저비용 모델) */
const ask: Handler = async (ctx) => {
  const body = parse(AskBody, ctx.req.body);
  const found = await getQuestion(body.questionId);
  if (!found) throw notFound("문제");
  return askAboutQuestion(found.question, found.item, body.question, body.history, body.solved);
};

/**
 * 학습자가 "AI 에게 자세히 분석 받기" 를 요청한 경우: 규칙으로 정답 처리된 주관식도 AI 가 다시 본다.
 * (채점 기록은 바꾸지 않고 분석만 보여준다)
 */
const explain: Handler = async (ctx) => {
  const body = parse(z.object({ questionId: z.string().max(120), text: z.string().min(1).max(2000) }), ctx.req.body);
  const found = await getQuestion(body.questionId);
  if (!found || found.question.type !== "short_answer") throw notFound("주관식 문제");
  const rule = evaluateShortAnswer(found.question, body.text);
  return aiEvaluate(found.question, found.item, body.text, rule, true);
};

// ───────────────────────── 내 정보 ─────────────────────────

const MeBody = z.object({
  preferredLevel: LevelSchema.optional(),
  reset: z.boolean().optional(),
  /** 랭킹에 보이는 이름 */
  nickname: z.string().trim().min(1).max(12).optional(),
});

const updateMe: Handler = async (ctx) => {
  const body = parse(MeBody, ctx.req.body);
  const me = await ctx.session();
  if (body.reset) await resetSession(me.id);
  if (body.preferredLevel) await setPreferredLevel(me.id, body.preferredLevel);
  if (body.nickname) await setNickname(me.id, body.nickname);
  return { ok: true };
};

// ───────────────────────── 데모 (목업 모드·로컬 개발) ─────────────────────────

const DemoBody = z.union([
  z.object({ persona: z.enum(Object.keys(PERSONAS) as [keyof typeof PERSONAS, ...(keyof typeof PERSONAS)[]]) }),
  /** 랭킹 화면 확인용 가상 참가자 추가/삭제 */
  z.object({ peers: z.enum(["add", "remove"]) }),
]);

const demo: Handler = async (ctx) => {
  if (aiMode() !== "mock" && isProduction()) throw new HttpError(403, "데모 데이터는 목업 모드에서만 쓸 수 있어요.");
  const body = parse(DemoBody, ctx.req.body);
  const me = await ctx.session();
  if ("peers" in body) {
    if (body.peers === "add") await seedDemoPeers(30);
    else await removeDemoPeers();
  } else {
    await loadPersona(me.id, body.persona);
  }
  return { ok: true };
};

// ───────────────────────── 관리자 ─────────────────────────

async function fillPlan() {
  const stock = await coverage();
  return launchFillPlan((c, l) => stock.get(`${c}:${l}`) ?? 0, CONCEPTS.map((c) => c.id));
}

const adminOverview: Handler = async (ctx) => {
  await requireAdmin(ctx.req);
  const [stock, usage] = await Promise.all([coverage(), usageSummary()]);
  return {
    mode: aiMode(),
    autoGeneration: await autoGenerationEnabled(),
    adminCode: { custom: await adminCodeIsSet(), recovery: !!process.env.ADMIN_TOKEN },
    models: MODELS,
    db: dbDriver(),
    policy: POLICY,
    triggerLabels: TRIGGER_LABEL,
    generatable: Object.fromEntries(CONCEPTS.map((c) => [c.id, generatableLevels(c.id)])),
    coverage: Object.fromEntries(stock),
    demand: await demandByCell(Date.now() - POLICY.demandWindowDays * 86400_000),
    fillPlan: launchFillPlan((c, l) => stock.get(`${c}:${l}`) ?? 0, CONCEPTS.map((c) => c.id)),
    usage,
    cost: { total: estimateCost(usage), monthToDate: await monthToDateCostUsd(aiMode() === "mock") },
    grading: await gradingSplit(),
    jobs: await listJobs(30),
    generated: await listGeneratedItems(20),
  };
};

const AdminGenerateBody = z.object({
  concept: z.string().refine((c) => !!getConcept(c)),
  level: LevelSchema,
  focus: z.array(z.string().max(200)).max(5).optional(),
  /** 만들 코드 세트 수 (세트마다 문제 6~8개) */
  count: z.number().int().min(1).max(5).default(1),
  /** "어떤 내용으로 문제를 만들까요?" — 비워 두면 기본 기준대로 */
  instructions: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || undefined),
});

/**
 * 관리자가 콘텐츠를 만든다: AI 생성 → 실행 검증 → AI 검수 → 문제 DB 저장.
 * 1개는 끝날 때까지 기다려 결과를 돌려주고, 여러 개는 뒤에서 차례로 만든다 (생성 작업 기록에서 진행 상황 확인)
 */
const adminGenerate: Handler = async (ctx) => {
  await requireAdmin(ctx.req);
  const { count, ...body } = parse(AdminGenerateBody, ctx.req.body);
  if (generatableLevels(body.concept).length === 0) throw new HttpError(400, NOT_VERIFIABLE);
  if (count === 1) return generateCodeSet({ ...body, trigger: "manual", reason: manualReason(body.instructions) });
  if (!aiEnabled()) throw new HttpError(400, "AI 가 꺼져 있어요 (AI_MODE=mock 또는 API 키 필요).");
  await ctx.background({ kind: "batch", concept: body.concept, level: body.level, count, instructions: body.instructions });
  return { jobId: 0, status: "started", started: count };
};

/** 출시 전 채우기 계획 (생성하지 않고 계획만) */
const adminFillPlan: Handler = async (ctx) => {
  await requireAdmin(ctx.req);
  return { plan: await fillPlan() };
};

/** 출시 전 채우기 실행: 최소 재고에 못 미치는 칸마다 코드 세트를 하나씩 백그라운드로 생성 (limit 칸까지) */
const adminFill: Handler = async (ctx) => {
  await requireAdmin(ctx.req);
  if (!aiEnabled()) throw new HttpError(400, "AI 가 꺼져 있어요 (AI_MODE=mock 또는 API 키 필요).");
  const limit = Math.min(Number(ctx.req.query.get("limit") ?? 5), 30);
  const cells = (await fillPlan()).slice(0, limit);
  await ctx.background({ kind: "fill", cells });
  return { started: cells.length, cells };
};

/** 반려된 AI 콘텐츠를 실패 이유와 실제 실행 결과를 알려 주고 고쳐서 다시 만든다 (새 항목으로 저장, 검증·검수를 다시 거침) */
const adminRepair: Handler = async (ctx) => {
  await requireAdmin(ctx.req);
  const body = parse(z.object({ itemId: z.string().max(120), instructions: z.string().trim().max(1000).optional() }), ctx.req.body);
  const found = await getGeneratedItem(body.itemId);
  if (!found) throw notFound("AI 생성 콘텐츠");
  if (found.row.status !== "rejected") throw new HttpError(400, "반려된 콘텐츠만 고쳐서 다시 만들 수 있어요.");
  // DOM 처럼 실행 검증을 못 하는 개념은 빼고, 남은 개념 중 첫 번째로 만든다
  const concept = found.row.concepts.find((c) => generatableLevels(c).length > 0);
  if (!concept) throw new HttpError(400, NOT_VERIFIABLE);
  const checks = found.row.validation?.checks ?? [];
  const failures = checks
    .filter((c) => !c.pass)
    .map((c) => `- ${c.name}${c.detail ? ` (${c.detail})` : ""}`)
    .join("\n");
  return generateCodeSet({
    concept,
    level: found.row.level as Level,
    trigger: "manual",
    reason: manualReason(body.instructions, `(반려된 '${found.row.title}' 고치기)`),
    instructions: body.instructions || undefined,
    repairFrom: {
      title: found.row.title,
      code: found.row.code,
      actualOutput: found.row.validation?.actualOutput ?? found.output,
      questions: found.questions,
      failures: failures || "- (실패 항목 기록 없음)",
    },
  });
};

/** 자동 생성 켜기/끄기 (문제가 부족할 때 AI 가 알아서 만드는 것). 관리자 수동 생성·출시 전 채우기는 그대로 쓸 수 있다 */
const adminAuto: Handler = async (ctx) => {
  await requireAdmin(ctx.req);
  const body = parse(z.object({ enabled: z.boolean() }), ctx.req.body);
  await setAutoGeneration(body.enabled);
  return { autoGeneration: body.enabled };
};

/** 생성 중지: jobId 가 있으면 그 작업만, 없으면 진행 중인 생성을 모두 멈춘다 (이미 보낸 AI 요청 비용은 나갈 수 있음) */
const adminStop: Handler = async (ctx) => {
  await requireAdmin(ctx.req);
  const body = parse(z.object({ jobId: z.number().int().positive().optional() }), ctx.req.body ?? {});
  const ids = await cancelJobs(body.jobId);
  abortJobs(ids);
  return { stopped: ids.length };
};

/** 관리자 코드 바꾸기 (지금 코드로 들어온 관리자만). 복구 코드(.env 의 ADMIN_TOKEN)는 바뀌지 않는다 */
const adminCode: Handler = async (ctx) => {
  await requireAdmin(ctx.req);
  const body = parse(
    z.object({
      code: z
        .string()
        .min(ADMIN_CODE_MIN, `관리자 코드는 ${ADMIN_CODE_MIN}자 이상이어야 해요.`)
        .max(ADMIN_CODE_MAX, `관리자 코드는 ${ADMIN_CODE_MAX}자 이하여야 해요.`)
        .refine((c) => c.trim() === c, "앞뒤에 공백을 넣을 수 없어요."),
    }),
    ctx.req.body,
  );
  await setAdminCode(body.code);
  return { ok: true };
};

// ───────────────────────── 경로 표 ─────────────────────────

export const ROUTES: Record<string, Handler> = {
  "GET /health": async () => ({ ok: true, db: dbDriver(), ai: aiMode() }),
  "GET /me": async (ctx) => meView(await ctx.session()),
  "POST /me": updateMe,
  "GET /learn": async (ctx) => learnView(await ctx.session()),
  "GET /review": async (ctx) => reviewView(await ctx.session()),
  "GET /ranking": async (ctx) => rankingView(await ctx.session()),
  "GET /dashboard": async (ctx) => dashboardView(await ctx.session()),
  "GET /concepts": async (ctx) => conceptsView(await ctx.session()),
  "GET /demo": async () => demoView(),
  "POST /demo": demo,
  "POST /session": startSession,
  "POST /attempts": submitAttempt,
  "POST /hint": hint,
  "POST /ask": ask,
  "POST /explain": explain,
  "GET /admin/overview": adminOverview,
  "POST /admin/generate": adminGenerate,
  "GET /admin/fill": adminFillPlan,
  "POST /admin/fill": adminFill,
  "POST /admin/auto": adminAuto,
  "POST /admin/stop": adminStop,
  "POST /admin/code": adminCode,
  "POST /admin/repair": adminRepair,
};

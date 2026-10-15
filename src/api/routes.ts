import * as z from "zod/v4";
import { analysisDue } from "../lib/ai/analysis";
import { aiEnabled, aiMode, MODELS } from "../lib/ai/client";
import { NOT_VERIFIABLE, abortJobs, generateCodeSet } from "../lib/ai/generate";
import { manualReason } from "./background";
import { ADMIN_CODE_MAX, ADMIN_CODE_MIN, adminCodeIsSet, setAdminCode } from "../lib/server/admin-auth";
import { askAboutQuestion, evaluateShortAnswer as aiEvaluate } from "../lib/ai/tutor";
import { decideOnSession, generatableLevels, launchFillPlan, POLICY, TRIGGER_LABEL } from "../lib/content/policy";
import { CONCEPTS, conceptsOf, getConcept } from "../lib/curriculum";
import { evaluateShortAnswer } from "../lib/grading";
import { misconceptionCounts } from "../lib/learner/stats";
import { AnswerSchema, LevelSchema } from "../lib/schemas";
import {
  coverage,
  exportGeneratedItems,
  getGeneratedItem,
  getQuestion,
  importGeneratedItem,
  listGeneratedItems,
  loadContent,
  reviewGeneratedItem,
  type ExportedItem,
} from "../lib/server/content-repo";
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
  getMeta,
  gradingSplit,
  importUsage,
  listJobs,
  monthToDateCostUsd,
  recordDemand,
  runningJob,
  setAutoGeneration,
  setMeta,
  usageSummary,
} from "../lib/server/ops-repo";
import { ALL_CONCEPTS, planSession, unshuffleAnswer } from "../lib/server/planner";
import { attemptCount, listAttempts, removeDemoPeers, resetSession, seedDemoPeers, setNickname, setPreferredLevel } from "../lib/server/session-repo";
import { HttpError, isProduction, notFound, parse, requireAdmin, type Ctx } from "./core";
import { conceptsView, dashboardView, demoView, learnView, meView, rankingView, reviewView } from "./views";

type Handler = (ctx: Ctx) => Promise<unknown>;

// ───────────────────────── 학습 ─────────────────────────

const SessionBody = z.object({
  level: LevelSchema,
  /** theory: 개념 학습, code: 코드 학습 */
  track: z.enum(["theory", "code"]).default("code"),
  /** 개념(주제) id 또는 "all"(전체 섞기) */
  concept: z.string().max(50).refine((c) => c === ALL_CONCEPTS || !!getConcept(c)).optional(),
  /** 개념 학습: 분야 전체 (단원 id) */
  unit: z.number().int().min(1).max(99).optional(),
  /** 개념 학습: 자격증 이름 (그 자격증 과목 태그가 붙은 문제만) */
  cert: z.string().max(40).optional(),
  size: z.number().int().min(1).max(20).optional(),
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

  // 복습·다시 풀기·전체 섞기는 특정 칸(개념 × 난이도)을 고른 게 아니므로 생성 판단을 하지 않는다.
  // 개념 학습은 아직 AI 생성 대상이 아니다 (관리자 승인 흐름이 생기면 추가)
  if (body.mode !== "learn" || body.ids?.length || body.concept === ALL_CONCEPTS || plan.track !== "code") return { ...plan, generating: false };

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
  const hints = found.question.hints.filter((h) => h.trim());
  if (body.level > hints.length) throw new HttpError(400, "더 볼 힌트가 없어요.");
  return { hint: hints[body.level - 1] };
};

const AskBody = z.object({
  questionId: z.string().max(120),
  question: z.string().min(1).max(500),
  solved: z.boolean().default(false),
  history: z
    .array(z.object({ role: z.enum(["user", "tutor"]), text: z.string().max(4000) }))
    .max(12)
    .default([]),
  /** 학습자가 지금 고르거나 쓴 답 (보기는 화면에 보인 번호) */
  answer: AnswerSchema.optional(),
});

/** 학습자가 직접 요청한 경우에만 AI 튜터가 답한다 (저비용 모델) */
const ask: Handler = async (ctx) => {
  const body = parse(AskBody, ctx.req.body);
  const found = await getQuestion(body.questionId);
  if (!found) throw notFound("문제");
  const raw = body.answer?.type === found.question.type ? body.answer : undefined;
  // 보기는 화면에 섞여 보인 번호를 원래 보기 번호로 되돌린다 (채점과 같은 방식)
  const answer = raw ? unshuffleAnswer(found.question, raw) : undefined;
  return askAboutQuestion(found.question, found.item, body.question, body.history, body.solved, answer);
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
  return launchFillPlan((c, l) => stock.get(`${c}:${l}`) ?? 0, conceptsOf("code").map((c) => c.id));
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
    fillPlan: launchFillPlan((c, l) => stock.get(`${c}:${l}`) ?? 0, conceptsOf("code").map((c) => c.id)),
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
  /** 만들 코드 수 (코드마다 단계별 문제 4개) */
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

/** AI 콘텐츠 하나의 문제 전체 (정답·해설 포함, 관리자 전용) — 승인 대기 중인 개념 문제를 검토할 때 */
const adminItem: Handler = async (ctx) => {
  await requireAdmin(ctx.req);
  const id = ctx.req.query.get("id") ?? "";
  const found = await getGeneratedItem(id);
  if (!found) throw notFound("AI 생성 콘텐츠");
  return found;
};

/**
 * 승인 대기 중인 AI 개념 문제를 승인(학습자에게 공개)하거나 반려한다.
 * 승인하면서 일부 문제를 뺄 수 있다 (남는 문제가 1개 이상이어야 함)
 */
const adminReview: Handler = async (ctx) => {
  await requireAdmin(ctx.req);
  const body = parse(
    z.object({
      itemId: z.string().max(120),
      decision: z.enum(["approve", "reject"]),
      removeQuestionIds: z.array(z.string().max(160)).max(20).default([]),
    }),
    ctx.req.body,
  );
  const found = await getGeneratedItem(body.itemId);
  if (!found) throw notFound("AI 생성 콘텐츠");
  if (found.row.status !== "pending") throw new HttpError(400, "승인 대기 중인 콘텐츠만 승인·반려할 수 있어요.");
  const remaining = found.questions.filter((q) => !body.removeQuestionIds.includes(q.id)).length;
  if (body.decision === "approve" && remaining === 0) throw new HttpError(400, "남는 문제가 없어요. 반려를 눌러 주세요.");
  await reviewGeneratedItem(body.itemId, body.decision === "approve" ? "published" : "rejected", body.decision === "approve" ? body.removeQuestionIds : []);
  return { status: body.decision === "approve" ? "published" : "rejected", questions: body.decision === "approve" ? remaining : 0 };
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

// ───────────────────────── 데이터 옮기기 (EC2·RDS → Lambda·DynamoDB 등) ─────────────────────────

/** 2: "개념 / 코드" 학습 구조. 1(예전 문제 형식)의 콘텐츠는 가져오지 않고 설정·사용량만 가져온다 */
const EXPORT_FORMAT = "codereading-export/2";
const OLD_EXPORT_FORMAT = "codereading-export/1";
/** 옮길 설정: 관리자 코드(해시), 자동 생성 켜짐 여부 */
const EXPORT_META_KEYS = ["admin_code_hash", "auto_generation"];

/** 관리자 데이터 내보내기: AI 생성 콘텐츠, 설정, 이번 달 AI 사용량 (학습 기록은 로그인 없는 임시 기록이라 옮기지 않음) */
const adminExport: Handler = async (ctx) => {
  await requireAdmin(ctx.req);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const meta: Record<string, string> = {};
  for (const key of EXPORT_META_KEYS) {
    const v = await getMeta(key);
    if (v !== null) meta[key] = v;
  }
  return {
    format: EXPORT_FORMAT,
    exportedAt: Date.now(),
    from: dbDriver(),
    items: await exportGeneratedItems(),
    meta,
    usageThisMonth: (await usageSummary(monthStart)).filter((u) => !u.model.startsWith("mock:")),
  };
};

const ImportBody = z.object({
  format: z.enum([EXPORT_FORMAT, OLD_EXPORT_FORMAT]),
  items: z
    .array(
      z.object({
        row: z.object({ id: z.string().max(120), status: z.enum(["published", "rejected"]), createdAt: z.number() }).passthrough(),
        item: z.object({ id: z.string().max(120), code: z.string(), concepts: z.array(z.string()), level: z.number() }).passthrough(),
        questions: z.array(z.object({ id: z.string(), codeItemId: z.string(), type: z.string() }).passthrough()).max(40),
      }),
    )
    .max(2000),
  meta: z.record(z.string(), z.string()).default({}),
  usageThisMonth: z
    .array(z.object({ task: z.string(), model: z.string(), calls: z.number(), input: z.number(), output: z.number(), cacheRead: z.number(), failures: z.number() }))
    .default([]),
  /** 이번 달 사용량도 더할지 (같은 파일을 두 번 가져오면 두 번 더해지므로 기본은 끔) */
  includeUsage: z.boolean().default(false),
});

/** 관리자 데이터 가져오기 (내보내기 파일 그대로). 같은 id 의 콘텐츠는 덮어쓴다 */
const adminImport: Handler = async (ctx) => {
  await requireAdmin(ctx.req);
  const body = parse(ImportBody, ctx.req.body);
  // 예전 형식의 AI 콘텐츠(셔플·오류 찾기 등)는 새 학습 구조에 맞지 않아 건너뛴다
  const items = body.format === EXPORT_FORMAT ? body.items : [];
  for (const e of items) await importGeneratedItem(e as unknown as ExportedItem);
  let settings = 0;
  for (const [key, value] of Object.entries(body.meta)) {
    if (!EXPORT_META_KEYS.includes(key)) continue;
    await setMeta(key, value);
    settings++;
  }
  if (body.includeUsage) await importUsage(body.usageThisMonth);
  return { items: items.length, skippedItems: body.items.length - items.length, settings, usage: body.includeUsage ? body.usageThisMonth.length : 0 };
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
  "GET /admin/item": adminItem,
  "POST /admin/review": adminReview,
  "GET /admin/export": adminExport,
  "POST /admin/import": adminImport,
};

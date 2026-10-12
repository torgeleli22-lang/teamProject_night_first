import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { toJSONSchema } from "zod/v4";
import type * as z from "zod/v4";
import { POLICY } from "../content/policy";
import { logUsage, monthToDateCostUsd } from "../server/ops-repo";

/**
 * 작업 난이도에 따라 모델을 나눈다 (AI 비용 관리 원칙 7).
 * - fast : 힌트, 질문 답변, 오답 설명, 콘텐츠 검수처럼 간단한 작업 (저비용)
 * - smart: 주관식 평가, 학습자 분석, 콘텐츠 생성처럼 높은 추론이 필요한 작업
 */
/**
 * AI 제공처
 * - anthropic: Claude API (ANTHROPIC_API_KEY)
 * - bedrock  : AWS Bedrock (AWS_REGION, AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 또는 EC2 IAM 역할)
 * - relay    : Bedrock 중계 Lambda (infra/bedrock-relay). EC2 에 AWS 키 없이 Lambda 실행 역할로 Bedrock 을 부른다
 *              (AI_RELAY_URL = Lambda 함수 URL, AI_RELAY_TOKEN = Lambda 의 RELAY_TOKEN 과 같은 값)
 */
export const AI_PROVIDER: "anthropic" | "bedrock" | "relay" =
  process.env.AI_PROVIDER === "bedrock" ? "bedrock" : process.env.AI_PROVIDER === "relay" ? "relay" : "anthropic";

/** Bedrock 은 계정에서 허용된 모델만 쓸 수 있어서 기본값을 따로 둔다 (학교 계정: Claude Haiku 4.5) */
const DEFAULT_MODELS =
  AI_PROVIDER === "anthropic"
    ? { fast: "claude-haiku-5-5", smart: "claude-opus-5-5" }
    : { fast: "anthropic.claude-haiku-4-5", smart: "anthropic.claude-haiku-4-5" };

export const MODELS = {
  fast: process.env.CLAUDE_MODEL_FAST || DEFAULT_MODELS.fast,
  smart: process.env.CLAUDE_MODEL_SMART || DEFAULT_MODELS.smart,
} as const;

export type Tier = keyof typeof MODELS;

/** 서버 측 refusal fallback 을 지원하는 모델 (Haiku 는 지원하지 않음) */
const SUPPORTS_FALLBACK = /^claude-(opus|fable|sonnet)-5/;
/** effort 설정이 없는 예전 모델 (보내면 오류) */
const NO_EFFORT = /haiku-4-5|sonnet-4-5|claude-3/;

type AIClient = Anthropic | AnthropicBedrockMantle;
let client: AIClient | null | undefined;

/**
 * AI 동작 모드
 * - live: 실제 Claude 호출 (API 키 필요)
 * - mock: AI 를 흉내 낸 응답 + 인위적인 지연. AWS/API 키 없이 화면 흐름·UI 를 확인하는 용도
 * - off : AI 없이 규칙 채점·저장된 해설·규칙 기반 분석만
 * AI_MODE 를 지정하지 않으면 키가 있으면 live, 없으면 off.
 */
export type AIMode = "live" | "mock" | "off";

export function aiMode(): AIMode {
  const mode = process.env.AI_MODE;
  if (mode === "mock" || mode === "off") return mode;
  if (mode === "live") return "live";
  if (AI_PROVIDER === "relay") return process.env.AI_RELAY_URL ? "live" : "off";
  if (AI_PROVIDER === "bedrock") return process.env.AWS_ACCESS_KEY_ID ? "live" : "off";
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "live" : "off";
}

export function getClient(): AIClient | null {
  if (client !== undefined) return client;
  if (aiMode() !== "live" || AI_PROVIDER === "relay") client = null;
  else if (AI_PROVIDER === "bedrock")
    // 자격 증명은 환경 변수(AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) 또는 EC2 IAM 역할에서 자동으로 읽는다
    client = new AnthropicBedrockMantle({ awsRegion: process.env.AWS_REGION || "us-east-1", timeout: 120_000, maxRetries: 1 });
  else client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  return client;
}

export function aiEnabled(): boolean {
  return aiMode() !== "off";
}

/** 목업 응답 지연 (작업별로 실제와 비슷한 체감을 주기 위해) */
const MOCK_DELAY_MS: Record<Tier, number> = { fast: 900, smart: 2200 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AIUnavailableError extends Error {}

/** 이전 대화 한 턴 (멀티 턴 대화) */
export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

/**
 * 이전 대화 + 이번 요청을 Claude 의 messages 형식으로 만든다.
 * 대화는 user 로 시작해 user/assistant 가 번갈아 와야 하므로, 앞쪽 assistant 는 버리고 같은 역할이 이어지면 합친다.
 */
export function buildMessages(history: HistoryTurn[], prompt: string): HistoryTurn[] {
  const out: HistoryTurn[] = [];
  for (const turn of [...history, { role: "user" as const, text: prompt }]) {
    const text = turn.text.trim();
    if (!text || (out.length === 0 && turn.role !== "user")) continue;
    const last = out[out.length - 1];
    if (last && last.role === turn.role) last.text += `\n\n${text}`;
    else out.push({ role: turn.role, text });
  }
  return out;
}

/**
 * 구조화된 JSON 응답을 받는 공통 호출. 응답은 Zod 스키마로 검증되고, 호출마다 토큰 사용량을 기록한다.
 */
export async function askStructured<T extends z.ZodType>(opts: {
  /** 사용량 집계용 작업 이름 */
  task: string;
  tier: Tier;
  system: string;
  prompt: string;
  schema: T;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  /** 이전 대화 (튜터 대화처럼 이어지는 작업). 이번 요청(prompt)은 마지막 user 메시지가 된다 */
  history?: HistoryTurn[];
  /** 목업 모드에서 돌려줄 응답 (없으면 목업 모드에서도 실패 처리 → 대체 경로) */
  mock?: () => z.infer<T> | Promise<z.infer<T>>;
  mockDelayMs?: number;
}): Promise<z.infer<T>> {
  const model = MODELS[opts.tier];

  if (aiMode() === "mock") {
    if (!opts.mock) throw new AIUnavailableError("no mock for this task");
    await sleep(opts.mockDelayMs ?? MOCK_DELAY_MS[opts.tier]);
    const result = await opts.mock();
    // 비용 화면을 확인할 수 있도록 대략적인 토큰 수를 기록 (모델 이름 앞에 mock: 표시)
    await logUsage(opts.task, `mock:${model}`, { input: Math.round((opts.system.length + opts.prompt.length) / 2), output: Math.round(JSON.stringify(result).length / 2), cacheRead: 0 }, true);
    return result;
  }

  if (aiMode() !== "live") throw new AIUnavailableError("AI is not configured");
  // API 주소가 공개되어 있으므로, 이번 달 예산을 넘으면 모든 AI 호출을 멈추고 규칙 기반 대체 경로를 쓴다
  if ((await monthToDateCostUsd()) >= POLICY.monthlyBudgetUsd) throw new AIUnavailableError("monthly AI budget reached");
  if (AI_PROVIDER === "relay") return askViaRelay(opts);
  const anthropic = getClient();
  if (!anthropic) throw new AIUnavailableError("AI is not configured");
  // Bedrock 에는 서버 측 fallback 이 없다
  const fallback = AI_PROVIDER === "anthropic" && SUPPORTS_FALLBACK.test(model);

  let ok = false;
  let usage = { input: 0, output: 0, cacheRead: 0 };
  try {
    const response = await anthropic.beta.messages.parse({
      model,
      max_tokens: opts.maxTokens ?? 16000,
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      // 튜터 원칙(system)은 모든 요청에서 같으므로 캐시해서 반복 비용을 줄인다
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: buildMessages(opts.history ?? [], opts.prompt).map((m) => ({ role: m.role, content: m.text })),
      output_config: {
        ...(NO_EFFORT.test(model) ? {} : { effort: opts.effort ?? "low" }),
        format: betaZodOutputFormat(opts.schema),
      },
    });
    usage = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
    };
    if (response.stop_reason === "refusal") throw new AIUnavailableError("request was declined");
    if (response.stop_reason === "max_tokens") throw new AIUnavailableError("response was truncated");
    if (response.parsed_output == null) throw new AIUnavailableError("could not parse response");
    ok = true;
    return response.parsed_output as z.infer<T>;
  } finally {
    try {
      await logUsage(opts.task, model, usage, ok);
    } catch {
      /* 사용량 기록 실패가 학습을 막지 않도록 */
    }
  }
}

type RelayResponse = {
  output?: unknown;
  stopReason?: string;
  model?: string;
  usage?: { input?: number; output?: number; cacheRead?: number };
  error?: string;
};

/** Bedrock 중계 Lambda 호출 (infra/bedrock-relay/lambda_function.py). 응답은 같은 Zod 스키마로 검증한다. */
async function askViaRelay<T extends z.ZodType>(opts: {
  task: string;
  tier: Tier;
  system: string;
  prompt: string;
  schema: T;
  maxTokens?: number;
  history?: HistoryTurn[];
}): Promise<z.infer<T>> {
  const { $schema: _ignored, ...schema } = toJSONSchema(opts.schema) as Record<string, unknown>;
  let model = MODELS[opts.tier];
  let ok = false;
  let usage = { input: 0, output: 0, cacheRead: 0 };
  try {
    const res = await fetch(process.env.AI_RELAY_URL!, {
      method: "POST",
      headers: { "content-type": "application/json", "x-relay-token": process.env.AI_RELAY_TOKEN ?? "" },
      body: JSON.stringify({ system: opts.system, messages: buildMessages(opts.history ?? [], opts.prompt), schema, maxTokens: opts.maxTokens ?? 16000 }),
      signal: AbortSignal.timeout(180_000),
    });
    const data = (await res.json().catch(() => ({}))) as RelayResponse;
    if (!res.ok) throw new AIUnavailableError(`relay ${res.status}: ${data.error ?? "error"}`);
    if (data.model) model = data.model;
    usage = { input: data.usage?.input ?? 0, output: data.usage?.output ?? 0, cacheRead: data.usage?.cacheRead ?? 0 };
    if (data.stopReason === "max_tokens") throw new AIUnavailableError("response was truncated");
    const parsed = opts.schema.safeParse(data.output);
    if (!parsed.success) throw new AIUnavailableError("could not parse response");
    ok = true;
    return parsed.data as z.infer<T>;
  } finally {
    try {
      await logUsage(opts.task, model, usage, ok);
    } catch {
      /* 사용량 기록 실패가 학습을 막지 않도록 */
    }
  }
}

/** AI 가 꺼져 있거나 실패하면 fallback 결과를 쓴다 (학습 흐름이 끊기지 않도록). */
export async function withFallback<T>(ai: () => Promise<T>, offline: () => T): Promise<T> {
  if (!aiEnabled()) return offline();
  try {
    return await ai();
  } catch (err) {
    console.error("[ai] 호출 실패, 대체 경로 사용:", err instanceof Error ? err.message : err);
    return offline();
  }
}

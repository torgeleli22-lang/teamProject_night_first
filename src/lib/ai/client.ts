// Anthropic SDK 는 AI_PROVIDER=anthropic·bedrock 일 때만 쓴다. Lambda(converse)·EC2(relay)에서는 불러오지 않도록 필요할 때만 import 한다
import type Anthropic from "@anthropic-ai/sdk";
import type { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { toJSONSchema } from "zod/v4";
import type * as z from "zod/v4";
import { POLICY } from "../content/policy";
import { logUsage, monthToDateCostUsd, worstCaseCostUsd } from "../server/ops-repo";

/**
 * 작업 난이도에 따라 모델을 나눈다 (AI 비용 관리 원칙 7).
 * - fast : 힌트, 질문 답변, 오답 설명, 콘텐츠 검수처럼 간단한 작업 (저비용)
 * - smart: 주관식 평가, 학습자 분석, 콘텐츠 생성처럼 높은 추론이 필요한 작업
 */
/**
 * AI 제공처
 * - anthropic: Claude API (ANTHROPIC_API_KEY)
 * - bedrock  : AWS Bedrock (AWS_REGION, AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 또는 EC2 IAM 역할)
 * - converse : API 가 Lambda 에서 돌 때 Bedrock Converse API 를 직접 부른다 (실행 역할 권한, 키 불필요)
 * - relay    : Bedrock 중계 Lambda (infra/bedrock-relay). EC2 에 AWS 키 없이 Lambda 실행 역할로 Bedrock 을 부른다
 *              (AI_RELAY_URL = Lambda 함수 URL, AI_RELAY_TOKEN = Lambda 의 RELAY_TOKEN 과 같은 값)
 */
export const AI_PROVIDER: "anthropic" | "bedrock" | "relay" | "converse" =
  process.env.AI_PROVIDER === "bedrock"
    ? "bedrock"
    : process.env.AI_PROVIDER === "relay"
      ? "relay"
      : process.env.AI_PROVIDER === "converse"
        ? "converse"
        : "anthropic";

/** Lambda(API) 에서 Bedrock 을 직접 부를 때 쓰는 모델 (중계 Lambda 와 같은 모델) */
const CONVERSE_MODEL_ID = process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-haiku-4-5-20251001-v1:0";
/** 도구 호출로 구조화 응답을 받는 방식(중계·직접)인지 */
const TOOL_PROVIDER = AI_PROVIDER === "relay" || AI_PROVIDER === "converse";

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
  if (AI_PROVIDER === "converse") return "live";
  if (AI_PROVIDER === "bedrock") return process.env.AWS_ACCESS_KEY_ID ? "live" : "off";
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "live" : "off";
}

export async function getClient(): Promise<AIClient | null> {
  if (client !== undefined) return client;
  if (aiMode() !== "live" || TOOL_PROVIDER) client = null;
  else if (AI_PROVIDER === "bedrock") {
    const { AnthropicBedrockMantle } = await import("@anthropic-ai/bedrock-sdk");
    // 자격 증명은 환경 변수(AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) 또는 EC2 IAM 역할에서 자동으로 읽는다
    client = new AnthropicBedrockMantle({ awsRegion: process.env.AWS_REGION || "us-east-1", timeout: 120_000, maxRetries: 1 });
  } else {
    const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
    client = new AnthropicClient({ timeout: 120_000, maxRetries: 1 });
  }
  return client;
}

export function aiEnabled(): boolean {
  return aiMode() !== "off";
}

/** 목업 응답 지연 (작업별로 실제와 비슷한 체감을 주기 위해) */
const MOCK_DELAY_MS: Record<Tier, number> = { fast: 900, smart: 2200 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AIUnavailableError extends Error {}

/** Lambda 중계(infra/bedrock-relay)가 허용하는 최대 출력 토큰 */
const RELAY_MAX_TOKENS = 16000;

/** 이 서버에서 응답을 기다리는 중인 AI 호출들의 최대 비용 합 (동시에 여러 호출이 예산을 넘지 않도록) */
let inFlightUsd = 0;

/**
 * 월 예산 확인: 이번 달 쓴 금액 + 진행 중인 호출 + 이번 호출의 최대 비용이 예산을 넘으면 호출하지 않는다.
 * 그래서 이번 달 추정 비용은 예산(AI_MONTHLY_BUDGET_USD)을 넘지 않는다.
 */
export function exceedsBudget(spentUsd: number, inFlight: number, worstUsd: number, budgetUsd: number): boolean {
  return spentUsd + inFlight + worstUsd > budgetUsd;
}

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
  /** 관리자가 생성을 중지하면 기다리던 응답을 버린다 */
  signal?: AbortSignal;
  /**
   * 응답이 스키마와 맞지 않을 때 쓸 수 있는 부분만 남기는 함수 (예: 칸이 빠진 문제만 버리기).
   * 돌려준 값도 같은 스키마로 다시 검증한다. 형식이 강제되지 않는 Lambda 중계(Converse 도구 호출)에서만 쓰인다
   */
  salvage?: (value: unknown) => unknown;
  /** 목업 모드에서 돌려줄 응답 (없으면 목업 모드에서도 실패 처리 → 대체 경로) */
  mock?: () => z.infer<T> | Promise<z.infer<T>>;
  mockDelayMs?: number;
}): Promise<z.infer<T>> {
  const model = MODELS[opts.tier];

  if (aiMode() === "mock") {
    if (!opts.mock) throw new AIUnavailableError("no mock for this task");
    await sleep(opts.mockDelayMs ?? MOCK_DELAY_MS[opts.tier]);
    if (opts.signal?.aborted) throw new AIUnavailableError("stopped");
    const result = await opts.mock();
    // 비용 화면을 확인할 수 있도록 대략적인 토큰 수를 기록 (모델 이름 앞에 mock: 표시)
    await logUsage(opts.task, `mock:${model}`, { input: Math.round((opts.system.length + opts.prompt.length) / 2), output: Math.round(JSON.stringify(result).length / 2), cacheRead: 0 }, true);
    return result;
  }

  if (aiMode() !== "live") throw new AIUnavailableError("AI is not configured");
  // API 주소가 공개되어 있으므로, 이번 달 예산을 넘길 수 있는 호출은 하지 않고 규칙 기반 대체 경로를 쓴다
  const maxOutput = TOOL_PROVIDER ? Math.min(opts.maxTokens ?? 16000, RELAY_MAX_TOKENS) : (opts.maxTokens ?? 16000);
  const inputChars = opts.system.length + opts.prompt.length + (opts.history ?? []).reduce((n, t) => n + t.text.length, 0);
  const worst = worstCaseCostUsd(model, inputChars, maxOutput);
  if (exceedsBudget(await monthToDateCostUsd(), inFlightUsd, worst, POLICY.monthlyBudgetUsd)) throw new AIUnavailableError("monthly AI budget reached");
  inFlightUsd += worst;
  try {
    return await callModel(opts, model, { inputChars, maxOutput });
  } finally {
    inFlightUsd -= worst;
  }
}

async function callModel<T extends z.ZodType>(
  opts: Parameters<typeof askStructured<T>>[0],
  model: string,
  limits: { inputChars: number; maxOutput: number },
): Promise<z.infer<T>> {
  if (TOOL_PROVIDER) return askViaTool(opts, limits, AI_PROVIDER === "converse" ? converseTransport : relayTransport);
  const anthropic = await getClient();
  if (!anthropic) throw new AIUnavailableError("AI is not configured");
  const { betaZodOutputFormat } = await import("@anthropic-ai/sdk/helpers/beta/zod");
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
    }, { signal: opts.signal });
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

type JsonSchema = {
  type?: string | string[];
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
};

function allowsType(schema: JsonSchema, type: string): boolean {
  if (schema.anyOf) return schema.anyOf.some((s) => allowsType(s, type));
  return Array.isArray(schema.type) ? schema.type.includes(type) : schema.type === type || (type === "number" && schema.type === "integer");
}

/**
 * 도구 호출로 받은 JSON 은 형식이 강제되지 않아서 자주 어긋난다. 스키마를 보고 흔한 어긋남만 고친다.
 * - "해당 없음" 칸을 null 대신 아예 빼먹음 → null
 * - 배열·객체를 JSON 문자열로 감싸 보냄 → 풀어서 넣음
 * - 숫자를 "3" 처럼 문자열로 보냄 → 숫자
 * 고친 뒤에도 Zod 검증은 그대로 거친다.
 */
export function repairForSchema(value: unknown, schema: JsonSchema): unknown {
  if (typeof value === "string" && (allowsType(schema, "array") || allowsType(schema, "object")) && !allowsType(schema, "string")) {
    const t = value.trim();
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        value = JSON.parse(t);
      } catch {
        /* 그대로 둠 */
      }
    }
  }
  if (typeof value === "string" && allowsType(schema, "number") && !allowsType(schema, "string") && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  const branch = schema.anyOf?.find((s) => (Array.isArray(value) ? allowsType(s, "array") : value !== null && typeof value === "object" ? allowsType(s, "object") : false)) ?? schema;
  if (Array.isArray(value) && branch.items) return value.map((v) => repairForSchema(v, branch.items!));
  if (value !== null && typeof value === "object" && !Array.isArray(value) && branch.properties) {
    const obj: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, sub] of Object.entries(branch.properties)) {
      if (obj[key] === undefined) {
        if (allowsType(sub, "null")) obj[key] = null;
      } else obj[key] = repairForSchema(obj[key], sub);
    }
    return obj;
  }
  return value;
}

/** 검증 실패 이유를 짧게 (관리자 화면의 생성 기록에 보인다) */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(전체)"}: ${i.message}`)
    .join("; ");
}

type RelayResponse = {
  output?: unknown;
  stopReason?: string;
  model?: string;
  usage?: { input?: number; output?: number; cacheRead?: number };
  error?: string;
};

/** 응답을 받기 전에 끊긴 요청 (Bedrock 이 이미 답을 만들었을 수 있다) */
class NoReplyError extends Error {}

type ToolRequest = { system: string; messages: HistoryTurn[]; schema: Record<string, unknown>; maxTokens: number; signal?: AbortSignal };
type ToolTransport = (req: ToolRequest) => Promise<RelayResponse>;

/** Bedrock 중계 Lambda (infra/bedrock-relay/lambda_function.py) 의 함수 URL 로 보낸다 */
const relayTransport: ToolTransport = async (req) => {
  let res: Response;
  try {
    res = await fetch(process.env.AI_RELAY_URL!, {
      method: "POST",
      headers: { "content-type": "application/json", "x-relay-token": process.env.AI_RELAY_TOKEN ?? "" },
      body: JSON.stringify({ system: req.system, messages: req.messages, schema: req.schema, maxTokens: req.maxTokens }),
      signal: req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
    });
  } catch (e) {
    throw new NoReplyError(e instanceof Error ? e.message : String(e));
  }
  const data = (await res.json().catch(() => ({}))) as RelayResponse;
  if (!res.ok) throw new AIUnavailableError(`relay ${res.status}: ${data.error ?? "error"}`);
  return data;
};

const TOOL_NAME = "answer";
let bedrockRuntime: import("@aws-sdk/client-bedrock-runtime").BedrockRuntimeClient | null = null;

/**
 * Bedrock Converse API 를 직접 부른다 (API 가 Lambda 에서 돌 때, 실행 역할 권한 사용).
 * 중계 Lambda 와 같은 방식: 도구 하나를 만들고 반드시 그 도구로 답하게 해서 입력값(JSON)을 결과로 쓴다.
 */
const converseTransport: ToolTransport = async (req) => {
  const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
  if (!bedrockRuntime) {
    const testEndpoint = process.env.BEDROCK_ENDPOINT; // 테스트용 가짜 Bedrock (HTTP/1.1)
    bedrockRuntime = new BedrockRuntimeClient({
      region: process.env.BEDROCK_REGION || "us-east-1",
      maxAttempts: 2,
      ...(testEndpoint
        ? { endpoint: testEndpoint, requestHandler: new (await import("@smithy/node-http-handler")).NodeHttpHandler({ requestTimeout: 170_000 }) }
        : { requestHandler: { connectionTimeout: 10_000, requestTimeout: 170_000 } }),
    });
  }
  let out;
  try {
    out = await bedrockRuntime.send(
      new ConverseCommand({
        modelId: CONVERSE_MODEL_ID,
        system: [{ text: req.system }],
        messages: req.messages.map((m) => ({ role: m.role, content: [{ text: m.text }] })),
        inferenceConfig: { maxTokens: req.maxTokens },
        toolConfig: {
          tools: [
            {
              toolSpec: {
                name: TOOL_NAME,
                description: "결과를 이 형식(JSON)으로 제출한다. 모든 칸을 빠짐없이 쓰고, 해당 없는 칸은 null 로 쓴다. 배열·객체를 문자열로 감싸지 않는다.",
                inputSchema: { json: req.schema as never },
              },
            },
          ],
          toolChoice: { tool: { name: TOOL_NAME } },
        },
      }),
      { abortSignal: req.signal },
    );
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
    // AWS 가 응답한 오류(권한·모델·한도)는 답을 만들지 않은 것, 연결이 끊긴 것은 답을 만들었을 수 있는 것
    if (err.$metadata?.httpStatusCode) throw new AIUnavailableError(`bedrock: ${err.name ?? "error"}`);
    throw new NoReplyError(err.message ?? String(e));
  }
  const toolUse = out.output?.message?.content?.find((c) => "toolUse" in c && c.toolUse)?.toolUse;
  return {
    output: toolUse?.input,
    stopReason: out.stopReason,
    model: CONVERSE_MODEL_ID,
    usage: { input: out.usage?.inputTokens ?? 0, output: out.usage?.outputTokens ?? 0, cacheRead: out.usage?.cacheReadInputTokens ?? 0 },
  };
};

/** 도구 호출 방식(중계·직접)으로 구조화 응답을 받는다. 응답은 같은 Zod 스키마로 검증한다 */
async function askViaTool<T extends z.ZodType>(
  opts: {
    task: string;
    tier: Tier;
    system: string;
    prompt: string;
    schema: T;
    maxTokens?: number;
    history?: HistoryTurn[];
    signal?: AbortSignal;
    salvage?: (value: unknown) => unknown;
  },
  limits: { inputChars: number; maxOutput: number },
  transport: ToolTransport,
): Promise<z.infer<T>> {
  const { $schema: _ignored, ...schema } = toJSONSchema(opts.schema) as Record<string, unknown>;
  let model = MODELS[opts.tier];
  let ok = false;
  let usage = { input: 0, output: 0, cacheRead: 0 };
  // 요청은 보냈는데 응답을 못 받으면(시간 초과·연결 끊김·중지) Bedrock 이 이미 답을 만들었을 수 있다 → 최대 사용량으로 기록
  let unanswered = false;
  try {
    let data: RelayResponse;
    try {
      data = await transport({ system: opts.system, messages: buildMessages(opts.history ?? [], opts.prompt), schema, maxTokens: limits.maxOutput, signal: opts.signal });
    } catch (e) {
      if (e instanceof NoReplyError) unanswered = true;
      throw e;
    }
    if (data.model) model = data.model;
    usage = { input: data.usage?.input ?? 0, output: data.usage?.output ?? 0, cacheRead: data.usage?.cacheRead ?? 0 };
    if (data.stopReason === "max_tokens") throw new AIUnavailableError("response was truncated");
    if (data.output == null) throw new AIUnavailableError("could not parse response: 응답에 결과(JSON)가 없음");
    const repaired = repairForSchema(data.output, schema as JsonSchema);
    let parsed = opts.schema.safeParse(repaired);
    if (!parsed.success && opts.salvage) {
      const kept = opts.schema.safeParse(opts.salvage(repaired));
      if (kept.success) parsed = kept;
    }
    if (!parsed.success) {
      console.error("[ai] 응답 형식 불일치:", opts.task, describeIssues(parsed.error));
      throw new AIUnavailableError(`could not parse response: ${describeIssues(parsed.error)}`);
    }
    ok = true;
    return parsed.data as z.infer<T>;
  } finally {
    if (unanswered) usage = { input: limits.inputChars, output: limits.maxOutput, cacheRead: 0 };
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

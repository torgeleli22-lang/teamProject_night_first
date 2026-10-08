import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { logUsage } from "../server/ops-repo";

/**
 * 작업 난이도에 따라 모델을 나눈다 (AI 비용 관리 원칙 7).
 * - fast : 힌트, 질문 답변, 오답 설명, 콘텐츠 검수처럼 간단한 작업 (저비용)
 * - smart: 주관식 평가, 학습자 분석, 콘텐츠 생성처럼 높은 추론이 필요한 작업
 */
export const MODELS = {
  fast: process.env.CLAUDE_MODEL_FAST || "claude-haiku-5-5",
  smart: process.env.CLAUDE_MODEL_SMART || "claude-opus-5-5",
} as const;

export type Tier = keyof typeof MODELS;

/** 서버 측 refusal fallback 을 지원하는 모델 (Haiku 는 지원하지 않음) */
const SUPPORTS_FALLBACK = /^claude-(opus|fable|sonnet)-5/;

let client: Anthropic | null | undefined;

/** API 키가 없으면 null → 각 기능은 규칙 기반/미리 저장된 콘텐츠로 동작한다. */
export function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const configured = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  client = configured ? new Anthropic({ timeout: 120_000, maxRetries: 1 }) : null;
  return client;
}

export function aiEnabled(): boolean {
  return getClient() !== null;
}

export class AIUnavailableError extends Error {}

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
}): Promise<z.infer<T>> {
  const anthropic = getClient();
  if (!anthropic) throw new AIUnavailableError("AI is not configured");
  const model = MODELS[opts.tier];
  const fallback = SUPPORTS_FALLBACK.test(model);

  let ok = false;
  let usage = { input: 0, output: 0, cacheRead: 0 };
  try {
    const response = await anthropic.beta.messages.parse({
      model,
      max_tokens: opts.maxTokens ?? 16000,
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      // 튜터 원칙(system)은 모든 요청에서 같으므로 캐시해서 반복 비용을 줄인다
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.prompt }],
      output_config: {
        effort: opts.effort ?? "low",
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
      logUsage(opts.task, model, usage, ok);
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

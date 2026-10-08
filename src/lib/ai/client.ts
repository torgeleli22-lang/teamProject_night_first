import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

let client: Anthropic | null | undefined;

/** API 키가 없으면 null → 각 라우트는 오프라인 튜터로 동작한다. */
export function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const configured = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  client = configured ? new Anthropic({ timeout: 60_000, maxRetries: 1 }) : null;
  return client;
}

export function aiEnabled(): boolean {
  return getClient() !== null;
}

export class AIUnavailableError extends Error {}

/**
 * 구조화된 JSON 응답을 받는 공통 호출.
 * - output_config.format 으로 스키마를 강제하고, SDK 가 파싱/검증한다.
 * - 안전 분류기가 거절(refusal)하면 서버 측 fallback 모델로 자동 재시도한다.
 */
export async function askStructured<T extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: T;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const anthropic = getClient();
  if (!anthropic) throw new AIUnavailableError("AI is not configured");

  const response = await anthropic.beta.messages.parse({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    output_config: {
      effort: opts.effort ?? "low",
      format: betaZodOutputFormat(opts.schema),
    },
  });

  if (response.stop_reason === "refusal") throw new AIUnavailableError("request was declined");
  if (response.stop_reason === "max_tokens") throw new AIUnavailableError("response was truncated");
  if (response.parsed_output == null) throw new AIUnavailableError("could not parse response");
  return response.parsed_output as z.infer<T>;
}

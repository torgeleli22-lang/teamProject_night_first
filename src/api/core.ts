import type * as z from "zod/v4";
import { checkAdminCode, clearFailures, isLockedOut, recordFailure } from "../lib/server/admin-auth";
import type { SessionInfo } from "../lib/server/session-repo";
import type { BackgroundTask } from "./background";

/**
 * Lambda 함수 URL 과 로컬 개발 서버가 함께 쓰는 요청/응답 형식.
 * (Next.js 없이 동작하는 순수 함수라 어디서든 실행할 수 있다)
 */
export interface ApiRequest {
  method: string;
  /** /session 처럼 API 기준 경로 */
  path: string;
  query: URLSearchParams;
  /** 소문자 헤더 이름 */
  headers: Record<string, string | undefined>;
  body: unknown;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface Ctx {
  req: ApiRequest;
  /** 지금 요청한 사람의 세션 (필요할 때만 DB 에서 확인·생성) */
  session(): Promise<SessionInfo>;
  /** AI 요청 한도를 넘음 → 이번 요청은 AI 없이 규칙으로만 처리 (주관식 제출) */
  aiLimited?: boolean;
  /** 응답을 기다리게 하지 않고 뒤에서 할 일 (AI 생성, 학습자 분석) */
  background(task: BackgroundTask): Promise<void>;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what}을(를) 찾을 수 없어요.`);

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, "요청 값을 확인해 주세요.");
  return parsed.data;
}

/** 운영 환경 (Lambda 이거나 NODE_ENV=production) */
export const isProduction = () => !!process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === "production";

/** 요청한 곳의 주소 (Caddy·Lambda 가 붙이는 x-forwarded-for 의 첫 번째 값) */
export function clientAddress(req: ApiRequest): string {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "local";
}

/**
 * 관리자 API 보호: x-admin-token 헤더가 관리자 코드(관리자 화면에서 바꿈) 또는 복구 코드(.env 의 ADMIN_TOKEN)와 같아야 한다.
 * 둘 다 없으면 로컬 개발에서만 허용한다. 틀린 코드를 여러 번 넣으면 그 주소는 15분 동안 막는다.
 */
export async function requireAdmin(req: ApiRequest) {
  const who = clientAddress(req);
  if (isLockedOut(who)) throw new HttpError(429, "관리자 코드를 여러 번 틀렸어요. 15분 뒤에 다시 시도해 주세요.");
  const result = await checkAdminCode(req.headers["x-admin-token"]);
  if (result === "ok" || (result === "open" && !isProduction())) {
    if (result === "ok") clearFailures(who);
    return;
  }
  if (result === "wrong") recordFailure(who);
  throw new HttpError(401, "관리자 권한이 필요해요.");
}

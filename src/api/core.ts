import type * as z from "zod/v4";
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

/**
 * 관리자 API 보호: ADMIN_TOKEN 이 설정되어 있으면 x-admin-token 헤더가 일치해야 한다.
 * 설정되어 있지 않으면 로컬 개발에서만 허용한다.
 */
export function requireAdmin(req: ApiRequest) {
  const token = process.env.ADMIN_TOKEN;
  const ok = token ? req.headers["x-admin-token"] === token : !isProduction();
  if (!ok) throw new HttpError(401, "관리자 권한이 필요해요.");
}

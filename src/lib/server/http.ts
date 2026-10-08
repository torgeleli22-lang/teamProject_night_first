import "server-only";
import { NextResponse } from "next/server";
import type * as z from "zod/v4";

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T> | NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식이에요." }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "요청 값을 확인해 주세요." }, { status: 400 });
  return parsed.data;
}

export const notFound = (what: string) => NextResponse.json({ error: `${what}을(를) 찾을 수 없어요.` }, { status: 404 });

/**
 * 관리자 API 보호: ADMIN_TOKEN 이 설정되어 있으면 x-admin-token 헤더가 일치해야 한다.
 * 설정되어 있지 않으면 개발 환경에서만 허용한다.
 */
export function adminDenied(req: Request): NextResponse | null {
  const token = process.env.ADMIN_TOKEN;
  if (token ? req.headers.get("x-admin-token") === token : process.env.NODE_ENV !== "production") return null;
  return NextResponse.json({ error: "관리자 권한이 필요해요." }, { status: 401 });
}

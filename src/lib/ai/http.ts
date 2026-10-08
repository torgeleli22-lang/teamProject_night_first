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

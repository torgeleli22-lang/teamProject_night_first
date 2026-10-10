import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { generateCodeSet } from "@/lib/ai/generate";
import { getConcept } from "@/lib/curriculum";
import { LevelSchema } from "@/lib/schemas";
import { adminDenied, parseBody } from "@/lib/server/http";

export const maxDuration = 300;

const Body = z.object({
  concept: z.string().refine((c) => !!getConcept(c)),
  level: LevelSchema,
  focus: z.array(z.string().max(200)).max(5).optional(),
});

/** 관리자가 콘텐츠를 미리 생성한다: AI 생성 → 실행 검증 → AI 검수 → 문제 DB 저장 */
export async function POST(req: Request) {
  const denied = adminDenied(req);
  if (denied) return denied;
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  return NextResponse.json(await generateCodeSet({ ...body, trigger: "manual", reason: "관리자 수동 생성" }));
}

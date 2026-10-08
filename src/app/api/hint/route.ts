import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { getQuestion } from "@/lib/server/content-repo";
import { notFound, parseBody } from "@/lib/server/http";

const Body = z.object({ questionId: z.string().max(120), level: z.number().int().min(1).max(4) });

/** 미리 저장된 단계별 힌트 (AI 호출 없음). 한 번에 한 단계씩만 보낸다 */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const found = getQuestion(body.questionId);
  if (!found) return notFound("문제");
  return NextResponse.json({ hint: found.question.hints[body.level - 1] });
}

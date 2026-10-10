import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { askAboutQuestion } from "@/lib/ai/tutor";
import { getQuestion } from "@/lib/server/content-repo";
import { notFound, parseBody } from "@/lib/server/http";

const Body = z.object({
  questionId: z.string().max(120),
  question: z.string().min(1).max(500),
  solved: z.boolean().default(false),
  history: z
    .array(z.object({ role: z.enum(["user", "tutor"]), text: z.string().max(2000) }))
    .max(8)
    .default([]),
});

/** 학습자가 직접 요청한 경우에만 AI 튜터가 답한다 (저비용 모델) */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const found = getQuestion(body.questionId);
  if (!found) return notFound("문제");
  return NextResponse.json(await askAboutQuestion(found.question, found.item, body.question, body.history, body.solved));
}

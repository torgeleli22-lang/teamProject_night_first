import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { evaluateShortAnswer as aiEvaluate } from "@/lib/ai/tutor";
import { evaluateShortAnswer } from "@/lib/grading";
import { getQuestion } from "@/lib/server/content-repo";
import { notFound, parseBody } from "@/lib/server/http";

const Body = z.object({ questionId: z.string().max(120), text: z.string().min(1).max(2000) });

/**
 * 학습자가 "AI 에게 자세히 분석 받기" 를 요청한 경우: 규칙으로 정답 처리된 주관식도 AI 가 다시 본다.
 * (채점 기록은 바꾸지 않고 분석만 보여준다)
 */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const found = getQuestion(body.questionId);
  if (!found || found.question.type !== "short_answer") return notFound("주관식 문제");
  const rule = evaluateShortAnswer(found.question, body.text);
  return NextResponse.json(await aiEvaluate(found.question, found.item, body.text, rule, true));
}

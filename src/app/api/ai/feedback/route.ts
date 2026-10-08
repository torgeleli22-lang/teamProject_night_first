import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { notFound, parseBody } from "@/lib/ai/http";
import { analyzeAnswer } from "@/lib/ai/tutor";
import { getProblem } from "@/lib/problems";

const AnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choice"), index: z.number().int().min(0).max(10) }),
  z.object({ type: z.literal("predict"), text: z.string().max(1000) }),
  z.object({ type: z.literal("bug"), line: z.number().int().min(1).max(200) }),
  z.object({ type: z.literal("order"), order: z.array(z.number().int().min(0).max(50)).max(50) }),
  z.object({ type: z.literal("explain"), text: z.string().max(2000) }),
]);

const Body = z.object({
  problemId: z.string().max(100),
  answer: AnswerSchema,
  hintsUsed: z.number().int().min(0).max(5).default(0),
});

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const problem = getProblem(body.problemId);
  if (!problem) return notFound("문제");
  return NextResponse.json(await analyzeAnswer(problem, body.answer, body.hintsUsed));
}

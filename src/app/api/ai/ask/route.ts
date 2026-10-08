import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { notFound, parseBody } from "@/lib/ai/http";
import { askAboutProblem } from "@/lib/ai/tutor";
import { getProblem } from "@/lib/problems";

const Body = z.object({
  problemId: z.string().max(100),
  question: z.string().min(1).max(500),
  solved: z.boolean().default(false),
  history: z
    .array(z.object({ role: z.enum(["user", "tutor"]), text: z.string().max(2000) }))
    .max(8)
    .default([]),
});

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const problem = getProblem(body.problemId);
  if (!problem) return notFound("문제");
  return NextResponse.json(await askAboutProblem(problem, body.question, body.history, body.solved));
}

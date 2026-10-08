import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { notFound, parseBody } from "@/lib/ai/http";
import { generateHint } from "@/lib/ai/tutor";
import { getProblem } from "@/lib/problems";

const Body = z.object({
  problemId: z.string().max(100),
  level: z.number().int().min(1).max(4),
  draft: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const problem = getProblem(body.problemId);
  if (!problem) return notFound("문제");
  return NextResponse.json(await generateHint(problem, body.level, body.draft));
}

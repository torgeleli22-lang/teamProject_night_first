import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { notFound, parseBody } from "@/lib/ai/http";
import { explainConcept } from "@/lib/ai/tutor";
import { getProblem } from "@/lib/problems";

const Body = z.object({
  conceptId: z.string().max(100),
  problemId: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const problem = body.problemId ? getProblem(body.problemId) : undefined;
  const result = await explainConcept(body.conceptId, problem);
  if (!result) return notFound("개념");
  return NextResponse.json(result);
}

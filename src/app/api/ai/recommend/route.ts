import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { parseBody } from "@/lib/ai/http";
import { recommendMessage } from "@/lib/ai/tutor";
import { getConcept } from "@/lib/curriculum";

const conceptId = z.string().max(100).refine((id) => !!getConcept(id));

const Body = z.object({
  recommendedConcept: conceptId,
  reason: z.string().max(200),
  fallback: z.string().max(300),
  weak: z.array(z.object({ conceptId, mastery: z.number().min(0).max(100) })).max(30),
  strong: z.array(conceptId).max(30),
  misconceptions: z.array(z.object({ text: z.string().max(200), count: z.number().int().min(1) })).max(10),
  totalAttempts: z.number().int().min(0),
  streak: z.number().int().min(0),
});

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const { fallback, ...summary } = body;
  return NextResponse.json(await recommendMessage(summary, fallback));
}

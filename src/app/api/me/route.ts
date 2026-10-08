import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { LevelSchema } from "@/lib/schemas";
import { parseBody } from "@/lib/server/http";
import { currentLearner } from "@/lib/server/learner";
import { resetLearner, setPreferredLevel } from "@/lib/server/learner-repo";

const Body = z.object({ preferredLevel: LevelSchema.optional(), reset: z.boolean().optional() });

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const learner = await currentLearner();
  if (body.reset) resetLearner(learner.id);
  if (body.preferredLevel) setPreferredLevel(learner.id, body.preferredLevel);
  return NextResponse.json({ ok: true });
}

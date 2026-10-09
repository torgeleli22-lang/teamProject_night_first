import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { aiMode } from "@/lib/ai/client";
import { loadPersona, PERSONAS } from "@/lib/server/demo";
import { parseBody } from "@/lib/server/http";
import { currentLearner } from "@/lib/server/learner";

export const maxDuration = 60;

const Body = z.object({ persona: z.enum(Object.keys(PERSONAS) as [keyof typeof PERSONAS, ...(keyof typeof PERSONAS)[]]) });

/** UI/UX 확인용 데모 학습 기록. 목업 모드나 개발 환경에서만 허용 */
export async function POST(req: Request) {
  if (aiMode() !== "mock" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "데모 데이터는 목업 모드에서만 쓸 수 있어요." }, { status: 403 });
  }
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const learner = await currentLearner();
  await loadPersona(learner.id, body.persona);
  return NextResponse.json({ ok: true });
}

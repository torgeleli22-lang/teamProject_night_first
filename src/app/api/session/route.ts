import { after, NextResponse } from "next/server";
import * as z from "zod/v4";
import { aiEnabled } from "@/lib/ai/client";
import { generateCodeSet } from "@/lib/ai/generate";
import { getConcept } from "@/lib/curriculum";
import { misconceptionCounts } from "@/lib/learner/stats";
import { LevelSchema, QuestionTypeSchema } from "@/lib/schemas";
import { parseBody } from "@/lib/server/http";
import { currentLearner } from "@/lib/server/learner";
import { listAttempts, setPreferredLevel } from "@/lib/server/learner-repo";
import { planSession } from "@/lib/server/session";

const Body = z.object({
  level: LevelSchema,
  concept: z.string().max(50).refine((c) => !!getConcept(c)).optional(),
  types: z.array(QuestionTypeSchema).max(6).optional(),
  size: z.number().int().min(1).max(10).optional(),
  /** 이미 이번 세션에 나온 문제 ("비슷한 문제 풀어보기") */
  exclude: z.array(z.string().max(120)).max(50).optional(),
});

/** 학습 세션 시작: 일반 추천 알고리즘으로 문제를 고른다 (AI 호출 없음) */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const learner = await currentLearner();
  setPreferredLevel(learner.id, body.level);
  const attempts = listAttempts(learner.id);
  const plan = planSession({ ...body, attempts });

  // 기존 문제가 부족할 때만 AI 가 새 콘텐츠를 만든다 (응답을 기다리게 하지 않고 백그라운드로)
  const generating = plan.lacking && aiEnabled();
  if (generating) {
    const focus = misconceptionCounts(attempts.filter((a) => a.concepts.includes(plan.focusConcept))).slice(0, 3).map((m) => m.text);
    after(() => generateCodeSet({ concept: plan.focusConcept, level: body.level, reason: "콘텐츠 부족 (학습 세션)", focus }));
  }
  return NextResponse.json({ ...plan, generating });
}

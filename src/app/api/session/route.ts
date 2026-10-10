import { after, NextResponse } from "next/server";
import * as z from "zod/v4";
import { aiEnabled } from "@/lib/ai/client";
import { generateCodeSet } from "@/lib/ai/generate";
import { decideOnSession, POLICY } from "@/lib/content/policy";
import { getConcept } from "@/lib/curriculum";
import { misconceptionCounts } from "@/lib/learner/stats";
import { LevelSchema, QuestionTypeSchema } from "@/lib/schemas";
import { coverage } from "@/lib/server/content-repo";
import { parseBody } from "@/lib/server/http";
import { currentSession } from "@/lib/server/visitor";
import { listAttempts, setPreferredLevel } from "@/lib/server/session-repo";
import { demandCount, recordDemand, runningJob } from "@/lib/server/ops-repo";
import { planSession } from "@/lib/server/planner";

const Body = z.object({
  level: LevelSchema,
  concept: z.string().max(50).refine((c) => !!getConcept(c)).optional(),
  types: z.array(QuestionTypeSchema).max(6).optional(),
  size: z.number().int().min(1).max(10).optional(),
  /** 이미 이번 세션에 나온 문제 ("비슷한 문제 풀어보기") */
  exclude: z.array(z.string().max(120)).max(50).optional(),
});

/**
 * 학습 세션 시작: 일반 추천 알고리즘으로 저장된 문제를 고른다 (AI 호출 없음).
 * 생성 기준(policy.ts)에 해당하면 응답을 기다리게 하지 않고 백그라운드로 새 콘텐츠를 만든다.
 */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const me = await currentSession();
  if (!body.exclude) setPreferredLevel(me.id, body.level);
  const attempts = listAttempts(me.id);
  const plan = planSession({ ...body, attempts });

  const concept = plan.focusConcept;
  const stock = coverage().get(`${concept}:${body.level}`) ?? 0;
  const demand = demandCount(concept, body.level, Date.now() - POLICY.demandWindowDays * 86400_000);
  // 이번 학습자가 소진한 상태라면 수요에 포함해서 판단
  const exhausted = plan.unsolvedAtLevel < POLICY.learnerLow;
  const decision = decideOnSession({ concept, level: body.level, stock, unsolved: plan.unsolvedAtLevel, demand: demand + (exhausted ? 1 : 0) });
  if (!decision.generate && decision.recordDemand) recordDemand(concept, body.level, me.id);

  let generating = !!runningJob(concept, body.level);
  if (decision.generate && aiEnabled() && !generating) {
    generating = true;
    const focus = misconceptionCounts(attempts.filter((a) => a.concepts.includes(concept))).slice(0, 3).map((m) => m.text);
    after(() => generateCodeSet({ concept, level: body.level, trigger: decision.trigger, reason: decision.reason, sessionId: me.id, focus }));
  }
  return NextResponse.json({ ...plan, generating, generation: { stock, demand, decision } });
}

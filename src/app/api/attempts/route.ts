import { after, NextResponse } from "next/server";
import * as z from "zod/v4";
import { analysisDue, runLearnerAnalysis } from "@/lib/ai/analysis";
import { AnswerSchema } from "@/lib/schemas";
import { gradeAttempt } from "@/lib/server/grade";
import { notFound, parseBody } from "@/lib/server/http";
import { currentLearner } from "@/lib/server/learner";
import { listAttempts } from "@/lib/server/learner-repo";

const Body = z.object({
  questionId: z.string().max(120),
  /** giveUp = "정답과 해설 보기" (5단계 힌트): 오답으로 기록하고 해설을 돌려준다 */
  answer: AnswerSchema.optional(),
  giveUp: z.boolean().default(false),
  hintsUsed: z.number().int().min(0).max(5).default(0),
  timeMs: z.number().int().min(0).max(60 * 60_000).default(0),
});

/** 답안 제출: 서버에서 채점하고 기록한다. 일정 문제 수마다 학습자 분석을 백그라운드로 실행 */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const learner = await currentLearner();
  if (!body.answer && !body.giveUp) return NextResponse.json({ error: "답을 입력해 주세요." }, { status: 400 });
  const result = await gradeAttempt(learner, body.questionId, body.giveUp ? null : body.answer!, body.hintsUsed, body.timeMs);
  if (!result) return notFound("문제");

  const count = listAttempts(learner.id).length;
  const analyzing = analysisDue(learner.id, count);
  if (analyzing) after(() => runLearnerAnalysis(learner.id, learner.preferredLevel));
  return NextResponse.json({ ...result, analyzing });
}

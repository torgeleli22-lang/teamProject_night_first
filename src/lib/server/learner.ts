import "server-only";
import { cookies } from "next/headers";
import { ensureLearner, type Learner } from "./learner-repo";

export async function currentLearner(): Promise<Learner> {
  const id = (await cookies()).get("lid")?.value;
  // 미들웨어가 항상 발급하지만, 혹시 없으면 이번 요청만을 위한 임시 학습자
  return ensureLearner(id ?? "anonymous");
}

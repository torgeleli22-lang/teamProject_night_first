/**
 * API 전체 흐름 점검 (Lambda 와 같은 라우터를 직접 호출).
 *   npx tsx scripts/api-smoke.ts                       → SQLite (DATABASE_PATH 또는 ./data/app.db)
 *   DB_DRIVER=postgres DATABASE_URL=... npx tsx scripts/api-smoke.ts  → PostgreSQL
 * AI_MODE=mock 로 실행하면 AI 경로까지 확인한다.
 */
import { runTask, type BackgroundTask } from "../src/api/background";
import { handle, SESSION_HEADER } from "../src/api/router";
import type { PublicQuestion } from "../src/lib/server/planner";

const tasks: Promise<void>[] = [];
const background = async (t: BackgroundTask) => {
  tasks.push(runTask(t));
};

let sid: string | null = null;
async function call<T = Record<string, unknown>>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
  const url = new URL(path, "http://x");
  const res = await handle(
    { method, path: url.pathname, query: url.searchParams, headers: { ...(sid ? { [SESSION_HEADER]: sid } : {}), ...extra }, body },
    background,
  );
  if (res.headers[SESSION_HEADER]) sid = res.headers[SESSION_HEADER];
  const data = JSON.parse(res.body || "{}");
  if (res.status !== 200) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
  return data as T;
}

function answerFor(q: PublicQuestion) {
  switch (q.type) {
    case "multiple_choice":
    case "fill_blank":
      return { type: q.type, index: 0 };
    case "shuffle":
      return { type: q.type, order: q.pieces!.map((_, i) => i) };
    case "predict_output":
      return { type: q.type, text: "1" };
    case "find_bug":
      return { type: q.type, line: 1 };
    case "short_answer":
      return { type: q.type, text: "filter 는 조건에 맞는 요소만 골라서 새 배열을 만들어요" };
  }
}

const check = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`실패: ${msg}`);
  console.log(`✓ ${msg}`);
};

(async () => {
  const health = await call<{ db: string }>("GET", "/health");
  console.log(`DB: ${health.db}`);
  const me = await call<{ nickname: string }>("GET", "/me");
  check(sid && me.nickname, "세션 발급 + 닉네임");
  const firstSid = sid;
  await call("GET", "/me");
  check(sid === firstSid, "같은 세션 유지");

  const learn = await call<{ recommendedConcept: string }>("GET", "/learn");
  check(learn.recommendedConcept, "학습 탭 데이터");

  const plan = await call<{ questions: PublicQuestion[] }>("POST", "/session", { level: 3, concept: "filter", mode: "learn" });
  check(plan.questions.length > 0, `filter 세트 ${plan.questions.length}문제`);
  check(plan.questions.every((q) => !("answerIndex" in q) && !("explanation" in q)), "정답·해설이 응답에 없음");

  const hint = await call<{ hint: string }>("POST", "/hint", { questionId: plan.questions[0].id, level: 1 });
  check(hint.hint, "힌트 1단계");

  for (const q of plan.questions) {
    const r = await call<{ xp: number; tutor: { source: string } }>("POST", "/attempts", { questionId: q.id, answer: answerFor(q), hintsUsed: 0, timeMs: 5000 });
    check(typeof r.xp === "number", `채점: ${q.type} (${r.tutor.source})`);
  }
  await call("POST", "/attempts", { questionId: plan.questions[0].id, giveUp: true });
  check(true, "정답 보기(포기) 기록");

  const review = await call<{ wrong: unknown[] }>("POST", "/session", { level: 3, mode: "review" });
  check(Array.isArray((review as { questions?: unknown[] }).questions), "복습 세트");
  const reviewView = await call<{ wrong: unknown[] }>("GET", "/review");
  check(reviewView.wrong.length > 0, `오답 노트 ${reviewView.wrong.length}개`);

  const dash = await call<{ empty: boolean; days: unknown[] }>("GET", "/dashboard");
  check(!dash.empty && dash.days.length === 1, "내 학습 (캘린더 1일)");
  const concepts = await call<{ items: unknown[] }>("GET", "/concepts");
  check(concepts.items.length > 50, `탐색 코드 ${concepts.items.length}개`);

  await call("POST", "/me", { nickname: "테스트" });
  await call("POST", "/demo", { peers: "add" });
  const ranking = await call<{ top: { isMe: boolean; nickname: string }[]; total: number; mine: { rank: number } }>("GET", "/ranking");
  check(ranking.total >= 31 && ranking.mine.rank >= 1, `랭킹 ${ranking.mine.rank}등 / ${ranking.total}명`);
  check(ranking.top.every((r) => !("sessionId" in r)), "랭킹에 다른 사람 세션 id 없음");
  await call("POST", "/demo", { peers: "remove" });

  await call("POST", "/demo", { persona: "confused" });
  await Promise.all(tasks);
  const dash2 = await call<{ attemptCount: number; analysis: unknown }>("GET", "/dashboard");
  check(dash2.attemptCount > 20 && dash2.analysis, `데모 학습자 ${dash2.attemptCount}문제 + 학습 분석`);

  const overview = await call<{ coverage: Record<string, number> }>("GET", "/admin/overview");
  check(Object.keys(overview.coverage).length > 10, "관리자 개요");
  await call("POST", "/admin/auto", { enabled: false });
  check(!(await call<{ autoGeneration: boolean }>("GET", "/admin/overview")).autoGeneration, "자동 생성 끄기");
  const sparse = await call<{ generating: boolean; generation?: { decision: { generate: boolean } } }>("POST", "/session", { level: 1, concept: "variables", mode: "learn" });
  check(!sparse.generating, `자동 생성이 꺼지면 부족한 칸도 생성하지 않음 (생성 기준 해당: ${sparse.generation?.decision.generate})`);
  await call("POST", "/admin/auto", { enabled: true });
  check((await call<{ autoGeneration: boolean }>("GET", "/admin/overview")).autoGeneration, "자동 생성 켜기");
  check((await call<{ stopped: number }>("POST", "/admin/stop", {})).stopped === 0, "생성 중지 (진행 중 없음)");
  if (process.env.AI_MODE === "mock") {
    const gen = await call<{ status: string }>("POST", "/admin/generate", { concept: "reduce", level: 4 });
    check(["published", "rejected"].includes(gen.status), `AI 생성(목업): ${gen.status}`);
    // 수동 생성 도중 중지 → 결과를 버리고 cancelled
    const pending = call<{ status: string }>("POST", "/admin/generate", { concept: "filter", level: 2 });
    await new Promise((r) => setTimeout(r, 500));
    const stop = await call<{ stopped: number }>("POST", "/admin/stop", {});
    check(stop.stopped === 1 && (await pending).status === "cancelled", "AI 생성 도중 중지(목업)");
    // 출시 전 채우기 도중 전부 중지 → 남은 칸도 만들지 않음
    const fill = await call<{ started: number }>("POST", "/admin/fill?limit=3", undefined);
    await new Promise((r) => setTimeout(r, 300));
    await call("POST", "/admin/stop", {});
    await Promise.all(tasks);
    const after = await call<{ jobs: { status: string; trigger: string }[] }>("GET", "/admin/overview");
    const fillJobs = after.jobs.filter((j) => j.trigger === "launch_fill");
    check(fill.started > 0 && fillJobs.length <= 1 && fillJobs.every((j) => j.status === "cancelled"), `출시 전 채우기 중지(목업): ${fillJobs.length}개 시작, 모두 중지`);
    const ask = await call<{ answer: string }>("POST", "/ask", { questionId: plan.questions[0].id, question: "왜 그렇게 돼요?" });
    check(ask.answer, "AI 튜터 질문(목업)");
  }

  await call("POST", "/me", { reset: true });
  const after = await call<{ empty: boolean }>("GET", "/dashboard");
  check(after.empty, "기록 초기화");
  const bogus = sid;
  sid = "11111111-1111-1111-1111-111111111111";
  await call("GET", "/me");
  check(sid !== bogus && sid !== "11111111-1111-1111-1111-111111111111", "모르는 세션 id 는 새 세션으로 교체");
  console.log("\n모든 API 점검 통과");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

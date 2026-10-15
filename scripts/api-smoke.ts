/**
 * API 전체 흐름 점검 (Lambda 와 같은 라우터를 직접 호출).
 *   npx tsx scripts/api-smoke.ts                       → SQLite (DATABASE_PATH 또는 ./data/app.db)
 *   DB_DRIVER=postgres DATABASE_URL=... npx tsx scripts/api-smoke.ts  → PostgreSQL
 * AI_MODE=mock 로 실행하면 AI 경로까지 확인한다.
 */
import { runTask, type BackgroundTask } from "../src/api/background";
import { handle, SESSION_HEADER } from "../src/api/router";
import { buildSeed } from "../src/lib/content/seed";
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
    case "predict_output":
      return { type: q.type, text: "1" };
    case "short_answer":
      return { type: q.type, text: "filter 는 조건에 맞는 요소만 골라서 새 배열을 만들어요" };
    case "trace":
      return { type: q.type, values: (q.trace ?? []).map(() => "0") };
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

  const plan = await call<{ questions: PublicQuestion[]; track: string }>("POST", "/session", { level: 3, track: "code", concept: "filter", mode: "learn" });
  check(plan.track === "code" && plan.questions.length > 0, `코드 학습 filter 세트 ${plan.questions.length}문제`);
  check(plan.questions[0].stage === "overview" && plan.questions.every((q) => q.code && q.stage), "코드 학습은 훑어보기부터 단계 순서로");
  check(plan.questions.every((q) => !("answerIndex" in q) && !("explanation" in q)), "정답·해설이 응답에 없음");
  const ORDER = ["overview", "trace", "key", "wrapup"];
  const stagesSorted = (qs: PublicQuestion[]) => qs.every((q, i) => i === 0 || q.codeItemId !== qs[i - 1].codeItemId || ORDER.indexOf(q.stage!) >= ORDER.indexOf(qs[i - 1].stage!));
  check(stagesSorted(plan.questions), "코드 학습 단계 순서: 훑어보기 → 흐름 따라가기 → 핵심 줄 → 정리");
  // 흐름 따라가기: 칸에는 값(정답)이 없고, 실제 실행 기록대로 적으면 정답, 하나 틀리면 부분 정답 (시드 코드로 확인)
  const lesson = await call<{ questions: PublicQuestion[] }>("POST", "/session", { level: 2, track: "code", ids: ["cart-overview", "cart-trace", "cart-loop-count"] });
  check(lesson.questions.map((q) => q.stage).join(",") === "overview,trace,key", "장바구니 코드: 훑어보기 → 흐름 따라가기 → 핵심 줄");
  const traceQ = lesson.questions.find((q) => q.type === "trace")!;
  const traceSeed = buildSeed().questions.find((x) => x.id === traceQ.id)!;
  const rightValues = traceSeed.type === "trace" ? traceSeed.rows.map((r) => r.value.replace(/^'|'$/g, "")) : [];
  check(traceQ.trace?.length === rightValues.length && !JSON.stringify(traceQ.trace).includes("value"), `흐름 따라가기 칸 ${rightValues.length}개 (정답 없이)`);

  // 개념 학습: 분야(네트워크) 전체에서 객관식 10문제, 코드 없음. 화면에 섞인 보기에서 정답을 고르면 정답 처리
  const seed = buildSeed().questions;
  const theory = await call<{ questions: PublicQuestion[]; track: string }>("POST", "/session", { level: 2, track: "theory", unit: 11, mode: "learn" });
  check(theory.track === "theory" && theory.questions.length === 10, `개념 학습 네트워크 ${theory.questions.length}문제`);
  check(theory.questions.every((q) => !q.code && q.type === "multiple_choice" && q.choices?.length === 4 && q.certs?.length), "개념 문제는 코드 없는 4지선다 + 자격증 태그");
  const tq = theory.questions[0];
  const original = seed.find((x) => x.id === tq.id)!;
  const rightText = original.type === "multiple_choice" ? original.choices[original.answerIndex].text : "";
  const graded = await call<{ correct: boolean; answerIndex: number }>("POST", "/attempts", {
    questionId: tq.id,
    answer: { type: "multiple_choice", index: tq.choices!.indexOf(rightText) },
    hintsUsed: 0,
    timeMs: 3000,
  });
  check(graded.correct && tq.choices![graded.answerIndex] === rightText, "섞인 보기에서 정답을 고르면 정답 (정답 표시도 화면 순서)");
  const sqld = await call<{ questions: PublicQuestion[] }>("POST", "/session", { level: 3, track: "theory", concept: "all", cert: "SQLD", mode: "learn" });
  check(sqld.questions.length > 0 && sqld.questions.every((q) => q.certs?.includes("sqld")), `자격증(SQLD) 대비 ${sqld.questions.length}문제`);

  const hint = await call<{ hint: string }>("POST", "/hint", { questionId: plan.questions[0].id, level: 1 });
  check(hint.hint, "힌트 1단계");

  const traced = await call<{ correct: boolean; cells: { ok: boolean }[] }>("POST", "/attempts", {
    questionId: traceQ.id,
    answer: { type: "trace", values: rightValues },
    hintsUsed: 0,
    timeMs: 4000,
  });
  check(traced.correct && traced.cells.every((c) => c.ok), "흐름 따라가기: 실행 기록대로 적으면 정답 (따옴표 없이 써도)");
  const half = await call<{ correct: boolean; partial: boolean }>("POST", "/attempts", {
    questionId: traceQ.id,
    answer: { type: "trace", values: rightValues.map((v, i) => (i === rightValues.length - 1 ? "틀린 값" : v)) },
  });
  check(rightValues.length < 2 || (!half.correct && half.partial), "흐름 따라가기: 일부만 맞으면 부분 정답");

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
  check(concepts.items.length >= 20, `탐색 콘텐츠 ${concepts.items.length}개`);

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
    // 관리자 맞춤 생성: 개수 2 + 요청 내용 → 뒤에서 차례로 생성, 기록에 요청 내용이 보임
    const batch = await call<{ status: string; started: number }>("POST", "/admin/generate", { concept: "map", level: 3, count: 2, instructions: "쇼핑몰 장바구니 데이터로 만들어 주세요" });
    check(batch.status === "started" && batch.started === 2, "맞춤 생성 2개 시작");
    await Promise.all(tasks);
    const batchJobs = (await call<{ jobs: { reason: string; status: string }[] }>("GET", "/admin/overview")).jobs.filter((j) => j.reason.includes("장바구니"));
    check(batchJobs.length === 2 && batchJobs.some((j) => j.reason.includes("2/2")), `맞춤 생성 기록 2개 (${batchJobs.map((j) => j.status).join(", ")})`);
    // 개념 문제 AI 생성: 교차 검수(목업은 마지막 문제를 일부러 다르게 풂) → 승인 대기 → 관리자 승인 뒤에만 학습자에게
    const before = (await call<{ questions: PublicQuestion[] }>("POST", "/session", { level: 2, track: "theory", concept: "net-dns", size: 20 })).questions.length;
    const tgen = await call<{ status: string; itemId: string; report: { checks: { name: string; pass: boolean }[] } }>("POST", "/admin/generate", { concept: "net-dns", level: 2 });
    check(tgen.status === "pending", `개념 문제 AI 생성 → 승인 대기 (${tgen.status})`);
    check(tgen.report.checks.some((c) => c.name.includes("AI 교차 풀이") && !c.pass), "교차 풀이가 다른 답을 고른 문제는 빠짐");
    const notYet = (await call<{ questions: PublicQuestion[] }>("POST", "/session", { level: 2, track: "theory", concept: "net-dns", size: 20 })).questions.length;
    check(notYet === before, "승인 전에는 학습자에게 나가지 않음");
    const detail = await call<{ questions: { id: string }[] }>("GET", `/admin/item?id=${tgen.itemId}`);
    const approved = await call<{ status: string; questions: number }>("POST", "/admin/review", { itemId: tgen.itemId, decision: "approve", removeQuestionIds: [detail.questions[0].id] });
    check(approved.status === "published" && approved.questions === detail.questions.length - 1, `한 문제는 빼고 ${approved.questions}문제 승인`);
    const afterApprove = (await call<{ questions: PublicQuestion[] }>("POST", "/session", { level: 2, track: "theory", concept: "net-dns", size: 20 })).questions.length;
    check(afterApprove === before + approved.questions, `승인하면 학습자에게 나감 (${before} → ${afterApprove}문제)`);
    const tgen2 = await call<{ itemId: string }>("POST", "/admin/generate", { concept: "sec-auth", level: 2 });
    check((await call<{ status: string }>("POST", "/admin/review", { itemId: tgen2.itemId, decision: "reject" })).status === "rejected", "개념 문제 반려");

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

  // 관리자 코드: 화면에서 정한 코드만 통과, 틀리면 401, 10번 틀리면 잠시 막힘
  const status = async (path: string, token?: string) =>
    (await handle({ method: "GET", path, query: new URLSearchParams(), headers: token ? { "x-admin-token": token } : {}, body: undefined }, background)).status;
  await call("POST", "/admin/code", { code: "smoke-code-1234" });
  check((await status("/admin/overview")) === 401, "관리자 코드 설정 후 코드 없이는 401");
  check((await status("/admin/overview", "wrong-code")) === 401, "틀린 관리자 코드는 401");
  check((await status("/admin/overview", "smoke-code-1234")) === 200, "새 관리자 코드로 접근");
  for (let i = 0; i < 10; i++) await status("/admin/overview", "wrong-code");
  check((await status("/admin/overview", "smoke-code-1234")) === 429, "10번 틀리면 잠시 막힘 (맞는 코드도)");

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

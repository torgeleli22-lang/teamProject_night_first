/**
 * Lambda 전체 흐름 점검:  npm run smoke
 * 로컬 DynamoDB 흉내 서버 + Python Lambda 들(npm run api 와 같음)을 띄우고, 화면이 보내는 요청을 차례로 보내 본다.
 * AI 는 목업(AI_MODE=mock)이라 비용이 없다.
 */
import fs from "node:fs";
import { startLocalApi } from "./local-api.mjs";

const api = await startLocalApi({ port: 18000 + Math.floor(Math.random() * 1000), quiet: !process.env.SMOKE_LOG, env: { AI_MODE: "mock", MOCK_DELAY_SEC: "0", CONTENT_CHECK_SEC: "0" } });
const content = JSON.parse(fs.readFileSync("lambda/api/content.json", "utf8"));
const seedQuestions = content.seed.flatMap((s) => s.questions);

let sid = null;
async function call(method, path, body, headers = {}, expect = 200) {
  const res = await fetch(api.url + path, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(sid ? { "x-session-id": sid } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const next = res.headers.get("x-session-id");
  if (next) sid = next;
  const data = await res.json().catch(() => ({}));
  if (res.status !== expect) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}
const check = (cond, msg) => {
  if (!cond) throw new Error(`실패: ${msg}`);
  console.log(`✓ ${msg}`);
};
/** 뒤에서 실행 중인 Lambda(생성·분석)가 끝날 때까지 */
async function settle() {
  for (let i = 0; i < 300 && (await api.pending()) > 0; i++) await new Promise((r) => setTimeout(r, 100));
}
function answerFor(q) {
  if (q.type === "multiple_choice" || q.type === "fill_blank") return { type: q.type, index: 0 };
  if (q.type === "predict_output") return { type: q.type, text: "1" };
  if (q.type === "short_answer") return { type: q.type, text: "filter 는 조건에 맞는 요소만 골라서 새 배열을 만들어요" };
  return { type: q.type, values: (q.trace ?? []).map(() => "0") };
}

try {
  // ── 학습자·학습 화면 (my_page.py)
  const health = await call("GET", "/health");
  check(health.db === "dynamodb" && health.ai === "mock", "연결 확인");
  const me = await call("GET", "/me");
  check(sid && me.nickname, `세션 발급 + 닉네임 (${me.nickname})`);
  const firstSid = sid;
  await call("GET", "/me");
  check(sid === firstSid, "같은 세션 유지");
  const learn = await call("GET", "/learn");
  check(learn.recommendedConcept, `학습 탭 (추천 개념 ${learn.recommendedConcept})`);

  // ── 문제 고르기 (questions)
  const plan = await call("POST", "/session", { level: 3, track: "code", concept: "filter", mode: "learn" });
  check(plan.track === "code" && plan.questions.length > 0, `코드 학습 filter 세트 ${plan.questions.length}문제`);
  check(plan.questions[0].stage === "overview" && plan.questions.every((q) => q.code && q.stage), "코드 학습은 훑어보기부터");
  check(plan.questions.every((q) => !("answerIndex" in q) && !("explanation" in q) && !("rows" in q)), "정답·해설이 응답에 없음");
  const ORDER = ["overview", "trace", "key", "wrapup"];
  check(
    plan.questions.every((q, i) => i === 0 || q.codeItemId !== plan.questions[i - 1].codeItemId || ORDER.indexOf(q.stage) >= ORDER.indexOf(plan.questions[i - 1].stage)),
    "단계 순서: 훑어보기 → 흐름 따라가기 → 핵심 줄 → 정리",
  );
  const lesson = await call("POST", "/session", { level: 2, track: "code", ids: ["cart-overview", "cart-trace", "cart-loop-count"] });
  check(lesson.questions.map((q) => q.stage).join(",") === "overview,trace,key", "다시 풀기(ids): 장바구니 코드 3문제");
  const traceQ = lesson.questions.find((q) => q.type === "trace");
  const traceSeed = seedQuestions.find((x) => x.id === traceQ.id);
  const rightValues = traceSeed.rows.map((r) => r.value.replace(/^'|'$/g, ""));
  check(traceQ.trace.length === rightValues.length && !JSON.stringify(traceQ.trace).includes("value"), `흐름 따라가기 칸 ${rightValues.length}개 (정답 없이)`);

  const theory = await call("POST", "/session", { level: 2, track: "theory", unit: 11, mode: "learn" });
  check(theory.track === "theory" && theory.questions.length === 10, `개념 학습 네트워크 ${theory.questions.length}문제`);
  check(theory.questions.every((q) => !q.code && q.type === "multiple_choice" && q.choices.length === 4 && q.certs?.length), "개념 문제는 코드 없는 4지선다 + 자격증 태그");
  const sqld = await call("POST", "/session", { level: 3, track: "theory", concept: "all", cert: "SQLD", mode: "learn" });
  check(sqld.questions.length > 0 && sqld.questions.every((q) => q.certs.includes("sqld")), `자격증(SQLD) 대비 ${sqld.questions.length}문제`);
  const hint = await call("POST", "/hint", { questionId: plan.questions[0].id, level: 1 });
  check(hint.hint, "힌트 1단계");
  await call("POST", "/hint", { questionId: plan.questions[0].id, level: 4 }, {}, 400);
  check(true, "없는 힌트 단계는 400");

  // ── 채점 (submit_answer.py)
  const tq = theory.questions[0];
  const original = seedQuestions.find((x) => x.id === tq.id);
  const rightText = original.choices[original.answerIndex].text;
  const graded = await call("POST", "/attempts", { questionId: tq.id, answer: { type: "multiple_choice", index: tq.choices.indexOf(rightText) }, hintsUsed: 0, timeMs: 3000 });
  check(graded.correct && tq.choices[graded.answerIndex] === rightText, "섞인 보기에서 정답을 고르면 정답 (정답 표시도 화면 순서)");
  const traced = await call("POST", "/attempts", { questionId: traceQ.id, answer: { type: "trace", values: rightValues }, hintsUsed: 0, timeMs: 4000 });
  check(traced.correct && traced.cells.every((c) => c.ok), "흐름 따라가기: 실행 기록대로 적으면 정답 (따옴표 없이 써도)");
  const half = await call("POST", "/attempts", { questionId: traceQ.id, answer: { type: "trace", values: rightValues.map((v, i) => (i === rightValues.length - 1 ? "틀린 값" : v)) } });
  check(rightValues.length < 2 || (!half.correct && half.partial), "흐름 따라가기: 일부만 맞으면 부분 정답");
  for (const q of plan.questions) {
    const r = await call("POST", "/attempts", { questionId: q.id, answer: answerFor(q), hintsUsed: 0, timeMs: 5000 });
    check(typeof r.xp === "number" && r.correctAnswer && r.steps.length, `채점: ${q.type} (${r.tutor.source}, ${r.gradedBy})`);
  }
  await call("POST", "/attempts", { questionId: plan.questions[0].id, giveUp: true });
  check(true, "정답 보기(포기) 기록");
  await call("POST", "/attempts", { questionId: plan.questions[0].id }, {}, 400);
  check(true, "답 없이 제출하면 400");
  const sa = plan.questions.find((q) => q.type === "short_answer");
  if (sa) {
    const ex = await call("POST", "/explain", { questionId: sa.id, text: "조건에 맞는 것만 골라요" });
    check(ex.verdict && ex.gradedBy === "ai", `주관식 AI 분석(목업): ${ex.verdict}`);
  }

  // ── 복습·내 학습·탐색
  const review = await call("POST", "/session", { level: 3, mode: "review" });
  check(Array.isArray(review.questions), `복습 세트 ${review.questions.length}문제`);
  const reviewView = await call("GET", "/review");
  check(reviewView.wrong.length > 0, `오답 노트 ${reviewView.wrong.length}개`);
  const dash = await call("GET", "/dashboard");
  check(!dash.empty && dash.days.length === 1 && dash.badges.length > 0, "내 학습 (캘린더 1일, 배지)");
  const concepts = await call("GET", "/concepts");
  check(concepts.items.length >= 20 && concepts.items.every((i) => i.questions.every((q) => !("answerIndex" in q))), `탐색 콘텐츠 ${concepts.items.length}개`);

  // ── 학습자 분석: 새로 푼 문제가 10개 쌓이면 학습자 분석이 뒤에서 실행
  await settle();
  const dash2 = await call("GET", "/dashboard");
  check(dash2.attemptCount >= 10 && dash2.analysis?.result?.summary, `학습자 분석 저장 (${dash2.analysis?.source}, ${dash2.attemptCount}문제)`);

  // ── 튜터 대화 (tutor_chat.py)
  const ask1 = await call("POST", "/ask", { questionId: plan.questions[0].id, question: "어디부터 읽어야 할지 모르겠어요", solved: false });
  check(ask1.answer && ask1.chatId && ask1.source === "ai", "AI 튜터 질문(목업)");
  const ask2 = await call("POST", "/ask", { chatId: ask1.chatId, questionId: plan.questions[0].id, question: "다른 예시도 있어요?", solved: true, answerText: "1번" });
  check(ask2.chatId === ask1.chatId && ask2.answer, "같은 대화로 이어서 질문");

  // ── 랭킹 (다른 학습자 1명 더)
  await call("POST", "/me", { nickname: "테스트" });
  const mine = sid;
  sid = null;
  const other = await call("POST", "/session", { level: 2, track: "theory", concept: "net-dns" });
  await call("POST", "/attempts", { questionId: other.questions[0].id, answer: { type: "multiple_choice", index: 0 } });
  sid = mine;
  const ranking = await call("GET", "/ranking");
  check(ranking.total >= 2 && ranking.mine.rank >= 1 && ranking.top.some((r) => r.isMe && r.nickname === "테스트"), `랭킹 ${ranking.mine.rank}등 / ${ranking.total}명`);
  check(ranking.top.every((r) => !("sk" in r) && !("id" in r)), "랭킹에 다른 사람 세션 id 없음");

  // ── 관리자 (admin) + 생성 (generate-code, generate-theory)
  const overview = await call("GET", "/admin/overview");
  check(Object.keys(overview.coverage).length > 10 && overview.mode === "mock", "관리자 개요");
  await call("POST", "/admin/auto", { enabled: false });
  check(!(await call("GET", "/admin/overview")).autoGeneration, "자동 생성 끄기");
  const sparse = await call("POST", "/session", { level: 1, concept: "variables", mode: "learn" });
  check(!sparse.generating, `자동 생성이 꺼지면 부족한 칸도 생성하지 않음 (기준 해당: ${sparse.generation?.decision.generate})`);
  await call("POST", "/admin/auto", { enabled: true });
  const auto = await call("POST", "/session", { level: 1, concept: "variables", mode: "learn" });
  check(auto.generating, `문제가 부족한 칸은 generate-code 를 부름 (${auto.generation.decision.reason})`);
  await settle();
  check((await call("POST", "/admin/stop", {})).stopped === 0, "생성 중지 (진행 중 없음)");

  const gen = await call("POST", "/admin/generate", { concept: "reduce", level: 4 });
  check(gen.status === "started", "AI 코드 생성(목업) 시작");
  await settle();
  const jobs = (await call("GET", "/admin/overview")).jobs;
  const reduceJob = jobs.find((j) => j.concept === "reduce");
  check(reduceJob && ["published", "rejected"].includes(reduceJob.status), `AI 코드 생성 결과: ${reduceJob?.status} (${reduceJob?.error ?? "실행 검증·검수 통과"})`);
  const batch = await call("POST", "/admin/generate", { concept: "map", level: 3, count: 2, instructions: "쇼핑몰 장바구니 데이터로 만들어 주세요" });
  check(batch.status === "started" && batch.started === 2, "맞춤 생성 2개 시작");
  await settle();
  const batchJobs = (await call("GET", "/admin/overview")).jobs.filter((j) => j.reason.includes("장바구니"));
  check(batchJobs.length === 2 && batchJobs.some((j) => j.reason.includes("2/2")), `맞춤 생성 기록 2개 (${batchJobs.map((j) => j.status).join(", ")})`);

  const before = (await call("POST", "/session", { level: 2, track: "theory", concept: "net-dns", size: 20 })).questions.length;
  await call("POST", "/admin/generate", { concept: "net-dns", level: 2 });
  await settle();
  const overview2 = await call("GET", "/admin/overview");
  const pendingItem = overview2.generated.find((g) => g.status === "pending");
  check(pendingItem, "개념 문제 AI 생성 → 승인 대기");
  check(pendingItem.validation.checks.some((c) => c.name.includes("AI 교차 풀이") && !c.pass), "교차 풀이가 다른 답을 고른 문제는 빠짐");
  const notYet = (await call("POST", "/session", { level: 2, track: "theory", concept: "net-dns", size: 20 })).questions.length;
  check(notYet === before, "승인 전에는 학습자에게 나가지 않음");
  const detail = await call("GET", `/admin/item?id=${pendingItem.id}`);
  const approved = await call("POST", "/admin/review", { itemId: pendingItem.id, decision: "approve", removeQuestionIds: [detail.questions[0].id] });
  check(approved.status === "published" && approved.questions === detail.questions.length - 1, `한 문제는 빼고 ${approved.questions}문제 승인`);
  const afterApprove = (await call("POST", "/session", { level: 2, track: "theory", concept: "net-dns", size: 20 })).questions.length;
  check(afterApprove === before + approved.questions, `승인하면 학습자에게 나감 (${before} → ${afterApprove}문제)`);

  const fill = await call("POST", "/admin/fill?limit=2");
  await settle();
  const fillJobs = (await call("GET", "/admin/overview")).jobs.filter((j) => j.trigger === "launch_fill");
  check(fill.started === 2 && fillJobs.length === 2, `출시 전 채우기: ${fill.started}칸 (${fillJobs.map((j) => j.status).join(", ")} — 목업 예시가 없는 개념은 실패가 정상)`);
  // 여러 개 만드는 중 '전부 중지' → 진행 중인 것은 중지, 남은 것은 만들지 않음
  const many = await call("POST", "/admin/generate", { concept: "for", level: 2, count: 3, instructions: "중지 시험" });
  for (let i = 0; i < 100 && !(await call("GET", "/admin/overview")).jobs.some((j) => j.reason.includes("중지 시험")); i++) await new Promise((r) => setTimeout(r, 50));
  const stopped = await call("POST", "/admin/stop", {});
  await settle();
  const stopJobs = (await call("GET", "/admin/overview")).jobs.filter((j) => j.reason.includes("중지 시험"));
  check(many.started === 3 && stopJobs.length < 3 && stopJobs.every((j) => j.status !== "running"), `생성 도중 전부 중지: 3개 중 ${stopJobs.length}개만 시작 (${stopJobs.map((j) => j.status).join(", ")}, 중지 ${stopped.stopped}개)`);

  const exported = await call("GET", "/admin/export");
  check(exported.format === "codereading-export/2" && exported.items.length >= 3, `내보내기 (AI 콘텐츠 ${exported.items.length}개)`);
  const imported = await call("POST", "/admin/import", exported);
  check(imported.items === exported.items.length, "가져오기");

  // ── 관리자 코드: 정한 코드만 통과, 틀리면 401, 10번 틀리면 잠시 막힘
  await call("POST", "/admin/code", { code: "smoke-code-1234" });
  await call("GET", "/admin/overview", undefined, {}, 401);
  check(true, "관리자 코드 설정 후 코드 없이는 401");
  await call("GET", "/admin/overview", undefined, { "x-admin-token": "wrong-code" }, 401);
  await call("GET", "/admin/overview", undefined, { "x-admin-token": "smoke-code-1234" }, 200);
  check(true, "새 관리자 코드로 접근");
  for (let i = 0; i < 10; i++) await fetch(`${api.url}/admin/overview`, { headers: { "x-admin-token": "wrong-code" } });
  await call("GET", "/admin/overview", undefined, { "x-admin-token": "smoke-code-1234" }, 429);
  check(true, "10번 틀리면 잠시 막힘 (맞는 코드도)");

  // ── 초기화·세션 교체
  await call("POST", "/me", { reset: true });
  check((await call("GET", "/dashboard")).empty, "기록 초기화");
  sid = "11111111-1111-1111-1111-111111111111";
  await call("GET", "/me");
  check(sid !== "11111111-1111-1111-1111-111111111111", "모르는 세션 id 는 새 세션으로 교체");
  const pre = await fetch(`${api.url}/session`, { method: "OPTIONS" });
  check(pre.status === 204 && pre.headers.get("access-control-allow-headers")?.includes("x-session-id"), "CORS 사전 요청(OPTIONS)");

  console.log("\n모든 Lambda 흐름 점검 통과");
  api.stop();
  process.exit(0);
} catch (e) {
  console.error(e);
  api.stop();
  process.exit(1);
}

/**
 * Lambda 전체 흐름 점검:  npm run smoke
 * 로컬 DynamoDB 흉내 서버 + Python Lambda(npm run api 와 같음)를 띄우고, 화면이 보내는 요청을 차례로 보내 본다.
 * AI 는 목업(AI_MODE=mock)이라 비용이 없다.
 */
import { BatchWriteItemCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { startLocalApi } from "./local-api.mjs";

const api = await startLocalApi({ port: 18000 + Math.floor(Math.random() * 1000), quiet: !process.env.SMOKE_LOG, env: { AI_MODE: "mock", MOCK_DELAY_SEC: "0" } });

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
const PRIVATE = ["explanation", "keywords", "why"];
const noAnswers = (codeItem) => codeItem.marks.every((m) => PRIVATE.every((k) => !(k in m)));

try {
  // ── 연결 확인
  const health = await call("GET", "/health");
  check(health.ok && health.mode === "mock" && health.maxCodeLines === 300 && health.regenLimit === 5, "연결 확인 (300줄 · 다시 만들기 5번)");

  // ── 주제 고르기 (topics.py)
  const random = await call("GET", "/topic/random");
  check(sid && random.topic, `세션 발급 + 랜덤 주제 (${random.topic})`);
  const ok = await call("POST", "/topic/check", { level: 2, text: "주차 요금 계산" });
  check(ok.verdict === "ok" && ok.topic, "직접 적은 주제: 바로 진행");
  const vague = await call("POST", "/topic/check", { level: 1, text: "아무거나" });
  check(vague.verdict === "vague" && vague.suggestions.length === 3, "막연한 주제: 제안 3개");
  const big = await call("POST", "/topic/check", { level: 1, text: "쇼핑몰 만들기" });
  check(big.verdict === "too_big" && big.suggestions.length > 0, "너무 큰 주제: 좁힌 주제 제안");
  const bad = await call("POST", "/topic/check", { level: 1, text: "해킹 도구" });
  check(bad.verdict === "inappropriate" && bad.suggestions.length === 0, "부적절한 주제: 만들지 않음");
  await call("POST", "/topic/check", { level: 1, text: "가".repeat(51) }, {}, 400);
  check(true, "주제 50자 넘으면 400");

  // ── 고급 (4단계): 알고리즘용 랜덤 주제, 100~200줄, ※ 5곳
  const advTopic = await call("GET", "/topic/random?level=4");
  const adv = await call("POST", "/practice", { level: 4, topic: advTopic.topic });
  const advLines = adv.code.split("\n").length;
  check(adv.levelName === "고급" && advLines >= 100 && advLines <= 200 && adv.marks.length === 5, `고급 코드 (${advTopic.topic} → ${adv.title}, ${advLines}줄, ※ ${adv.marks.length}곳)`);

  // ── 연습 모드 (practice.py)
  const codeItem = await call("POST", "/practice", { level: 2, topic: "편의점 재고" });
  check(codeItem.codeId && codeItem.code && codeItem.marks.length >= 2 && codeItem.levelName === "초급", `연습 코드 (${codeItem.title}, ※ ${codeItem.marks.length}곳)`);
  check(noAnswers(codeItem), "모범 설명·핵심 표현이 응답에 없음");
  check(codeItem.regenLeft === 5, "다시 만들기 5번 남음");
  const easier = await call("POST", "/practice/adjust", { codeId: codeItem.codeId, direction: "easier", reasons: ["too_long"] });
  check(easier.level === 1 && easier.regenLeft === 4, "더 쉽게 → 입문, 4번 남음");
  let last = easier;
  for (let i = 0; i < 4; i++) last = await call("POST", "/practice/adjust", { codeId: last.codeId, direction: "harder", reasons: [] });
  check(last.regenLeft === 0, "다섯 번 다시 만들기");
  await call("POST", "/practice/adjust", { codeId: last.codeId, direction: "harder" }, {}, 429);
  check(true, "여섯 번째는 429");

  // ── JavaScript 연습 (같은 흐름, 언어만 다름)
  const js = await call("POST", "/practice", { level: 3, topic: "회사 조직도", language: "javascript" });
  check(js.language === "javascript" && js.code.includes("console.log") && js.marks.length >= 2 && noAnswers(js), `JavaScript 연습 코드 (${js.title}, ※ ${js.marks.length}곳)`);
  const jsEasier = await call("POST", "/practice/adjust", { codeId: js.codeId, direction: "easier" });
  check(jsEasier.language === "javascript" && jsEasier.level === 2, "JavaScript 코드는 더 쉽게 해도 JavaScript");
  const jsReview = await call("POST", "/review", { codeId: js.codeId, memos: [{ start: js.marks[0].start, end: js.marks[0].end, text: "아래 팀마다 자기 자신을 다시 불러 인원을 더해요" }] });
  check(jsReview.items.length === js.marks.length && jsReview.items.every((e) => e.concept), "JavaScript 코드 첨삭");
  await call("POST", "/practice", { level: 1, topic: "x", language: "cobol" }, {}, 400);
  check(true, "지원하지 않는 언어는 400");

  // ── 빨간펜 첨삭 (review.py)
  const m = codeItem.marks;
  const result = await call("POST", "/review", {
    codeId: codeItem.codeId,
    memos: [{ start: m[0].start, end: m[0].end, text: "재고 수를 보고 상태를 글자로 돌려줘요" }],
  });
  const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
  check(total === m.length && result.counts.missing === m.length - 1, `첨삭 ○${result.counts.correct} △${result.counts.partial} ✕${result.counts.wrong} 빈칸${result.counts.missing}`);
  check(result.items.every((e) => e.comment && "model" in e), "항목마다 코멘트 + 모범 설명 (첨삭 뒤)");
  const empty = await call("POST", "/review", { codeId: codeItem.codeId, memos: [] });
  check(empty.counts.missing === m.length, "메모 없이 제출해도 첨삭 (모두 빈칸)");
  // ── 힌트 보고 다시 써 보기 (review.py): 항목 하나만 다시 채점, 3번까지, 다시 열면 기록이 남아 있음
  const missingIndex = result.items.findIndex((e) => e.kind === "missing");
  const r1 = await call("POST", "/review/retry", { codeId: codeItem.codeId, item: missingIndex, text: "조건을 보고 결과를 돌려줘요" });
  check(r1.attempts.length === 1 && ["correct", "partial", "wrong"].includes(r1.attempts[0].mark) && r1.attempts[0].comment && r1.left === 2,
    `빈칸 항목을 다시 써서 다시 채점 (${r1.attempts[0].mark})`);
  await call("POST", "/review/retry", { codeId: codeItem.codeId, item: missingIndex, text: "두 번째" });
  await call("POST", "/review/retry", { codeId: codeItem.codeId, item: missingIndex, text: "세 번째" });
  await call("POST", "/review/retry", { codeId: codeItem.codeId, item: missingIndex, text: "네 번째" }, {}, 429);
  await call("POST", "/review/retry", { codeId: codeItem.codeId, item: missingIndex, text: "  " }, {}, 400);
  check(true, "다시 쓰기 3번까지 · 빈 글 400");
  const withRetry = await call("GET", `/code?codeId=${codeItem.codeId}`);
  check(withRetry.retries[String(missingIndex)]?.attempts.length === 3 && withRetry.retries[String(missingIndex)].left === 0, "다시 열면 다시 쓴 기록이 남아 있음");

  // ── 내 공부 (study.py): 첨삭·다시 쓰기가 기록되고 개념별로 모임
  const studied = await call("GET", "/study");
  check(studied.summary.codes >= 1 && studied.concepts.items.length === 8 && studied.levels.byLevel.length === 4, `내 공부 기록 (코드 ${studied.summary.codes}개, 항목 ${studied.summary.items}개)`);
  check(result.items.every((e) => e.concept), "첨삭 항목마다 개념 꼬리표");
  const focused = await call("POST", "/practice", { level: 2, topic: "편의점 재고", focus: "loop_update" });
  check(focused.focus === "loop_update", "약한 개념 집중 연습 코드");
  await call("POST", "/practice", { level: 2, topic: "x", focus: "없는개념" }, {}, 400);

  // ── AI 튜터 (tutor_chat.py): 첨삭 항목마다 대화, 10번까지, 다시 열면 대화가 남아 있음
  const t1 = await call("POST", "/tutor", { codeId: codeItem.codeId, item: 0, message: "왜 이렇게 판정했나요?" });
  check(t1.turns.length === 2 && t1.turns[1].role === "tutor" && t1.turns[1].text && t1.turnsLeft === 9, "튜터에게 묻기 → 답");
  for (let i = 0; i < 9; i++) await call("POST", "/tutor", { codeId: codeItem.codeId, item: 0, message: `더 알려 주세요 ${i}` });
  await call("POST", "/tutor", { codeId: codeItem.codeId, item: 0, message: "한 번 더" }, {}, 429);
  check(true, "메모 하나에 질문 10번까지");
  await call("POST", "/tutor", { codeId: codeItem.codeId, item: 99, message: "?" }, {}, 404);
  await call("POST", "/tutor", { codeId: codeItem.codeId, item: 0, message: "   " }, {}, 400);
  check(true, "없는 항목 404 · 빈 질문 400");
  const withChat = await call("GET", `/code?codeId=${codeItem.codeId}`);
  check(withChat.chats["0"]?.turns.length === 20 && withChat.chats["0"].turnsLeft === 0, "다시 열면 튜터 대화가 남아 있음");

  const again = await call("GET", `/code?codeId=${codeItem.codeId}`);
  check(again.codeItem.codeId === codeItem.codeId && again.review?.counts && noAnswers(again.codeItem), "같은 코드 다시 읽기 + 마지막 첨삭");

  // ── 다른 학습자는 내 코드를 못 봄
  const mySid = sid;
  sid = null;
  await call("GET", `/code?codeId=${codeItem.codeId}`, undefined, {}, 404);
  check(sid && sid !== mySid, "다른 학습자는 404");
  sid = mySid;

  // ── 내 코드 점검 (inspect_code.py)
  const userCode = [
    'API_KEY = "abcd1234efgh5678"',
    "",
    "def check_stock(n):",
    "    if n == 0:",
    '        return "품절"',
    '    return "있음"',
    "",
    "def sell(stock, qty):",
    "    if qty > stock:",
    "        return stock",
    "    return stock - qty",
  ].join("\n");
  const look = await call("POST", "/inspect", { code: userCode, filename: "shop.py" });
  check(look.masked.length === 1 && !look.code.includes("abcd1234") && look.functions.length === 2, `민감 정보 가리기 + 함수 ${look.functions.length}개`);
  await call("POST", "/inspect", { code: "console.log(1)", filename: "a.js" }, {}, 400);
  await call("POST", "/inspect", { code: "x = 1\n".repeat(301), filename: "a.py" }, {}, 400);
  check(true, "JS 파일·300줄 넘는 코드는 400");
  const inspected = await call("POST", "/inspect/start", { code: userCode, filename: "shop.py", functions: ["sell"] });
  check(inspected.source === "inspect" && inspected.levelName && inspected.levelReason && inspected.marks.length >= 1, `점검 시작 (난이도 ${inspected.levelName})`);
  check(inspected.marks.every((mk) => mk.start >= 8) && !inspected.code.includes("abcd1234") && noAnswers(inspected), "고른 함수 안에만 ※ + 가린 코드로 저장");
  await call("POST", "/practice/adjust", { codeId: inspected.codeId, direction: "easier" }, {}, 400);
  check(true, "점검 코드는 난이도 바꾸기 없음");
  const inspectReview = await call("POST", "/review", { codeId: inspected.codeId, memos: [{ start: 8, end: 11, text: "팔 수 없으면 그대로" }] });
  check(inspectReview.items.length >= 1, "점검 코드도 같은 첨삭");

  // ── 로그인 (auth.py): 로컬 가짜 로그인으로 흐름 확인 — 이 탭의 기록이 계정으로 옮겨지고, 로그아웃하면 새 학습자
  const meBefore = await call("GET", "/me");
  check(meBefore.member === false && meBefore.providers.google && meBefore.providers.github, "로그인 전: 로그인 안 한 학습자");
  const anonSid = sid;
  const back = "http://localhost:3000/study/";
  const startRes = await fetch(`${api.url}/auth/start?provider=github&return=${encodeURIComponent(back)}&sid=${anonSid}`, { redirect: "manual" });
  check(startRes.status === 302, "로그인 시작 → 로그인 화면으로 (302)");
  const cb = await fetch(startRes.headers.get("location"), { redirect: "manual" });
  const landing = cb.headers.get("location") || "";
  check(cb.status === 302 && landing.startsWith(back + "#login="), "로그인 콜백 → 화면으로 돌아가며 로그인 토큰");
  const token = new URLSearchParams(landing.split("#")[1]).get("login");
  sid = token;
  const meAfter = await call("GET", "/me");
  check(meAfter.member === true && meAfter.name === "로컬 테스트" && sid === token, "로그인 학습자 (응답 헤더는 계정 id 가 아니라 로그인 토큰)");
  const studyAfter = await call("GET", "/study");
  check(studyAfter.summary.codes >= 1, `로그인 전 기록이 계정으로 옮겨짐 (코드 ${studyAfter.summary.codes}개)`);
  await call("GET", `/code?codeId=${codeItem.codeId}`);
  check(true, "로그인 전에 받은 코드도 계속 열림");
  const evil = await fetch(`${api.url}/auth/start?provider=google&return=${encodeURIComponent("https://evil.example/steal")}`, { redirect: "manual" });
  check(evil.status === 400, "허용하지 않은 화면 주소로는 돌려보내지 않음");
  const replay = await fetch(startRes.headers.get("location"), { redirect: "manual" });
  check(replay.status === 400, "같은 로그인 요청(state)은 한 번만");
  await call("POST", "/auth/logout", {});
  await call("GET", "/me");
  check(sid !== token, "로그아웃하면 토큰이 지워지고 새 학습자");

  // ── 관리자 (admin.py): AI 끄기 → 예시 코드·규칙 판정
  const overview = await call("GET", "/admin/overview");
  check(overview.aiSwitch === true && overview.days[0].practices >= 1 && overview.usage.length > 0, `관리자 현황 (오늘 연습 ${overview.days[0].practices}번, AI 작업 ${overview.usage.length}종)`);
  check(overview.usage.every((u) => u.current && u.taskName && u.description && u.calls === u.successes + u.failures), "작업별 사용량: 이름·설명·성공/실패");
  check(overview.recent.length > 0 && overview.recent.every((r) => r.taskName && typeof r.ok === "boolean"), `최근 AI 호출 기록 ${overview.recent.length}건`);
  await call("POST", "/admin/ai", { enabled: false });
  const offCode = await call("POST", "/practice", { level: 1, topic: "카페 주문" });
  check(offCode.note && offCode.marks.length >= 2, "AI 끄면 예시 코드");
  check((await call("GET", "/health")).ai === false, "AI 꺼짐 표시");
  await call("POST", "/admin/ai", { enabled: true });
  check((await call("GET", "/admin/overview")).aiSwitch === true, "AI 다시 켜기");

  // ── 예전 키 이름 → 새 키 이름 옮기기 (POST /admin/migrate): 예전 이름으로 DB 에 직접 넣고 옮긴 뒤 화면 요청으로 확인
  const oldUser = "0f0f0f0f-1111-4222-8333-444455556666";
  const oldCode = "0e0e0e0e-1111-4222-8333-444455556666";
  const ttl = Math.floor(Date.now() / 1000) + 86400;
  const oldItems = [
    { pk: "LEARNER", sk: oldUser, level: 1, recentTopics: ["카페 주문"], createdAt: 1, lastSeen: Date.now(), jojo_ttl: ttl },
    { pk: `READ#${oldCode}`, sk: "CODE", id: oldCode, owner: oldUser, source: "practice", language: "python", level: 1, topic: "카페 주문",
      title: "예전 코드", code: "total = 0\nfor x in [1, 2]:\n    total += x\nprint(total)", rootId: oldCode, regenCount: 0, createdAt: 1,
      marks: [{ id: "m1", start: 2, end: 3, why: "w", explanation: "e", keywords: ["k"], concept: "loop_update" }], jojo_ttl: ttl },
    { pk: `READ#${oldCode}`, sk: "REVIEW#0000000000000100", memos: [], createdAt: 1, jojo_ttl: ttl,
      result: { readingId: oldCode, summary: "예전 첨삭", counts: { correct: 0, partial: 0, wrong: 0, missing: 1 }, byAi: false, createdAt: 1,
                items: [{ kind: "missing", start: 2, end: 3, marked: true, memo: "", mark: "missing", comment: "c", lookAt: [2], model: "e", concept: "loop_update" }] } },
    { pk: `READ#${oldCode}`, sk: "CHAT#0000000000000100#000", turns: [{ role: "user", text: "q", lookAt: [], at: 1 }, { role: "tutor", text: "a", lookAt: [], at: 1 }], jojo_ttl: ttl },
    { pk: `READ#${oldCode}`, sk: "RETRY#0000000000000100#000", attempts: [{ text: "t", mark: "partial", comment: "c", lookAt: [], byAi: false, at: 1 }], jojo_ttl: ttl },
    { pk: `STUDY#${oldUser}`, sk: `R#${oldCode}`, readingId: oldCode, source: "practice", level: 1, title: "예전 코드", reviews: 1, reviewedAt: 1,
      counts: { correct: 0, partial: 0, wrong: 0, missing: 1 }, items: [], jojo_ttl: ttl },
  ];
  const toAttr = (v) =>
    typeof v === "string" ? { S: v } : typeof v === "number" ? { N: String(v) } : typeof v === "boolean" ? { BOOL: v } : v === null ? { NULL: true }
      : Array.isArray(v) ? { L: v.map(toAttr) } : { M: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toAttr(x)])) };
  const db = new DynamoDBClient({ region: "ap-northeast-2", endpoint: api.dbUrl, credentials: { accessKeyId: "local", secretAccessKey: "local" } });
  await db.send(new BatchWriteItemCommand({ RequestItems: { jojo_table: oldItems.map((i) => ({ PutRequest: { Item: toAttr(i).M } })) } }));
  const moved = await call("POST", "/admin/migrate", {});
  check(moved.moved >= oldItems.length, `예전 이름 항목 옮기기 (${moved.moved}개 옮김, ${moved.removed}개 지움)`);
  const migrated = await call("GET", `/code?codeId=${oldCode}`, undefined, { "x-session-id": oldUser });
  check(migrated.codeItem.title === "예전 코드" && migrated.review?.summary === "예전 첨삭" && migrated.chats["0"]?.turns.length === 2 && migrated.retries["0"]?.attempts.length === 1,
    "옮긴 뒤에도 예전 학습자가 예전 코드·첨삭·튜터 대화·다시 쓰기를 그대로 엶");
  check((await call("GET", "/study", undefined, { "x-session-id": oldUser })).summary.codes === 1, "옮긴 뒤에도 예전 '내 공부' 기록이 보임");
  const oldStudy = await call("GET", "/study", undefined, { "x-session-id": oldUser });
  check(oldStudy.recent[0]?.codeId === oldCode, "옮긴 '내 공부' 기록의 readingId → codeId");
  // 키는 이미 새 이름인데 필드만 예전 이름인 항목 (learnerId → userId)
  const oldLogin = "0d0d0d0d-1111-4222-8333-444455556666";
  await db.send(new BatchWriteItemCommand({ RequestItems: { jojo_table: [{ PutRequest: { Item: toAttr({ pk: `LOGIN#${oldLogin}`, sk: "USER", learnerId: oldUser, provider: "google", createdAt: 1, jojo_ttl: ttl }).M } }] } }));
  check((await call("GET", "/study", undefined, { "x-session-id": oldLogin })).summary.codes === 0, "옮기기 전 예전 형식(learnerId) 토큰은 로그인으로 보지 않음 (오류 없이)");
  const renamed = await call("POST", "/admin/migrate", {});
  check(renamed.renamed >= 1 && renamed.moved === 0, `필드 이름만 예전인 항목 고치기 (${renamed.renamed}개)`);
  check((await call("GET", "/study", undefined, { "x-session-id": oldLogin })).summary.codes === 1, "고친 로그인 토큰이 userId 로 학습자를 찾음");
  const twice = await call("POST", "/admin/migrate", {});
  check(twice.moved === 0 && twice.renamed === 0, "다시 눌러도 더 옮길 것이 없음");

  // ── 관리자 코드: 정한 코드만 통과, 틀리면 401, 10번 틀리면 잠시 막힘
  await call("POST", "/admin/code", { code: "smoke-code-1234" });
  await call("GET", "/admin/overview", undefined, {}, 401);
  check(true, "관리자 코드 설정 후 코드 없이는 401");
  await call("GET", "/admin/overview", undefined, { "x-admin-token": "smoke-code-1234" }, 200);
  check(true, "새 관리자 코드로 접근");
  for (let i = 0; i < 10; i++) await fetch(`${api.url}/admin/overview`, { headers: { "x-admin-token": "wrong-code" } });
  await call("GET", "/admin/overview", undefined, { "x-admin-token": "smoke-code-1234" }, 429);
  check(true, "10번 틀리면 잠시 막힘 (맞는 코드도)");

  // ── 세션 교체·CORS
  sid = "11111111-1111-1111-1111-111111111111";
  await call("GET", "/topic/random");
  check(sid !== "11111111-1111-1111-1111-111111111111", "모르는 세션 id 는 새 세션으로 교체");
  const pre = await fetch(`${api.url}/practice`, { method: "OPTIONS" });
  check(pre.status === 204 && pre.headers.get("access-control-allow-headers")?.includes("x-session-id"), "CORS 사전 요청(OPTIONS)");

  console.log("\n모든 Lambda 흐름 점검 통과");
  api.stop();
  process.exit(0);
} catch (e) {
  console.error(e);
  api.stop();
  process.exit(1);
}

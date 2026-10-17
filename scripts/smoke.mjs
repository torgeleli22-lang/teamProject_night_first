/**
 * Lambda 전체 흐름 점검:  npm run smoke
 * 로컬 DynamoDB 흉내 서버 + Python Lambda(npm run api 와 같음)를 띄우고, 화면이 보내는 요청을 차례로 보내 본다.
 * AI 는 목업(AI_MODE=mock)이라 비용이 없다.
 */
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
const noAnswers = (reading) => reading.marks.every((m) => PRIVATE.every((k) => !(k in m)));

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
  const reading = await call("POST", "/practice", { level: 2, topic: "편의점 재고" });
  check(reading.id && reading.code && reading.marks.length >= 2 && reading.levelName === "초급", `연습 코드 (${reading.title}, ※ ${reading.marks.length}곳)`);
  check(noAnswers(reading), "모범 설명·핵심 표현이 응답에 없음");
  check(reading.regenLeft === 5, "다시 만들기 5번 남음");
  const easier = await call("POST", "/practice/adjust", { readingId: reading.id, direction: "easier", reasons: ["too_long"] });
  check(easier.level === 1 && easier.regenLeft === 4, "더 쉽게 → 입문, 4번 남음");
  let last = easier;
  for (let i = 0; i < 4; i++) last = await call("POST", "/practice/adjust", { readingId: last.id, direction: "harder", reasons: [] });
  check(last.regenLeft === 0, "다섯 번 다시 만들기");
  await call("POST", "/practice/adjust", { readingId: last.id, direction: "harder" }, {}, 429);
  check(true, "여섯 번째는 429");

  // ── 빨간펜 첨삭 (review.py)
  const m = reading.marks;
  const result = await call("POST", "/review", {
    readingId: reading.id,
    memos: [{ start: m[0].start, end: m[0].end, text: "재고 수를 보고 상태를 글자로 돌려줘요" }],
  });
  const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
  check(total === m.length && result.counts.missing === m.length - 1, `첨삭 ○${result.counts.correct} △${result.counts.partial} ✕${result.counts.wrong} 빈칸${result.counts.missing}`);
  check(result.items.every((e) => e.comment && "model" in e), "항목마다 코멘트 + 모범 설명 (첨삭 뒤)");
  const empty = await call("POST", "/review", { readingId: reading.id, memos: [] });
  check(empty.counts.missing === m.length, "메모 없이 제출해도 첨삭 (모두 빈칸)");
  // ── 힌트 보고 다시 써 보기 (review.py): 항목 하나만 다시 채점, 3번까지, 다시 열면 기록이 남아 있음
  const missingIndex = result.items.findIndex((e) => e.kind === "missing");
  const r1 = await call("POST", "/review/retry", { readingId: reading.id, item: missingIndex, text: "조건을 보고 결과를 돌려줘요" });
  check(r1.attempts.length === 1 && ["correct", "partial", "wrong"].includes(r1.attempts[0].mark) && r1.attempts[0].comment && r1.left === 2,
    `빈칸 항목을 다시 써서 다시 채점 (${r1.attempts[0].mark})`);
  await call("POST", "/review/retry", { readingId: reading.id, item: missingIndex, text: "두 번째" });
  await call("POST", "/review/retry", { readingId: reading.id, item: missingIndex, text: "세 번째" });
  await call("POST", "/review/retry", { readingId: reading.id, item: missingIndex, text: "네 번째" }, {}, 429);
  await call("POST", "/review/retry", { readingId: reading.id, item: missingIndex, text: "  " }, {}, 400);
  check(true, "다시 쓰기 3번까지 · 빈 글 400");
  const withRetry = await call("GET", `/reading?id=${reading.id}`);
  check(withRetry.retries[String(missingIndex)]?.attempts.length === 3 && withRetry.retries[String(missingIndex)].left === 0, "다시 열면 다시 쓴 기록이 남아 있음");

  // ── AI 튜터 (tutor_chat.py): 첨삭 항목마다 대화, 10번까지, 다시 열면 대화가 남아 있음
  const t1 = await call("POST", "/tutor", { readingId: reading.id, item: 0, message: "왜 이렇게 판정했나요?" });
  check(t1.turns.length === 2 && t1.turns[1].role === "tutor" && t1.turns[1].text && t1.turnsLeft === 9, "튜터에게 묻기 → 답");
  for (let i = 0; i < 9; i++) await call("POST", "/tutor", { readingId: reading.id, item: 0, message: `더 알려 주세요 ${i}` });
  await call("POST", "/tutor", { readingId: reading.id, item: 0, message: "한 번 더" }, {}, 429);
  check(true, "메모 하나에 질문 10번까지");
  await call("POST", "/tutor", { readingId: reading.id, item: 99, message: "?" }, {}, 404);
  await call("POST", "/tutor", { readingId: reading.id, item: 0, message: "   " }, {}, 400);
  check(true, "없는 항목 404 · 빈 질문 400");
  const withChat = await call("GET", `/reading?id=${reading.id}`);
  check(withChat.chats["0"]?.turns.length === 20 && withChat.chats["0"].turnsLeft === 0, "다시 열면 튜터 대화가 남아 있음");

  const again = await call("GET", `/reading?id=${reading.id}`);
  check(again.reading.id === reading.id && again.review?.counts && noAnswers(again.reading), "같은 코드 다시 읽기 + 마지막 첨삭");

  // ── 다른 학습자는 내 코드를 못 봄
  const mySid = sid;
  sid = null;
  await call("GET", `/reading?id=${reading.id}`, undefined, {}, 404);
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
  await call("POST", "/practice/adjust", { readingId: inspected.id, direction: "easier" }, {}, 400);
  check(true, "점검 코드는 난이도 바꾸기 없음");
  const inspectReview = await call("POST", "/review", { readingId: inspected.id, memos: [{ start: 8, end: 11, text: "팔 수 없으면 그대로" }] });
  check(inspectReview.items.length >= 1, "점검 코드도 같은 첨삭");

  // ── 관리자 (admin.py): AI 끄기 → 예시 코드·규칙 판정
  const overview = await call("GET", "/admin/overview");
  check(overview.aiSwitch === true && overview.days[0].practices >= 1 && overview.usage.length > 0, `관리자 현황 (오늘 연습 ${overview.days[0].practices}번, AI 작업 ${overview.usage.length}종)`);
  check(overview.usage.every((u) => u.current && u.taskName && u.description && u.calls === u.successes + u.failures), "작업별 사용량: 이름·설명·성공/실패");
  check(overview.recent.length > 0 && overview.recent.every((r) => r.taskName && typeof r.ok === "boolean"), `최근 AI 호출 기록 ${overview.recent.length}건`);
  await call("POST", "/admin/ai", { enabled: false });
  const offReading = await call("POST", "/practice", { level: 1, topic: "카페 주문" });
  check(offReading.note && offReading.marks.length >= 2, "AI 끄면 예시 코드");
  check((await call("GET", "/health")).ai === false, "AI 꺼짐 표시");
  await call("POST", "/admin/ai", { enabled: true });
  check((await call("GET", "/admin/overview")).aiSwitch === true, "AI 다시 켜기");

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

/**
 * Lambda 전체 흐름 점검:  npm run smoke
 * 로컬 DynamoDB 흉내 서버 + Lambda 3개(npm run api 와 같음)를 띄우고, 화면이 보내는 요청을 차례로 보내 본다.
 * AI 는 목업(AI_MODE=mock)이라 비용이 없다.
 */
import { startLocalApi } from "./local-api.mjs";

const ADMIN = "smoke-admin-code";
const api = await startLocalApi({
  port: 18000 + Math.floor(Math.random() * 1000),
  quiet: !process.env.SMOKE_LOG,
  env: { AI_MODE: "mock", MOCK_DELAY_SEC: "0", ADMIN_TOKEN: ADMIN },
});

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
// 채점 기준(검토 기록·모범 설명)은 읽는 동안 화면에 보내지 않는다
const PRIVATE = ["explanation", "keywords", "inputs", "steps", "result"];
const noAnswers = (c) => c.marks.every((m) => PRIVATE.every((k) => !(k in m))) && !("units" in c) && !("debug" in c);

try {
  // ── 연결 확인
  const health = await call("GET", "/health");
  check(health.ok && health.mode === "mock", "연결 확인 (목업 AI)");

  // ── 코드 만들기 (jojo_practice): 언어 2 × 난이도 3, 주제 랜덤·직접
  for (const language of ["python", "javascript"]) {
    for (const level of [1, 2, 3]) {
      const c = await call("POST", "/practice", { language, level });
      check(c.codeId && c.code && c.topic && c.marks.length >= 1 && c.level === level && c.language === language && noAnswers(c),
        `${language} ${c.levelName} (랜덤 주제 '${c.topic}' → ${c.title}, 설명할 곳 ${c.marks.length}곳)`);
    }
  }
  const codeItem = await call("POST", "/practice", { language: "python", level: 2, topic: "편의점 재고" });
  check(codeItem.topic === "편의점 재고", "직접 적은 주제");
  await call("POST", "/practice", { level: 2, topic: "해킹 도구" }, {}, 400);
  await call("POST", "/practice", { level: 2, topic: "가".repeat(51) }, {}, 400);
  await call("POST", "/practice", { level: 4 }, {}, 400);
  check(true, "부적절한 주제·50자 넘는 주제·없는 난이도는 400");

  // 관리자(실험): 단계별 기록을 함께 받는다. 틀린 코드는 403
  const dbg = await call("POST", "/practice", { language: "python", level: 1 }, { "x-admin-token": ADMIN });
  check(dbg.debug && dbg.debug.attempts.length >= 1 && dbg.debug.calls.length >= 2 && dbg.debug.units.length >= 1,
    `관리자: 단계별 기록 (AI 호출 ${dbg.debug.calls.map((c) => c.task).join("·")})`);
  await call("POST", "/practice", { level: 1 }, { "x-admin-token": "wrong" }, 403);
  check(true, "관리자 코드가 틀리면 403");

  // ── 채점 (jojo_review): 기준은 검토 기록
  const [m1, m2] = codeItem.marks;
  const result = await call("POST", "/review", { codeId: codeItem.codeId, memos: [{ start: m1.start, end: m1.end, text: "재고 상태를 하나씩 확인해서 글자로 알려 줘요" }] });
  check(result.items.length >= 1 && result.counts.missing === (m2 ? 1 : 0), `채점 (○${result.counts.correct} △${result.counts.partial} ✕${result.counts.wrong} ⬚${result.counts.missing})`);
  const memoItem = result.items.find((i) => i.kind === "memo");
  check(memoItem.model && Array.isArray(memoItem.trace), "채점 결과에 모범 설명·실행 기록");
  const again = await call("GET", `/code?codeId=${codeItem.codeId}`);
  check(again.codeItem.codeId === codeItem.codeId && again.review && noAnswers(again.codeItem), "코드 다시 열기 (마지막 채점 결과)");
  await call("POST", "/review", { codeId: codeItem.codeId, memos: [{ start: 999, end: 999, text: "x" }] }, {}, 400);
  check(true, "코드 밖의 줄은 400");

  // ── 로그인 (jojo_auth): 로컬 가짜 로그인 — 로그인 전에 받은 코드도 계속 열리고, 로그아웃하면 새 학습자
  const meBefore = await call("GET", "/me");
  check(meBefore.member === false && meBefore.providers.google, "로그인 전: 로그인 안 한 학습자");
  const back = "http://localhost:3000/practice/";
  const startRes = await fetch(`${api.url}/auth/start?provider=google&return=${encodeURIComponent(back)}&sid=${sid}`, { redirect: "manual" });
  check(startRes.status === 302, "로그인 시작 → 로그인 화면으로 (302)");
  const cb = await fetch(startRes.headers.get("location"), { redirect: "manual" });
  const landing = cb.headers.get("location") || "";
  check(cb.status === 302 && landing.startsWith(back + "#login="), "로그인 콜백 → 화면으로 돌아가며 로그인 토큰");
  sid = new URLSearchParams(landing.split("#")[1]).get("login");
  const meAfter = await call("GET", "/me");
  check(meAfter.member === true && meAfter.name === "로컬 테스트", "로그인 학습자");
  await call("GET", `/code?codeId=${codeItem.codeId}`);
  check(true, "로그인 전에 받은 코드도 계속 열림");
  const evil = await fetch(`${api.url}/auth/start?provider=google&return=${encodeURIComponent("https://evil.example/steal")}`, { redirect: "manual" });
  check(evil.status === 400, "허용하지 않은 화면 주소로는 돌려보내지 않음");
  const replay = await fetch(startRes.headers.get("location"), { redirect: "manual" });
  check(replay.status === 400, "같은 로그인 요청(state)은 한 번만");
  await call("POST", "/auth/logout", {});
  const meOut = await call("GET", "/me");
  check(meOut.member === false, "로그아웃");

  // ── 세션 교체·CORS
  sid = "11111111-1111-1111-1111-111111111111";
  await call("GET", "/me");
  check(sid !== "11111111-1111-1111-1111-111111111111", "모르는 세션 id 는 새 세션으로 교체");
  const pre = await fetch(`${api.url}/practice`, { method: "OPTIONS", headers: { origin: "http://localhost:3000", "access-control-request-method": "POST" } });
  check(pre.status === 204 && pre.headers.get("access-control-allow-headers")?.includes("x-session-id"), "CORS 사전 요청(OPTIONS)");

  console.log("\n모든 Lambda 흐름 점검 통과");
  api.stop();
  process.exit(0);
} catch (e) {
  console.error(e);
  api.stop();
  process.exit(1);
}

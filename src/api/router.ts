import { SessionLimitError, touchSession, type SessionInfo } from "../lib/server/session-repo";
import { detachedRunner, type BackgroundRunner } from "./background";
import { clientAddress, HttpError, type ApiRequest, type ApiResponse, type Ctx } from "./core";
import { hit, isAiRequest, LIMITS } from "./rate-limit";
import { ROUTES } from "./routes";

/** 세션 id 를 주고받는 헤더. 브라우저는 sessionStorage 에 보관해서 탭을 닫으면 사라진다 */
export const SESSION_HEADER = "x-session-id";

/**
 * 허용할 화면 주소 (CORS). ALLOWED_ORIGINS=https://아이디.github.io,http://localhost:3000
 * 비워 두면 어디서든 허용 (로컬 개발용)
 */
function corsHeaders(origin: string | undefined): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const allow = allowed.length === 0 ? "*" : origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": `content-type,${SESSION_HEADER},x-admin-token`,
    "access-control-expose-headers": SESSION_HEADER,
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

export async function handle(req: ApiRequest, background: BackgroundRunner = detachedRunner): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...corsHeaders(req.headers.origin), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  if (req.method === "OPTIONS") return { status: 204, headers, body: "" };

  const ip = clientAddress(req);
  const path = req.path.replace(/\/+$/, "") || "/";
  const sessionId = req.headers[SESSION_HEADER] ?? null;
  const state: { session: Promise<SessionInfo> | null } = { session: null };
  const ctx: Ctx = {
    req,
    // 새 학습자(세션)는 IP 당 1시간 한도 안에서만 만든다
    session: () => (state.session ??= touchSession(sessionId, () => hit(`new:${ip}`, LIMITS.newSessionsPerIpPerHour, 3600_000))),
    background,
  };

  const route = ROUTES[`${req.method} ${path}`];
  try {
    if (!route) throw new HttpError(404, "없는 API 예요.");
    // 관리자 API 는 따로 (코드 10번 틀리면 잠김) 막으므로 전체 요청 수에서 뺀다
    if (!path.startsWith("/admin") && !hit(`all:${ip}`, LIMITS.perIpPerMinute, 60_000)) {
      throw new HttpError(429, "요청이 너무 많아요. 1분 뒤에 다시 시도해 주세요.");
    }
    if (isAiRequest(req.method, path, req.body)) {
      const okSession = !sessionId || hit(`ai-s:${sessionId}`, LIMITS.aiPerSessionPerHour, 3600_000);
      if (!okSession || !hit(`ai-ip:${ip}`, LIMITS.aiPerIpPerHour, 3600_000)) {
        // 답 제출은 막지 않고 AI 없이 규칙으로만 채점한다
        if (path === "/attempts") ctx.aiLimited = true;
        else throw new HttpError(429, "AI 튜터를 잠깐 너무 많이 썼어요. 조금 쉬었다가(최대 1시간) 다시 물어봐 주세요. 그동안 힌트와 해설은 그대로 볼 수 있어요.");
      }
    }
    const body = await route(ctx);
    // 세션을 새로 만들었거나 확인했으면 브라우저가 보관하도록 돌려준다
    if (state.session) headers[SESSION_HEADER] = (await state.session).id;
    return { status: 200, headers, body: JSON.stringify(body) };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, headers, body: JSON.stringify({ error: e.message }) };
    if (e instanceof SessionLimitError) return { status: 429, headers, body: JSON.stringify({ error: e.message }) };
    console.error("[api]", req.method, req.path, e);
    return { status: 500, headers, body: JSON.stringify({ error: "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요." }) };
  }
}

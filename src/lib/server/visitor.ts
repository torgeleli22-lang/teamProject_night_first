import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "../session-cookie";
import { touchSession, type SessionInfo } from "./session-repo";

/**
 * 지금 접속한 사람의 세션. 로그인 없이 브라우저 세션 쿠키(sid)로 구분한다.
 * (로그인을 붙이면 여기서 계정을 찾아 돌려주면 된다)
 */
export async function currentSession(): Promise<SessionInfo> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  // 미들웨어가 항상 발급하지만, 혹시 없으면 이번 요청만을 위한 임시 세션
  return touchSession(id ?? `temp-${crypto.randomUUID()}`);
}

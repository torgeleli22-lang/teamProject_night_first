import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/session-cookie";

/**
 * 로그인 없이 바로 학습할 수 있도록 세션 id 를 발급한다.
 * 유효 기간(Max-Age)을 주지 않은 '세션 쿠키'라서 브라우저를 닫으면 사라지고, 다시 접속하면 새 세션으로 시작한다.
 * 서버에 남은 기록은 SESSION_TTL_HOURS 동안 쓰이지 않으면 자동으로 삭제된다.
 */
export function middleware(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)) return NextResponse.next();
  const id = crypto.randomUUID();
  // 같은 요청 안의 서버 컴포넌트/라우트도 새 id 를 읽을 수 있게 요청 쿠키에도 넣는다
  req.cookies.set(SESSION_COOKIE, id);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
  // 예전 버전의 1년짜리 익명 쿠키 정리
  if (req.cookies.get("lid")) res.cookies.delete("lid");
  return res;
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};

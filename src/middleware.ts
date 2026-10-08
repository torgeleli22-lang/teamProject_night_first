import { NextResponse, type NextRequest } from "next/server";

export const LEARNER_COOKIE = "lid";

/**
 * 로그인 없이 바로 학습할 수 있도록 익명 학습자 id 를 쿠키로 발급한다.
 * (로그인을 붙이면 이 id 를 계정에 연결하면 된다)
 */
export function middleware(req: NextRequest) {
  if (req.cookies.get(LEARNER_COOKIE)) return NextResponse.next();
  const id = crypto.randomUUID();
  // 같은 요청 안의 서버 컴포넌트/라우트도 새 id 를 읽을 수 있게 요청 쿠키에도 넣는다
  req.cookies.set(LEARNER_COOKIE, id);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set(LEARNER_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};

/**
 * 경로 → Lambda 함수 (lambda/functions.json 의 paths 와 같게 — tests/api-routes.test.ts 가 확인해요).
 * 화면은 경로 앞부분으로 부를 함수를 골라요. 주소는 빌드할 때 NEXT_PUBLIC_API_URLS(JSON, GitHub 변수 API_URLS)로 받고,
 * 없으면 NEXT_PUBLIC_API_URL 하나로 모두 보내요 (내 컴퓨터: npm run api 가 함수 6개를 http://localhost:8787 하나로 띄워요).
 */
export type ApiFunction = "auth" | "practice" | "inspect" | "review" | "study" | "admin";

export const FUNCTION_PATHS: Record<ApiFunction, string[]> = {
  auth: ["/me", "/auth", "/health"],
  practice: ["/practice", "/topic"],
  inspect: ["/inspect"],
  review: ["/review", "/tutor", "/code"],
  study: ["/study"],
  admin: ["/admin"],
};

/** 이 경로를 맡은 함수 (쿼리는 빼고 봐요) */
export function functionFor(path: string): ApiFunction | null {
  const bare = path.split("?")[0];
  for (const [fn, prefixes] of Object.entries(FUNCTION_PATHS) as [ApiFunction, string[]][]) {
    if (prefixes.some((p) => bare === p || bare.startsWith(`${p}/`))) return fn;
  }
  return null;
}

/** NEXT_PUBLIC_API_URLS(JSON) → {함수: 주소}. 틀린 값은 버리고, 끝의 / 는 떼요 */
export function parseApiUrls(raw: string | undefined): Partial<Record<ApiFunction, string>> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return {};
    const out: Partial<Record<ApiFunction, string>> = {};
    for (const fn of Object.keys(FUNCTION_PATHS) as ApiFunction[]) {
      const url = (value as Record<string, unknown>)[fn];
      if (typeof url === "string" && /^https?:\/\//.test(url)) out[fn] = url.replace(/\/+$/, "");
    }
    return out;
  } catch {
    return {};
  }
}

/** 요청을 보낼 주소의 앞부분: 그 함수의 주소, 없으면 fallback(주소 하나) */
export function baseFor(path: string, urls: Partial<Record<ApiFunction, string>>, fallback: string): string {
  const fn = functionFor(path);
  return (fn && urls[fn]) || fallback;
}

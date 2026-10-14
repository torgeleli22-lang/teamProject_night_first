/**
 * IP·세션별 요청 수 제한 (공개 API 로 AI 예산이나 서버를 소모시키는 것을 막는다).
 * 한 서버(EC2) 안의 메모리에 센다 — 서버를 다시 시작하면 처음부터 센다.
 *
 * 기준: 학교 교실처럼 여러 사람이 같은 공인 IP 를 쓰는 경우(30명)를 막지 않도록 IP 기준은 넉넉하게,
 * 한 사람(세션) 기준은 실제 학습 속도에 맞게 잡았다. .env 로 바꿀 수 있고 0 이면 끈다.
 */

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== undefined && process.env[name] !== "" ? v : fallback;
};

export const LIMITS = {
  /** IP 하나가 1분에 보낼 수 있는 전체 요청 (한 사람이 문제 풀 때 1분에 10~20번 → 30명 교실 + 여유) */
  perIpPerMinute: num("RATE_LIMIT_PER_MINUTE", 600),
  /** 한 사람(세션)의 AI 요청 1시간 (튜터 질문·AI 분석·주관식 제출. 열심히 해도 1시간 20번 안팎) */
  aiPerSessionPerHour: num("RATE_LIMIT_AI_PER_SESSION_HOUR", 30),
  /** IP 하나의 AI 요청 1시간 (교실 30명 × 10번) */
  aiPerIpPerHour: num("RATE_LIMIT_AI_PER_IP_HOUR", 300),
  /** IP 하나가 1시간에 새로 만들 수 있는 학습자(세션) (교실 30명이 탭을 몇 번씩 새로 열어도 충분) */
  newSessionsPerIpPerHour: num("RATE_LIMIT_NEW_SESSIONS_PER_HOUR", 120),
  /** 요청 본문 최대 크기 (가장 큰 정상 요청은 주관식 답·관리자 요청 수천 자 → 수십 KB) */
  maxBodyBytes: num("MAX_BODY_KB", 256) * 1024,
};

const buckets = new Map<string, { count: number; resetAt: number }>();

/** key 로 한 번 센다. 한도 안이면 true, 넘었으면 false (limit 이 0 이하면 항상 true) */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (limit <= 0) return true;
  if (buckets.size > 50_000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

/** AI 를 부를 수 있는 공개 요청 */
export function isAiRequest(method: string, path: string, body: unknown): boolean {
  if (method !== "POST") return false;
  if (path === "/ask" || path === "/explain") return true;
  // 주관식 제출은 규칙으로 판단하기 애매하면 AI 로 평가한다
  const answer = (body as { answer?: { type?: string } } | undefined)?.answer;
  return path === "/attempts" && answer?.type === "short_answer";
}

"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 브라우저 → API(Lambda 함수 URL 하나 — lambda/api) 호출.
 * 모든 기능이 같은 주소라서 브라우저가 연결(HTTPS)을 한 번 맺고 계속 다시 쓴다 → 화면 이동·제출이 빠르다.
 * - 세션 id 는 sessionStorage 에 둔다: 이 탭(창)을 닫으면 사라지고, 다시 열면 새로 시작한다.
 * - AI 판정·첨삭은 모두 Lambda 에서 한다. 이 파일은 요청만 보낸다.
 * 주소는 화면을 빌드할 때 넣는다 (GitHub → Settings → Secrets and variables → Actions → Variables → API_URL).
 * 내 컴퓨터에서는 npm run api 가 같은 Lambda 를 http://localhost:8787 로 실행한다.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787").replace(/\/$/, "");

/** 요청할 전체 주소 */
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

/** 배포 화면인데 API 주소 없이 빌드된 경우 (화면 미리보기만 가능) */
const API_MISSING = !process.env.NEXT_PUBLIC_API_URL && process.env.NODE_ENV === "production" && !!process.env.NEXT_PUBLIC_BASE_PATH;

const SESSION_KEY = "codereading.sid";
const SESSION_HEADER = "x-session-id";

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function saveSession(id: string) {
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    /* 저장할 수 없는 환경이면 요청마다 새 세션 */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown, opts: { signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
  if (API_MISSING) throw new ApiError("아직 서버(API)가 연결되지 않았어요. 지금은 화면 미리보기만 할 수 있어요.", 0);
  const sid = readSession();
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(sid ? { [SESSION_HEADER]: sid } : {}),
        ...opts.headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
  }
  const next = res.headers.get(SESSION_HEADER);
  if (next) saveSession(next);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? "요청에 실패했어요.", res.status);
  return data as T;
}

export const apiGet = <T>(path: string, opts?: { signal?: AbortSignal; headers?: Record<string, string> }) => request<T>("GET", path, undefined, opts);
export const apiPost = <T>(path: string, body: unknown, opts?: { signal?: AbortSignal; headers?: Record<string, string> }) => request<T>("POST", path, body, opts);

/** 화면 데이터 불러오기 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setError(null);
    apiGet<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [path, tick]);

  return { data, error, reload };
}

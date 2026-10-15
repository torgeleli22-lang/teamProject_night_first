"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 브라우저 → API(Lambda 함수 URL, 로컬은 npm run api) 호출.
 * - 세션 id 는 sessionStorage 에 둔다: 이 탭(창)을 닫으면 사라지고, 다시 열면 새로 시작한다.
 * - 정답·채점은 모두 서버(API)에서 한다. 이 파일은 요청만 보낸다.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787").replace(/\/$/, "");
/**
 * 기능별 Lambda URL (lambda/ 폴더의 Python Lambda). 비어 있으면 그 기능도 위의 API_URL 로 처리한다.
 * GitHub → Settings → Secrets and variables → Actions → Variables 에 넣으면 화면 배포 때 들어간다.
 */
export const LAMBDA_URLS = {
  /** 튜터 대화: lambda/tutor-chat */
  tutorChat: (process.env.NEXT_PUBLIC_TUTOR_CHAT_URL || "").replace(/\/$/, ""),
};

/** 배포 화면인데 API 주소 없이 빌드된 경우 (화면 미리보기만 가능) */
const API_MISSING = !process.env.NEXT_PUBLIC_API_URL && process.env.NODE_ENV === "production" && !!process.env.NEXT_PUBLIC_BASE_PATH;

const SESSION_KEY = "codereading.sid";
const SESSION_HEADER = "x-session-id";
/** 기록이 바뀌었을 때 화면의 데이터(헤더 XP 등)를 다시 불러오게 하는 이벤트 */
const CHANGED_EVENT = "codereading:changed";

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
    res = await fetch(`${API_URL}${path}`, {
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

/** 기능별 Lambda URL 로 JSON 을 보내고 JSON 을 받는다 (세션 헤더 없이, 필요한 값은 본문에 넣는다) */
export async function lambdaPost<T>(url: string, body: unknown, opts: { signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? "요청에 실패했어요.", res.status);
  return data as T;
}

export const apiGet = <T>(path: string, opts?: { signal?: AbortSignal; headers?: Record<string, string> }) => request<T>("GET", path, undefined, opts);
export const apiPost = <T>(path: string, body: unknown, opts?: { signal?: AbortSignal; headers?: Record<string, string> }) => request<T>("POST", path, body, opts);

/** 풀이·이름 변경·초기화 뒤에 호출 → 화면의 데이터가 새로 고쳐진다 */
export function notifyChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/**
 * 화면 데이터 불러오기. 3초 넘게 걸리면 slow=true
 * (DB 가 쉬고 있다가 깨어나는 중일 수 있어서 안내 문구를 보여준다)
 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    window.addEventListener(CHANGED_EVENT, reload);
    return () => window.removeEventListener(CHANGED_EVENT, reload);
  }, [reload]);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const timer = setTimeout(() => setSlow(true), 3000);
    setError(null);
    apiGet<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        clearTimeout(timer);
        setSlow(false);
      });
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, tick]);

  return { data, error, slow, reload };
}

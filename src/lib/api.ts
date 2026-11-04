"use client";

import { useCallback, useEffect, useState } from "react";
import { baseFor, parseApiUrls } from "./api-routes";

/**
 * 브라우저 → API(기능별 Lambda 함수 URL) 호출. 경로 앞부분으로 함수를 고른다 (api-routes.ts, docs/LAMBDA_STRUCTURE.md §8).
 * 함수(auth·practice·review)마다 주소가 달라서 처음 부를 때 연결(HTTPS)을 하나씩 맺고, 그다음부터는 다시 쓴다.
 * - 로그인 안 함: 학습자 id 를 sessionStorage 에 둔다 — 이 탭(창)을 닫으면 사라지고 다시 열면 새로 시작 (서버 기록도 하루 안에 지워짐)
 * - 로그인(Google): 로그인 토큰을 localStorage 에 둔다 — 브라우저를 닫아도 이어지고, 기록이 계정에 오래 남는다.
 *   둘 다 같은 x-session-id 헤더로 보낸다 (서버가 학습자 id 인지 로그인 토큰인지 구분).
 * - 코드 만들기·채점은 모두 Lambda 에서 한다. 이 파일은 요청만 보낸다.
 * 주소는 화면을 빌드할 때 넣는다 (GitHub → Settings → Secrets and variables → Actions → Variables):
 *   API_URLS = {"auth": "https://…", "practice": "https://…", "review": "https://…"} 함수별 주소 (docs/DEPLOY_LAMBDA.md)
 *   (API_URLS 가 없으면 NEXT_PUBLIC_API_URL 주소 하나로 — 내 컴퓨터의 npm run api)
 * 내 컴퓨터에서는 npm run api 가 함수 3개를 http://localhost:8787 하나로 실행한다.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787").replace(/\/$/, "");
const API_URLS = parseApiUrls(process.env.NEXT_PUBLIC_API_URLS);

/** 요청할 전체 주소 (경로를 맡은 함수의 주소) */
export function apiUrl(path: string): string {
  return `${baseFor(path, API_URLS, API_URL)}${path}`;
}

/** 배포 화면인데 API 주소 없이 빌드된 경우 (화면 미리보기만 가능) */
const API_MISSING =
  !process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URLS && process.env.NODE_ENV === "production" && !!process.env.NEXT_PUBLIC_BASE_PATH;

const SESSION_KEY = "codereading.sid";
const LOGIN_KEY = "codereading.login";
const SESSION_HEADER = "x-session-id";
/** 로그인·로그아웃했을 때 화면(위쪽 로그인 표시 등)이 다시 불러오게 하는 이벤트 */
export const AUTH_EVENT = "codereading:auth";

function store(kind: "local" | "session") {
  try {
    return kind === "local" ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

function readSession(): string | null {
  return store("local")?.getItem(LOGIN_KEY) ?? store("session")?.getItem(SESSION_KEY) ?? null;
}

function saveSession(id: string) {
  const login = store("local")?.getItem(LOGIN_KEY);
  if (login) {
    if (login === id) return;
    // 서버가 다른 id 를 주면 로그인이 만료된 것 → 로그인 안 한 학습자로
    store("local")?.removeItem(LOGIN_KEY);
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
  store("session")?.setItem(SESSION_KEY, id);
  store("local")?.removeItem(SESSION_KEY); // 잠깐 localStorage 에 두었던 예전 id 는 지운다
}

/** 로그인 시작 주소: 끝나면 지금 화면으로 돌아오고, 이 탭에서 하던 기록을 계정으로 옮긴다 */
export function loginUrl(provider: "google"): string {
  const back = window.location.href.split("#")[0];
  const sid = store("session")?.getItem(SESSION_KEY) ?? "";
  return apiUrl(`/auth/start?provider=${provider}&return=${encodeURIComponent(back)}&sid=${encodeURIComponent(sid)}`);
}

/** 로그인에서 돌아왔을 때 주소의 #login=<토큰> 을 꺼내 저장한다. 실패했으면 이유를 돌려준다 */
export function takeLoginFromUrl(): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const token = hash.get("login");
  const failed = hash.get("login_error");
  if (!token && !failed) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (token) {
    store("local")?.setItem(LOGIN_KEY, token);
    store("session")?.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
  return failed;
}

export async function logout() {
  try {
    await apiPost("/auth/logout", {});
  } finally {
    store("local")?.removeItem(LOGIN_KEY);
    store("session")?.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event(AUTH_EVENT));
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

  // 로그인·로그아웃하면 다시 불러온다
  useEffect(() => {
    window.addEventListener(AUTH_EVENT, reload);
    return () => window.removeEventListener(AUTH_EVENT, reload);
  }, [reload]);

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

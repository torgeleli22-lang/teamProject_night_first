/**
 * 붙인 메모를 이 탭(sessionStorage)에 잠깐 저장한다 — 새로 고침하거나 '같은 코드 다시 읽기'로 돌아와도 남아 있게.
 * 서버에는 '첨삭 받기'를 누를 때만 보낸다.
 */
import type { Memo } from "./api-types";

const key = (readingId: string) => `codereading.memos.${readingId}`;

export function loadMemos(readingId: string): Memo[] {
  try {
    const raw = sessionStorage.getItem(key(readingId));
    return raw ? (JSON.parse(raw) as Memo[]) : [];
  } catch {
    return [];
  }
}

export function saveMemos(readingId: string, memos: Memo[]) {
  try {
    sessionStorage.setItem(key(readingId), JSON.stringify(memos));
  } catch {
    /* 저장할 수 없는 환경이면 화면에만 */
  }
}

/** 두 범위가 겹치는지 (첨삭의 '누락' 판정과 같은 기준) */
export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** ①②③ … (21 이상은 숫자) */
export function circled(n: number): string {
  return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`;
}

"use client";

import { useSyncExternalStore } from "react";
import { LEVELS } from "./curriculum";
import { computeConceptStats, MASTERED } from "./mastery";
import { getProblem } from "./problems";
import type { Attempt } from "./types";

/**
 * MVP 에서는 학습 기록을 브라우저 localStorage 에 저장한다.
 * (로그인/DB 를 붙일 때 이 모듈의 load/save 만 서버 API 로 바꾸면 된다)
 */
export interface ProgressState {
  version: 1;
  attempts: Attempt[];
  xp: number;
  /** 학습한 날짜 (YYYY-MM-DD, 로컬 시간) */
  activeDays: string[];
  dailyGoal: number;
}

const KEY = "codereading:progress:v1";
const EMPTY: ProgressState = { version: 1, attempts: [], xp: 0, activeDays: [], dailyGoal: 3 };

let state: ProgressState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProgressState;
      if (parsed.version === 1) state = { ...EMPTY, ...parsed };
    }
  } catch {
    // 저장소를 쓸 수 없는 환경(시크릿 모드 등)에서는 메모리에서만 동작
  }
}

function save() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      loaded = false;
      load();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  load();
  return state;
}

const getServerSnapshot = () => EMPTY;

export function useProgress(): ProgressState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 서버 렌더링 중에는 false — 저장된 기록을 읽기 전 깜빡임을 피하는 데 사용 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function today(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function xpForAttempt(a: Pick<Attempt, "correct" | "partial" | "hintsUsed">): number {
  if (a.correct) return a.hintsUsed === 0 ? 15 : 10;
  if (a.partial) return 6;
  return 2; // 틀려도 시도 자체를 인정
}

export function recordAttempt(attempt: Attempt): number {
  load();
  const gained = xpForAttempt(attempt);
  const day = today(new Date(attempt.at));
  state = {
    ...state,
    attempts: [...state.attempts, attempt],
    xp: state.xp + gained,
    activeDays: state.activeDays.includes(day) ? state.activeDays : [...state.activeDays, day],
  };
  save();
  return gained;
}

export function resetProgress() {
  state = EMPTY;
  save();
}

// ───────── 파생 정보 ─────────

export function streakDays(s: ProgressState, now = new Date()): number {
  const days = new Set(s.activeDays);
  const cursor = new Date(now);
  // 오늘 아직 안 했으면 어제부터 센다 (오늘 하면 streak 유지)
  if (!days.has(today(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(today(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function solvedToday(s: ProgressState, now = new Date()): number {
  const d = today(now);
  return s.attempts.filter((a) => today(new Date(a.at)) === d).length;
}

export function learnerLevel(xp: number) {
  // 레벨 n 에 필요한 누적 XP: 50 * n * (n - 1)
  let level = 1;
  while (50 * (level + 1) * level <= xp) level++;
  const base = 50 * level * (level - 1);
  const next = 50 * (level + 1) * level;
  return { level, current: xp - base, needed: next - base };
}

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  description: string;
  earned: boolean;
}

export function badges(s: ProgressState): Badge[] {
  const stats = computeConceptStats(s.attempts);
  const streak = streakDays(s);
  const noHintCorrect = s.attempts.filter((a) => a.correct && a.hintsUsed === 0).length;
  const explained = s.attempts.some((a) => a.correct && getProblem(a.problemId)?.type === "explain");
  const levelCleared = (id: number) =>
    LEVELS.find((l) => l.id === id)!.conceptIds.every((c) => (stats.get(c)?.mastery ?? 0) >= MASTERED);
  return [
    { id: "first", emoji: "🌱", title: "첫 걸음", description: "첫 문제 풀기", earned: s.attempts.length > 0 },
    { id: "ten", emoji: "🔟", title: "꾸준함의 시작", description: "문제 10개 풀기", earned: s.attempts.length >= 10 },
    { id: "streak3", emoji: "🔥", title: "3일 연속", description: "3일 연속 학습", earned: streak >= 3 },
    { id: "nohint", emoji: "🧠", title: "스스로 해결", description: "힌트 없이 5문제 맞히기", earned: noHintCorrect >= 5 },
    { id: "explain", emoji: "🗣️", title: "설명왕", description: "코드 설명 문제 통과", earned: explained },
    { id: "level1", emoji: "🏅", title: "기초 완성", description: "Level 1 모든 개념 익히기", earned: levelCleared(1) },
    { id: "level5", emoji: "🛠️", title: "배열 장인", description: "Level 5 모든 개념 익히기", earned: levelCleared(5) },
  ];
}

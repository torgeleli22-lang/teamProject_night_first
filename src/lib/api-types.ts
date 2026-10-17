/**
 * Lambda(jojo_api)가 화면으로 돌려주는 JSON 의 모양 (lambda/api 의 Python 코드와 같게 유지한다).
 * ※ 꼭 설명할 곳의 모범 설명·핵심 표현은 읽는 동안(Reading)에는 오지 않고, 첨삭(ReviewResult) 뒤에만 온다.
 */

export type Level = 1 | 2 | 3;
export const LEVEL_NAMES: Record<Level, string> = { 1: "입문", 2: "초급", 3: "중급" };
export const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  1: "짧은 코드. 변수, 조건문, 반복문이 위에서 아래로 흘러가요.",
  2: "함수 여러 개가 서로를 불러요. 리스트와 딕셔너리가 나와요.",
  3: "클래스, 재귀, 예외 처리처럼 흐름이 오가는 코드예요.",
};

// ───────────────────────── 연결 확인 (lambda_function.py) ─────────────────────────

export interface Health {
  ok: boolean;
  mode: "live" | "mock" | "off";
  ai: boolean;
  languages: string[];
  maxCodeLines: number;
  regenLimit: number;
}

// ───────────────────────── 주제 (topics.py) ─────────────────────────

export interface RandomTopic {
  topic: string;
}

export type TopicVerdict = "ok" | "vague" | "too_big" | "inappropriate";

export interface TopicCheck {
  verdict: TopicVerdict;
  /** ok 일 때 다듬은 주제 */
  topic: string;
  suggestions: string[];
  message: string;
}

// ───────────────────────── 읽을 코드 (practice.py · inspect_code.py, common.public_reading) ─────────────────────────

/** ※ 꼭 설명할 곳 (줄 범위만) */
export interface MarkRange {
  id: string;
  start: number;
  end: number;
}

export interface Reading {
  id: string;
  source: "practice" | "inspect";
  language: "python";
  level: Level;
  levelName: string;
  topic: string;
  title: string;
  code: string;
  marks: MarkRange[];
  /** 같은 코드에서 '더 쉽게·더 어렵게'로 다시 만들 수 있는 남은 횟수 */
  regenLeft: number;
  /** 예시 코드로 대신했을 때 등 안내 */
  note: string | null;
  /** 내 코드 점검: 고른 함수 이름 */
  functions?: string[] | null;
  /** 내 코드 점검: AI 가 그 난이도로 본 이유 */
  levelReason?: string | null;
}

/** POST /inspect/start 의 응답 */
export interface InspectStarted extends Reading {
  masked: MaskedLine[];
}

export type AdjustReason = "too_long" | "unknown_concept" | "complex_flow";
export const ADJUST_REASONS: Record<AdjustReason, string> = {
  too_long: "코드가 너무 길어요",
  unknown_concept: "모르는 개념이 있어요",
  complex_flow: "흐름이 복잡해요",
};

/** GET /reading?id= */
export interface ReadingWithReview {
  reading: Reading;
  review: ReviewResult | null;
  /** 첨삭 항목 번호(문자열) → AI 튜터와 나눈 대화 */
  chats?: Record<string, TutorChat>;
}

// ───────────────────────── 내 코드 점검 (inspect_code.py) ─────────────────────────

export interface MaskedLine {
  line: number;
  kind: string;
}

export interface FoundFunction {
  name: string;
  signature: string;
  start: number;
  end: number;
}

/** POST /inspect (훑어보기, AI 없음) */
export interface InspectLook {
  language: "python";
  languageName: string;
  lines: number;
  code: string;
  masked: MaskedLine[];
  functions: FoundFunction[];
  levelGuess: Level;
  levelGuessName: string;
}

// ───────────────────────── 첨삭 (review.py) ─────────────────────────

export interface Memo {
  start: number;
  end: number;
  text: string;
  /** 화면에서만: 포스트잇을 붙인 줄 (start~end 안, 끌어서 옮김). 서버는 쓰지 않음 */
  anchor?: number;
}

/** ○ correct 정확 · △ partial 부분 · ✕ wrong 오해 · ⬚ missing 누락(※ 지점에 메모 없음) */
export type MarkKind = "correct" | "partial" | "wrong" | "missing";
export const MARK_NAMES: Record<MarkKind, string> = { correct: "정확", partial: "부분", wrong: "오해", missing: "누락" };

export interface ReviewItem {
  kind: "memo" | "missing";
  start: number;
  end: number;
  /** ※ 꼭 설명할 곳과 겹치는지 */
  marked: boolean;
  memo: string;
  mark: MarkKind;
  comment: string;
  lookAt: number[];
  /** 모범 설명 ("모범 설명 보기") */
  model: string;
}

export interface ReviewResult {
  readingId: string;
  summary: string;
  counts: Record<MarkKind, number>;
  items: ReviewItem[];
  byAi: boolean;
  createdAt: number;
}

// ───────────────────────── AI 튜터 (tutor_chat.py) ─────────────────────────

export interface TutorTurn {
  role: "user" | "tutor";
  text: string;
  /** 튜터가 다시 보라고 한 줄 */
  lookAt: number[];
  at: number;
}

export interface TutorChat {
  turns: TutorTurn[];
  turnsLeft: number;
}

/** POST /tutor */
export interface TutorReply extends TutorChat {
  item: number;
  byAi: boolean;
}

// ───────────────────────── 관리자 (admin.py) ─────────────────────────

/** 이번 달 AI 사용량: 작업 × 모델 한 줄 */
export interface UsageRow {
  task: string;
  taskName: string;
  /** 지금 서비스가 쓰는 작업인지 (false 면 예전 서비스의 기록) */
  current: boolean;
  description: string;
  model: string;
  modelName: string;
  mock: boolean;
  calls: number;
  successes: number;
  failures: number;
  input: number;
  output: number;
  cacheRead: number;
  costUsd: number;
  lastAt: number | null;
  /** 마지막 실패 이유 (관리자가 읽을 말 — 원래 오류) */
  lastError: string;
  lastErrorAt: number | null;
}

/** AI 호출 하나 (최근 50개, 14일 보관). stage=check 는 AI 는 답했지만 서버 검사에서 걸린 것 */
export interface AiLogRow {
  at: number;
  task: string;
  taskName: string;
  modelName: string;
  ok: boolean;
  stage: "ai" | "check";
  input: number;
  output: number;
  ms: number;
  error: string;
}

export interface DayCount {
  day: string;
  practices: number;
  adjusts: number;
  topicChecks: number;
  inspections: number;
  reviews: number;
  tutorChats: number;
}

export interface AdminOverview {
  mode: "live" | "mock" | "off";
  aiSwitch: boolean;
  model: string;
  budget: { monthlyUsd: number; monthToDateUsd: number; realUsd: number; percent: number };
  usage: UsageRow[];
  recent: AiLogRow[];
  days: DayCount[];
  adminCode: { custom: boolean; recovery: boolean };
}

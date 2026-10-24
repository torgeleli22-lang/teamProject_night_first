/**
 * Lambda(jojo_api)가 화면으로 돌려주는 JSON 의 모양 (lambda/api 의 Python 코드와 같게 유지한다).
 * ※ 꼭 설명할 곳의 모범 설명·핵심 표현은 읽는 동안(Reading)에는 오지 않고, 첨삭(ReviewResult) 뒤에만 온다.
 */

export type Level = 1 | 2 | 3 | 4;
export const LEVEL_NAMES: Record<Level, string> = { 1: "입문", 2: "초급", 3: "중급", 4: "고급" };
export const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  1: "짧은 코드. 변수, 조건문, 반복문이 위에서 아래로 흘러가요.",
  2: "함수 여러 개가 서로를 불러요. 리스트·딕셔너리(배열·객체)가 나와요.",
  3: "클래스, 재귀, 예외 처리처럼 흐름이 오가는 코드예요.",
  4: "100~200줄 프로그램. 최단 경로·동적 계획법·정렬·탐색 같은 알고리즘과 자료구조를 따라가요.",
};

/** 연습 모드 언어 (common.LANGUAGES 와 같게). 내 코드 점검은 아직 Python 만 */
export type Language = "python" | "javascript";
export const LANGUAGE_NAMES: Record<Language, string> = { python: "Python", javascript: "JavaScript" };

/** 개념 꼬리표 (common.CONCEPTS 와 같게): ※ 지점·메모 범위가 어떤 흐름을 읽는 곳인지 */
export type Concept = "branch" | "loop_update" | "call_flow" | "data_update" | "class_state" | "exception" | "recursion" | "algorithm";
export const CONCEPT_NAMES: Record<Concept, string> = {
  branch: "조건 분기",
  loop_update: "반복이 값을 바꾸는 곳",
  call_flow: "함수가 함수를 부름",
  data_update: "자료구조 다루기",
  class_state: "객체 상태 바뀜",
  exception: "예외 흐름",
  recursion: "재귀·되돌아가기",
  algorithm: "알고리즘 핵심",
};

// ───────────────────────── 로그인 (auth.py) ─────────────────────────

/** GET /me */
export interface Me {
  /** 로그인한 학습자인지 */
  member: boolean;
  name: string | null;
  provider: "google" | "github" | null;
  /** 쓸 수 있는 로그인 (서버에 클라이언트 id 가 설정된 것) */
  providers: { google: boolean; github: boolean };
}

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
  language: Language;
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
  /** '이 개념 집중 연습'으로 만든 코드의 집중 개념 */
  focus?: Concept | null;
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
  /** 첨삭 항목 번호(문자열) → 힌트를 보고 다시 써 본 기록 */
  retries?: Record<string, RetryState>;
}

/** 힌트를 보고 다시 쓴 설명 하나와 그 판정 */
export interface RetryAttempt {
  text: string;
  mark: "correct" | "partial" | "wrong";
  comment: string;
  lookAt: number[];
  byAi: boolean;
  at: number;
}

export interface RetryState {
  attempts: RetryAttempt[];
  /** 남은 횟수 (항목 하나에 3번) */
  left: number;
}

/** POST /review/retry */
export interface RetryReply extends RetryState {
  item: number;
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
  /** 개념 꼬리표 */
  concept?: Concept;
}

export interface ReviewResult {
  readingId: string;
  summary: string;
  counts: Record<MarkKind, number>;
  items: ReviewItem[];
  byAi: boolean;
  createdAt: number;
}

// ───────────────────────── 내 공부 (study.py, AI 없음) ─────────────────────────

export interface LevelAdvice {
  level: Level;
  name: string;
  codes: number;
  correctRate: number;
  advice: "up" | "down" | "stay" | "none";
}

export interface ConceptStat {
  concept: Concept;
  name: string;
  description: string;
  count: number;
  /** 처음 판정에서 ○ 를 받은 비율 (0~1) */
  correctRate: number;
  /** 다시 써서 ○ 가 된 수 */
  improved: number;
  missing: number;
}

export interface ExplanationNote {
  concept: Concept;
  conceptName: string;
  text: string;
  /** 다시 써서 ○ 를 받은 설명인지 */
  improved: boolean;
  start: number;
  end: number;
  /** 그 범위의 코드 몇 줄 (연습 코드만) */
  snippet: string | null;
  title: string;
  level: Level;
  source: "practice" | "inspect";
  /** 예전 기록에는 없음 (python) */
  language?: Language;
  readingId: string;
  /** 원본 코드가 아직 남아 있어 다시 열 수 있는지 */
  open: boolean;
  at: number;
}

export interface StudyOverview {
  summary: { codes: number; days: number; items: number; correctRate: number; improved: number };
  levels: { current: Level; suggested: Level; advice: LevelAdvice["advice"]; message: string; byLevel: LevelAdvice[] };
  concepts: { items: ConceptStat[]; weakest: Concept | null };
  notes: ExplanationNote[];
  recent: { readingId: string; source: "practice" | "inspect"; language?: Language; level: Level; title: string; counts: Record<MarkKind, number>; reviewedAt: number; open: boolean }[];
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
  retries: number;
  tutorChats: number;
}

/** POST /admin/migrate — 예전 키 이름(LEARNER, READ#, STUDY# …) 항목을 새 이름(USER#, CODE# …)으로 옮긴 결과 */
export interface MigrateResult {
  moved: number;
  /** 옮기지 않고 지운 수 (몇 분짜리 요청 수 제한) */
  removed: number;
  /** 이미 새 이름이거나 예전 서비스의 항목 */
  untouched: number;
  byKind: Record<string, number>;
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

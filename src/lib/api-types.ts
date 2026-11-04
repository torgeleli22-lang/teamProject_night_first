/**
 * Lambda 가 화면으로 돌려주는 JSON 의 모양 (lambda/jojo_<함수> 의 Python 코드와 같게 유지한다).
 * 채점 기준(검토 기록·모범 설명)은 읽는 동안(CodeItem)에는 오지 않고, 채점 결과(ReviewResult)에만 온다.
 */

export type Level = 1 | 2 | 3;
export const LEVEL_NAMES: Record<Level, string> = { 1: "초급", 2: "중급", 3: "고급" };
/** 난이도 기준 (docs/GENERATION_STANDARD.md 2장 — 줄 수가 아니라 개념·구조·흐름으로) */
export const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  1: "변수·자료형·연산자 같은 기초 문법, 하나의 핵심 개념. 실행 순서와 결과가 쉽게 보여요.",
  2: "조건문·반복문·함수를 함께 써요. 두 가지 이상의 개념이 이어지고, 매개변수와 반환값으로 값이 오가요.",
  3: "중첩 반복·복합 조건, 함수·자료구조·클래스가 이어진 여러 단계의 흐름이에요.",
};

export type Language = "python" | "javascript";
export const LANGUAGE_NAMES: Record<Language, string> = { python: "Python", javascript: "JavaScript" };

// ───────────────────────── 로그인 (jojo_auth) ─────────────────────────

/** GET /me */
export interface Me {
  member: boolean;
  name: string | null;
  provider: "google" | null;
  /** 쓸 수 있는 로그인 (서버에 클라이언트 id 가 설정된 것) */
  providers: { google: boolean };
}

// ───────────────────────── 연습 코드 (jojo_practice, core.public_code) ─────────────────────────

/** 설명할 곳(※) — 줄 범위만 */
export interface MarkRange {
  id: string;
  start: number;
  end: number;
}

/** POST /practice */
export interface CodeItem {
  codeId: string;
  language: Language;
  level: Level;
  levelName: string;
  topic: string;
  title: string;
  code: string;
  marks: MarkRange[];
  /** 예시 코드로 대신했을 때 등 안내 */
  note: string | null;
}

/** GET /code?codeId= */
export interface CodeItemWithReview {
  codeItem: CodeItem;
  review: ReviewResult | null;
}

// ───────────────────────── 채점 (jojo_review) ─────────────────────────

export interface Memo {
  start: number;
  end: number;
  text: string;
  /** 화면에서만: 포스트잇을 붙인 줄 (start~end 안, 끌어서 옮김). 서버는 쓰지 않음 */
  anchor?: number;
}

/** ○ correct 정확 · △ partial 부분 · ✕ wrong 오해 · ⬚ missing 빈칸(설명할 곳에 메모 없음) */
export type MarkKind = "correct" | "partial" | "wrong" | "missing";
export const MARK_NAMES: Record<MarkKind, string> = { correct: "정확", partial: "부분", wrong: "오해", missing: "빈칸" };

export interface ReviewItem {
  kind: "memo" | "missing";
  start: number;
  end: number;
  /** 설명할 곳(※)과 겹치는지 */
  marked: boolean;
  memo: string;
  mark: MarkKind;
  comment: string;
  lookAt: number[];
  /** 모범 설명 */
  model: string;
  /** 검토 AI 가 실행하듯 따라간 기록 (넣은 값 · 바뀌는 과정 · 반복 횟수 · 멈춘 조건 · 결과) — 채점 기준 */
  /** 예전 판의 채점 결과에는 없어요 */
  trace?: string[];
}

/** POST /review */
export interface ReviewResult {
  codeId: string;
  summary: string;
  counts: Record<MarkKind, number>;
  items: ReviewItem[];
  byAi: boolean;
  createdAt: number;
}

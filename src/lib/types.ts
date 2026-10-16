export type ConceptId = string;

/**
 * 학습 갈래.
 * - theory: "개념" 학습 — 네트워크·개발·운영·보안 지식을 자격증 시험처럼 객관식으로 (코드 없음)
 * - code  : "코드" 학습 — 코드 하나를 읽는 순서(훑어보기 → 흐름 → 핵심 줄 → 정리)대로 단계별로
 * (화면 이름 "개념"과 개념 id(ConceptId)가 헷갈리지 않도록 코드에서는 theory 라고 부른다)
 */
export type Track = "theory" | "code";

/** 코드 학습 언어 (지금은 JavaScript 만. 실행 검증기가 생기면 추가) */
export type Language = "javascript";

/**
 * 코드 학습의 읽기 단계 (한 코드의 문제는 이 순서로 나온다)
 * overview 훑어보기 → trace 흐름 따라가기 → key 핵심 줄 → wrapup 정리
 */
export type Stage = "overview" | "trace" | "key" | "wrapup";

export interface Concept {
  id: ConceptId;
  name: string;
  /** 속한 단원 (코드: JavaScript 단원, 개념: 분야) — 갈래는 단원에서 정해진다 */
  unitId: number;
  /** 한 줄 요약: "map = 배열의 각 요소를 변환" */
  keyIdea: string;
  /** 초보자용 짧은 설명 (미리 작성된 개념 설명) */
  summary: string;
  example: string;
}

/** 주제 묶음. 코드 갈래는 JavaScript 단원(변수/흐름/…), 개념 갈래는 분야(네트워크/개발/운영/보안) */
export interface Unit {
  id: number;
  track: Track;
  title: string;
  description: string;
  emoji: string;
  conceptIds: ConceptId[];
}

/** 사용자에게 보여주는 5단계 난이도 */
export type Level = 1 | 2 | 3 | 4 | 5;

/** 난이도를 구성하는 세부 요소. 코드가 짧아도 논리적으로 어려울 수 있다. */
export interface DifficultyFactors {
  /** 의미 있는 코드 줄 수 */
  lines: number;
  /** 서로 다른 문법 요소 수 (const, if, =>, .map 등) */
  syntaxCount: number;
  /** 사용 개념 수 */
  conceptCount: number;
  /** 분기·반복·논리 연산 등 (0~5) */
  logic: number;
  /** 값이 여러 단계를 거쳐 변하는 정도 (0~5) */
  dataFlow: number;
  /** 결과를 얻기 위해 머릿속으로 따라가야 하는 깊이 (0~5) */
  reasoning: number;
}

/** 문제가 요구하는 사고 수준 (난이도가 올라갈수록 위로) */
export type Skill = "recall" | "predict" | "analyze" | "infer" | "synthesize";

export type ContentSource = "seed" | "ai";
/** pending: AI 가 만든 개념 문제가 관리자 승인을 기다림 (학습자에게 보이지 않음) */
export type ContentStatus = "published" | "pending" | "rejected";

/**
 * 콘텐츠 묶음 하나.
 * - 코드 갈래: 학습용 코드 하나 + 그 코드를 단계별로 읽는 문제들
 * - 개념 갈래: 한 주제(예: OSI 7계층)의 객관식 문제 묶음. code 는 빈 문자열
 */
export interface CodeItem {
  id: string;
  track: Track;
  /** 코드 갈래의 언어 (개념 갈래는 null) */
  language: Language | null;
  title: string;
  code: string;
  concepts: ConceptId[];
  level: Level;
  factors: DifficultyFactors;
  /** 실제 실행 결과 (브라우저 콘솔 표기). DOM/fetch 처럼 실행할 수 없으면 null */
  output: string | null;
  runnable: boolean;
  source: ContentSource;
  status: ContentStatus;
  createdAt: number;
}

export interface Choice {
  text: string;
  /** 이 보기를 고르면 드러나는 오개념 (오답 원인 분석에 사용) */
  misconception?: string;
}

export interface RubricPoint {
  label: string;
  /** 이 요소를 언급했다고 볼 표현들 (하나라도 포함되면 언급) */
  keywords: string[];
}

/** 주관식 답변에서 잡아낼 대표 오개념 */
export interface MisconceptionPattern {
  label: string;
  /** 이 표현들이 함께 나오면 오개념으로 본다 (모두 포함되어야 함) */
  keywords: string[];
  correction: string;
}

interface QuestionBase {
  id: string;
  codeItemId: string;
  prompt: string;
  skill: Skill;
  /** 단계별 힌트 1~4개 (생각할 질문 → 핵심 짚기 → 설명 → 방향). 다 보면 "정답과 해설 보기" */
  hints: string[];
  explanation: string;
  keyPoint: string;
  /** 코드에서 강조할 줄 (역할 찾기 문제 등) */
  focusLines?: number[];
  /** 코드 갈래: 읽기 단계 */
  stage?: Stage;
  /** 개념 갈래: 관련 자격증 과목 id (CERT_SUBJECTS) — 시험 대비로 골라 풀 때 쓴다 */
  certs?: string[];
}

export interface MultipleChoiceQuestion extends QuestionBase {
  type: "multiple_choice";
  choices: Choice[];
  answerIndex: number;
}

export interface FillBlankQuestion extends QuestionBase {
  type: "fill_blank";
  /** ____ 가 들어간 코드 */
  blankedCode: string;
  choices: Choice[];
  answerIndex: number;
}

export interface PredictQuestion extends QuestionBase {
  type: "predict_output";
  output: string;
  accepted?: string[];
}

export interface ShortAnswerQuestion extends QuestionBase {
  type: "short_answer";
  rubric: RubricPoint[];
  misconceptions: MisconceptionPattern[];
  modelAnswer: string;
}

/** 흐름 따라가기: 따라갈 줄과 그 줄을 실행하기 직전(before)·직후(after)에 물어볼 값 */
export interface TraceWatch {
  /** 1부터 */
  line: number;
  when?: "before" | "after";
  /** 학습자가 채울 값 (변수·식) */
  ask: string[];
  /** 상황 설명으로 보여 줄 값 (예: 반복문의 지금 요소) */
  given?: string[];
}

/** 추적표 한 칸: 그 줄이 실행된 시점의 값 (서버가 실제로 실행해서 기록한 정답) */
export interface TraceRow {
  line: number;
  when: "before" | "after";
  /** "item = {name: '펜', …}" 같은 상황 설명. 없으면 빈 문자열 */
  context: string;
  expr: string;
  /** 콘솔 표기 값 (문자열은 '따옴표') */
  value: string;
}

export interface TraceQuestion extends QuestionBase {
  type: "trace";
  watch: TraceWatch[];
  /** 실행 기록 = 정답. 시드는 작성해 두고 npm run verify 가 실제 실행과 같은지 확인, AI 생성은 실행해서 채운다 */
  rows: TraceRow[];
}

export type Question = MultipleChoiceQuestion | FillBlankQuestion | PredictQuestion | ShortAnswerQuestion | TraceQuestion;

export type QuestionType = Question["type"];

/** 사용자가 제출하는 답 */
export type Answer =
  | { type: "multiple_choice"; index: number }
  | { type: "fill_blank"; index: number }
  | { type: "predict_output"; text: string }
  /** 추적표 칸마다 쓴 값 (rows 순서) */
  | { type: "trace"; values: string[] }
  | { type: "short_answer"; text: string };

export type UnderstandingLevel = "good" | "ok" | "weak";

export interface ConceptCheck {
  label: string;
  level: UnderstandingLevel;
  comment: string;
}

/** 채점 주체: 규칙 기반인지 AI 인지 (비용 추적용) */
export type GradedBy = "rule" | "ai";

export interface Attempt {
  id: number;
  sessionId: string;
  questionId: string;
  codeItemId: string;
  questionType: QuestionType;
  concepts: ConceptId[];
  level: Level;
  correct: boolean;
  partial: boolean;
  hintsUsed: number;
  timeMs: number;
  misconception: string | null;
  gradedBy: GradedBy;
  createdAt: number;
}

/** 유니온 타입의 각 멤버에서 키를 뺀다 (Omit 은 유니온을 합쳐버리므로) */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** codeItemId 가 정해지기 전의 문제 (작성/생성 단계) */
export type QuestionDraft = DistributiveOmit<Question, "codeItemId">;

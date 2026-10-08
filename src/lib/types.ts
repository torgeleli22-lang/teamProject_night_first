export type ConceptId = string;

export interface Concept {
  id: ConceptId;
  name: string;
  unitId: number;
  /** 한 줄 요약: "map = 배열의 각 요소를 변환" */
  keyIdea: string;
  /** 초보자용 짧은 설명 (미리 작성된 개념 설명) */
  summary: string;
  example: string;
}

/** 주제 묶음 (변수/흐름/데이터/함수/배열/브라우저/비동기) */
export interface Unit {
  id: number;
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
export type ContentStatus = "published" | "rejected";

/** 하나의 학습용 코드. 여러 문제(Question)가 이 코드를 공유한다. */
export interface CodeItem {
  id: string;
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
  /** 4단계 힌트: 질문 → 핵심 짚기 → 문법 설명 → 방향 제시 (5단계는 정답+해설) */
  hints: [string, string, string, string];
  explanation: string;
  keyPoint: string;
  /** 코드에서 강조할 줄 (역할 찾기 문제 등) */
  focusLines?: number[];
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

export interface ShuffleQuestion extends QuestionBase {
  type: "shuffle";
  /** 올바른 순서의 코드 조각 */
  pieces: string[];
}

export interface PredictQuestion extends QuestionBase {
  type: "predict_output";
  output: string;
  accepted?: string[];
}

export interface FindBugQuestion extends QuestionBase {
  type: "find_bug";
  buggyCode: string;
  /** 1부터 시작 */
  bugLine: number;
  fixedLine: string;
}

export interface ShortAnswerQuestion extends QuestionBase {
  type: "short_answer";
  rubric: RubricPoint[];
  misconceptions: MisconceptionPattern[];
  modelAnswer: string;
}

export type Question =
  | MultipleChoiceQuestion
  | FillBlankQuestion
  | ShuffleQuestion
  | PredictQuestion
  | FindBugQuestion
  | ShortAnswerQuestion;

export type QuestionType = Question["type"];

/** 사용자가 제출하는 답 */
export type Answer =
  | { type: "multiple_choice"; index: number }
  | { type: "fill_blank"; index: number }
  | { type: "shuffle"; order: number[] }
  | { type: "predict_output"; text: string }
  | { type: "find_bug"; line: number }
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
  learnerId: string;
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

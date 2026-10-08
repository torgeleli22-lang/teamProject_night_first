export type ConceptId = string;

export interface Concept {
  id: ConceptId;
  name: string;
  levelId: number;
  /** 한 줄 요약: "map = 배열의 각 요소를 변환" */
  keyIdea: string;
  /** 초보자용 짧은 설명 (오프라인 개념 설명에 사용) */
  summary: string;
  example: string;
}

export interface Level {
  id: number;
  title: string;
  description: string;
  emoji: string;
  conceptIds: ConceptId[];
}

export type Difficulty = 1 | 2 | 3;

interface ProblemBase {
  id: string;
  conceptIds: ConceptId[];
  difficulty: Difficulty;
  prompt: string;
  code: string;
  /** 단계별 힌트 1~4단계. 5단계는 정답 + explanation */
  hints: [string, string, string, string];
  /** 정답 해설 (짧고 단계적으로) */
  explanation: string;
  /** "💡 핵심 개념"에 표시할 한 줄 */
  keyPoint: string;
  /**
   * 코드를 실제로 실행했을 때의 콘솔 출력 (브라우저 콘솔 표기법).
   * scripts/verify-problems.ts 가 실제 실행 결과와 일치하는지 검사한다.
   */
  output?: string;
  /** DOM 등 Node 에서 실행할 수 없는 코드는 false */
  runnable?: boolean;
}

export interface Choice {
  text: string;
  /** 이 보기를 고르면 드러나는 오개념 (취약 개념 분석에 사용) */
  misconception?: string;
}

export interface ChoiceProblem extends ProblemBase {
  type: "choice";
  /** predict: 실행 결과 고르기, blank: 빈칸 채우기, concept: 개념 선택 */
  subtype: "predict" | "blank" | "concept";
  choices: Choice[];
  answerIndex: number;
}

export interface PredictProblem extends ProblemBase {
  type: "predict";
  output: string;
  /** output 외에 정답으로 인정할 표기 */
  accepted?: string[];
}

export interface BugProblem extends ProblemBase {
  type: "bug";
  /** 1부터 시작하는 오류 줄 번호 */
  bugLine: number;
  fixedLine: string;
}

export interface OrderProblem extends ProblemBase {
  type: "order";
  /** 올바른 순서의 코드 조각. 화면에서는 섞어서 보여준다. */
  pieces: string[];
}

export interface RubricPoint {
  label: string;
  /** 오프라인 채점용 키워드 (하나라도 포함되면 언급한 것으로 본다) */
  keywords: string[];
}

export interface ExplainProblem extends ProblemBase {
  type: "explain";
  rubric: RubricPoint[];
  modelAnswer: string;
}

export type Problem = ChoiceProblem | PredictProblem | BugProblem | OrderProblem | ExplainProblem;
export type ProblemType = Problem["type"];

/** 사용자가 제출하는 답 */
export type Answer =
  | { type: "choice"; index: number }
  | { type: "predict"; text: string }
  | { type: "bug"; line: number }
  | { type: "order"; order: number[] }
  | { type: "explain"; text: string };

export type UnderstandingLevel = "good" | "ok" | "weak";

export interface ConceptCheck {
  label: string;
  level: UnderstandingLevel;
  comment: string;
}

export interface Feedback {
  correct: boolean;
  /** 부분 정답(설명형) 여부 */
  partial?: boolean;
  headline: string;
  explanation: string;
  steps: string[];
  checks: ConceptCheck[];
  misconception?: string;
  nextTip: string;
  source: "ai" | "offline";
}

export interface Attempt {
  problemId: string;
  conceptIds: ConceptId[];
  correct: boolean;
  partial?: boolean;
  hintsUsed: number;
  misconception?: string;
  at: number;
}

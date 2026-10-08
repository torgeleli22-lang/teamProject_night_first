import "server-only";
import { evaluateShortAnswer as aiEvaluate } from "../ai/tutor";
import { choiceMisconception, describeAnswer, describeCorrect, evaluateShortAnswer, gradeObjective } from "../grading";
import { getConcept } from "../curriculum";
import { xpForAttempt } from "../learner/stats";
import type { Answer, ConceptCheck, GradedBy } from "../types";
import { getQuestion } from "./content-repo";
import { insertAttempt, type Learner } from "./learner-repo";
import { unshuffle } from "./session";

/** AI Tutor 영역에 보여줄 내용 */
export interface TutorNote {
  headline: string;
  message: string;
  checks: ConceptCheck[];
  misconception: string | null;
  correction: string | null;
  nextTip: string;
  /** ai: 이번에 AI 가 분석함, rule: 규칙 기반 분석, stored: 미리 저장된 해설/오개념 */
  source: "ai" | "rule" | "stored";
}

export interface AttemptResult {
  attemptId: number;
  correct: boolean;
  partial: boolean;
  xp: number;
  gradedBy: GradedBy;
  myAnswer: string;
  correctAnswer: string;
  steps: string[];
  keyPoint: string;
  output: string | null;
  tutor: TutorNote;
  /** 화면 표시용 정답 정보 */
  answerIndex?: number;
  bugLine?: number;
}

export async function gradeAttempt(
  learner: Learner,
  questionId: string,
  /** null = 정답 보기(포기) */
  rawAnswer: Answer | null,
  hintsUsed: number,
  timeMs: number,
): Promise<AttemptResult | null> {
  const found = getQuestion(questionId);
  if (!found) return null;
  const { question: q, item } = found;
  // 셔플 답은 화면에 섞어서 보여준 순서 기준이므로 원래 인덱스로 되돌린다
  const answer: Answer | null = rawAnswer?.type === "shuffle" ? { type: "shuffle", order: unshuffle(q, rawAnswer.order) } : rawAnswer;

  let correct: boolean;
  let partial = false;
  let gradedBy: GradedBy = "rule";
  let tutor: TutorNote;
  let misconception: string | null = null;

  if (!answer) {
    correct = false;
    tutor = {
      headline: "정답과 해설",
      message: "괜찮아요. 해설을 천천히 읽고, 비슷한 문제로 다시 확인해 봐요.",
      checks: [],
      misconception: null,
      correction: null,
      nextTip: q.keyPoint,
      source: "stored",
    };
  } else if (q.type === "short_answer" && answer.type === "short_answer") {
    // 주관식: 1차 규칙 평가 → 필요할 때만 AI
    const rule = evaluateShortAnswer(q, answer.text);
    const fb = await aiEvaluate(q, item, answer.text, rule);
    correct = fb.verdict === "correct";
    partial = fb.verdict === "partial";
    gradedBy = fb.gradedBy;
    misconception = fb.misconception;
    tutor = {
      headline: fb.headline,
      message: fb.explanation,
      checks: fb.checks,
      misconception: fb.misconception,
      correction: fb.correction,
      nextTip: fb.nextTip,
      source: fb.gradedBy === "ai" ? "ai" : "rule",
    };
  } else {
    // 객관식·빈칸·셔플·결과 예측·오류 찾기: 규칙 채점, 미리 저장된 오개념/해설 사용 (AI 호출 없음)
    correct = gradeObjective(q, answer);
    misconception = choiceMisconception(q, answer) ?? null;
    const concept = getConcept(item.concepts[0]);
    tutor = {
      headline: correct ? (hintsUsed > 0 ? "힌트를 활용해서 해냈어요!" : "정답이에요!") : "아쉬워요, 같이 확인해 봐요",
      message: correct
        ? "왜 그런지 한 단계씩 확인해 볼까요?"
        : misconception
          ? `이 답을 고른 걸 보니 '${misconception}' 이렇게 생각했을 수 있어요. 아래 흐름을 따라가 보세요.`
          : "코드를 한 줄씩 다시 따라가 보면 어디서 생각이 달라졌는지 보일 거예요.",
      checks: [],
      misconception,
      correction: !correct && misconception && concept ? concept.keyIdea : null,
      nextTip: q.keyPoint,
      source: "stored",
    };
  }

  const level = item.level;
  const attemptId = insertAttempt({
    learnerId: learner.id,
    questionId: q.id,
    codeItemId: item.id,
    questionType: q.type,
    concepts: item.concepts,
    level,
    correct,
    partial,
    hintsUsed: answer ? hintsUsed : 5,
    timeMs,
    misconception,
    gradedBy,
    answer: answer ?? { type: "short_answer", text: "(정답 보기)" },
  });

  return {
    attemptId,
    correct,
    partial,
    xp: xpForAttempt({ correct, partial, hintsUsed, level }),
    gradedBy,
    myAnswer: answer ? describeAnswer(q, answer) : "",
    correctAnswer: describeCorrect(q),
    steps: q.explanation.split("\n").filter((s) => s.trim()),
    keyPoint: q.keyPoint,
    output: item.output,
    tutor,
    ...(q.type === "multiple_choice" || q.type === "fill_blank" ? { answerIndex: q.answerIndex } : {}),
    ...(q.type === "find_bug" ? { bugLine: q.bugLine } : {}),
  };
}

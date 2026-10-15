import { evaluateShortAnswer as aiEvaluate } from "../ai/tutor";
import { choiceMisconception, describeAnswer, describeCorrect, evaluateShortAnswer, gradeObjective, gradeTrace } from "../grading";
import { getConcept } from "../curriculum";
import { xpForAttempt } from "../learner/stats";
import type { Answer, ConceptCheck, GradedBy } from "../types";
import { getQuestion } from "./content-repo";
import { insertAttempt, type SessionInfo } from "./session-repo";
import { displayChoiceIndex, unshuffleAnswer } from "./planner";

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
  /** 화면 표시용 정답 보기 번호 (화면에 섞어 보인 순서 기준) */
  answerIndex?: number;
  /** 흐름 따라가기: 칸마다 정답과 맞았는지 */
  cells?: { expected: string; ok: boolean }[];
}

export async function gradeAttempt(
  session: SessionInfo,
  questionId: string,
  /** null = 정답 보기(포기) */
  rawAnswer: Answer | null,
  hintsUsed: number,
  timeMs: number,
  /** false 면 주관식도 규칙으로만 평가 (AI 요청 한도를 넘었을 때) */
  allowAi = true,
): Promise<AttemptResult | null> {
  const found = await getQuestion(questionId);
  if (!found) return null;
  const { question: q, item } = found;
  // 보기는 화면에 섞어서 보여 주므로, 고른 번호를 원래 보기 번호로 되돌린다
  const answer: Answer | null = rawAnswer ? unshuffleAnswer(q, rawAnswer) : null;

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
    const fb = await aiEvaluate(q, item, answer.text, rule, false, allowAi);
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
  } else if (q.type === "trace" && answer.type === "trace") {
    // 흐름 따라가기: 칸마다 실행 기록과 비교 (AI 호출 없음). 절반 이상 맞으면 부분 정답
    const ok = gradeTrace(q, answer.values);
    const right = ok.filter(Boolean).length;
    correct = right === ok.length;
    partial = !correct && right * 2 >= ok.length;
    const firstWrong = ok.indexOf(false);
    tutor = {
      headline: correct ? "흐름을 정확히 따라갔어요!" : partial ? `${ok.length}칸 중 ${right}칸 맞았어요` : "같이 한 줄씩 따라가 봐요",
      message: correct
        ? "줄마다 값이 어떻게 바뀌는지 머릿속으로 실행해 냈어요."
        : `${q.rows[firstWrong].line}번째 줄${q.rows[firstWrong].context ? ` (${q.rows[firstWrong].context})` : ""}부터 다시 따라가 보세요. 그 줄이 실행되기 전 값에서 무엇이 바뀌는지 보면 돼요.`,
      checks: [],
      misconception: null,
      correction: null,
      nextTip: q.keyPoint,
      source: "stored",
    };
  } else {
    // 객관식·빈칸·결과 예측: 규칙 채점, 미리 저장된 오개념/해설 사용 (AI 호출 없음)
    correct = gradeObjective(q, answer);
    misconception = choiceMisconception(q, answer) ?? null;
    const concept = getConcept(item.concepts[0]);
    tutor = {
      headline: correct ? (hintsUsed > 0 ? "힌트를 활용해서 해냈어요!" : "정답이에요!") : "아쉬워요, 같이 확인해 봐요",
      message: correct
        ? "왜 그런지 한 단계씩 확인해 볼까요?"
        : misconception
          ? `이 답을 고른 걸 보니 '${misconception}' 이렇게 생각했을 수 있어요. 아래 흐름을 따라가 보세요.`
          : item.track === "theory"
            ? "해설을 읽으며 비슷한 개념끼리 무엇이 다른지 정리해 봐요."
            : "코드를 한 줄씩 다시 따라가 보면 어디서 생각이 달라졌는지 보일 거예요.",
      checks: [],
      misconception,
      correction: !correct && misconception && concept ? concept.keyIdea : null,
      nextTip: q.keyPoint,
      source: "stored",
    };
  }

  const level = item.level;
  const attemptId = await insertAttempt({
    sessionId: session.id,
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
    ...(q.type === "multiple_choice" || q.type === "fill_blank" ? { answerIndex: displayChoiceIndex(q, q.answerIndex) } : {}),
    ...(q.type === "trace" ? { cells: q.rows.map((r, i) => ({ expected: r.value, ok: answer?.type === "trace" ? gradeTrace(q, answer.values)[i] : false })) } : {}),
  };
}

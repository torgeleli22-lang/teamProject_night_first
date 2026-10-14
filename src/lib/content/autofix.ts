import { evaluateShortAnswer, sameOutput } from "../grading";
import type { Question } from "../types";

/**
 * AI 가 만든 문제에서 '코드만 보면 정답이 정해지는 값'을 규칙으로 바로잡는다 (AI 호출 없음).
 * AI 가 계산을 조금 틀렸다는 이유만으로 세트 전체가 반려되는 일을 줄인다.
 * 고칠 수 없는 문제(보기 중 정답이 없음 등)는 그대로 두고, 이어지는 실행 검증이 잡아낸다.
 *
 * - 출력 예측: 정답을 실제 실행 결과로
 * - 실행 결과를 묻는 객관식: 실제 결과와 같은 보기가 하나뿐이면 그 보기를 정답으로
 * - 빈칸: 채웠을 때 원본 코드와 같아지는 보기가 하나뿐이면 그 보기를 정답으로
 * - 주관식: 모범 답안에도 들어 있는 '오개념 표현'은 정답을 오답으로 만들므로 뺀다
 */
export function autoFixQuestions(code: string, actualOutput: string | null, questions: Question[]): { questions: Question[]; fixes: string[] } {
  const fixes: string[] = [];
  const squash = (s: string) => s.replace(/\s+/g, "");

  const fixed = questions.map((q): Question => {
    const tag = `[${q.id}]`;
    switch (q.type) {
      case "predict_output": {
        if (actualOutput === null || !actualOutput.trim() || sameOutput(q.output, actualOutput)) return q;
        fixes.push(`${tag} 출력 예측 정답을 실제 실행 결과로 바꿈`);
        return { ...q, output: actualOutput.trimEnd() };
      }
      case "multiple_choice": {
        if (q.skill !== "predict" || actualOutput === null || !actualOutput.trim()) return q;
        const matching = q.choices.map((c, i) => (sameOutput(c.text, actualOutput) ? i : -1)).filter((i) => i >= 0);
        if (matching.length !== 1 || matching[0] === q.answerIndex) return q;
        fixes.push(`${tag} 실행 결과와 같은 보기(${matching[0] + 1}번)를 정답으로 바꿈`);
        return { ...q, answerIndex: matching[0] };
      }
      case "fill_blank": {
        if (q.blankedCode.split("____").length - 1 !== 1) return q;
        const whole = squash(code);
        const matching = q.choices.map((c, i) => (whole.includes(squash(q.blankedCode.replace("____", c.text))) ? i : -1)).filter((i) => i >= 0);
        if (matching.length !== 1 || matching[0] === q.answerIndex) return q;
        fixes.push(`${tag} 원본 코드와 같아지는 보기(${matching[0] + 1}번)를 정답으로 바꿈`);
        return { ...q, answerIndex: matching[0] };
      }
      case "short_answer": {
        const kept = q.misconceptions.filter((m) => !evaluateShortAnswer({ ...q, rubric: [], misconceptions: [m] }, q.modelAnswer).misconceptions.length);
        if (kept.length === q.misconceptions.length) return q;
        fixes.push(`${tag} 모범 답안에도 들어 있는 오개념 표현 ${q.misconceptions.length - kept.length}개를 뺌`);
        return { ...q, misconceptions: kept };
      }
      default:
        return q;
    }
  });
  return { questions: fixed, fixes };
}

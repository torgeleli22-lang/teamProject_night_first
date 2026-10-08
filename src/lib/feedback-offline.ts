import { conceptName, getConcept } from "./curriculum";
import { normalizeOutput } from "./grading";
import type { Answer, ConceptCheck, Feedback, Problem } from "./types";

/**
 * AI 없이 만드는 기본 피드백 (미리 작성된 해설 + 규칙 기반 분석).
 * 서버(오프라인 튜터)와 클라이언트(네트워크 오류 시) 모두에서 사용한다.
 */
export function offlineFeedback(
  problem: Problem,
  answer: Answer,
  graded: boolean | null,
  hintsUsed: number,
  misconception: string | undefined,
): Feedback {
  const steps = problem.explanation.split("\n").filter((s) => s.trim());

  if (problem.type === "explain" && answer.type === "explain") {
    const text = answer.text.toLowerCase();
    const checks: ConceptCheck[] = problem.rubric.map((point) => {
      const hit = point.keywords.some((k) => text.includes(k.toLowerCase()));
      return {
        label: point.label,
        level: hit ? "good" : "weak",
        comment: hit ? "설명에 잘 담겨 있어요." : "이 부분에 대한 설명이 빠져 있어요.",
      };
    });
    const hits = checks.filter((c) => c.level === "good").length;
    const tooShort = answer.text.trim().length < 10;
    const correct = !tooShort && hits === checks.length;
    const partial = !tooShort && !correct && hits > 0;
    return {
      correct,
      partial,
      headline: correct ? "핵심을 잘 설명했어요!" : partial ? "절반 이상 왔어요" : "조금 더 자세히 설명해 볼까요?",
      explanation: correct
        ? "코드가 왜 그렇게 동작하는지 필요한 요소를 모두 짚었어요. 아래 모범 설명과 비교해 보세요."
        : `${checks.filter((c) => c.level === "weak").map((c) => c.label).join(", ")}에 대한 설명이 더 필요해요. 모범 설명과 비교해 보세요.\n\n모범 설명: ${problem.modelAnswer}`,
      steps,
      checks,
      nextTip: problem.keyPoint,
      source: "offline",
    };
  }

  const correct = graded === true;
  let explanation = correct
    ? hintsUsed > 0
      ? "힌트를 활용해서 스스로 답을 찾아냈어요. 왜 그런지 한 단계씩 다시 짚어볼까요?"
      : "코드를 정확하게 읽었어요. 왜 그런지 한 단계씩 확인해 볼까요?"
    : "괜찮아요. 코드를 한 줄씩 다시 따라가 보면 금방 보일 거예요.";

  if (!correct && problem.type === "predict" && answer.type === "predict") {
    const mine = normalizeOutput(answer.text);
    const expected = normalizeOutput(problem.output);
    let same = 0;
    while (same < mine.length && same < expected.length && mine[same] === expected[same]) same++;
    if (same > 0) explanation = `출력의 처음 ${same}줄까지는 정확하게 읽었어요! 그 다음 줄에서 생각이 달라졌어요.`;
    else if (mine.length !== expected.length)
      explanation = `실제로는 ${expected.length}줄이 출력돼요. 출력되는 줄 수부터 다시 세어볼까요?`;
  }
  if (!correct && misconception) explanation += `\n혹시 '${misconception}' 이렇게 생각하지 않았나요?`;

  const checks: ConceptCheck[] = problem.conceptIds.map((id) => ({
    label: conceptName(id),
    level: correct ? (hintsUsed === 0 ? "good" : "ok") : "weak",
    comment: correct
      ? hintsUsed === 0
        ? "스스로 정확하게 이해했어요."
        : "힌트를 보고 이해했어요. 한 번 더 풀면 확실해질 거예요."
      : getConcept(id)?.keyIdea ?? "",
  }));

  return {
    correct,
    headline: correct ? "정답이에요!" : "아쉬워요, 같이 확인해 봐요",
    explanation,
    steps,
    checks,
    misconception,
    nextTip: problem.keyPoint,
    source: "offline",
  };
}

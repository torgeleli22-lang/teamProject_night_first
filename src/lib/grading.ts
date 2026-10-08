import type { Answer, Problem } from "./types";

/** 출력 비교용 정규화: 줄 단위로 공백 제거, 따옴표 통일, 빈 줄 제거 */
export function normalizeOutput(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/[“”"`]/g, "'")
        .replace(/[‘’]/g, "'")
        .replace(/;$/, "")
        .replace(/\s+/g, ""),
    )
    .filter((line) => line.length > 0);
}

function sameOutput(a: string, b: string): boolean {
  const na = normalizeOutput(a);
  const nb = normalizeOutput(b);
  return na.length === nb.length && na.every((line, i) => line === nb[i]);
}

/**
 * 객관식/입력형/오류찾기/순서맞추기는 결정적으로 채점한다.
 * 설명형(explain)은 AI(또는 오프라인 루브릭)가 채점하므로 null 을 돌려준다.
 */
export function gradeAnswer(problem: Problem, answer: Answer): boolean | null {
  if (problem.type !== answer.type) return false;
  switch (problem.type) {
    case "choice":
      return (answer as { index: number }).index === problem.answerIndex;
    case "predict": {
      const text = (answer as { text: string }).text;
      return [problem.output, ...(problem.accepted ?? [])].some((ok) => sameOutput(text, ok));
    }
    case "bug":
      return (answer as { line: number }).line === problem.bugLine;
    case "order": {
      const order = (answer as { order: number[] }).order;
      if (order.length !== problem.pieces.length) return false;
      // 같은 텍스트의 조각(예: "}")이 여러 개일 수 있으므로 인덱스가 아니라 텍스트 순서로 비교한다.
      return order.every((pieceIndex, i) => problem.pieces[pieceIndex] === problem.pieces[i]);
    }
    case "explain":
      return null;
  }
}

/** 사용자의 답을 사람이 읽을 수 있는 문자열로 (AI 프롬프트와 화면 표시에 사용) */
export function describeAnswer(problem: Problem, answer: Answer): string {
  switch (answer.type) {
    case "choice":
      return problem.type === "choice" ? (problem.choices[answer.index]?.text ?? "(선택 안 함)") : "";
    case "predict":
    case "explain":
      return answer.text.trim() || "(빈 답변)";
    case "bug":
      return `${answer.line}번째 줄`;
    case "order":
      return problem.type === "order" ? answer.order.map((i) => problem.pieces[i]).join("\n") : "";
  }
}

/** 정답을 사람이 읽을 수 있는 문자열로 */
export function describeCorrect(problem: Problem): string {
  switch (problem.type) {
    case "choice":
      return problem.choices[problem.answerIndex].text;
    case "predict":
      return problem.output;
    case "bug":
      return `${problem.bugLine}번째 줄 → ${problem.fixedLine.trim()}`;
    case "order":
      return problem.pieces.join("\n");
    case "explain":
      return problem.modelAnswer;
  }
}

/** 선택한 보기에 연결된 오개념 */
export function detectMisconception(problem: Problem, answer: Answer): string | undefined {
  if (problem.type === "choice" && answer.type === "choice") {
    return problem.choices[answer.index]?.misconception;
  }
  return undefined;
}

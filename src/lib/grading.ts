import type { Answer, ConceptCheck, MisconceptionPattern, Question, ShortAnswerQuestion } from "./types";

/** 출력 비교용 정규화: 줄 단위로 공백 제거, 따옴표 통일, 빈 줄 제거 */
export function normalizeOutput(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/[“”"`‘’]/g, "'")
        .replace(/;$/, "")
        .replace(/\s+/g, ""),
    )
    .filter((line) => line.length > 0);
}

export function sameOutput(a: string, b: string): boolean {
  const na = normalizeOutput(a);
  const nb = normalizeOutput(b);
  return na.length === nb.length && na.every((line, i) => line === nb[i]);
}

/**
 * 객관식·빈칸·셔플·결과 예측·오류 찾기는 정답이 정해져 있으므로 규칙으로 채점한다 (AI 호출 없음).
 * 주관식은 evaluateShortAnswer 를 쓴다.
 */
export function gradeObjective(q: Question, answer: Answer): boolean {
  if (q.type !== answer.type) return false;
  switch (q.type) {
    case "multiple_choice":
    case "fill_blank":
      return (answer as { index: number }).index === q.answerIndex;
    case "predict_output": {
      const text = (answer as { text: string }).text;
      return [q.output, ...(q.accepted ?? [])].some((ok) => sameOutput(text, ok));
    }
    case "find_bug":
      return (answer as { line: number }).line === q.bugLine;
    case "shuffle": {
      const order = (answer as { order: number[] }).order;
      // 같은 텍스트의 조각(예: "}")이 여러 개일 수 있으므로 텍스트 순서로 비교
      return order.length === q.pieces.length && order.every((pieceIndex, i) => q.pieces[pieceIndex] === q.pieces[i]);
    }
    case "short_answer":
      return false;
  }
}

// ───────────────────────── 주관식 1차 규칙 평가 ─────────────────────────

export type RuleVerdict = "correct" | "partial" | "incorrect";

export interface RuleEvaluation {
  verdict: RuleVerdict;
  checks: ConceptCheck[];
  misconceptions: MisconceptionPattern[];
  /** AI 에게 넘겨야 하는 이유. 비어 있으면 규칙 결과를 그대로 쓴다 */
  aiReasons: string[];
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

function mentions(text: string, keyword: string): boolean {
  return squash(text).includes(squash(keyword));
}

const MIN_EFFORT = 4;
const SHORT = 15;

/**
 * 주관식 답변을 먼저 규칙으로 평가한다.
 * 핵심 요소를 모두 담았고 오개념 표현이 없으면 AI 없이 정답 처리하고,
 * 너무 짧거나 / 일부 요소가 빠졌거나 / 오개념 표현이 있거나 / 판단이 어려우면 AI 평가를 요청한다.
 */
export function evaluateShortAnswer(q: ShortAnswerQuestion, text: string): RuleEvaluation {
  const length = squash(text).length;
  const checks: ConceptCheck[] = q.rubric.map((point) => {
    const hit = point.keywords.some((k) => mentions(text, k));
    return { label: point.label, level: hit ? "good" : "weak", comment: hit ? "설명에 담겨 있어요." : "이 부분에 대한 설명이 빠져 있어요." };
  });
  const misconceptions = q.misconceptions.filter((m) => m.keywords.every((k) => mentions(text, k)));
  const hits = checks.filter((c) => c.level === "good").length;

  if (length < MIN_EFFORT) {
    return { verdict: "incorrect", checks, misconceptions, aiReasons: [] };
  }

  const aiReasons: string[] = [];
  if (length < SHORT) aiReasons.push("답변이 짧음");
  if (misconceptions.length) aiReasons.push("오개념 표현 포함");
  if (hits > 0 && hits < checks.length) aiReasons.push("핵심 요소 일부 누락");
  if (hits === 0) aiReasons.push("규칙으로 판단 어려움");

  const verdict: RuleVerdict =
    hits === checks.length && !misconceptions.length ? "correct" : hits * 2 >= checks.length ? "partial" : "incorrect";
  return { verdict, checks, misconceptions, aiReasons };
}

// ───────────────────────── 표시용 ─────────────────────────

/** 사용자의 답을 사람이 읽을 수 있는 문자열로 */
export function describeAnswer(q: Question, answer: Answer): string {
  switch (answer.type) {
    case "multiple_choice":
    case "fill_blank":
      return q.type === "multiple_choice" || q.type === "fill_blank" ? (q.choices[answer.index]?.text ?? "(선택 안 함)") : "";
    case "predict_output":
    case "short_answer":
      return answer.text.trim() || "(빈 답변)";
    case "find_bug":
      return `${answer.line}번째 줄`;
    case "shuffle":
      return q.type === "shuffle" ? answer.order.map((i) => q.pieces[i]).join("\n") : "";
  }
}

/** 정답을 사람이 읽을 수 있는 문자열로 */
export function describeCorrect(q: Question): string {
  switch (q.type) {
    case "multiple_choice":
    case "fill_blank":
      return q.choices[q.answerIndex].text;
    case "predict_output":
      return q.output;
    case "find_bug":
      return `${q.bugLine}번째 줄 → ${q.fixedLine.trim()}`;
    case "shuffle":
      return q.pieces.join("\n");
    case "short_answer":
      return q.modelAnswer;
  }
}

/** 선택한 보기에 미리 연결된 오개념 (AI 없이 오답 원인 표시) */
export function choiceMisconception(q: Question, answer: Answer): string | undefined {
  if ((q.type === "multiple_choice" || q.type === "fill_blank") && answer.type === q.type) {
    return q.choices[answer.index]?.misconception;
  }
  return undefined;
}

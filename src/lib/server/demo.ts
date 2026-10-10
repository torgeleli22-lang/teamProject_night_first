import "server-only";
import { runLearnerAnalysis } from "../ai/analysis";
import type { Answer, Level, Question } from "../types";
import { loadContent } from "./content-repo";
import { insertAttempt, resetSession, setPreferredLevel } from "./session-repo";

/**
 * UI/UX 확인용 데모 학습자. 현재 브라우저의 학습자 기록을 지우고 가상의 풀이 기록을 넣는다.
 * (AI_MODE=mock 또는 개발 모드에서만 사용)
 */
export const PERSONAS = {
  empty: { label: "처음 온 학습자", description: "기록 없음. 첫 화면과 빈 상태를 확인해요." },
  steady: { label: "꾸준한 학습자", description: "5일 동안 기초를 안정적으로 푼 기록 (정답률 높음 → 난이도 상향 추천)" },
  confused: { label: "map·filter 를 혼동하는 학습자", description: "6일 동안 26문제. 배열 메서드에서 같은 오개념을 반복 → AI 분석과 맞춤 복습 생성" },
} as const;

export type Persona = keyof typeof PERSONAS;

interface Plan {
  concept: string;
  /** 정답 여부 패턴 (true = 정답) */
  results: boolean[];
  hints?: number;
}

const PLANS: Record<Exclude<Persona, "empty">, { level: Level; days: number; plans: Plan[] }> = {
  steady: {
    level: 3,
    days: 5,
    plans: [
      { concept: "variables", results: [true, true, true, true] },
      { concept: "let-const", results: [true, true, true] },
      { concept: "data-types", results: [true, false, true] },
      { concept: "operators", results: [true, true, true] },
      { concept: "if-else", results: [true, true, true, true] },
      { concept: "for", results: [true, true, false, true] },
    ],
  },
  confused: {
    level: 3,
    days: 6,
    plans: [
      { concept: "variables", results: [true, true, true] },
      { concept: "if-else", results: [true, true, false, true] },
      { concept: "arrays", results: [true, true, true] },
      { concept: "functions", results: [true, false, true] },
      { concept: "map", results: [false, true, false, false, true], hints: 2 },
      { concept: "filter", results: [false, false, true, false], hints: 1 },
      { concept: "for-each", results: [false, true, false, false] },
    ],
  },
};

/** 오답일 때 오개념이 연결된 보기를 고른 것처럼 만든다 */
function fakeAnswer(q: Question, correct: boolean): { answer: Answer; misconception: string | null } {
  switch (q.type) {
    case "multiple_choice":
    case "fill_blank": {
      if (correct) return { answer: { type: q.type, index: q.answerIndex }, misconception: null };
      const wrong = q.choices.findIndex((c, i) => i !== q.answerIndex && c.misconception) ;
      const index = wrong >= 0 ? wrong : (q.answerIndex + 1) % q.choices.length;
      return { answer: { type: q.type, index }, misconception: q.choices[index].misconception ?? null };
    }
    case "predict_output":
      return { answer: { type: q.type, text: correct ? q.output : "모르겠어요" }, misconception: null };
    case "find_bug":
      return { answer: { type: q.type, line: correct ? q.bugLine : Math.max(1, q.bugLine - 1) }, misconception: null };
    case "shuffle":
      return { answer: { type: q.type, order: correct ? q.pieces.map((_, i) => i) : q.pieces.map((_, i) => i).reverse() }, misconception: null };
    case "short_answer":
      return { answer: { type: q.type, text: correct ? q.modelAnswer : "map 으로 골라서 새 배열을 만들어요" }, misconception: correct ? null : "map 이 요소를 고른다고 생각" };
  }
}

export async function loadPersona(sessionId: string, persona: Persona) {
  resetSession(sessionId);
  if (persona === "empty") return;
  const { level, days, plans } = PLANS[persona];
  setPreferredLevel(sessionId, level);
  const { items, byItem } = loadContent();

  // 시간 순서대로 하루에 몇 문제씩 나눠서 기록
  const total = plans.reduce((s, p) => s + p.results.length, 0);
  let n = 0;
  for (const plan of plans) {
    const questions = [...items.values()]
      .filter((i) => i.concepts[0] === plan.concept)
      .sort((a, b) => a.level - b.level)
      .flatMap((i) => (byItem.get(i.id) ?? []).map((q) => ({ q, item: i })));
    plan.results.forEach((correct, k) => {
      const pick = questions[k % Math.max(questions.length, 1)];
      if (!pick) return;
      const { answer, misconception } = fakeAnswer(pick.q, correct);
      const dayOffset = days - 1 - Math.floor((n / total) * days);
      insertAttempt({
        sessionId,
        questionId: pick.q.id,
        codeItemId: pick.item.id,
        questionType: pick.q.type,
        concepts: pick.item.concepts,
        level: pick.item.level,
        correct,
        partial: false,
        hintsUsed: correct ? 0 : (plan.hints ?? 1),
        timeMs: (correct ? 15 : 40) * 1000 + (n % 5) * 3000,
        misconception,
        gradedBy: pick.q.type === "short_answer" && !correct ? "ai" : "rule",
        answer,
        createdAt: Date.now() - dayOffset * 86400_000 - (total - n) * 60_000,
      });
      n++;
    });
  }
  // 10문제마다 하는 학습자 분석을 데모에서도 한 번 실행 (목업 모드면 AI 흉내, 아니면 규칙 기반)
  await runLearnerAnalysis(sessionId, level);
}

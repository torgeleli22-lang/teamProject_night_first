import { getConcept } from "../curriculum";
import type { ConceptId, Level } from "../types";

/**
 * AI 문제 생성 기준 (docs/ai-generation-policy.md 의 초안을 코드로 옮긴 것).
 * 팀에서 숫자만 바꾸면 되도록 기준값을 이곳 한 곳에 모은다.
 *
 * 핵심 원칙
 *  - 생성은 "칸(개념 × 난이도)" 단위. 한 번에 코드 1개 + 6가지 유형 문제 세트를 만든다.
 *  - 난이도/유형을 '바꿨다'는 이유만으로는 생성하지 않는다. 기준은 '재고'와 '수요'.
 *  - 생성된 문제는 모든 학습자가 공유한다 → 생성 비용이 사용자 수에 비례하지 않는다.
 */
export const POLICY = {
  /** 칸마다 최소한 있어야 하는 공개 문제 수 (≈ 코드 세트 2개). 출시 전 채우기 목표이자 운영 중 하한선 */
  minStock: 12,
  /** 칸마다 최대 문제 수 (≈ 코드 세트 7개). 넘으면 더 만들지 않고 틀린 문제·오래된 문제를 다시 낸다 */
  maxStock: 40,
  /** 한 학습자가 그 칸에서 아직 안 푼 문제가 이 수보다 적으면 '소진' */
  learnerLow: 4,
  /** 최근 demandWindowDays 안에 이 수 이상의 서로 다른 학습자가 소진하면 생성 (한 사람 때문에 만들지 않음) */
  demandLearners: 2,
  demandWindowDays: 7,
  /** 학습자 분석에서 혼동이 발견됐을 때 맞춤 복습 세트 생성: 학습자당 하루 최대 */
  personalPerLearnerPerDay: 1,
  /** 전체 생성 상한 (비용 안전장치) */
  dailyLimit: Number(process.env.AI_GENERATION_DAILY_LIMIT ?? 30),
  monthlyBudgetUsd: Number(process.env.AI_MONTHLY_BUDGET_USD ?? 30),
} as const;

/**
 * 개념별로 AI 생성을 허용하는 난이도.
 * - 단원 성격에 맞지 않는 칸(예: 변수 심화)은 만들지 않는다.
 * - DOM·이벤트·fetch 는 서버에서 실행 검증을 할 수 없어 사람이 작성한 문제만 쓴다 (빈 배열).
 */
const LEVELS_BY_UNIT: Record<number, Level[]> = {
  1: [1, 2, 3], // 변수·let/const·데이터 타입·연산자
  2: [1, 2, 3], // 조건문·반복문
  3: [2, 3, 4], // 배열·객체·문자열
  4: [2, 3, 4], // 함수·화살표 함수·스코프
  5: [3, 4, 5], // map·filter·forEach·find·reduce
  6: [], // DOM·이벤트 (사람 작성)
  7: [4, 5], // Promise·async/await
};
const HUMAN_ONLY = new Set<ConceptId>(["fetch"]);

export function generatableLevels(concept: ConceptId): Level[] {
  const c = getConcept(concept);
  if (!c || HUMAN_ONLY.has(concept)) return [];
  return LEVELS_BY_UNIT[c.unitId] ?? [];
}

export const isGeneratable = (concept: ConceptId, level: Level) => generatableLevels(concept).includes(level);

export type Trigger = "launch_fill" | "stock_floor" | "demand" | "personal_review" | "manual";

export const TRIGGER_LABEL: Record<Trigger, string> = {
  launch_fill: "출시 전 채우기",
  stock_floor: "재고 하한 미달",
  demand: "여러 학습자 소진",
  personal_review: "맞춤 복습 (혼동 발견)",
  manual: "관리자 수동",
};

export type Decision =
  | { generate: true; trigger: Trigger; reason: string }
  | { generate: false; reason: string; recordDemand?: boolean };

/**
 * 학습 세션을 시작할 때 이 칸을 새로 생성할지 결정한다.
 * @param stock        칸의 공개 문제 수 (모든 학습자 공유)
 * @param unsolved     이 학습자가 그 칸에서 아직 안 푼 문제 수
 * @param demand       최근 기간에 이 칸을 소진한 서로 다른 학습자 수 (이번 학습자 포함)
 */
export function decideOnSession(input: { concept: ConceptId; level: Level; stock: number; unsolved: number; demand: number }): Decision {
  const { concept, level, stock, unsolved, demand } = input;
  if (!isGeneratable(concept, level)) return { generate: false, reason: "이 칸은 AI 생성 대상이 아님 (사람 작성 또는 난이도 범위 밖)" };
  if (stock < POLICY.minStock) {
    return { generate: true, trigger: "stock_floor", reason: `공개 문제 ${stock}개 < 최소 ${POLICY.minStock}개` };
  }
  if (unsolved >= POLICY.learnerLow) return { generate: false, reason: "안 푼 문제가 충분함" };
  // 여기부터는 이 학습자가 칸을 소진한 상태 → 수요 신호를 기록한다
  if (stock >= POLICY.maxStock) return { generate: false, reason: `최대 ${POLICY.maxStock}개 도달 → 틀린·오래된 문제를 다시 출제`, recordDemand: true };
  if (demand >= POLICY.demandLearners) {
    return { generate: true, trigger: "demand", reason: `최근 ${POLICY.demandWindowDays}일 동안 ${demand}명이 소진` };
  }
  return { generate: false, reason: `소진한 학습자 ${demand}명 < ${POLICY.demandLearners}명 → 기존 문제 재출제`, recordDemand: true };
}

/** 학습자 분석에서 혼동이 발견됐을 때 맞춤 복습 세트를 만들지 결정한다. */
export function decidePersonal(input: {
  concept: ConceptId;
  level: Level;
  stock: number;
  unsolved: number;
  personalToday: number;
}): Decision {
  const { concept, level, stock, unsolved, personalToday } = input;
  if (!isGeneratable(concept, level)) return { generate: false, reason: "AI 생성 대상이 아닌 칸" };
  if (personalToday >= POLICY.personalPerLearnerPerDay) return { generate: false, reason: "오늘 이 학습자의 맞춤 생성 한도 도달" };
  if (stock >= POLICY.maxStock) return { generate: false, reason: "칸이 이미 가득 참" };
  if (unsolved >= POLICY.learnerLow * 2) return { generate: false, reason: "복습할 기존 문제가 충분함" };
  return { generate: true, trigger: "personal_review", reason: "학습자 분석에서 혼동이 발견되고 복습할 문제가 부족함" };
}

/** 출시 전 채우기: 생성 대상 칸 중 최소 재고에 못 미치는 칸과 필요한 세트 수 */
export function launchFillPlan(stockOf: (concept: ConceptId, level: Level) => number, concepts: ConceptId[]) {
  const QUESTIONS_PER_SET = 6;
  return concepts.flatMap((concept) =>
    generatableLevels(concept)
      .map((level) => ({ concept, level, stock: stockOf(concept, level) }))
      .filter((c) => c.stock < POLICY.minStock)
      .map((c) => ({ ...c, sets: Math.ceil((POLICY.minStock - c.stock) / QUESTIONS_PER_SET) })),
  );
}

import "server-only";
import { blankedDisplay, seededPermutation } from "../content/code-utils";
import { CONCEPTS, UNITS } from "../curriculum";
import { conceptStats, isWeak, MASTERED } from "../learner/stats";
import type { Attempt, CodeItem, ConceptId, Level, Question, QuestionType, Skill } from "../types";
import { loadContent } from "./content-repo";

/** 클라이언트로 보내는 문제 (정답·해설·채점 기준은 빼고 보낸다) */
export interface PublicQuestion {
  id: string;
  codeItemId: string;
  codeTitle: string;
  type: QuestionType;
  skill: Skill;
  prompt: string;
  /** 화면에 보여줄 코드 (오류 찾기는 오류 코드, 빈칸은 빈칸이 들어간 코드). 셔플은 빈 문자열 */
  code: string;
  concepts: ConceptId[];
  level: Level;
  focusLines: number[];
  choices?: string[];
  /** 섞인 순서의 코드 조각 (답은 이 배열의 인덱스로 제출) */
  pieces?: string[];
}

export function toPublic(q: Question, item: CodeItem): PublicQuestion {
  const base = {
    id: q.id,
    codeItemId: item.id,
    codeTitle: item.title,
    type: q.type,
    skill: q.skill,
    prompt: q.prompt,
    concepts: item.concepts,
    level: item.level,
    focusLines: q.focusLines ?? [],
  };
  switch (q.type) {
    case "multiple_choice":
      return { ...base, code: item.code, choices: q.choices.map((c) => c.text) };
    case "fill_blank":
      return { ...base, code: blankedDisplay(item.code, q.blankedCode, q.choices[q.answerIndex].text), choices: q.choices.map((c) => c.text) };
    case "find_bug":
      return { ...base, code: q.buggyCode };
    case "shuffle": {
      const perm = seededPermutation(q.pieces.length, q.id);
      return { ...base, code: "", pieces: perm.map((i) => q.pieces[i]) };
    }
    default:
      return { ...base, code: item.code };
  }
}

/** 셔플 답(화면 순서 인덱스)을 원래 조각 인덱스로 되돌린다 */
export function unshuffle(q: Question, displayOrder: number[]): number[] {
  if (q.type !== "shuffle") return displayOrder;
  const perm = seededPermutation(q.pieces.length, q.id);
  return displayOrder.map((d) => perm[d] ?? -1);
}

// ───────────────────────── 다음 문제 추천 (일반 알고리즘) ─────────────────────────

export interface SessionPlan {
  focusConcept: ConceptId;
  level: Level;
  reason: "review" | "continue" | "next" | "chosen" | "polish";
  questions: PublicQuestion[];
  /** 이 학습자가 집중 개념 × 선택 난이도에서 아직 안 푼 문제 수 (생성 기준 판단용) */
  unsolvedAtLevel: number;
}

const SESSION_SIZE = 6;
const PER_ITEM = 3;

/**
 * 취약 개념 + 선택한 난이도 + 문제 유형 + 이미 맞힌 문제 제외 를 조합해 다음 문제를 고른다.
 * 같은 코드에서 나온 문제는 연달아 묶어서 "하나의 코드를 여러 관점으로" 읽게 한다.
 */
export function planSession(opts: {
  attempts: Attempt[];
  level: Level;
  concept?: ConceptId;
  types?: QuestionType[];
  size?: number;
  exclude?: string[];
}): SessionPlan {
  const { attempts, level } = opts;
  const size = opts.size ?? SESSION_SIZE;
  const { items, byItem } = loadContent();
  const stats = conceptStats(attempts);

  const hasContent = (c: ConceptId) => [...items.values()].some((i) => i.concepts.includes(c) && Math.abs(i.level - level) <= 1);

  // 1) 집중할 개념 고르기
  let focus: ConceptId;
  let reason: SessionPlan["reason"];
  if (opts.concept) {
    focus = opts.concept;
    reason = "chosen";
  } else {
    const weak = [...stats.values()].filter((s) => isWeak(s) && hasContent(s.conceptId)).sort((a, b) => a.mastery - b.mastery);
    const last = attempts.at(-1)?.concepts[0];
    const order = UNITS.flatMap((u) => u.conceptIds);
    if (weak.length) {
      focus = weak[0].conceptId;
      reason = "review";
    } else if (last && (stats.get(last)?.mastery ?? 0) < MASTERED && hasContent(last)) {
      focus = last;
      reason = "continue";
    } else {
      // 선택한 난이도에 딱 맞는 콘텐츠가 있는 개념을 먼저, 없으면 ±1 난이도까지
      const exact = (c: ConceptId) => [...items.values()].some((i) => i.concepts[0] === c && i.level === level);
      const unmastered = (c: ConceptId) => (stats.get(c)?.mastery ?? 0) < MASTERED;
      const next = order.find((c) => unmastered(c) && exact(c)) ?? order.find((c) => unmastered(c) && hasContent(c));
      focus = next ?? [...stats.values()].filter((s) => hasContent(s.conceptId)).sort((a, b) => a.mastery - b.mastery)[0]?.conceptId ?? CONCEPTS[0].id;
      reason = next ? "next" : "polish";
    }
  }

  // 2) 후보 문제: 개념이 맞고, 난이도가 가까운 순서
  const solved = new Set(attempts.filter((a) => a.correct).map((a) => a.questionId));
  const lastSeen = new Map(attempts.map((a) => [a.questionId, a.createdAt]));
  const typeOk = (q: Question) => (!opts.types?.length || opts.types.includes(q.type)) && !opts.exclude?.includes(q.id);

  const candidates = [...items.values()]
    .filter((i) => i.concepts.includes(focus))
    .flatMap((item) => (byItem.get(item.id) ?? []).filter(typeOk).map((q) => ({ q, item })))
    .map(({ q, item }) => ({
      q,
      item,
      // 점수가 낮을수록 먼저: 난이도 차이 → 안 푼 문제 → 틀린 문제 → 오래전에 푼 문제
      score: Math.abs(item.level - level) * 10 + (solved.has(q.id) ? 5 : lastSeen.has(q.id) ? 2 : 0) + (lastSeen.get(q.id) ?? 0) / 1e14,
    }))
    .sort((a, b) => a.score - b.score);

  const unsolvedAtLevel = candidates.filter((c) => c.item.level === level && !solved.has(c.q.id)).length;

  // 3) 같은 코드의 문제를 묶어서 세션 구성
  const picked: { q: Question; item: CodeItem }[] = [];
  const perItem = new Map<string, number>();
  for (const c of candidates) {
    if (picked.length >= size) break;
    const n = perItem.get(c.item.id) ?? 0;
    if (n >= PER_ITEM) continue;
    perItem.set(c.item.id, n + 1);
    picked.push(c);
  }
  const itemOrder = [...new Set(picked.map((p) => p.item.id))];
  picked.sort((a, b) => itemOrder.indexOf(a.item.id) - itemOrder.indexOf(b.item.id) || skillRank(a.q.skill) - skillRank(b.q.skill));

  return {
    focusConcept: focus,
    level,
    reason,
    questions: picked.map(({ q, item }) => toPublic(q, item)),
    unsolvedAtLevel,
  };
}

/** 같은 코드 안에서는 쉬운 사고(확인) → 어려운 사고(종합) 순서로 */
const SKILL_ORDER: Skill[] = ["recall", "predict", "analyze", "infer", "synthesize"];
const skillRank = (s: Skill) => SKILL_ORDER.indexOf(s);

/** 이 학습자가 개념 × 난이도 칸에서 아직 맞히지 못한 문제 수 */
export function unsolvedCount(attempts: Attempt[], concept: ConceptId, level: Level): number {
  const { items, byItem } = loadContent();
  const solved = new Set(attempts.filter((a) => a.correct).map((a) => a.questionId));
  return [...items.values()]
    .filter((i) => i.level === level && i.concepts.includes(concept))
    .flatMap((i) => byItem.get(i.id) ?? [])
    .filter((q) => !solved.has(q.id)).length;
}

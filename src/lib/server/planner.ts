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

/** learn: 새로운 문제 (아직 안 푼 문제), review: 틀린 문제 → 취약 개념 */
export type PlanMode = "learn" | "review";

export interface SessionPlan {
  mode: PlanMode;
  focusConcept: ConceptId;
  level: Level;
  reason: "continue" | "next" | "chosen" | "polish" | "wrong" | "weak" | "picked";
  questions: PublicQuestion[];
  /** 이 학습자가 집중 개념 × 선택 난이도에서 아직 안 푼 문제 수 (생성 기준 판단용) */
  unsolvedAtLevel: number;
}

const SESSION_SIZE = 6;
const PER_ITEM = 3;

type Pick = { q: Question; item: CodeItem };

/** 최근 풀이가 오답인 문제 (그 뒤에 맞히지 못한 것) — 최근에 틀린 순서 */
export function wrongQuestions(attempts: Attempt[]): { questionId: string; lastAt: number; misconception: string | null; tries: number }[] {
  const last = new Map<string, { correct: boolean; at: number; misconception: string | null; tries: number }>();
  for (const a of attempts) {
    const prev = last.get(a.questionId);
    last.set(a.questionId, { correct: a.correct, at: a.createdAt, misconception: a.misconception ?? prev?.misconception ?? null, tries: (prev?.tries ?? 0) + 1 });
  }
  return [...last]
    .filter(([, v]) => !v.correct)
    .map(([questionId, v]) => ({ questionId, lastAt: v.at, misconception: v.misconception, tries: v.tries }))
    .sort((a, b) => b.lastAt - a.lastAt);
}

/** 같은 코드의 문제를 연달아 묶고, 같은 코드 안에서는 쉬운 사고 → 어려운 사고 순서로 */
function arrange(candidates: Pick[], size: number): Pick[] {
  const picked: Pick[] = [];
  const perItem = new Map<string, number>();
  for (const c of candidates) {
    if (picked.length >= size) break;
    const n = perItem.get(c.item.id) ?? 0;
    if (n >= PER_ITEM) continue;
    perItem.set(c.item.id, n + 1);
    picked.push(c);
  }
  const itemOrder = [...new Set(picked.map((p) => p.item.id))];
  return picked.sort((a, b) => itemOrder.indexOf(a.item.id) - itemOrder.indexOf(b.item.id) || skillRank(a.q.skill) - skillRank(b.q.skill));
}

/**
 * 문제 고르기.
 * - learn : 선택한 난이도·문제 유형으로 '아직 풀지 않은' 문제. 개념은 지정하거나 커리큘럼 순서로 추천
 * - review: 틀린 문제를 먼저, 그다음 취약 개념의 문제
 * - ids   : 특정 문제 다시 풀기 (오답 노트)
 */
export function planSession(opts: {
  attempts: Attempt[];
  level: Level;
  mode?: PlanMode;
  concept?: ConceptId;
  types?: QuestionType[];
  size?: number;
  exclude?: string[];
  ids?: string[];
}): SessionPlan {
  const { attempts, level } = opts;
  const mode = opts.mode ?? "learn";
  const size = opts.size ?? SESSION_SIZE;
  const { items, byItem, questions } = loadContent();
  const stats = conceptStats(attempts);
  const seen = new Set(attempts.map((a) => a.questionId));
  const typeOk = (q: Question) => (!opts.types?.length || opts.types.includes(q.type)) && !opts.exclude?.includes(q.id);
  const questionsOf = (pred: (i: CodeItem) => boolean): Pick[] =>
    [...items.values()].filter(pred).flatMap((item) => (byItem.get(item.id) ?? []).filter(typeOk).map((q) => ({ q, item })));
  const plan = (focus: ConceptId, reason: SessionPlan["reason"], picked: Pick[], unsolvedAtLevel = 0): SessionPlan => ({
    mode,
    focusConcept: focus,
    level,
    reason,
    questions: picked.map(({ q, item }) => toPublic(q, item)),
    unsolvedAtLevel,
  });

  // ── 특정 문제 다시 풀기
  if (opts.ids?.length) {
    const picked = opts.ids.flatMap((id) => {
      const q = questions.get(id);
      const item = q && items.get(q.codeItemId);
      return q && item ? [{ q, item }] : [];
    });
    return plan(picked[0]?.item.concepts[0] ?? CONCEPTS[0].id, "picked", picked);
  }

  // ── 복습: 틀린 문제 → 취약 개념의 문제
  if (mode === "review") {
    const wrong = wrongQuestions(attempts).flatMap((w) => {
      const q = questions.get(w.questionId);
      const item = q && items.get(q.codeItemId);
      return q && item && typeOk(q) ? [{ q, item }] : [];
    });
    const weak = [...stats.values()].filter(isWeak).sort((a, b) => a.mastery - b.mastery).map((s) => s.conceptId);
    const wrongIds = new Set(wrong.map((w) => w.q.id));
    const weakQs = weak.flatMap((c) =>
      questionsOf((i) => i.concepts.includes(c))
        .filter((p) => !wrongIds.has(p.q.id))
        // 같은 개념 안에서는 가까운 난이도 → 오래전에 본 문제 → 처음 보는 문제
        .sort((a, b) => Math.abs(a.item.level - level) - Math.abs(b.item.level - level) || Number(seen.has(b.q.id)) - Number(seen.has(a.q.id))),
    );
    const picked = [...wrong.slice(0, size), ...weakQs].slice(0, size);
    const focus = wrong[0]?.item.concepts[0] ?? weak[0] ?? CONCEPTS[0].id;
    return plan(focus, wrong.length ? "wrong" : "weak", picked);
  }

  // ── 새로운 학습: 아직 풀지 않은 문제만
  const fresh = (c: ConceptId, maxGap: number) =>
    questionsOf((i) => i.concepts.includes(c) && Math.abs(i.level - level) <= maxGap).filter((p) => !seen.has(p.q.id));
  const order = UNITS.flatMap((u) => u.conceptIds);
  const unmastered = (c: ConceptId) => (stats.get(c)?.mastery ?? 0) < MASTERED;

  let focus: ConceptId;
  let reason: SessionPlan["reason"];
  const last = attempts.at(-1)?.concepts[0];
  if (opts.concept) {
    focus = opts.concept;
    reason = "chosen";
  } else if (last && unmastered(last) && fresh(last, 0).length) {
    focus = last;
    reason = "continue";
  } else {
    // 선택한 난이도에 딱 맞는 새 문제가 있는 개념을 먼저, 없으면 ±1 난이도까지
    const next = order.find((c) => unmastered(c) && fresh(c, 0).length) ?? order.find((c) => unmastered(c) && fresh(c, 1).length);
    focus = next ?? order.find((c) => fresh(c, 1).length) ?? CONCEPTS[0].id;
    reason = next ? "next" : "polish";
  }

  const byDistance = (list: Pick[]) => list.sort((a, b) => Math.abs(a.item.level - level) - Math.abs(b.item.level - level));
  let candidates = byDistance(fresh(focus, 4));
  // 이 개념의 새 문제가 모자라면 같은 조건(난이도·유형)으로 다음 개념의 새 문제를 이어 붙인다
  if (candidates.length < size && !opts.concept) {
    for (const c of order) {
      if (c === focus || candidates.length >= size * 2) continue;
      candidates = [...candidates, ...byDistance(fresh(c, 1))];
    }
  }
  const unsolvedAtLevel = questionsOf((i) => i.concepts.includes(focus) && i.level === level).filter((p) => !seen.has(p.q.id)).length;
  return plan(focus, reason, arrange(candidates, size), unsolvedAtLevel);
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

import { blankedDisplay, seededPermutation } from "../content/code-utils";
import { CERT_SUBJECTS, CONCEPTS, STAGE_INFO, trackOf, unitsOf } from "../curriculum";
import { conceptStats, MASTERED } from "../learner/stats";
import type { Answer, Attempt, CodeItem, ConceptId, Level, Question, QuestionType, Skill, Stage, Track } from "../types";
import type { ContentCache } from "./content-repo";

/** 클라이언트로 보내는 문제 (정답·해설·채점 기준은 빼고 보낸다) */
export interface PublicQuestion {
  id: string;
  codeItemId: string;
  codeTitle: string;
  track: Track;
  type: QuestionType;
  skill: Skill;
  prompt: string;
  /** 화면에 보여줄 코드 (빈칸은 빈칸이 들어간 코드). 개념 학습은 빈 문자열 */
  code: string;
  concepts: ConceptId[];
  level: Level;
  focusLines: number[];
  /** 섞인 순서의 보기 (답은 이 배열의 번호로 제출 → 서버가 원래 번호로 되돌린다) */
  choices?: string[];
  /** 코드 학습의 읽기 단계 */
  stage?: Stage;
  /** 개념 학습의 관련 자격증 과목 id */
  certs?: string[];
  /** 남은 힌트 수 (힌트 내용은 요청할 때 하나씩) */
  hintCount: number;
  /** 흐름 따라가기: 채울 칸 (값은 빼고 보낸다) */
  trace?: { line: number; when: "before" | "after"; context: string; expr: string }[];
}

/** 보기를 화면에 보일 순서 (문제마다 고정). 작성할 때 정답을 맨 앞에 두어도 화면에서는 섞인다 */
const choiceOrder = (q: Question) => (q.type === "multiple_choice" || q.type === "fill_blank" ? seededPermutation(q.choices.length, `${q.id}:choices`) : []);

export function toPublic(q: Question, item: CodeItem): PublicQuestion {
  const base = {
    id: q.id,
    codeItemId: item.id,
    codeTitle: item.title,
    track: item.track,
    type: q.type,
    skill: q.skill,
    prompt: q.prompt,
    concepts: item.concepts,
    level: item.level,
    focusLines: q.focusLines ?? [],
    hintCount: q.hints.filter((h) => h.trim()).length,
    ...(q.stage ? { stage: q.stage } : {}),
    ...(q.certs?.length ? { certs: q.certs } : {}),
  };
  switch (q.type) {
    case "multiple_choice":
      return { ...base, code: item.code, choices: choiceOrder(q).map((i) => q.choices[i].text) };
    case "fill_blank":
      return {
        ...base,
        code: blankedDisplay(item.code, q.blankedCode, q.choices[q.answerIndex].text),
        choices: choiceOrder(q).map((i) => q.choices[i].text),
      };
    case "trace":
      return {
        ...base,
        code: item.code,
        focusLines: [...new Set(q.watch.map((w) => w.line))],
        trace: q.rows.map(({ line, when, context, expr }) => ({ line, when, context, expr })),
      };
    default:
      return { ...base, code: item.code };
  }
}

/** 화면에서 고른 보기 번호(섞인 순서)를 원래 보기 번호로 되돌린다 (채점·튜터 전에) */
export function unshuffleAnswer(q: Question, answer: Answer): Answer {
  if ((answer.type === "multiple_choice" || answer.type === "fill_blank") && answer.type === q.type) {
    return { ...answer, index: choiceOrder(q)[answer.index] ?? -1 };
  }
  return answer;
}

/** 화면에 보이는 순서의 보기 글 (튜터가 '몇 번 보기'를 학습자 화면과 같은 번호로 말하도록) */
export function displayedChoices(q: Question): string[] {
  return q.type === "multiple_choice" || q.type === "fill_blank" ? choiceOrder(q).map((i) => q.choices[i].text) : [];
}

/** 원래 보기 번호 → 화면에 보인 번호 (채점 결과에서 정답 보기를 표시할 때) */
export function displayChoiceIndex(q: Question, originalIndex: number): number {
  return choiceOrder(q).indexOf(originalIndex);
}

// ───────────────────────── 다음 문제 추천 (일반 알고리즘) ─────────────────────────

/** learn: 새로운 문제 (아직 안 푼 문제), review: 틀린 문제 → 취약 개념 */
export type PlanMode = "learn" | "review";

export interface SessionPlan {
  mode: PlanMode;
  track: Track;
  focusConcept: ConceptId;
  level: Level;
  reason: "continue" | "next" | "chosen" | "polish" | "wrong" | "weak" | "picked" | "all" | "empty";
  questions: PublicQuestion[];
  /** 이 학습자가 집중 개념 × 선택 난이도에서 아직 안 푼 문제 수 (생성 기준 판단용) */
  unsolvedAtLevel: number;
}

/** 개념 학습 한 세트의 문제 수 (자격증 문제처럼 여러 문제를 연달아) */
const THEORY_SIZE = 10;
/** 코드 학습 한 세트의 코드 수 (코드 하나의 단계 문제를 모두 푼다) */
const CODE_LESSONS = 2;
const REVIEW_SIZE = 8;
/** 개념을 '전체' 로 고른 경우의 concept 값 */
export const ALL_CONCEPTS = "all";

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

/** 코드 하나의 문제를 읽기 단계 순서로 (훑어보기 → 흐름 → 핵심 줄 → 정리) */
const byStage = (a: Question, b: Question) => (STAGE_INFO[a.stage ?? "wrapup"].order ?? 9) - (STAGE_INFO[b.stage ?? "wrapup"].order ?? 9);

/** 무작위로 섞기 (같은 조건이어도 매번 다른 문제 조합) */
const shuffled = <T>(list: T[]): T[] => list.map((v) => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

/**
 * 문제 고르기.
 * - learn · 개념 갈래: 고른 주제(또는 분야 전체·전체)·자격증 과목에서 아직 안 푼 객관식을 섞어 10문제
 * - learn · 코드 갈래: 고른 개념(또는 추천 개념)의 아직 안 읽은 코드 2개를, 코드마다 읽기 단계 순서로
 * - review: 틀린 문제를 먼저, 그다음 취약 개념의 문제
 * - ids   : 특정 문제 다시 풀기 (오답 노트)
 */
export function planSession(opts: {
  /** loadContent() 결과 (문제 DB 캐시) */
  content: ContentCache;
  attempts: Attempt[];
  level: Level;
  track?: Track;
  mode?: PlanMode;
  /** 개념(주제) id 또는 "all" */
  concept?: ConceptId;
  /** 개념 갈래: 분야(단원) id — 그 분야 전체에서 */
  unit?: number;
  /** 개념 갈래: 자격증 이름 (그 자격증 과목 태그가 붙은 문제만) */
  cert?: string;
  size?: number;
  exclude?: string[];
  ids?: string[];
}): SessionPlan {
  const { attempts, level } = opts;
  const mode = opts.mode ?? "learn";
  const { items, byItem, questions } = opts.content;
  const track: Track = opts.track ?? (opts.concept && opts.concept !== ALL_CONCEPTS ? trackOf(opts.concept) : "code");
  const stats = conceptStats(attempts);
  const seen = new Set(attempts.map((a) => a.questionId));
  const excluded = new Set(opts.exclude ?? []);
  const certSubjects = opts.cert ? new Set(certSubjectIds(opts.cert)) : null;
  const questionOk = (q: Question) => !excluded.has(q.id) && (!certSubjects || (q.certs ?? []).some((c) => certSubjects.has(c)));
  const questionsOf = (pred: (i: CodeItem) => boolean): Pick[] =>
    [...items.values()].filter((i) => i.track === track && pred(i)).flatMap((item) => (byItem.get(item.id) ?? []).filter(questionOk).map((q) => ({ q, item })));
  const plan = (focus: ConceptId, reason: SessionPlan["reason"], picked: Pick[], unsolvedAtLevel = 0): SessionPlan => ({
    mode,
    track,
    focusConcept: focus,
    level,
    reason: picked.length ? reason : "empty",
    questions: picked.map(({ q, item }) => toPublic(q, item)),
    unsolvedAtLevel,
  });
  const firstConcept = unitsOf(track)[0]?.conceptIds[0] ?? CONCEPTS[0].id;

  // ── 특정 문제 다시 풀기
  if (opts.ids?.length) {
    const picked = opts.ids.flatMap((id) => {
      const q = questions.get(id);
      const item = q && items.get(q.codeItemId);
      return q && item ? [{ q, item }] : [];
    });
    return { ...plan(picked[0]?.item.concepts[0] ?? firstConcept, "picked", picked), track: picked[0]?.item.track ?? track };
  }

  // ── 복습: 틀린 문제 → 취약 개념의 문제 (이 갈래에서)
  if (mode === "review") {
    const size = opts.size ?? REVIEW_SIZE;
    const wrong = wrongQuestions(attempts).flatMap((w) => {
      const q = questions.get(w.questionId);
      const item = q && items.get(q.codeItemId);
      return q && item && item.track === track && questionOk(q) ? [{ q, item }] : [];
    });
    const weak = [...stats.values()]
      .filter((s) => s.attempts >= 2 && s.mastery < 60 && trackOf(s.conceptId) === track)
      .sort((a, b) => a.mastery - b.mastery)
      .map((s) => s.conceptId);
    const wrongIds = new Set(wrong.map((w) => w.q.id));
    const weakQs = weak.flatMap((c) =>
      questionsOf((i) => i.concepts.includes(c))
        .filter((p) => !wrongIds.has(p.q.id))
        // 같은 개념 안에서는 가까운 난이도 → 오래전에 본 문제 → 처음 보는 문제
        .sort((a, b) => Math.abs(a.item.level - level) - Math.abs(b.item.level - level) || Number(seen.has(b.q.id)) - Number(seen.has(a.q.id))),
    );
    const picked = [...wrong.slice(0, size), ...weakQs].slice(0, size);
    const focus = wrong[0]?.item.concepts[0] ?? weak[0] ?? firstConcept;
    return plan(focus, wrong.length ? "wrong" : "weak", picked);
  }

  const order = unitsOf(track).flatMap((u) => u.conceptIds);
  const inScope = (i: CodeItem) =>
    opts.concept && opts.concept !== ALL_CONCEPTS
      ? i.concepts.includes(opts.concept)
      : opts.unit
        ? i.concepts.some((c) => unitsOf(track).find((u) => u.id === opts.unit)?.conceptIds.includes(c))
        : true;
  const nearFirst = (list: Pick[]) => list.sort((a, b) => Math.abs(a.item.level - level) - Math.abs(b.item.level - level));

  // ── 개념 학습: 범위 안의 안 푼 문제를 가까운 난이도부터, 같은 난이도 안에서는 섞어서
  if (track === "theory") {
    const size = opts.size ?? THEORY_SIZE;
    const fresh = nearFirst(shuffled(questionsOf(inScope).filter((p) => !seen.has(p.q.id))));
    const picked = fresh.slice(0, size);
    const focus = opts.concept && opts.concept !== ALL_CONCEPTS ? opts.concept : (picked[0]?.item.concepts[0] ?? firstConcept);
    const reason = opts.concept && opts.concept !== ALL_CONCEPTS ? "chosen" : "all";
    const unsolvedAtLevel = questionsOf((i) => i.concepts.includes(focus) && i.level === level).filter((p) => !seen.has(p.q.id)).length;
    return plan(focus, reason, picked, unsolvedAtLevel);
  }

  // ── 코드 학습: 아직 다 읽지 않은 코드를 골라, 코드마다 단계 순서로
  const lessonsOf = (pred: (i: CodeItem) => boolean, maxGap: number) =>
    [...items.values()]
      .filter((i) => i.track === "code" && pred(i) && Math.abs(i.level - level) <= maxGap)
      .filter((i) => (byItem.get(i.id) ?? []).some((q) => questionOk(q) && !seen.has(q.id)))
      .sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level));
  const unmastered = (c: ConceptId) => (stats.get(c)?.mastery ?? 0) < MASTERED;

  let focus: ConceptId;
  let reason: SessionPlan["reason"];
  let lessons: CodeItem[];
  if (opts.concept === ALL_CONCEPTS) {
    focus = firstConcept;
    reason = "all";
    lessons = shuffled(lessonsOf(() => true, 1)).sort((a, b) => Math.abs(a.level - level) - Math.abs(b.level - level));
    focus = lessons[0]?.concepts[0] ?? firstConcept;
  } else if (opts.concept) {
    focus = opts.concept;
    reason = "chosen";
    lessons = lessonsOf((i) => i.concepts.includes(focus), 4);
  } else {
    const last = attempts.at(-1)?.concepts[0];
    const fresh = (c: ConceptId, gap: number) => lessonsOf((i) => i.concepts.includes(c), gap);
    if (last && trackOf(last) === "code" && unmastered(last) && fresh(last, 0).length) {
      focus = last;
      reason = "continue";
    } else {
      // 선택한 난이도에 딱 맞는 새 코드가 있는 개념을 먼저, 없으면 ±1 난이도까지
      const next = order.find((c) => unmastered(c) && fresh(c, 0).length) ?? order.find((c) => unmastered(c) && fresh(c, 1).length);
      focus = next ?? order.find((c) => fresh(c, 4).length) ?? firstConcept;
      reason = next ? "next" : "polish";
    }
    lessons = fresh(focus, 4);
    // 이 개념의 새 코드가 모자라면 다른 개념의 새 코드를 이어 붙인다
    if (lessons.length < CODE_LESSONS) lessons = [...lessons, ...lessonsOf((i) => !i.concepts.includes(focus), 1)];
  }
  const picked = lessons
    .slice(0, opts.size ? Math.max(1, Math.ceil(opts.size / 4)) : CODE_LESSONS)
    .flatMap((item) => (byItem.get(item.id) ?? []).filter(questionOk).sort(byStage).map((q) => ({ q, item })));
  const unsolvedAtLevel = questionsOf((i) => i.concepts.includes(focus) && i.level === level).filter((p) => !seen.has(p.q.id)).length;
  return plan(focus, reason, picked, unsolvedAtLevel);
}

const CERT_SUBJECTS_BY_CERT = new Map<string, string[]>();
for (const c of CERT_SUBJECTS) CERT_SUBJECTS_BY_CERT.set(c.cert, [...(CERT_SUBJECTS_BY_CERT.get(c.cert) ?? []), c.id]);

/** 자격증 이름 → 그 자격증의 과목 id 들 */
function certSubjectIds(cert: string): string[] {
  return CERT_SUBJECTS_BY_CERT.get(cert) ?? [cert];
}

/** 이 학습자가 개념 × 난이도 칸에서 아직 맞히지 못한 문제 수 */
export function unsolvedCount(content: ContentCache, attempts: Attempt[], concept: ConceptId, level: Level): number {
  const { items, byItem } = content;
  const solved = new Set(attempts.filter((a) => a.correct).map((a) => a.questionId));
  return [...items.values()]
    .filter((i) => i.level === level && i.concepts.includes(concept))
    .flatMap((i) => byItem.get(i.id) ?? [])
    .filter((q) => !solved.has(q.id)).length;
}

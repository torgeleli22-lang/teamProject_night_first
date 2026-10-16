/**
 * Lambda 들이 화면으로 돌려주는 JSON 의 모양 (lambda/ 폴더의 Python·Node.js 코드와 같게 유지한다).
 * 정답·해설·채점 기준은 문제를 낼 때(PublicQuestion) 들어 있지 않고, 제출한 뒤(AttemptResult)에만 온다.
 */
import type { ConceptCheck, ConceptId, GradedBy, Level, Question, QuestionType, Skill, Stage, Track } from "./types";

// ───────────────────────── 문제 (questions.py) ─────────────────────────

/** 화면으로 보내는 문제 (정답·해설·채점 기준은 빼고) */
export interface PublicQuestion {
  id: string;
  codeItemId: string;
  codeTitle: string;
  track: Track;
  type: QuestionType;
  skill: Skill;
  prompt: string;
  /** 화면에 보여 줄 코드 (빈칸 문제는 빈칸이 들어간 코드). 개념 학습은 빈 문자열 */
  code: string;
  concepts: ConceptId[];
  level: Level;
  focusLines: number[];
  /** 섞인 순서의 보기 (답은 이 배열의 번호로 제출 → 서버가 원래 번호로 되돌린다) */
  choices?: string[];
  stage?: Stage;
  certs?: string[];
  hintCount: number;
  /** 흐름 따라가기: 채울 칸 (값은 빼고) */
  trace?: { line: number; when: "before" | "after"; context: string; expr: string }[];
}

export interface SessionPlan {
  mode: "learn" | "review";
  track: Track;
  focusConcept: ConceptId;
  level: Level;
  reason: "continue" | "next" | "chosen" | "polish" | "wrong" | "weak" | "picked" | "all" | "empty";
  questions: PublicQuestion[];
  unsolvedAtLevel: number;
  /** 새 문제를 만드는 중 (generate-code Lambda) */
  generating?: boolean;
}

// ───────────────────────── 채점 (submit_answer.py) ─────────────────────────

export interface TutorNote {
  headline: string;
  message: string;
  checks: ConceptCheck[];
  misconception: string | null;
  correction: string | null;
  nextTip: string;
  /** ai: 이번에 AI 가 분석함, rule: 규칙 기반, stored: 미리 저장된 해설·오개념 */
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
  /** 화면 순서 기준의 정답 보기 번호 */
  answerIndex?: number;
  cells?: { expected: string; ok: boolean }[];
  /** 학습자 분석을 시작했는지 */
  analyzing?: boolean;
}

/** 주관식 AI 분석 (POST /explain) */
export interface ShortAnswerFeedback {
  verdict: "correct" | "partial" | "incorrect";
  headline: string;
  explanation: string;
  checks: ConceptCheck[];
  misconception: string | null;
  correction: string | null;
  nextTip: string;
  gradedBy: "rule" | "ai";
}

// ───────────────────────── 학습 기록 (my_page.py) ─────────────────────────

export interface ConceptStat {
  conceptId: ConceptId;
  attempts: number;
  correct: number;
  accuracy: number;
  mastery: number;
  avgTimeMs: number;
  recentWrong: number;
}

export interface DailyActivity {
  day: string;
  solved: number;
  correct: number;
  timeMs: number;
  xp: number;
}

export interface LearnerAnalysis {
  summary: string;
  strengths: string[];
  confusions: { concepts: ConceptId[]; description: string }[];
  focusConcepts: ConceptId[];
  recommendedLevel: Level | null;
  levelMessage: string;
  studyTip: string;
}

export interface StoredAnalysis<T = LearnerAnalysis> {
  id: number;
  attemptCount: number;
  result: T;
  source: "ai" | "rule";
  createdAt: number;
}

export interface LevelSuggestion {
  level: Level;
  direction: "up" | "stay" | "down";
  message: string;
}

export interface MeView {
  nickname: string;
  preferredLevel: Level | null;
  dailyGoal: number;
  xp: number;
  level: number;
  streak: number;
  solvedToday: number;
  totalSolved: number;
  aiMode: "live" | "mock" | "off";
}

export interface LearnView {
  attemptCount: number;
  level: Level;
  suggestion: LevelSuggestion;
  suggestedLevel: Level | null;
  recommendedConcept: ConceptId;
  lastTrack: Track;
  unit: { emoji: string; title: string };
  solvedToday: number;
  dailyGoal: number;
  streak: number;
  overall: number;
  wrongCount: number;
  weakCount: number;
  analysis: StoredAnalysis | null;
  analysisEvery: number;
  sinceLastAnalysis: number;
}

export interface ReviewView {
  level: Level;
  wrong: {
    questionId: string;
    lastAt: number;
    misconception: string | null;
    tries: number;
    prompt: string;
    type: QuestionType;
    stage: Stage | null;
    track: Track;
    concept: ConceptId;
    level: Level;
  }[];
  weak: ConceptStat[];
  misconceptions: { text: string; count: number }[];
}

export interface RankingView {
  nickname: string;
  top: { nickname: string; xp: number; solved: number; rank: number; isMe: boolean; level: number }[];
  total: number;
  mine: { rank: number; xp: number; nextXp: number | null; level: number; topPercent: number } | null;
  ttlHours: number;
}

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  description: string;
  earned: boolean;
}

export type DashboardView =
  | { empty: true }
  | {
      empty: false;
      unit: { emoji: string; title: string };
      preferredLevel: Level | null;
      xp: number;
      level: { level: number; current: number; needed: number };
      streak: number;
      totalSolved: number;
      accuracy: number;
      avgTimeMs: number;
      hints: number;
      overall: number;
      started: ConceptStat[];
      days: DailyActivity[];
      types: { type: QuestionType; attempts: number; accuracy: number; avgTimeMs: number }[];
      repeated: ConceptStat[];
      misconceptions: { text: string; count: number }[];
      badges: Badge[];
      analysis: StoredAnalysis | null;
      analysisEvery: number;
      sinceLastAnalysis: number;
      attemptCount: number;
      aiGraded: number;
      recent: {
        id: number;
        correct: boolean;
        partial: boolean;
        concept: ConceptId;
        prompt: string;
        type: QuestionType;
        timeMs: number;
        gradedBy: GradedBy;
        xp: number;
        createdAt: number;
      }[];
    };

/** 탐색 화면 (GET /concepts) */
export interface ExploreItem {
  id: string;
  track: Track;
  title: string;
  concepts: ConceptId[];
  level: Level;
  source: "seed" | "ai";
  lines: number;
  questions: { id: string; type: QuestionType; stage: Stage | null; prompt: string; solved: boolean | null }[];
}

export interface ConceptsView {
  initialLevel: Level | null;
  mastery: Record<ConceptId, { mastery: number; weak: boolean }>;
  items: ExploreItem[];
}

// ───────────────────────── 관리자 (admin.py) ─────────────────────────

export type Trigger = "launch_fill" | "stock_floor" | "demand" | "personal_review" | "manual";

export interface Policy {
  minStock: number;
  maxStock: number;
  learnerLow: number;
  demandLearners: number;
  demandWindowDays: number;
  personalPerLearnerPerDay: number;
  dailyLimit: number;
  monthlyBudgetUsd: number;
}

export interface ValidationCheck {
  name: string;
  pass: boolean;
  detail?: string | null;
}

export interface ValidationReport {
  ok: boolean;
  checks: ValidationCheck[];
  actualOutput: string | null;
  estimatedLevel: Level;
}

export interface GeneratedItemRow {
  id: string;
  title: string;
  code: string;
  concepts: ConceptId[];
  level: number;
  status: string;
  validation: ValidationReport | null;
  questionCount: number;
  createdAt: number;
}

export interface Job {
  id: number;
  concept: string;
  level: Level;
  trigger: Trigger;
  sessionId: string | null;
  mock: boolean;
  status: "running" | "published" | "pending" | "rejected" | "failed" | "cancelled";
  reason: string;
  itemId: string | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface UsageRow {
  task: string;
  model: string;
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  failures: number;
}

/** AI 콘텐츠 하나 (GET /admin/item) */
export interface GeneratedItemDetail {
  row: GeneratedItemRow;
  output: string | null;
  questions: Question[];
}

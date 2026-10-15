import type { ConceptId, Language, Level, QuestionDraft, Track } from "../../types";

/** 작성용 문제 (codeItemId 는 세트 안에서 자동으로 채워진다) */
export type SeedQuestion = QuestionDraft;

/** 사람이 작성한 콘텐츠 묶음: 코드 학습은 코드 하나 + 단계별 문제, 개념 학습은 주제 하나 + 객관식 문제 (code 는 "") */
export interface SeedSet {
  id: string;
  track: Track;
  /** 코드 학습 언어 (기본 javascript, 개념 학습은 없음) */
  language?: Language;
  title: string;
  code: string;
  concepts: ConceptId[];
  output: string | null;
  runnable?: boolean;
  /** 지정하지 않으면 analyzer 가 계산한 난이도를 쓴다 */
  level?: Level;
  questions: SeedQuestion[];
}

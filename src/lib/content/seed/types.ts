import type { ConceptId, Level, QuestionDraft } from "../../types";

/** 작성용 문제 (codeItemId 는 세트 안에서 자동으로 채워진다) */
export type SeedQuestion = QuestionDraft;

/** 사람이 작성한 코드 세트: 코드 하나 + 여러 문제 */
export interface SeedSet {
  id: string;
  title: string;
  code: string;
  concepts: ConceptId[];
  output: string | null;
  runnable?: boolean;
  /** 지정하지 않으면 analyzer 가 계산한 난이도를 쓴다 */
  level?: Level;
  questions: SeedQuestion[];
}

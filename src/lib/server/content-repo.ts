import "server-only";
import type { CodeItem, ConceptId, Level, Question } from "../types";
import type { ValidationReport } from "../content/validate";
import { getDb } from "./db";

/**
 * 문제 DB 읽기/쓰기. 콘텐츠는 수백 개 규모라 공개된 콘텐츠 전체를 메모리에 캐시하고,
 * 새 콘텐츠가 저장되면 캐시를 비운다.
 */
interface ContentCache {
  items: Map<string, CodeItem>;
  questions: Map<string, Question>;
  byItem: Map<string, Question[]>;
}

let cache: ContentCache | null = null;

interface ItemRow {
  id: string;
  title: string;
  code: string;
  concepts: string;
  level: number;
  factors: string;
  output: string | null;
  runnable: number;
  source: string;
  status: string;
  created_at: number;
}

function toItem(r: ItemRow): CodeItem {
  return {
    id: r.id,
    title: r.title,
    code: r.code,
    concepts: JSON.parse(r.concepts),
    level: r.level as Level,
    factors: JSON.parse(r.factors),
    output: r.output,
    runnable: r.runnable === 1,
    source: r.source as CodeItem["source"],
    status: r.status as CodeItem["status"],
    createdAt: r.created_at,
  };
}

export function loadContent(): ContentCache {
  if (cache) return cache;
  const db = getDb();
  const items = new Map<string, CodeItem>();
  for (const row of db.prepare("SELECT * FROM code_items WHERE status = 'published'").all() as unknown as ItemRow[]) {
    items.set(row.id, toItem(row));
  }
  const questions = new Map<string, Question>();
  const byItem = new Map<string, Question[]>();
  for (const row of db.prepare("SELECT payload FROM questions").all() as { payload: string }[]) {
    const q = JSON.parse(row.payload) as Question;
    if (!items.has(q.codeItemId)) continue;
    questions.set(q.id, q);
    byItem.set(q.codeItemId, [...(byItem.get(q.codeItemId) ?? []), q]);
  }
  cache = { items, questions, byItem };
  return cache;
}

export function invalidateContent() {
  cache = null;
}

export function getQuestion(id: string): { question: Question; item: CodeItem } | null {
  const { questions, items } = loadContent();
  const question = questions.get(id);
  const item = question && items.get(question.codeItemId);
  return question && item ? { question, item } : null;
}

export function itemsFor(concept: ConceptId, level?: Level): CodeItem[] {
  return [...loadContent().items.values()].filter((i) => i.concepts.includes(concept) && (level === undefined || i.level === level));
}

/** 개념 × 난이도별 문제 수 (콘텐츠 부족 판단, 관리자 화면) */
export function coverage(): Map<string, number> {
  const { items, byItem } = loadContent();
  const map = new Map<string, number>();
  for (const item of items.values()) {
    for (const c of item.concepts) {
      const key = `${c}:${item.level}`;
      map.set(key, (map.get(key) ?? 0) + (byItem.get(item.id)?.length ?? 0));
    }
  }
  return map;
}

export function saveGeneratedItem(
  item: Omit<CodeItem, "createdAt" | "source">,
  questions: Question[],
  report: ValidationReport,
  jobId: number,
) {
  const db = getDb();
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO code_items (id, title, code, concepts, level, factors, output, runnable, source, status, validation, job_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?, ?, ?)`,
    ).run(
      item.id,
      item.title,
      item.code,
      JSON.stringify(item.concepts),
      item.level,
      JSON.stringify(item.factors),
      item.output,
      item.runnable ? 1 : 0,
      item.status,
      JSON.stringify(report),
      jobId,
      Date.now(),
    );
    const insertQ = db.prepare("INSERT INTO questions (id, code_item_id, type, payload) VALUES (?, ?, ?, ?)");
    for (const q of questions) insertQ.run(q.id, q.codeItemId, q.type, JSON.stringify(q));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  invalidateContent();
}

export interface GeneratedItemRow {
  id: string;
  title: string;
  code: string;
  concepts: string[];
  level: number;
  status: string;
  validation: ValidationReport | null;
  questionCount: number;
  createdAt: number;
}

export function listGeneratedItems(limit = 30): GeneratedItemRow[] {
  const rows = getDb()
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM questions q WHERE q.code_item_id = c.id) AS question_count
       FROM code_items c WHERE source = 'ai' ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as (ItemRow & { validation: string | null; question_count: number })[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    code: r.code,
    concepts: JSON.parse(r.concepts),
    level: r.level,
    status: r.status,
    validation: r.validation ? JSON.parse(r.validation) : null,
    questionCount: r.question_count,
    createdAt: r.created_at,
  }));
}

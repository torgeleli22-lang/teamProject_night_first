import type { ValidationReport } from "../content/validate";
import type { CodeItem, ConceptId, Level, Question } from "../types";
import { getDb, useDynamo } from "./db";
import * as D from "./dynamo/content";

/**
 * 문제 DB 읽기/쓰기. 콘텐츠는 수백 개 규모라 공개된 콘텐츠 전체를 메모리에 캐시한다.
 * Lambda 는 인스턴스가 여러 개일 수 있으므로, 다른 인스턴스가 새 콘텐츠를 저장했는지
 * 30초마다 '버전'(개수·최근 시각)만 확인하고 바뀌었을 때만 다시 읽는다.
 */
export interface ContentCache {
  items: Map<string, CodeItem>;
  questions: Map<string, Question>;
  byItem: Map<string, Question[]>;
}

const CHECK_EVERY_MS = 30_000;
let cache: { content: ContentCache; version: string; checkedAt: number } | null = null;

interface ItemRow {
  id: string;
  track: string;
  language: string | null;
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
    track: r.track === "theory" ? "theory" : "code",
    language: r.language === "javascript" ? "javascript" : null,
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

async function contentVersion(): Promise<string> {
  if (useDynamo()) return D.contentVersion();
  const db = await getDb();
  const row = await db.get<{ n: number; latest: number | null }>(
    "SELECT CAST(COUNT(*) AS INTEGER) AS n, MAX(created_at) AS latest FROM code_items WHERE status = 'published'",
  );
  const seed = await db.get<{ value: string }>("SELECT value FROM app_meta WHERE key = 'seed_hash'");
  return `${row?.n ?? 0}:${row?.latest ?? 0}:${seed?.value ?? ""}`;
}

export async function loadContent(): Promise<ContentCache> {
  const now = Date.now();
  if (cache && now - cache.checkedAt < CHECK_EVERY_MS) return cache.content;
  const version = await contentVersion();
  if (cache && cache.version === version) {
    cache.checkedAt = now;
    return cache.content;
  }
  const items = new Map<string, CodeItem>();
  let allQuestions: Question[];
  if (useDynamo()) {
    const published = await D.loadPublished();
    for (const item of published.items) items.set(item.id, item);
    allQuestions = published.questions;
  } else {
    const db = await getDb();
    for (const row of await db.all<ItemRow>("SELECT * FROM code_items WHERE status = 'published'")) items.set(row.id, toItem(row));
    allQuestions = (await db.all<{ payload: string }>("SELECT payload FROM questions")).map((r) => JSON.parse(r.payload) as Question);
  }
  const questions = new Map<string, Question>();
  const byItem = new Map<string, Question[]>();
  for (const q of allQuestions) {
    if (!items.has(q.codeItemId)) continue;
    questions.set(q.id, q);
    byItem.set(q.codeItemId, [...(byItem.get(q.codeItemId) ?? []), q]);
  }
  cache = { content: { items, questions, byItem }, version, checkedAt: now };
  return cache.content;
}

export function invalidateContent() {
  cache = null;
}

export async function getQuestion(id: string): Promise<{ question: Question; item: CodeItem } | null> {
  const { questions, items } = await loadContent();
  const question = questions.get(id);
  const item = question && items.get(question.codeItemId);
  return question && item ? { question, item } : null;
}

export async function itemsFor(concept: ConceptId, level?: Level): Promise<CodeItem[]> {
  return [...(await loadContent()).items.values()].filter((i) => i.concepts.includes(concept) && (level === undefined || i.level === level));
}

/** 개념 × 난이도별 문제 수 (콘텐츠 부족 판단, 관리자 화면) */
export async function coverage(): Promise<Map<string, number>> {
  const { items, byItem } = await loadContent();
  const map = new Map<string, number>();
  for (const item of items.values()) {
    for (const c of item.concepts) {
      const key = `${c}:${item.level}`;
      map.set(key, (map.get(key) ?? 0) + (byItem.get(item.id)?.length ?? 0));
    }
  }
  return map;
}

export async function saveGeneratedItem(item: Omit<CodeItem, "createdAt" | "source">, questions: Question[], report: ValidationReport, jobId: number) {
  if (useDynamo()) {
    await D.saveGeneratedItem(item, questions, report, jobId);
    invalidateContent();
    return;
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO code_items (id, track, language, title, code, concepts, level, factors, output, runnable, source, status, validation, job_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?, ?, ?)`,
      [item.id, item.track, item.language, item.title, item.code, JSON.stringify(item.concepts), item.level, JSON.stringify(item.factors), item.output, item.runnable, item.status, JSON.stringify(report), jobId, Date.now()],
    );
    for (const q of questions) {
      await tx.run("INSERT INTO questions (id, code_item_id, type, payload) VALUES (?, ?, ?, ?)", [q.id, q.codeItemId, q.type, JSON.stringify(q)]);
    }
  });
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

export async function listGeneratedItems(limit = 30): Promise<GeneratedItemRow[]> {
  if (useDynamo()) return D.listGeneratedItems(limit);
  const db = await getDb();
  const rows = await db.all<ItemRow & { validation: string | null; question_count: number }>(
    `SELECT c.*, (SELECT CAST(COUNT(*) AS INTEGER) FROM questions q WHERE q.code_item_id = c.id) AS question_count
     FROM code_items c WHERE source = 'ai' ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
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

/** AI 가 만든 콘텐츠 하나 (반려된 것 포함) — 관리자가 '고쳐서 다시 만들기' 할 때 원본으로 쓴다 */
export async function getGeneratedItem(id: string): Promise<{ row: GeneratedItemRow; output: string | null; questions: Question[] } | null> {
  if (useDynamo()) return D.getGeneratedItem(id);
  const db = await getDb();
  const r = await db.get<ItemRow & { validation: string | null }>("SELECT * FROM code_items WHERE id = ? AND source = 'ai'", [id]);
  if (!r) return null;
  const qs = await db.all<{ payload: string }>("SELECT payload FROM questions WHERE code_item_id = ? ORDER BY id", [id]);
  return {
    row: {
      id: r.id,
      title: r.title,
      code: r.code,
      concepts: JSON.parse(r.concepts),
      level: r.level,
      status: r.status,
      validation: r.validation ? JSON.parse(r.validation) : null,
      questionCount: qs.length,
      createdAt: r.created_at,
    },
    output: r.output,
    questions: qs.map((q) => JSON.parse(q.payload) as Question),
  };
}

// ───────────────────────── 데이터 옮기기 (EC2·RDS ↔ Lambda·DynamoDB) ─────────────────────────

export interface ExportedItem {
  row: GeneratedItemRow;
  item: CodeItem;
  questions: Question[];
}

/** AI 가 만든 콘텐츠 전부 (공개·반려 모두, 검증 보고서 포함). 시드 콘텐츠는 코드에 있으므로 옮기지 않는다 */
export async function exportGeneratedItems(): Promise<ExportedItem[]> {
  if (useDynamo()) return D.exportGeneratedItems();
  const db = await getDb();
  const rows = await db.all<ItemRow & { validation: string | null }>("SELECT * FROM code_items WHERE source = 'ai' ORDER BY created_at");
  const out: ExportedItem[] = [];
  for (const r of rows) {
    const qs = await db.all<{ payload: string }>("SELECT payload FROM questions WHERE code_item_id = ? ORDER BY id", [r.id]);
    const item = toItem(r);
    const questions = qs.map((q) => JSON.parse(q.payload) as Question);
    out.push({
      row: {
        id: r.id,
        title: r.title,
        code: r.code,
        concepts: item.concepts,
        level: r.level,
        status: r.status,
        validation: r.validation ? JSON.parse(r.validation) : null,
        questionCount: questions.length,
        createdAt: r.created_at,
      },
      item,
      questions,
    });
  }
  return out;
}

/** 옮겨 온 AI 콘텐츠 저장 (같은 id 가 있으면 덮어쓴다) */
export async function importGeneratedItem(e: ExportedItem) {
  if (useDynamo()) {
    await D.importGeneratedItem(e.row, e.item, e.questions);
  } else {
    const db = await getDb();
    const i = e.item;
    await db.transaction(async (tx) => {
      await tx.run("DELETE FROM questions WHERE code_item_id = ?", [i.id]);
      await tx.run("DELETE FROM code_items WHERE id = ?", [i.id]);
      await tx.run(
        `INSERT INTO code_items (id, track, language, title, code, concepts, level, factors, output, runnable, source, status, validation, job_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?, NULL, ?)`,
        [i.id, i.track ?? "code", i.language ?? null, i.title, i.code, JSON.stringify(i.concepts), i.level, JSON.stringify(i.factors), i.output, i.runnable, e.row.status, e.row.validation ? JSON.stringify(e.row.validation) : null, e.row.createdAt],
      );
      for (const q of e.questions) {
        await tx.run("INSERT INTO questions (id, code_item_id, type, payload) VALUES (?, ?, ?, ?)", [q.id, q.codeItemId, q.type, JSON.stringify(q)]);
      }
    });
  }
  invalidateContent();
}

/**
 * 관리자 승인·반려 (AI 가 만든 개념 문제는 '승인 대기' 로 저장되고, 승인해야 학습자에게 나간다).
 * removeQuestionIds: 승인하면서 뺄 문제
 */
export async function reviewGeneratedItem(id: string, status: "published" | "rejected", removeQuestionIds: string[] = []): Promise<boolean> {
  if (useDynamo()) {
    const ok = await D.reviewGeneratedItem(id, status, removeQuestionIds);
    invalidateContent();
    return ok;
  }
  const db = await getDb();
  const ok = await db.transaction(async (tx) => {
    const changed = await tx.run("UPDATE code_items SET status = ? WHERE id = ? AND source = 'ai'", [status, id]);
    if (!changed) return false;
    for (const qid of removeQuestionIds) await tx.run("DELETE FROM questions WHERE id = ? AND code_item_id = ?", [qid, id]);
    return true;
  });
  invalidateContent();
  return ok;
}

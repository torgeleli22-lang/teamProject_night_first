import crypto from "node:crypto";
import { buildSeed } from "../../content/seed";
import type { ValidationReport } from "../../content/validate";
import type { CodeItem, Question } from "../../types";
import type { GeneratedItemRow } from "../content-repo";
import { batchWrite, getItem, putItem, queryAll, updateItem, type Item } from "./client";

/**
 * 문제 콘텐츠 (content-repo 의 DynamoDB 판).
 * CONTENT / <코드 id> 항목 하나에 코드와 그 코드의 문제 전부를 담는다 (코드 세트 하나 = 항목 하나, 수십 KB).
 * 콘텐츠가 바뀌면 META / content_version 을 바꿔서, 다른 Lambda 인스턴스가 캐시를 다시 읽게 한다.
 */

interface ContentItem extends Item {
  pk: "CONTENT";
  sk: string;
  item: CodeItem;
  questions: Question[];
  source: string;
  status: string;
  validation?: ValidationReport | null;
  jobId?: number | null;
  createdAt: number;
}

const hashOf = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

async function bumpVersion() {
  await putItem({ pk: "META", sk: "content_version", value: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
}

/** SQL 판의 CONTENT_MODEL 과 같은 값 (학습 구조가 바뀔 때 올린다) */
const CONTENT_MODEL = "2";

async function deletePartition(pk: string) {
  const rows = await queryAll<{ pk: string; sk: string }>(pk);
  await batchWrite(rows.map((r) => ({ delete: { pk: r.pk, sk: r.sk } })));
}

/**
 * 학습 구조를 "개념 / 코드" 두 갈래로 바꾸면서 예전 문제·학습 기록·랭킹을 한 번 지운다.
 * AI 사용량(USAGE)·설정(META)·요청 제한(RL)은 남긴다. 여러 Lambda 가 동시에 떠도 한 곳만 지우도록 먼저 표시를 바꾼다.
 */
async function resetForContentModel() {
  const claimed = await updateItem("META", "content_model", {
    set: { value: CONTENT_MODEL },
    condition: "attribute_not_exists(pk) OR #cv <> :cv",
    conditionNames: { "#cv": "value" },
    conditionValues: { ":cv": CONTENT_MODEL },
  });
  if (!claimed.ok) return;
  const learners = await queryAll<{ sk: string }>("LEARNER");
  for (const l of learners) await deletePartition(`S#${l.sk}`);
  for (const pk of ["LEARNER", "CONTENT", "DEMAND", "STATS", "JOB"]) await deletePartition(pk);
  await batchWrite([{ delete: { pk: "META", sk: "seed_hash" } }]);
  console.log("[dynamo] 새 학습 구조로 바꾸며 예전 문제·학습 기록을 지웠어요 (AI 사용량·설정은 유지)");
}

/** 코드에 들어 있는 시드 콘텐츠를 테이블과 맞춘다 (바뀌었을 때만, AI 콘텐츠는 건드리지 않음. 코드에서 빠진 시드는 지움) */
let seedChecked: Promise<void> | null = null;
export function syncSeed(): Promise<void> {
  seedChecked ??= (async () => {
    await resetForContentModel();
    const { items, questions } = buildSeed(0);
    const hash = hashOf({ items, questions });
    const current = await getItem<{ value: string }>("META", "seed_hash", true);
    if (current?.value === hash) return;
    const now = Date.now();
    const seedIds = new Set(items.map((i) => i.id));
    const stale = (await queryAll<ContentItem>("CONTENT")).filter((r) => r.source === "seed" && !seedIds.has(r.sk));
    await batchWrite(stale.map((r) => ({ delete: { pk: "CONTENT", sk: r.sk } })));
    const byItem = new Map<string, Question[]>();
    for (const q of questions) byItem.set(q.codeItemId, [...(byItem.get(q.codeItemId) ?? []), q]);
    await batchWrite(
      items.map((i) => ({
        put: {
          pk: "CONTENT",
          sk: i.id,
          item: { ...i, source: "seed", status: "published", createdAt: now },
          questions: byItem.get(i.id) ?? [],
          source: "seed",
          status: "published",
          createdAt: now,
        },
      })),
    );
    await putItem({ pk: "META", sk: "seed_hash", value: hash });
    await bumpVersion();
  })().catch((e) => {
    seedChecked = null;
    throw e;
  });
  return seedChecked;
}

export async function contentVersion(): Promise<string> {
  await syncSeed();
  return (await getItem<{ value: string }>("META", "content_version", true))?.value ?? "0";
}

/** 공개된 코드와 문제 전부 */
export async function loadPublished(): Promise<{ items: CodeItem[]; questions: Question[] }> {
  await syncSeed();
  const rows = (await queryAll<ContentItem>("CONTENT")).filter((r) => r.status === "published");
  return { items: rows.map((r) => r.item), questions: rows.flatMap((r) => r.questions ?? []) };
}

export async function saveGeneratedItem(item: Omit<CodeItem, "createdAt" | "source">, questions: Question[], report: ValidationReport, jobId: number) {
  const now = Date.now();
  await putItem({
    pk: "CONTENT",
    sk: item.id,
    item: { ...item, source: "ai", createdAt: now },
    questions,
    source: "ai",
    status: item.status,
    validation: report,
    jobId,
    createdAt: now,
  });
  await bumpVersion();
}

const toRow = (r: ContentItem): GeneratedItemRow => ({
  id: r.sk,
  title: r.item.title,
  code: r.item.code,
  concepts: r.item.concepts,
  level: r.item.level,
  status: r.status,
  validation: r.validation ?? null,
  questionCount: r.questions?.length ?? 0,
  createdAt: r.createdAt,
});

export async function listGeneratedItems(limit: number): Promise<GeneratedItemRow[]> {
  return (await queryAll<ContentItem>("CONTENT"))
    .filter((r) => r.source === "ai")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map(toRow);
}

export async function getGeneratedItem(id: string): Promise<{ row: GeneratedItemRow; output: string | null; questions: Question[] } | null> {
  const r = await getItem<ContentItem>("CONTENT", id, true);
  if (!r || r.source !== "ai") return null;
  return { row: toRow(r), output: r.item.output ?? null, questions: r.questions ?? [] };
}

export async function exportGeneratedItems(): Promise<{ row: GeneratedItemRow; item: CodeItem; questions: Question[] }[]> {
  return (await queryAll<ContentItem>("CONTENT"))
    .filter((r) => r.source === "ai")
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => ({ row: toRow(r), item: r.item, questions: r.questions ?? [] }));
}

/** 데이터 가져오기: AI 콘텐츠를 그대로 저장 (id·상태·검증 보고서 유지) */
export async function importGeneratedItem(row: GeneratedItemRow, item: CodeItem, questions: Question[]) {
  await putItem({
    pk: "CONTENT",
    sk: row.id,
    item: { ...item, source: "ai" },
    questions,
    source: "ai",
    status: row.status,
    validation: row.validation,
    jobId: null,
    createdAt: row.createdAt,
  });
  await bumpVersion();
}

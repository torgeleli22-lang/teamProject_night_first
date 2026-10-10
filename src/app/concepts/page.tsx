import { isWeak } from "@/lib/learner/stats";
import { loadProgress } from "@/lib/server/progress";
import { loadContent } from "@/lib/server/content-repo";
import { currentSession } from "@/lib/server/visitor";
import { listAttempts } from "@/lib/server/session-repo";
import type { QuestionType } from "@/lib/types";
import { ExploreClient, type ExploreItem } from "./ExploreClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "탐색 — 코드리딩" };

export default async function ConceptsPage() {
  const me = await currentSession();
  const attempts = listAttempts(me.id);
  const stats = loadProgress(me.id).stats;
  const solved = new Map<string, boolean>();
  attempts.forEach((a) => solved.set(a.questionId, solved.get(a.questionId) || a.correct));

  const { items, byItem } = loadContent();
  const codeItems: ExploreItem[] = [...items.values()].map((item) => {
    const qs = byItem.get(item.id) ?? [];
    return {
      id: item.id,
      title: item.title,
      concepts: item.concepts,
      level: item.level,
      source: item.source,
      lines: item.factors.lines,
      questions: qs.map((q) => ({ id: q.id, type: q.type as QuestionType, prompt: q.prompt, solved: solved.get(q.id) ?? null })),
    };
  });

  const mastery = Object.fromEntries([...stats.values()].map((s) => [s.conceptId, { mastery: s.mastery, weak: isWeak(s) }]));
  return <ExploreClient items={codeItems} mastery={mastery} initialLevel={me.preferredLevel ?? null} />;
}

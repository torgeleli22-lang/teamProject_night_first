import { conceptStats, isWeak } from "@/lib/learner/stats";
import { loadContent } from "@/lib/server/content-repo";
import { currentLearner } from "@/lib/server/learner";
import { listAttempts } from "@/lib/server/learner-repo";
import type { QuestionType } from "@/lib/types";
import { ExploreClient, type ExploreItem } from "./ExploreClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "탐색 — 코드리딩" };

export default async function ConceptsPage() {
  const learner = await currentLearner();
  const attempts = listAttempts(learner.id);
  const stats = conceptStats(attempts);
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
  return <ExploreClient items={codeItems} mastery={mastery} initialLevel={learner.preferredLevel ?? null} />;
}

"use client";

import { LoadState } from "@/components/ui";
import type { ConceptsView } from "@/api/views";
import { useApi } from "@/lib/api";
import { ExploreClient } from "./ExploreClient";

export function ConceptsClient() {
  const { data, error, slow, reload } = useApi<ConceptsView>("/concepts");
  if (!data) return <div className="px-4">{<LoadState error={error} slow={slow} onRetry={reload} />}</div>;
  return <ExploreClient items={data.items} mastery={data.mastery} initialLevel={data.initialLevel} />;
}

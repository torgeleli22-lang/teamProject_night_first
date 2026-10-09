import { NextResponse } from "next/server";
import { aiMode, MODELS } from "@/lib/ai/client";
import { generatableLevels, launchFillPlan, POLICY, TRIGGER_LABEL } from "@/lib/content/policy";
import { CONCEPTS } from "@/lib/curriculum";
import { coverage, listGeneratedItems } from "@/lib/server/content-repo";
import { adminDenied } from "@/lib/server/http";
import { demandByCell, estimateCost, gradingSplit, listJobs, monthToDateCostUsd, usageSummary } from "@/lib/server/ops-repo";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const denied = adminDenied(req);
  if (denied) return denied;
  const stock = coverage();
  const usage = usageSummary();
  return NextResponse.json({
    mode: aiMode(),
    models: MODELS,
    policy: POLICY,
    triggerLabels: TRIGGER_LABEL,
    generatable: Object.fromEntries(CONCEPTS.map((c) => [c.id, generatableLevels(c.id)])),
    coverage: Object.fromEntries(stock),
    demand: demandByCell(Date.now() - POLICY.demandWindowDays * 86400_000),
    fillPlan: launchFillPlan((c, l) => stock.get(`${c}:${l}`) ?? 0, CONCEPTS.map((c) => c.id)),
    usage,
    cost: { total: estimateCost(usage), monthToDate: monthToDateCostUsd(aiMode() === "mock") },
    grading: gradingSplit(),
    jobs: listJobs(30),
    generated: listGeneratedItems(20),
  });
}

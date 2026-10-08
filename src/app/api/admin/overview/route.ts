import { NextResponse } from "next/server";
import { aiEnabled, MODELS } from "@/lib/ai/client";
import { coverage, listGeneratedItems } from "@/lib/server/content-repo";
import { adminDenied } from "@/lib/server/http";
import { gradingSplit, listJobs, usageSummary } from "@/lib/server/ops-repo";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const denied = adminDenied(req);
  if (denied) return denied;
  return NextResponse.json({
    ai: aiEnabled(),
    models: MODELS,
    coverage: Object.fromEntries(coverage()),
    usage: usageSummary(),
    grading: gradingSplit(),
    jobs: listJobs(20),
    generated: listGeneratedItems(20),
  });
}

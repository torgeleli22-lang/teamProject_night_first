import { after, NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai/client";
import { generateCodeSet } from "@/lib/ai/generate";
import { launchFillPlan } from "@/lib/content/policy";
import { CONCEPTS } from "@/lib/curriculum";
import { coverage } from "@/lib/server/content-repo";
import { adminDenied } from "@/lib/server/http";
import type { Level } from "@/lib/types";

export const maxDuration = 300;

function plan() {
  const stock = coverage();
  return launchFillPlan((c, l) => stock.get(`${c}:${l}`) ?? 0, CONCEPTS.map((c) => c.id));
}

/** 출시 전 채우기 계획 (생성하지 않고 계획만) */
export function GET(req: Request) {
  const denied = adminDenied(req);
  if (denied) return denied;
  return NextResponse.json({ plan: plan() });
}

/**
 * 출시 전 채우기 실행: 최소 재고에 못 미치는 칸마다 코드 세트를 하나씩 생성한다.
 * 오래 걸리므로 백그라운드로 실행하고, 진행 상황은 /admin 의 생성 작업 목록에서 확인한다.
 * limit 개 칸만 처리 (한 번에 비용이 크게 나가지 않도록)
 */
export async function POST(req: Request) {
  const denied = adminDenied(req);
  if (denied) return denied;
  if (!aiEnabled()) return NextResponse.json({ error: "AI 가 꺼져 있어요 (AI_MODE=mock 또는 API 키 필요)." }, { status: 400 });
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 5), 30);
  const cells = plan().slice(0, limit);
  after(async () => {
    for (const c of cells) {
      await generateCodeSet({ concept: c.concept, level: c.level as Level, trigger: "launch_fill", reason: `출시 전 채우기: 공개 문제 ${c.stock}개` });
    }
  });
  return NextResponse.json({ started: cells.length, cells });
}

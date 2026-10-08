import { NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ai: aiEnabled() });
}

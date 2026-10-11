import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { LevelSchema } from "@/lib/schemas";
import { parseBody } from "@/lib/server/http";
import { currentSession } from "@/lib/server/visitor";
import { resetSession, setNickname, setPreferredLevel } from "@/lib/server/session-repo";

const Body = z.object({
  preferredLevel: LevelSchema.optional(),
  reset: z.boolean().optional(),
  /** 랭킹에 보이는 이름 */
  nickname: z.string().trim().min(1).max(12).optional(),
});

export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (body instanceof NextResponse) return body;
  const me = await currentSession();
  if (body.reset) resetSession(me.id);
  if (body.preferredLevel) setPreferredLevel(me.id, body.preferredLevel);
  if (body.nickname) setNickname(me.id, body.nickname);
  return NextResponse.json({ ok: true });
}

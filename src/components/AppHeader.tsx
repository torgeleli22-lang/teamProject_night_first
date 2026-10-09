import Link from "next/link";
import { aiMode } from "@/lib/ai/client";
import { learnerLevel, streakDays, totalXp } from "@/lib/learner/stats";
import { currentLearner } from "@/lib/server/learner";
import { listAttempts } from "@/lib/server/learner-repo";
import { NavLinks } from "./NavLinks";

export async function AppHeader() {
  const learner = await currentLearner();
  const attempts = listAttempts(learner.id);
  const xp = totalXp(attempts);
  const { level } = learnerLevel(xp);
  const streak = streakDays(attempts);

  const mock = aiMode() === "mock";

  return (
    <>
    {mock && (
      <div className="bg-sun-100 px-4 py-1.5 text-center text-xs font-semibold text-sun-600">
        🧪 목업 AI 모드 — AI 응답은 흉내 낸 결과예요. <Link href="/demo" className="underline underline-offset-2">데모 데이터 바꾸기</Link>
      </div>
    )}
    <header className="sticky top-0 z-30 border-b border-ink-200/60 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-ink-900">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 font-mono text-sm text-white">{"{ }"}</span>
          <span className="text-[15px]">코드리딩</span>
        </Link>
        <NavLinks />
        {attempts.length > 0 && (
          <div className="ml-auto flex items-center gap-2 text-sm font-semibold">
            <span className="chip bg-sun-50 text-sun-600" title="연속 학습일">
              🔥 {streak}일
            </span>
            <span className="chip bg-brand-50 text-brand-700" title="학습 레벨">
              Lv.{level} · {xp} XP
            </span>
          </div>
        )}
      </div>
    </header>
    </>
  );
}

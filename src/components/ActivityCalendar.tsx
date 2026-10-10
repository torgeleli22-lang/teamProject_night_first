import type { DailyActivity } from "@/lib/server/session-repo";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 한국 시간 기준 오늘 */
function todayKST() {
  const d = new Date(Date.now() + 9 * 3600_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate() };
}

const key = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** 이번 달 학습 캘린더. 하루 요약 테이블(daily_activity)만 사용한다 */
export function ActivityCalendar({ days }: { days: DailyActivity[] }) {
  const { year, month, date } = todayKST();
  const byDay = new Map(days.map((d) => [d.day, d]));
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const lastDate = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthDays = Array.from({ length: lastDate }, (_, i) => byDay.get(key(year, month, i + 1)));
  const studied = monthDays.filter(Boolean) as DailyActivity[];
  const max = Math.max(1, ...studied.map((d) => d.solved));

  const tone = (solved: number) => {
    const r = solved / max;
    return r > 0.66 ? "bg-brand-600 text-white" : r > 0.33 ? "bg-brand-400 text-white" : "bg-brand-100 text-brand-800";
  };

  return (
    <div>
      <div className="mb-3 flex items-end justify-between">
        <p className="font-bold">
          {year}년 {month + 1}월
        </p>
        <p className="text-xs text-ink-400">
          공부한 날 {studied.length}일 · {studied.reduce((s, d) => s + d.solved, 0)}문제
        </p>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEK.map((w) => (
          <span key={w} className="pb-1 font-semibold text-ink-400">
            {w}
          </span>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {monthDays.map((d, i) => {
          const isToday = i + 1 === date;
          return (
            <span
              key={i}
              title={d ? `${d.solved}문제 · 정답 ${d.correct}개 · ${Math.round(d.timeMs / 60000)}분` : undefined}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg ${d ? tone(d.solved) : "bg-ink-50 text-ink-300"} ${
                isToday ? "ring-2 ring-sun-500 ring-offset-1" : ""
              }`}
            >
              <span className="font-semibold">{i + 1}</span>
              {d && <span className="text-[9px] leading-none opacity-80">{d.solved}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

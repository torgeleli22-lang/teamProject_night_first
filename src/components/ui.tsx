import type { ReactNode } from "react";
import type { UnderstandingLevel } from "@/lib/types";

export function ProgressBar({
  value,
  tone = "brand",
  size = "md",
  label,
}: {
  value: number;
  tone?: "brand" | "mint" | "sun" | "coral";
  size?: "sm" | "md";
  label?: string;
}) {
  const color = { brand: "bg-brand-500", mint: "bg-mint-500", sun: "bg-sun-500", coral: "bg-coral-500" }[tone];
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`w-full overflow-hidden rounded-full bg-ink-100 ${size === "sm" ? "h-1.5" : "h-2.5"}`}
    >
      <div className={`h-full rounded-full ${color} transition-[width] duration-700 ease-out`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function masteryTone(mastery: number): "mint" | "brand" | "sun" {
  if (mastery >= 80) return "mint";
  if (mastery >= 50) return "brand";
  return "sun";
}

const LEVEL_STYLE: Record<UnderstandingLevel, { label: string; className: string; dot: string }> = {
  good: { label: "좋음", className: "bg-mint-50 text-mint-700", dot: "bg-mint-500" },
  ok: { label: "보통", className: "bg-sun-50 text-sun-600", dot: "bg-sun-500" },
  weak: { label: "더 알아보기", className: "bg-coral-50 text-coral-600", dot: "bg-coral-500" },
};

export function UnderstandingChip({ level }: { level: UnderstandingLevel }) {
  const s = LEVEL_STYLE[level];
  return (
    <span className={`chip ${s.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function DifficultyDots({ level, max = 5 }: { level: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`난이도 ${level}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < level ? "bg-brand-500" : "bg-ink-200"}`} />
      ))}
    </span>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-[17px] font-bold text-ink-900">{children}</h2>
      {action}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-hidden
    />
  );
}

/**
 * 데이터를 불러오는 동안·실패했을 때 화면.
 * 3초 넘게 걸리면 DB 가 쉬다가 깨어나는 중일 수 있다고 알려준다 (Aurora Serverless 0 ACU).
 */
export function LoadState({ error, slow, onRetry }: { error: string | null; slow: boolean; onRetry?: () => void }) {
  if (error) {
    return (
      <div className="glass mx-auto mt-10 max-w-md p-8 text-center">
        <p className="text-4xl" aria-hidden>
          🌧️
        </p>
        <p className="mt-3 font-bold">데이터를 불러오지 못했어요</p>
        <p className="mt-1 text-sm text-ink-500">{error}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-primary mt-5 px-5 py-2.5 text-sm">
            다시 시도
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="mx-auto mt-6 max-w-4xl space-y-4" aria-busy="true" aria-live="polite">
      <div className="skeleton h-8 w-56" />
      <div className="skeleton h-4 w-80" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="skeleton h-40" />
        <div className="skeleton h-40" />
      </div>
      {slow && <p className="text-center text-sm text-ink-500">☕ 서버를 깨우는 중이에요. 잠시만 기다려 주세요 (처음 한 번은 10~20초 걸릴 수 있어요).</p>}
    </div>
  );
}

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

export function DifficultyDots({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`난이도 ${level}/3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= level ? "bg-brand-500" : "bg-ink-200"}`} />
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

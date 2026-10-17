import { type Language, LANGUAGE_NAMES, type MarkKind } from "@/lib/api-types";

/** 공책 한 장 (가로줄 + 빨간 여백선) */
export function Page({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`page ${className}`}>
      <div className="page-body">{children}</div>
    </div>
  );
}

/** 단계 표시: 1장 · 주제 고르기 → 2장 · 메모 → 3장 · 첨삭 */
export function Crumb({ children }: { children: React.ReactNode }) {
  return <p className="crumb">{children}</p>;
}

const STICKY = { yellow: "bg-sticky-yellow", mint: "bg-sticky-mint", pink: "bg-sticky-pink" };

/** 포스트잇 (마스킹테이프는 tape) */
export function Sticky({
  color = "yellow",
  tape = false,
  tilt = 0,
  className = "",
  children,
}: {
  color?: keyof typeof STICKY;
  tape?: boolean;
  tilt?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`sticky-note ${STICKY[color]} ${className}`} style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}>
      {tape && <span className="tape" aria-hidden />}
      {children}
    </div>
  );
}

/** 빨간 도장 (난이도 등) */
export function Stamp({ children }: { children: React.ReactNode }) {
  return <span className="stamp">{children}</span>;
}

/** 코드 언어 꼬리표 (Python · JavaScript) — 제목 옆, 노트 목록 */
export function LangTag({ language }: { language?: Language }) {
  return <span className="border border-ink-400 bg-paper px-1.5 py-0.5 font-sans text-xs font-normal text-ink-700">{LANGUAGE_NAMES[language ?? "python"]}</span>;
}

/**
 * 빨간펜 표시: ○ 정확 · △ 부분 · ✕ 오해 · ⬚ 누락.
 * 화면의 모든 ○△✕⬚ 는 이 그림 하나로 그린다 (글자 ○ 를 쓰지 않기 — 글꼴·색이 제각각이 됨).
 * inline: 문장 안에 글자 크기로 (예: "처음 설명에서 ○ 27%")
 */
export function PenMark({ kind, size = 28, inline = false }: { kind: MarkKind; size?: number; inline?: boolean }) {
  const common = { fill: "none", stroke: "#c0392b", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg
      width={inline ? "1.05em" : size}
      height={inline ? "1.05em" : size}
      viewBox="0 0 32 32"
      role={inline ? "img" : undefined}
      aria-label={inline ? MARK_LABELS[kind] : undefined}
      aria-hidden={inline ? undefined : true}
      className={inline ? "mx-[0.1em] inline-block shrink-0 align-[-0.17em]" : "shrink-0"}
    >
      {kind === "correct" && <path {...common} d="M16 3.5c7.2 0 12.5 5.3 12.3 12.6-.2 7.1-5.6 12.4-12.6 12.3C8.6 28.3 3.4 23 3.6 15.8 3.8 9 8.5 3.6 16.4 3.4" />}
      {kind === "partial" && <path {...common} d="M16 4.5 29 27.5H3.2L16.4 4.1" />}
      {kind === "wrong" && <path {...common} d="M5 5.5 27 27M27.3 5 4.8 27.4" />}
      {kind === "missing" && <rect {...common} x="5" y="5" width="22" height="22" strokeDasharray="4 3" />}
    </svg>
  );
}

const MARK_LABELS: Record<MarkKind, string> = { correct: "정확(○)", partial: "부분(△)", wrong: "오해(✕)", missing: "누락" };
const MARK_CHARS: Record<string, MarkKind> = { "○": "correct", "◯": "correct", "△": "partial", "✕": "wrong", "✗": "wrong", "⬚": "missing" };

/** 문장 안의 ○△✕⬚ 글자를 빨간펜 그림으로 바꿔 보여 준다 (서버·AI 가 보낸 문장용) */
export function MarkText({ text }: { text: string }) {
  return (
    <>
      {text.split(/([○◯△✕✗⬚])/).map((part, i) => (MARK_CHARS[part] ? <PenMark key={i} kind={MARK_CHARS[part]} inline /> : part))}
    </>
  );
}

/** 기다리는 동안 (손글씨) */
export function Waiting({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 py-6" role="status">
      <span className="inline-block h-4 w-4 animate-spin border-2 border-pen-red border-t-transparent" style={{ borderRadius: "50%" }} />
      <span className="hand text-pen-red">{text}</span>
    </div>
  );
}

/** 오류 안내 (분홍 포스트잇) */
export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Sticky color="pink" className="my-4 p-4" tape>
      <p className="hand text-pen-red">앗, 잠깐만요!</p>
      <p className="mt-1 text-sm text-ink-700">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-small mt-3">
          다시 시도
        </button>
      )}
    </Sticky>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CodeView, type Range } from "@/components/CodeView";
import type { Language } from "@/lib/api-types";

/**
 * 크게 보기 두 가지:
 * - FullScreen (메모하며 읽기): 코드 + 메모 칸을 그대로 화면 가득 — 메모를 붙이고 고칠 수 있다 (아래)
 * - WideCodeButton (첨삭 결과): 전체 코드만 보는 창
 *
 * WideCodeButton: 전체 코드를 화면 가득 크게 보기 (긴 코드·긴 줄용). 보기만 하는 창.
 * 형광펜·※·①② 는 원래 화면과 같게 보여 주고, '촘촘히'로 한 화면에 더 많은 줄을, '긴 줄 접기'로 가로 스크롤 없이 볼 수 있다. Esc 로 닫기.
 * 화면 맨 위(body)에 띄워서 원래 화면의 따라 내려오는 칸·버튼이 위로 비치지 않게 한다.
 */
export function WideCodeButton(props: { title: string; code: string; language: Language; stars?: number[]; highlights?: Range[]; labels?: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-small" onClick={() => setOpen(true)}>
        크게 보기
      </button>
      {open && createPortal(<WideCode {...props} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function WideCode({
  title,
  code,
  language,
  stars = [],
  highlights = [],
  labels = [],
  onClose,
}: {
  title: string;
  code: string;
  language: Language;
  stars?: number[];
  highlights?: Range[];
  labels?: string[];
  onClose: () => void;
}) {
  const [wrap, setWrap] = useState(false);
  const [dense, setDense] = useState(true);
  // Esc 로 닫기 + 뒤의 화면은 스크롤하지 않게
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper" role="dialog" aria-modal="true" aria-label={`${title} 전체 코드`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-900 px-4 py-2 sm:px-6">
        <b className="min-w-0 flex-1 truncate font-serif text-lg">{title} · 전체 코드</b>
        <span className="hidden text-xs text-ink-500 sm:inline">보기만 하는 창이에요. 메모는 원래 화면에서 붙여요.</span>
        <label className="flex items-center gap-1.5 text-xs text-ink-700">
          <input type="checkbox" checked={dense} onChange={(e) => setDense(e.target.checked)} />
          촘촘히 (한 화면에 더 많은 줄)
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-700">
          <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />
          긴 줄 접기
        </label>
        <button type="button" className="btn-small" onClick={onClose} autoFocus>
          닫기 (Esc)
        </button>
      </div>
      <div className="flex-1 overflow-auto px-2 py-3 sm:px-6">
        <CodeView code={code} language={language} stars={stars} highlights={highlights} labels={labels} wrap={wrap} dense={dense} />
      </div>
    </div>
  );
}

/**
 * 크게 보기 (메모하며 읽기): children(코드 + 메모 칸)을 화면 가득 띄운다. 같은 화면의 상태를 그대로 쓰므로 메모를 붙이고 고칠 수 있다.
 * on 이 아니면 children 을 제자리에 그대로. Esc 로 onClose (쓰던 메모가 있으면 닫지 않는 것은 부르는 쪽이 정함).
 */
export function FullScreen({ on, onClose, header, children }: { on: boolean; onClose: () => void; header: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT");
      if (e.key === "Escape" && !typing) onClose();
    };
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [on, onClose]);
  if (!on) return <>{children}</>;
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-paper" role="dialog" aria-modal="true" aria-label="크게 보기">
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-900 px-4 py-2 sm:px-6">{header}</div>
      <div className="flex-1 overflow-auto px-2 py-3 sm:px-6">{children}</div>
    </div>,
    document.body,
  );
}

"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

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

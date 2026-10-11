"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJSON } from "@/lib/api";

export function NicknameEditor({ initial }: { initial: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial);

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="btn-ghost px-3 py-2 text-sm">
        ✏️ 내 이름: {initial}
      </button>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await postJSON("/api/me", { nickname: name.trim() });
        setEditing(false);
        router.refresh();
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={12}
        autoFocus
        aria-label="랭킹에 보일 이름"
        className="w-40 rounded-xl border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
      />
      <button className="btn-primary px-4 py-2 text-sm">저장</button>
    </form>
  );
}

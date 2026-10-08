"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConceptSheet } from "@/components/practice/ConceptSheet";
import { DifficultyDots, ProgressBar, masteryTone } from "@/components/ui";
import { CONCEPTS, LEVELS, QUESTION_TYPE_LABEL as TYPE_LABEL, UNITS } from "@/lib/curriculum";
import type { Level, QuestionType } from "@/lib/types";

export interface ExploreItem {
  id: string;
  title: string;
  concepts: string[];
  level: Level;
  source: "seed" | "ai";
  lines: number;
  questions: { id: string; type: QuestionType; prompt: string; solved: boolean | null }[];
}

const TYPES = Object.keys(TYPE_LABEL) as QuestionType[];

export function ExploreClient({
  items,
  mastery,
  initialLevel,
}: {
  items: ExploreItem[];
  mastery: Record<string, { mastery: number; weak: boolean }>;
  initialLevel: Level | null;
}) {
  const [level, setLevel] = useState<Level | null>(initialLevel);
  const [type, setType] = useState<QuestionType | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      items
        .filter((i) => level === null || i.level === level)
        .map((i) => ({ ...i, questions: i.questions.filter((q) => !type || q.type === type) }))
        .filter((i) => i.questions.length > 0),
    [items, level, type],
  );
  const totalQuestions = filtered.reduce((s, i) => s + i.questions.length, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-8 sm:pb-16">
      <h1 className="text-[26px] font-extrabold tracking-tight">탐색</h1>
      <p className="mt-1 text-ink-500">
        코드 {filtered.length}개 · 질문 {totalQuestions}개. 하나의 코드를 여러 질문으로 읽어봐요.
      </p>

      <div className="mt-5 space-y-2.5">
        <Chips
          label="난이도"
          options={LEVELS.map((l) => ({ id: String(l.level), label: `${l.emoji} ${l.name}` }))}
          value={level === null ? null : String(level)}
          onChange={(v) => setLevel(v === null ? null : (Number(v) as Level))}
        />
        <Chips label="문제 유형" options={TYPES.map((t) => ({ id: t, label: TYPE_LABEL[t] }))} value={type} onChange={(v) => setType(v as QuestionType | null)} />
      </div>

      <div className="mt-6 space-y-8">
        {UNITS.map((unit) => {
          const concepts = unit.conceptIds
            .map((id) => ({ concept: CONCEPTS.find((c) => c.id === id)!, codes: filtered.filter((i) => i.concepts[0] === id) }))
            .filter((c) => c.codes.length > 0);
          if (!concepts.length) return null;
          return (
            <section key={unit.id}>
              <h2 className="mb-3 flex items-center gap-2 font-extrabold">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white text-lg shadow-card">{unit.emoji}</span>
                {unit.title}
                <span className="text-sm font-medium text-ink-400">{unit.description}</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {concepts.map(({ concept, codes }) => {
                  const m = mastery[concept.id]?.mastery ?? 0;
                  const expanded = open === concept.id;
                  const count = codes.reduce((s, c) => s + c.questions.length, 0);
                  return (
                    <div key={concept.id} className={`card p-4 ${expanded ? "sm:col-span-2" : ""}`}>
                      <div className="flex items-center gap-2">
                        <p className="font-bold">{concept.name}</p>
                        {mastery[concept.id]?.weak && <span className="chip bg-sun-50 text-sun-600">복습 추천</span>}
                        {m >= 80 && <span className="chip bg-mint-50 text-mint-700">✓ 익힘</span>}
                      </div>
                      <p className="mt-0.5 text-sm text-ink-500">{concept.keyIdea}</p>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex-1">
                          <ProgressBar value={m} tone={masteryTone(m)} size="sm" label={`${concept.name} 이해도`} />
                        </div>
                        <span className="w-9 text-right font-mono text-xs text-ink-400">{m}%</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Link href={`/practice?concept=${concept.id}&level=${level ?? codes[0].level}`} className="btn-primary px-4 py-2 text-sm">
                          풀어보기
                        </Link>
                        <button type="button" onClick={() => setSheet(concept.id)} className="btn-ghost px-3 py-2 text-sm">
                          📖 개념
                        </button>
                        <button type="button" onClick={() => setOpen(expanded ? null : concept.id)} aria-expanded={expanded} className="btn-ghost ml-auto px-3 py-2 text-sm">
                          코드 {codes.length} · 질문 {count} {expanded ? "▲" : "▼"}
                        </button>
                      </div>
                      {expanded && (
                        <ul className="mt-3 space-y-3">
                          {codes.map((code) => (
                            <li key={code.id} className="rounded-2xl border border-ink-100 p-3">
                              <div className="mb-2 flex items-center gap-2 text-sm">
                                <span className="font-semibold">🧩 {code.title}</span>
                                {code.source === "ai" && <span className="chip bg-brand-50 text-brand-700">AI 생성</span>}
                                <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-400">
                                  {code.lines}줄 <DifficultyDots level={code.level} />
                                </span>
                              </div>
                              <ul className="divide-y divide-ink-100">
                                {code.questions.map((q) => (
                                  <li key={q.id}>
                                    <Link href={`/practice?concept=${concept.id}&level=${code.level}`} className="flex items-center gap-3 py-2 text-sm hover:text-brand-700">
                                      <span
                                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                                          q.solved === true ? "bg-mint-500 text-white" : q.solved === false ? "bg-sun-100 text-sun-600" : "bg-ink-100 text-ink-300"
                                        }`}
                                        aria-label={q.solved === true ? "맞힘" : q.solved === false ? "다시 도전" : "안 풂"}
                                      >
                                        {q.solved === true ? "✓" : q.solved === false ? "!" : "·"}
                                      </span>
                                      <span className="chip shrink-0 bg-ink-100 text-ink-500">{TYPE_LABEL[q.type]}</span>
                                      <span className="min-w-0 flex-1 truncate text-ink-700">{q.prompt}</span>
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {filtered.length === 0 && <p className="py-12 text-center text-ink-400">조건에 맞는 문제가 아직 없어요.</p>}
      </div>
      {sheet && <ConceptSheet conceptId={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={label}>
      <span className="w-16 shrink-0 text-xs font-bold text-ink-400">{label}</span>
      {[{ id: "", label: "전체" }, ...options].map((o) => {
        const active = (value ?? "") === o.id;
        return (
          <button
            key={o.id || "all"}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id || null)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              active ? "bg-ink-900 text-white" : "bg-white text-ink-500 ring-1 ring-ink-200 hover:text-ink-900"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { CONCEPTS, LEVELS, UNITS } from "@/lib/curriculum";
import type { Level, QuestionType } from "@/lib/types";

/** 화면에 보이는 문제 유형 (순서·설명) */
export const TYPE_OPTIONS: { type: QuestionType; label: string; hint: string; icon: string }[] = [
  { type: "multiple_choice", label: "객관식", hint: "보기 중에서 고르기", icon: "🔘" },
  { type: "predict_output", label: "실행 결과 예측", hint: "출력을 직접 써 보기", icon: "🔮" },
  { type: "fill_blank", label: "빈칸 채우기", hint: "빠진 코드 고르기", icon: "🧩" },
  { type: "shuffle", label: "코드 셔플", hint: "실행 순서 맞추기", icon: "🔀" },
  { type: "find_bug", label: "오류 찾기", hint: "문제 있는 줄 찾기", icon: "🐞" },
  { type: "short_answer", label: "주관식 · 코드 해석", hint: "내 말로 설명하기", icon: "✍️" },
];

/**
 * 새로운 학습 시작: 난이도 + 문제 유형 + (선택) 개념.
 * 추천 난이도는 보여주기만 하고 자동으로 바꾸지 않는다.
 */
export function StartPanel({
  initialLevel,
  suggestedLevel,
  recommendedConcept,
}: {
  initialLevel: Level;
  suggestedLevel: Level | null;
  recommendedConcept: string;
}) {
  const [level, setLevel] = useState<Level>(initialLevel);
  const [types, setTypes] = useState<QuestionType[]>([]);
  const [concept, setConcept] = useState<string>("");

  const toggle = (t: QuestionType) => setTypes((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  const params = new URLSearchParams({ mode: "learn", level: String(level) });
  if (types.length) params.set("types", types.join(","));
  if (concept) params.set("concept", concept);
  const info = LEVELS[level - 1];
  const conceptName = CONCEPTS.find((c) => c.id === (concept || recommendedConcept))?.name;

  return (
    <div className="space-y-6">
      {/* 1. 난이도 */}
      <div>
        <p className="mb-2.5 text-sm font-bold text-ink-700">
          <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[11px] text-white">1</span>
          난이도
        </p>
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="난이도">
          {LEVELS.map((l) => {
            const active = l.level === level;
            return (
              <button
                key={l.level}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setLevel(l.level)}
                className={`relative flex flex-col items-center gap-1 rounded-2xl border px-1 py-3 transition ${
                  active ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20" : "border-ink-200 bg-white hover:border-brand-300"
                }`}
              >
                {suggestedLevel === l.level && <span className="absolute -top-2 rounded-full bg-sun-500 px-1.5 text-[10px] font-bold text-white">추천</span>}
                <span className="text-xl" aria-hidden>
                  {l.emoji}
                </span>
                <span className={`text-[13px] font-bold ${active ? "text-brand-700" : "text-ink-700"}`}>{l.name}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-500">
          <b className="text-ink-700">{info.skillLabel}</b> — {info.description}
        </p>
      </div>

      {/* 2. 문제 유형 */}
      <div>
        <p className="mb-2.5 text-sm font-bold text-ink-700">
          <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[11px] text-white">2</span>
          문제 유형 <span className="font-normal text-ink-400">· 여러 개 고를 수 있어요</span>
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            type="button"
            aria-pressed={types.length === 0}
            onClick={() => setTypes([])}
            className={`col-span-2 flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition sm:col-span-3 ${
              types.length === 0 ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20" : "border-ink-200 bg-white hover:border-brand-300"
            }`}
          >
            <span aria-hidden>🎲</span>
            <span className="text-sm font-bold">전체 섞어서</span>
            <span className="text-xs text-ink-400">같은 코드를 여러 유형으로 (추천)</span>
          </button>
          {TYPE_OPTIONS.map((o) => {
            const active = types.includes(o.type);
            return (
              <button
                key={o.type}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(o.type)}
                className={`flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-left transition ${
                  active ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20" : "border-ink-200 bg-white hover:border-brand-300"
                }`}
              >
                <span aria-hidden>{o.icon}</span>
                <span>
                  <span className={`block text-sm font-bold ${active ? "text-brand-700" : "text-ink-900"}`}>{o.label}</span>
                  <span className="block text-xs text-ink-400">{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 개념 */}
      <div>
        <label className="mb-2.5 block text-sm font-bold text-ink-700" htmlFor="concept-select">
          <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[11px] text-white">3</span>
          개념 <span className="font-normal text-ink-400">· 선택하지 않으면 다음 배울 개념을 추천해요</span>
        </label>
        <select
          id="concept-select"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-[15px] outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
        >
          <option value="">✨ 추천: {CONCEPTS.find((c) => c.id === recommendedConcept)?.name}</option>
          {UNITS.map((u) => (
            <optgroup key={u.id} label={`${u.emoji} ${u.title}`}>
              {u.conceptIds.map((id) => (
                <option key={id} value={id}>
                  {CONCEPTS.find((c) => c.id === id)?.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <Link href={`/practice?${params}`} className="btn-primary w-full py-3.5 text-base">
        {info.emoji} {info.name} · {types.length ? `${types.length}가지 유형` : "전체 유형"} · {conceptName} 시작하기 →
      </Link>
    </div>
  );
}

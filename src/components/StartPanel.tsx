"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CERTS, CONCEPTS, LEVELS, unitsOf } from "@/lib/curriculum";
import type { Level, Track } from "@/lib/types";

/** 코드 학습 언어 (실행 검증기가 준비된 언어만 고를 수 있음) */
const LANGUAGES = [
  { id: "javascript", label: "JavaScript", ready: true },
  { id: "python", label: "Python", ready: false },
  { id: "java", label: "Java", ready: false },
];

const conceptName = (id: string) => CONCEPTS.find((c) => c.id === id)?.name ?? id;

/**
 * 새로운 학습 시작: ① 개념 / 코드 고르기 → 갈래에 맞는 범위 고르기.
 * - 개념: 분야 → 주제 → (선택) 자격증 → 난이도. 자격증 시험처럼 객관식 10문제
 * - 코드: 언어 → 난이도 → 개념. 코드 하나를 훑어보기 → 핵심 줄 → 정리 순서로 읽기
 * 추천 난이도는 보여주기만 하고 자동으로 바꾸지 않는다.
 */
export function StartPanel({
  initialLevel,
  initialTrack,
  suggestedLevel,
  recommendedConcept,
}: {
  initialLevel: Level;
  initialTrack: Track;
  suggestedLevel: Level | null;
  recommendedConcept: string;
}) {
  const [track, setTrack] = useState<Track>(initialTrack);
  const [level, setLevel] = useState<Level>(initialLevel);
  // 개념 학습
  const [unit, setUnit] = useState<number | null>(null);
  const [topic, setTopic] = useState("");
  const [cert, setCert] = useState("");
  // 코드 학습
  const [concept, setConcept] = useState("");

  const theoryUnits = unitsOf("theory");
  const codeUnits = unitsOf("code");
  const chosenUnit = theoryUnits.find((u) => u.id === unit);
  const info = LEVELS[level - 1];

  const params = new URLSearchParams({ mode: "learn", track, level: String(level) });
  let label: string;
  if (track === "theory") {
    if (topic) params.set("concept", topic);
    else if (unit) params.set("unit", String(unit));
    else params.set("concept", "all");
    if (cert) params.set("cert", cert);
    label = `🧠 ${topic ? conceptName(topic) : (chosenUnit?.title ?? "전체 분야")}${cert ? ` · ${cert}` : ""} 문제 풀기 →`;
  } else {
    if (concept) params.set("concept", concept);
    const name = concept === "all" ? "전체 개념" : conceptName(concept || recommendedConcept);
    label = `${info.emoji} ${info.name} · ${name} 코드 읽기 →`;
  }

  return (
    <div className="space-y-6">
      {/* 1. 갈래 */}
      <Step n={1} title="무엇을 학습할까요?">
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="학습 갈래">
          <TrackCard
            active={track === "theory"}
            onClick={() => setTrack("theory")}
            emoji="🧠"
            title="개념"
            text="네트워크·개발·운영·보안 지식을 자격증 문제처럼"
          />
          <TrackCard active={track === "code"} onClick={() => setTrack("code")} emoji="💻" title="코드" text="코드 하나를 단계별로 읽으며 흐름 이해하기" />
        </div>
      </Step>

      {track === "theory" ? (
        <>
          <Step n={2} title="분야">
            <div className="flex flex-wrap gap-2">
              <Chip
                active={unit === null}
                onClick={() => {
                  setUnit(null);
                  setTopic("");
                }}
              >
                🌐 전체 분야
              </Chip>
              {theoryUnits.map((u) => (
                <Chip
                  key={u.id}
                  active={unit === u.id}
                  onClick={() => {
                    setUnit(u.id);
                    setTopic("");
                  }}
                >
                  {u.emoji} {u.title}
                </Chip>
              ))}
            </div>
            {chosenUnit && <p className="mt-2 text-xs text-ink-500">{chosenUnit.description}</p>}
          </Step>

          {chosenUnit && (
            <Step n={3} title="주제" note="분야 전체 또는 주제 하나">
              <select
                aria-label="주제"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-[15px] outline-none backdrop-blur focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
              >
                <option value="">{chosenUnit.emoji} {chosenUnit.title} 전체</option>
                {chosenUnit.conceptIds.map((id) => (
                  <option key={id} value={id}>
                    {conceptName(id)}
                  </option>
                ))}
              </select>
            </Step>
          )}

          <Step n={chosenUnit ? 4 : 3} title="자격증 대비" note="선택하면 그 자격증과 관련된 문제만 나와요">
            <div className="flex flex-wrap gap-2">
              <Chip active={!cert} onClick={() => setCert("")}>
                선택 안 함
              </Chip>
              {CERTS.map((c) => (
                <Chip key={c} active={cert === c} onClick={() => setCert(c)}>
                  🎓 {c}
                </Chip>
              ))}
            </div>
          </Step>

          <Step n={chosenUnit ? 5 : 4} title="난이도" note="가까운 난이도의 문제부터 나와요">
            <LevelPicker level={level} setLevel={setLevel} suggestedLevel={null} />
            <p className="mt-2 text-xs text-ink-500">
              <b className="text-ink-700">{info.name}</b> — {info.theoryDescription}
            </p>
          </Step>
        </>
      ) : (
        <>
          <Step n={2} title="언어">
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <Chip key={l.id} active={l.id === "javascript"} disabled={!l.ready} onClick={() => {}}>
                  {l.label}
                  {!l.ready && <span className="ml-1 text-[11px] text-ink-400">준비 중</span>}
                </Chip>
              ))}
            </div>
          </Step>

          <Step n={3} title="난이도">
            <LevelPicker level={level} setLevel={setLevel} suggestedLevel={suggestedLevel} />
            <p className="mt-2 text-xs text-ink-500">
              <b className="text-ink-700">{info.skillLabel}</b> — {info.description}
            </p>
          </Step>

          <Step n={4} title="개념" note="추천 개념, 전체 개념, 또는 원하는 개념 하나">
            <select
              aria-label="개념"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              className="w-full rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-[15px] outline-none backdrop-blur focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            >
              <option value="">✨ 추천: {conceptName(recommendedConcept)}</option>
              <option value="all">🌐 전체 개념 (여러 개념을 섞어서)</option>
              {codeUnits.map((u) => (
                <optgroup key={u.id} label={`${u.emoji} ${u.title}`}>
                  {u.conceptIds.map((id) => (
                    <option key={id} value={id}>
                      {conceptName(id)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="mt-2 text-xs text-ink-500">코드 하나를 👀 훑어보기 → 🔑 핵심 줄 → 📝 정리 순서로 읽어요.</p>
          </Step>
        </>
      )}

      <Link href={`/practice?${params}`} className="btn-primary w-full py-3.5 text-base">
        {label}
      </Link>
    </div>
  );
}

function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-sm font-bold text-ink-700">
        <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[11px] text-white">{n}</span>
        {title} {note && <span className="font-normal text-ink-400">· {note}</span>}
      </p>
      {children}
    </div>
  );
}

function TrackCard({ active, onClick, emoji, title, text }: { active: boolean; onClick: () => void; emoji: string; title: string; text: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-2xl border px-4 py-3.5 text-left transition ${
        active ? "border-brand-500 bg-brand-50/85 ring-2 ring-brand-500/20" : "border-white/70 bg-white/55 backdrop-blur hover:border-brand-300 hover:bg-white/80"
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      <span className={`text-base font-extrabold ${active ? "text-brand-700" : "text-ink-900"}`}>{title}</span>
      <span className="text-xs leading-snug text-ink-500">{text}</span>
    </button>
  );
}

function Chip({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl border px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "border-brand-500 bg-brand-50/85 text-brand-700 ring-2 ring-brand-500/20" : "border-white/70 bg-white/55 text-ink-700 backdrop-blur hover:border-brand-300 hover:bg-white/80"
      }`}
    >
      {children}
    </button>
  );
}

function LevelPicker({ level, setLevel, suggestedLevel }: { level: Level; setLevel: (l: Level) => void; suggestedLevel: Level | null }) {
  return (
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
              active ? "border-brand-500 bg-brand-50/85 ring-2 ring-brand-500/20" : "border-white/70 bg-white/55 backdrop-blur hover:border-brand-300 hover:bg-white/80"
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
  );
}

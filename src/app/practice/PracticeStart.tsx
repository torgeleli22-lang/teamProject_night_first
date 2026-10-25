"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MakingCode } from "@/components/MakingCode";
import { Crumb, ErrorNote, MarkText, Page, Sticky, Waiting } from "@/components/ui";
import { apiGet, apiPost, useApi } from "@/lib/api";
import {
  CONCEPT_NAMES,
  type Concept,
  type Language,
  LANGUAGE_NAMES,
  LEVEL_DESCRIPTIONS,
  LEVEL_NAMES,
  type Level,
  type RandomTopic,
  type CodeItem,
  type StudyOverview,
  type TopicCheck,
} from "@/lib/api-types";

const MAX_TOPIC = 50;
const EXAMPLES = ["카페 주문", "도서관 대출", "성적 처리", "게임 점수판", "버스 도착 안내", "가계부"];
const ADVANCED_EXAMPLES = ["지하철 최단 경로", "배달 주문 고르기", "강의실 배정", "미로 탈출 길 찾기", "놀이공원 대기열"];
const LANGUAGES: { key: Language; note: string }[] = [
  { key: "python", note: "들여쓰기로 흐름이 보이는 언어. 처음이라면 여기서 시작해요." },
  { key: "javascript", note: "웹에서 쓰는 언어. 중괄호 { } 와 배열 메서드(map·filter), 콜백을 따라가요." },
];
const LANGUAGE_KEY = "codereading.language";

/** 마지막에 고른 언어 (이 탭에서만 기억) */
function savedLanguage(): Language {
  try {
    const v = sessionStorage.getItem(LANGUAGE_KEY);
    return v === "javascript" ? v : "python";
  } catch {
    return "python";
  }
}

/** 02 · 연습 모드: 난이도 + 주제 (랜덤으로 뽑기 / 직접 적기) */
export function PracticeStart() {
  const router = useRouter();
  // '내 공부'에서 넘어오면 ?level=3&focus=loop_update (추천 난이도 · 집중 개념)
  const params = useSearchParams();
  const fromLevel = Number(params.get("level"));
  const [level, setLevel] = useState<Level>(fromLevel >= 1 && fromLevel <= 4 ? (fromLevel as Level) : 2);
  const [language, setLanguage] = useState<Language>("python");
  useEffect(() => setLanguage(savedLanguage()), []);
  function pickLanguage(next: Language) {
    setLanguage(next);
    try {
      sessionStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      /* 저장하지 못해도 고른 언어로 진행 */
    }
  }
  const [focus, setFocus] = useState<Concept | null>((params.get("focus") as Concept) in CONCEPT_NAMES ? (params.get("focus") as Concept) : null);
  const { data: study } = useApi<StudyOverview>("/study");
  const [tab, setTab] = useState<"random" | "write">("random");
  const [randomTopic, setRandomTopic] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [check, setCheck] = useState<TopicCheck | null>(null);
  const [busy, setBusy] = useState<"check" | "make" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draw = useCallback(() => {
    setError(null);
    apiGet<RandomTopic>(`/topic/random?level=${level}`)
      .then((r) => setRandomTopic(r.topic))
      .catch((e) => setError(e.message));
  }, [level]);
  // 고급은 알고리즘이 들어가는 주제 목록이라, 고급으로 바꾸거나 고급에서 바꾸면 다시 뽑는다
  const advanced = level === 4;
  useEffect(draw, [advanced]);

  /** 주제가 정해지면 코드 받기 → 2장(읽기)으로 */
  async function make(topic: string) {
    setBusy("make");
    setError(null);
    try {
      const codeItem = await apiPost<CodeItem>("/practice", { level, topic, language, ...(focus ? { focus } : {}) });
      router.push(`/read/?id=${codeItem.codeId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function submit() {
    if (tab === "random") {
      if (randomTopic) await make(randomTopic);
      return;
    }
    // 직접 적은 주제는 AI 가 먼저 판정 (막연함·너무 큼·부적절)
    setBusy("check");
    setError(null);
    setCheck(null);
    try {
      const r = await apiPost<TopicCheck>("/topic/check", { level, text: text.trim() });
      if (r.verdict === "ok") return await make(r.topic);
      setCheck(r);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  const canSubmit = !busy && (tab === "random" ? !!randomTopic : text.trim().length > 0 && text.length <= MAX_TOPIC);
  const summary = `${LANGUAGE_NAMES[language]} · ${LEVEL_NAMES[level]} · ${tab === "random" ? (randomTopic ? `랜덤 주제 '${randomTopic}'` : "랜덤 주제") : text.trim() || "주제를 적어 주세요"}`;

  return (
    <Page>
      <Crumb>
        <b className="text-pen-red">1장 · 주제 고르기</b> → 2장 · 메모 → 3장 · 첨삭
      </Crumb>
      <h1 className="mt-2 text-3xl">어떤 코드를 읽어 볼까요?</h1>
      <p className="mt-2 text-sm text-ink-700">난이도는 출발점일 뿐이에요. 받아 본 코드가 버거우면 다음 장에서 바로 &lsquo;더 쉽게&rsquo;로 바꿀 수 있어요.</p>

      {/* 난이도 */}
      {focus && (
        <Sticky color="pink" tape className="mt-6 max-w-2xl p-4">
          <p className="hand text-pen-red">집중 연습: {CONCEPT_NAMES[focus]}</p>
          <p className="mt-1 text-sm text-ink-700">이 흐름이 많이 나오는 코드로 만들고, ※ 꼭 설명할 곳의 절반 이상을 이 개념으로 골라 드려요.</p>
          <button type="button" className="btn-small mt-2" onClick={() => setFocus(null)}>
            집중 연습 빼기
          </button>
        </Sticky>
      )}

      <h2 className="mt-8 text-lg">언어</h2>
      <div className="mt-3 flex border-b border-ink-900" role="radiogroup" aria-label="언어">
        {LANGUAGES.map(({ key }) => (
          <button key={key} type="button" role="radio" aria-checked={language === key} className={language === key ? "tab-on" : "tab"} onClick={() => pickLanguage(key)}>
            {LANGUAGE_NAMES[key]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-ink-700">{LANGUAGES.find((l) => l.key === language)?.note}</p>

      <h2 className="mt-8 text-lg">난이도</h2>
      {study && study.summary.codes > 0 && study.levels.advice !== "none" && (
        <p className="mt-1 text-sm">
          <span className="hand text-pen-red">
            <MarkText text={study.levels.message} />
          </span>{" "}
          {study.levels.suggested !== level && (
            <button type="button" className="text-xs text-pen-blue underline" onClick={() => setLevel(study.levels.suggested)}>
              {LEVEL_NAMES[study.levels.suggested]} 고르기
            </button>
          )}{" "}
          <Link href="/study" className="text-xs text-ink-500 underline">
            내 공부 보기
          </Link>
        </p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="난이도">
        {([1, 2, 3, 4] as Level[]).map((lv) => {
          const on = lv === level;
          return (
            <button
              key={lv}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setLevel(lv)}
              className={`border bg-paper p-4 text-left ${on ? "border-ink-900 shadow-btn" : "border-ink-300 hover:border-ink-500"}`}
            >
              <span className={`relative inline-block font-serif text-lg font-bold ${on ? "px-2" : ""}`}>
                {on && <span className="absolute inset-0 -rotate-3 border-2 border-pen-red" style={{ borderRadius: "50%" }} aria-hidden />}
                {LEVEL_NAMES[lv]}
              </span>
              <span className="mt-2 block border-t border-ink-200 pt-2 text-xs leading-relaxed text-ink-500">{LEVEL_DESCRIPTIONS[lv]}</span>
            </button>
          );
        })}
      </div>

      {/* 주제 */}
      <h2 className="mt-8 text-lg">주제</h2>
      <div className="mt-3 flex border-b border-ink-900">
        <button type="button" className={tab === "random" ? "tab-on" : "tab"} onClick={() => setTab("random")}>
          랜덤으로 뽑기
        </button>
        <button type="button" className={tab === "write" ? "tab-on" : "tab"} onClick={() => setTab("write")}>
          직접 적기
        </button>
      </div>

      {tab === "random" ? (
        <div className="mt-4">
          <p className="text-sm text-ink-700">코드를 만들 때 아래 같은 생활 속 주제 중 하나를 뽑아요. 최근에 풀었던 주제는 빼고 뽑아요.</p>
          <p className="hand mt-2 text-pen-blue">{(advanced ? ADVANCED_EXAMPLES : EXAMPLES).join(" · ")} …</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-500">뽑은 주제</span>
            <span className="hand marker text-2xl text-ink-900">{randomTopic ?? "뽑는 중…"}</span>
            <button type="button" className="btn-small" onClick={draw} disabled={!!busy}>
              다시 뽑기
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <label className="text-sm text-ink-700" htmlFor="topic">
            읽고 싶은 코드의 주제를 적어 주세요. 기능 하나 정도가 좋아요.
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="topic"
              className="field max-w-md"
              value={text}
              maxLength={MAX_TOPIC}
              placeholder="예: 주차 요금 계산"
              onChange={(e) => {
                setText(e.target.value);
                setCheck(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
            />
            <span className="text-xs text-ink-400">
              {text.length}/{MAX_TOPIC}
            </span>
          </div>
          {check && <TopicAdvice check={check} onPick={make} onRandom={() => (setTab("random"), setCheck(null))} />}
        </div>
      )}

      {error && <ErrorNote message={error} />}
      {busy === "make" && <MakingCode language={language} advanced={advanced} what={advanced ? "고급(100~200줄)" : "읽기 연습용"} />}
      {busy === "check" && <Waiting text="주제를 살펴보고 있어요…" />}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink-300 pt-5">
        <span className="hand text-pen-blue">{summary}</span>
        <button type="button" className="btn-ink" onClick={submit} disabled={!canSubmit}>
          코드 받기 →
        </button>
      </div>
    </Page>
  );
}

/** 직접 적은 주제의 판정 결과: 막연함(제안 3개) · 너무 큼(좁힌 주제) · 부적절(랜덤으로) */
function TopicAdvice({ check, onPick, onRandom }: { check: TopicCheck; onPick: (t: string) => void; onRandom: () => void }) {
  const title = { vague: "조금 더 구체적으로 적어 볼까요?", too_big: "한 번에 읽기엔 조금 커요", inappropriate: "이 주제로는 만들 수 없어요", ok: "" }[check.verdict];
  return (
    <Sticky color={check.verdict === "inappropriate" ? "pink" : "yellow"} tape className="mt-5 max-w-2xl p-4">
      <p className="hand text-pen-red">{title}</p>
      <p className="mt-1 text-sm text-ink-700">{check.message}</p>
      {check.suggestions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {check.suggestions.map((s, i) => (
            <button key={s} type="button" className="btn-small max-w-full whitespace-normal break-keep text-left leading-snug" onClick={() => onPick(s)}>
              {check.verdict === "too_big" && i === 0 ? `좁혀서: ${s}` : s}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="btn-small mt-3" onClick={onRandom}>
          랜덤으로 뽑을게요
        </button>
      )}
    </Sticky>
  );
}

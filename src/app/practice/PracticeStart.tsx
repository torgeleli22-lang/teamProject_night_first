"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MakingCode } from "@/components/MakingCode";
import { Crumb, ErrorNote, Page } from "@/components/ui";
import { apiPost } from "@/lib/api";
import { type CodeItem, type Language, LANGUAGE_NAMES, LEVEL_DESCRIPTIONS, LEVEL_NAMES, type Level } from "@/lib/api-types";

const MAX_TOPIC = 50;
const EXAMPLES = ["카페 주문", "도서관 대출", "성적 처리", "주차 요금 계산", "버스 도착 안내", "가계부"];
const LANGUAGES: { key: Language; note: string }[] = [
  { key: "python", note: "들여쓰기로 흐름이 보이는 언어. 처음이라면 여기서 시작해요." },
  { key: "javascript", note: "웹에서 쓰는 언어. 중괄호 { } 와 배열 메서드(map·filter), 콜백을 따라가요." },
];
const LANGUAGE_KEY = "codereading.language";

/** 마지막에 고른 언어 (이 탭에서만 기억) */
function savedLanguage(): Language {
  try {
    return sessionStorage.getItem(LANGUAGE_KEY) === "javascript" ? "javascript" : "python";
  } catch {
    return "python";
  }
}

/** 1장 · 언어 + 난이도 + 주제(랜덤 / 직접 적기) → 코드 받기 */
export function PracticeStart() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("python");
  const [level, setLevel] = useState<Level>(1);
  const [tab, setTab] = useState<"random" | "write">("random");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setLanguage(savedLanguage()), []);

  function pickLanguage(next: Language) {
    setLanguage(next);
    try {
      sessionStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      /* 저장하지 못해도 고른 언어로 진행 */
    }
  }

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const codeItem = await apiPost<CodeItem>("/practice", { language, level, topic: tab === "write" ? text.trim() : "" });
      router.push(`/read/?id=${codeItem.codeId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const canSubmit = !busy && (tab === "random" || (text.trim().length > 0 && text.length <= MAX_TOPIC));
  const summary = `${LANGUAGE_NAMES[language]} · ${LEVEL_NAMES[level]} · ${tab === "random" ? "랜덤 주제" : text.trim() || "주제를 적어 주세요"}`;

  return (
    <Page>
      <Crumb>
        <b className="text-pen-red">1장 · 고르기</b> → 2장 · 메모 → 3장 · 채점
      </Crumb>
      <h1 className="mt-2 text-3xl">어떤 코드를 읽어 볼까요?</h1>
      <p className="mt-2 text-sm text-ink-700">AI 가 코드를 만들고, 다른 AI 가 실제로 실행하듯 따라가 보며 동작과 난이도를 확인한 코드만 드려요.</p>

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
      <div className="mt-3 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="난이도">
        {([1, 2, 3] as Level[]).map((lv) => {
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

      <h2 className="mt-8 text-lg">주제</h2>
      <div className="mt-3 flex border-b border-ink-900">
        <button type="button" className={tab === "random" ? "tab-on" : "tab"} onClick={() => setTab("random")}>
          랜덤으로
        </button>
        <button type="button" className={tab === "write" ? "tab-on" : "tab"} onClick={() => setTab("write")}>
          직접 적기
        </button>
      </div>
      {tab === "random" ? (
        <div className="mt-4">
          <p className="text-sm text-ink-700">생활 속 주제 중 하나를 골라 만들어요. 최근에 받은 주제는 빼고 골라요.</p>
          <p className="hand mt-2 text-pen-blue">{EXAMPLES.join(" · ")} …</p>
        </div>
      ) : (
        <div className="mt-4">
          <label className="text-sm text-ink-700" htmlFor="topic">
            읽고 싶은 코드의 주제를 적어 주세요.
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="topic"
              className="field max-w-md"
              value={text}
              maxLength={MAX_TOPIC}
              placeholder="예: 주차 요금 계산"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && make()}
            />
            <span className="text-xs text-ink-400">
              {text.length}/{MAX_TOPIC}
            </span>
          </div>
        </div>
      )}

      {error && <ErrorNote message={error} />}
      {busy && <MakingCode language={language} level={level} />}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink-300 pt-5">
        <span className="hand text-pen-blue">{summary}</span>
        <button type="button" className="btn-ink" onClick={make} disabled={!canSubmit}>
          코드 받기 →
        </button>
      </div>
    </Page>
  );
}

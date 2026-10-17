"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Crumb, ErrorNote, MarkText, Page, PenMark, Stamp, Sticky, Waiting } from "@/components/ui";
import { loginUrl, useApi } from "@/lib/api";
import { type Concept, type ConceptStat, type ExplanationNote, LEVEL_NAMES, type MarkKind, type Me, type StudyOverview } from "@/lib/api-types";

const pct = (r: number) => `${Math.round(r * 100)}%`;
const day = (ms: number) => new Date(ms).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

/**
 * 내 공부: 첨삭 기록으로 (1) 난이도 추천 (2) 개념별 약점 지도 (3) 내 설명 노트 (4) 최근 공부.
 * 모두 서버의 규칙 계산(study.py, AI 없음). 로그인 전에는 이 탭에서만 이어지고, 탭·브라우저를 닫으면 사라져요.
 */
export function StudyNote() {
  const { data, error, reload } = useApi<StudyOverview>("/study");
  const { data: me } = useApi<Me>("/me");

  if (error) return <Page><ErrorNote message={error} onRetry={reload} /></Page>;
  if (!data) return <Page><Waiting text="공부 노트를 펼치는 중이에요…" /></Page>;

  const s = data.summary;
  return (
    <Page>
      <Crumb>내 공부 노트</Crumb>
      <h1 className="mt-2 text-3xl">어떤 흐름을 잘 읽고, 어디서 막히나요?</h1>
      {s.codes === 0 ? (
        <Empty />
      ) : (
        <>
          <p className="hand mt-3 text-2xl text-pen-blue">
            지금까지 코드 {s.codes}개 · 공부한 날 {s.days}일 · 처음 설명에서 <PenMark kind="correct" inline /> {pct(s.correctRate)}
            {s.improved > 0 && <> · 다시 써서 <PenMark kind="correct" inline /> {s.improved}개</>}
          </p>
          <KeepNote me={me} />

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <LevelSection levels={data.levels} />
            <ConceptSection concepts={data.concepts} level={data.levels.suggested} />
          </div>

          <NotesSection notes={data.notes} />
          <RecentSection recent={data.recent} />
        </>
      )}
    </Page>
  );
}

/** 기록이 어디에 얼마나 남는지 */
function KeepNote({ me }: { me: Me | null }) {
  if (me?.member) {
    return <p className="mt-1 text-xs text-ink-500">첨삭을 받을 때마다 기록돼요. {me.name}님 계정에 1년 동안 남아서 다른 기기에서 로그인해도 이어져요.</p>;
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
      첨삭을 받을 때마다 기록돼요. 로그인하지 않으면 이 탭에서만 이어지고, 탭이나 브라우저를 닫으면 사라져요.
      {me?.providers.google && (
        <a href={loginUrl("google")} className="text-pen-blue underline">
          Google로 로그인해서 남기기
        </a>
      )}
      {me?.providers.github && (
        <a href={loginUrl("github")} className="text-pen-blue underline">
          GitHub로 로그인해서 남기기
        </a>
      )}
    </p>
  );
}

function Empty() {
  return (
    <div className="mt-6">
      <Sticky tape className="max-w-xl p-5">
        <p className="hand text-2xl text-pen-red">아직 기록이 없어요</p>
        <p className="mt-2 text-sm text-ink-700">
          코드를 읽고 메모를 붙인 뒤 <b>첨삭 받기</b>를 누르면 여기에 쌓여요. 개념별로 어디서 막히는지, 난이도를 올릴 때인지, 잘 쓴 설명을 모아 보여 드릴게요.
        </p>
        <div className="mt-4 flex gap-3">
          <Link href="/practice" className="btn-ink">
            연습 문제 받기
          </Link>
          <Link href="/check" className="btn-line">
            내 코드 가져오기
          </Link>
        </div>
      </Sticky>
    </div>
  );
}

/** 1. 난이도 추천: 최근 첨삭 5개의 ○ 비율 */
function LevelSection({ levels }: { levels: StudyOverview["levels"] }) {
  const move = levels.suggested !== levels.current;
  return (
    <section>
      <h2 className="text-lg">난이도 추천</h2>
      <Sticky color={levels.advice === "up" ? "mint" : levels.advice === "down" ? "pink" : "yellow"} tape className="mt-4 p-5">
        <p className="flex flex-wrap items-center gap-2">
          <Stamp>{LEVEL_NAMES[levels.current]}</Stamp>
          {move && (
            <>
              <span className="hand text-2xl text-pen-red">→</span>
              <Stamp>{LEVEL_NAMES[levels.suggested]}</Stamp>
            </>
          )}
        </p>
        <p className="hand mt-3 text-pen-red">
          <MarkText text={levels.message} />
        </p>
        <Link href={`/practice?level=${levels.suggested}`} className="btn-ink mt-4">
          {LEVEL_NAMES[levels.suggested]}로 연습하기
        </Link>
      </Sticky>
      <table className="mt-4 w-full text-sm">
        <tbody>
          {levels.byLevel.map((l) => (
            <tr key={l.level} className="border-b border-ink-200">
              <td className="w-14 py-1.5 font-semibold">{l.name}</td>
              <td className="py-1.5">
                <Bar rate={l.codes ? l.correctRate : 0} empty={!l.codes} />
              </td>
              <td className="w-28 py-1.5 text-right text-xs text-ink-500">{l.codes ? <>최근 {l.codes}개 · <PenMark kind="correct" inline /> {pct(l.correctRate)}</> : "기록 없음"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-ink-400">연습 모드에서 같은 난이도 3개 이상 첨삭을 받으면 추천해요. <PenMark kind="correct" inline /> 80% 이상이면 올리고, 40% 미만이면 내려요.</p>
    </section>
  );
}

/** 형광펜 막대 (그라데이션 없이 한 색) */
function Bar({ rate, empty = false }: { rate: number; empty?: boolean }) {
  return (
    <div className="h-3 w-full border border-ink-300 bg-paper" aria-hidden>
      {!empty && <div className={rate < 0.4 ? "h-full bg-pen-red/70" : rate < 0.8 ? "h-full bg-marker-strong" : "h-full bg-sticky-mint"} style={{ width: `${Math.max(rate * 100, 3)}%` }} />}
    </div>
  );
}

/** 2. 개념별 약점 지도 */
function ConceptSection({ concepts, level }: { concepts: StudyOverview["concepts"]; level: number }) {
  const sorted = [...concepts.items].sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || a.correctRate - b.correctRate);
  const weakest = concepts.items.find((c) => c.concept === concepts.weakest);
  return (
    <section>
      <h2 className="text-lg">개념별 약점 지도</h2>
      <p className="mt-1 text-xs text-ink-500">※ 꼭 설명할 곳과 내 메모가 어떤 흐름이었는지, 처음 설명에서 <PenMark kind="correct" inline /> 를 받은 비율이에요.</p>
      {weakest ? (
        <p className="hand mt-3 text-pen-red">
          &lsquo;{weakest.name}&rsquo;에서 가장 많이 막혀요 (<PenMark kind="correct" inline /> {pct(weakest.correctRate)}). 이 흐름이 많이 나오는 코드로 연습해 볼까요?
        </p>
      ) : (
        <p className="hand mt-3 text-pen-blue">한 개념이 두 번 이상 나오면 약한 곳을 짚어 드려요.</p>
      )}
      <ul className="mt-3 divide-y divide-ink-200 border-y border-ink-200">
        {sorted.map((c) => (
          <ConceptRow key={c.concept} c={c} weakest={c.concept === concepts.weakest} level={level} />
        ))}
      </ul>
    </section>
  );
}

function ConceptRow({ c, weakest, level }: { c: ConceptStat; weakest: boolean; level: number }) {
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 ${c.count ? "" : "opacity-50"}`}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`relative font-semibold ${weakest ? "px-1.5" : ""}`}>
            {weakest && <span className="absolute inset-0 -rotate-2 border-2 border-pen-red" style={{ borderRadius: "50%" }} aria-hidden />}
            {c.name}
          </span>
          <span className="text-xs text-ink-500">{c.count ? <>{c.count}번 · <PenMark kind="correct" inline /> {pct(c.correctRate)}</> : "아직 기록이 없어요"}</span>
          {c.improved > 0 && <span className="text-xs text-pen-blue">다시 써서 <PenMark kind="correct" inline /> {c.improved}</span>}
          {c.missing > 0 && <span className="text-xs text-pen-red">비워 둔 곳 {c.missing}</span>}
        </p>
        <p className="text-[11px] text-ink-400">{c.description}</p>
        {c.count > 0 && <div className="mt-1"><Bar rate={c.correctRate} /></div>}
      </div>
      <Link href={`/practice?level=${level}&focus=${c.concept}`} className={weakest ? "btn-ink px-3 py-1.5 text-xs" : "btn-small"}>
        {weakest ? "이 개념 집중 연습" : "집중 연습"}
      </Link>
    </li>
  );
}

/** 3. 내 설명 노트: ○ 를 받은 내 설명, 개념별로 */
function NotesSection({ notes }: { notes: ExplanationNote[] }) {
  const [filter, setFilter] = useState<Concept | "all">("all");
  const tabs = useMemo(() => {
    const seen = new Map<Concept, string>();
    notes.forEach((n) => seen.set(n.concept, n.conceptName));
    return [...seen.entries()];
  }, [notes]);
  const shown = filter === "all" ? notes : notes.filter((n) => n.concept === filter);
  return (
    <section className="mt-12">
      <h2 className="text-lg">내 설명 노트</h2>
      <p className="mt-1 text-xs text-ink-500"><PenMark kind="correct" inline /> 를 받은 내 설명을 모았어요. 비슷한 흐름을 만나면 예전에 내가 어떻게 설명했는지 다시 봐요.</p>
      {notes.length === 0 ? (
        <p className="hand mt-3 text-pen-blue">아직 <PenMark kind="correct" inline /> 를 받은 설명이 없어요. 첨삭 뒤 &lsquo;힌트를 보고 다시 써 보기&rsquo;로 <PenMark kind="correct" inline /> 를 받아도 여기에 모여요.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap border-b border-ink-900">
            <button type="button" className={filter === "all" ? "tab-on" : "tab"} onClick={() => setFilter("all")}>
              전체 {notes.length}
            </button>
            {tabs.map(([key, name]) => (
              <button key={key} type="button" className={filter === key ? "tab-on" : "tab"} onClick={() => setFilter(key)}>
                {name} {notes.filter((n) => n.concept === key).length}
              </button>
            ))}
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((n, i) => (
              <Sticky key={`${n.readingId}-${n.start}-${i}`} tilt={i % 3 === 0 ? -0.5 : i % 3 === 1 ? 0.4 : 0} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="border border-ink-500 bg-paper px-1.5 py-0.5 text-[11px] text-ink-700">{n.conceptName}</span>
                  <span className="flex items-center gap-1 text-[11px] text-pen-red">
                    {n.improved && "다시 써서"} <PenMark kind="correct" size={18} />
                  </span>
                </div>
                <p className="hand mt-2 whitespace-pre-wrap break-words text-pen-blue">{n.text}</p>
                {n.snippet && <Snippet code={n.snippet} start={n.start} />}
                <p className="mt-auto pt-3 text-[11px] text-ink-500">
                  {n.title} · {LEVEL_NAMES[n.level]} · {n.start === n.end ? `${n.start}번 줄` : `${n.start}~${n.end}번 줄`} · {day(n.at)}
                  {n.open && (
                    <Link href={`/result/?id=${n.readingId}`} className="ml-2 text-pen-blue underline">
                      첨삭 다시 보기
                    </Link>
                  )}
                </p>
              </Sticky>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** 노트에 저장된 코드 몇 줄 (원래 줄 번호로) */
function Snippet({ code, start }: { code: string; start: number }) {
  return (
    <pre className="mt-2 max-h-40 overflow-auto border border-ink-300 bg-paper/80 py-1 font-mono text-[11px] leading-5">
      {code.split("\n").map((line, i) => (
        <div key={i} className="grid grid-cols-[2.5rem_1fr]">
          <span className="pr-2 text-right text-ink-400">{start + i}</span>
          <span className="whitespace-pre pr-2">{line}</span>
        </div>
      ))}
    </pre>
  );
}

/** 4. 최근 공부 */
function RecentSection({ recent }: { recent: StudyOverview["recent"] }) {
  const kinds: MarkKind[] = ["correct", "partial", "wrong", "missing"];
  return (
    <section className="mt-12">
      <h2 className="text-lg">최근 공부</h2>
      <ul className="mt-3 divide-y divide-dashed divide-ink-300">
        {recent.map((r) => (
          <li key={r.readingId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
            <span className="w-20 text-xs text-ink-500">{day(r.reviewedAt)}</span>
            <span className={`border px-1.5 py-0.5 text-[11px] ${r.source === "practice" ? "border-ink-500 bg-sticky-yellow" : "border-ink-500 bg-sticky-mint"}`}>
              {r.source === "practice" ? `연습 · ${LEVEL_NAMES[r.level]}` : "내 코드"}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span>
            <span className="flex items-center gap-2 text-xs">
              {kinds.map((k) => (
                <span key={k} className="flex items-center gap-0.5">
                  <PenMark kind={k} size={14} /> {r.counts[k] ?? 0}
                </span>
              ))}
            </span>
            {r.open ? (
              <Link href={`/result/?id=${r.readingId}`} className="btn-small">
                첨삭 보기
              </Link>
            ) : (
              <span className="text-[11px] text-ink-400">원본은 지워졌어요</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

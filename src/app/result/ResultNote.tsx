"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { BackLinks } from "@/app/read/ReadNote";
import { CodeView } from "@/components/CodeView";
import { useWideLayout, WideToggle } from "@/components/WideToggle";
import { Crumb, ErrorNote, LangTag, MarkText, OutputBox, Page, PenMark, Stamp, Sticky, Waiting } from "@/components/ui";
import { useApi } from "@/lib/api";
import { type Language, MARK_NAMES, type MarkKind, type CodeItem, type CodeItemWithReview, type ReviewItem, type ReviewResult } from "@/lib/api-types";
import { circled } from "@/lib/memos";

const ORDER: MarkKind[] = ["correct", "partial", "wrong", "missing"];

/** 3장 · 빨간펜 채점 결과: 총평 · ○△✕⬚ 개수 · 메모별 채점 · 모범 설명과 실행 기록(채점 기준) 보기 */
export function ResultNote() {
  const id = useSearchParams().get("id") ?? "";
  const { data, error, reload } = useApi<CodeItemWithReview>(id ? `/code?codeId=${encodeURIComponent(id)}` : null);

  if (error) return <Page><ErrorNote message={error} onRetry={reload} /><BackLinks /></Page>;
  if (!id || (data && !data.review)) {
    return (
      <Page>
        <p className="hand text-pen-red">아직 채점을 받지 않았어요.</p>
        {id ? (
          <Link href={`/read/?id=${id}`} className="btn-ink mt-4">
            메모하러 가기
          </Link>
        ) : (
          <BackLinks />
        )}
      </Page>
    );
  }
  if (!data) return <Page><Waiting text="채점지를 펼치는 중이에요…" /></Page>;
  return <ResultBody codeItem={data.codeItem} review={data.review!} />;
}

function ResultBody({ codeItem, review }: { codeItem: CodeItem; review: ReviewResult }) {
  /** 왼쪽 전체 코드에서 분홍으로 보여 줄 범위 (채점 항목에 마우스를 올릴 때) */
  const [active, setActive] = useState<{ start: number; end: number } | null>(null);
  const memoItems = review.items.filter((it) => it.kind === "memo");
  const { wide, toggle: toggleWide } = useWideLayout();

  return (
    <Page>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-xl">
          <Crumb>3장 · 빨간펜 채점</Crumb>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl sm:text-3xl">
            {codeItem.title || codeItem.topic}
            <Stamp>{codeItem.levelName}</Stamp>
            <LangTag language={codeItem.language} />
          </h1>
          <p className="hand mt-3 text-2xl text-pen-red">
            <MarkText text={review.summary} />
          </p>
          {!review.byAi && <p className="mt-1 text-xs text-ink-500">지금은 AI 대신 규칙으로 채점했어요. 핵심 표현이 들어 있는지를 봤어요.</p>}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 border border-ink-300 bg-paper px-5 py-3 text-sm" aria-label="채점 개수">
          {ORDER.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <PenMark kind={k} size={22} />
              <span className="w-8 text-ink-700">{MARK_NAMES[k]}</span>
              <b className="text-pen-red">{review.counts[k]}</b>
            </div>
          ))}
        </div>
      </div>

      <div className={`mt-10 grid gap-8 ${wide ? "lg:grid-cols-[minmax(0,3fr)_minmax(400px,2fr)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"}`}>
        {/* 왼쪽: 전체 코드 (내 메모 범위는 형광펜, 고른 채점 범위는 분홍) — 넓은 화면에서는 따라 내려온다 */}
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg">전체 코드</h2>
            <WideToggle wide={wide} onToggle={toggleWide} />
          </div>
          <p className="mb-2 mt-1 text-xs text-ink-500">
            <span className="marker">형광펜</span>은 내 메모, <b className="text-pen-red">※</b> 는 설명할 곳이에요. 오른쪽 채점 항목에 마우스를 올리면 그 범위가 분홍색으로 보여요.
          </p>
          <CodeView
            code={codeItem.code}
            language={codeItem.language}
            stars={review.items.filter((it) => it.marked).map((it) => it.start)}
            highlights={memoItems}
            labels={memoItems.map((_, i) => circled(i + 1))}
            focus={active}
          />
          <OutputBox lines={codeItem.output} hint={false} />
        </aside>

        {/* 오른쪽: 메모별 채점 */}
        <div>
          <h2 className="text-lg">메모별 채점</h2>
          {review.items.length === 0 && <p className="mt-3 text-sm text-ink-500">채점할 메모가 없어요.</p>}
          <div className="mt-2 divide-y divide-dashed divide-ink-300">
            {review.items.map((item, i) => (
              <ItemRow
                key={i}
                item={item}
                code={codeItem.code}
                language={codeItem.language}
                label={item.kind === "memo" ? circled(memoItems.indexOf(item) + 1) : "※"}
                onFocus={() => setActive(item)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-dashed border-ink-300 pt-5">
        <Link href={`/read/?id=${codeItem.codeId}`} className="btn-line">
          같은 코드 다시 읽기
        </Link>
        <Link href="/practice" className="btn-ink">
          새 문제 받기
        </Link>
      </div>
    </Page>
  );
}

function ItemRow({
  item,
  code,
  language,
  label,
  onFocus,
}: {
  item: ReviewItem;
  code: string;
  language: Language;
  label: string;
  onFocus: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="py-6" onMouseEnter={onFocus} onFocus={onFocus} tabIndex={-1}>
      <p className="mb-2 text-xs text-ink-500">
        <span className="mr-1 text-base text-pen-blue">{label}</span>
        {item.start === item.end ? `${item.start}번 줄` : `${item.start}~${item.end}번 줄`}
        {item.marked && <b className="text-pen-red"> · ※ 설명할 곳</b>}
      </p>
      <CodeView code={code} language={language} from={item.start} to={item.end} tint={item.lookAt} />
      <div className="mt-3 flex items-start gap-3">
        {item.kind === "memo" ? (
          <Sticky className="flex-1 p-3" tilt={-0.4}>
            <p className="text-xs text-ink-500">내 메모</p>
            <p className="hand mt-1 whitespace-pre-wrap break-words text-pen-blue">{item.memo}</p>
          </Sticky>
        ) : (
          <div className="flex flex-1 items-center justify-center border border-dashed border-ink-400 p-5 text-sm text-ink-500">이 자리에 메모가 없어요</div>
        )}
        <div className="flex w-12 flex-col items-center">
          <PenMark kind={item.mark} size={36} />
          <span className="hand text-pen-red">{MARK_NAMES[item.mark]}</span>
        </div>
      </div>
      <p className="hand mt-3 text-pen-red">
        <MarkText text={item.comment} />
      </p>
      {item.lookAt.length > 0 && <p className="mt-1 text-xs text-ink-500">다시 볼 줄: {item.lookAt.map((n) => `${n}번`).join(", ")}</p>}
      {(item.model || (item.trace ?? []).length > 0) && (
        <>
          <button type="button" className="mt-2 text-xs text-pen-blue underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "모범 설명 접기" : "모범 설명과 실행 기록 보기"}
          </button>
          {open && (
            <div className="mt-2 border-l-2 border-pen-blue pl-3 text-sm leading-relaxed text-ink-700">
              {item.model && (
                <p>
                  <MarkText text={item.model} />
                </p>
              )}
              {(item.trace ?? []).length > 0 && (
                <>
                  <p className="mt-2 text-xs text-ink-500">실행 기록 (값을 넣어 실행하듯 따라가 본 것 — 채점 기준이에요)</p>
                  <ul className="mt-1 space-y-0.5 font-mono text-xs">
                    {(item.trace ?? []).map((t, k) => (
                      <li key={k}>{t}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

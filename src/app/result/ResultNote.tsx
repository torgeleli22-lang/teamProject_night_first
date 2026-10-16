"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { BackLinks } from "@/app/read/ReadNote";
import { CodeView } from "@/components/CodeView";
import { Crumb, ErrorNote, Page, PenMark, Stamp, Sticky, Waiting } from "@/components/ui";
import { useApi } from "@/lib/api";
import { MARK_NAMES, type MarkKind, type Reading, type ReadingWithReview, type ReviewItem } from "@/lib/api-types";

const ORDER: MarkKind[] = ["correct", "partial", "wrong", "missing"];

/** 04 · 빨간펜 첨삭 결과: 총평 · ○△✕⬚ 개수 · 메모별 첨삭 · 모범 설명 보기 */
export function ResultNote() {
  const id = useSearchParams().get("id") ?? "";
  const { data, error, reload } = useApi<ReadingWithReview>(id ? `/reading?id=${encodeURIComponent(id)}` : null);

  if (error) return <Page><ErrorNote message={error} onRetry={reload} /><BackLinks /></Page>;
  if (!id || (data && !data.review)) {
    return (
      <Page>
        <p className="hand text-pen-red">아직 첨삭을 받지 않았어요.</p>
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
  if (!data) return <Page><Waiting text="첨삭지를 펼치는 중이에요…" /></Page>;
  const { reading, review } = data as { reading: Reading; review: NonNullable<ReadingWithReview["review"]> };

  return (
    <Page>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-xl">
          <Crumb>3장 · 빨간펜 첨삭</Crumb>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl sm:text-3xl">
            {reading.title || reading.topic}
            <Stamp>{reading.levelName}</Stamp>
          </h1>
          <p className="hand mt-3 text-2xl text-pen-red">{review.summary}</p>
          {!review.byAi && <p className="mt-1 text-xs text-ink-500">지금은 AI 대신 규칙으로 첨삭했어요. 핵심 표현이 들어 있는지를 봤어요.</p>}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 border border-ink-300 bg-paper px-5 py-3 text-sm" aria-label="첨삭 개수">
          {ORDER.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <PenMark kind={k} size={22} />
              <span className="w-8 text-ink-700">{MARK_NAMES[k]}</span>
              <b className="text-pen-red">{review.counts[k]}</b>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mt-10 text-lg">메모별 첨삭</h2>
      {review.items.length === 0 && <p className="mt-3 text-sm text-ink-500">첨삭할 메모가 없어요.</p>}
      <div className="mt-2 divide-y divide-dashed divide-ink-300">
        {review.items.map((item, i) => (
          <ItemRow key={i} item={item} code={reading.code} />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-dashed border-ink-300 pt-5">
        <Link href={`/read/?id=${reading.id}`} className="btn-line">
          같은 코드 다시 읽기
        </Link>
        <Link href={reading.source === "inspect" ? "/check" : "/practice"} className="btn-ink">
          {reading.source === "inspect" ? "다른 코드 점검" : "새 문제 받기"}
        </Link>
      </div>
    </Page>
  );
}

function ItemRow({ item, code }: { item: ReviewItem; code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="grid gap-5 py-6 md:grid-cols-[1fr_1fr]">
      <div>
        <p className="mb-2 text-xs text-ink-500">
          {item.start === item.end ? `${item.start}번 줄` : `${item.start}~${item.end}번 줄`}
          {item.marked && <b className="text-pen-red"> · ※ 꼭 설명할 곳</b>}
        </p>
        <CodeView code={code} from={item.start} to={item.end} tint={item.lookAt} />
      </div>
      <div>
        <div className="flex items-start gap-3">
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
        <p className="hand mt-3 text-pen-red">{item.comment}</p>
        {item.lookAt.length > 0 && <p className="mt-1 text-xs text-ink-500">다시 볼 줄: {item.lookAt.map((n) => `${n}번`).join(", ")}</p>}
        {item.model && (
          <>
            <button type="button" className="mt-2 text-xs text-pen-blue underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? "모범 설명 접기" : "모범 설명 보기"}
            </button>
            {open && <p className="mt-2 border-l-2 border-pen-blue pl-3 text-sm leading-relaxed text-ink-700">{item.model}</p>}
          </>
        )}
      </div>
    </section>
  );
}

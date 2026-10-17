"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CodeView, type Range } from "@/components/CodeView";
import { MakingCode } from "@/components/MakingCode";
import { WideCodeButton } from "@/components/WideCode";
import { type Draft, DraftNote, MemoMargin } from "@/components/MemoMargin";
import { Crumb, ErrorNote, LangTag, Page, Stamp, Sticky, Waiting } from "@/components/ui";
import { apiPost, useApi } from "@/lib/api";
import { ADJUST_REASONS, CONCEPT_NAMES, type AdjustReason, type Memo, type Reading, type ReadingWithReview, type ReviewResult } from "@/lib/api-types";
import { circled, loadMemos, overlaps, saveMemos } from "@/lib/memos";

const MAX_MEMOS = 20;
const MAX_MEMO_CHARS = 500;

/** 03 · 메모하며 읽기: 줄을 눌러 형광펜 범위 → 포스트잇 메모 → 첨삭 받기 */
export function ReadNote() {
  const id = useSearchParams().get("id") ?? "";
  const { data, error, reload } = useApi<ReadingWithReview>(id ? `/reading?id=${encodeURIComponent(id)}` : null);

  if (!id) return <Missing />;
  if (error) return <Page><ErrorNote message={error} onRetry={reload} /><BackLinks /></Page>;
  if (!data) return <Page><Waiting text="코드를 펼치는 중이에요…" /></Page>;
  return <Reader key={data.reading.id} reading={data.reading} />;
}

function Reader({ reading }: { reading: Reading }) {
  const router = useRouter();
  const [memos, setMemos] = useState<Memo[]>([]);
  /** 형광펜 고르기: 줄을 누르면 한 줄, 누른 채 끌면 범위 (다른 메모와 겹쳐도 됨) */
  const [selecting, setSelecting] = useState<{ a: number; b: number } | null>(null);
  /** 쓰는 중인 메모 (새 메모 또는 고치는 메모) */
  const [draft, setDraft] = useState<Draft | null>(null);
  /** 마우스를 올린 포스트잇 → 코드에서 그 범위를 분홍으로 */
  const [hover, setHover] = useState<number | null>(null);
  const wide = useWide();
  const [dialog, setDialog] = useState<"easier" | "harder" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = reading.code.split("\n").length;

  useEffect(() => setMemos(loadMemos(reading.id)), [reading.id]);
  const update = (next: Memo[]) => {
    const sorted = [...next].sort((a, b) => a.start - b.start || a.end - b.end);
    setMemos(sorted);
    saveMemos(reading.id, sorted);
  };

  const covered = reading.marks.filter((m) => memos.some((x) => overlaps(x, m))).length;
  const left = reading.marks.length - covered;
  const pending: Range | null = selecting
    ? { start: Math.min(selecting.a, selecting.b), end: Math.max(selecting.a, selecting.b) }
    : draft
      ? { start: draft.start, end: draft.end }
      : null;

  // 형광펜: 누른 줄에서 시작 → 끌면 범위가 늘어남 → 손을 떼면 그 범위로 메모 쓰기 (쓰던 글은 그대로 두고 범위만 바꿈)
  function lineDown(no: number) {
    if (busy) return;
    setSelecting({ a: no, b: no });
  }
  useEffect(() => {
    if (!selecting) return;
    const up = () => {
      const start = Math.min(selecting.a, selecting.b);
      const end = Math.max(selecting.a, selecting.b);
      setDraft((d) => ({ start, end, text: d?.text ?? "", editing: d?.editing ?? null }));
      setSelecting(null);
    };
    window.addEventListener("pointerup", up, { once: true });
    return () => window.removeEventListener("pointerup", up);
  }, [selecting]);

  function attach() {
    if (!draft || !draft.text.trim()) return;
    const old = draft.editing !== null ? memos[draft.editing] : null;
    const anchor = old?.anchor && old.anchor >= draft.start && old.anchor <= draft.end ? old.anchor : draft.start;
    const memo: Memo = { start: draft.start, end: draft.end, text: draft.text.trim().slice(0, MAX_MEMO_CHARS), anchor };
    update(draft.editing !== null ? memos.map((m, i) => (i === draft.editing ? memo : m)) : [...memos, memo]);
    setDraft(null);
  }

  const edit = (i: number) => setDraft({ start: memos[i].start, end: memos[i].end, text: memos[i].text, editing: i });
  const remove = (i: number) => {
    update(memos.filter((_, j) => j !== i));
    setHover(null);
    if (draft?.editing === i) setDraft(null);
  };
  const move = useCallback(
    (i: number, anchor: number) =>
      setMemos((cur) => {
        const next = cur.map((m, j) => (j === i ? { ...m, anchor } : m));
        saveMemos(reading.id, next);
        return next;
      }),
    [reading.id],
  );

  async function submit() {
    setBusy("review");
    setError(null);
    try {
      await apiPost<ReviewResult>("/review", { readingId: reading.id, memos });
      router.push(`/result/?id=${reading.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function adjust(direction: "easier" | "harder", reasons: AdjustReason[]) {
    setDialog(null);
    setBusy(direction);
    setError(null);
    try {
      const next = await apiPost<Reading>("/practice/adjust", { readingId: reading.id, direction, reasons });
      router.push(`/read/?id=${next.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const labels = useMemo(() => memos.map((_, i) => circled(i + 1)), [memos]);
  const practice = reading.source === "practice";

  return (
    <Page>
      <Crumb>
        1장 · {practice ? "주제 고르기" : "코드 가져오기"} → <b className="text-pen-red">2장 · 메모하며 읽기</b> → 3장 · 첨삭
      </Crumb>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-center gap-3 text-2xl sm:text-3xl">
          {reading.title || reading.topic}
          <Stamp>{reading.levelName}</Stamp>
          <LangTag language={reading.language} />
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {practice && (
            <>
              <button type="button" className="btn-small" disabled={!!busy || reading.regenLeft <= 0} onClick={() => setDialog("easier")}>
                ↓ 더 쉽게
              </button>
              <button
                type="button"
                className="btn-small"
                disabled={!!busy || reading.regenLeft <= 0 || reading.level >= 4}
                title={reading.level >= 4 ? "고급이 가장 어려운 단계예요" : undefined}
                onClick={() => setDialog("harder")}
              >
                ↑ 더 어렵게
              </button>
            </>
          )}
          <button type="button" className="btn-ink" disabled={!!busy} onClick={submit}>
            첨삭 받기
          </button>
        </div>
      </div>
      {reading.levelReason && <p className="hand mt-1 text-pen-red">{reading.levelReason}</p>}
      {reading.focus && <p className="hand mt-1 text-pen-red">집중 연습: {CONCEPT_NAMES[reading.focus]} — 이 흐름이 나오는 곳을 특히 꼼꼼히 설명해 봐요.</p>}
      {reading.note && <p className="mt-1 text-xs text-ink-500">{reading.note}</p>}
      {practice && reading.regenLeft <= 0 && <p className="mt-1 text-xs text-ink-500">이 코드에서 다시 만들기를 다 썼어요. 새 코드는 &lsquo;연습 모드&rsquo;에서 받아 주세요.</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border border-dashed border-ink-300 bg-paper px-3 py-2 text-xs text-ink-700">
        <span>
          줄을 누르면 한 줄, <b>누른 채 끌면 범위</b>에 <span className="marker">형광펜</span>을 그어요. 범위는 겹쳐도 돼요. 메모는 그 줄 옆에 붙고, 윗부분을 잡아 범위 안에서 위아래로 옮길 수 있어요.
        </span>
        <span className="flex items-center gap-3">
          <span>
            <b className="text-pen-red">※</b> 꼭 설명할 곳{" "}
            <b>
              {covered} / {reading.marks.length}
            </b>{" "}
            메모함 · 내 메모 {memos.length}장
          </span>
          <WideCodeButton
            title={reading.title || reading.topic}
            code={reading.code}
            language={reading.language}
            stars={reading.marks.map((m) => m.start)}
            highlights={memos}
            labels={labels}
          />
          {memos.length > 0 && (
            <button type="button" className="text-ink-500 underline" onClick={() => window.confirm("붙인 메모를 모두 지울까요?") && (update([]), setDraft(null))}>
              형광펜 지우기
            </button>
          )}
        </span>
      </div>

      {error && <ErrorNote message={error} />}
      {busy === "review" && <Waiting text="빨간펜으로 메모를 첨삭하고 있어요…" />}
      {(busy === "easier" || busy === "harder") && (
        <MakingCode language={reading.language} advanced={busy === "harder" && reading.level === 3} what={busy === "easier" ? "더 쉬운" : "더 어려운"} />
      )}

      <div className="mt-4 grid items-start gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <CodeView
          code={reading.code}
          language={reading.language}
          stars={reading.marks.map((m) => m.start)}
          highlights={memos}
          labels={labels}
          pending={pending}
          focus={hover !== null && memos[hover] ? memos[hover] : null}
          onLineDown={lineDown}
          onLineEnter={(no) => selecting && no !== selecting.b && setSelecting({ ...selecting, b: no })}
          // 키보드(Enter·Space)로 한 줄 고르기. 마우스는 위의 누르기·떼기가 처리한다
          onLineClick={(no) => !selecting && setDraft((d) => ({ start: no, end: no, text: d?.text ?? "", editing: d?.editing ?? null }))}
        />

        {wide ? (
          // 넓은 화면: 포스트잇을 고른 줄 바로 옆에 (스크롤하지 않고 그 자리에서 쓰기)
          <MemoMargin
            lines={total}
            memos={memos}
            labels={labels}
            draft={draft}
            maxChars={MAX_MEMO_CHARS}
            canAdd={memos.length < MAX_MEMOS}
            onDraftChange={(text) => setDraft((d) => d && { ...d, text })}
            onDraftRange={(start, end) => setDraft((d) => d && { ...d, start, end })}
            onSave={attach}
            onCancel={() => setDraft(null)}
            onEdit={edit}
            onDelete={remove}
            onMove={move}
            onHover={setHover}
          />
        ) : (
          // 좁은 화면(휴대폰): 코드 아래에 차례로
          <aside className="space-y-4">
            {draft && (
              <DraftNote
                draft={draft}
                lines={total}
                maxChars={MAX_MEMO_CHARS}
                canAdd={memos.length < MAX_MEMOS}
                onChange={(text) => setDraft((d) => d && { ...d, text })}
                onRange={(start, end) => setDraft((d) => d && { ...d, start, end })}
                onSave={attach}
                onCancel={() => setDraft(null)}
              />
            )}
            {memos.map((m, i) => (
              <Sticky key={`${m.start}-${m.end}-${i}`} tilt={i % 2 ? 0.6 : -0.5} className="p-3">
                <div className="flex items-center justify-between text-xs text-ink-500">
                  <button type="button" onClick={() => edit(i)} className="flex items-center gap-1 hover:underline" title="눌러서 고치기">
                    <span className="text-base text-pen-blue">{labels[i]}</span> {m.start === m.end ? `${m.start}번 줄` : `${m.start}~${m.end}번 줄`}
                  </button>
                  <button type="button" aria-label={`${labels[i]} 메모 떼기`} className="px-1 text-base text-ink-500 hover:text-pen-red" onClick={() => remove(i)}>
                    ×
                  </button>
                </div>
                <p className="hand mt-1 whitespace-pre-wrap break-words text-pen-blue">{m.text}</p>
              </Sticky>
            ))}
          </aside>
        )}
      </div>

      <p className="hand mt-5 text-pen-red">
        {left > 0 ? `※ 꼭 설명할 곳이 ${left}곳 남았어요. 비워도 낼 수는 있어요.` : "※ 표시된 곳을 모두 메모했어요. 첨삭을 받아 볼까요?"}
      </p>

      {dialog && <AdjustDialog direction={dialog} hasMemos={memos.length > 0} left={reading.regenLeft} onCancel={() => setDialog(null)} onConfirm={adjust} />}
    </Page>
  );
}

/** 더 쉽게(이유 고르기) / 더 어렵게 — 메모가 사라진다는 경고 */
function AdjustDialog({
  direction,
  hasMemos,
  left,
  onCancel,
  onConfirm,
}: {
  direction: "easier" | "harder";
  hasMemos: boolean;
  left: number;
  onCancel: () => void;
  onConfirm: (d: "easier" | "harder", reasons: AdjustReason[]) => void;
}) {
  const [reasons, setReasons] = useState<AdjustReason[]>([]);
  const toggle = (r: AdjustReason) => setReasons((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 p-4" role="dialog" aria-modal="true" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
        <Sticky color={hasMemos ? "pink" : "yellow"} tape className="p-5">
          <p className="hand text-2xl text-pen-red">{direction === "easier" ? "더 쉬운 코드로 바꿀까요?" : "더 어려운 코드로 바꿀까요?"}</p>
          {hasMemos && <p className="mt-2 text-sm font-semibold text-pen-red">지금 붙인 메모는 새 코드로 옮겨지지 않고 사라져요.</p>}
          {direction === "easier" && (
            <fieldset className="mt-3 space-y-1.5 text-sm">
              <legend className="mb-1 text-ink-700">어떤 점이 어려웠나요? (고르지 않아도 돼요)</legend>
              {(Object.keys(ADJUST_REASONS) as AdjustReason[]).map((r) => (
                <label key={r} className="flex items-center gap-2">
                  <input type="checkbox" checked={reasons.includes(r)} onChange={() => toggle(r)} className="h-4 w-4 accent-ink-900" />
                  {ADJUST_REASONS[r]}
                </label>
              ))}
            </fieldset>
          )}
          <p className="mt-3 text-xs text-ink-500">같은 코드에서 다시 만들기는 {left}번 남았어요.</p>
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" className="btn-small" onClick={onCancel}>
              그대로 읽을게요
            </button>
            <button type="button" className="btn-ink py-1.5 text-xs" onClick={() => onConfirm(direction, reasons)}>
              {direction === "easier" ? "더 쉽게 받기" : "더 어렵게 받기"}
            </button>
          </div>
        </Sticky>
      </div>
    </div>
  );
}

function Missing() {
  return (
    <Page>
      <p className="hand text-pen-red">읽을 코드가 없어요.</p>
      <BackLinks />
    </Page>
  );
}

export function BackLinks() {
  return (
    <div className="mt-4 flex gap-3">
      <Link href="/practice" className="btn-ink">
        연습 문제 받기
      </Link>
      <Link href="/check" className="btn-line">
        내 코드 가져오기
      </Link>
    </div>
  );
}

/** 넓은 화면(lg, 1024px 이상)인지 — 포스트잇을 코드 옆에 붙일 수 있는지 */
function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const q = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return wide;
}

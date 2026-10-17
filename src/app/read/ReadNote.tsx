"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CodeView, type Range } from "@/components/CodeView";
import { Crumb, ErrorNote, Page, Stamp, Sticky, Waiting } from "@/components/ui";
import { apiPost, useApi } from "@/lib/api";
import { ADJUST_REASONS, type AdjustReason, type Memo, type Reading, type ReadingWithReview, type ReviewResult } from "@/lib/api-types";
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
  /** 형광펜: 첫 줄을 누른 상태(start만) → 끝 줄을 누르면 범위 완성 → 메모 쓰기 */
  const [pick, setPick] = useState<{ start: number; end: number | null } | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [dialog, setDialog] = useState<"easier" | "harder" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMemos(loadMemos(reading.id)), [reading.id]);
  const update = (next: Memo[]) => {
    const sorted = [...next].sort((a, b) => a.start - b.start);
    setMemos(sorted);
    saveMemos(reading.id, sorted);
  };

  const covered = reading.marks.filter((m) => memos.some((x) => overlaps(x, m))).length;
  const left = reading.marks.length - covered;
  const range: Range | null = pick ? { start: Math.min(pick.start, pick.end ?? pick.start), end: Math.max(pick.start, pick.end ?? pick.start) } : null;

  function clickLine(no: number) {
    if (busy) return;
    if (!pick || pick.end !== null) {
      // 새 범위 시작 (메모를 쓰던 중이면 그 범위를 버린다)
      setPick({ start: no, end: null });
      setDraft("");
      setEditing(null);
    } else {
      setPick({ ...pick, end: no });
    }
  }

  function attach() {
    if (!range || !draft.trim()) return;
    const memo = { ...range, text: draft.trim().slice(0, MAX_MEMO_CHARS) };
    update(editing !== null ? memos.map((m, i) => (i === editing ? memo : m)) : [...memos, memo]);
    setPick(null);
    setDraft("");
    setEditing(null);
  }

  function edit(i: number) {
    setPick({ start: memos[i].start, end: memos[i].end });
    setDraft(memos[i].text);
    setEditing(i);
  }

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
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {practice && (
            <>
              <button type="button" className="btn-small" disabled={!!busy || reading.regenLeft <= 0} onClick={() => setDialog("easier")}>
                ↓ 더 쉽게
              </button>
              <button type="button" className="btn-small" disabled={!!busy || reading.regenLeft <= 0} onClick={() => setDialog("harder")}>
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
      {reading.note && <p className="mt-1 text-xs text-ink-500">{reading.note}</p>}
      {practice && reading.regenLeft <= 0 && <p className="mt-1 text-xs text-ink-500">이 코드에서 다시 만들기를 다 썼어요. 새 코드는 &lsquo;연습 모드&rsquo;에서 받아 주세요.</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border border-dashed border-ink-300 bg-paper px-3 py-2 text-xs text-ink-700">
        <span>
          줄을 눌러 <span className="marker">형광펜</span>을 그어요. 첫 줄과 끝 줄을 차례로 누르면 범위가 돼요.
        </span>
        <span>
          <b className="text-pen-red">※</b> 꼭 설명할 곳{" "}
          <b>
            {covered} / {reading.marks.length}
          </b>{" "}
          메모함
        </span>
      </div>

      {error && <ErrorNote message={error} />}
      {busy === "review" && <Waiting text="빨간펜으로 메모를 첨삭하고 있어요…" />}
      {(busy === "easier" || busy === "harder") && <Waiting text={`${busy === "easier" ? "더 쉬운" : "더 어려운"} 코드로 다시 쓰고 있어요…`} />}

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <CodeView
          code={reading.code}
          stars={reading.marks.map((m) => m.start)}
          highlights={memos}
          labels={labels}
          pending={range}
          onLineClick={clickLine}
        />

        <aside>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg">내 메모 {memos.length}장</h2>
            {memos.length > 0 && (
              <button
                type="button"
                className="text-xs text-ink-500 underline"
                onClick={() => window.confirm("붙인 메모를 모두 지울까요?") && (update([]), setPick(null))}
              >
                형광펜 지우기
              </button>
            )}
          </div>

          {pick && (
            <Sticky tape className="mt-5 p-4">
              {pick.end === null ? (
                <p className="text-sm text-ink-700">
                  <b>{pick.start}번 줄</b>부터 시작해요. 끝 줄을 눌러 주세요. (한 줄이면 같은 줄을 한 번 더)
                </p>
              ) : (
                <>
                  <p className="text-xs text-ink-700">
                    <b>
                      {range!.start}~{range!.end}번 줄
                    </b>
                    의 흐름을 적어 주세요
                  </p>
                  <textarea
                    autoFocus
                    className="hand mt-2 h-28 w-full resize-y border-0 bg-transparent text-pen-blue outline-none placeholder:text-ink-400"
                    style={{ backgroundImage: "repeating-linear-gradient(transparent 0 27px, rgba(36,35,31,.12) 27px 28px)", lineHeight: "28px" }}
                    maxLength={MAX_MEMO_CHARS}
                    placeholder="이 부분은 무엇을 받아서, 어디로 흘러가고, 무엇을 돌려주나요?"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                </>
              )}
              <div className="mt-2 flex items-center justify-end gap-3">
                <button type="button" className="text-xs text-ink-700" onClick={() => (setPick(null), setEditing(null), setDraft(""))}>
                  취소
                </button>
                {pick.end !== null && (
                  <button type="button" className="btn-ink py-1.5 text-xs" disabled={!draft.trim() || (editing === null && memos.length >= MAX_MEMOS)} onClick={attach}>
                    {editing !== null ? "메모 고치기" : "메모 붙이기"}
                  </button>
                )}
              </div>
            </Sticky>
          )}

          <div className="mt-5 space-y-4">
            {memos.map((m, i) => (
              <Sticky key={`${m.start}-${m.end}-${i}`} tilt={i % 2 ? 0.6 : -0.5} className="p-3">
                <div className="flex items-center justify-between text-xs text-ink-500">
                  <button type="button" onClick={() => edit(i)} className="flex items-center gap-1 hover:underline" title="눌러서 고치기">
                    <span className="text-base text-pen-blue">{labels[i]}</span> {m.start}~{m.end}번 줄
                  </button>
                  <button type="button" aria-label={`${labels[i]} 메모 떼기`} className="px-1 text-base text-ink-500 hover:text-pen-red" onClick={() => update(memos.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </div>
                <p className="hand mt-1 whitespace-pre-wrap break-words text-pen-blue">{m.text}</p>
              </Sticky>
            ))}
          </div>

          {left > 0 ? (
            <p className="hand mt-5 text-pen-red">
              ※ 꼭 설명할 곳이 {left}곳 남았어요. 비워도 낼 수는 있어요.
            </p>
          ) : (
            <p className="hand mt-5 text-pen-red">※ 표시된 곳을 모두 메모했어요. 첨삭을 받아 볼까요?</p>
          )}
        </aside>
      </div>

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

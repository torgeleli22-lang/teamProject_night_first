"use client";

import Link from "next/link";
import { LoadState, SectionTitle } from "@/components/ui";
import type { RankingView } from "@/lib/api-types";
import { useApi } from "@/lib/api";
import { NicknameEditor } from "./NicknameEditor";

const MEDAL = ["🥇", "🥈", "🥉"];

/** 랭킹: 지금 참여 중인 학습자 사이에서 XP 순위 (하루 요약 테이블만 읽음) */
export function RankingClient() {
  const { data, error, slow, reload } = useApi<RankingView>("/ranking");
  if (!data) return <div className="px-4">{<LoadState error={error} slow={slow} onRetry={reload} />}</div>;
  const { top, total, mine, nickname, ttlHours } = data;
  const inTop = top.some((r) => r.isMe);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-8 sm:pb-16">
      <p className="text-[15px] font-semibold text-brand-600">🏆 랭킹</p>
      <h1 className="mt-1 text-[26px] font-extrabold tracking-tight sm:text-3xl">함께 공부하는 학습자들</h1>
      <p className="mt-1 text-ink-500">
        XP 기준 순위예요. 지금은 로그인이 없어서 <b className="text-ink-700">최근 {ttlHours}시간 안에 공부한 학습자</b>끼리 비교해요.
      </p>

      {/* 내 순위 */}
      <section className="card mt-6 overflow-hidden">
        <div className="glass-hero p-6 text-white">
          {mine ? (
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-sm text-white/75">현재 순위</p>
                <p className="text-4xl font-extrabold">
                  {mine.rank}등 <span className="text-lg font-bold text-white/75">/ {total}명</span>
                </p>
              </div>
              <div>
                <p className="text-sm text-white/75">상위</p>
                <p className="text-4xl font-extrabold">{mine.topPercent}%</p>
              </div>
              <div>
                <p className="text-sm text-white/75">레벨 · XP</p>
                <p className="text-2xl font-extrabold">
                  Lv.{mine.level} · {mine.xp} XP
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-extrabold">아직 순위가 없어요</p>
              <p className="mt-1 text-white/75">문제를 하나 풀면 랭킹에 참여해요.</p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 p-5">
          {mine?.nextXp != null ? (
            <p className="text-[15px] text-ink-700">
              🔼 <b>{mine.nextXp - mine.xp + 1} XP</b> 더 모으면 한 단계 올라가요. 힌트 없이 맞히면 15 XP!
            </p>
          ) : mine ? (
            <p className="text-[15px] text-ink-700">👑 지금 1등이에요!</p>
          ) : (
            <Link href="/learn" className="btn-primary px-5 py-2.5 text-sm">
              첫 문제 풀러 가기
            </Link>
          )}
          <div className="ml-auto">
            <NicknameEditor key={nickname} initial={nickname} />
          </div>
        </div>
      </section>

      {/* 상위 10명 */}
      <section className="card mt-6 p-5">
        <SectionTitle action={<span className="text-xs text-ink-400">참여 {total}명</span>}>상위 10명</SectionTitle>
        {top.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">아직 참여한 학습자가 없어요.</p>
        ) : (
          <ol className="divide-y divide-ink-100/70">
            {top.map((r, i) => (
              <li key={`${r.rank}-${i}`} className={`flex items-center gap-3 px-2 py-3 ${r.isMe ? "-mx-2 rounded-2xl bg-brand-50/80 px-4" : ""}`}>
                <span className="w-8 text-center text-lg font-extrabold text-ink-500">{MEDAL[r.rank - 1] ?? r.rank}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {r.nickname}
                  {r.isMe && <span className="chip ml-2 bg-brand-600 text-white">나</span>}
                </span>
                <span className="hidden text-sm text-ink-400 sm:inline">{r.solved}문제</span>
                <span className="w-12 text-right text-sm font-semibold text-ink-500 sm:w-16">Lv.{r.level}</span>
                <span className="w-20 text-right font-mono font-bold text-brand-700">{r.xp} XP</span>
              </li>
            ))}
            {mine && !inTop && (
              <li className="-mx-2 flex items-center gap-3 rounded-2xl bg-brand-50/80 px-4 py-3">
                <span className="w-8 text-center font-extrabold text-ink-500">{mine.rank}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {nickname}
                  <span className="chip ml-2 bg-brand-600 text-white">나</span>
                </span>
                <span className="w-12 text-right text-sm font-semibold text-ink-500 sm:w-16">Lv.{mine.level}</span>
                <span className="w-20 text-right font-mono font-bold text-brand-700">{mine.xp} XP</span>
              </li>
            )}
          </ol>
        )}
      </section>

      <p className="mt-6 text-center text-xs text-ink-400">랭킹은 꾸준히 공부하는 재미를 위한 거예요. 다른 사람보다 어제의 나보다 한 문제 더!</p>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Crumb, ErrorNote, Page, Sticky, Waiting } from "@/components/ui";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import type { AdminOverview, DayCount, MigrateResult, UsageRow } from "@/lib/api-types";

const TOKEN_KEY = "codereading.admin";
const MODE_LABEL = { live: "실제 AI (Bedrock)", mock: "목업 (비용 없음)", off: "꺼짐 (AI_MODE=off)" };
const DAY_COLUMNS: { key: keyof Omit<DayCount, "day">; label: string }[] = [
  { key: "practices", label: "연습 코드" },
  { key: "adjusts", label: "쉽게·어렵게" },
  { key: "topicChecks", label: "주제 판정" },
  { key: "inspections", label: "내 코드 점검" },
  { key: "reviews", label: "첨삭" },
  { key: "retries", label: "다시 써 보기" },
  { key: "tutorChats", label: "튜터 질문" },
];

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
/** 한국 시간 '10-17 02:56' */
const when = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "-";

/** 작업별 사용량 표: 작업(설명) · 모델 · 호출 · 성공 · 실패 · 토큰 · 추정 비용 · 마지막 호출 · 마지막 실패 이유 */
function UsageTable({ rows }: { rows: UsageRow[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse bg-paper text-sm">
        <thead>
          <tr className="border-b border-ink-900 text-left text-xs text-ink-500">
            <th className="py-2 pr-3 font-medium">작업</th>
            <th className="py-2 pr-3 font-medium">모델</th>
            <th className="py-2 pr-3 text-right font-medium">호출</th>
            <th className="py-2 pr-3 text-right font-medium">성공</th>
            <th className="py-2 pr-3 text-right font-medium">실패</th>
            <th className="py-2 pr-3 text-right font-medium">토큰 (입력/출력)</th>
            <th className="py-2 pr-3 text-right font-medium">추정 비용</th>
            <th className="py-2 font-medium">마지막 호출</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.task + u.model} className="border-b border-ink-200 align-top">
              <td className="py-2 pr-3">
                <b className="font-semibold">{u.taskName}</b>
                <span className="block text-xs text-ink-500">{u.description}</span>
                {u.lastError && (
                  <span className="mt-1 block text-xs text-pen-red">
                    마지막 실패 ({when(u.lastErrorAt)}): {u.lastError}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap py-2 pr-3 text-xs text-ink-700">{u.modelName}</td>
              <td className="py-2 pr-3 text-right">{u.calls.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right">{u.successes.toLocaleString()}</td>
              <td className={`py-2 pr-3 text-right ${u.failures ? "font-semibold text-pen-red" : "text-ink-300"}`}>
                {u.failures}
                {u.failures > 0 && <span className="block text-xs font-normal">{Math.round((100 * u.failures) / u.calls)}%</span>}
              </td>
              <td className="whitespace-nowrap py-2 pr-3 text-right">
                {u.input.toLocaleString()} / {u.output.toLocaleString()}
              </td>
              <td className="py-2 pr-3 text-right">{u.mock ? "목업" : usd(u.costUsd)}</td>
              <td className="whitespace-nowrap py-2 font-mono text-xs">{when(u.lastAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 관리자: AI 사용량 · 비용 · AI 끄기 · 관리자 코드 */
export function AdminNote() {
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [migrated, setMigrated] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(TOKEN_KEY) ?? "";
      setToken(saved);
      setInput(saved);
    } catch {
      /* 저장할 수 없는 환경 */
    }
  }, []);

  const headers = useCallback(() => ({ "x-admin-token": token }), [token]);
  const load = useCallback(() => {
    setError(null);
    apiGet<AdminOverview>("/admin/overview", { headers: headers() })
      .then(setData)
      .catch((e: ApiError) => {
        setData(null);
        setError(e.message);
      });
  }, [headers]);
  useEffect(load, [load]);

  /** 확인을 눌러야 서버로 보낸다 (치는 도중의 값이 틀린 코드로 세어지지 않게) */
  function login(e: React.FormEvent) {
    e.preventDefault();
    try {
      sessionStorage.setItem(TOKEN_KEY, input);
    } catch {
      /* 무시 */
    }
    setToken(input);
  }

  async function switchAi(enabled: boolean) {
    if (!enabled && !window.confirm("AI 를 끌까요? 끄면 예시 코드·규칙 판정·규칙 첨삭으로 바뀌고 비용이 들지 않아요.")) return;
    setBusy(true);
    try {
      await apiPost("/admin/ai", { enabled }, { headers: headers() });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  /** 예전 키 이름 데이터를 새 이름으로 옮기기 (한 번, 다시 눌러도 안전) */
  async function migrate() {
    if (!window.confirm("예전 이름(LEARNER, READ#, STUDY# …)으로 저장된 데이터를 새 이름(USER#, CODE# …)으로 옮길까요? 다시 눌러도 안전해요.")) return;
    setBusy(true);
    setMigrated(null);
    try {
      const r = await apiPost<MigrateResult>("/admin/migrate", {}, { headers: headers() });
      const kinds = Object.entries(r.byKind).map(([k, n]) => `${k} ${n}`).join(", ");
      setMigrated(r.moved === 0 ? "옮길 예전 데이터가 없어요. 모두 새 이름이에요." : `${r.moved}개를 옮겼어요 (${kinds}). 요청 수 제한 기록 ${r.removed}개는 지웠어요.`);
    } catch (err) {
      setMigrated((err as Error).message);
    }
    setBusy(false);
  }

  async function changeCode(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await apiPost("/admin/code", { code: newCode }, { headers: headers() });
      sessionStorage.setItem(TOKEN_KEY, newCode);
      setToken(newCode);
      setInput(newCode);
      setNewCode("");
      setMessage("관리자 코드를 바꿨어요. 다음부터는 새 코드로 들어와요.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  return (
    <Page>
      <Crumb>관리자 노트</Crumb>
      <h1 className="mt-2 text-3xl">AI 사용량과 비용</h1>

      <form onSubmit={login} className="mt-5 flex flex-wrap items-center gap-2">
        <label htmlFor="admin-code" className="text-sm text-ink-700">
          관리자 코드
        </label>
        <input id="admin-code" type="password" className="field max-w-xs" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="current-password" />
        <button type="submit" className="btn-line py-1.5">
          확인
        </button>
      </form>

      {error && <ErrorNote message={error} onRetry={load} />}
      {!data && !error && <Waiting text="불러오는 중이에요…" />}

      {data && (
        <>
          {/* AI 스위치 */}
          <section className="mt-8 grid gap-6 md:grid-cols-2">
            <Sticky color={data.aiSwitch ? "mint" : "pink"} tape className="p-5">
              <p className="text-xs text-ink-500">AI 스위치</p>
              <p className="hand mt-1 text-3xl text-pen-red">{data.aiSwitch ? "AI 켜짐" : "AI 꺼짐"}</p>
              <p className="mt-1 text-sm text-ink-700">
                {data.aiSwitch ? "코드 만들기·주제 판정·첨삭에 AI 를 써요." : "예시 코드·규칙 판정·규칙 첨삭으로 동작해요. 비용이 들지 않아요."}
              </p>
              <button type="button" className={`${data.aiSwitch ? "btn-line" : "btn-ink"} mt-4`} disabled={busy} onClick={() => switchAi(!data.aiSwitch)}>
                {data.aiSwitch ? "AI 끄기" : "AI 켜기"}
              </button>
              <p className="mt-3 text-xs text-ink-500">
                실행 모드: {MODE_LABEL[data.mode]} · 다른 Lambda 실행 환경에는 30초 안에 반영돼요.
              </p>
            </Sticky>

            <div className="border border-ink-300 bg-paper p-5">
              <p className="text-xs text-ink-500">이번 달 추정 비용</p>
              <p className="mt-1 font-serif text-3xl font-bold">
                {usd(data.budget.monthToDateUsd)} <span className="text-base font-normal text-ink-500">/ 예산 {usd(data.budget.monthlyUsd)}</span>
              </p>
              <div className="mt-3 h-3 border border-ink-900 bg-paper" aria-label={`예산의 ${data.budget.percent}%`}>
                <div className={data.budget.percent >= 80 ? "h-full bg-pen-red" : "h-full bg-marker-strong"} style={{ width: `${Math.min(100, data.budget.percent)}%` }} />
              </div>
              <p className="mt-2 text-xs text-ink-500">
                예산의 {data.budget.percent}% · 예산에 닿으면 AI 를 부르지 않고 예시 코드·규칙으로 바뀌어요. (환경 변수 AI_MONTHLY_BUDGET_USD)
              </p>
              <p className="mt-1 break-all text-xs text-ink-400">모델: {data.model}</p>
            </div>
          </section>

          {/* 작업별 사용량 */}
          <section className="mt-10">
            <h2 className="text-lg">이번 달 작업별 AI 사용량</h2>
            <p className="mt-1 text-xs text-ink-500">작업 × 모델마다 한 줄이에요. 실패는 AI 를 불렀지만 답을 쓰지 못한 횟수예요 (그때는 예시 코드·규칙으로 대신해요).</p>
            {data.usage.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">아직 AI 를 부른 적이 없어요.</p>
            ) : (
              <>
                <UsageTable rows={data.usage.filter((u) => u.current)} />
                {data.usage.some((u) => !u.current) && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-ink-700">예전 서비스(문제 풀이)에서 쓴 기록 {data.usage.filter((u) => !u.current).length}줄 — 지금은 부르지 않아요</summary>
                    <UsageTable rows={data.usage.filter((u) => !u.current)} />
                  </details>
                )}
              </>
            )}
          </section>

          {/* 최근 AI 호출 */}
          <section className="mt-10">
            <h2 className="text-lg">최근 AI 호출 기록</h2>
            <p className="mt-1 text-xs text-ink-500">가장 최근 50번 (14일 보관). &lsquo;검사&rsquo;는 AI 는 답했지만 서버 검사(문법·길이·※ 줄)에서 걸려 다시 부른 경우예요.</p>
            {data.recent.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">아직 기록이 없어요. (이 기능을 넣은 뒤부터 쌓여요)</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse bg-paper text-sm">
                  <thead>
                    <tr className="border-b border-ink-900 text-left text-xs text-ink-500">
                      <th className="py-2 pr-3 font-medium">시각</th>
                      <th className="py-2 pr-3 font-medium">작업</th>
                      <th className="py-2 pr-3 font-medium">결과</th>
                      <th className="py-2 pr-3 text-right font-medium">걸린 시간</th>
                      <th className="py-2 pr-3 text-right font-medium">토큰 (입력/출력)</th>
                      <th className="py-2 font-medium">실패 이유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r, i) => (
                      <tr key={i} className="border-b border-ink-200 align-top">
                        <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-xs">{when(r.at)}</td>
                        <td className="whitespace-nowrap py-1.5 pr-3">{r.taskName}</td>
                        <td className={`whitespace-nowrap py-1.5 pr-3 ${r.ok ? "" : "font-semibold text-pen-red"}`}>
                          {r.ok ? "성공" : r.stage === "check" ? "검사 걸림" : "실패"}
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-3 text-right">{r.ms ? `${(r.ms / 1000).toFixed(1)}초` : "-"}</td>
                        <td className="whitespace-nowrap py-1.5 pr-3 text-right">
                          {r.input.toLocaleString()} / {r.output.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-xs text-pen-red">{r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 날짜별 사용 수 */}
          <section className="mt-10">
            <h2 className="text-lg">최근 2주 사용 수</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse bg-paper text-sm">
                <thead>
                  <tr className="border-b border-ink-900 text-left text-xs text-ink-500">
                    <th className="py-2 pr-3 font-medium">날짜</th>
                    {DAY_COLUMNS.map((c) => (
                      <th key={c.key} className="py-2 pr-3 text-right font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => (
                    <tr key={d.day} className="border-b border-ink-200">
                      <td className="py-1.5 pr-3 font-mono text-xs">{d.day}</td>
                      {DAY_COLUMNS.map((c) => (
                        <td key={c.key} className={`py-1.5 pr-3 text-right ${d[c.key] ? "" : "text-ink-300"}`}>
                          {d[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 관리자 코드 */}
          <section className="mt-10">
            <h2 className="text-lg">관리자 코드 바꾸기</h2>
            <p className="mt-1 text-xs text-ink-500">
              {data.adminCode.custom ? "직접 정한 관리자 코드를 쓰고 있어요." : "아직 직접 정한 코드가 없어요."}{" "}
              {data.adminCode.recovery ? "잊어버리면 Lambda 환경 변수 ADMIN_TOKEN(복구 코드)으로 들어올 수 있어요." : ""}
            </p>
            <form onSubmit={changeCode} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="password" className="field max-w-xs" placeholder="8자 이상" value={newCode} onChange={(e) => setNewCode(e.target.value)} autoComplete="new-password" />
              <button type="submit" className="btn-line py-1.5" disabled={newCode.length < 8}>
                바꾸기
              </button>
            </form>
            {message && <p className="hand mt-2 text-pen-red">{message}</p>}
          </section>

          {/* 예전 키 이름 → 새 키 이름 (한 번) */}
          <section className="mt-10">
            <h2 className="text-lg">예전 데이터 옮기기</h2>
            <p className="mt-1 text-xs text-ink-500">
              DynamoDB 키 이름을 정리했어요 (LEARNER → USER#·PROFILE, READ# → CODE#, STUDY# → USER#·STUDYREC#, 운영 데이터 → OPS#). Lambda 를 새 코드로 바꾼 뒤 한 번 눌러
              주세요. 예전 이름으로 남은 학습자·코드·첨삭·로그인을 새 이름으로 옮겨요.
            </p>
            <button type="button" className="btn-line mt-3 py-1.5" onClick={migrate} disabled={busy}>
              예전 데이터 옮기기
            </button>
            {migrated && <p className="hand mt-2 text-pen-red">{migrated}</p>}
          </section>
        </>
      )}
    </Page>
  );
}

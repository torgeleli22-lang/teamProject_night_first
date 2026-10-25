"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Crumb, ErrorNote, Page, Stamp, Sticky, Waiting } from "@/components/ui";
import { apiPost } from "@/lib/api";
import type { InspectLook, InspectStarted } from "@/lib/api-types";
import { checkUpload, maskSecrets, normalizeCode } from "@/lib/secrets";

const MAX_LINES = 300;

/** 05 · 내 코드 점검: 파일 올리기(1개) / 붙여넣기 → 민감 정보 가리기 → 점검할 함수 고르기 → 메모하러 가기 */
export function CheckCode() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [paste, setPaste] = useState("");
  const [filename, setFilename] = useState("");
  const [look, setLook] = useState<InspectLook | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<"look" | "start" | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 1. 화면에서 먼저 확인·가리기 → 2. 가린 코드만 서버로 (함수 목록 · 훑어본 난이도) */
  async function open(raw: string, name: string) {
    setError(null);
    setLook(null);
    const problem = checkUpload(raw, name, MAX_LINES);
    if (problem) return setError(problem);
    const { code, masked } = maskSecrets(normalizeCode(raw));
    setBusy("look");
    try {
      const r = await apiPost<InspectLook>("/inspect", { code, filename: name });
      setFilename(name);
      // 화면에서 가린 줄 + 서버가 한 번 더 찾아 가린 줄
      setLook({ ...r, masked: [...masked, ...r.masked.filter((m) => !masked.some((x) => x.line === m.line && x.kind === m.kind))] });
      setPicked(r.functions.map((f) => f.name));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 200_000) return setError("파일이 너무 커요. 300줄 이하의 .py 파일을 올려 주세요.");
    await open(await file.text(), file.name);
  }

  async function start() {
    if (!look) return;
    setBusy("start");
    setError(null);
    try {
      const r = await apiPost<InspectStarted>("/inspect/start", { code: look.code, filename, functions: picked });
      router.push(`/read/?id=${r.codeId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const lines = look?.code.split("\n") ?? [];
  const toggle = (name: string) => setPicked((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));
  const reset = () => (setLook(null), setError(null), fileInput.current && (fileInput.current.value = ""));

  return (
    <Page>
      <Crumb>
        <b className="text-pen-red">내 코드 점검 · 코드 가져오기</b> → 메모 → 첨삭
      </Crumb>
      <h1 className="mt-2 text-3xl">어떤 코드를 제대로 읽었는지 볼까요?</h1>
      <p className="mt-2 text-sm text-ink-700">AI가 짜 준 코드, 과제 코드, 넘겨받은 코드 무엇이든 괜찮아요. 꼭 짚어야 할 곳을 표시해 드릴게요.</p>

      <h2 className="mt-8 text-lg">코드 가져오기</h2>
      <div className="mt-3 flex border-b border-ink-900">
        <button type="button" className={tab === "file" ? "tab-on" : "tab"} onClick={() => setTab("file")}>
          파일 올리기
        </button>
        <button type="button" className={tab === "paste" ? "tab-on" : "tab"} onClick={() => setTab("paste")}>
          붙여넣기
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-500">지금은 Python(.py)만, {MAX_LINES}줄까지 점검할 수 있어요. JavaScript·Java 는 곧 열려요.</p>

      <input ref={fileInput} type="file" accept=".py,.js,.java,text/x-python" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {look ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-ink-300 bg-paper px-4 py-3">
          <div className="flex items-center gap-3">
            <FileIcon />
            <div>
              <p className="font-mono text-sm font-bold">{filename}</p>
              <p className="text-xs text-ink-500">
                {look.languageName} · {look.lines}줄
              </p>
            </div>
          </div>
          <button type="button" className="btn-small" onClick={() => (reset(), tab === "file" && fileInput.current?.click())}>
            {tab === "file" ? "다른 파일로 바꾸기" : "다시 붙여넣기"}
          </button>
        </div>
      ) : tab === "file" ? (
        <button
          type="button"
          className="mt-4 flex w-full flex-col items-center gap-2 border border-dashed border-ink-500 bg-paper px-4 py-8 text-sm text-ink-700 hover:bg-sticky-yellow/30"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => (e.preventDefault(), onFile(e.dataTransfer.files[0]))}
          disabled={!!busy}
        >
          <FileIcon />
          파일 하나를 골라 주세요 (끌어다 놓아도 돼요)
        </button>
      ) : (
        <div className="mt-4">
          <textarea
            className="field h-56 resize-y font-mono text-[13px] leading-6"
            placeholder="여기에 Python 코드를 붙여 넣어 주세요"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            spellCheck={false}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-ink-500">
            <span>{paste ? `${normalizeCode(paste).split("\n").length}줄` : ""}</span>
            <button type="button" className="btn-line py-1.5 text-xs" disabled={!paste.trim() || !!busy} onClick={() => open(paste, "붙여 넣은 코드.py")}>
              코드 살펴보기
            </button>
          </div>
        </div>
      )}

      {error && <ErrorNote message={error} />}
      {busy === "look" && <Waiting text="코드를 훑어보고 있어요…" />}

      {look && look.masked.length > 0 && (
        <Sticky color="pink" tape tilt={-0.4} className="mt-6 max-w-xl p-5">
          <p className="hand text-2xl text-pen-red">잠깐! 비밀번호처럼 보이는 값을 가렸어요</p>
          <p className="mt-1 text-sm text-ink-700">
            {look.masked.map((m) => `${m.line}번 줄(${m.kind})`).join(", ")}에 민감해 보이는 값이 있어서, 서버로 보내기 전에 가려 두었어요. 흐름을 읽는 데는 영향이 없어요.
          </p>
          <div className="mt-3 space-y-1 bg-paper/80 px-3 py-2 font-mono text-xs">
            {[...new Set(look.masked.map((m) => m.line))].slice(0, 5).map((no) => (
              <p key={no} className="whitespace-pre-wrap break-all">
                <span className="text-ink-400">{no} </span>
                {lines[no - 1]?.trim()}
              </p>
            ))}
          </div>
        </Sticky>
      )}

      {look && (
        <section className="mt-8 grid gap-6 md:grid-cols-[1fr_220px]">
          <div>
            <h2 className="text-lg">어디를 점검할까요?</h2>
            {look.functions.length > 0 ? (
              <>
                <p className="mt-1 text-xs text-ink-500">코드에서 함수 {look.functions.length}개를 찾았어요. 읽어 볼 부분만 골라도 돼요.</p>
                <ul className="mt-3 divide-y divide-ink-200">
                  {look.functions.map((f) => (
                    <li key={f.name + f.start}>
                      <label className="flex cursor-pointer items-center gap-3 py-2">
                        <input type="checkbox" checked={picked.includes(f.name)} onChange={() => toggle(f.name)} className="h-4 w-4 accent-ink-900" />
                        <span className="flex-1 font-mono text-sm">{f.signature}</span>
                        <span className="text-xs text-ink-500">
                          {f.start}~{f.end}번 줄
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-700">함수가 없어서 코드 전체를 점검해요.</p>
            )}
          </div>
          <div className="self-start border border-ink-300 bg-paper p-4">
            <p className="text-xs text-ink-500">훑어본 난이도</p>
            <p className="mt-2">
              <Stamp>{look.levelGuessName} 정도</Stamp>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-500">점검을 시작하면 AI 가 다시 보고 난이도와 꼭 설명할 곳(※)을 정해요.</p>
          </div>
        </section>
      )}

      {busy === "start" && <Waiting text="꼭 설명할 곳을 고르고 있어요…" />}

      {look && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink-300 pt-5">
          <span className="hand text-pen-blue">
            {filename}
            {picked.length > 0 ? ` · ${picked.join(", ")}` : ""}
          </span>
          <button type="button" className="btn-ink" disabled={!!busy || (look.functions.length > 0 && picked.length === 0)} onClick={start}>
            메모하러 가기 →
          </button>
        </div>
      )}
    </Page>
  );
}

function FileIcon() {
  return (
    <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden>
      <path d="M2 1h12l6 6v18H2z M14 1v6h6" fill="none" stroke="#24231f" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

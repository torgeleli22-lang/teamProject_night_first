import { Worker } from "node:worker_threads";

/**
 * 학습용 코드를 격리된 워커 스레드 + vm 컨텍스트에서 실행하고 console.log 출력을 돌려준다.
 * - require/process/fs 등 Node API 는 컨텍스트에 없다.
 * - 동기 코드는 500ms, 워커 전체는 2초 안에 끝나지 않으면 종료한다.
 * - 출력은 브라우저 콘솔 표기([2, 4, 6], ['a', 'b'], {name: 'Kim'})로 맞춘다.
 *
 * AI 가 만든 코드의 실행 결과를 검증하는 용도이며, 범용 샌드박스로 쓰지 않는다.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");

function fmt(value, nested) {
  if (typeof value === "string") return nested ? "'" + value + "'" : value;
  if (Array.isArray(value)) return "[" + value.map((v) => fmt(v, true)).join(", ") + "]";
  if (value && typeof value === "object") {
    if (typeof value.then === "function") return "Promise {<pending>}";
    return "{" + Object.entries(value).map(([k, v]) => k + ": " + fmt(v, true)).join(", ") + "}";
  }
  if (typeof value === "function") return "ƒ " + (value.name || "anonymous") + "()";
  return String(value);
}

const lines = [];
/** 흐름 따라가기: 코드에 끼워 넣은 __trace(...) 가 남기는 기록 (줄 실행 시점의 값) */
const records = [];
const maxRecords = workerData.maxRecords || 0;
const capture = (fn) => {
  try {
    return fmt(fn(), true);
  } catch (e) {
    return "(아직 없음)";
  }
};
let timedOut = false;
const pushError = (e, prefix) => {
  if (e && e.code === "ERR_SCRIPT_EXECUTION_TIMEOUT") { timedOut = true; lines.push("Uncaught Timeout"); return; }
  lines.push(prefix + ((e && e.name) || "Error"));
};
process.on("unhandledRejection", (e) => pushError(e, "Uncaught (in promise) "));

const context = vm.createContext({
  console: { log: (...args) => lines.push(args.map((a) => fmt(a, false)).join(" ")) },
  __trace: (watch, ask, given) => {
    if (records.length < maxRecords) records.push({ watch, ask: ask.map(capture), given: given.map(capture) });
  },
  setTimeout: (fn, ms) => setTimeout(() => { try { fn(); } catch (e) { pushError(e, "Uncaught "); } }, Math.min(Number(ms) || 0, 200)),
});

try {
  vm.runInContext(workerData.code, context, { timeout: 500 });
} catch (e) {
  pushError(e, "Uncaught ");
}
setTimeout(() => parentPort.postMessage({ output: lines.join("\\n"), timedOut, records }), 300);
`;

export interface RunResult {
  output: string;
  timedOut: boolean;
  /** 출력이 Uncaught 로 시작하는 줄을 포함하는지 */
  threw: boolean;
}

/** __trace(watch, ask, given) 한 번의 기록. 값은 콘솔 표기 (문자열은 '따옴표') */
export interface TraceRecord {
  watch: number;
  ask: string[];
  given: string[];
}

export function runJs(code: string): Promise<RunResult> {
  return runJsTraced(code, 0);
}

/** runJs + 코드에 끼워 넣은 __trace 기록 (최대 maxRecords 개) */
export function runJsTraced(code: string, maxRecords: number): Promise<RunResult & { records: TraceRecord[] }> {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { code, maxRecords },
      resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8 },
    });
    const finish = (result: { output: string; timedOut: boolean; records?: TraceRecord[] }) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ ...result, records: result.records ?? [], threw: /(^|\n)Uncaught /.test(result.output) });
    };
    const timer = setTimeout(() => finish({ output: "Uncaught Timeout", timedOut: true }), 2000);
    worker.once("message", finish);
    worker.once("error", () => finish({ output: "Uncaught Error", timedOut: false }));
  });
}

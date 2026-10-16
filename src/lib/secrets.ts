/**
 * 민감 정보 가리기 — 코드를 서버로 보내기 전에 화면에서 먼저 가린다.
 * lambda/api/inspect_code.py 의 SECRET_PATTERNS 와 같게 유지한다 (서버에서도 한 번 더 가림).
 * 값 부분만 ******** 로 바꿔서 코드 모양(줄 수·변수 이름)은 그대로 둔다.
 */
export const MASK = "********";

const PATTERNS: { kind: string; re: RegExp; keyed?: boolean }[] = [
  { kind: "AWS 액세스 키", re: /AKIA[0-9A-Z]{16}/g },
  { kind: "API 키", re: /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g },
  { kind: "GitHub 토큰", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  { kind: "Slack 토큰", re: /\bxox[abpors]-[A-Za-z0-9-]{10,}/g },
  { kind: "Google API 키", re: /\bAIza[0-9A-Za-z_-]{30,}/g },
  { kind: "비밀 값", re: /((?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key)\w*\s*[:=]\s*)(["'])([^"'\n]{4,})\2/gi, keyed: true },
];

export interface MaskResult {
  code: string;
  /** 가린 줄 (1부터) 과 종류 */
  masked: { line: number; kind: string }[];
}

export function maskSecrets(code: string): MaskResult {
  const masked: MaskResult["masked"] = [];
  const lines = code.split("\n").map((line, i) => {
    for (const p of PATTERNS) {
      const next = p.keyed ? line.replace(p.re, (_m, head: string, q: string) => `${head}${q}${MASK}${q}`) : line.replace(p.re, MASK);
      if (next !== line) {
        masked.push({ line: i + 1, kind: p.kind });
        line = next;
      }
    }
    return line;
  });
  return { code: lines.join("\n"), masked };
}

/** 줄 수·언어 확인 (서버와 같은 기준). 문제가 없으면 null */
export function checkUpload(code: string, filename: string, maxLines = 300): string | null {
  const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "py";
  if (ext === "js" || ext === "java") return "지금은 Python(.py) 코드만 점검할 수 있어요. JavaScript·Java 는 곧 열려요.";
  if (ext !== "py") return "Python(.py) 파일만 올릴 수 있어요.";
  const clean = normalizeCode(code);
  if (!clean.trim()) return "코드가 비어 있어요.";
  const lines = clean.split("\n").length;
  if (lines > maxLines) return `코드가 ${lines}줄이에요. ${maxLines}줄까지 점검할 수 있어요. 읽고 싶은 부분만 붙여 넣어 주세요.`;
  return null;
}

/** 서버(read_code)와 같게: 줄바꿈·탭 정리, 앞뒤 빈 줄 빼기 */
export function normalizeCode(code: string): string {
  return code.replace(/\r\n/g, "\n").replace(/\t/g, "    ").replace(/^\n+|\n+$/g, "");
}

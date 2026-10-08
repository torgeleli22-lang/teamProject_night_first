import type { DifficultyFactors, Level } from "../types";

/**
 * 코드에서 난이도 요소를 규칙 기반으로 계산한다 (AI 호출 없음).
 * 시드 콘텐츠의 난이도 결정과 AI 생성 콘텐츠의 난이도 검증에 함께 쓴다.
 */
const SYNTAX_FEATURES: [string, RegExp][] = [
  ["const", /\bconst\b/],
  ["let", /\blet\b/],
  ["if", /\bif\s*\(/],
  ["else", /\belse\b/],
  ["switch", /\bswitch\s*\(/],
  ["for", /\bfor\s*\(/],
  ["while", /\bwhile\s*\(/],
  ["function", /\bfunction\b/],
  ["arrow", /=>/],
  ["return", /\breturn\b/],
  ["array", /\[[^\]]*,/],
  ["object", /\{\s*\w+\s*:/],
  ["template", /`[^`]*\$\{/],
  ["map", /\.map\(/],
  ["filter", /\.filter\(/],
  ["forEach", /\.forEach\(/],
  ["find", /\.find\(/],
  ["reduce", /\.reduce\(/],
  ["push", /\.push\(/],
  ["length", /\.length\b/],
  ["strict-eq", /[!=]==/],
  ["logical", /&&|\|\|/],
  ["modulo", /\s%\s/],
  ["typeof", /\btypeof\b/],
  ["ternary", /\?[^.?][^:]*:/],
  ["increment", /\+\+|--|\+=|-=/],
  ["async", /\basync\b/],
  ["await", /\bawait\b/],
  ["promise", /\bPromise\b|\.then\(/],
  ["timer", /\bsetTimeout\b/],
  ["dom", /\bdocument\./],
  ["event", /addEventListener/],
  ["fetch", /\bfetch\(/],
];

const clamp = (n: number, max = 5) => Math.max(0, Math.min(max, Math.round(n)));

function count(code: string, re: RegExp): number {
  return (code.match(re) ?? []).length;
}

function maxNesting(code: string): number {
  let depth = 0;
  let max = 0;
  for (const ch of code.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "")) {
    if (ch === "{" || ch === "(") max = Math.max(max, ++depth);
    else if (ch === "}" || ch === ")") depth--;
  }
  return max;
}

export function computeFactors(code: string, conceptCount: number): DifficultyFactors {
  const meaningful = code
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !/^[}\])];?,?$/.test(l));
  const body = code.replace(/\/\/.*$/gm, "");

  const branches = count(body, /\bif\s*\(|\bcase\b|\?[^.?][^:\n]*:/g);
  const loops = count(body, /\bfor\s*\(|\bwhile\s*\(/g);
  const logical = count(body, /&&|\|\|/g);
  const callbacks = count(body, /=>|\bfunction\s*\(/g);
  const reassign = count(body, /(?<![=!<>])=(?![=>])/g) - count(body, /\b(const|let|var)\b/g);
  const chains = count(body, /\)\s*\n?\s*\.\w+\(/g);
  const asyncOps = count(body, /\bawait\b|\.then\(|\bsetTimeout\b|addEventListener/g);

  return {
    lines: meaningful.length,
    syntaxCount: SYNTAX_FEATURES.filter(([, re]) => re.test(body)).length,
    conceptCount,
    logic: clamp(branches + loops * 1.5 + logical * 0.5),
    dataFlow: clamp(Math.max(0, reassign) * 0.7 + chains + count(body, /\.(map|filter|reduce|find)\(/g) * 0.8),
    reasoning: clamp(Math.max(0, maxNesting(body) - 2) + asyncOps * 1.2 + loops + callbacks * 0.3),
  };
}

/** 요소들을 합쳐 1~5 단계로 환산 */
export function estimateLevel(f: DifficultyFactors): Level {
  const score =
    f.lines * 0.12 + f.syntaxCount * 0.18 + f.conceptCount * 0.3 + f.logic * 0.35 + f.dataFlow * 0.35 + f.reasoning * 0.45;
  if (score < 1.8) return 1;
  if (score < 2.8) return 2;
  if (score < 3.9) return 3;
  if (score < 5.2) return 4;
  return 5;
}

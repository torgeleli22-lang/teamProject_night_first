/**
 * 아주 작은 Python 문법 색칠 (외부 라이브러리 없이).
 * 한 줄을 조각(글자 + 종류)으로 나눈다. 여러 줄 문자열은 줄마다 따로 보므로 색이 조금 다를 수 있다.
 */
export type TokenKind = "kw" | "str" | "num" | "com" | "fn" | "bi" | "plain";
export interface Token {
  text: string;
  kind: TokenKind;
}

const KEYWORDS = new Set(
  "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None".split(" "),
);
const BUILTINS = new Set("print len range int str float list dict set tuple sum min max sorted enumerate zip input open abs round isinstance type super self".split(" "));

const TOKEN = /(#.*$)|([rRbBfF]{0,2}"(?:[^"\\]|\\.)*"?|[rRbBfF]{0,2}'(?:[^'\\]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|(.)/g;

export function highlightLine(line: string): Token[] {
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    const [text, com, str, num, word] = m;
    let kind: TokenKind = "plain";
    if (com) kind = "com";
    else if (str) kind = "str";
    else if (num) kind = "num";
    else if (word) {
      if (KEYWORDS.has(word)) kind = "kw";
      else if (BUILTINS.has(word)) kind = "bi";
      else if (line.slice(TOKEN.lastIndex).trimStart().startsWith("(")) kind = "fn";
    }
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind === "plain") last.text += text;
    else out.push({ text, kind });
  }
  return out;
}

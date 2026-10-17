/**
 * 아주 작은 Python · JavaScript 문법 색칠 (외부 라이브러리 없이).
 * 한 줄을 조각(글자 + 종류)으로 나눈다. 여러 줄 문자열·주석은 줄마다 따로 보므로 색이 조금 다를 수 있다.
 */
import type { Language } from "@/lib/api-types";

export type TokenKind = "kw" | "str" | "num" | "com" | "fn" | "bi" | "plain";
export interface Token {
  text: string;
  kind: TokenKind;
}

interface Rules {
  keywords: Set<string>;
  builtins: Set<string>;
  /** 주석 | 문자열 | 숫자 | 이름 | 공백 | 그 밖의 한 글자 */
  token: RegExp;
}

const words = (s: string) => new Set(s.split(" "));

const RULES: Record<Language, Rules> = {
  python: {
    keywords: words(
      "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None",
    ),
    builtins: words("print len range int str float list dict set tuple sum min max sorted enumerate zip input open abs round isinstance type super self"),
    token: /(#.*$)|([rRbBfF]{0,2}"(?:[^"\\]|\\.)*"?|[rRbBfF]{0,2}'(?:[^'\\]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|(.)/g,
  },
  javascript: {
    keywords: words(
      "async await break case catch class const continue default delete do else export extends finally for function if import in instanceof let new of return static switch throw try typeof var void while yield true false null undefined",
    ),
    builtins: words("console Math Object Array Map Set JSON Number String Boolean Error Promise parseInt parseFloat isNaN this super"),
    token: /(\/\/.*$|\/\*.*?(?:\*\/|$))|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g,
  },
};

export function highlightLine(line: string, language: Language = "python"): Token[] {
  const { keywords, builtins, token } = RULES[language] ?? RULES.python;
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  token.lastIndex = 0;
  while ((m = token.exec(line))) {
    const [text, com, str, num, word] = m;
    let kind: TokenKind = "plain";
    if (com) kind = "com";
    else if (str) kind = "str";
    else if (num) kind = "num";
    else if (word) {
      if (keywords.has(word)) kind = "kw";
      else if (builtins.has(word)) kind = "bi";
      else if (line.slice(token.lastIndex).trimStart().startsWith("(")) kind = "fn";
    }
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind === "plain") last.text += text;
    else out.push({ text, kind });
  }
  return out;
}

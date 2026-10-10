import type { Concept, ConceptId, Level, Skill, Unit } from "./types";

/** 주제 단원. 난이도(Level 1~5)와는 별개다. */
export const UNITS: Unit[] = [
  {
    id: 1,
    title: "JavaScript 기초",
    emoji: "🌱",
    description: "값을 담고, 종류를 구분하고, 계산하는 법",
    conceptIds: ["variables", "let-const", "data-types", "operators"],
  },
  {
    id: 2,
    title: "프로그램 흐름",
    emoji: "🔀",
    description: "조건에 따라 나누고, 같은 일을 반복하는 법",
    conceptIds: ["if-else", "switch", "for", "while"],
  },
  {
    id: 3,
    title: "데이터",
    emoji: "📦",
    description: "여러 값을 묶어서 다루는 법",
    conceptIds: ["arrays", "objects", "strings"],
  },
  {
    id: 4,
    title: "함수",
    emoji: "🧩",
    description: "코드를 묶어서 이름 붙이고 재사용하는 법",
    conceptIds: ["functions", "params-return", "arrow-functions", "scope"],
  },
  {
    id: 5,
    title: "배열 활용",
    emoji: "🛠️",
    description: "배열 메서드로 데이터를 변환하고 골라내는 법",
    conceptIds: ["map", "filter", "for-each", "find", "reduce"],
  },
  {
    id: 6,
    title: "브라우저",
    emoji: "🖱️",
    description: "웹 페이지의 요소를 찾고, 사용자 행동에 반응하는 법",
    conceptIds: ["dom", "events"],
  },
  {
    id: 7,
    title: "비동기",
    emoji: "⏳",
    description: "기다려야 하는 작업을 다루는 법",
    conceptIds: ["promise", "async-await", "fetch"],
  },
];

export const CONCEPTS: Concept[] = [
  {
    id: "variables",
    name: "변수",
    unitId: 1,
    keyIdea: "변수 = 값에 이름표를 붙여 보관하는 상자",
    summary:
      "변수는 값을 저장해두고 나중에 이름으로 꺼내 쓰는 방법이에요. 같은 이름으로 다시 값을 넣으면 이전 값은 사라지고 새 값이 남아요.",
    example: 'let score = 10;\nscore = score + 5;\nconsole.log(score); // 15',
  },
  {
    id: "let-const",
    name: "let / const",
    unitId: 1,
    keyIdea: "let = 바꿀 수 있는 변수, const = 다시 대입할 수 없는 변수",
    summary:
      "let으로 만든 변수는 나중에 다른 값을 넣을 수 있고, const로 만든 변수는 한 번 정한 값을 다시 대입할 수 없어요. 바뀔 일이 없는 값은 const를 쓰는 게 기본이에요.",
    example: 'const name = "민지";\nlet age = 20;\nage = 21; // OK\n// name = "철수"; // TypeError',
  },
  {
    id: "data-types",
    name: "데이터 타입",
    unitId: 1,
    keyIdea: "값마다 종류(숫자, 문자열, 불리언 …)가 있고, 종류에 따라 동작이 달라요",
    summary:
      "JavaScript의 값은 number, string, boolean, undefined, null, object 같은 타입을 가져요. typeof로 타입을 확인할 수 있고, 같은 + 연산도 타입에 따라 결과가 달라져요.",
    example: 'console.log(typeof 3);     // "number"\nconsole.log(typeof "3");   // "string"\nconsole.log(1 + "2");      // "12"',
  },
  {
    id: "operators",
    name: "연산자",
    unitId: 1,
    keyIdea: "연산자 = 값을 계산하거나 비교하는 기호",
    summary:
      "+, -, *, /, % 는 계산을, ===, !==, >, >= 는 비교를, &&, || 는 조건을 묶을 때 써요. %는 나눈 나머지예요. 비교할 때는 타입까지 같은지 보는 ===를 쓰는 게 안전해요.",
    example: 'console.log(7 % 3);       // 1\nconsole.log(5 === "5");   // false\nconsole.log(true && false); // false',
  },
  {
    id: "if-else",
    name: "if / else",
    unitId: 2,
    keyIdea: "if = 조건이 참일 때만 실행, else = 그 외의 경우",
    summary:
      "if 괄호 안의 조건이 true면 바로 아래 블록을 실행하고, false면 else 블록으로 가요. else if로 조건을 여러 개 이어 붙일 수 있고, 위에서부터 처음 참인 블록 하나만 실행돼요.",
    example: 'const age = 17;\nif (age >= 20) {\n  console.log("성인");\n} else {\n  console.log("미성년자");\n}',
  },
  {
    id: "switch",
    name: "switch",
    unitId: 2,
    keyIdea: "switch = 값에 따라 여러 갈래 중 하나로 이동",
    summary:
      "switch는 값과 일치하는 case로 이동해서 실행해요. break를 만나면 switch를 빠져나가고, break가 없으면 아래 case까지 계속 실행돼요(fall-through).",
    example: 'const day = "토";\nswitch (day) {\n  case "토":\n  case "일":\n    console.log("주말");\n    break;\n  default:\n    console.log("평일");\n}',
  },
  {
    id: "for",
    name: "for 반복문",
    unitId: 2,
    keyIdea: "for = 시작값 → 조건 확인 → 실행 → 증가 를 반복",
    summary:
      "for (시작; 조건; 증감) 형태로, 조건이 참인 동안 블록을 반복해요. 반복이 몇 번 도는지는 시작값과 조건을 보고 세어볼 수 있어요.",
    example: "for (let i = 0; i < 3; i++) {\n  console.log(i);\n}\n// 0, 1, 2",
  },
  {
    id: "while",
    name: "while 반복문",
    unitId: 2,
    keyIdea: "while = 조건이 참인 동안 계속 반복",
    summary:
      "while은 조건이 참인 동안 블록을 반복해요. 블록 안에서 조건을 바꾸지 않으면 영원히 반복되니 주의해야 해요.",
    example: "let n = 3;\nwhile (n > 0) {\n  console.log(n);\n  n--;\n}",
  },
  {
    id: "arrays",
    name: "배열",
    unitId: 3,
    keyIdea: "배열 = 순서가 있는 값의 목록, 번호(인덱스)는 0부터",
    summary:
      "배열은 여러 값을 순서대로 담아요. 첫 번째 값의 인덱스는 0이고, length로 개수를 알 수 있어요. push는 끝에 값을 추가해요.",
    example: 'const fruits = ["사과", "바나나"];\nfruits.push("귤");\nconsole.log(fruits[0], fruits.length); // 사과 3',
  },
  {
    id: "objects",
    name: "객체",
    unitId: 3,
    keyIdea: "객체 = 이름(key)과 값(value)의 묶음",
    summary:
      "객체는 { 이름: 값 } 형태로 관련된 정보를 묶어요. 점(.)이나 대괄호([])로 값을 꺼내고, 없는 key를 꺼내면 undefined가 나와요.",
    example: 'const user = { name: "민지", age: 20 };\nconsole.log(user.name);   // 민지\nconsole.log(user.email);  // undefined',
  },
  {
    id: "strings",
    name: "문자열",
    unitId: 3,
    keyIdea: "문자열 = 글자들의 나열, 배열처럼 인덱스와 length가 있어요",
    summary:
      "문자열도 0부터 시작하는 인덱스로 글자를 꺼낼 수 있어요. toUpperCase, slice, includes 같은 메서드는 원본을 바꾸지 않고 새 문자열(또는 결과)을 돌려줘요. 백틱(`)과 ${}로 값을 끼워 넣을 수 있어요.",
    example: 'const word = "hello";\nconsole.log(word[1]);           // e\nconsole.log(`${word}!`);       // hello!',
  },
  {
    id: "functions",
    name: "함수 선언",
    unitId: 4,
    keyIdea: "함수 = 이름 붙인 코드 묶음, 호출해야 실행돼요",
    summary:
      "function 키워드로 함수를 만들면 그 안의 코드는 바로 실행되지 않고, 함수이름() 으로 호출할 때 실행돼요. 여러 번 호출하면 여러 번 실행돼요.",
    example: 'function greet() {\n  console.log("안녕!");\n}\ngreet();\ngreet();',
  },
  {
    id: "params-return",
    name: "매개변수와 반환값",
    unitId: 4,
    keyIdea: "매개변수 = 함수에 넣는 값, return = 함수가 돌려주는 값",
    summary:
      "함수를 호출할 때 넣은 값이 매개변수에 들어가요. return을 만나면 함수는 그 값을 돌려주고 즉시 끝나요. return이 없으면 undefined를 돌려줘요.",
    example: "function add(a, b) {\n  return a + b;\n}\nconsole.log(add(2, 3)); // 5",
  },
  {
    id: "arrow-functions",
    name: "화살표 함수",
    unitId: 4,
    keyIdea: "(x) => x * 2 는 'x를 받아 x * 2를 돌려주는 함수'",
    summary:
      "화살표 함수는 함수를 짧게 쓰는 방법이에요. 중괄호 없이 => 뒤에 식만 쓰면 그 식의 결과가 자동으로 반환돼요. 중괄호를 쓰면 return을 직접 써야 해요.",
    example: "const double = (n) => n * 2;\nconsole.log(double(4)); // 8",
  },
  {
    id: "scope",
    name: "스코프",
    unitId: 4,
    keyIdea: "스코프 = 변수를 사용할 수 있는 범위, 블록 { } 안의 let/const는 밖에서 못 써요",
    summary:
      "let과 const로 만든 변수는 자신이 선언된 블록 { } 안에서만 사용할 수 있어요. 안쪽에서 같은 이름을 새로 선언하면 바깥 변수와는 별개의 변수가 돼요.",
    example: 'let x = "바깥";\n{\n  let x = "안쪽";\n  console.log(x); // 안쪽\n}\nconsole.log(x);   // 바깥',
  },
  {
    id: "map",
    name: "map",
    unitId: 5,
    keyIdea: "map = 배열의 각 요소를 변환해서 같은 길이의 새 배열을 만듦",
    summary:
      "map은 배열의 요소를 하나씩 콜백 함수에 넣고, 콜백이 돌려준 값들로 새 배열을 만들어요. 결과 배열의 길이는 항상 원래 배열과 같아요. 원본 배열은 바뀌지 않아요.",
    example: "const nums = [1, 2, 3];\nconsole.log(nums.map(n => n * 10)); // [10, 20, 30]",
  },
  {
    id: "filter",
    name: "filter",
    unitId: 5,
    keyIdea: "filter = 조건을 통과한 요소만 골라 새 배열을 만듦",
    summary:
      "filter는 각 요소에 대해 콜백이 true를 돌려준 요소만 남긴 새 배열을 만들어요. 값을 바꾸지는 않고 '고르기'만 해요. 그래서 결과가 원래보다 짧아질 수 있어요.",
    example: "const nums = [1, 2, 3, 4];\nconsole.log(nums.filter(n => n % 2 === 0)); // [2, 4]",
  },
  {
    id: "for-each",
    name: "forEach",
    unitId: 5,
    keyIdea: "forEach = 각 요소마다 함수를 실행만 함 (반환값은 undefined)",
    summary:
      "forEach는 배열의 요소마다 콜백을 실행해요. map과 달리 새 배열을 만들지 않고, 항상 undefined를 돌려줘요. 출력이나 누적처럼 '각각에 대해 무언가 하기'에 써요.",
    example: 'const names = ["a", "b"];\nnames.forEach(n => console.log(n));',
  },
  {
    id: "find",
    name: "find",
    unitId: 5,
    keyIdea: "find = 조건에 맞는 첫 번째 요소 하나를 돌려줌 (없으면 undefined)",
    summary:
      "find는 콜백이 처음으로 true를 돌려준 요소 하나를 돌려줘요. 배열이 아니라 요소 자체가 나오고, 조건에 맞는 요소가 없으면 undefined가 나와요.",
    example: "const nums = [5, 12, 8, 130];\nconsole.log(nums.find(n => n > 10)); // 12",
  },
  {
    id: "reduce",
    name: "reduce",
    unitId: 5,
    keyIdea: "reduce = 요소들을 하나씩 누적해서 값 하나로 합침",
    summary:
      "reduce((누적값, 현재값) => 새누적값, 시작값) 형태로, 배열을 처음부터 끝까지 돌며 누적값을 갱신해요. 합계, 최댓값, 개수 세기 등에 써요.",
    example: "const nums = [1, 2, 3];\nconsole.log(nums.reduce((sum, n) => sum + n, 0)); // 6",
  },
  {
    id: "dom",
    name: "DOM",
    unitId: 6,
    keyIdea: "DOM = 자바스크립트가 HTML 요소를 찾고 바꿀 수 있게 해주는 구조",
    summary:
      "document.querySelector로 HTML 요소를 찾고, textContent나 classList 같은 속성으로 내용과 모양을 바꿀 수 있어요. 찾는 요소가 없으면 null이 돌아와요.",
    example: '// <h1 id="title">안녕</h1>\nconst title = document.querySelector("#title");\ntitle.textContent = "반가워요";',
  },
  {
    id: "events",
    name: "이벤트",
    unitId: 6,
    keyIdea: "이벤트 핸들러 = '이 일이 일어나면 이 함수를 실행해줘' 라는 약속",
    summary:
      "addEventListener('click', 함수)로 등록한 함수는 등록할 때가 아니라 사용자가 실제로 클릭할 때마다 실행돼요. 함수를 넘겨야지, 함수를 호출한 결과를 넘기면 안 돼요.",
    example: 'button.addEventListener("click", () => {\n  console.log("클릭!");\n});',
  },
  {
    id: "promise",
    name: "Promise",
    unitId: 7,
    keyIdea: "Promise = 나중에 완료될 작업의 결과를 담는 약속 상자",
    summary:
      "Promise는 시간이 걸리는 작업의 결과를 나타내요. then에 넘긴 함수는 지금 바로가 아니라 작업이 끝난 뒤, 그리고 현재 실행 중인 코드가 모두 끝난 뒤에 실행돼요.",
    example: 'Promise.resolve(1).then(v => console.log(v));\nconsole.log("먼저");\n// 먼저 → 1',
  },
  {
    id: "async-await",
    name: "async / await",
    unitId: 7,
    keyIdea: "await = Promise가 끝날 때까지 이 함수 안에서만 기다림",
    summary:
      "async 함수 안에서 await를 만나면 그 함수는 잠시 멈추고, 함수 바깥의 코드는 계속 실행돼요. Promise가 완료되면 멈춘 자리부터 이어서 실행돼요. async 함수는 항상 Promise를 돌려줘요.",
    example: 'async function run() {\n  const v = await Promise.resolve(42);\n  console.log(v);\n}\nrun();',
  },
  {
    id: "fetch",
    name: "fetch",
    unitId: 7,
    keyIdea: "fetch = 서버에 요청을 보내고 응답을 Promise로 받음",
    summary:
      "fetch(주소)는 바로 데이터를 주지 않고 Promise를 돌려줘요. 응답을 받은 뒤 response.json()으로 본문을 꺼내는데, 이것도 Promise라서 한 번 더 기다려야 해요.",
    example: 'const res = await fetch("/api/user");\nconst data = await res.json();\nconsole.log(data.name);',
  },
];

const conceptMap = new Map(CONCEPTS.map((c) => [c.id, c]));

export function getConcept(id: ConceptId): Concept | undefined {
  return conceptMap.get(id);
}

export function getUnit(id: number): Unit | undefined {
  return UNITS.find((u) => u.id === id);
}

export interface LevelInfo {
  level: Level;
  name: string;
  emoji: string;
  description: string;
  /** 이 난이도에서 주로 요구하는 능력 */
  skill: Skill;
  skillLabel: string;
}

export const LEVELS: LevelInfo[] = [
  { level: 1, name: "입문", emoji: "🌱", description: "변수, 숫자, 문자열 등 아주 기본적인 코드", skill: "recall", skillLabel: "기억하고 확인하기" },
  { level: 2, name: "기초", emoji: "🌿", description: "조건문, 반복문, 간단한 배열과 함수", skill: "predict", skillLabel: "읽고 예측하기" },
  { level: 3, name: "초급", emoji: "🌳", description: "배열·객체·함수·map·filter 를 조합한 코드", skill: "analyze", skillLabel: "분석하기" },
  { level: 4, name: "중급", emoji: "🔥", description: "여러 함수, 실행 흐름, 콜백, DOM, Promise", skill: "infer", skillLabel: "추론하기" },
  { level: 5, name: "심화", emoji: "🚀", description: "실제 개발 코드에 가까운 복합적인 로직", skill: "synthesize", skillLabel: "종합하기" },
];

export function levelInfo(level: number): LevelInfo {
  return LEVELS[Math.min(Math.max(Math.round(level), 1), 5) - 1];
}

export const SKILL_LABEL: Record<Skill, string> = {
  recall: "확인하기",
  predict: "예측하기",
  analyze: "분석하기",
  infer: "추론하기",
  synthesize: "종합하기",
};

export function conceptName(id: ConceptId): string {
  return conceptMap.get(id)?.name ?? id;
}

export const QUESTION_TYPE_LABEL: Record<import("./types").QuestionType, string> = {
  multiple_choice: "객관식",
  fill_blank: "빈칸 채우기",
  shuffle: "코드 셔플",
  predict_output: "실행 결과 예측",
  find_bug: "오류 찾기",
  short_answer: "주관식",
};

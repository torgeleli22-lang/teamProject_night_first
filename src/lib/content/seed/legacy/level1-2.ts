import type { LegacyProblem as Problem } from "../legacy-types";

export const LEVEL_1_2: Problem[] = [
  // ───────── Level 1 · 변수 ─────────
  {
    id: "var-reassign",
    type: "choice",
    subtype: "predict",
    conceptIds: ["variables"],
    difficulty: 1,
    prompt: "이 코드를 실행하면 무엇이 출력될까요?",
    code: `let count = 1;
count = count + 2;
count = count * 3;
console.log(count);`,
    choices: [
      { text: "3", misconception: "마지막 줄만 보고 앞의 계산을 놓침" },
      { text: "9" },
      { text: "1", misconception: "변수 값이 처음 값으로 고정된다고 생각" },
      { text: "7", misconception: "계산을 한 줄씩 순서대로 따라가지 않음" },
    ],
    answerIndex: 1,
    output: "9",
    hints: [
      "count의 값은 몇 번 바뀌나요? 줄마다 count에 무엇이 들어가는지 생각해 볼까요?",
      "2번째 줄과 3번째 줄은 '지금 count 값'을 가지고 새 값을 계산해서 다시 count에 넣어요.",
      "`count = count + 2` 는 '오른쪽을 먼저 계산하고, 그 결과를 왼쪽 변수에 넣는다'는 뜻이에요.",
      "1 → 1 + 2 → (그 결과) × 3 순서로 값이 바뀌어요.",
    ],
    explanation: `처음 count는 1이에요.
count = count + 2 → 1 + 2 = 3이 count에 들어가요.
count = count * 3 → 3 × 3 = 9가 count에 들어가요.
그래서 9가 출력돼요.`,
    keyPoint: "대입(=)은 오른쪽을 먼저 계산한 뒤 왼쪽 변수에 넣어요",
  },
  {
    id: "var-copy",
    type: "predict",
    conceptIds: ["variables"],
    difficulty: 2,
    prompt: "이 코드의 실행 결과를 직접 입력해 보세요.",
    code: `let a = 5;
let b = a;
a = 10;
console.log(a, b);`,
    output: "10 5",
    hints: [
      "`let b = a;` 가 실행되는 순간, a에는 어떤 값이 들어 있나요?",
      "b는 'a라는 이름'이 아니라 그 순간 a에 들어 있던 '값'을 받아요.",
      "숫자 같은 기본 값은 대입할 때 복사돼요. 나중에 a를 바꿔도 b는 따라 바뀌지 않아요.",
      "b는 5를 복사해 둔 상태이고, a만 10으로 바뀌었어요.",
    ],
    explanation: `let b = a; 를 실행할 때 a는 5이므로 b에 5가 복사돼요.
그 다음 a = 10; 으로 a만 10이 돼요. b는 그대로 5예요.
console.log(a, b) 는 두 값을 공백으로 이어서 "10 5"를 출력해요.`,
    keyPoint: "숫자를 다른 변수에 대입하면 값이 복사돼요",
  },
  // ───────── Level 1 · let / const ─────────
  {
    id: "const-reassign",
    type: "choice",
    subtype: "predict",
    conceptIds: ["let-const"],
    difficulty: 1,
    prompt: "이 코드를 실행하면 어떻게 될까요?",
    code: `const PI = 3.14;
PI = 3.14159;
console.log(PI);`,
    choices: [
      { text: "3.14", misconception: "const 재대입이 조용히 무시된다고 생각" },
      { text: "3.14159", misconception: "const도 let처럼 값을 바꿀 수 있다고 생각" },
      { text: "TypeError 발생" },
      { text: "undefined" },
    ],
    answerIndex: 2,
    output: "Uncaught TypeError",
    hints: [
      "const로 만든 변수는 let으로 만든 변수와 무엇이 다를까요?",
      "2번째 줄은 PI에 새 값을 '다시 대입'하려고 해요.",
      "const는 한 번 값을 정하면 다시 대입할 수 없어요. 시도하면 에러가 나요.",
      "2번째 줄에서 에러가 나서 3번째 줄은 실행되지 않아요.",
    ],
    explanation: `const PI = 3.14; 로 PI를 '다시 대입할 수 없는 변수'로 만들었어요.
PI = 3.14159; 에서 재대입을 시도하는 순간 TypeError가 발생해요.
에러가 나면 프로그램이 멈추기 때문에 console.log는 실행되지 않아요.`,
    keyPoint: "const = 다시 대입할 수 없는 변수",
  },
  {
    id: "const-bug",
    type: "bug",
    conceptIds: ["let-const"],
    difficulty: 1,
    prompt: "점수에 보너스 10점을 더해서 출력하려고 했는데 에러가 났어요. 어느 줄이 문제일까요?",
    code: `const score = 80;
console.log("현재 점수:", score);
score = score + 10;
console.log("보너스 후:", score);`,
    bugLine: 1,
    fixedLine: "let score = 80;",
    output: "현재 점수: 80\n보너스 후: 90",
    hints: [
      "에러는 어떤 줄을 실행할 때 날까요? 그 줄은 무엇을 하려고 하나요?",
      "3번째 줄은 score에 새 값을 대입해요. 그런데 score는 어떻게 만들어졌나요?",
      "const로 만든 변수에는 다시 대입할 수 없어요. 값이 바뀌어야 하는 변수는 let으로 만들어요.",
      "에러는 3번째 줄에서 나지만, 고쳐야 할 곳은 변수를 '선언한' 줄이에요.",
    ],
    explanation: `score는 나중에 값이 바뀌어야 하는 변수예요.
그런데 1번째 줄에서 const로 선언해서, 3번째 줄의 재대입에서 TypeError가 나요.
1번째 줄을 let score = 80; 으로 바꾸면 "보너스 후: 90"까지 잘 출력돼요.`,
    keyPoint: "값이 바뀔 변수는 let, 바뀌지 않을 변수는 const",
  },
  // ───────── Level 1 · 데이터 타입 ─────────
  {
    id: "types-plus",
    type: "choice",
    subtype: "predict",
    conceptIds: ["data-types", "operators"],
    difficulty: 1,
    prompt: "두 줄의 출력 결과로 알맞은 것은?",
    code: `console.log(1 + "2");
console.log(1 + 2);`,
    choices: [
      { text: "3\n3", misconception: "문자열 \"2\"도 숫자처럼 더해진다고 생각" },
      { text: "12\n3" },
      { text: "12\n12" },
      { text: "3\n12" },
    ],
    answerIndex: 1,
    output: "12\n3",
    hints: [
      '"2"와 2는 같은 값일까요? 따옴표가 있고 없고의 차이를 떠올려 보세요.',
      '첫 줄은 숫자와 문자열을 더하고, 둘째 줄은 숫자와 숫자를 더해요.',
      "+ 의 한쪽이 문자열이면, 다른 쪽도 문자열로 바꿔서 이어 붙여요.",
      '1 + "2" → "1" + "2" 로 이어 붙여요.',
    ],
    explanation: `"2"는 따옴표로 감싼 문자열이에요.
1 + "2" 처럼 한쪽이 문자열이면 +는 덧셈이 아니라 '이어 붙이기'가 돼서 "12"가 돼요.
1 + 2 는 둘 다 숫자라서 3이에요.`,
    keyPoint: "+ 의 한쪽이 문자열이면 이어 붙이기가 돼요",
  },
  {
    id: "types-typeof",
    type: "predict",
    conceptIds: ["data-types"],
    difficulty: 1,
    prompt: "세 줄의 출력 결과를 순서대로 입력해 보세요. (한 줄에 하나씩)",
    code: `console.log(typeof 42);
console.log(typeof "42");
console.log(typeof true);`,
    output: "number\nstring\nboolean",
    hints: [
      "typeof는 값의 '종류'를 알려줘요. 각 값은 어떤 종류일까요?",
      '42와 "42"는 따옴표 하나 차이지만 종류가 달라요.',
      "숫자는 number, 따옴표로 감싼 글자는 string, true/false는 boolean이에요.",
      "결과는 number, string, 그리고 true의 타입 순서예요.",
    ],
    explanation: `typeof 42 → 숫자이므로 number
typeof "42" → 따옴표로 감싼 문자열이므로 string
typeof true → 참/거짓 값이므로 boolean`,
    keyPoint: "typeof = 값의 종류를 문자열로 알려줌",
  },
  // ───────── Level 1 · 연산자 ─────────
  {
    id: "ops-mod-strict",
    type: "choice",
    subtype: "predict",
    conceptIds: ["operators"],
    difficulty: 1,
    prompt: "두 줄의 출력 결과로 알맞은 것은?",
    code: `console.log(10 % 3);
console.log(5 === "5");`,
    choices: [
      { text: "1\nfalse" },
      { text: "3\ntrue", misconception: "%를 몫으로, ===를 값만 비교한다고 생각" },
      { text: "1\ntrue", misconception: "===가 타입은 비교하지 않는다고 생각" },
      { text: "3.33\nfalse", misconception: "%를 나눗셈으로 생각" },
    ],
    answerIndex: 0,
    output: "1\nfalse",
    hints: [
      "%는 나눗셈과 어떻게 다를까요? 10을 3으로 나누면 몫과 나머지가 각각 얼마인가요?",
      '두 번째 줄은 숫자 5와 문자열 "5"를 === 로 비교해요.',
      "% 는 나머지를 구하고, === 는 값과 타입이 모두 같아야 true예요.",
      "10 = 3 × 3 + 1 이고, 5와 \"5\"는 타입이 달라요.",
    ],
    explanation: `10 % 3 은 10을 3으로 나눈 나머지라서 1이에요.
5 === "5" 는 값처럼 보여도 하나는 number, 하나는 string이라 타입이 달라서 false예요.`,
    keyPoint: "% = 나머지, === = 값과 타입이 모두 같은지 비교",
  },
  {
    id: "ops-and-explain",
    type: "explain",
    conceptIds: ["operators", "data-types"],
    difficulty: 2,
    prompt: "이 코드는 true를 출력해요. 왜 true가 나오는지 자신의 말로 설명해 주세요.",
    code: `const age = 20;
const hasTicket = true;
console.log(age >= 19 && hasTicket);`,
    output: "true",
    rubric: [
      { label: ">= 비교", keywords: [">=", "이상", "크거나 같", "19보다"] },
      { label: "&& 연산자", keywords: ["&&", "둘 다", "모두", "그리고", "and", "AND"] },
      { label: "hasTicket 값", keywords: ["hasTicket", "티켓", "true"] },
    ],
    modelAnswer:
      "age >= 19 는 20이 19 이상이므로 true예요. hasTicket도 true예요. && 는 양쪽이 모두 true일 때만 true이므로 결과는 true예요.",
    hints: [
      "이 식은 && 를 기준으로 두 부분으로 나눌 수 있어요. 각각은 무엇일까요?",
      "왼쪽 age >= 19 와 오른쪽 hasTicket 이 각각 true인지 false인지 따져보세요.",
      "&& 는 양쪽이 '모두' 참일 때만 참이에요.",
      "20 >= 19 는 참이고, hasTicket 도 참이에요. 이 두 사실을 이어서 설명해 보세요.",
    ],
    explanation: `age >= 19 → 20은 19 이상이므로 true
hasTicket → true
true && true → 둘 다 참이므로 true`,
    keyPoint: "&& = 양쪽이 모두 참일 때만 참",
  },
  // ───────── Level 2 · if / else ─────────
  {
    id: "if-adult",
    type: "choice",
    subtype: "predict",
    conceptIds: ["if-else", "operators"],
    difficulty: 1,
    prompt: "이 코드를 실행하면 무엇이 출력될까요?",
    code: `const age = 20;

if (age >= 20) {
  console.log("성인입니다.");
} else {
  console.log("미성년자입니다.");
}`,
    choices: [
      { text: "성인입니다." },
      { text: "미성년자입니다.", misconception: ">= 를 '초과(>)'로 읽음" },
      { text: "성인입니다.\n미성년자입니다.", misconception: "if와 else가 둘 다 실행된다고 생각" },
      { text: "아무것도 출력되지 않는다" },
    ],
    answerIndex: 0,
    output: "성인입니다.",
    hints: [
      "if 괄호 안의 조건 age >= 20 은 참일까요, 거짓일까요?",
      "age는 20이에요. >= 는 '크거나 같다'는 뜻이에요.",
      "조건이 참이면 if 블록만, 거짓이면 else 블록만 실행돼요. 둘 중 하나만 실행돼요.",
      "20 >= 20 은 참이에요.",
    ],
    explanation: `age는 20이에요.
age >= 20 은 '20은 20보다 크거나 같다' → 참(true)이에요.
조건이 참이므로 if 블록의 "성인입니다."만 출력되고 else 블록은 건너뛰어요.`,
    keyPoint: "if/else 는 둘 중 정확히 하나만 실행돼요",
  },
  {
    id: "if-grade",
    type: "predict",
    conceptIds: ["if-else"],
    difficulty: 2,
    prompt: "이 코드의 실행 결과를 입력해 보세요.",
    code: `const score = 85;

if (score >= 90) {
  console.log("A");
} else if (score >= 80) {
  console.log("B");
} else if (score >= 70) {
  console.log("C");
} else {
  console.log("F");
}`,
    output: "B",
    hints: [
      "위에서부터 조건을 하나씩 확인해 볼까요? 85는 첫 번째 조건을 통과하나요?",
      "85 >= 80 도 참이고, 85 >= 70 도 참이에요. 그럼 둘 다 출력될까요?",
      "if / else if 묶음은 위에서부터 '처음으로 참인 블록 하나'만 실행하고 나머지는 건너뛰어요.",
      "처음으로 참이 되는 조건은 score >= 80 이에요.",
    ],
    explanation: `85 >= 90 → 거짓이라 다음 조건으로 가요.
85 >= 80 → 참! "B"를 출력하고 if 묶음 전체를 빠져나가요.
85 >= 70 도 참이지만, 이미 앞에서 참인 블록을 실행했기 때문에 확인하지 않아요.`,
    keyPoint: "else if 는 처음으로 참인 조건 하나만 실행",
  },
  // ───────── Level 2 · switch ─────────
  {
    id: "switch-fallthrough",
    type: "choice",
    subtype: "predict",
    conceptIds: ["switch"],
    difficulty: 2,
    prompt: "이 코드를 실행하면 무엇이 출력될까요?",
    code: `const fruit = "apple";

switch (fruit) {
  case "apple":
    console.log("사과");
  case "banana":
    console.log("바나나");
    break;
  default:
    console.log("기타");
}`,
    choices: [
      { text: "사과", misconception: "break 없이도 case가 끝난다고 생각" },
      { text: "사과\n바나나" },
      { text: "사과\n바나나\n기타", misconception: "break가 있어도 계속 실행된다고 생각" },
      { text: "기타" },
    ],
    answerIndex: 1,
    output: "사과\n바나나",
    hints: [
      'fruit는 "apple"이에요. 어느 case에서 실행이 시작될까요?',
      'case "apple" 블록에는 무언가가 빠져 있어요. 다른 case와 비교해 보세요.',
      "switch는 break를 만날 때까지 아래 case의 코드도 계속 실행해요.",
      '"사과"를 출력한 뒤 break가 없어서 아래로 흘러 내려가요. 다음 break는 어디에 있나요?',
    ],
    explanation: `fruit가 "apple"이라 case "apple"부터 실행해요 → "사과"
여기에 break가 없어서 아래 case "banana"의 코드도 이어서 실행해요 → "바나나"
그 다음 break를 만나 switch를 빠져나가서 "기타"는 출력되지 않아요.`,
    keyPoint: "switch 는 break 를 만날 때까지 아래로 계속 실행",
  },
  {
    id: "switch-blank",
    type: "choice",
    subtype: "blank",
    conceptIds: ["switch"],
    difficulty: 1,
    prompt: '"주말" 한 줄만 출력되게 하려면 빈칸에 무엇이 들어가야 할까요?',
    code: `const day = "일";

switch (day) {
  case "토":
  case "일":
    console.log("주말");
    ____;
  default:
    console.log("평일");
}`,
    choices: [
      { text: "break" },
      { text: "continue", misconception: "continue와 break를 혼동" },
      { text: "else", misconception: "switch에 else가 있다고 생각" },
      { text: "stop" },
    ],
    answerIndex: 0,
    output: "주말",
    hints: [
      '빈칸이 없다면 "주말" 다음에 무엇이 실행될까요?',
      '"주말"을 출력한 뒤 default로 흘러가지 않게 막아야 해요.',
      "switch 문을 빠져나가는 키워드가 있어요.",
      "반복문을 빠져나갈 때도 쓰는 그 키워드예요.",
    ],
    explanation: `day가 "일"이라 case "일"에서 "주말"을 출력해요.
break가 없으면 아래 default까지 흘러가서 "평일"도 출력돼요.
break를 넣으면 switch를 빠져나가서 "주말"만 출력돼요.`,
    keyPoint: "break = switch 에서 빠져나오기",
  },
  // ───────── Level 2 · for ─────────
  {
    id: "for-double",
    type: "predict",
    conceptIds: ["for"],
    difficulty: 1,
    prompt: "이 코드의 실행 결과를 입력해 보세요. (한 줄에 하나씩)",
    code: `for (let i = 1; i <= 3; i++) {
  console.log(i * 2);
}`,
    output: "2\n4\n6",
    hints: [
      "i는 몇에서 시작하고, 언제까지 반복하나요?",
      "i가 1, 2, 3일 때 각각 블록이 한 번씩 실행돼요.",
      "for (시작; 조건; 증가) — 조건이 참인 동안 블록을 실행하고 i를 1씩 늘려요.",
      "각 반복에서 i * 2 를 계산해 보세요.",
    ],
    explanation: `i = 1 → 1 <= 3 참 → 2 출력
i = 2 → 2 <= 3 참 → 4 출력
i = 3 → 3 <= 3 참 → 6 출력
i = 4 → 4 <= 3 거짓 → 반복 끝`,
    keyPoint: "for 는 조건이 참인 동안 반복",
  },
  {
    id: "for-sum",
    type: "choice",
    subtype: "predict",
    conceptIds: ["for", "variables"],
    difficulty: 2,
    prompt: "반복이 끝난 뒤 출력되는 값은?",
    code: `let sum = 0;

for (let i = 0; i < 4; i++) {
  sum += i;
}

console.log(sum);`,
    choices: [
      { text: "6" },
      { text: "10", misconception: "i < 4 가 4를 포함한다고 생각" },
      { text: "4", misconception: "반복 횟수와 합계를 혼동" },
      { text: "0", misconception: "반복문 안의 변경이 밖에 반영되지 않는다고 생각" },
    ],
    answerIndex: 0,
    output: "6",
    hints: [
      "i는 어떤 값들을 차례로 가지나요? 마지막 값은 몇일까요?",
      "i < 4 이므로 i가 4가 되면 반복이 멈춰요.",
      "sum += i 는 sum = sum + i 와 같아요. 매 반복마다 i를 sum에 더해요.",
      "0 + 1 + 2 + 3 을 계산해 보세요.",
    ],
    explanation: `i는 0, 1, 2, 3 순서로 변해요. (i < 4 이므로 4는 포함되지 않아요)
sum: 0 → 0+0=0 → 0+1=1 → 1+2=3 → 3+3=6
그래서 6이 출력돼요.`,
    keyPoint: "i < 4 는 4를 포함하지 않아요",
  },
  {
    id: "for-order",
    type: "order",
    conceptIds: ["for", "variables"],
    difficulty: 2,
    prompt: "1부터 3까지 더한 값 6이 '한 번만' 출력되도록 코드 조각을 순서대로 배치해 보세요.",
    code: "",
    pieces: ["let total = 0;", "for (let i = 1; i <= 3; i++) {", "  total += i;", "}", "console.log(total);"],
    output: "6",
    hints: [
      "합계를 담을 변수는 언제 만들어져야 할까요? 반복보다 먼저일까요, 나중일까요?",
      "반복문 안에는 '매번 해야 할 일'만 들어가야 해요.",
      "결과를 한 번만 출력하려면 console.log는 반복문 블록 밖에 있어야 해요.",
      "변수 준비 → 반복 시작 → 더하기 → 반복 끝 → 출력 순서예요.",
    ],
    explanation: `let total = 0; 으로 먼저 합계 변수를 준비해요.
for 반복문 안에서 total += i 로 1, 2, 3을 차례로 더해요.
반복이 끝난 뒤(} 다음에) console.log로 한 번만 출력해요.`,
    keyPoint: "반복 전 준비 → 반복 안에서 누적 → 반복 후 출력",
  },
  // ───────── Level 2 · while ─────────
  {
    id: "while-halve",
    type: "choice",
    subtype: "predict",
    conceptIds: ["while"],
    difficulty: 3,
    prompt: "반복이 끝난 뒤 출력되는 count 값은?",
    code: `let n = 10;
let count = 0;

while (n > 1) {
  n = n / 2;
  count++;
}

console.log(count);`,
    choices: [
      { text: "3", misconception: "마지막 반복(1.25 → 0.625)을 빠뜨림" },
      { text: "4" },
      { text: "5" },
      { text: "무한 반복", misconception: "n이 계속 바뀌는 것을 놓침" },
    ],
    answerIndex: 1,
    output: "4",
    hints: [
      "반복이 한 번 돌 때마다 n과 count가 어떻게 바뀌는지 표로 적어볼까요?",
      "n은 10 → 5 → ... 처럼 절반씩 줄어요. 소수점도 그대로 남아요.",
      "while은 블록을 실행하기 '전에' 매번 조건을 확인해요. n이 1 이하가 되면 멈춰요.",
      "10 → 5 → 2.5 → 1.25 → 0.625 로 바뀌는 동안 반복은 몇 번 돌았나요?",
    ],
    explanation: `n=10 (10>1 참) → n=5, count=1
n=5 (5>1 참) → n=2.5, count=2
n=2.5 (2.5>1 참) → n=1.25, count=3
n=1.25 (1.25>1 참) → n=0.625, count=4
n=0.625 (0.625>1 거짓) → 반복 끝, 4 출력`,
    keyPoint: "while 은 매번 조건을 먼저 확인하고 반복",
  },
  {
    id: "while-bug",
    type: "bug",
    conceptIds: ["while"],
    difficulty: 2,
    prompt: '3, 2, 1을 출력한 뒤 "발사!"를 출력하려고 했는데, 프로그램이 끝나지 않아요. 어느 줄이 문제일까요?',
    code: `let countdown = 3;

while (countdown > 0) {
  console.log(countdown);
  countdown + 1;
}

console.log("발사!");`,
    bugLine: 5,
    fixedLine: "  countdown--;",
    output: "3\n2\n1\n발사!",
    hints: [
      "while이 끝나려면 조건 countdown > 0 이 언젠가 거짓이 되어야 해요.",
      "반복 블록 안에서 countdown의 값이 실제로 바뀌나요?",
      "countdown + 1 은 계산만 하고 결과를 어디에도 저장하지 않아요. 그리고 방향도 반대예요.",
      "countdown을 1씩 '줄이고' '저장'하는 코드가 필요해요.",
    ],
    explanation: `5번째 줄 countdown + 1; 은 값을 계산만 하고 countdown에 저장하지 않아요.
그래서 countdown은 계속 3이고, 조건 countdown > 0 이 영원히 참이에요.
countdown--; 로 바꾸면 3 → 2 → 1 → 0 이 되어 반복이 끝나고 "발사!"가 출력돼요.`,
    keyPoint: "while 블록 안에서 조건이 언젠가 거짓이 되도록 값을 바꿔야 해요",
  },
];

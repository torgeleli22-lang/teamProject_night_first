import type { Problem } from "../types";

export const LEVEL_3_4: Problem[] = [
  // ───────── Level 3 · 배열 ─────────
  {
    id: "array-index",
    type: "choice",
    subtype: "predict",
    conceptIds: ["arrays"],
    difficulty: 1,
    prompt: "두 줄의 출력 결과로 알맞은 것은?",
    code: `const colors = ["red", "green", "blue"];

console.log(colors[1]);
console.log(colors.length);`,
    choices: [
      { text: "red\n3", misconception: "인덱스가 1부터 시작한다고 생각" },
      { text: "green\n3" },
      { text: "green\n2", misconception: "length가 마지막 인덱스라고 생각" },
      { text: "red\n2" },
    ],
    answerIndex: 1,
    output: "green\n3",
    hints: [
      "배열에서 첫 번째 요소의 번호(인덱스)는 몇일까요?",
      'colors[0], colors[1], colors[2] 가 각각 무엇인지 적어보세요.',
      "인덱스는 0부터 시작하고, length는 요소의 '개수'예요.",
      'colors[1]은 두 번째 요소예요. 요소는 모두 몇 개인가요?',
    ],
    explanation: `배열 인덱스는 0부터 시작해요: [0]="red", [1]="green", [2]="blue"
그래서 colors[1]은 "green"이에요.
length는 요소의 개수라서 3이에요.`,
    keyPoint: "인덱스는 0부터, length는 개수",
  },
  {
    id: "array-push",
    type: "predict",
    conceptIds: ["arrays"],
    difficulty: 2,
    prompt: "이 코드의 실행 결과를 입력해 보세요. (한 줄에 하나씩)",
    code: `const nums = [3, 6, 9];
nums.push(12);

console.log(nums[nums.length - 1]);
console.log(nums.length);`,
    output: "12\n4",
    hints: [
      "push가 실행된 뒤 nums는 어떤 모습일까요?",
      "push는 배열의 '맨 끝'에 값을 추가해요.",
      "nums.length - 1 은 항상 마지막 요소의 인덱스예요.",
      "nums는 [3, 6, 9, 12]가 되고, 길이는 4예요.",
    ],
    explanation: `nums.push(12) 로 nums는 [3, 6, 9, 12]가 돼요.
nums.length는 4, 마지막 인덱스는 4 - 1 = 3 → nums[3]은 12예요.
그래서 12, 4가 차례로 출력돼요.`,
    keyPoint: "마지막 요소 = arr[arr.length - 1]",
  },
  {
    id: "array-last-bug",
    type: "bug",
    conceptIds: ["arrays"],
    difficulty: 2,
    prompt: "마지막 점수 88을 출력하려고 했는데 undefined가 나와요. 어느 줄이 문제일까요?",
    code: `const scores = [90, 75, 88];
// 마지막 점수를 출력하고 싶어요
console.log(scores[scores.length]);`,
    bugLine: 3,
    fixedLine: "console.log(scores[scores.length - 1]);",
    output: "88",
    hints: [
      "scores.length 는 얼마인가요? 그 번호의 요소가 배열에 있나요?",
      "요소가 3개면 인덱스는 0, 1, 2 예요.",
      "존재하지 않는 인덱스를 읽으면 undefined가 나와요.",
      "마지막 인덱스는 length보다 1 작아요.",
    ],
    explanation: `scores.length는 3이지만, 인덱스는 0, 1, 2까지만 있어요.
scores[3]은 존재하지 않으므로 undefined가 출력돼요.
scores[scores.length - 1] 로 고치면 scores[2] = 88이 출력돼요.`,
    keyPoint: "마지막 인덱스 = length - 1",
  },
  // ───────── Level 3 · 객체 ─────────
  {
    id: "object-update",
    type: "choice",
    subtype: "predict",
    conceptIds: ["objects"],
    difficulty: 1,
    prompt: "두 줄의 출력 결과로 알맞은 것은?",
    code: `const user = { name: "민지", age: 21 };

user.age = user.age + 1;

console.log(user.age);
console.log(user.city);`,
    choices: [
      { text: "22\nundefined" },
      { text: "21\nundefined", misconception: "const 객체의 속성도 바꿀 수 없다고 생각" },
      { text: "22\n오류 발생", misconception: "없는 속성을 읽으면 에러가 난다고 생각" },
      { text: "22\nnull" },
    ],
    answerIndex: 0,
    output: "22\nundefined",
    hints: [
      "user.age = user.age + 1 이 실행되면 age는 어떻게 될까요?",
      "user 객체에 city라는 key가 있나요?",
      "const는 user라는 변수에 다른 객체를 '다시 대입'하는 걸 막을 뿐, 객체 안의 속성은 바꿀 수 있어요.",
      "없는 key를 읽으면 에러가 아니라 '값이 정해지지 않았다'는 뜻의 값이 나와요.",
    ],
    explanation: `user.age = 21 + 1 로 age가 22로 바뀌어요. (const여도 속성 변경은 가능해요)
user에는 city라는 key가 없으므로 user.city는 undefined예요.`,
    keyPoint: "없는 속성을 읽으면 undefined",
  },
  {
    id: "object-bracket-explain",
    type: "explain",
    conceptIds: ["objects"],
    difficulty: 2,
    prompt: "이 코드는 9000을 출력해요. book[key]가 왜 9000이 되는지 설명해 주세요.",
    code: `const book = { title: "어린 왕자", price: 9000 };
const key = "price";

console.log(book[key]);`,
    output: "9000",
    rubric: [
      { label: "key 변수의 값", keywords: ["key", "\"price\"", "'price'", "price라는", "문자열"] },
      { label: "대괄호 접근", keywords: ["대괄호", "[]", "[key]", "변수의 값으로", "변수 값"] },
      { label: "price 속성 값", keywords: ["9000", "book.price"] },
    ],
    modelAnswer:
      "key 변수에는 문자열 \"price\"가 들어 있어요. 대괄호 안에 변수를 쓰면 변수의 값을 key 이름으로 사용하므로 book[key]는 book[\"price\"], 즉 book.price와 같아요. 그래서 9000이 출력돼요.",
    hints: [
      "key라는 변수에는 어떤 값이 들어 있나요?",
      "book[key] 에서 key는 'key'라는 글자가 아니라 변수예요.",
      "대괄호 안에 변수를 쓰면, 그 변수에 들어 있는 값을 속성 이름으로 써요.",
      'book[key] → book["price"] → book.price 로 바꿔서 설명해 보세요.',
    ],
    explanation: `key 변수에는 "price"라는 문자열이 들어 있어요.
book[key] 는 key의 값을 속성 이름으로 쓰므로 book["price"]와 같아요.
book["price"] 는 book.price 와 같고, 값은 9000이에요.`,
    keyPoint: "obj[변수] = 변수에 담긴 값을 속성 이름으로 사용",
  },
  // ───────── Level 3 · 문자열 ─────────
  {
    id: "string-index",
    type: "choice",
    subtype: "predict",
    conceptIds: ["strings"],
    difficulty: 1,
    prompt: "두 줄의 출력 결과로 알맞은 것은?",
    code: `const word = "JavaScript";

console.log(word[0]);
console.log(word.length);`,
    choices: [
      { text: "J\n10" },
      { text: "a\n10", misconception: "인덱스가 1부터 시작한다고 생각" },
      { text: "J\n9", misconception: "length를 마지막 인덱스로 착각" },
      { text: "J\n11" },
    ],
    answerIndex: 0,
    output: "J\n10",
    hints: [
      "문자열도 배열처럼 번호로 글자를 꺼낼 수 있어요. 첫 글자의 번호는?",
      '"JavaScript"의 글자 수를 직접 세어 보세요.',
      "문자열 인덱스도 0부터 시작하고, length는 글자 수예요.",
      "J-a-v-a-S-c-r-i-p-t 를 손가락으로 세어 보세요.",
    ],
    explanation: `문자열도 0번부터 시작해요. word[0]은 첫 글자 "J"예요.
"JavaScript"는 J,a,v,a,S,c,r,i,p,t 로 10글자라서 length는 10이에요.`,
    keyPoint: "문자열도 인덱스는 0부터, length는 글자 수",
  },
  {
    id: "string-template",
    type: "predict",
    conceptIds: ["strings", "variables"],
    difficulty: 1,
    prompt: "이 코드의 실행 결과를 입력해 보세요.",
    code: `const name = "코딩";
const days = 3;

console.log(\`\${name} \${days}일째\`);`,
    output: "코딩 3일째",
    hints: [
      "백틱(`)으로 감싼 문자열 안의 ${ } 는 무슨 역할일까요?",
      "${name} 자리와 ${days} 자리에 각각 어떤 값이 들어갈까요?",
      "템플릿 문자열에서 ${변수}는 그 변수의 값으로 바뀌어요. 나머지 글자와 공백은 그대로예요.",
      "${name} → 코딩, ${days} → 3 으로 바꿔서 읽어 보세요.",
    ],
    explanation: `백틱(\`)으로 만든 템플릿 문자열에서 \${ } 안의 값이 끼워 넣어져요.
\${name} → "코딩", \${days} → 3
가운데 공백과 "일째"는 그대로 남아서 "코딩 3일째"가 돼요.`,
    keyPoint: "`${값}` = 문자열 안에 값 끼워 넣기",
  },
  {
    id: "string-immutable",
    type: "choice",
    subtype: "predict",
    conceptIds: ["strings"],
    difficulty: 2,
    prompt: "이 코드를 실행하면 무엇이 출력될까요?",
    code: `let greeting = "hello";

greeting.toUpperCase();

console.log(greeting);`,
    choices: [
      { text: "hello" },
      { text: "HELLO", misconception: "문자열 메서드가 원본을 바꾼다고 생각" },
      { text: "Hello" },
      { text: "undefined" },
    ],
    answerIndex: 0,
    output: "hello",
    hints: [
      "toUpperCase()의 결과는 어디에 저장되나요?",
      "3번째 줄은 결과를 어떤 변수에도 담지 않아요.",
      "문자열 메서드는 원본을 바꾸지 않고 '새 문자열'을 돌려줘요.",
      "greeting 변수 자체는 한 번도 다시 대입되지 않았어요.",
    ],
    explanation: `toUpperCase()는 "HELLO"라는 새 문자열을 돌려줄 뿐, greeting을 바꾸지 않아요.
3번째 줄은 그 결과를 저장하지 않았으므로 버려져요.
greeting은 여전히 "hello"예요. 바꾸려면 greeting = greeting.toUpperCase(); 처럼 대입해야 해요.`,
    keyPoint: "문자열 메서드는 원본을 바꾸지 않고 새 값을 돌려줘요",
  },
  // ───────── Level 4 · 함수 선언 ─────────
  {
    id: "function-call-order",
    type: "choice",
    subtype: "predict",
    conceptIds: ["functions"],
    difficulty: 1,
    prompt: "출력 순서로 알맞은 것은?",
    code: `function sayHi() {
  console.log("안녕");
}

console.log("시작");
sayHi();
sayHi();`,
    choices: [
      { text: "안녕\n시작\n안녕", misconception: "함수를 선언할 때 바로 실행된다고 생각" },
      { text: "시작\n안녕\n안녕" },
      { text: "시작\n안녕", misconception: "함수는 한 번만 실행된다고 생각" },
      { text: "안녕\n안녕\n시작" },
    ],
    answerIndex: 1,
    output: "시작\n안녕\n안녕",
    hints: [
      "function sayHi() { ... } 부분은 언제 실행될까요?",
      "함수 안의 코드는 '호출'할 때 실행돼요. 호출은 어디에서 일어나나요?",
      "함수 선언은 '레시피를 적어두는 것'이고, sayHi() 는 '레시피대로 요리하기'예요.",
      '"시작"이 먼저 출력되고, 그 다음 호출 횟수만큼 "안녕"이 출력돼요.',
    ],
    explanation: `function sayHi() { ... } 는 함수를 '정의'만 하고 실행하지 않아요.
console.log("시작") → "시작"
sayHi() → "안녕", 한 번 더 sayHi() → "안녕"`,
    keyPoint: "함수는 호출해야 실행돼요",
  },
  {
    id: "function-missing-return",
    type: "bug",
    conceptIds: ["functions", "params-return"],
    difficulty: 2,
    prompt: "double(4)가 8을 출력하길 기대했지만 undefined가 나와요. 어느 줄이 문제일까요?",
    code: `function double(n) {
  n * 2;
}

console.log(double(4));`,
    bugLine: 2,
    fixedLine: "  return n * 2;",
    output: "8",
    hints: [
      "함수가 결과를 '돌려주려면' 어떤 키워드가 필요할까요?",
      "2번째 줄은 n * 2 를 계산하지만, 그 결과를 어떻게 하나요?",
      "return이 없는 함수는 undefined를 돌려줘요.",
      "계산한 값을 함수 밖으로 돌려주도록 2번째 줄을 고쳐보세요.",
    ],
    explanation: `2번째 줄은 n * 2 를 계산만 하고 결과를 돌려주지 않아요.
return이 없는 함수는 undefined를 돌려주므로 console.log에는 undefined가 출력돼요.
return n * 2; 로 고치면 double(4)는 8을 돌려줘요.`,
    keyPoint: "결과를 돌려주려면 return",
  },
  // ───────── Level 4 · 매개변수와 반환값 ─────────
  {
    id: "return-stops",
    type: "choice",
    subtype: "predict",
    conceptIds: ["params-return"],
    difficulty: 2,
    prompt: "이 코드를 실행하면 무엇이 출력될까요?",
    code: `function add(a, b) {
  return a + b;
  console.log("계산 완료");
}

const result = add(3, 4);
console.log(result);`,
    choices: [
      { text: "7" },
      { text: "계산 완료\n7", misconception: "return 이후 코드도 실행된다고 생각" },
      { text: "7\n계산 완료" },
      { text: "undefined" },
    ],
    answerIndex: 0,
    output: "7",
    hints: [
      "add(3, 4)를 호출하면 a와 b에 각각 무엇이 들어가나요?",
      "함수 안에서 return을 만나면 어떤 일이 일어날까요?",
      "return은 값을 돌려주면서 함수를 '즉시' 끝내요. 그 아래 코드는 실행되지 않아요.",
      '"계산 완료" 줄은 return 아래에 있어요.',
    ],
    explanation: `add(3, 4) → a = 3, b = 4
return a + b; 에서 7을 돌려주고 함수가 즉시 끝나요.
그래서 return 아래의 console.log("계산 완료")는 실행되지 않아요.
result에 7이 담기고, 7이 출력돼요.`,
    keyPoint: "return 은 값을 돌려주고 함수를 즉시 끝내요",
  },
  {
    id: "no-return-undefined",
    type: "predict",
    conceptIds: ["params-return", "functions"],
    difficulty: 2,
    prompt: "이 코드의 실행 결과를 입력해 보세요. (한 줄에 하나씩)",
    code: `function greet(name) {
  console.log("안녕, " + name);
}

const r = greet("민지");
console.log(r);`,
    output: "안녕, 민지\nundefined",
    hints: [
      'greet("민지")를 호출하면 함수 안에서 무엇이 출력되나요?',
      "greet 함수에는 return이 있나요? 그럼 r에는 무엇이 담길까요?",
      "console.log로 '출력'하는 것과 return으로 '돌려주는' 것은 달라요.",
      "return이 없는 함수의 결과는 undefined예요.",
    ],
    explanation: `greet("민지") 를 호출하면 함수 안에서 "안녕, 민지"를 출력해요.
greet에는 return이 없으므로 undefined를 돌려주고, r에 undefined가 담겨요.
그래서 두 번째 줄에 undefined가 출력돼요.`,
    keyPoint: "출력(console.log)과 반환(return)은 달라요",
  },
  // ───────── Level 4 · 화살표 함수 ─────────
  {
    id: "arrow-blank",
    type: "choice",
    subtype: "blank",
    conceptIds: ["arrow-functions"],
    difficulty: 2,
    prompt: "25가 출력되려면 빈칸에 무엇이 들어가야 할까요?",
    code: `const square = (n) => ____;

console.log(square(5));`,
    choices: [
      { text: "n * n" },
      { text: "{ n * n }", misconception: "중괄호가 있어도 자동 반환된다고 생각" },
      { text: "return n * n", misconception: "중괄호 없는 화살표 함수에 return을 씀" },
      { text: "n ** 0" },
    ],
    answerIndex: 0,
    output: "25",
    hints: [
      "화살표 함수에서 => 뒤에 '식'만 쓰면 어떻게 될까요?",
      "중괄호 { } 를 쓰는 경우와 안 쓰는 경우의 차이를 떠올려 보세요.",
      "중괄호 없이 식만 쓰면 그 식의 결과가 자동으로 반환돼요. 중괄호를 쓰면 return이 필요해요.",
      "5를 넣어서 25가 나오는 '식'을 고르세요.",
    ],
    explanation: `(n) => n * n 은 'n을 받아 n * n 을 돌려주는 함수'예요.
중괄호 없이 식만 쓰면 그 결과가 자동으로 반환돼요.
{ n * n } 은 중괄호 블록이라 return이 없어서 undefined를 돌려주고,
return n * n 은 중괄호 없이 쓰면 문법 오류예요.`,
    keyPoint: "(x) => 식  은 식의 결과를 자동으로 반환",
  },
  {
    id: "arrow-braces",
    type: "choice",
    subtype: "predict",
    conceptIds: ["arrow-functions", "params-return"],
    difficulty: 2,
    prompt: "이 코드를 실행하면 무엇이 출력될까요?",
    code: `const add = (a, b) => {
  a + b;
};

console.log(add(2, 3));`,
    choices: [
      { text: "5", misconception: "중괄호가 있어도 자동 반환된다고 생각" },
      { text: "undefined" },
      { text: "a + b" },
      { text: "오류 발생" },
    ],
    answerIndex: 1,
    output: "undefined",
    hints: [
      "이 화살표 함수는 => 뒤에 무엇이 오나요? 식인가요, 중괄호 블록인가요?",
      "중괄호 블록 안에 return이 있나요?",
      "중괄호를 쓴 화살표 함수는 일반 함수처럼 return을 직접 써야 값을 돌려줘요.",
      "return이 없는 함수가 돌려주는 값은?",
    ],
    explanation: `=> 뒤에 중괄호 { } 가 있으므로 '블록'으로 동작해요.
블록 안의 a + b; 는 계산만 하고 return이 없어서 결과가 버려져요.
그래서 add(2, 3)은 undefined를 돌려줘요.`,
    keyPoint: "화살표 함수에 중괄호를 쓰면 return 필요",
  },
  // ───────── Level 4 · 스코프 ─────────
  {
    id: "scope-shadow",
    type: "choice",
    subtype: "predict",
    conceptIds: ["scope"],
    difficulty: 2,
    prompt: "두 줄의 출력 결과로 알맞은 것은?",
    code: `let message = "바깥";

if (true) {
  let message = "안쪽";
  console.log(message);
}

console.log(message);`,
    choices: [
      { text: "안쪽\n바깥" },
      { text: "안쪽\n안쪽", misconception: "블록 안의 let이 바깥 변수를 덮어쓴다고 생각" },
      { text: "바깥\n바깥" },
      { text: "바깥\n안쪽" },
    ],
    answerIndex: 0,
    output: "안쪽\n바깥",
    hints: [
      "블록 안의 let message 는 바깥의 message와 같은 변수일까요?",
      "블록 안에서 let으로 '새로 선언'했다는 점에 주목하세요.",
      "let으로 선언한 변수는 자신이 선언된 { } 안에서만 존재해요. 같은 이름이어도 다른 변수예요.",
      "블록 안에서는 안쪽 변수를, 블록 밖에서는 바깥 변수를 봐요.",
    ],
    explanation: `블록 안의 let message = "안쪽" 은 바깥 변수와 이름만 같은 '새 변수'예요.
블록 안의 console.log는 가장 가까운 안쪽 변수를 봐서 "안쪽"을 출력해요.
블록이 끝나면 안쪽 변수는 사라지고, 바깥의 message는 그대로 "바깥"이에요.`,
    keyPoint: "블록 안의 let/const 는 블록 밖과 별개의 변수",
  },
  {
    id: "scope-counter-explain",
    type: "explain",
    conceptIds: ["scope", "functions"],
    difficulty: 3,
    prompt: "counter()를 두 번 호출했는데 둘 다 1이 출력돼요. 왜 2가 아니라 1인지 설명해 주세요.",
    code: `function counter() {
  let count = 0;
  count++;
  return count;
}

console.log(counter());
console.log(counter());`,
    output: "1\n1",
    rubric: [
      { label: "호출마다 새로 만들어짐", keywords: ["새로", "다시", "매번", "0으로", "초기화", "처음부터"] },
      { label: "함수 안(지역) 변수", keywords: ["함수 안", "지역", "안에서", "스코프", "내부"] },
      { label: "1을 반환", keywords: ["1", "반환", "return", "돌려"] },
    ],
    modelAnswer:
      "count는 함수 안에서 선언된 지역 변수라서, counter()를 호출할 때마다 let count = 0 으로 새로 만들어져요. 그래서 매번 0에서 1이 되고 1을 반환해요. 이전 호출의 count는 함수가 끝나면 사라져요.",
    hints: [
      "counter()를 호출할 때마다 함수 안의 코드는 처음부터 실행될까요?",
      "let count = 0; 은 함수 '안'에 있어요. 이 줄은 호출할 때마다 실행되나요?",
      "함수 안에서 선언한 변수는 호출할 때마다 새로 만들어지고, 함수가 끝나면 사라져요.",
      "'매번 0에서 시작한다'는 점과 '함수 안의 변수'라는 점을 연결해서 설명해 보세요.",
    ],
    explanation: `count는 counter 함수 안에서 선언된 변수예요.
counter()를 호출할 때마다 let count = 0 이 다시 실행되어 0부터 시작해요.
count++ 로 1이 되고 return으로 1을 돌려줘요.
함수가 끝나면 count는 사라지므로, 두 번째 호출도 다시 0 → 1이에요.`,
    keyPoint: "함수 안의 변수는 호출할 때마다 새로 만들어져요",
  },
];

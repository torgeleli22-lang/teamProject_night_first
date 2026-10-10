import type { LegacyProblem as Problem } from "../legacy-types";

const MAP_FILTER = "map과 filter를 혼동";

export const LEVEL_5: Problem[] = [
  // ───────── map ─────────
  {
    id: "map-double",
    type: "choice",
    subtype: "predict",
    conceptIds: ["map", "arrow-functions"],
    difficulty: 1,
    prompt: "이 코드의 실행 결과는 무엇일까요?",
    code: `const numbers = [1, 2, 3];

const result = numbers.map(n => n * 2);

console.log(result);`,
    choices: [
      { text: "[1, 2, 3]", misconception: "map이 원본을 그대로 돌려준다고 생각" },
      { text: "[2, 4, 6]" },
      { text: "[2, 3, 4]", misconception: "콜백의 계산식을 잘못 읽음" },
      { text: "오류 발생" },
    ],
    answerIndex: 1,
    output: "[2, 4, 6]",
    hints: [
      "map은 배열의 요소를 하나씩 꺼내서 무언가를 해요. 무엇을 할까요?",
      "n => n * 2 는 'n을 받아 n * 2를 돌려주는 함수'예요. 이 함수가 요소마다 실행돼요.",
      "map은 콜백이 돌려준 값들을 모아서 같은 길이의 '새 배열'을 만들어요.",
      "1, 2, 3에 각각 × 2 를 해보세요.",
    ],
    explanation: `numbers.map()은 배열의 각 요소를 하나씩 변환해서 새로운 배열을 만들어요.
1 → 2
2 → 4
3 → 6
그래서 최종 결과는 [2, 4, 6]이에요.`,
    keyPoint: "map = 배열의 각 요소를 변환",
  },
  {
    id: "map-upper",
    type: "predict",
    conceptIds: ["map", "strings"],
    difficulty: 2,
    prompt: "두 줄의 실행 결과를 입력해 보세요. (배열은 ['a', 'b'] 형태로)",
    code: `const names = ["kim", "lee"];

const upper = names.map(name => name.toUpperCase());

console.log(upper);
console.log(names);`,
    output: "['KIM', 'LEE']\n['kim', 'lee']",
    hints: [
      "upper와 names는 같은 배열일까요, 다른 배열일까요?",
      "콜백 name => name.toUpperCase() 는 각 이름을 어떻게 바꾸나요?",
      "map은 원본 배열을 바꾸지 않고 '새 배열'을 만들어 돌려줘요.",
      "upper는 대문자로 바뀐 새 배열, names는 원래 그대로예요.",
    ],
    explanation: `map은 각 이름에 toUpperCase()를 적용한 새 배열 ['KIM', 'LEE']를 만들어요.
원본 names는 바뀌지 않으므로 ['kim', 'lee'] 그대로예요.`,
    keyPoint: "map 은 원본을 바꾸지 않고 새 배열을 만들어요",
  },
  {
    id: "map-boolean",
    type: "choice",
    subtype: "predict",
    conceptIds: ["map", "filter"],
    difficulty: 2,
    prompt: "map에 조건식을 넣으면 어떤 결과가 나올까요?",
    code: `const nums = [1, 2, 3, 4];

const result = nums.map(n => n > 2);

console.log(result);`,
    choices: [
      { text: "[3, 4]", misconception: MAP_FILTER },
      { text: "[false, false, true, true]" },
      { text: "[1, 2]" },
      { text: "2" },
    ],
    answerIndex: 1,
    output: "[false, false, true, true]",
    hints: [
      "콜백 n => n > 2 가 돌려주는 값은 숫자일까요, true/false일까요?",
      "map은 콜백이 돌려준 값을 '그대로' 새 배열에 담아요.",
      "map은 고르지 않아요. 결과 배열의 길이는 항상 원래와 같아요. 고르는 건 filter의 일이에요.",
      "1 > 2, 2 > 2, 3 > 2, 4 > 2 를 각각 계산해 보세요.",
    ],
    explanation: `n > 2 는 true 또는 false를 돌려주는 비교식이에요.
map은 그 값을 그대로 모으기 때문에 요소를 골라내지 않아요.
1 → false, 2 → false, 3 → true, 4 → true
결과는 [false, false, true, true]예요. [3, 4]를 원했다면 filter를 써야 해요.`,
    keyPoint: "map 은 변환, filter 는 고르기",
  },
  // ───────── filter ─────────
  {
    id: "filter-pass",
    type: "choice",
    subtype: "predict",
    conceptIds: ["filter"],
    difficulty: 1,
    prompt: "합격 점수만 골라낸 결과는?",
    code: `const scores = [55, 80, 92, 40];

const passed = scores.filter(s => s >= 60);

console.log(passed);`,
    choices: [
      { text: "[80, 92]" },
      { text: "[false, true, true, false]", misconception: MAP_FILTER },
      { text: "[55, 40]", misconception: "filter가 조건에 맞는 요소를 버린다고 생각" },
      { text: "2" },
    ],
    answerIndex: 0,
    output: "[80, 92]",
    hints: [
      "filter는 각 요소에 대해 조건 s >= 60 을 검사해요. 어떤 요소가 통과할까요?",
      "조건이 true인 요소는 남고, false인 요소는 빠져요.",
      "filter는 값을 바꾸지 않고 '통과한 요소 그대로'를 새 배열에 담아요.",
      "55, 80, 92, 40 중 60 이상인 것만 남겨보세요.",
    ],
    explanation: `filter는 조건을 통과한(true) 요소만 골라 새 배열을 만들어요.
55 → false (제외), 80 → true (포함), 92 → true (포함), 40 → false (제외)
결과는 [80, 92]예요.`,
    keyPoint: "filter = 조건을 통과한 요소만 남김",
  },
  {
    id: "filter-length",
    type: "predict",
    conceptIds: ["filter", "strings"],
    difficulty: 2,
    prompt: "두 줄의 실행 결과를 입력해 보세요. (배열은 ['a', 'b'] 형태로)",
    code: `const words = ["apple", "kiwi", "banana", "fig"];

const short = words.filter(w => w.length <= 4);

console.log(short);
console.log(short.length);`,
    output: "['kiwi', 'fig']\n2",
    hints: [
      "각 단어의 글자 수는 몇 개인가요?",
      "조건은 '글자 수가 4 이하'예요.",
      "filter는 조건이 true인 요소만 순서를 유지한 채 새 배열에 담아요.",
      "apple(5), kiwi(4), banana(6), fig(3) — 4 이하인 것은?",
    ],
    explanation: `apple은 5글자 → 제외, kiwi는 4글자 → 포함
banana는 6글자 → 제외, fig는 3글자 → 포함
short는 ['kiwi', 'fig']이고, length는 2예요.`,
    keyPoint: "filter 결과는 원래보다 짧아질 수 있어요",
  },
  {
    id: "filter-bug",
    type: "bug",
    conceptIds: ["filter", "map"],
    difficulty: 2,
    prompt: "짝수만 골라 [2, 4, 6]을 출력하고 싶었는데 true/false 배열이 나와요. 어느 줄이 문제일까요?",
    code: `const nums = [1, 2, 3, 4, 5, 6];
// 짝수만 골라내고 싶어요
const evens = nums.map(n => n % 2 === 0);
console.log(evens);`,
    bugLine: 3,
    fixedLine: "const evens = nums.filter(n => n % 2 === 0);",
    output: "[2, 4, 6]",
    hints: [
      "지금 코드는 어떤 배열 메서드를 쓰고 있나요? 그 메서드는 '고르기'를 하나요?",
      "n % 2 === 0 은 true/false를 돌려줘요. map은 이 값을 어떻게 하나요?",
      "map은 변환, filter는 고르기예요.",
      "3번째 줄의 메서드 이름을 바꿔 보세요.",
    ],
    explanation: `map은 콜백이 돌려준 값(true/false)을 그대로 모아요 → [false, true, false, true, false, true]
'고르기'를 하려면 filter를 써야 해요.
nums.filter(n => n % 2 === 0) 은 조건이 true인 2, 4, 6만 남겨요.`,
    keyPoint: "골라내려면 filter",
  },
  // ───────── forEach ─────────
  {
    id: "foreach-undefined",
    type: "choice",
    subtype: "predict",
    conceptIds: ["for-each", "map"],
    difficulty: 2,
    prompt: "result에는 무엇이 담길까요?",
    code: `const nums = [1, 2, 3];

const result = nums.forEach(n => n * 2);

console.log(result);`,
    choices: [
      { text: "[2, 4, 6]", misconception: "forEach가 새 배열을 만든다고 생각 (map과 혼동)" },
      { text: "undefined" },
      { text: "[1, 2, 3]" },
      { text: "6" },
    ],
    answerIndex: 1,
    output: "undefined",
    hints: [
      "forEach와 map은 둘 다 요소마다 함수를 실행해요. 그럼 무엇이 다를까요?",
      "forEach가 '돌려주는 값'에 집중해 보세요.",
      "forEach는 각 요소에 대해 실행만 하고, 새 배열을 만들지 않아요. 항상 undefined를 돌려줘요.",
      "result = nums.forEach(...) 의 결과는 forEach의 반환값이에요.",
    ],
    explanation: `forEach는 요소마다 콜백을 실행하지만, 결과를 모으지 않아요.
forEach 자체는 항상 undefined를 돌려줘요.
그래서 result는 undefined예요. 변환된 새 배열이 필요하면 map을 써야 해요.`,
    keyPoint: "forEach 는 반환값이 없어요 (undefined)",
  },
  {
    id: "foreach-total",
    type: "predict",
    conceptIds: ["for-each", "variables"],
    difficulty: 1,
    prompt: "이 코드의 실행 결과를 입력해 보세요.",
    code: `let total = 0;

[10, 20, 30].forEach(n => {
  total += n;
});

console.log(total);`,
    output: "60",
    hints: [
      "forEach는 각 요소에 대해 콜백을 실행해요. 콜백은 무엇을 하나요?",
      "콜백은 바깥 변수 total에 n을 더해요.",
      "forEach는 값을 돌려주지 않지만, 콜백 안에서 바깥 변수를 바꿀 수는 있어요.",
      "0 + 10 + 20 + 30 = ?",
    ],
    explanation: `total은 0에서 시작해요.
10 → total = 10, 20 → total = 30, 30 → total = 60
forEach가 끝난 뒤 60이 출력돼요.`,
    keyPoint: "forEach = 각 요소마다 무언가 하기",
  },
  // ───────── find ─────────
  {
    id: "find-first",
    type: "choice",
    subtype: "predict",
    conceptIds: ["find", "objects"],
    difficulty: 2,
    prompt: "이 코드를 실행하면 무엇이 출력될까요?",
    code: `const users = [
  { name: "민지", age: 17 },
  { name: "철수", age: 22 },
  { name: "영희", age: 25 },
];

const adult = users.find(u => u.age >= 20);

console.log(adult.name);`,
    choices: [
      { text: "철수" },
      { text: "영희", misconception: "find가 마지막으로 맞는 요소를 돌려준다고 생각" },
      { text: "['철수', '영희']", misconception: "find와 filter를 혼동" },
      { text: "undefined" },
    ],
    answerIndex: 0,
    output: "철수",
    hints: [
      "find는 배열을 앞에서부터 확인해요. 조건을 처음 만족하는 사람은 누구인가요?",
      "find는 조건에 맞는 요소를 '몇 개' 돌려줄까요?",
      "find는 조건이 true인 '첫 번째 요소 하나'를 돌려주고 멈춰요. 배열이 아니에요.",
      "민지(17)는 통과하지 못해요. 그 다음은?",
    ],
    explanation: `find는 앞에서부터 조건 u.age >= 20 을 확인해요.
민지(17) → false, 철수(22) → true! 여기서 멈추고 철수 객체를 돌려줘요.
adult.name 은 "철수"예요. 모두 필요하다면 filter를 써야 해요.`,
    keyPoint: "find = 조건에 맞는 첫 번째 요소 하나",
  },
  {
    id: "find-missing",
    type: "predict",
    conceptIds: ["find"],
    difficulty: 2,
    prompt: "두 줄의 실행 결과를 입력해 보세요.",
    code: `const nums = [3, 7, 11];

console.log(nums.find(n => n > 5));
console.log(nums.find(n => n > 20));`,
    output: "7\nundefined",
    hints: [
      "첫 번째 find에서 5보다 큰 첫 숫자는?",
      "두 번째 find에서 20보다 큰 숫자가 있나요?",
      "find는 조건에 맞는 요소가 없으면 undefined를 돌려줘요.",
      "첫 줄은 숫자 하나, 둘째 줄은 '없음'을 뜻하는 값이에요.",
    ],
    explanation: `n > 5 를 처음 만족하는 요소는 7이에요. (11도 만족하지만 첫 번째만 돌려줘요)
n > 20 을 만족하는 요소는 없으므로 undefined예요.`,
    keyPoint: "find 는 못 찾으면 undefined",
  },
  // ───────── reduce ─────────
  {
    id: "reduce-sum",
    type: "choice",
    subtype: "predict",
    conceptIds: ["reduce"],
    difficulty: 2,
    prompt: "이 코드를 실행하면 무엇이 출력될까요?",
    code: `const nums = [1, 2, 3, 4];

const total = nums.reduce((acc, n) => acc + n, 0);

console.log(total);`,
    choices: [
      { text: "10" },
      { text: "4", misconception: "reduce가 마지막 요소를 돌려준다고 생각" },
      { text: "[1, 3, 6, 10]", misconception: "reduce가 중간 결과를 배열로 모은다고 생각" },
      { text: "0" },
    ],
    answerIndex: 0,
    output: "10",
    hints: [
      "reduce의 두 번째 인자 0은 무엇일까요?",
      "acc는 '지금까지 누적된 값', n은 '현재 요소'예요.",
      "reduce는 콜백이 돌려준 값을 다음 acc로 넘기면서 배열을 끝까지 돌고, 마지막 acc 하나를 돌려줘요.",
      "0 → 0+1 → 1+2 → 3+3 → 6+4 순서로 따라가 보세요.",
    ],
    explanation: `acc는 0에서 시작해요.
acc=0, n=1 → 1
acc=1, n=2 → 3
acc=3, n=3 → 6
acc=6, n=4 → 10
최종 누적값 10 하나가 돌려져요.`,
    keyPoint: "reduce = 누적해서 값 하나로 합치기",
  },
  {
    id: "reduce-explain",
    type: "explain",
    conceptIds: ["reduce"],
    difficulty: 2,
    prompt: "이 코드는 10000을 출력해요. reduce가 어떻게 10000을 만드는지 단계적으로 설명해 주세요.",
    code: `const prices = [3000, 5000, 2000];

const sum = prices.reduce((acc, price) => acc + price, 0);

console.log(sum);`,
    output: "10000",
    rubric: [
      { label: "시작값 0", keywords: ["0에서", "0부터", "시작", "초기", "처음"] },
      { label: "하나씩 누적", keywords: ["더해", "더하", "누적", "합", "acc"] },
      { label: "최종 결과", keywords: ["10000", "만 원", "1만"] },
    ],
    modelAnswer:
      "acc는 0에서 시작해요. 첫 번째 가격 3000을 더해 3000, 두 번째 5000을 더해 8000, 세 번째 2000을 더해 10000이 돼요. 배열이 끝나면 마지막 acc 값 10000을 돌려줘서 sum이 10000이 돼요.",
    hints: [
      "reduce의 마지막 인자 0은 어떤 역할을 할까요?",
      "콜백이 실행될 때마다 acc가 어떻게 변하는지 단계별로 적어보세요.",
      "콜백이 돌려준 acc + price 가 다음 단계의 acc가 돼요.",
      "0 → 3000 → 8000 → 10000 의 흐름을 설명해 보세요.",
    ],
    explanation: `acc는 시작값 0에서 출발해요.
0 + 3000 = 3000
3000 + 5000 = 8000
8000 + 2000 = 10000
배열을 다 돌면 마지막 누적값 10000이 sum에 담겨요.`,
    keyPoint: "reduce 콜백의 반환값이 다음 acc가 돼요",
  },
  {
    id: "chain-order",
    type: "order",
    conceptIds: ["filter", "map"],
    difficulty: 3,
    prompt: "짝수만 골라 10을 곱한 [20, 40]이 출력되도록 코드 조각을 순서대로 배치해 보세요.",
    code: "",
    pieces: [
      "const nums = [1, 2, 3, 4, 5];",
      "const evens = nums.filter(n => n % 2 === 0);",
      "const tens = evens.map(n => n * 10);",
      "console.log(tens);",
    ],
    output: "[20, 40]",
    hints: [
      "어떤 변수가 다른 변수를 사용하고 있나요? 사용하려면 먼저 만들어져 있어야 해요.",
      "evens는 nums를, tens는 evens를 사용해요.",
      "먼저 고르고(filter), 그 다음 변환(map)해요.",
      "데이터 준비 → filter → map → 출력 순서예요.",
    ],
    explanation: `nums를 먼저 만들어요.
filter로 짝수 [2, 4]를 골라 evens에 담아요.
map으로 각각 × 10 해서 [20, 40]을 tens에 담아요.
마지막으로 tens를 출력해요.`,
    keyPoint: "filter 로 고르고 → map 으로 변환",
  },
];

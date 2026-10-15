import type { SeedSet } from "./types";

/**
 * 코드 학습 시드: 코드 하나를 읽는 순서대로 단계별 문제를 낸다.
 * 훑어보기(overview) → 흐름 따라가기(trace) → 핵심 줄(key) → 정리(wrapup: 결과 예측·내 말로 설명)
 * 흐름 따라가기의 rows(정답)는 실제 실행 기록을 옮긴 것이고, npm run verify 가 다시 실행해서 같은지 확인한다.
 */
export const CODE_LESSONS: SeedSet[] = [
  // ─────────────────────────── 변수와 문자열 (입문) ───────────────────────────
  {
    id: "set-greeting",
    track: "code",
    title: "인사말 만들기",
    concepts: ["variables", "let-const", "data-types", "operators"],
    code: `let name = "민지";
let age = 20;
age = age + 1;

const greeting = name + "님은 " + age + "살";

console.log(greeting);
console.log(typeof age);`,
    output: "민지님은 21살\nnumber",
    questions: [
      {
        id: "greeting-overview",
        type: "multiple_choice",
        stage: "overview",
        skill: "analyze",
        prompt: "코드를 처음부터 끝까지 훑어보세요. 이 코드는 전체적으로 무엇을 하나요?",
        choices: [
          { text: "이름과 나이로 인사 문장을 만들어 출력하고, 나이 값의 종류를 확인한다" },
          { text: "사용자에게 이름과 나이를 입력받는다", misconception: "변수에 값을 넣는 것을 입력받기로 생각" },
          { text: "나이가 20살 이상인지 검사한다", misconception: "조건문이 없는데 비교를 한다고 생각" },
          { text: "나이를 문자열로 바꿔서 저장한다", misconception: "문자열과 이어 붙이면 원래 변수의 타입이 바뀐다고 생각" },
        ],
        answerIndex: 0,
        hints: [
          "변수를 만드는 줄, 값을 바꾸는 줄, 출력하는 줄로 나눠 보세요.",
          "console.log 가 두 번 있어요. 각각 무엇을 출력하나요?",
        ],
        explanation: `1~3번째 줄에서 이름과 나이를 준비하고(나이는 1 증가),
5번째 줄에서 인사 문장을 만들어요.
7~8번째 줄은 그 문장과 age 의 종류(typeof)를 출력해요.`,
        keyPoint: "전체 흐름: 값 준비 → 문장 만들기 → 출력",
      },
      {
        id: "greeting-trace",
        type: "trace",
        stage: "trace",
        skill: "predict",
        prompt: "강조된 줄이 실행된 직후 값이 어떻게 되는지 따라가 보세요.",
        watch: [{ line: 3, ask: ["age"] }, { line: 5, ask: ["greeting"] }],
        rows: [
          { line: 3, when: "after", context: "", expr: "age", value: "21" },
          { line: 5, when: "after", context: "", expr: "greeting", value: "'민지님은 21살'" },
        ],
        hints: [
          "3번째 줄은 age 의 지금 값에 1을 더해서 다시 넣어요.",
          "5번째 줄은 바뀐 age 로 문장을 만들어요. 문자열과 숫자를 + 하면 이어 붙여져요.",
        ],
        explanation: "3번째 줄: age 는 20 → 21\n5번째 줄: \"민지\" + \"님은 \" + 21 + \"살\" → '민지님은 21살'",
        keyPoint: "값은 위에서 아래로, 바뀐 뒤의 값으로 계속 쓰여요",
      },
      {
        id: "greeting-predict",
        type: "predict_output",
        stage: "wrapup",
        skill: "predict",
        prompt: "이 코드의 실행 결과를 입력해 보세요. (한 줄에 하나씩)",
        output: "민지님은 21살\nnumber",
        hints: [
          "age 의 값은 몇 번 바뀌나요? greeting 을 만들 때 age 는 몇일까요?",
          "3번째 줄에서 age 가 바뀐 뒤에 greeting 이 만들어져요.",
          "문자열 + 숫자는 이어 붙이기가 돼요. typeof 는 값의 종류를 알려줘요.",
          "greeting 은 \"민지\" + \"님은 \" + 21 + \"살\" 이에요. age 자체의 종류는 바뀌지 않았어요.",
        ],
        explanation: `age 는 20 → 21 로 바뀌어요.
greeting 은 "민지" + "님은 " + 21 + "살" → "민지님은 21살" 이에요.
문자열과 이어 붙였어도 age 변수 자체는 여전히 숫자라서 typeof age 는 number 예요.`,
        keyPoint: "문자열과 + 하면 이어 붙이기, 하지만 원래 변수의 타입은 그대로",
      },
      {
        id: "greeting-blank",
        type: "fill_blank",
        stage: "key",
        skill: "recall",
        prompt: "age 를 나중에 바꿀 수 있으려면 빈칸에 무엇이 들어가야 할까요?",
        blankedCode: `let name = "민지";
____ age = 20;
age = age + 1;`,
        choices: [
          { text: "let" },
          { text: "const", misconception: "const 변수도 다시 대입할 수 있다고 생각" },
          { text: "age" },
          { text: "number" },
        ],
        answerIndex: 0,
        hints: [
          "3번째 줄은 age 에 무엇을 하나요?",
          "age 에 새 값을 '다시 대입'하고 있어요.",
          "let 은 다시 대입할 수 있고, const 는 다시 대입할 수 없어요.",
          "값이 바뀌는 변수에 맞는 키워드를 고르세요.",
        ],
        explanation: `3번째 줄 age = age + 1 은 age 에 새 값을 다시 대입해요.
const 로 만들면 이 줄에서 TypeError 가 나요. 다시 대입할 변수는 let 으로 만들어요.`,
        keyPoint: "다시 대입할 변수는 let",
      },
      {
        id: "greeting-explain",
        type: "short_answer",
        stage: "wrapup",
        skill: "analyze",
        prompt: "greeting 이 \"민지님은 20살\"이 아니라 \"민지님은 21살\"이 되는 이유를 설명해 주세요.",
        rubric: [
          { label: "age 가 21로 바뀜", keywords: ["21", "1을 더", "1 더", "+ 1", "+1", "증가", "늘어"] },
          { label: "실행 순서", keywords: ["먼저", "다음", "후에", "뒤에", "순서", "3번째", "위에서"] },
        ],
        misconceptions: [
          {
            label: "const 와 let 을 혼동",
            keywords: ["const", "바꿀 수 없"],
            correction: "age 는 let 으로 만들어서 다시 대입할 수 있어요. 다시 대입이 막히는 건 const 예요.",
          },
        ],
        modelAnswer:
          "3번째 줄에서 age 에 1을 더해 21로 바꾼 뒤, 5번째 줄에서 greeting 을 만들기 때문이에요. 코드는 위에서 아래로 실행되므로 greeting 을 만들 때 age 는 이미 21이에요.",
        hints: [
          "greeting 이 만들어지는 순간, age 에는 어떤 값이 들어 있나요?",
          "3번째 줄과 5번째 줄 중 무엇이 먼저 실행되나요?",
          "코드는 위에서 아래로 한 줄씩 실행돼요.",
          "'age 가 언제 21이 되는지'와 'greeting 이 언제 만들어지는지'를 연결해서 설명해 보세요.",
        ],
        explanation: `코드는 위에서 아래로 실행돼요.
3번째 줄에서 age 가 21이 되고, 그 다음 5번째 줄에서 greeting 을 만들어요.
그래서 greeting 에는 21이 들어가요.`,
        keyPoint: "변수의 값은 '그 줄이 실행되는 순간'의 값",
      },
    ],
  },

  // ─────────────────────────── 함수 + 조건문 (기초) ───────────────────────────
  {
    id: "set-grade",
    track: "code",
    title: "점수로 등급 매기기",
    concepts: ["functions", "params-return", "if-else"],
    code: `function getGrade(score) {
  if (score >= 90) {
    return "A";
  } else if (score >= 70) {
    return "B";
  }
  return "C";
}

console.log(getGrade(95));
console.log(getGrade(70));
console.log(getGrade(42));`,
    output: "A\nB\nC",
    questions: [
      {
        id: "grade-overview",
        type: "multiple_choice",
        stage: "overview",
        skill: "analyze",
        prompt: "코드를 처음부터 끝까지 훑어보세요. 이 코드는 전체적으로 무엇을 하나요?",
        choices: [
          { text: "점수를 받아 구간에 따라 등급(A·B·C)을 돌려주는 함수를 만들고, 세 점수의 등급을 출력한다" },
          { text: "세 점수의 평균을 구한다", misconception: "함수 호출 여러 번을 하나의 계산으로 생각" },
          { text: "90점 이상인 점수만 골라낸다", misconception: "if 를 고르기(filter)로 생각" },
          { text: "등급을 입력받아 점수로 바꾼다", misconception: "함수의 입력과 출력 방향을 반대로 생각" },
        ],
        answerIndex: 0,
        hints: [
          "1~8번째 줄과 10~12번째 줄은 하는 일이 달라요.",
          "function 으로 만든 것은 무엇이고, 아래에서 그것을 어떻게 쓰나요?",
        ],
        explanation: `1~8번째 줄은 점수(score)에 따라 "A", "B", "C" 중 하나를 돌려주는 함수 getGrade 를 만들어요.
10~12번째 줄에서 95, 70, 42 로 함수를 불러 결과를 출력해요.`,
        keyPoint: "함수 정의(만들기)와 호출(쓰기)을 나눠서 읽기",
      },
      {
        id: "grade-trace",
        type: "trace",
        stage: "trace",
        skill: "predict",
        prompt: "getGrade 가 불릴 때마다 2번째 줄의 조건이 참(true)인지 거짓(false)인지 따라가 보세요.",
        watch: [{ line: 2, when: "before", given: ["score"], ask: ["score >= 90"] }],
        rows: [
          { line: 2, when: "before", context: "score = 95", expr: "score >= 90", value: "true" },
          { line: 2, when: "before", context: "score = 70", expr: "score >= 90", value: "false" },
          { line: 2, when: "before", context: "score = 42", expr: "score >= 90", value: "false" },
        ],
        hints: [
          "10~12번째 줄에서 getGrade 를 세 번 불러요. 그때마다 score 는 무엇인가요?",
          "score >= 90 은 score 가 90 이상이면 true 예요.",
        ],
        explanation: "95 >= 90 → true (\"A\" 를 돌려줌)\n70 >= 90 → false (다음 조건으로)\n42 >= 90 → false (다음 조건으로)",
        keyPoint: "함수는 부를 때마다 매개변수 값이 새로 정해져요",
      },
      {
        id: "grade-predict",
        type: "predict_output",
        stage: "wrapup",
        skill: "predict",
        prompt: "세 줄의 출력 결과를 입력해 보세요.",
        output: "A\nB\nC",
        hints: [
          "getGrade 를 세 번 호출해요. 각각 score 에는 어떤 값이 들어가나요?",
          "70 은 score >= 70 을 만족할까요? 경계값을 조심하세요.",
          "return 을 만나면 함수는 그 값을 돌려주고 바로 끝나요.",
          "95, 70, 42 각각이 처음으로 만족하는 조건을 찾아보세요.",
        ],
        explanation: `getGrade(95): 95 >= 90 → "A"
getGrade(70): 70 >= 90 거짓, 70 >= 70 참 → "B"
getGrade(42): 두 조건 모두 거짓 → 아래의 return "C"`,
        keyPoint: ">= 는 경계값을 포함해요",
      },
      {
        id: "grade-role",
        type: "multiple_choice",
        stage: "key",
        skill: "analyze",
        prompt: '강조된 7번째 줄 return "C"; 는 언제 실행될까요?',
        focusLines: [7],
        choices: [
          { text: "위의 두 조건이 모두 거짓일 때만" },
          { text: "함수를 호출할 때마다 항상", misconception: "앞에서 return 해도 함수가 계속 실행된다고 생각" },
          { text: "score 가 70 일 때" },
          { text: "실행되지 않는다" },
        ],
        answerIndex: 0,
        hints: [
          "앞의 if 와 else if 블록 안에는 무엇이 있나요?",
          "두 블록 모두 return 으로 끝나요.",
          "return 을 만나면 함수는 즉시 끝나서, 아래 줄까지 내려오지 않아요.",
          "7번째 줄까지 내려오려면 어떤 return 도 실행되지 않아야 해요.",
        ],
        explanation: `if 나 else if 조건이 참이면 그 안의 return 에서 함수가 끝나요.
두 조건이 모두 거짓일 때만 7번째 줄까지 내려와서 "C" 를 돌려줘요.
그래서 else 를 쓰지 않아도 '그 외의 경우' 역할을 해요.`,
        keyPoint: "앞에서 return 하면 아래 코드는 실행되지 않아요",
      },
      {
        id: "grade-explain",
        type: "short_answer",
        stage: "wrapup",
        skill: "analyze",
        prompt: "getGrade(70) 이 \"B\" 를 돌려주는 과정을 설명해 주세요.",
        rubric: [
          { label: "첫 조건 거짓", keywords: ["90", "거짓", "false", "만족하지", "통과하지", "아니"] },
          { label: ">= 70 참", keywords: [">= 70", ">=70", "70 이상", "70이상", "크거나 같", "같으므로", "같아서"] },
          { label: "return 으로 B", keywords: ["return", "반환", "돌려"] },
        ],
        misconceptions: [
          {
            label: ">= 가 경계값을 포함하지 않는다고 생각",
            keywords: ["70", "초과"],
            correction: ">= 는 '크거나 같다' 라서 70 도 포함해요.",
          },
        ],
        modelAnswer:
          "score 에 70이 들어가요. 70 >= 90 은 거짓이라 넘어가고, 70 >= 70 은 같으므로 참이에요. 그래서 return \"B\" 가 실행되고 함수가 끝나요.",
        hints: [
          "score 에는 어떤 값이 들어가나요?",
          "첫 번째 조건과 두 번째 조건을 차례로 확인해 보세요.",
          ">= 는 같을 때도 참이에요.",
          "'90 이상인가? → 아니다', '70 이상인가? → 그렇다', '그래서 무엇을 반환?' 순서로 적어보세요.",
        ],
        explanation: `score 는 70 이에요.
70 >= 90 → 거짓이므로 첫 블록은 건너뛰어요.
70 >= 70 → 같으므로 참! return "B" 로 "B" 를 돌려주고 끝나요.`,
        keyPoint: "조건문은 위에서부터 차례로 확인",
      },
    ],
  },

  // ─────────────────────────── 반복문 + 객체 (초급) ───────────────────────────
  {
    id: "set-cart",
    track: "code",
    title: "장바구니 합계",
    concepts: ["for", "objects", "arrays", "operators"],
    code: `const cart = [
  { name: "펜", price: 1000, qty: 3 },
  { name: "노트", price: 2500, qty: 2 },
  { name: "지우개", price: 500, qty: 4 },
];

let total = 0;

for (const item of cart) {
  total += item.price * item.qty;
}

console.log(total);`,
    output: "10000",
    questions: [
      {
        id: "cart-overview",
        type: "multiple_choice",
        stage: "overview",
        skill: "analyze",
        prompt: "코드를 처음부터 끝까지 훑어보세요. 이 코드는 전체적으로 무엇을 하나요?",
        choices: [
          { text: "장바구니의 상품마다 가격×수량을 더해 총 금액을 계산하고 출력한다" },
          { text: "가장 비싼 상품을 찾는다", misconception: "반복문이 항상 최댓값을 찾는다고 생각" },
          { text: "장바구니에 담긴 상품 개수를 센다", misconception: "total 이 개수를 센다고 생각" },
          { text: "수량이 3개 이상인 상품만 고른다", misconception: "반복문 안에 조건이 있다고 생각" },
        ],
        answerIndex: 0,
        hints: [
          "total 은 어떤 값에서 시작해서 어떻게 바뀌나요?",
          "10번째 줄에서 total 에 더하는 값은 무엇인가요?",
        ],
        explanation: `7번째 줄에서 total 을 0 으로 시작하고,
9~11번째 줄의 반복문이 상품마다 가격 × 수량을 total 에 더해요.
마지막에 총 금액을 출력해요.`,
        keyPoint: "누적 패턴: 0 에서 시작해 반복하며 더하기",
      },
      {
        id: "cart-trace",
        type: "trace",
        stage: "trace",
        skill: "predict",
        prompt: "반복할 때마다 10번째 줄이 실행된 직후 total 이 얼마인지 적어 보세요.",
        watch: [{ line: 10, given: ["item.name"], ask: ["total"] }],
        rows: [
          { line: 10, when: "after", context: "item.name = '펜'", expr: "total", value: "3000" },
          { line: 10, when: "after", context: "item.name = '노트'", expr: "total", value: "8000" },
          { line: 10, when: "after", context: "item.name = '지우개'", expr: "total", value: "10000" },
        ],
        hints: [
          "total 은 0 에서 시작해요. 펜은 1000원 × 3개예요.",
          "매번 '지금 total + 가격 × 수량' 을 계산해요.",
        ],
        explanation: "펜: 0 + 1000 × 3 = 3000\n노트: 3000 + 2500 × 2 = 8000\n지우개: 8000 + 500 × 4 = 10000",
        keyPoint: "누적: 이전 값에 더해 가기",
      },
      {
        id: "cart-predict",
        type: "predict_output",
        stage: "wrapup",
        skill: "predict",
        prompt: "출력되는 total 값을 입력해 보세요.",
        output: "10000",
        hints: [
          "for 반복문 안에서 total 은 매번 어떻게 바뀌나요?",
          "각 상품마다 price × qty 를 total 에 더해요.",
          "+= 는 '기존 값에 더해서 다시 저장'이에요.",
          "1000×3, 2500×2, 500×4 를 모두 더해 보세요.",
        ],
        explanation: `펜: 1000 × 3 = 3000 → total 3000
노트: 2500 × 2 = 5000 → total 8000
지우개: 500 × 4 = 2000 → total 10000`,
        keyPoint: "+= 로 반복하며 누적",
      },
      {
        id: "cart-loop-count",
        type: "multiple_choice",
        stage: "key",
        skill: "recall",
        prompt: "for 반복문의 본문(10번째 줄)은 몇 번 실행될까요?",
        focusLines: [9, 10, 11],
        choices: [
          { text: "1번" },
          { text: "3번" },
          { text: "4번", misconception: "배열의 마지막 인덱스 다음까지 반복한다고 생각" },
          { text: "6번", misconception: "객체의 속성 개수만큼 반복한다고 생각" },
        ],
        answerIndex: 1,
        hints: [
          "for (const item of cart) 는 무엇을 하나씩 꺼내나요?",
          "cart 배열에는 요소가 몇 개 있나요?",
          "for...of 는 배열의 요소 개수만큼 반복해요.",
          "펜, 노트, 지우개를 세어 보세요.",
        ],
        explanation: `for (const item of cart) 는 cart 의 요소를 하나씩 item 에 담아 반복해요.
cart 에는 객체가 3개 있으므로 본문은 3번 실행돼요.`,
        keyPoint: "for...of = 배열 요소를 하나씩 꺼내 반복",
      },
      {
        id: "cart-flow",
        type: "short_answer",
        stage: "wrapup",
        skill: "synthesize",
        prompt: "total 이 0 에서 10000 이 되기까지의 실행 흐름을 단계별로 설명해 주세요.",
        rubric: [
          { label: "0 에서 시작", keywords: ["0에서", "0부터", "0으로", "처음", "시작"] },
          { label: "상품마다 반복", keywords: ["반복", "하나씩", "각", "마다", "for"] },
          { label: "가격 × 수량", keywords: ["곱", "×", "*", "price", "가격"] },
          { label: "누적해서 더함", keywords: ["더해", "더하", "누적", "+=", "합"] },
        ],
        misconceptions: [
          {
            label: "total 이 매번 새로 계산된다고 생각",
            keywords: ["덮어"],
            correction: "+= 는 덮어쓰지 않고 기존 값에 더해요.",
          },
        ],
        modelAnswer:
          "total 은 0 에서 시작해요. for 반복문이 cart 의 상품을 하나씩 꺼내서, 가격 × 수량을 total 에 더해요. 펜 3000 → 8000 → 지우개까지 더해 10000 이 되고, 반복이 끝난 뒤 출력돼요.",
        hints: [
          "total 의 처음 값은 무엇인가요?",
          "반복문이 한 번 돌 때마다 total 에 무엇이 더해지나요?",
          "+= 는 이전 값을 유지한 채 더해요.",
          "'처음 값 → 반복마다 하는 일 → 최종 값' 순서로 적어보세요.",
        ],
        explanation: `total = 0 에서 시작
펜: +3000 → 3000
노트: +5000 → 8000
지우개: +2000 → 10000
반복이 끝나고 10000 출력`,
        keyPoint: "초기값 → 반복마다 누적 → 최종값",
      },
    ],
  },

  // ─────────────────────────── filter + 객체 배열 (초급) ───────────────────────────
  {
    id: "set-adults",
    track: "code",
    title: "성인 사용자 골라내기",
    concepts: ["filter", "objects", "arrow-functions"],
    code: `const users = [
  { name: "Kim", age: 25 },
  { name: "Lee", age: 17 },
  { name: "Park", age: 31 },
];

const adults = users.filter(user => user.age >= 20);

console.log(adults);`,
    output: "[{name: 'Kim', age: 25}, {name: 'Park', age: 31}]",
    questions: [
      {
        id: "adults-overview",
        type: "multiple_choice",
        stage: "overview",
        skill: "analyze",
        prompt: "코드를 처음부터 끝까지 훑어보세요. 이 코드는 전체적으로 무엇을 하나요?",
        choices: [
          { text: "사용자 목록에서 20살 이상인 사람만 골라 새 배열로 만들어 출력한다" },
          { text: "모든 사용자의 나이를 20살로 바꾼다", misconception: "filter 가 배열의 값을 변경한다고 생각" },
          { text: "20살 미만인 사용자를 원래 목록에서 지운다", misconception: "filter 가 원본 배열을 수정한다고 생각" },
          { text: "사용자가 몇 명인지 센다", misconception: "filter 가 개수를 센다고 생각" },
        ],
        answerIndex: 0,
        hints: [
          "users 와 adults 는 각각 무엇을 담고 있나요?",
          "7번째 줄의 조건 user.age >= 20 은 무엇을 확인하나요?",
        ],
        explanation: `1~5번째 줄은 사용자 데이터예요.
7번째 줄에서 filter 로 20살 이상인 사용자만 골라 새 배열 adults 를 만들고,
9번째 줄에서 출력해요. users 는 그대로예요.`,
        keyPoint: "데이터 → 고르기(filter) → 출력",
      },
      {
        id: "adults-trace",
        type: "trace",
        stage: "trace",
        skill: "analyze",
        prompt: "7번째 줄이 실행된 직후 두 배열의 길이를 적어 보세요.",
        watch: [{ line: 7, ask: ["adults.length", "users.length"] }],
        rows: [
          { line: 7, when: "after", context: "", expr: "adults.length", value: "2" },
          { line: 7, when: "after", context: "", expr: "users.length", value: "3" },
        ],
        hints: [
          "adults 에는 조건(age >= 20)을 통과한 사용자만 들어가요.",
          "filter 는 원래 배열 users 를 바꾸지 않아요.",
        ],
        explanation: "adults: Kim(25), Park(31) 만 통과 → 2\nusers: 그대로 3명 → 3",
        keyPoint: "filter 는 새 배열, 원본은 그대로",
      },
      {
        id: "adults-predict",
        type: "predict_output",
        stage: "wrapup",
        skill: "predict",
        prompt: "실행 결과를 입력해 보세요. (객체는 {name: 'Kim', age: 25} 형태로)",
        output: "[{name: 'Kim', age: 25}, {name: 'Park', age: 31}]",
        hints: [
          "adults 는 배열일까요, 하나의 객체일까요?",
          "filter 는 통과한 요소를 '그대로' 새 배열에 담아요.",
          "요소 자체를 바꾸지 않으니 객체의 모양도 그대로예요.",
          "Kim 과 Park 객체가 담긴 배열을 적어보세요.",
        ],
        explanation: `filter 는 조건을 통과한 객체를 그대로 담은 새 배열을 돌려줘요.
그래서 Kim, Park 객체 두 개가 담긴 배열이 출력돼요.`,
        keyPoint: "filter 결과는 항상 배열",
      },
      {
        id: "adults-role",
        type: "multiple_choice",
        stage: "key",
        skill: "analyze",
        prompt: "이 코드에서 filter() 는 어떤 역할을 할까요?",
        focusLines: [7],
        choices: [
          { text: "users 배열에서 나이가 20 이상인 사용자만 골라 새 배열을 만든다" },
          { text: "users 배열의 나이를 20 이상으로 바꾼다", misconception: "filter 가 배열의 값을 변경한다고 생각" },
          { text: "users 배열에서 20 미만인 사용자를 삭제한다", misconception: "filter 가 원본 배열을 수정한다고 생각" },
          { text: "나이가 20 이상인지 true/false 배열을 만든다", misconception: "map과 filter를 혼동" },
        ],
        answerIndex: 0,
        hints: [
          "filter 를 실행한 뒤에도 users 배열은 그대로일까요?",
          "결과는 adults 라는 '새' 변수에 담겨요.",
          "filter 는 원본을 바꾸지 않고, 조건을 통과한 요소로 새 배열을 만들어요.",
          "'바꾼다', '삭제한다' 같은 표현이 맞는지 생각해 보세요.",
        ],
        explanation: `filter 는 원본 users 를 바꾸지도, 지우지도 않아요.
조건(user.age >= 20)을 통과한 요소만 모아 '새 배열'을 만들고, 그것이 adults 에 담겨요.`,
        keyPoint: "filter 는 원본을 바꾸지 않고 새 배열을 만든다",
      },
      {
        id: "adults-explain",
        type: "short_answer",
        stage: "wrapup",
        skill: "analyze",
        prompt: "adults 변수가 만들어지는 과정을 설명해 주세요.",
        rubric: [
          { label: "filter 로 고름", keywords: ["filter", "골라", "고르", "걸러", "추려", "선택"] },
          { label: "조건 (20 이상)", keywords: ["20", "조건", "이상", ">="] },
          { label: "새로운 배열", keywords: ["새로운 배열", "새 배열", "새배열", "새로운배열", "배열을 만", "배열로", "배열에"] },
        ],
        misconceptions: [
          {
            label: "filter 가 배열의 값을 변경한다고 생각",
            keywords: ["filter", "변경"],
            correction: "filter() 는 기존 배열의 값을 변경하지 않고, 조건을 만족하는 요소를 골라 새로운 배열을 만들어요.",
          },
          {
            label: "filter 가 배열의 값을 변경한다고 생각",
            keywords: ["값을 바꾸"],
            correction: "filter() 는 값을 바꾸지 않아요. 값을 바꾸는(변환하는) 건 map() 이에요.",
          },
          {
            label: "filter 가 원본 배열에서 삭제한다고 생각",
            keywords: ["삭제"],
            correction: "filter() 는 원본 users 를 건드리지 않아요. 통과한 요소로 새 배열을 만들 뿐이에요.",
          },
        ],
        modelAnswer:
          "users 배열에 filter 를 사용해서, 각 사용자의 age 가 20 이상인지 확인해요. 조건을 만족하는 Kim 과 Park 만 골라 새로운 배열을 만들고, 그 배열이 adults 에 저장돼요.",
        hints: [
          "users 에 어떤 메서드를 사용하나요? 그 메서드는 무엇을 하나요?",
          "user => user.age >= 20 은 어떤 조건인가요?",
          "filter 는 조건이 true 인 요소만 모아 '새 배열'을 만들어요.",
          "'무엇을 사용해서', '어떤 조건으로', '결과는 무엇' 세 가지를 담아 설명해 보세요.",
        ],
        explanation: `users.filter(...) 가 각 사용자에 대해 user.age >= 20 을 확인해요.
조건을 통과한 Kim(25), Park(31) 만 모아 새 배열을 만들어요.
그 새 배열이 adults 에 저장돼요. users 는 그대로예요.`,
        keyPoint: "filter = 조건으로 골라 새 배열",
      },
    ],
  },

  // ─────────────────────────── map + 템플릿 문자열 (초급) ───────────────────────────
  {
    id: "set-labels",
    track: "code",
    title: "상품 라벨 만들기",
    concepts: ["map", "strings", "arrow-functions"],
    code: `const prices = [1000, 2500, 4000];

const labels = prices.map((price, i) => \`\${i + 1}번 상품: \${price}원\`);

console.log(labels.length);
console.log(labels[1]);`,
    output: "3\n2번 상품: 2500원",
    questions: [
      {
        id: "labels-overview",
        type: "multiple_choice",
        stage: "overview",
        skill: "analyze",
        prompt: "코드를 처음부터 끝까지 훑어보세요. 이 코드는 전체적으로 무엇을 하나요?",
        choices: [
          { text: "가격마다 '번호 + 가격' 라벨 문자열을 만든 뒤, 라벨 개수와 두 번째 라벨을 출력한다" },
          { text: "가격의 합계를 구한다", misconception: "map 과 reduce 를 혼동" },
          { text: "1000원보다 비싼 상품만 고른다", misconception: "map 과 filter 를 혼동" },
          { text: "가격을 반올림해서 원래 배열에 다시 저장한다", misconception: "map 이 원본 배열을 바꾼다고 생각" },
        ],
        answerIndex: 0,
        hints: [
          "3번째 줄의 map 은 가격 하나를 무엇으로 바꾸나요?",
          "5~6번째 줄은 labels 의 무엇을 출력하나요?",
        ],
        explanation: `1번째 줄의 가격 3개를 3번째 줄에서 map 으로 "1번 상품: 1000원" 같은 문자열로 하나씩 바꿔 labels 에 담아요.
5번째 줄은 라벨 개수(3), 6번째 줄은 두 번째 라벨을 출력해요.`,
        keyPoint: "map = 하나씩 바꿔 같은 개수의 새 배열",
      },
      {
        id: "labels-trace",
        type: "trace",
        stage: "trace",
        skill: "predict",
        prompt: "3번째 줄이 실행된 직후 labels 의 길이와 첫 번째 요소를 적어 보세요.",
        watch: [{ line: 3, ask: ["labels.length", "labels[0]"] }],
        rows: [
          { line: 3, when: "after", context: "", expr: "labels.length", value: "3" },
          { line: 3, when: "after", context: "", expr: "labels[0]", value: "'1번 상품: 1000원'" },
        ],
        hints: [
          "map 은 요소마다 하나씩 바꿔요. 요소가 3개면 결과도 3개예요.",
          "첫 번째 요소는 i 가 0, price 가 1000 일 때 만든 문자열이에요.",
        ],
        explanation: "map 결과의 길이 = 원래 배열의 길이 3\nlabels[0] = `${0 + 1}번 상품: ${1000}원` → '1번 상품: 1000원'",
        keyPoint: "map = 같은 개수의 새 배열",
      },
      {
        id: "labels-predict",
        type: "predict_output",
        stage: "wrapup",
        skill: "predict",
        prompt: "두 줄의 실행 결과를 입력해 보세요.",
        output: "3\n2번 상품: 2500원",
        hints: [
          "map 의 결과 배열은 원래 배열과 길이가 같을까요?",
          "콜백의 두 번째 매개변수 i 는 무엇일까요?",
          "map 콜백은 (요소, 인덱스) 를 받아요. 인덱스는 0부터예요.",
          "labels[1] 은 두 번째 요소예요. 그때 price 와 i 는?",
        ],
        explanation: `map 은 요소 수만큼 변환하므로 labels.length 는 3 이에요.
labels[1] 은 price = 2500, i = 1 일 때 만든 값 → \`\${1 + 1}번 상품: 2500원\` = "2번 상품: 2500원"`,
        keyPoint: "map 결과의 길이 = 원래 배열의 길이",
      },
      {
        id: "labels-index-role",
        type: "multiple_choice",
        stage: "key",
        skill: "analyze",
        prompt: "콜백의 두 번째 매개변수 i 에는 무엇이 들어갈까요?",
        focusLines: [3],
        choices: [
          { text: "현재 요소의 인덱스 (0, 1, 2)" },
          { text: "현재 요소의 번호 (1, 2, 3)", misconception: "인덱스가 1부터 시작한다고 생각" },
          { text: "배열의 길이" },
          { text: "이전 콜백의 결과", misconception: "map 과 reduce 를 혼동" },
        ],
        answerIndex: 0,
        hints: [
          "코드에서 i 를 어떻게 쓰고 있나요? 왜 i + 1 을 했을까요?",
          "map 콜백은 요소 다음에 무언가를 하나 더 받아요.",
          "두 번째 인자는 현재 요소의 인덱스예요. 인덱스는 0부터 시작해요.",
          "i + 1 을 한 이유가 '1번부터 표시하기 위해서'라면 i 는 몇부터일까요?",
        ],
        explanation: `map 콜백은 (현재 요소, 인덱스, 배열) 을 받아요.
i 는 0, 1, 2 순서의 인덱스라서, 사람이 읽기 좋게 1부터 표시하려고 i + 1 을 써요.`,
        keyPoint: "map((요소, 인덱스) => ...)",
      },
      {
        id: "labels-explain",
        type: "short_answer",
        stage: "wrapup",
        skill: "analyze",
        prompt: "labels 배열이 어떻게 만들어지는지 설명해 주세요.",
        rubric: [
          { label: "map 으로 변환", keywords: ["map", "변환", "바꿔", "바꾸"] },
          { label: "요소마다 실행", keywords: ["각", "하나씩", "마다", "모든"] },
          { label: "문자열로 만듦", keywords: ["문자열", "글자", "번 상품", "라벨", "템플릿", "`"] },
        ],
        misconceptions: [
          {
            label: "map 이 원본 배열을 바꾼다고 생각",
            keywords: ["prices", "바뀌"],
            correction: "map 은 prices 를 바꾸지 않고 새 배열을 만들어요.",
          },
        ],
        modelAnswer:
          "prices 배열에 map 을 사용해서 각 가격과 인덱스를 받아, \"번호번 상품: 가격원\" 형태의 문자열로 바꿔요. 바꾼 문자열 3개가 담긴 새 배열이 labels 가 돼요.",
        hints: [
          "prices 에 어떤 메서드를 썼나요?",
          "콜백은 각 가격을 무엇으로 바꾸나요?",
          "map 은 콜백이 돌려준 값으로 새 배열을 만들어요.",
          "'무엇을', '어떻게 바꿔서', '결과는' 순서로 설명해 보세요.",
        ],
        explanation: `prices.map 은 가격을 하나씩 콜백에 넣어요.
콜백은 템플릿 문자열로 "1번 상품: 1000원" 같은 문자열을 만들어 돌려줘요.
돌려받은 문자열 3개로 새 배열을 만들어 labels 에 담아요.`,
        keyPoint: "map 은 각 요소를 변환한 새 배열",
      },
    ],
  },

  // ─────────────────────────── 데이터 파이프라인 (심화) ───────────────────────────
  {
    id: "set-pipeline",
    track: "code",
    title: "점수 보정과 평균",
    level: 5,
    concepts: ["filter", "map", "reduce", "arrow-functions"],
    code: `const scores = [72, 95, 58, 88, 64];

const passed = scores.filter(s => s >= 60);
const curved = passed.map(s => Math.min(s + 5, 100));
const average = curved.reduce((sum, s) => sum + s, 0) / curved.length;

console.log(passed.length);
console.log(curved);
console.log(average);`,
    output: "4\n[77, 100, 93, 69]\n84.75",
    questions: [
      {
        id: "pipeline-overview",
        type: "multiple_choice",
        stage: "overview",
        skill: "analyze",
        prompt: "코드를 처음부터 끝까지 훑어보세요. 이 코드는 전체적으로 무엇을 하나요?",
        choices: [
          { text: "60점 이상인 점수만 골라 5점씩 올리고(최대 100점) 그 평균을 구해 출력한다" },
          { text: "모든 점수를 5점씩 올려 평균을 구한다", misconception: "filter 단계를 건너뛰고 읽음" },
          { text: "60점 미만인 점수를 60점으로 올린다", misconception: "filter 가 값을 바꾼다고 생각" },
          { text: "가장 높은 점수를 찾는다", misconception: "Math.min/reduce 를 최댓값 찾기로 생각" },
        ],
        answerIndex: 0,
        hints: [
          "3·4·5번째 줄이 각각 앞 줄의 결과를 받아 다음 일을 해요.",
          "filter → map → reduce 가 각각 고르기·바꾸기·합치기 중 무엇인가요?",
        ],
        explanation: `3번째 줄: 60점 이상만 고르기(filter)
4번째 줄: 고른 점수에 5점씩 더하되 100점 넘지 않게(map)
5번째 줄: 모두 더해 개수로 나눠 평균(reduce)
7~9번째 줄에서 결과를 출력해요.`,
        keyPoint: "고르기 → 바꾸기 → 합치기 파이프라인",
      },
      {
        id: "pipeline-trace",
        type: "trace",
        stage: "trace",
        skill: "analyze",
        prompt: "3·4·5번째 줄이 실행된 직후 각 변수의 값을 적어 보세요.",
        watch: [{ line: 3, ask: ["passed"] }, { line: 4, ask: ["curved"] }, { line: 5, ask: ["average"] }],
        rows: [
          { line: 3, when: "after", context: "", expr: "passed", value: "[72, 95, 88, 64]" },
          { line: 4, when: "after", context: "", expr: "curved", value: "[77, 100, 93, 69]" },
          { line: 5, when: "after", context: "", expr: "average", value: "84.75" },
        ],
        hints: [
          "passed 는 60 이상인 점수만 남겨요 (58 은 빠져요).",
          "curved 는 passed 의 점수마다 5를 더하되 100을 넘지 않아요. average 는 합을 개수로 나눠요.",
        ],
        explanation: "passed = [72, 95, 88, 64]\ncurved = [77, 100, 93, 69]\naverage = (77 + 100 + 93 + 69) / 4 = 84.75",
        keyPoint: "고르기 → 바꾸기 → 합치기를 한 단계씩",
      },
      {
        id: "pipeline-key",
        type: "multiple_choice",
        stage: "key",
        skill: "analyze",
        prompt: "강조된 4번째 줄 passed.map(s => Math.min(s + 5, 100)) 은 어떤 역할을 할까요?",
        focusLines: [4],
        choices: [
          { text: "합격한 점수마다 5점을 더하되, 100점을 넘지 않게 한 새 배열을 만든다" },
          { text: "점수 중 100점 이하인 것만 골라낸다", misconception: "map과 filter를 혼동" },
          { text: "scores 배열의 점수를 직접 5점씩 올린다", misconception: "map 이 원본 배열을 바꾼다고 생각" },
          { text: "점수 중 가장 작은 값 하나를 찾는다", misconception: "Math.min 이 배열 전체에서 최솟값을 찾는다고 생각" },
        ],
        answerIndex: 0,
        hints: [
          "map 은 고르기인가요, 바꾸기인가요?",
          "Math.min(s + 5, 100) 은 두 값 중 작은 값이에요. 95 라면 어떻게 될까요?",
        ],
        explanation: `map 은 passed 의 점수 s 하나하나를 Math.min(s + 5, 100) 으로 바꾼 새 배열을 만들어요.
95 + 5 = 100, 100 과 100 중 작은 값 → 100 이라서 100점을 넘지 않아요.
passed 와 scores 는 바뀌지 않아요.`,
        keyPoint: "map = 하나씩 바꿔 새 배열, Math.min 으로 상한 두기",
      },
      {
        id: "pipeline-predict",
        type: "predict_output",
        stage: "wrapup",
        skill: "synthesize",
        prompt: "세 줄의 실행 결과를 입력해 보세요.",
        output: "4\n[77, 100, 93, 69]\n84.75",
        hints: [
          "데이터가 scores → passed → curved → average 로 흘러가요. 단계마다 값을 적어 볼까요?",
          "passed 에서 빠지는 점수는? curved 에서 Math.min 은 어떤 역할을 하나요?",
          "Math.min(a, b) 는 둘 중 작은 값이에요. 그래서 100 을 넘지 않아요.",
          "curved 의 합을 curved 의 개수로 나누면 평균이에요.",
        ],
        explanation: `passed: 58 만 빠져서 [72, 95, 88, 64] → 길이 4
curved: 각각 +5, 단 100 을 넘지 않게 → [77, 100, 93, 69]
average: (77 + 100 + 93 + 69) / 4 = 339 / 4 = 84.75`,
        keyPoint: "변환 단계마다 중간 값을 적어가며 따라가기",
      },
      {
        id: "pipeline-explain",
        type: "short_answer",
        stage: "wrapup",
        skill: "synthesize",
        prompt: "코드 전체의 실행 흐름과 데이터 변화를 설명해 주세요.",
        rubric: [
          { label: "filter 로 60점 미만 제외", keywords: ["filter", "60", "걸러", "제외", "골라"] },
          { label: "map 으로 5점 보정 (최대 100)", keywords: ["map", "5점", "+5", "+ 5", "더해", "100"] },
          { label: "reduce 로 합계", keywords: ["reduce", "합", "더해서", "누적"] },
          { label: "개수로 나눠 평균", keywords: ["평균", "나누", "나눠", "length", "개수"] },
        ],
        misconceptions: [
          {
            label: "map 이 조건에 맞는 요소만 고른다고 생각",
            keywords: ["map 으로 골라"],
            correction: "map 은 고르지 않고 모든 요소를 변환해요. 고르는 건 filter 예요.",
          },
        ],
        modelAnswer:
          "scores 에서 filter 로 60점 이상만 골라 passed 를 만들어요(58 제외). passed 를 map 으로 5점씩 올리되 Math.min 으로 100을 넘지 않게 해 curved 를 만들어요. curved 를 reduce 로 모두 더한 뒤 개수로 나누어 평균 84.75 를 구해요.",
        hints: [
          "변수 passed, curved, average 가 각각 무엇인지 한 문장씩 적어보세요.",
          "각 단계에서 어떤 메서드가 쓰였고, 그 메서드는 고르기/변환/누적 중 무엇인가요?",
          "filter = 고르기, map = 변환, reduce = 누적이에요.",
          "'무엇을 걸러서 → 어떻게 바꾸고 → 어떻게 합쳐 → 평균' 순서로 정리해 보세요.",
        ],
        explanation: `1) filter: 60점 이상만 → [72, 95, 88, 64]
2) map: +5, 최대 100 → [77, 100, 93, 69]
3) reduce: 합계 339
4) 개수 4 로 나눠 평균 84.75`,
        keyPoint: "고르기(filter) → 변환(map) → 누적(reduce)",
      },
    ],
  },
];

/**
 * 목업 모드에서 "AI 가 생성한 것처럼" 돌려줄 코드 세트.
 * 실제 생성과 똑같이 실행 검증·검수 단계를 거친다 (검증기는 진짜).
 * reduce 세트는 첫 번째 시도에 일부러 틀린 실행 결과를 넣어, 검증 실패 → 재생성 흐름을 확인할 수 있게 했다.
 */

type Skill = "recall" | "predict" | "analyze" | "infer" | "synthesize";

interface MockQuestion {
  type: "multiple_choice" | "short_answer" | "fill_blank" | "shuffle" | "predict_output" | "find_bug";
  skill: Skill;
  prompt: string;
  choices: { text: string; misconception: string | null }[] | null;
  answerIndex: number | null;
  blankedCode: string | null;
  pieces: string[] | null;
  output: string | null;
  buggyCode: string | null;
  bugLine: number | null;
  fixedLine: string | null;
  rubric: { label: string; keywords: string[] }[] | null;
  misconceptions: { label: string; keywords: string[]; correction: string }[] | null;
  modelAnswer: string | null;
  focusLines: number[] | null;
  hints: string[];
  explanation: string;
  keyPoint: string;
}

export interface MockSet {
  title: string;
  code: string;
  concepts: string[];
  expectedOutput: string;
  questions: MockQuestion[];
}

const EMPTY = {
  choices: null,
  answerIndex: null,
  blankedCode: null,
  pieces: null,
  output: null,
  buggyCode: null,
  bugLine: null,
  fixedLine: null,
  rubric: null,
  misconceptions: null,
  modelAnswer: null,
  focusLines: null,
};
const q = (x: Partial<MockQuestion> & Pick<MockQuestion, "type" | "skill" | "prompt" | "hints" | "explanation" | "keyPoint">): MockQuestion => ({ ...EMPTY, ...x });
const opt = (text: string, misconception: string | null = null) => ({ text, misconception });
const replaceLine = (code: string, line: number, text: string) =>
  code
    .split("\n")
    .map((l, i) => (i === line - 1 ? text : l))
    .join("\n");

// ─────────────────────────── map vs filter (중급) ───────────────────────────

const MAP_FILTER_CODE = `const prices = [1200, 800, 3000, 450];

const discounted = prices.map(p => p * 0.9);
const cheap = prices.filter(p => p < 1000);

console.log(discounted.length);
console.log(cheap);`;

const MAP_FILTER: MockSet = {
  title: "할인가와 저렴한 상품",
  code: MAP_FILTER_CODE,
  concepts: ["map", "filter", "arrow-functions"],
  expectedOutput: "4\n[800, 450]",
  questions: [
    q({
      type: "multiple_choice",
      skill: "analyze",
      prompt: "강조된 3번째 줄에서 map 은 어떤 역할을 할까요?",
      focusLines: [3],
      choices: [
        opt("모든 가격을 0.9배로 바꾼 새 배열을 만든다"),
        opt("1000원 미만인 가격만 골라낸다", "map과 filter를 혼동"),
        opt("prices 배열의 값을 직접 0.9배로 바꾼다", "map 이 원본 배열을 바꾼다고 생각"),
        opt("가격의 합계를 구한다", "map 과 reduce 를 혼동"),
      ],
      answerIndex: 0,
      hints: [
        "map 의 결과는 discounted 라는 '새' 변수에 담겨요. 원본은 어떻게 될까요?",
        "콜백 p => p * 0.9 는 값을 고르나요, 바꾸나요?",
        "map 은 모든 요소를 콜백으로 변환해서 같은 길이의 새 배열을 만들어요.",
        "'고르기'와 '바꾸기' 중 map 이 하는 일을 고르세요.",
      ],
      explanation: "map 은 prices 의 네 가격을 하나씩 0.9배로 바꿔 새 배열을 만들어요.\n원본 prices 는 그대로이고, 고르는 일은 하지 않아요.",
      keyPoint: "map 은 모든 요소를 변환한다",
    }),
    q({
      type: "predict_output",
      skill: "predict",
      prompt: "두 줄의 실행 결과를 입력해 보세요.",
      output: "4\n[800, 450]",
      hints: [
        "discounted 와 cheap 의 길이는 각각 원래 배열과 같을까요?",
        "map 은 길이가 그대로, filter 는 조건을 통과한 것만 남아요.",
        "1000 미만인 가격을 찾아보세요.",
        "800 과 450 을 확인해 보세요.",
      ],
      explanation: "map 결과는 요소 4개 그대로라 discounted.length 는 4 예요.\nfilter 는 1000 미만인 800, 450 만 남겨요.",
      keyPoint: "map 은 길이 유지, filter 는 길이가 줄 수 있음",
    }),
    q({
      type: "fill_blank",
      skill: "recall",
      prompt: "1000원 미만인 가격만 남기려면 빈칸에 어떤 메서드가 들어가야 할까요?",
      blankedCode: "const cheap = prices.____(p => p < 1000);",
      choices: [opt("filter"), opt("map", "map과 filter를 혼동"), opt("find", "find 가 조건에 맞는 요소를 모두 돌려준다고 생각"), opt("forEach")],
      answerIndex: 0,
      hints: ["하고 싶은 일은 '바꾸기'인가요, '고르기'인가요?", "결과는 여러 개가 담긴 배열이어야 해요.", "조건을 통과한 요소들을 새 배열로 돌려주는 메서드예요.", "map 을 쓰면 true/false 배열이 돼요."],
      explanation: "조건에 맞는 요소만 고르는 건 filter 예요.\nmap 은 [false, true, false, true], find 는 800 하나만, forEach 는 undefined 를 돌려줘요.",
      keyPoint: "고르기 = filter",
    }),
    q({
      type: "shuffle",
      skill: "analyze",
      prompt: "저렴한 상품 목록이 출력되도록 순서를 맞춰 보세요.",
      pieces: ["const prices = [1200, 800, 3000, 450];", "const cheap = prices.filter(p => p < 1000);", "console.log(cheap);"],
      hints: ["어떤 줄이 어떤 변수를 쓰나요?", "cheap 을 만들려면 prices 가 있어야 해요.", "선언 전에는 쓸 수 없어요.", "데이터 → 가공 → 출력"],
      explanation: "prices 를 먼저 만들고, filter 로 cheap 을 만든 뒤 출력해요.",
      keyPoint: "데이터 → 가공 → 출력",
    }),
    q({
      type: "find_bug",
      skill: "infer",
      prompt: "cheap 이 [false, true, false, true] 로 출력돼요. 어느 줄이 문제일까요?",
      buggyCode: replaceLine(MAP_FILTER_CODE, 4, "const cheap = prices.map(p => p < 1000);"),
      bugLine: 4,
      fixedLine: "const cheap = prices.filter(p => p < 1000);",
      hints: ["true/false 가 그대로 담겼다면, 콜백의 결과를 그대로 모은 거예요.", "그런 일을 하는 메서드는?", "map 은 변환, filter 는 고르기.", "4번째 줄의 메서드를 보세요."],
      explanation: "4번째 줄이 map 이라서 비교 결과(true/false)가 그대로 담겨요.\nfilter 로 바꿔야 조건을 통과한 가격만 남아요.",
      keyPoint: "map 은 변환, filter 는 고르기",
    }),
    q({
      type: "short_answer",
      skill: "infer",
      prompt: "discounted 와 cheap 의 길이가 다른 이유를 설명해 주세요.",
      rubric: [
        { label: "map 은 길이 유지", keywords: ["map", "같은 길이", "그대로", "4개", "모든"] },
        { label: "filter 는 골라냄", keywords: ["filter", "골라", "걸러", "조건"] },
        { label: "1000 미만 조건", keywords: ["1000", "미만", "작은"] },
      ],
      misconceptions: [{ label: "map 이 요소를 고른다고 생각", keywords: ["map으로 골라"], correction: "map 은 고르지 않고 모든 요소를 변환해요. 고르는 건 filter 예요." }],
      modelAnswer: "map 은 모든 요소를 변환해서 길이가 4개 그대로이고, filter 는 1000 미만인 요소만 골라서 2개가 돼요.",
      hints: ["각 메서드가 '바꾸는지' '고르는지' 생각해 보세요.", "map 결과의 길이는 원래와 같아요.", "filter 는 조건을 통과한 것만 남겨요.", "두 메서드의 차이를 길이와 연결해 설명해 보세요."],
      explanation: "map 은 4개 모두 변환하므로 길이 4.\nfilter 는 1000 미만인 800, 450 만 남겨 길이 2.",
      keyPoint: "map 은 변환(길이 유지), filter 는 고르기(길이 감소 가능)",
    }),
  ],
};

// ─────────────────────────── for + 객체 배열 (초급) ───────────────────────────

const PASS_CODE = `const students = [
  { name: "민지", score: 80 },
  { name: "준호", score: 65 },
  { name: "서연", score: 92 },
];
let passed = 0;

for (let i = 0; i < students.length; i++) {
  if (students[i].score >= 70) {
    passed++;
  }
}

console.log(passed + "명 합격");`;

const PASS_COUNT: MockSet = {
  title: "합격자 세기",
  code: PASS_CODE,
  concepts: ["for", "objects", "if-else"],
  expectedOutput: "2명 합격",
  questions: [
    q({
      type: "predict_output",
      skill: "predict",
      prompt: "실행 결과를 입력해 보세요.",
      output: "2명 합격",
      hints: ["반복문은 몇 번 돌까요?", "각 학생의 점수가 70 이상인지 확인해 보세요.", "조건을 만족할 때만 passed 가 1 늘어요.", "80, 65, 92 중 70 이상은?"],
      explanation: "민지(80) → 합격, 준호(65) → 불합격, 서연(92) → 합격\npassed 는 2 가 되고 \"2명 합격\" 이 출력돼요.",
      keyPoint: "조건을 만족할 때만 카운트 증가",
    }),
    q({
      type: "multiple_choice",
      skill: "infer",
      prompt: "준호의 점수가 70 으로 바뀌면 출력은 어떻게 될까요?",
      choices: [opt("2명 합격", ">= 가 경계값을 포함하지 않는다고 생각"), opt("3명 합격"), opt("1명 합격"), opt("70명 합격")],
      answerIndex: 1,
      hints: ["바뀐 점수가 조건을 통과하나요?", "조건은 score >= 70 이에요.", ">= 는 같을 때도 참이에요.", "통과하는 학생 수를 다시 세어 보세요."],
      explanation: "70 >= 70 은 참이라 준호도 합격해요.\n세 명 모두 통과해 \"3명 합격\" 이 돼요.",
      keyPoint: ">= 는 경계값 포함",
    }),
    q({
      type: "fill_blank",
      skill: "recall",
      prompt: "70점 이상만 합격으로 세려면 빈칸에 어떤 연산자가 들어가야 할까요?",
      blankedCode: "  if (students[i].score ____ 70) {",
      choices: [opt(">="), opt("<", "비교 방향을 반대로 읽음"), opt("==="), opt("=", "대입(=)과 비교를 혼동")],
      answerIndex: 0,
      hints: ["'70점 이상'을 연산자로 바꾸면?", "이상은 같은 값도 포함해요.", "= 하나는 비교가 아니라 대입이에요.", "크거나 같다를 나타내는 연산자예요."],
      explanation: "'70 이상'은 >= 예요.\n= 를 쓰면 점수를 70 으로 바꿔버려서 모두 합격이 돼요.",
      keyPoint: ">= 는 크거나 같다, = 는 대입",
    }),
    q({
      type: "shuffle",
      skill: "analyze",
      prompt: "70점 이상인 점수의 개수가 출력되도록 순서를 맞춰 보세요.",
      pieces: ["let passed = 0;", "for (const s of [80, 65, 92]) {", "  if (s >= 70) passed++;", "}", "console.log(passed);"],
      hints: ["카운트할 변수는 언제 만들어야 하나요?", "반복 안에서는 매번 할 일만.", "출력은 반복이 끝난 뒤에.", "준비 → 반복 → 끝 → 출력"],
      explanation: "passed 를 먼저 0 으로 만들고, 반복하며 조건에 맞으면 늘린 뒤, 반복이 끝나면 출력해요.",
      keyPoint: "반복 전 준비 → 반복 안에서 카운트 → 반복 후 출력",
    }),
    q({
      type: "find_bug",
      skill: "analyze",
      prompt: "실행하면 TypeError 가 나요. 어느 줄이 문제일까요?",
      buggyCode: replaceLine(PASS_CODE, 8, "for (let i = 0; i <= students.length; i++) {"),
      bugLine: 8,
      fixedLine: "for (let i = 0; i < students.length; i++) {",
      hints: ["에러는 students[i] 가 없는 값일 때 나요.", "i 는 어디까지 커지나요?", "학생이 3명이면 인덱스는 0, 1, 2 예요.", "반복 조건의 비교 연산자를 보세요."],
      explanation: "i <= students.length 라서 i 가 3 일 때도 반복해요.\nstudents[3] 은 undefined 라 .score 에서 TypeError 가 나요. i < students.length 로 고쳐요.",
      keyPoint: "마지막 인덱스는 length - 1",
    }),
    q({
      type: "short_answer",
      skill: "analyze",
      prompt: "passed 가 2 가 되는 과정을 설명해 주세요.",
      rubric: [
        { label: "학생을 하나씩 반복", keywords: ["반복", "하나씩", "for", "차례"] },
        { label: "70 이상 조건", keywords: ["70", "이상", "조건", ">="] },
        { label: "1씩 증가", keywords: ["++", "1씩", "증가", "늘어", "더해"] },
      ],
      misconceptions: [],
      modelAnswer: "for 반복문이 학생을 하나씩 확인하면서 점수가 70 이상이면 passed 를 1씩 증가시켜요. 민지와 서연만 조건을 만족해서 2가 돼요.",
      hints: ["반복문은 무엇을 하나씩 확인하나요?", "조건은 무엇인가요?", "조건을 만족할 때 passed 는 어떻게 되나요?", "'반복 → 조건 → 증가' 순서로 설명해 보세요."],
      explanation: "반복문이 세 학생을 차례로 확인해요.\n점수가 70 이상이면 passed++ 로 1 증가.\n민지와 서연이 통과해 2 가 돼요.",
      keyPoint: "반복 + 조건 + 카운트",
    }),
  ],
};

// ─────────────────────────── reduce + 체이닝 (중급) ───────────────────────────

const ORDER_CODE = `const orders = [
  { item: "커피", price: 4500, qty: 2 },
  { item: "케이크", price: 6000, qty: 1 },
  { item: "쿠키", price: 2000, qty: 3 },
];

const total = orders.reduce((sum, o) => sum + o.price * o.qty, 0);
const expensive = orders.filter(o => o.price * o.qty > 6000).map(o => o.item);

console.log(total);
console.log(expensive);`;

function orderSet(output: string): MockSet {
  return {
    title: "주문 합계와 큰 주문",
    code: ORDER_CODE,
    concepts: ["reduce", "filter", "map", "objects"],
    expectedOutput: output,
    questions: [
      q({
        type: "predict_output",
        skill: "predict",
        prompt: "두 줄의 실행 결과를 입력해 보세요. (배열은 ['a'] 형태로)",
        output,
        hints: ["주문마다 가격 × 수량을 먼저 계산해 보세요.", "reduce 는 그 값을 0 부터 더해요.", "filter 조건은 6000 '초과'예요.", "9000, 6000, 6000 중 6000 보다 큰 것은?"],
        explanation: "커피 9000, 케이크 6000, 쿠키 6000 → 합계 21000\n6000 을 '초과'하는 주문은 커피뿐이라 ['커피']",
        keyPoint: "> 는 경계값을 포함하지 않는다",
      }),
      q({
        type: "multiple_choice",
        skill: "analyze",
        prompt: "7번째 줄 reduce 의 마지막 인자 0 은 무엇일까요?",
        focusLines: [7],
        choices: [
          opt("sum 의 시작값"),
          opt("orders 의 첫 번째 인덱스", "reduce 의 초기값과 인덱스를 혼동"),
          opt("곱셈 결과의 기본값"),
          opt("반복 횟수"),
        ],
        answerIndex: 0,
        hints: ["reduce((누적값, 현재값) => ..., ?) 형태예요.", "첫 번째 콜백 실행 때 sum 은 무엇일까요?", "마지막 인자는 누적값의 시작값이에요.", "0 이 없으면 sum 은 첫 번째 주문 객체가 돼요."],
        explanation: "reduce 의 두 번째 인자는 누적값(sum)의 시작값이에요.\n0 에서 시작해 주문 금액을 차례로 더해요.",
        keyPoint: "reduce(콜백, 시작값)",
      }),
      q({
        type: "fill_blank",
        skill: "recall",
        prompt: "전체 주문 금액을 하나의 숫자로 합치려면 빈칸에 어떤 메서드가 들어가야 할까요?",
        blankedCode: "const total = orders.____((sum, o) => sum + o.price * o.qty, 0);",
        choices: [opt("reduce"), opt("map", "map 과 reduce 를 혼동"), opt("filter"), opt("forEach")],
        answerIndex: 0,
        hints: ["결과는 배열인가요, 숫자 하나인가요?", "값을 누적해서 하나로 합치는 메서드예요.", "(누적값, 현재값) 을 받는 콜백을 쓰는 메서드예요.", "map 은 배열을 돌려줘요."],
        explanation: "여러 값을 하나로 누적하는 건 reduce 예요.",
        keyPoint: "누적해서 하나로 = reduce",
      }),
      q({
        type: "shuffle",
        skill: "analyze",
        prompt: "합계가 출력되도록 순서를 맞춰 보세요.",
        pieces: ['const orders = [{ item: "커피", price: 4500, qty: 2 }];', "const total = orders.reduce((sum, o) => sum + o.price * o.qty, 0);", "console.log(total);"],
        hints: ["total 은 무엇을 사용하나요?", "orders 가 먼저 있어야 해요.", "선언 전에 쓸 수 없어요.", "데이터 → 계산 → 출력"],
        explanation: "orders 를 만든 뒤 reduce 로 합계를 구하고 출력해요.",
        keyPoint: "데이터 → 계산 → 출력",
      }),
      q({
        type: "find_bug",
        skill: "infer",
        prompt: "total 이 숫자가 아니라 이상한 문자열로 출력돼요. 어느 줄이 문제일까요?",
        buggyCode: replaceLine(ORDER_CODE, 7, "const total = orders.reduce((sum, o) => sum + o.price * o.qty);"),
        bugLine: 7,
        fixedLine: "const total = orders.reduce((sum, o) => sum + o.price * o.qty, 0);",
        hints: ["처음 콜백이 실행될 때 sum 에는 무엇이 들어 있을까요?", "시작값이 없으면 첫 번째 요소가 sum 이 돼요.", "객체 + 숫자는 문자열 이어 붙이기가 돼요.", "reduce 의 마지막 인자를 확인하세요."],
        explanation: "시작값 0 이 빠져서 sum 이 첫 번째 주문 객체로 시작해요.\n객체 + 숫자는 문자열이 되어 이상한 결과가 나와요. 0 을 넣어 고쳐요.",
        keyPoint: "reduce 에는 시작값을 꼭 넣기",
      }),
      q({
        type: "short_answer",
        skill: "synthesize",
        prompt: "total 이 21000 이 되는 과정을 설명해 주세요.",
        rubric: [
          { label: "0 에서 시작", keywords: ["0에서", "0부터", "시작", "처음"] },
          { label: "가격 × 수량", keywords: ["곱", "×", "*", "price", "가격"] },
          { label: "누적해서 더함", keywords: ["누적", "더해", "더하", "sum", "합"] },
        ],
        misconceptions: [{ label: "reduce 가 배열을 만든다고 생각", keywords: ["reduce", "배열을 만"], correction: "reduce 는 배열이 아니라 누적한 값 하나를 돌려줘요." }],
        modelAnswer: "sum 은 0에서 시작해서, 주문마다 가격 × 수량을 더해 누적해요. 9000 + 6000 + 6000 = 21000 이 돼요.",
        hints: ["sum 의 처음 값은?", "주문마다 무엇을 더하나요?", "콜백이 돌려준 값이 다음 sum 이 돼요.", "'시작값 → 주문마다 더하기 → 최종값' 순서로 설명해 보세요."],
        explanation: "sum = 0\n커피 +9000 → 9000\n케이크 +6000 → 15000\n쿠키 +6000 → 21000",
        keyPoint: "reduce = 시작값부터 누적",
      }),
    ],
  };
}

/** 개념별 목업 생성 결과. 배열이면 [첫 시도, 재시도] */
export const MOCK_GENERATIONS: Record<string, MockSet[]> = {
  map: [MAP_FILTER],
  filter: [MAP_FILTER],
  for: [PASS_COUNT],
  "if-else": [PASS_COUNT],
  // 첫 시도는 일부러 실행 결과를 틀리게 → 검증 실패 → 재생성에서 통과
  reduce: [orderSet("21000\n['커피', '케이크']"), orderSet("21000\n['커피']")],
};

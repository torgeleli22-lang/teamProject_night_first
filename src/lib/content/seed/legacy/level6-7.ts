import type { LegacyProblem as Problem } from "../legacy-types";

export const LEVEL_6_7: Problem[] = [
  // ───────── Level 6 · DOM ─────────
  {
    id: "dom-textcontent",
    type: "choice",
    subtype: "predict",
    conceptIds: ["dom"],
    difficulty: 1,
    runnable: false,
    prompt: "HTML에 <p id=\"msg\">안녕하세요</p> 가 있을 때, 콘솔에 무엇이 출력될까요?",
    code: `// HTML: <p id="msg">안녕하세요</p>
const msg = document.querySelector("#msg");

msg.textContent = "반가워요";

console.log(msg.textContent);`,
    choices: [
      { text: "반가워요" },
      { text: "안녕하세요", misconception: "textContent 변경이 반영되지 않는다고 생각" },
      { text: "#msg" },
      { text: "null", misconception: "#으로 id를 찾는 방법을 모름" },
    ],
    answerIndex: 0,
    output: "반가워요",
    hints: [
      'document.querySelector("#msg") 는 무엇을 찾아올까요?',
      "# 은 id를 뜻해요. msg 변수에는 <p> 요소가 담겨요.",
      "textContent에 값을 대입하면 그 요소의 글자가 바뀌어요.",
      "3번째 줄에서 바꾼 뒤에 출력하고 있어요.",
    ],
    explanation: `querySelector("#msg")는 id가 msg인 <p> 요소를 찾아요.
msg.textContent = "반가워요" 로 화면의 글자가 바뀌어요.
그 다음 textContent를 읽으면 바뀐 값 "반가워요"가 나와요.`,
    keyPoint: "querySelector 로 찾고, textContent 로 글자를 바꿔요",
  },
  {
    id: "dom-selector-bug",
    type: "bug",
    conceptIds: ["dom"],
    difficulty: 2,
    runnable: false,
    prompt: "버튼 글자를 바꾸려고 했는데 \"Cannot set properties of null\" 에러가 나요. 어느 줄이 문제일까요?",
    code: `// HTML: <button class="buy-btn">구매</button>
const button = document.querySelector("buy-btn");
button.textContent = "구매 완료";`,
    bugLine: 2,
    fixedLine: 'const button = document.querySelector(".buy-btn");',
    hints: [
      "에러 메시지의 null은 어떤 변수의 값일까요?",
      "querySelector에 넘긴 선택자와 HTML의 class를 비교해 보세요.",
      'CSS 선택자에서 class는 . 으로, id는 # 으로 시작해요. "buy-btn"은 <buy-btn> 태그를 찾아요.',
      "선택자 앞에 빠진 기호가 있어요.",
    ],
    explanation: `querySelector("buy-btn")은 class가 아니라 <buy-btn>이라는 '태그'를 찾아요.
그런 태그는 없으니 null이 돌아오고, null.textContent 에 대입하면서 에러가 나요.
class를 찾으려면 ".buy-btn" 처럼 앞에 점(.)을 붙여야 해요.`,
    keyPoint: ".클래스  #아이디  태그 — 선택자 기호를 구분해요",
  },
  {
    id: "dom-classlist",
    type: "choice",
    subtype: "concept",
    conceptIds: ["dom"],
    difficulty: 1,
    runnable: false,
    prompt: "이 코드가 하는 일로 가장 알맞은 것은?",
    code: `const title = document.querySelector("#title");

title.classList.add("highlight");`,
    choices: [
      { text: "id가 title인 요소에 highlight 클래스를 추가한다" },
      { text: "class가 title인 요소를 모두 찾는다", misconception: "#(id)과 .(class)를 혼동" },
      { text: "highlight라는 새 요소를 만든다" },
      { text: "title 요소를 화면에서 삭제한다" },
    ],
    answerIndex: 0,
    hints: [
      "#title 의 # 은 무엇을 뜻할까요?",
      "classList는 요소의 class 목록이에요. add는 무엇을 할까요?",
      "querySelector는 조건에 맞는 첫 번째 요소 '하나'를 찾고, classList.add는 class를 추가해요.",
      "요소를 만들거나 지우는 코드는 없어요.",
    ],
    explanation: `querySelector("#title")은 id가 title인 요소 하나를 찾아요.
classList.add("highlight")는 그 요소의 class 목록에 highlight를 추가해요.
보통 CSS에서 .highlight 스타일을 정해 두고, 이렇게 class를 붙여 모양을 바꿔요.`,
    keyPoint: "classList.add = 요소에 class 추가",
  },
  // ───────── Level 6 · 이벤트 ─────────
  {
    id: "event-click-order",
    type: "choice",
    subtype: "predict",
    conceptIds: ["events"],
    difficulty: 2,
    runnable: false,
    prompt: "페이지가 열린 뒤 사용자가 버튼을 두 번 클릭했어요. 콘솔에 찍힌 내용으로 알맞은 것은?",
    code: `// HTML: <button id="btn">눌러보세요</button>
const btn = document.querySelector("#btn");
let clicks = 0;

btn.addEventListener("click", () => {
  clicks++;
  console.log(\`클릭 \${clicks}번\`);
});

console.log("준비 완료");`,
    choices: [
      { text: "클릭 1번\n준비 완료\n클릭 2번", misconception: "이벤트 핸들러가 등록할 때 실행된다고 생각" },
      { text: "준비 완료\n클릭 1번\n클릭 2번" },
      { text: "준비 완료\n클릭 1번\n클릭 1번", misconception: "핸들러 밖의 변수가 유지되지 않는다고 생각" },
      { text: "준비 완료" },
    ],
    answerIndex: 1,
    output: "준비 완료\n클릭 1번\n클릭 2번",
    hints: [
      "addEventListener에 넘긴 함수는 '언제' 실행될까요?",
      "코드가 위에서 아래로 실행될 때, 아직 클릭은 일어나지 않았어요.",
      "이벤트 핸들러는 등록만 해두고, 실제 이벤트가 일어날 때마다 실행돼요.",
      "clicks는 핸들러 바깥 변수라서 클릭할 때마다 값이 유지되며 늘어나요.",
    ],
    explanation: `코드가 처음 실행될 때 핸들러는 '등록'만 되고 실행되지 않아요 → "준비 완료"가 먼저 출력돼요.
첫 번째 클릭 → clicks가 1 → "클릭 1번"
두 번째 클릭 → clicks가 2 → "클릭 2번"`,
    keyPoint: "이벤트 핸들러는 이벤트가 일어날 때마다 실행",
  },
  {
    id: "event-handler-bug",
    type: "bug",
    conceptIds: ["events", "functions"],
    difficulty: 2,
    runnable: false,
    prompt: "버튼을 클릭할 때마다 \"안녕!\"을 출력하고 싶은데, 페이지가 열리자마자 한 번만 출력되고 클릭해도 반응이 없어요. 어느 줄이 문제일까요?",
    code: `const btn = document.querySelector("#btn");

function sayHello() {
  console.log("안녕!");
}

btn.addEventListener("click", sayHello());`,
    bugLine: 7,
    fixedLine: 'btn.addEventListener("click", sayHello);',
    hints: [
      "sayHello 와 sayHello() 는 어떻게 다를까요?",
      "괄호 ()를 붙이면 그 자리에서 함수가 '호출'돼요.",
      "addEventListener에는 나중에 실행할 '함수 자체'를 넘겨야 해요. 호출 결과(undefined)를 넘기면 안 돼요.",
      "7번째 줄의 괄호를 다시 보세요.",
    ],
    explanation: `sayHello() 는 등록하는 순간 함수를 호출해서 "안녕!"을 한 번 출력해요.
그리고 그 결과값인 undefined를 핸들러로 넘기기 때문에 클릭해도 아무 일이 없어요.
sayHello 처럼 괄호 없이 '함수 자체'를 넘겨야 클릭할 때마다 실행돼요.`,
    keyPoint: "핸들러에는 함수를 넘기기 (호출 X)",
  },
  // ───────── Level 7 · Promise ─────────
  {
    id: "promise-then-order",
    type: "choice",
    subtype: "predict",
    conceptIds: ["promise"],
    difficulty: 2,
    prompt: "출력 순서로 알맞은 것은?",
    code: `console.log("A");

Promise.resolve().then(() => console.log("B"));

console.log("C");`,
    choices: [
      { text: "A\nB\nC", misconception: "then 콜백이 즉시 실행된다고 생각" },
      { text: "A\nC\nB" },
      { text: "B\nA\nC" },
      { text: "A\nC", misconception: "then 콜백이 실행되지 않는다고 생각" },
    ],
    answerIndex: 1,
    output: "A\nC\nB",
    hints: [
      "then에 넘긴 함수는 지금 바로 실행될까요?",
      "Promise가 이미 완료됐더라도 then 콜백은 '예약'만 돼요.",
      "then 콜백은 지금 실행 중인 코드가 모두 끝난 뒤에 실행돼요.",
      '"C"를 출력하는 코드는 지금 실행 중인 코드에 포함돼요.',
    ],
    explanation: `"A"가 출력돼요.
then의 콜백은 바로 실행되지 않고 예약돼요.
"C"가 출력돼요. 이제 현재 코드가 다 끝났어요.
예약해 둔 then 콜백이 실행되어 "B"가 출력돼요.`,
    keyPoint: "then 콜백은 현재 코드가 끝난 뒤 실행",
  },
  {
    id: "event-loop-predict",
    type: "predict",
    conceptIds: ["promise"],
    difficulty: 3,
    prompt: "출력 순서를 입력해 보세요. (한 줄에 하나씩)",
    code: `console.log(1);

setTimeout(() => console.log(2), 0);

Promise.resolve().then(() => console.log(3));

console.log(4);`,
    output: "1\n4\n3\n2",
    hints: [
      "지금 바로 실행되는 코드와 '나중에' 실행되는 코드를 나눠 볼까요?",
      "1과 4는 바로 실행돼요. 2와 3은 모두 예약돼요.",
      "Promise의 then 콜백은 setTimeout 콜백보다 먼저 실행돼요. (0ms여도!)",
      "바로 실행되는 것 → Promise → setTimeout 순서예요.",
    ],
    explanation: `바로 실행: 1 출력, 4 출력
setTimeout 콜백과 then 콜백은 예약돼요.
현재 코드가 끝나면 Promise의 then 콜백이 먼저 실행 → 3
그 다음 setTimeout 콜백이 실행 → 2`,
    keyPoint: "동기 코드 → Promise(then) → setTimeout",
  },
  // ───────── Level 7 · async / await ─────────
  {
    id: "await-order",
    type: "choice",
    subtype: "predict",
    conceptIds: ["async-await"],
    difficulty: 2,
    prompt: "출력 순서로 알맞은 것은?",
    code: `async function load() {
  console.log("A");
  await Promise.resolve();
  console.log("B");
}

load();
console.log("C");`,
    choices: [
      { text: "A\nB\nC", misconception: "await가 프로그램 전체를 멈춘다고 생각" },
      { text: "A\nC\nB" },
      { text: "C\nA\nB", misconception: "async 함수는 호출 즉시 실행되지 않는다고 생각" },
      { text: "A\nC" },
    ],
    answerIndex: 1,
    output: "A\nC\nB",
    hints: [
      "load()를 호출하면 함수 안의 첫 줄은 언제 실행될까요?",
      "await를 만나면 누가 멈추나요? 함수 안만 멈출까요, 프로그램 전체가 멈출까요?",
      "await는 'async 함수 안에서만' 기다려요. 그동안 함수 바깥의 코드는 계속 실행돼요.",
      'load() 다음 줄의 console.log("C")는 함수 바깥이에요.',
    ],
    explanation: `load()를 호출하면 함수 안의 "A"가 바로 출력돼요.
await를 만나면 load 함수만 잠시 멈추고, 호출한 곳으로 돌아가요.
바깥의 console.log("C")가 실행돼요.
그 다음 멈췄던 load가 이어서 실행되어 "B"가 출력돼요.`,
    keyPoint: "await 는 async 함수 안에서만 기다려요",
  },
  {
    id: "async-returns-promise",
    type: "choice",
    subtype: "predict",
    conceptIds: ["async-await", "promise"],
    difficulty: 2,
    prompt: "이 코드를 실행하면 무엇이 출력될까요?",
    code: `async function getNumber() {
  return 7;
}

const result = getNumber();

console.log(result instanceof Promise);`,
    choices: [
      { text: "7", misconception: "async 함수가 값을 바로 돌려준다고 생각" },
      { text: "true" },
      { text: "false", misconception: "async 함수가 값을 바로 돌려준다고 생각" },
      { text: "undefined" },
    ],
    answerIndex: 1,
    output: "true",
    hints: [
      "async를 붙인 함수는 무엇을 돌려줄까요?",
      "return 7 이라고 썼지만, async 함수에서는 그 값이 무언가에 감싸져요.",
      "async 함수는 항상 Promise를 돌려줘요. 값을 꺼내려면 await나 then이 필요해요.",
      "result instanceof Promise 는 'result가 Promise인가?'를 묻는 식이에요.",
    ],
    explanation: `async 함수는 항상 Promise를 돌려줘요.
return 7 은 '7로 완료되는 Promise'를 돌려준다는 뜻이에요.
그래서 result는 Promise이고, result instanceof Promise 는 true예요.
7을 꺼내려면 await getNumber() 처럼 써야 해요.`,
    keyPoint: "async 함수는 항상 Promise를 돌려줘요",
  },
  {
    id: "async-order",
    type: "order",
    conceptIds: ["async-await"],
    difficulty: 2,
    prompt: "10이 출력되도록 코드 조각을 순서대로 배치해 보세요.",
    code: "",
    pieces: [
      "const main = async () => {",
      "  const value = await Promise.resolve(5);",
      "  console.log(value * 2);",
      "};",
      "main();",
    ],
    output: "10",
    hints: [
      "함수를 호출하려면 그 함수가 먼저 만들어져 있어야 해요. (const로 만든 함수라면 더더욱!)",
      "await는 async 함수 '안'에서만 쓸 수 있어요.",
      "함수 정의 시작 → 함수 본문 → 함수 정의 끝 → 호출 순서예요.",
      "value를 사용하는 줄은 value를 만드는 줄보다 뒤에 있어야 해요.",
    ],
    explanation: `const main = async () => { ... }; 로 먼저 async 함수를 만들어요.
함수 안에서 await로 Promise의 결과 5를 받아 value에 담아요.
value * 2 = 10을 출력해요.
마지막으로 main()을 호출해야 실제로 실행돼요.`,
    keyPoint: "await 는 async 함수 안에서만",
  },
  // ───────── Level 7 · fetch ─────────
  {
    id: "fetch-json-blank",
    type: "choice",
    subtype: "blank",
    conceptIds: ["fetch", "async-await"],
    difficulty: 2,
    runnable: false,
    prompt: "응답 본문의 name을 출력하려면 빈칸에 무엇이 들어가야 할까요?",
    code: `async function showUser() {
  const response = await fetch("/api/user");
  const data = ____;
  console.log(data.name);
}`,
    choices: [
      { text: "await response.json()" },
      { text: "response.json()", misconception: "json()도 Promise라는 걸 놓침" },
      { text: "response", misconception: "응답 객체와 본문 데이터를 혼동" },
      { text: "await response" },
    ],
    answerIndex: 0,
    hints: [
      "response는 데이터 자체일까요, 아니면 응답 전체를 담은 객체일까요?",
      "응답 본문을 JSON으로 꺼내는 메서드가 있어요.",
      "response.json()도 바로 값을 주지 않고 Promise를 돌려줘요.",
      "fetch를 기다린 것처럼, json()도 기다려야 해요.",
    ],
    explanation: `fetch를 await하면 response(응답 객체)를 받아요. 이건 아직 데이터가 아니에요.
response.json()은 본문을 읽어 객체로 바꾸는데, 이것도 Promise를 돌려줘요.
그래서 await response.json() 으로 기다려야 data.name을 읽을 수 있어요.`,
    keyPoint: "fetch 도, json() 도 await",
  },
  {
    id: "fetch-await-bug",
    type: "bug",
    conceptIds: ["fetch", "promise"],
    difficulty: 3,
    runnable: false,
    prompt: "\"response.json is not a function\" 에러가 나요. 어느 줄이 문제일까요?",
    code: `async function showTitle() {
  const response = fetch("/api/post/1");
  const post = await response.json();
  console.log(post.title);
}`,
    bugLine: 2,
    fixedLine: '  const response = await fetch("/api/post/1");',
    hints: [
      "fetch()는 응답을 바로 돌려줄까요?",
      "await 없이 fetch를 호출하면 response에는 무엇이 담길까요?",
      "fetch는 Promise를 돌려줘요. Promise에는 json() 메서드가 없어요.",
      "에러는 3번째 줄에서 나지만, 원인은 그 전에 있어요.",
    ],
    explanation: `await 없이 fetch를 호출하면 response에는 응답이 아니라 Promise가 담겨요.
Promise에는 json() 메서드가 없어서 3번째 줄에서 에러가 나요.
2번째 줄에 await를 붙여 응답이 올 때까지 기다리면 해결돼요.`,
    keyPoint: "fetch 는 Promise를 돌려주므로 await 필요",
  },
];

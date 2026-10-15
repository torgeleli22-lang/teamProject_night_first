import type { Concept, ConceptId, Level, Skill, Track, Unit } from "./types";

/** 코드 갈래의 JavaScript 단원. 난이도(Level 1~5)와는 별개다. */
const CODE_UNITS: Unit[] = [
  {
    id: 1,
    track: "code",
    title: "JavaScript 기초",
    emoji: "🌱",
    description: "값을 담고, 종류를 구분하고, 계산하는 법",
    conceptIds: ["variables", "let-const", "data-types", "operators"],
  },
  {
    id: 2,
    track: "code",
    title: "프로그램 흐름",
    emoji: "🔀",
    description: "조건에 따라 나누고, 같은 일을 반복하는 법",
    conceptIds: ["if-else", "switch", "for", "while"],
  },
  {
    id: 3,
    track: "code",
    title: "데이터",
    emoji: "📦",
    description: "여러 값을 묶어서 다루는 법",
    conceptIds: ["arrays", "objects", "strings"],
  },
  {
    id: 4,
    track: "code",
    title: "함수",
    emoji: "🧩",
    description: "코드를 묶어서 이름 붙이고 재사용하는 법",
    conceptIds: ["functions", "params-return", "arrow-functions", "scope"],
  },
  {
    id: 5,
    track: "code",
    title: "배열 활용",
    emoji: "🛠️",
    description: "배열 메서드로 데이터를 변환하고 골라내는 법",
    conceptIds: ["map", "filter", "for-each", "find", "reduce"],
  },
  {
    id: 7,
    track: "code",
    title: "비동기",
    emoji: "⏳",
    description: "기다려야 하는 작업을 다루는 법",
    conceptIds: ["promise", "async-await"],
  },
];

const CODE_CONCEPTS: Concept[] = [
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
];

// ───────────────────────── 개념 갈래: 분야와 주제 ─────────────────────────

/** 개념 갈래의 분야. 자격증 시험처럼 지식을 객관식으로 확인한다 */
const THEORY_UNITS: Unit[] = [
  {
    id: 11,
    track: "theory",
    title: "네트워크",
    emoji: "🌐",
    description: "데이터가 컴퓨터 사이를 오가는 규칙",
    conceptIds: ["net-osi", "net-tcp-udp", "net-ip", "net-http", "net-dns"],
  },
  {
    id: 12,
    track: "theory",
    title: "개발",
    emoji: "🧱",
    description: "소프트웨어를 설계하고 만들고 검증하는 방법",
    conceptIds: ["dev-process", "dev-data-structure", "dev-oop", "dev-testing", "dev-git"],
  },
  {
    id: 13,
    track: "theory",
    title: "운영 및 유지보수",
    emoji: "🛠️",
    description: "서비스를 안정적으로 돌리고 지키는 방법",
    conceptIds: ["ops-os", "ops-db", "ops-cloud", "ops-incident"],
  },
  {
    id: 14,
    track: "theory",
    title: "보안",
    emoji: "🔐",
    description: "정보를 지키고 공격을 막는 원리",
    conceptIds: ["sec-crypto", "sec-web", "sec-auth", "sec-threats"],
  },
];

const THEORY_CONCEPTS: Concept[] = [
  {
    id: "net-osi",
    name: "OSI 7계층",
    unitId: 11,
    keyIdea: "통신 과정을 7단계로 나눠, 단계마다 맡은 일만 하게 한 약속",
    summary: "OSI 7계층은 물리 → 데이터 링크 → 네트워크 → 전송 → 세션 → 표현 → 응용 순서로 통신을 나눠요. 각 계층은 바로 아래 계층의 기능을 쓰고, 위 계층에 기능을 제공해요.",
    example: "웹 페이지 요청: HTTP(응용) → TCP(전송) → IP(네트워크) → 이더넷(데이터 링크) → 전기 신호(물리)",
  },
  {
    id: "net-tcp-udp",
    name: "TCP와 UDP",
    unitId: 11,
    keyIdea: "TCP = 순서·도착을 보장하는 연결형, UDP = 보장 없이 빠른 비연결형",
    summary: "TCP는 3-way handshake로 연결을 맺고, 순서 번호와 재전송으로 데이터가 빠짐없이 순서대로 도착하게 해요. UDP는 연결 없이 바로 보내서 빠르지만 손실·순서 뒤바뀜을 보장하지 않아요.",
    example: "TCP: 웹, 이메일, 파일 전송 / UDP: 실시간 영상 통화, 게임, DNS 조회",
  },
  {
    id: "net-ip",
    name: "IP 주소와 서브넷",
    unitId: 11,
    keyIdea: "IP 주소 = 네트워크 부분 + 호스트 부분, 서브넷 마스크가 경계를 정함",
    summary: "IPv4 주소는 32비트를 8비트씩 네 덩어리로 적어요. 서브넷 마스크(/24 등)는 앞에서 몇 비트가 네트워크 부분인지 알려 줘요. 같은 네트워크 부분을 가진 기기끼리는 라우터 없이 바로 통신해요.",
    example: "192.168.0.10/24 → 네트워크 192.168.0.0, 쓸 수 있는 호스트 254개",
  },
  {
    id: "net-http",
    name: "HTTP와 HTTPS",
    unitId: 11,
    keyIdea: "HTTP = 요청·응답으로 웹 자원을 주고받는 규칙, HTTPS = 그 내용을 TLS로 암호화",
    summary: "브라우저가 메서드(GET, POST 등)와 주소로 요청을 보내면 서버는 상태 코드(200, 404, 500 등)와 내용을 돌려줘요. HTTP는 상태를 기억하지 않아서 쿠키·토큰으로 사용자를 구분해요.",
    example: "GET /items → 200 OK, 없는 주소 → 404 Not Found, 서버 오류 → 500",
  },
  {
    id: "net-dns",
    name: "DNS",
    unitId: 11,
    keyIdea: "DNS = 도메인 이름을 IP 주소로 바꿔 주는 전화번호부",
    summary: "사람은 example.com 같은 이름을 쓰고 컴퓨터는 IP 주소로 통신해요. DNS 서버가 이름을 IP로 알려 주고, 한 번 찾은 결과는 일정 시간(TTL) 동안 캐시에 저장해 다시 묻지 않아요.",
    example: "www.example.com → (DNS 조회) → 93.184.216.34",
  },
  {
    id: "dev-process",
    name: "개발 방법론",
    unitId: 12,
    keyIdea: "폭포수 = 단계를 차례로 한 번씩, 애자일 = 짧은 주기로 만들고 고치기를 반복",
    summary: "폭포수 모델은 요구 분석 → 설계 → 구현 → 테스트 → 유지보수를 순서대로 진행해서 계획이 분명하지만 변경에 약해요. 애자일(스크럼 등)은 짧은 반복 주기마다 동작하는 결과물을 만들고 피드백을 반영해요.",
    example: "스크럼: 2주 스프린트 → 매일 짧은 회의 → 스프린트 끝에 결과 검토와 회고",
  },
  {
    id: "dev-data-structure",
    name: "자료구조",
    unitId: 12,
    keyIdea: "스택 = 나중에 넣은 것을 먼저(LIFO), 큐 = 먼저 넣은 것을 먼저(FIFO)",
    summary: "자료구조는 데이터를 담는 방식이에요. 배열은 번호로 빠르게 찾고, 연결 리스트는 중간 삽입·삭제가 쉬워요. 스택은 되돌리기·함수 호출에, 큐는 대기열·작업 처리에 쓰여요.",
    example: "스택에 1, 2, 3 을 넣고 하나 꺼내면 3 / 큐에 1, 2, 3 을 넣고 하나 꺼내면 1",
  },
  {
    id: "dev-oop",
    name: "객체지향",
    unitId: 12,
    keyIdea: "데이터와 기능을 객체로 묶고, 캡슐화·상속·다형성으로 재사용과 변경을 쉽게",
    summary: "캡슐화는 내부 데이터를 숨기고 정해진 방법으로만 바꾸게 해요. 상속은 기존 클래스의 기능을 물려받고, 다형성은 같은 이름의 메서드가 객체에 따라 다르게 동작하게 해요.",
    example: "Animal 의 speak() 를 Dog 은 '멍멍', Cat 은 '야옹'으로 다르게 구현 (다형성)",
  },
  {
    id: "dev-testing",
    name: "소프트웨어 테스트",
    unitId: 12,
    keyIdea: "단위 → 통합 → 시스템 → 인수 테스트 순서로 작은 단위부터 전체까지 확인",
    summary: "단위 테스트는 함수 하나, 통합 테스트는 모듈 사이 연결, 시스템 테스트는 전체 기능, 인수 테스트는 사용자 요구를 만족하는지 확인해요. 블랙박스는 입력·출력만, 화이트박스는 내부 구조까지 보고 테스트해요.",
    example: "로그인 함수 단위 테스트 → 로그인 + 회원 DB 통합 테스트 → 사용자가 직접 확인하는 인수 테스트",
  },
  {
    id: "dev-git",
    name: "버전 관리 (Git)",
    unitId: 12,
    keyIdea: "변경 이력을 커밋으로 남기고, 브랜치로 나눠 작업한 뒤 병합",
    summary: "Git은 파일의 변경을 커밋 단위로 기록해 언제든 이전 상태로 돌아갈 수 있게 해요. 브랜치에서 따로 작업하고 병합(merge)하며, 같은 부분을 서로 다르게 바꾸면 충돌(conflict)이 생겨 사람이 정리해요.",
    example: "git add → git commit → git push, 기능 브랜치 → 풀 리퀘스트 → main 에 병합",
  },
  {
    id: "ops-os",
    name: "운영체제 (프로세스와 스레드)",
    unitId: 13,
    keyIdea: "프로세스 = 실행 중인 프로그램(독립 메모리), 스레드 = 프로세스 안의 실행 흐름(메모리 공유)",
    summary: "운영체제는 CPU·메모리 같은 자원을 프로그램에 나눠 줘요. 프로세스끼리는 메모리가 분리되어 있고, 같은 프로세스의 스레드는 메모리를 공유해서 가볍지만 동시에 같은 값을 바꾸면 문제가 생길 수 있어요.",
    example: "브라우저 탭마다 프로세스, 한 탭 안에서 화면 그리기와 네트워크 처리는 스레드",
  },
  {
    id: "ops-db",
    name: "데이터베이스 (트랜잭션과 정규화)",
    unitId: 13,
    keyIdea: "트랜잭션 = 전부 되거나 전부 안 되는 작업 묶음(ACID), 정규화 = 중복을 줄이도록 테이블 나누기",
    summary: "트랜잭션은 원자성·일관성·독립성·지속성(ACID)을 지켜요. 계좌 이체처럼 여러 단계 중 하나라도 실패하면 처음 상태로 되돌려요(롤백). 정규화는 같은 데이터가 여러 곳에 저장되어 생기는 이상 현상을 막아요.",
    example: "이체: A 계좌 출금 + B 계좌 입금 → 입금이 실패하면 출금도 취소(롤백)",
  },
  {
    id: "ops-cloud",
    name: "클라우드와 가상화",
    unitId: 13,
    keyIdea: "IaaS = 서버를 빌림, PaaS = 실행 환경을 빌림, SaaS = 완성된 서비스를 빌림",
    summary: "가상화는 한 대의 물리 서버를 여러 가상 서버로 나눠 써요. 클라우드는 이런 자원을 필요한 만큼 빌려 쓰고 쓴 만큼 내요. 컨테이너는 운영체제를 공유해 가상 머신보다 가볍게 앱을 격리해요.",
    example: "IaaS: AWS EC2 / PaaS: 코드만 올리면 실행되는 서비스 / SaaS: 웹 메일, 온라인 문서",
  },
  {
    id: "ops-incident",
    name: "장애 대응과 백업",
    unitId: 13,
    keyIdea: "모니터링으로 빨리 알아채고, 백업과 이중화로 빨리 되살리기",
    summary: "장애는 막는 것만큼 빨리 알아채고 복구하는 것이 중요해요. 로그·지표를 모니터링하고 알림을 설정해요. 백업은 전체·증분·차등 방식이 있고, RTO(복구까지 걸리는 시간)와 RPO(잃어도 되는 데이터 시점)로 목표를 정해요.",
    example: "매주 전체 백업 + 매일 증분 백업, RPO 1일 = 최대 하루치 데이터 손실까지 허용",
  },
  {
    id: "sec-crypto",
    name: "암호화와 해시",
    unitId: 14,
    keyIdea: "대칭키 = 같은 키로 잠그고 열기, 공개키 = 공개키로 잠그고 개인키로 열기, 해시 = 되돌릴 수 없는 요약",
    summary: "대칭키 암호(AES 등)는 빠르지만 키를 안전하게 나누기 어려워요. 공개키 암호(RSA 등)는 키 전달 문제를 해결하지만 느려요. 해시(SHA-256 등)는 원래 값으로 되돌릴 수 없어서 비밀번호 저장과 위변조 확인에 써요.",
    example: "HTTPS: 공개키로 대칭키를 안전하게 나눈 뒤, 실제 데이터는 대칭키로 암호화",
  },
  {
    id: "sec-web",
    name: "웹 공격 (SQL 삽입·XSS·CSRF)",
    unitId: 14,
    keyIdea: "입력값을 그대로 믿으면 공격 코드가 실행된다 — 검증하고, 분리하고, 출력할 때 바꿔서",
    summary: "SQL 삽입은 입력값으로 SQL 문을 바꿔 DB를 조작하는 공격이라 매개변수화된 쿼리로 막아요. XSS는 페이지에 악성 스크립트를 심는 공격이라 출력할 때 특수문자를 바꿔서(이스케이프) 막아요. CSRF는 로그인된 사용자의 브라우저로 원치 않는 요청을 보내게 하는 공격이라 토큰으로 막아요.",
    example: "입력 ' OR '1'='1 → 조건이 항상 참이 되어 로그인 우회 (SQL 삽입)",
  },
  {
    id: "sec-auth",
    name: "인증과 접근 제어",
    unitId: 14,
    keyIdea: "인증 = 누구인지 확인, 인가 = 무엇을 할 수 있는지 결정, 최소 권한 원칙",
    summary: "인증은 아이디·비밀번호, 일회용 코드, 생체 정보 등으로 사용자를 확인해요. 서로 다른 종류를 두 가지 이상 쓰면 다중 인증(MFA)이에요. 인가는 확인된 사용자에게 필요한 권한만 주는 것이고, 역할 기반 접근 제어(RBAC)가 대표적이에요.",
    example: "비밀번호(아는 것) + 휴대폰 인증 코드(가진 것) = 2단계 인증",
  },
  {
    id: "sec-threats",
    name: "보안 위협",
    unitId: 14,
    keyIdea: "악성코드·서비스 거부·사회공학 — 기술뿐 아니라 사람을 노리는 공격도 있다",
    summary: "랜섬웨어는 파일을 암호화하고 돈을 요구하고, 서비스 거부(DoS·DDoS) 공격은 요청을 폭주시켜 서비스를 멈추게 해요. 피싱 같은 사회공학 공격은 사람을 속여 정보를 빼내요. 백업·업데이트·교육이 기본 대책이에요.",
    example: "택배 조회를 사칭한 문자 링크로 가짜 로그인 페이지에 유도 (스미싱)",
  },
];

// ───────────────────────── 자격증 과목 태그 ─────────────────────────

export interface CertSubject {
  id: string;
  /** 자격증 이름 (같은 자격증의 과목끼리 묶어 보여준다) */
  cert: string;
  name: string;
}

/** 개념 문제에 붙이는 자격증 과목. 시험 대비로 골라 풀 때 쓴다 (출제 범위를 그대로 옮긴 것이 아니라 관련 과목 표시) */
export const CERT_SUBJECTS: CertSubject[] = [
  { id: "eip-1", cert: "정보처리기사", name: "소프트웨어 설계" },
  { id: "eip-2", cert: "정보처리기사", name: "소프트웨어 개발" },
  { id: "eip-3", cert: "정보처리기사", name: "데이터베이스 구축" },
  { id: "eip-4", cert: "정보처리기사", name: "프로그래밍 언어 활용" },
  { id: "eip-5", cert: "정보처리기사", name: "정보시스템 구축 관리" },
  { id: "netadmin", cert: "네트워크관리사", name: "네트워크 일반" },
  { id: "linux", cert: "리눅스마스터", name: "리눅스 운영 및 관리" },
  { id: "sqld", cert: "SQLD", name: "데이터 모델링과 SQL" },
  { id: "infosec", cert: "정보보안기사", name: "정보보안 일반" },
];

/** 자격증 이름 목록 (화면의 '자격증 대비' 선택지) */
export const CERTS = [...new Set(CERT_SUBJECTS.map((c) => c.cert))];

export function certSubject(id: string): CertSubject | undefined {
  return CERT_SUBJECTS.find((c) => c.id === id);
}

// ───────────────────────── 공통 ─────────────────────────

export const UNITS: Unit[] = [...CODE_UNITS, ...THEORY_UNITS];
export const CONCEPTS: Concept[] = [...CODE_CONCEPTS, ...THEORY_CONCEPTS];

export const TRACK_LABEL: Record<Track, string> = { theory: "개념", code: "코드" };

export function unitsOf(track: Track): Unit[] {
  return UNITS.filter((u) => u.track === track);
}

export function conceptsOf(track: Track): Concept[] {
  const units = new Set(unitsOf(track).map((u) => u.id));
  return CONCEPTS.filter((c) => units.has(c.unitId));
}

const conceptMap = new Map(CONCEPTS.map((c) => [c.id, c]));

/** 개념(주제) id 가 속한 갈래 */
export function trackOf(id: ConceptId): Track {
  const unitId = conceptMap.get(id)?.unitId;
  return UNITS.find((u) => u.id === unitId)?.track ?? "code";
}

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
  /** 개념 갈래에서 이 난이도가 뜻하는 것 */
  theoryDescription: string;
  /** 이 난이도에서 주로 요구하는 능력 */
  skill: Skill;
  skillLabel: string;
}

export const LEVELS: LevelInfo[] = [
  { level: 1, name: "입문", emoji: "🌱", description: "변수, 숫자, 문자열 등 아주 기본적인 코드", theoryDescription: "용어의 뜻을 알고 있는지", skill: "recall", skillLabel: "기억하고 확인하기" },
  { level: 2, name: "기초", emoji: "🌿", description: "조건문, 반복문, 간단한 배열과 함수", theoryDescription: "동작 원리를 이해하는지", skill: "predict", skillLabel: "읽고 예측하기" },
  { level: 3, name: "초급", emoji: "🌳", description: "배열·객체·함수·map·filter 를 조합한 코드", theoryDescription: "비슷한 개념을 구분하고 비교할 수 있는지", skill: "analyze", skillLabel: "분석하기" },
  { level: 4, name: "중급", emoji: "🔥", description: "여러 함수, 실행 흐름, 콜백, Promise", theoryDescription: "실제 상황에 맞는 방법을 고를 수 있는지", skill: "infer", skillLabel: "추론하기" },
  { level: 5, name: "심화", emoji: "🚀", description: "실제 개발 코드에 가까운 복합적인 로직", theoryDescription: "여러 개념을 엮어 판단할 수 있는지", skill: "synthesize", skillLabel: "종합하기" },
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
  predict_output: "실행 결과 예측",
  short_answer: "주관식",
};

/** 코드 학습의 읽기 단계 이름 (화면 표시) */
export const STAGE_INFO: Record<import("./types").Stage, { order: number; label: string; hint: string; emoji: string }> = {
  overview: { order: 1, label: "훑어보기", hint: "무엇을 하는 코드일까요?", emoji: "👀" },
  trace: { order: 2, label: "흐름 따라가기", hint: "한 줄씩 값이 어떻게 바뀌나요?", emoji: "🧭" },
  key: { order: 3, label: "핵심 줄", hint: "가장 중요한 줄은 무슨 일을 하나요?", emoji: "🔑" },
  wrapup: { order: 4, label: "정리", hint: "결과를 예측하고 내 말로 설명해요", emoji: "📝" },
};

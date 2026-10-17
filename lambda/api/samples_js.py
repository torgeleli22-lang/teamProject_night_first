"""
JavaScript 예시 코드 (samples_js.py) — jojo_api 함수 안의 파일

AI 를 쓸 수 없을 때 연습 모드(JavaScript)가 이 코드를 대신 내 줘요. 모양은 samples.py 와 같고 language 만 "javascript" 예요.
코드를 고치면 npm run verify 로 실제 실행(node)·※ 줄 범위를 확인하세요.
"""

JS_SAMPLES = [
    {
        "id": "js-bus",
        "language": "javascript",
        "level": 1,
        "topic": "버스 요금",
        "title": "버스 요금 계산",
        "code": """// 버스 요금 계산
const riders = [7, 15, 34, 70, 22];
let total = 0;
let freeCount = 0;

for (const age of riders) {
  let fare = 1500;
  if (age < 8 || age >= 65) {
    fare = 0;
    freeCount += 1;
  } else if (age < 19) {
    fare = 900;
  }
  total += fare;
}

console.log(`무료로 탄 사람: ${freeCount}명`);
console.log(`모두 낸 요금: ${total}원`);""",
        "marks": [
            {"start": 8, "end": 13, "concept": "branch", "why": "나이에 따라 요금이 갈리는 곳",
             "explanation": "8살 미만이거나 65살 이상이면 요금이 0원이고 무료 인원을 1 늘려요. 아니면 19살 미만인지 보고 900원, 둘 다 아니면 처음 정한 1500원 그대로예요. 7살과 70살이 무료라 freeCount 는 2가 돼요.",
             "keywords": ["8살 미만", "65살 이상", "0원", "900원", "1500원"]},
            {"start": 14, "end": 14, "concept": "loop_update", "why": "반복할 때마다 요금이 쌓이는 곳",
             "explanation": "riders 의 나이를 하나씩 꺼낼 때마다 위에서 정한 요금을 total 에 더해요. 0 + 900 + 1500 + 0 + 1500 이라 반복이 끝나면 total 은 3900원이에요.",
             "keywords": ["하나씩", "total", "더해", "3900"]},
        ],
    },
    {
        "id": "js-budget",
        "language": "javascript",
        "level": 1,
        "topic": "용돈 기입장",
        "title": "용돈 기입장 잔액",
        "code": """// 용돈 기입장
const records = [
  { item: "용돈", amount: 30000 },
  { item: "떡볶이", amount: -4500 },
  { item: "문제집", amount: -12000 },
  { item: "심부름", amount: 5000 },
  { item: "영화", amount: -9000 },
];

let balance = 0;
let spent = 0;
for (const record of records) {
  balance += record.amount;
  if (record.amount < 0) {
    spent -= record.amount;
  }
}

if (balance < 10000) {
  console.log("남은 돈이 만 원보다 적어요. 아껴 써요!");
}
console.log("쓴 돈:", spent, "남은 돈:", balance);""",
        "marks": [
            {"start": 12, "end": 17, "concept": "loop_update", "why": "반복하며 잔액과 쓴 돈이 바뀌는 곳",
             "explanation": "기록을 하나씩 보며 amount 를 balance 에 더해요. amount 가 음수(쓴 돈)이면 spent 에서 빼서 양수로 쌓아요. 끝나면 balance 는 9500, spent 는 25500이에요.",
             "keywords": ["하나씩", "balance", "음수", "spent", "9500"]},
            {"start": 19, "end": 21, "concept": "branch", "why": "남은 돈에 따라 안내가 나오는 곳",
             "explanation": "남은 돈 balance 가 10000보다 작으면 아껴 쓰라는 문구를 출력해요. 9500원이라 조건이 참이 되어 문구가 나와요.",
             "keywords": ["10000", "작으면", "9500", "출력"]},
        ],
    },
    {
        "id": "js-cart",
        "language": "javascript",
        "level": 2,
        "topic": "온라인 장바구니",
        "title": "온라인 장바구니 결제",
        "code": """// 온라인 장바구니 결제
const cart = [
  { name: "운동화", price: 59000, qty: 1, category: "패션" },
  { name: "양말", price: 3000, qty: 4, category: "패션" },
  { name: "물병", price: 12000, qty: 1, category: "생활" },
];
const coupons = { 패션: 0.1, 생활: 0 };

function lineTotal(entry) {
  const discount = coupons[entry.category] ?? 0;
  return Math.round(entry.price * entry.qty * (1 - discount));
}

function shippingFee(subtotal) {
  if (subtotal >= 50000) {
    return 0;
  }
  return 3000;
}

function checkout(items) {
  const totals = items.map(lineTotal);
  const subtotal = totals.reduce((sum, value) => sum + value, 0);
  const fee = shippingFee(subtotal);
  return { subtotal, fee, pay: subtotal + fee };
}

function cheapItems(items, limit) {
  return items.filter((entry) => entry.price <= limit).map((entry) => entry.name);
}

const bill = checkout(cart);
console.log("상품 합계:", bill.subtotal, "배송비:", bill.fee);
console.log("결제할 금액:", bill.pay);
console.log("만 원 이하 상품:", cheapItems(cart, 10000));""",
        "marks": [
            {"start": 9, "end": 12, "concept": "data_update", "why": "쿠폰 할인율을 찾아 금액을 계산하는 곳",
             "explanation": "상품의 category 로 coupons 객체에서 할인율을 찾고(없으면 0), 가격 × 수량 × (1 - 할인율)을 반올림해 돌려줘요. 운동화는 59000 × 0.9 = 53100원이에요.",
             "keywords": ["category", "coupons", "할인율", "53100"]},
            {"start": 21, "end": 26, "concept": "call_flow", "why": "함수들을 차례로 불러 결제 금액을 만드는 곳",
             "explanation": "checkout 은 map 으로 상품마다 lineTotal 을 불러 금액 배열을 만들고, reduce 로 모두 더해 75900원을 구해요. 그다음 shippingFee 를 불러 배송비 0원을 받고 합계와 함께 객체로 돌려줘요.",
             "keywords": ["map", "lineTotal", "reduce", "shippingFee", "75900"]},
            {"start": 29, "end": 29, "concept": "loop_update", "why": "조건에 맞는 상품 이름만 고르는 곳",
             "explanation": "filter 로 가격이 limit(10000원) 이하인 상품만 남기고, map 으로 그 상품의 이름만 꺼내요. 3000원인 양말만 남아 ['양말'] 이 돼요.",
             "keywords": ["filter", "이하", "map", "이름", "양말"]},
        ],
    },
    {
        "id": "js-seats",
        "language": "javascript",
        "level": 2,
        "topic": "영화 예매",
        "title": "영화관 좌석 예매",
        "code": """// 영화관 좌석 예매
const seats = {
  A: [false, false, true, false],
  B: [true, true, false, false],
};
const bookings = [];

function isFree(row, number) {
  const line = seats[row];
  if (!line || number < 1 || number > line.length) {
    return false;
  }
  return !line[number - 1];
}

function book(name, row, number) {
  if (!isFree(row, number)) {
    console.log(`${name}: ${row}${number} 자리는 예매할 수 없어요`);
    return false;
  }
  seats[row][number - 1] = true;
  bookings.push({ name, seat: `${row}${number}` });
  return true;
}

function countFree() {
  let free = 0;
  for (const row of Object.keys(seats)) {
    free += seats[row].filter((taken) => !taken).length;
  }
  return free;
}

book("지민", "A", 1);
book("서준", "B", 2);
book("하은", "C", 1);
console.log("예매 목록:", bookings.map((b) => `${b.name}-${b.seat}`).join(", "));
console.log("남은 자리:", countFree());""",
        "marks": [
            {"start": 8, "end": 14, "concept": "branch", "why": "자리가 비었는지 판단하는 곳",
             "explanation": "줄이 없거나 번호가 범위를 벗어나면 바로 false 를 돌려줘요. 아니면 그 자리의 값(true 는 이미 예매됨)을 뒤집어 돌려줘서, 빈 자리일 때만 true 가 돼요. C 줄은 없어서 false 예요.",
             "keywords": ["범위", "false", "뒤집어", "빈 자리"]},
            {"start": 16, "end": 24, "concept": "call_flow", "why": "isFree 를 불러 예매를 막거나 기록하는 곳",
             "explanation": "book 은 먼저 isFree 를 불러요. 비어 있지 않으면 예매할 수 없다고 출력하고 false 로 끝나요. 비어 있으면 그 자리를 true 로 바꾸고 bookings 에 이름과 자리를 넣어요. 서준(B2)과 하은(C1)은 막히고 지민(A1)만 들어가요.",
             "keywords": ["isFree", "false", "true", "bookings", "지민"]},
            {"start": 26, "end": 32, "concept": "loop_update", "why": "남은 자리를 세는 곳",
             "explanation": "seats 의 줄마다 filter 로 아직 예매되지 않은 자리(false)만 골라 개수를 free 에 더해요. 지민이 A1 을 예매한 뒤라 A 줄 2개, B 줄 2개로 4가 돼요.",
             "keywords": ["줄마다", "filter", "false", "더해", "4"]},
        ],
    },
    {
        "id": "js-point",
        "language": "javascript",
        "level": 3,
        "topic": "포인트 카드",
        "title": "카페 포인트 카드",
        "code": """// 카페 포인트 카드
class PointCard {
  constructor(owner) {
    this.owner = owner;
    this.points = 0;
    this.history = [];
  }

  earn(price) {
    const gained = Math.floor(price * 0.05);
    this.points += gained;
    this.history.push(`+${gained}`);
    return gained;
  }

  use(amount) {
    if (amount <= 0) {
      throw new Error("0보다 큰 포인트만 쓸 수 있어요");
    }
    if (amount > this.points) {
      throw new Error(`포인트가 ${this.points}점뿐이에요`);
    }
    this.points -= amount;
    this.history.push(`-${amount}`);
  }
}

function tryUse(card, amount) {
  try {
    card.use(amount);
    console.log(`${amount}점 사용 완료, 남은 포인트 ${card.points}점`);
  } catch (error) {
    console.log(`사용 실패: ${error.message}`);
  }
}

const card = new PointCard("민지");
card.earn(4500);
card.earn(12000);
tryUse(card, 1000);
tryUse(card, 500);
tryUse(card, -3);
console.log("기록:", card.history.join(" "));""",
        "marks": [
            {"start": 9, "end": 14, "concept": "class_state", "why": "포인트가 쌓이며 객체 상태가 바뀌는 곳",
             "explanation": "earn 은 결제 금액의 5%를 내림해 this.points 에 더하고 기록에 남겨요. 4500원이면 225점, 12000원이면 600점이 쌓여 points 는 825점이 돼요.",
             "keywords": ["5%", "this.points", "더하", "825"]},
            {"start": 16, "end": 25, "concept": "exception", "why": "조건이 맞지 않으면 throw 로 멈추는 곳",
             "explanation": "use 는 0 이하를 쓰려 하거나 가진 포인트보다 많이 쓰려 하면 throw 로 오류를 던져서 아래 줄(포인트 빼기)을 실행하지 않아요. 둘 다 아니면 points 에서 빼고 기록해요.",
             "keywords": ["throw", "0 이하", "많이", "빼"]},
            {"start": 28, "end": 35, "concept": "exception", "why": "던진 오류를 catch 로 받아 안내하는 곳",
             "explanation": "tryUse 는 card.use 를 try 안에서 불러요. 오류가 던져지면 사용 완료 줄은 건너뛰고 catch 로 가서 오류 메시지를 출력해요. 1000점과 -3점은 실패, 500점은 성공해 325점이 남아요.",
             "keywords": ["try", "catch", "건너뛰", "메시지", "325"]},
        ],
    },
    {
        "id": "js-org",
        "language": "javascript",
        "level": 3,
        "topic": "회사 조직도",
        "title": "회사 조직도 인원 세기",
        "code": """// 회사 조직도에서 인원 세기
const company = {
  name: "본사",
  members: 2,
  teams: [
    {
      name: "개발팀",
      members: 5,
      teams: [
        { name: "앱 파트", members: 3, teams: [] },
        { name: "서버 파트", members: 4, teams: [] },
      ],
    },
    { name: "디자인팀", members: 3, teams: [] },
  ],
};

function countPeople(group) {
  let total = group.members;
  for (const team of group.teams) {
    total += countPeople(team);
  }
  return total;
}

function findPath(group, target, path = []) {
  const here = [...path, group.name];
  if (group.name === target) {
    return here;
  }
  for (const team of group.teams) {
    const found = findPath(team, target, here);
    if (found) {
      return found;
    }
  }
  return null;
}

console.log("전체 인원:", countPeople(company));
console.log("개발팀 인원:", countPeople(company.teams[0]));
console.log("서버 파트 위치:", findPath(company, "서버 파트").join(" > "));
console.log("영업팀 위치:", findPath(company, "영업팀"));""",
        "marks": [
            {"start": 18, "end": 24, "concept": "recursion", "why": "자기 자신을 불러 아래 팀까지 세는 곳",
             "explanation": "countPeople 은 지금 그룹의 인원으로 시작해, 아래 팀마다 countPeople 을 다시 불러 그 결과를 더해요. 아래 팀이 없으면 반복이 돌지 않아 자기 인원만 돌려줘요. 개발팀은 5 + 3 + 4 = 12, 전체는 2 + 12 + 3 = 17명이에요.",
             "keywords": ["다시 불러", "아래 팀", "더해", "12", "17"]},
            {"start": 26, "end": 38, "concept": "recursion", "why": "길을 찾으면 위로 돌려주는 곳",
             "explanation": "findPath 는 지금까지의 경로에 자기 이름을 붙이고, 찾는 이름이면 그 경로를 돌려줘요. 아니면 아래 팀마다 자신을 다시 불러 찾은 경로가 오면 바로 위로 돌려줘요. 어디에도 없으면 null 이라 영업팀은 null 이 나와요.",
             "keywords": ["경로", "다시 불러", "돌려줘", "null"]},
        ],
    },
    {
        "id": "js-delivery",
        "language": "javascript",
        "level": 4,
        "topic": "택배 배송 경로",
        "title": "택배 배송 경로 찾기",
        "code": """// 택배 배송 경로 찾기
const ROADS = [
  ["물류센터", "시청", 7],
  ["물류센터", "공원", 3],
  ["공원", "시청", 2],
  ["공원", "학교", 8],
  ["시청", "학교", 4],
  ["시청", "병원", 6],
  ["학교", "병원", 1],
  ["학교", "아파트", 9],
  ["병원", "아파트", 3],
];
const CLOSED = new Set(["공원-학교"]);

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(entry) {
    this.items.push(entry);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.items[parent][0] <= this.items[i][0]) {
        break;
      }
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      while (true) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && this.items[left][0] < this.items[smallest][0]) {
          smallest = left;
        }
        if (right < this.items.length && this.items[right][0] < this.items[smallest][0]) {
          smallest = right;
        }
        if (smallest === i) {
          break;
        }
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

function buildMap(roads, closed) {
  const graph = new Map();
  for (const [from, to, minutes] of roads) {
    if (minutes <= 0) {
      throw new Error(`${from}-${to} 도로의 시간이 잘못됐어요`);
    }
    if (closed.has(`${from}-${to}`) || closed.has(`${to}-${from}`)) {
      continue;
    }
    if (!graph.has(from)) graph.set(from, []);
    if (!graph.has(to)) graph.set(to, []);
    graph.get(from).push([to, minutes]);
    graph.get(to).push([from, minutes]);
  }
  return graph;
}

function fastestRoute(graph, start, goal) {
  if (!graph.has(start) || !graph.has(goal)) {
    throw new Error(`${start} 또는 ${goal} 은(는) 지도에 없어요`);
  }
  const best = new Map([[start, 0]]);
  const before = new Map();
  const heap = new MinHeap();
  heap.push([0, start]);
  while (heap.size > 0) {
    const [time, place] = heap.pop();
    if (place === goal) {
      break;
    }
    if (time > best.get(place)) {
      continue;
    }
    for (const [next, minutes] of graph.get(place)) {
      const arrive = time + minutes;
      if (!best.has(next) || arrive < best.get(next)) {
        best.set(next, arrive);
        before.set(next, place);
        heap.push([arrive, next]);
      }
    }
  }
  return { minutes: best.get(goal), path: tracePath(before, start, goal) };
}

function tracePath(before, start, goal) {
  const path = [goal];
  let place = goal;
  while (place !== start) {
    place = before.get(place);
    if (place === undefined) {
      return [];
    }
    path.unshift(place);
  }
  return path;
}

function fewestStops(graph, start, goal) {
  const queue = [[start]];
  const seen = new Set([start]);
  while (queue.length > 0) {
    const path = queue.shift();
    const place = path[path.length - 1];
    if (place === goal) {
      return path;
    }
    for (const [next] of graph.get(place)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return [];
}

function routeMinutes(graph, path) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const road = graph.get(path[i]).find(([next]) => next === path[i + 1]);
    total += road[1];
  }
  return total;
}

function planDelivery(start, stops) {
  const graph = buildMap(ROADS, CLOSED);
  const report = [];
  let here = start;
  for (const stop of stops) {
    try {
      const fast = fastestRoute(graph, here, stop);
      const simple = fewestStops(graph, here, stop);
      report.push({
        to: stop,
        fast: `${fast.path.join("→")} (${fast.minutes}분)`,
        simple: `${simple.join("→")} (${routeMinutes(graph, simple)}분)`,
      });
      here = stop;
    } catch (error) {
      report.push({ to: stop, fast: `건너뜀: ${error.message}`, simple: "-" });
    }
  }
  return report;
}

for (const row of planDelivery("물류센터", ["학교", "도서관", "아파트"])) {
  console.log(`[${row.to}] 가장 빠른 길: ${row.fast} / 가장 적게 거치는 길: ${row.simple}`);
}""",
        "marks": [
            {"start": 67, "end": 72, "concept": "exception", "why": "도로를 검사하고 막힌 도로를 빼는 곳",
             "explanation": "도로 시간이 0 이하이면 throw 로 지도 만들기를 멈춰요. 공사 중인 도로(CLOSED)는 양쪽 방향 모두 확인해서 continue 로 건너뛰어, 공원-학교 도로는 지도에 들어가지 않아요.",
             "keywords": ["throw", "0 이하", "CLOSED", "continue", "공원-학교"]},
            {"start": 97, "end": 104, "concept": "algorithm", "why": "더 빠른 길을 찾으면 기록을 바꾸는 곳",
             "explanation": "지금 장소에서 갈 수 있는 곳마다 도착 시간(time + minutes)을 계산해요. 처음 가는 곳이거나 기록보다 빠르면 best 와 before 를 바꾸고 힙에 넣어요. 그래서 시청은 처음 7분에서 공원을 거친 5분으로 바뀌어요.",
             "keywords": ["도착 시간", "best", "before", "힙", "5분"]},
            {"start": 112, "end": 118, "concept": "recursion", "why": "기록을 거꾸로 따라가 경로를 만드는 곳",
             "explanation": "도착지에서 출발해 before 에 적힌 직전 장소로 한 칸씩 거슬러 올라가며 앞에 붙여요(unshift). 출발지에 닿으면 멈추고, 기록이 끊기면 빈 배열을 돌려줘요. 학교 → 시청 → 공원 → 물류센터 순으로 따라가 물류센터→공원→시청→학교가 돼요.",
             "keywords": ["before", "거슬러", "unshift", "출발지", "빈 배열"]},
            {"start": 125, "end": 136, "concept": "algorithm", "why": "가장 적게 거치는 길을 넓게 찾는 곳",
             "explanation": "큐에서 경로를 하나씩 꺼내 마지막 장소가 도착지면 그 경로를 돌려줘요. 아니면 아직 안 가 본 이웃마다 경로를 하나 늘려 큐 뒤에 넣어요. 가까운 단계부터 보기 때문에 처음 도착한 경로가 거치는 곳이 가장 적은 길(물류센터→시청→학교)이에요.",
             "keywords": ["큐", "하나씩", "안 가 본", "뒤에", "가장 적은"]},
            {"start": 154, "end": 166, "concept": "call_flow", "why": "배송지마다 두 방법을 불러 비교하는 곳",
             "explanation": "배송지마다 fastestRoute 와 fewestStops 를 불러 두 경로를 report 에 넣고, 성공하면 here 를 그 배송지로 옮겨요. 도서관처럼 지도에 없으면 fastestRoute 가 던진 오류를 catch 로 받아 '건너뜀' 을 남기고 here 는 학교 그대로 다음 배송지로 가요.",
             "keywords": ["fastestRoute", "fewestStops", "here", "catch", "건너뜀"]},
        ],
    },
]

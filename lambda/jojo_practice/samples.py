"""
예시 코드 (samples.py) — AI 를 쓸 수 없거나 생성한 코드가 검증을 통과하지 못했을 때 대신 내는 코드예요.
언어(Python·JavaScript) × 난이도(1 초급 · 2 중급 · 3 고급)마다 하나씩. 모양은 검토를 마친 AI 코드와 같아요:
  output 실제 실행 출력 (npm run verify 가 확인) · units  흐름 단위 (줄 범위 · 종류 · 모범 설명 · 핵심 표현 · key: 학습자가 꼭 설명해 볼 곳)
코드를 고치면 npm run verify 로 실제 실행해 확인하세요.
"""

SAMPLES = [
    {
        "id": 'sample-cafe', "language": 'python', "level": 1,
        "topic": '카페 주문', "title": '카페 주문 합계',
        "output": ['10000원 이상 주문이라 1000원 할인해요', '결제할 금액: 9000'],
        "code": """# 카페 주문 합계 계산
menu = {"아메리카노": 3000, "라떼": 3500, "케이크": 5000}
order = ["아메리카노", "라떼", "라떼"]

total = 0
for item in order:
    price = menu[item]
    total = total + price

if total >= 10000:
    total = total - 1000
    print("10000원 이상 주문이라 1000원 할인해요")

print("결제할 금액:", total)""",
        "units": [
            {"start": 6, "end": 8, "kind": 'loop', "key": True,
             "explanation": 'order 의 메뉴를 하나씩 꺼내 menu 에서 가격을 찾고 total 에 더해요. 반복이 끝나면 total 은 3000 + 3500 + 3500 = 10000원이에요.',
             "keywords": ['하나씩', '가격', '더해', '10000']},
        ],
    },
    {
        "id": 'sample-store', "language": 'python', "level": 2,
        "topic": '편의점 재고', "title": '편의점 재고 관리',
        "output": ['컵라면: 판매 불가 (품절)', "발주 필요: ['바나나우유', '컵라면']"],
        "code": """# 편의점 재고 관리 프로그램
inventory = {
    "삼각김밥": 12,
    "바나나우유": 5,
    "컵라면": 0,
}

def check_stock(item):
    if item not in inventory:
        return "없는 상품"
    count = inventory[item]
    if count == 0:
        return "품절"
    elif count < 10:
        return "재고 부족"
    return "충분"

def sell(item, qty):
    status = check_stock(item)
    if status in ("없는 상품", "품절"):
        print(f"{item}: 판매 불가 ({status})")
        return False
    if inventory[item] < qty:
        print(f"{item}: 재고가 {inventory[item]}개뿐이에요")
        return False
    inventory[item] -= qty
    return True

def restock_report():
    need = []
    for item, count in inventory.items():
        if check_stock(item) in ("품절", "재고 부족"):
            need.append(item)
    return need

sell("바나나우유", 2)
sell("컵라면", 1)
print("발주 필요:", restock_report())""",
        "units": [
            {"start": 9, "end": 16, "kind": 'branch', "key": True,
             "explanation": "목록에 없으면 '없는 상품', 0개면 '품절', 10개 미만이면 '재고 부족', 아니면 '충분'을 위에서부터 순서대로 검사해 먼저 맞는 곳에서 돌려줘요. 처음 부를 때 바나나우유는 5개라 '재고 부족', 컵라면은 0개라 '품절'이에요.",
             "keywords": ['순서', '품절', '재고 부족', '10개 미만']},
            {"start": 19, "end": 22, "kind": 'block', "key": True,
             "explanation": 'sell 은 먼저 check_stock 을 불러 상태를 받아요. 없는 상품이거나 품절이면 판매 불가 메시지를 찍고 False 를 돌려주며 끝나요. 컵라면이 여기서 멈춰요.',
             "keywords": ['check_stock', '판매 불가', 'False', '끝']},
        ],
    },
    {
        "id": 'sample-bank', "language": 'python', "level": 3,
        "topic": '은행 계좌', "title": '은행 계좌 (클래스와 예외 처리)',
        "output": ['완료: 하린 입금 12000원', '완료: 지수 → 민호 8000원', '실패: 민호님 잔액 부족 (필요 20000원, 잔액 13000원) / 7000원 모자라요', '실패: 서윤님 계좌가 없어요', '실패: 한 번에 50000원까지만 뺄 수 있어요', '실패: 입금액은 0보다 커야 해요', "성공 2 건 / 실패 4 건: ['출금', '이체', '출금', '입금']", "지수: 22000원, 기록 [('출금', 8000)]", "민호: 13000원, 기록 [('입금', 8000)]", "하린: 12000원, 기록 [('입금', 12000)]"],
        "code": """# 은행 계좌 (클래스와 예외 처리)
class BankError(Exception):
    pass


class NotEnoughMoney(BankError):
    def __init__(self, owner, need, have):
        super().__init__(f"{owner}님 잔액 부족 (필요 {need}원, 잔액 {have}원)")
        self.short = need - have


class Account:
    def __init__(self, owner, balance=0, limit=50000):
        self.owner = owner
        self.balance = balance
        self.limit = limit
        self.history = []

    def deposit(self, amount):
        if amount <= 0:
            raise BankError("입금액은 0보다 커야 해요")
        self.balance += amount
        self.history.append(("입금", amount))

    def withdraw(self, amount):
        if amount > self.limit:
            raise BankError(f"한 번에 {self.limit}원까지만 뺄 수 있어요")
        if amount > self.balance:
            raise NotEnoughMoney(self.owner, amount, self.balance)
        self.balance -= amount
        self.history.append(("출금", amount))


class Bank:
    def __init__(self):
        self.accounts = {}
        self.failed = []

    def open(self, owner, balance=0):
        self.accounts[owner] = Account(owner, balance)

    def find(self, owner):
        if owner not in self.accounts:
            raise BankError(f"{owner}님 계좌가 없어요")
        return self.accounts[owner]

    def transfer(self, sender, receiver, amount):
        source = self.find(sender)
        target = self.find(receiver)
        source.withdraw(amount)
        target.deposit(amount)
        return f"{sender} → {receiver} {amount}원"

    def handle(self, kind, args):
        if kind == "이체":
            return self.transfer(*args)
        account = self.find(args[0])
        if kind == "입금":
            account.deposit(args[1])
            return f"{args[0]} 입금 {args[1]}원"
        account.withdraw(args[1])
        return f"{args[0]} 출금 {args[1]}원"

    def run(self, orders):
        done = 0
        for kind, *args in orders:
            try:
                message = self.handle(kind, args)
            except NotEnoughMoney as e:
                self.failed.append(kind)
                print("실패:", e, f"/ {e.short}원 모자라요")
            except BankError as e:
                self.failed.append(kind)
                print("실패:", e)
            else:
                done += 1
                print("완료:", message)
        return done


bank = Bank()
bank.open("지수", 30000)
bank.open("민호", 5000)
bank.open("하린")

orders = [
    ("입금", "하린", 12000),
    ("이체", "지수", "민호", 8000),
    ("출금", "민호", 20000),
    ("이체", "민호", "서윤", 1000),
    ("출금", "지수", 60000),
    ("입금", "하린", -500),
]

done = bank.run(orders)
print("성공", done, "건 / 실패", len(bank.failed), "건:", bank.failed)
for owner, account in bank.accounts.items():
    print(f"{owner}: {account.balance}원, 기록 {account.history}")""",
        "units": [
            {"start": 25, "end": 31, "kind": 'function', "key": True,
             "explanation": 'withdraw 는 한도(50000원)를 넘는지, 잔액보다 큰지를 차례로 검사해 걸리면 예외를 던지고 멈춰서 잔액과 기록이 바뀌지 않아요. 지수의 60000원 출금은 한도에, 민호의 20000원 출금은 잔액 13000원에 걸려요.',
             "keywords": ['한도', '잔액', '예외', '바뀌지']},
            {"start": 47, "end": 52, "kind": 'function', "key": True,
             "explanation": 'transfer 는 두 계좌를 find 로 먼저 찾은 뒤 보내는 계좌에서 withdraw, 받는 계좌에 deposit 해요. 서윤 계좌는 없어서 find 에서 바로 예외가 나므로 민호의 돈은 빠지지 않고 13000원 그대로예요.',
             "keywords": ['find', 'withdraw', 'deposit', '서윤', '그대로']},
            {"start": 67, "end": 77, "kind": 'block', "key": True,
             "explanation": '주문마다 try 안에서 처리하고, NotEnoughMoney 는 첫 except 에서 모자란 금액(7000원)까지, 나머지 BankError 는 두 번째 except 에서 메시지만 출력해요. 오류가 없을 때만 else 에서 done 을 늘려 성공 2건, 실패 4건이 돼요.',
             "keywords": ['try', 'NotEnoughMoney', 'BankError', 'else', '2건']},
        ],
    },
    {
        "id": 'js-bus', "language": 'javascript', "level": 1,
        "topic": '버스 요금', "title": '버스 요금 계산',
        "output": ['무료로 탄 사람: 2명', '모두 낸 요금: 3900원'],
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
        "units": [
            {"start": 8, "end": 13, "kind": 'function', "key": True,
             "explanation": '8살 미만이거나 65살 이상이면 요금이 0원이고 무료 인원을 1 늘려요. 아니면 19살 미만인지 보고 900원, 둘 다 아니면 처음 정한 1500원 그대로예요. 7살과 70살이 무료라 freeCount 는 2가 돼요.',
             "keywords": ['8살 미만', '65살 이상', '0원', '900원', '1500원']},
        ],
    },
    {
        "id": 'js-cart', "language": 'javascript', "level": 2,
        "topic": '온라인 장바구니', "title": '온라인 장바구니 결제',
        "output": ['상품 합계: 75900 배송비: 0', '결제할 금액: 75900', "만 원 이하 상품: [ '양말' ]"],
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
        "units": [
            {"start": 9, "end": 12, "kind": 'function', "key": True,
             "explanation": '상품의 category 로 coupons 객체에서 할인율을 찾고(없으면 0), 가격 × 수량 × (1 - 할인율)을 반올림해 돌려줘요. 운동화는 59000 × 0.9 = 53100원이에요.',
             "keywords": ['category', 'coupons', '할인율', '53100']},
            {"start": 21, "end": 26, "kind": 'function', "key": True,
             "explanation": 'checkout 은 map 으로 상품마다 lineTotal 을 불러 금액 배열을 만들고, reduce 로 모두 더해 75900원을 구해요. 그다음 shippingFee 를 불러 배송비 0원을 받고 합계와 함께 객체로 돌려줘요.',
             "keywords": ['map', 'lineTotal', 'reduce', 'shippingFee', '75900']},
        ],
    },
    {
        "id": 'js-point', "language": 'javascript', "level": 3,
        "topic": '포인트 카드', "title": '카페 포인트 카드 (등급과 예외)',
        "output": ['민지: 225점 적립', '민지: 400점 적립, 실버 등급이 됐어요', '준호: 실패 (포인트가 0점뿐이에요)', '민지: 1400점 적립, 골드 등급이 됐어요', '준호: 실패 (결제 금액이 이상해요)', '준호: 실패 (모르는 요청: gift)', '민지 — 골드, 2025점, 결제 32500원', '준호 — 기본, 0점, 결제 0원', '실패 코드: NOT_ENOUGH, BAD_PRICE, UNKNOWN'],
        "code": """// 카페 포인트 카드 (클래스와 예외 처리)
class PointError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const GRADES = [
  { name: "골드", min: 30000, rate: 0.1 },
  { name: "실버", min: 10000, rate: 0.07 },
  { name: "기본", min: 0, rate: 0.05 },
];

class PointCard {
  constructor(owner) {
    this.owner = owner;
    this.points = 0;
    this.spent = 0;
  }

  get grade() {
    return GRADES.find((g) => this.spent >= g.min);
  }

  earn(price) {
    if (price <= 0) {
      throw new PointError("결제 금액이 이상해요", "BAD_PRICE");
    }
    const gained = Math.floor(price * this.grade.rate);
    this.spent += price;
    this.points += gained;
    return gained;
  }

  use(amount) {
    if (amount > this.points) {
      throw new PointError(`포인트가 ${this.points}점뿐이에요`, "NOT_ENOUGH");
    }
    this.points -= amount;
  }
}

class Cafe {
  constructor() {
    this.cards = new Map();
    this.errors = [];
  }

  card(owner) {
    if (!this.cards.has(owner)) {
      this.cards.set(owner, new PointCard(owner));
    }
    return this.cards.get(owner);
  }

  handle(event) {
    const card = this.card(event.owner);
    if (event.type === "pay") {
      const before = card.grade.name;
      const gained = card.earn(event.price);
      const note = card.grade.name === before ? "" : `, ${card.grade.name} 등급이 됐어요`;
      return `${gained}점 적립${note}`;
    }
    if (event.type !== "use") {
      throw new PointError(`모르는 요청: ${event.type}`, "UNKNOWN");
    }
    card.use(event.amount);
    return `${event.amount}점 사용, ${card.points}점 남음`;
  }

  runAll(events, onDone) {
    for (const event of events) {
      try {
        onDone(event.owner, this.handle(event));
      } catch (error) {
        if (!(error instanceof PointError)) {
          throw error;
        }
        this.errors.push(error.code);
        onDone(event.owner, `실패 (${error.message})`);
      }
    }
  }
}

const cafe = new Cafe();
cafe.runAll([
  { owner: "민지", type: "pay", price: 4500 },
  { owner: "민지", type: "pay", price: 8000 },
  { owner: "준호", type: "use", amount: 100 },
  { owner: "민지", type: "pay", price: 20000 },
  { owner: "준호", type: "pay", price: -1000 },
  { owner: "준호", type: "gift", amount: 300 },
], (owner, message) => console.log(`${owner}: ${message}`));

for (const card of cafe.cards.values()) {
  console.log(`${card.owner} — ${card.grade.name}, ${card.points}점, 결제 ${card.spent}원`);
}
console.log("실패 코드:", cafe.errors.join(", "));""",
        "units": [
            {"start": 26, "end": 33, "kind": 'function', "key": True,
             "explanation": 'earn 은 결제 전 누적 금액(spent)으로 정한 등급의 적립률로 포인트를 계산한 뒤 spent 와 points 를 늘려요. 그래서 8000원은 아직 기본 등급(5%)이라 400점, 20000원은 실버(7%)라 1400점이 쌓여요.',
             "keywords": ['spent', '등급', '적립률', '400점', '1400점']},
            {"start": 59, "end": 66, "kind": 'function', "key": True,
             "explanation": 'handle 은 type 이 pay 면 적립 전후의 등급 이름을 비교해 달라졌을 때만 등급 안내를 붙여요. use 도 아니면 PointError 를 던져서 gift 요청은 실패해요. 두 번째 결제에서 실버, 세 번째 결제에서 골드 안내가 붙어요.',
             "keywords": ['pay', '전후', '비교', 'PointError', '골드']},
            {"start": 74, "end": 81, "kind": 'block', "key": True,
             "explanation": 'runAll 은 요청마다 try 안에서 handle 을 부르고 결과를 콜백 onDone 으로 넘겨요. PointError 면 code 를 errors 에 넣고 실패 안내를 넘긴 뒤 다음 요청으로 가고, 다른 오류는 다시 던져요. 실패 코드는 NOT_ENOUGH, BAD_PRICE, UNKNOWN 이에요.',
             "keywords": ['try', 'onDone', 'PointError', 'errors', '다시 던져']},
        ],
    },
]

# 랜덤 주제 (학습자가 주제를 적지 않았을 때)
TOPIC_POOL = [
    '카페 주문', '도서관 대출', '성적 처리', '게임 점수판', '버스 도착 안내', '가계부',
    '편의점 재고', '택배 배송 조회', '날씨 알림', '운동 기록', '영화 예매', '식단 칼로리 계산',
    '주차 요금 계산', '할 일 목록', '단어장 퀴즈', '출석 체크', '쇼핑몰 장바구니', '물 마시기 알림',
    '용돈 기입장', '반려동물 산책 기록', '독서 기록', '엘리베이터 운행', '자판기', '놀이공원 대기줄',
    '학교 급식 메뉴', '회원 가입 검사', '비밀번호 규칙 검사', '음악 재생 목록', '수강 신청', '은행 계좌',
    '지하철 최단 경로', '배달 주문 고르기', '강의실 배정', '택배 차량 적재', '회의 일정 겹침 찾기', '도서 추천 순위',
    '미로 탈출 길 찾기', '주차장 빈자리 배정', '놀이공원 대기열', '음식점 웨이팅 호출', '가계부 지출 분석 리포트', '버스 환승 경로',
]

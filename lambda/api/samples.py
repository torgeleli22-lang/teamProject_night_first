"""
예시 코드 (samples.py) — jojo_api 함수 안의 파일

AI 를 쓸 수 없을 때(관리자가 AI 를 껐거나, 월 예산에 닿았거나, AI_MODE=mock) 연습 모드가 이 코드를 대신 내 줘요.
AI 가 만드는 코드와 모양이 같아요:
  topic   생활 속 주제        level  1 입문 · 2 초급 · 3 중급
  code    Python 코드         marks  ※ 꼭 설명할 곳 (줄 범위 + 모범 설명 + 핵심 표현)
모범 설명(explanation)과 핵심 표현(keywords)은 첨삭을 받은 뒤에만 화면에 보여요.
코드를 고치면 npm run verify 로 실제 실행·※ 줄 범위를 확인하세요.
"""

SAMPLES = [
    {
        "id": "sample-cafe",
        "level": 1,
        "topic": "카페 주문",
        "title": "카페 주문 합계",
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
        "marks": [
            {"start": 6, "end": 8, "why": "반복문이 합계를 만드는 곳",
             "explanation": "order 의 메뉴를 하나씩 꺼내 menu 에서 가격을 찾고 total 에 더해요. 반복이 끝나면 total 은 3000 + 3500 + 3500 = 10000원이에요.",
             "keywords": ["하나씩", "가격", "더해", "10000"]},
            {"start": 10, "end": 12, "why": "조건에 따라 금액이 바뀌는 곳",
             "explanation": "합계가 10000원 이상이면 1000원을 빼고 안내 문구를 출력해요. 지금은 정확히 10000원이라 조건이 참이 되어 9000원이 돼요.",
             "keywords": ["이상", "할인", "1000", "9000"]},
        ],
    },
    {
        "id": "sample-grade",
        "level": 1,
        "topic": "성적 처리",
        "title": "시험 점수로 등급 매기기",
        "code": """# 시험 점수로 등급 매기기
scores = [95, 72, 88, 55]
passed = 0

for score in scores:
    if score >= 90:
        grade = "A"
    elif score >= 70:
        grade = "B"
    else:
        grade = "재시험"
    print(score, "점 →", grade)
    if grade != "재시험":
        passed += 1

print("통과한 학생:", passed, "명")""",
        "marks": [
            {"start": 6, "end": 11, "why": "등급을 정하는 순서",
             "explanation": "점수를 위에서부터 차례로 검사해요. 90 이상이면 A, 아니면 70 이상인지 보고 B, 둘 다 아니면 재시험이에요. 먼저 맞은 조건 하나만 실행돼요.",
             "keywords": ["차례", "90", "70", "하나만"]},
            {"start": 13, "end": 14, "why": "통과한 학생을 세는 곳",
             "explanation": "등급이 재시험이 아니면 passed 를 1 늘려요. 95·72·88점 세 명이 통과해서 마지막에 3명이 출력돼요.",
             "keywords": ["재시험", "아니", "1", "3명"]},
        ],
    },
    {
        "id": "sample-store",
        "level": 2,
        "topic": "편의점 재고",
        "title": "편의점 재고 관리",
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
        "marks": [
            {"start": 8, "end": 16, "why": "재고 상태를 정하는 함수",
             "explanation": "상품 이름을 받아 재고 상태를 글자로 돌려줘요. 없는 상품 → 품절(0개) → 재고 부족(10개 미만) → 충분 순서로 검사하고, 먼저 맞는 조건에서 바로 돌려줘요.",
             "keywords": ["상태", "없는 상품", "품절", "10개", "순서"]},
            {"start": 19, "end": 22, "why": "check_stock 을 불러 판매를 막는 곳",
             "explanation": "sell 은 먼저 check_stock 을 불러 상태를 받아요. 없는 상품이거나 품절이면 판매 불가 메시지를 찍고 False 를 돌려주며 끝나요. 컵라면이 여기서 멈춰요.",
             "keywords": ["check_stock", "판매 불가", "False", "끝"]},
            {"start": 29, "end": 34, "why": "발주가 필요한 상품을 모으는 곳",
             "explanation": "inventory 의 상품마다 check_stock 을 불러 품절이나 재고 부족이면 need 에 넣어요. 바나나우유(3개 남음)와 컵라면이 들어가서 ['바나나우유', '컵라면'] 이 출력돼요.",
             "keywords": ["상품마다", "check_stock", "need", "바나나우유", "컵라면"]},
        ],
    },
    {
        "id": "sample-library",
        "level": 2,
        "topic": "도서관 대출",
        "title": "도서관 대출 관리",
        "code": """# 도서관 대출 관리
books = {"어린 왕자": True, "해리 포터": False, "데미안": True}   # True: 빌릴 수 있음
loans = {}

def borrow(name, title):
    if title not in books:
        return "없는 책이에요"
    if not books[title]:
        return "이미 대출 중이에요"
    books[title] = False
    loans[title] = name
    return f"{name}님이 {title}을(를) 빌렸어요"

def give_back(title):
    if title in loans:
        books[title] = True
        del loans[title]

print(borrow("민지", "어린 왕자"))
print(borrow("준호", "어린 왕자"))
give_back("어린 왕자")
print(borrow("준호", "어린 왕자"))""",
        "marks": [
            {"start": 6, "end": 9, "why": "빌릴 수 있는지 검사하는 순서",
             "explanation": "먼저 책이 목록에 있는지, 다음으로 지금 빌릴 수 있는지(True) 확인해요. 둘 중 하나라도 걸리면 바로 return 해서 아래 줄은 실행되지 않아요.",
             "keywords": ["목록", "대출 중", "True", "먼저", "return"]},
            {"start": 10, "end": 12, "why": "대출을 기록하는 곳",
             "explanation": "빌릴 수 있으면 books 를 False 로 바꿔 대출 중으로 표시하고, loans 에 누가 빌렸는지 적은 뒤 안내 문구를 돌려줘요.",
             "keywords": ["False", "loans", "누가", "기록"]},
            {"start": 19, "end": 22, "why": "실행 순서에 따라 결과가 달라지는 곳",
             "explanation": "민지가 먼저 빌려서 준호의 첫 요청은 '이미 대출 중이에요'가 돼요. give_back 으로 다시 True 가 되면 준호가 빌릴 수 있어요.",
             "keywords": ["민지", "준호", "이미", "반납", "다시"]},
        ],
    },
    {
        "id": "sample-bank",
        "level": 3,
        "topic": "은행 계좌",
        "title": "은행 계좌 (클래스와 예외 처리)",
        "code": """# 은행 계좌 (클래스와 예외 처리)
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        self.history = []

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("입금액은 0보다 커야 해요")
        self.balance += amount
        self.history.append(("입금", amount))

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("잔액이 부족해요")
        self.balance -= amount
        self.history.append(("출금", amount))


acc = Account("지수", 10000)
for kind, amount in [("입금", 5000), ("출금", 20000), ("출금", 3000)]:
    try:
        if kind == "입금":
            acc.deposit(amount)
        else:
            acc.withdraw(amount)
    except ValueError as e:
        print(kind, amount, "실패:", e)

print(acc.owner, "잔액:", acc.balance)
print("기록:", acc.history)""",
        "marks": [
            {"start": 14, "end": 18, "why": "출금이 막히는 조건",
             "explanation": "출금액이 잔액보다 크면 ValueError 를 일으키고 함수가 바로 멈춰요. 그래서 잔액과 기록은 바뀌지 않아요. 충분하면 잔액에서 빼고 기록에 남겨요.",
             "keywords": ["잔액", "크면", "ValueError", "멈", "바뀌지"]},
            {"start": 23, "end": 29, "why": "오류가 나도 반복이 이어지는 곳",
             "explanation": "try 안에서 오류가 나면 except 로 건너뛰어 실패 메시지를 출력하고, 반복은 다음 거래로 계속돼요. 2만 원 출금만 실패해요.",
             "keywords": ["try", "except", "건너", "계속", "실패"]},
            {"start": 31, "end": 32, "why": "마지막 상태",
             "explanation": "10000 + 5000 - 3000 = 12000원이 남고, 기록에는 성공한 입금 5000과 출금 3000 두 건만 있어요.",
             "keywords": ["12000", "두 건", "성공"]},
        ],
    },
    {
        "id": "sample-folder",
        "level": 3,
        "topic": "폴더 용량 계산",
        "title": "폴더 안 파일 크기 합치기 (재귀)",
        "code": """# 폴더 안 파일 크기 합치기 (재귀)
folder = {
    "사진": {"여행.jpg": 300, "가족.jpg": 200},
    "문서": {"과제.pdf": 120, "백업": {"옛날.pdf": 80}},
    "메모.txt": 5,
}

def total_size(item):
    if isinstance(item, int):
        return item
    size = 0
    for name, child in item.items():
        size += total_size(child)
    return size

def biggest(folder):
    best_name, best_size = None, -1
    for name, child in folder.items():
        s = total_size(child)
        if s > best_size:
            best_name, best_size = name, s
    return best_name, best_size

print("전체:", total_size(folder))
print("가장 큰 것:", biggest(folder))""",
        "marks": [
            {"start": 9, "end": 10, "why": "재귀가 멈추는 곳",
             "explanation": "숫자(파일 크기)를 만나면 더 들어가지 않고 그 값을 그대로 돌려줘요. 재귀가 멈추는 곳이에요.",
             "keywords": ["숫자", "멈", "그대로", "파일"]},
            {"start": 12, "end": 14, "why": "자기 자신을 다시 부르는 곳",
             "explanation": "폴더(딕셔너리)면 안의 항목마다 total_size 를 다시 불러 크기를 더해요. 백업 폴더처럼 안에 폴더가 있어도 같은 방법으로 끝까지 들어가요.",
             "keywords": ["다시", "항목마다", "더해", "폴더", "안"]},
            {"start": 18, "end": 21, "why": "가장 큰 항목을 고르는 곳",
             "explanation": "맨 위 항목마다 크기를 구해 지금까지 가장 큰 것보다 크면 바꿔요. 사진 500, 문서 200, 메모 5 라서 ('사진', 500) 이 돼요.",
             "keywords": ["가장", "크면", "바꿔", "사진", "500"]},
        ],
    },
    {
        "id": "sample-subway",
        "level": 4,
        "topic": "지하철 최단 경로",
        "title": "지하철 최단 경로 안내",
        "code": """# 지하철 최단 경로 안내 (다익스트라 알고리즘)
import heapq

# 역 사이를 이동하는 데 걸리는 시간(분)과 노선
LINKS = [
    ("시청", "종각", 2, "1호선"),
    ("종각", "종로3가", 2, "1호선"),
    ("종로3가", "동대문", 3, "1호선"),
    ("시청", "을지로입구", 2, "2호선"),
    ("을지로입구", "을지로3가", 2, "2호선"),
    ("을지로3가", "동대문역사문화공원", 3, "2호선"),
    ("종로3가", "을지로3가", 2, "3호선"),
    ("을지로3가", "충무로", 2, "3호선"),
    ("동대문", "동대문역사문화공원", 2, "4호선"),
    ("충무로", "동대문역사문화공원", 3, "4호선"),
]
TRANSFER_MINUTES = 4


class SubwayMap:
    def __init__(self, links):
        self.graph = {}
        for a, b, minutes, line in links:
            self.add_link(a, b, minutes, line)
            self.add_link(b, a, minutes, line)

    def add_link(self, start, end, minutes, line):
        if minutes <= 0:
            raise ValueError(f"{start}-{end} 이동 시간이 잘못됐어요")
        self.graph.setdefault(start, []).append((end, minutes, line))

    def stations(self):
        return sorted(self.graph)

    def neighbors(self, station):
        if station not in self.graph:
            raise KeyError(f"없는 역이에요: {station}")
        return self.graph[station]


def shortest_route(subway, start, goal):
    # 상태 = (역, 타고 있는 노선). 노선이 바뀌면 환승 시간을 더한다
    best = {(start, None): 0}
    previous = {}
    queue = [(0, start, None)]
    while queue:
        minutes, station, line = heapq.heappop(queue)
        if station == goal:
            return minutes, rebuild_path(previous, (station, line))
        if minutes > best.get((station, line), float("inf")):
            continue
        for nxt, cost, nxt_line in subway.neighbors(station):
            extra = TRANSFER_MINUTES if line is not None and line != nxt_line else 0
            total = minutes + cost + extra
            state = (nxt, nxt_line)
            if total < best.get(state, float("inf")):
                best[state] = total
                previous[state] = (station, line)
                heapq.heappush(queue, (total, nxt, nxt_line))
    return None, []


def rebuild_path(previous, state):
    path = [state]
    while state in previous:
        state = previous[state]
        path.append(state)
    path.reverse()
    return path


def count_transfers(path):
    lines = [line for _, line in path if line is not None]
    transfers = 0
    for before, after in zip(lines, lines[1:]):
        if before != after:
            transfers += 1
    return transfers


def describe(path):
    steps = []
    for (station, _), (nxt, line) in zip(path, path[1:]):
        if steps and steps[-1][0] == line:
            steps[-1][2] = nxt
        else:
            steps.append([line, station, nxt])
    return [f"{line}: {a} → {b}" for line, a, b in steps]


def plan_trip(subway, start, goal):
    if start == goal:
        return {"minutes": 0, "transfers": 0, "steps": ["출발역과 도착역이 같아요"]}
    minutes, path = shortest_route(subway, start, goal)
    if minutes is None:
        return {"minutes": None, "transfers": 0, "steps": ["갈 수 있는 길이 없어요"]}
    return {"minutes": minutes, "transfers": count_transfers(path), "steps": describe(path)}


def compare_trips(subway, trips):
    results = []
    for start, goal in trips:
        try:
            plan = plan_trip(subway, start, goal)
        except KeyError as error:
            print("안내 실패:", error)
            continue
        results.append((plan["minutes"], start, goal, plan))
    results.sort(key=lambda r: (r[0] is None, r[0] or 0))
    return results


def print_plan(start, goal, plan):
    print(f"[{start} → {goal}] {plan['minutes']}분, 환승 {plan['transfers']}번")
    for step in plan["steps"]:
        print("  -", step)


def busiest_station(subway):
    counts = {}
    for station in subway.stations():
        lines = {line for _, _, line in subway.neighbors(station)}
        counts[station] = len(lines)
    top = max(counts.values())
    return sorted(s for s, c in counts.items() if c == top), top


subway = SubwayMap(LINKS)
trips = [("시청", "동대문"), ("종각", "충무로"), ("시청", "강남"), ("을지로입구", "을지로입구")]
for minutes, start, goal, plan in compare_trips(subway, trips):
    print_plan(start, goal, plan)

hubs, line_count = busiest_station(subway)
print("노선이 가장 많이 지나는 역:", ", ".join(hubs), f"({line_count}개 노선)")""",
        "marks": [
            {"start": 21, "end": 25, "why": "그래프를 어떤 모양으로 만드는지",
             "explanation": "LINKS 의 구간 하나마다 add_link 를 두 번 불러 양쪽 방향으로 넣어요. 그래서 graph 는 역 이름 → [(다음 역, 걸리는 분, 노선), …] 모양의 딕셔너리가 되고, 시청에서 종각으로도 종각에서 시청으로도 갈 수 있어요.",
             "keywords": ["양쪽 방향", "딕셔너리", "다음 역", "노선"]},
            {"start": 46, "end": 51, "why": "우선순위 큐에서 꺼내는 순서와 건너뛰는 조건",
             "explanation": "heappop 은 지금까지 걸린 시간이 가장 짧은 상태를 먼저 꺼내요. 도착역이면 바로 시간과 경로를 돌려주고, 이미 더 짧은 시간으로 기록된 상태라면 continue 로 건너뛰어 같은 역을 쓸데없이 다시 보지 않아요.",
             "keywords": ["가장 짧은", "먼저 꺼내", "도착", "건너뛰"]},
            {"start": 52, "end": 59, "why": "환승 시간을 더하고 더 짧으면 기록을 바꾸는 곳",
             "explanation": "이웃 역으로 갈 때 타고 있던 노선과 다음 노선이 다르면 환승 시간 4분을 더해요. 그 합계가 지금까지 기록보다 짧을 때만 best 와 previous 를 새로 쓰고 큐에 넣어서, 나중에 경로를 거꾸로 따라갈 수 있게 해요.",
             "keywords": ["환승", "4분", "더 짧", "previous", "큐에 넣"]},
            {"start": 63, "end": 69, "why": "경로를 거꾸로 따라가 되돌리는 곳",
             "explanation": "도착 상태에서 시작해 previous 에 적힌 바로 앞 상태를 계속 따라가며 path 에 붙여요. 출발역에 닿으면 previous 에 없어서 멈추고, 거꾸로 쌓였으니 reverse 로 출발 → 도착 순서로 뒤집어요.",
             "keywords": ["거꾸로", "앞 상태", "멈추", "뒤집"]},
            {"start": 81, "end": 88, "why": "같은 노선 구간을 하나로 묶는 곳",
             "explanation": "경로의 두 역씩 짝지어 보면서 앞 구간과 노선이 같으면 마지막 묶음의 도착역만 바꾸고, 노선이 바뀌면 새 묶음을 시작해요. 그래서 시청→종각→종로3가→동대문은 '1호선: 시청 → 동대문' 한 줄이 돼요.",
             "keywords": ["같은 노선", "묶", "도착역만 바꾸", "새 묶음"]},
        ],
    },
    {
        "id": "sample-delivery",
        "level": 4,
        "topic": "배달 주문 고르기",
        "title": "배달 기사 하루 주문 고르기",
        "code": """# 배달 기사 하루 주문 고르기 (동적 계획법 + 이진 탐색)
from bisect import bisect_right


class Order:
    def __init__(self, order_id, start, end, fee):
        if end <= start:
            raise ValueError(f"{order_id}: 끝나는 시각이 시작보다 빨라요")
        if fee < 0:
            raise ValueError(f"{order_id}: 배달비가 음수예요")
        self.order_id = order_id
        self.start = start
        self.end = end
        self.fee = fee

    def minutes(self):
        return self.end - self.start

    def __repr__(self):
        return f"{self.order_id}({fmt(self.start)}~{fmt(self.end)}, {self.fee}원)"


def fmt(minute):
    return f"{minute // 60:02d}:{minute % 60:02d}"


def parse_time(text):
    hour, minute = text.split(":")
    return int(hour) * 60 + int(minute)


def load_orders(rows):
    orders = []
    skipped = []
    for order_id, start, end, fee in rows:
        try:
            orders.append(Order(order_id, parse_time(start), parse_time(end), fee))
        except ValueError as error:
            skipped.append(str(error))
    return orders, skipped


def last_compatible(orders, ends, i):
    # i 번째 주문이 시작하기 전에 끝나는 주문 중 가장 늦은 것의 위치 (없으면 -1)
    return bisect_right(ends, orders[i].start) - 1


def best_schedule(orders):
    orders = sorted(orders, key=lambda o: o.end)
    ends = [o.end for o in orders]
    n = len(orders)
    best = [0] * (n + 1)
    take = [False] * n
    for i in range(n):
        j = last_compatible(orders, ends, i)
        with_it = orders[i].fee + best[j + 1]
        without_it = best[i]
        if with_it > without_it:
            best[i + 1] = with_it
            take[i] = True
        else:
            best[i + 1] = without_it
    return best[n], trace_back(orders, ends, take)


def trace_back(orders, ends, take):
    chosen = []
    i = len(orders) - 1
    while i >= 0:
        if take[i]:
            chosen.append(orders[i])
            i = last_compatible(orders, ends, i)
        else:
            i -= 1
    chosen.reverse()
    return chosen


def greedy_by_fee(orders):
    # 비교용: 배달비가 큰 것부터 겹치지 않으면 담는 방법
    chosen = []
    for order in sorted(orders, key=lambda o: -o.fee):
        if all(order.end <= c.start or c.end <= order.start for c in chosen):
            chosen.append(order)
    chosen.sort(key=lambda o: o.start)
    return sum(o.fee for o in chosen), chosen


def idle_minutes(chosen, day_start, day_end):
    idle = 0
    now = day_start
    for order in chosen:
        idle += max(0, order.start - now)
        now = max(now, order.end)
    return idle + max(0, day_end - now)


def report(title, total, chosen, day_start, day_end):
    print(f"[{title}] 총 {total}원, 주문 {len(chosen)}개, 쉬는 시간 {idle_minutes(chosen, day_start, day_end)}분")
    for order in chosen:
        print("  -", order)


ROWS = [
    ("A", "10:00", "10:40", 6000),
    ("B", "10:30", "11:20", 9000),
    ("C", "10:50", "11:30", 5000),
    ("D", "11:20", "12:10", 8000),
    ("E", "11:40", "12:00", 4000),
    ("F", "12:00", "13:00", 12000),
    ("G", "12:10", "12:40", 7000),
    ("H", "12:40", "13:30", 6500),
    ("I", "13:00", "12:30", 3000),
]

orders, skipped = load_orders(ROWS)
for message in skipped:
    print("건너뜀:", message)

start_of_day, end_of_day = parse_time("10:00"), parse_time("13:30")
dp_total, dp_chosen = best_schedule(orders)
greedy_total, greedy_chosen = greedy_by_fee(orders)
report("동적 계획법", dp_total, dp_chosen, start_of_day, end_of_day)
report("배달비 큰 순", greedy_total, greedy_chosen, start_of_day, end_of_day)
print("동적 계획법이 더 번 금액:", dp_total - greedy_total, "원")""",
        "marks": [
            {"start": 32, "end": 40, "why": "잘못된 주문을 걸러 내는 흐름",
             "explanation": "줄마다 시각을 분으로 바꿔 Order 를 만들고, 끝나는 시각이 시작보다 빠르면 Order 가 ValueError 를 던져요. except 에서 그 메시지를 skipped 에 모으고 다음 줄로 넘어가서, I 주문만 빠지고 나머지 8개로 계속해요.",
             "keywords": ["ValueError", "skipped", "건너", "나머지"]},
            {"start": 43, "end": 45, "why": "이진 탐색으로 앞 주문을 찾는 곳",
             "explanation": "끝나는 시각 순으로 정렬된 ends 에서 i 번째 주문의 시작 시각보다 늦지 않게 끝나는 위치를 bisect_right 로 찾고 1을 빼요. 그래서 i 번째 주문 바로 앞에 겹치지 않게 할 수 있는 마지막 주문의 번호가 나오고, 없으면 -1 이에요.",
             "keywords": ["이진 탐색", "끝나는 시각", "겹치지 않", "-1"]},
            {"start": 54, "end": 62, "why": "동적 계획법 표를 채우는 곳",
             "explanation": "best[i+1] 은 앞에서부터 i 번째 주문까지 봤을 때 벌 수 있는 최대 금액이에요. i 번째를 하면 그 배달비 + 겹치지 않는 앞 주문까지의 best, 안 하면 best[i] 를 비교해 큰 쪽을 적고, 했는지는 take 에 남겨요.",
             "keywords": ["최대 금액", "하면", "안 하면", "큰 쪽", "take"]},
            {"start": 66, "end": 76, "why": "고른 주문을 거꾸로 찾아내는 곳",
             "explanation": "마지막 주문부터 거꾸로 보며 take 가 True 면 그 주문을 고르고 겹치지 않는 앞 주문 위치로 건너뛰어요. False 면 하나 앞으로 가요. 거꾸로 모았으니 reverse 로 시간 순서로 바꿔 B, D, G, H 가 돼요.",
             "keywords": ["거꾸로", "take", "건너뛰", "시간 순서"]},
            {"start": 79, "end": 86, "why": "비교용 욕심쟁이 방법이 왜 손해인지",
             "explanation": "배달비가 큰 F(12000원)부터 담고, 이미 담은 주문과 겹치지 않을 때만 더해요. 큰 주문 하나가 시간을 오래 차지해 D·G·H 를 못 하게 되어 25000원에 그치고, 동적 계획법(30500원)보다 5500원 적어요.",
             "keywords": ["큰 것부터", "겹치지 않", "오래 차지", "25000", "5500"]},
        ],
    },
]

# 랜덤으로 뽑기: 생활 속 주제 (최근에 푼 주제는 빼고 뽑아요)
TOPIC_POOL = [
    "카페 주문", "도서관 대출", "성적 처리", "게임 점수판", "버스 도착 안내", "가계부", "편의점 재고", "택배 배송 조회",
    "날씨 알림", "운동 기록", "영화 예매", "식단 칼로리 계산", "주차 요금 계산", "할 일 목록", "단어장 퀴즈", "출석 체크",
    "쇼핑몰 장바구니", "물 마시기 알림", "용돈 기입장", "반려동물 산책 기록", "독서 기록", "엘리베이터 운행", "자판기",
    "놀이공원 대기줄", "학교 급식 메뉴", "회원 가입 검사", "비밀번호 규칙 검사", "음악 재생 목록", "수강 신청", "은행 계좌",
]

# 고급 랜덤 주제: 자료구조·알고리즘이 자연스럽게 들어가는 생활 속 문제
ADVANCED_TOPIC_POOL = [
    "지하철 최단 경로", "배달 주문 고르기", "강의실 배정", "택배 차량 적재", "회의 일정 겹침 찾기", "도서 추천 순위",
    "미로 탈출 길 찾기", "주차장 빈자리 배정", "놀이공원 대기열", "음식점 웨이팅 호출", "가계부 지출 분석 리포트", "버스 환승 경로",
]

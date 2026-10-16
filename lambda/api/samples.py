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
]

# 랜덤으로 뽑기: 생활 속 주제 (최근에 푼 주제는 빼고 뽑아요)
TOPIC_POOL = [
    "카페 주문", "도서관 대출", "성적 처리", "게임 점수판", "버스 도착 안내", "가계부", "편의점 재고", "택배 배송 조회",
    "날씨 알림", "운동 기록", "영화 예매", "식단 칼로리 계산", "주차 요금 계산", "할 일 목록", "단어장 퀴즈", "출석 체크",
    "쇼핑몰 장바구니", "물 마시기 알림", "용돈 기입장", "반려동물 산책 기록", "독서 기록", "엘리베이터 운행", "자판기",
    "놀이공원 대기줄", "학교 급식 메뉴", "회원 가입 검사", "비밀번호 규칙 검사", "음악 재생 목록", "수강 신청", "은행 계좌",
]

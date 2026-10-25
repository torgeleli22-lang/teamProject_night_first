# 역할별 데이터 · pk/sk 만들기 · 화면 → Lambda 요청

1. 회원 · 비회원 · 관리자가 DynamoDB 의 어떤 항목을 쓰는지
2. pk·sk 를 어떻게 만들어 저장까지 하는지 (항목마다 코드와 실제 저장 모양)
3. 화면이 Lambda 함수 URL 로 JSON 요청을 보내는 방법 (주소·헤더·본문·응답·오류)

줄 번호는 지금 main 기준이에요. 함께 보면 좋은 문서: `docs/DB_STRUCTURE.md` (ERD 그림·관계), `docs/CODE_TOUR.md` (코드 따라 읽기), `docs/PROJECT_BRIEF.md` §9.2 (필드 표).

---

## 0. 먼저 알아 둘 것

- 테이블은 **`jojo_table` 하나**예요. "회원 테이블", "관리자 테이블"이 따로 있지 않아요.
  역할마다 **같은 테이블 안의 다른 항목(pk·sk 종류)**을 써요.
- 모든 항목의 주소는 **pk(파티션 키) + sk(정렬 키)** 두 문자열이에요.
- 자동 삭제: 항목에 `jojo_ttl`(유닉스 시각, 초)을 넣으면 그 시각 뒤 DynamoDB 가 지워요.

### 키 이름 규칙 3가지 (`common.py` 4번 구역 위 표)

1. **pk = 무엇의 것인지 + id** — `USER#<학습자 id>`, `CODE#<코드 id>`, `LOGIN#<토큰>` … 한 사람·한 코드의 것이 한 서랍(pk)에 모여요.
2. **sk = 종류 (+ 시각·번호)** — `PROFILE`, `STUDYREC#<코드 id>`, `INFO`, `REVIEW#<시각>`, `REVIEW#<시각>#RETRY#002` …
3. **운영 데이터는 `OPS#` 로 시작** — `OPS#STATS`, `OPS#USAGE`, `OPS#AILOG`, `OPS#CONFIG`, `OPS#LIMIT`

이름은 모두 `common.py` 의 작은 함수로 만들어요: `user_pk(id)` · `studyrec_sk(코드 id)` · `code_pk(id)` · `login_pk(토큰)` · `account_pk("google:번호")` · `auth_pk(state)`, 그리고 고정 이름 `PROFILE` · `INFO` · `USER` · `STATE` · `OPS_…`.

> 예전 이름(`LEARNER`, `READ#…/CODE`, `STUDY#…/R#…`, `RETRY#…`, `CHAT#…`, `LOGIN`·`ACCOUNT`·`AUTH` 고정 pk, `STATS`·`USAGE`·`AILOG`·`META`·`RL`)으로 저장된 데이터는 관리자 화면의 **"예전 데이터 옮기기"**(`POST /admin/migrate`, `admin.py:190`)로 한 번에 새 이름으로 옮겨요. 바꾸는 규칙은 `admin.py:232` `new_key`(키), `admin.py:271` `new_fields`(필드 — `learnerId`·`owner` → `userId`, `readingId`·`id` → `codeId`, `formerIds` → `formerUserIds`, `rootId` → `rootCodeId`) 에 있어요.

### 서버는 요청한 사람이 누구인지 어떻게 알까요?

| 역할 | 화면이 보내는 헤더 | 그 값 | 화면이 보관하는 곳 | 서버가 확인하는 코드 |
|---|---|---|---|---|
| **비회원** | `x-session-id` | 학습자 id (uuid) | `sessionStorage` `codereading.sid` — **탭을 닫으면 사라짐** | `common.py:468` `get_user` 1번 단계: `USER#<id>/PROFILE` 을 바로 찾음 |
| **회원** (Google 로그인) | `x-session-id` | **로그인 토큰** (uuid) — 학습자 id 가 아님 | `localStorage` `codereading.login` — 브라우저를 닫아도 남음 | `get_user` 2번 단계: `LOGIN#<토큰>/USER` → `userId` → `USER#<id>/PROFILE` |
| **관리자** | `x-admin-token` | 관리자 코드 | `sessionStorage` `codereading.admin` | `admin.py:32` `require_admin`: 환경 변수 `ADMIN_TOKEN` 또는 `OPS#CONFIG/admin_code_hash` 와 비교 |

- 비회원과 회원은 **같은 헤더**를 써요. 서버가 그 값으로 `USER#<값>` 이 있는지(비회원), `LOGIN#<값>` 이 있는지(회원) 보고 구분해요.
- 회원의 실제 학습자 id 는 화면으로 보내지 않아요. 누가 회원 학습자 id 를 직접 헤더에 넣어도 1번 단계에서 `member` 이면 받지 않아요 (`common.py:476`).
- 관리자는 학습자가 아니에요. 관리자 경로(`/admin/...`)는 학습자를 만들지 않아요.

---

## 1. 역할별로 쓰는 항목

표의 기호: **C** 만들기 · **R** 읽기 · **U** 고치기 · **D** 지우기

### 1-1. 비회원 (로그인 안 함)

| 항목 (pk / sk) | C | R | U | D | 언제 | 자동 삭제 |
|---|---|---|---|---|---|---|
| `USER#<학습자 id>` / `PROFILE` | ● | ● | ● | | 처음 요청할 때 생성, 매 요청 확인, 주제 고를 때 최근 주제·난이도 저장 | 마지막 사용 후 **12시간** |
| `USER#<학습자 id>` / `STUDYREC#<코드 id>` | ● | ● | ● | | 첨삭 받을 때 기록 / 내 공부 화면 / 다시 써서 나아지면 갱신 | **24시간** |
| `CODE#<코드 id>` / `INFO` | ● | ● | | | 연습 코드 받기·더 쉽게/어렵게·내 코드 점검 시작 / 다시 열기 | **24시간** (올린 코드도 1일) |
| `CODE#<코드 id>` / `REVIEW#<시각>` | ● | ● | | | 첨삭 받기 / 결과 화면·다시 쓰기·튜터가 최신 첨삭 찾을 때 | 코드와 같이 |
| `CODE#<코드 id>` / `REVIEW#<첨삭 시각>#RETRY#<항목>` | ● | ● | ● | | 힌트 보고 다시 써 보기 (3번) | 코드와 같이 |
| `CODE#<코드 id>` / `REVIEW#<첨삭 시각>#CHAT#<항목>` | ● | ● | ● | | AI 튜터에게 질문 (10번) | 코드와 같이 |
| `AUTH#<state>` / `STATE` | ● | | | | 로그인 버튼을 누를 때 (회원이 되기 직전) | 10분 |

다시 쓰기·튜터 대화는 **그 첨삭의 sk 뒤에 붙여** 이름을 지어요. 그래서 `query_all(code_pk(id), prefix="REVIEW#")` 한 번(`common.py:891` `review_rows`)으로 첨삭과 그 아래 기록을 함께 읽어요. `#` 이 하나뿐인 sk(`REVIEW#<시각>`)가 첨삭 자체예요.

### 1-2. 회원 (Google 로그인)

비회원이 쓰는 항목을 **모두 똑같이** 쓰고, 다음이 달라요.

| 항목 (pk / sk) | C | R | U | D | 언제 | 자동 삭제 |
|---|---|---|---|---|---|---|
| `USER#<학습자 id>` / `PROFILE` | ● | ● | ● | | 처음 로그인할 때 `member: true`, 이름, 제공자, `formerUserIds` | **1년** (쓸 때마다 늘어남) |
| `ACCOUNT#google:<고유 번호>` / `USER` | ● | ● | | | 로그인할 때마다 "이 Google 계정의 학습자는 누구?" | 없음 |
| `LOGIN#<토큰>` / `USER` | ● | ● | ● | ● | 로그인 성공 시 생성 / 매 요청 확인 / 쓰는 동안 기한 연장 / 로그아웃 시 삭제 | **30일** (쓰면 늘어남) |
| `AUTH#<state>` / `STATE` | | ● | | ● | 로그인 콜백에서 확인하고 바로 삭제 (한 번만) | 10분 |
| `CODE#…` / `INFO` 등 | | | | | 보관 기간만 다름 | **30일** (올린 코드는 그대로 1일) |
| `USER#<학습자 id>` / `STUDYREC#…` | | | | | 보관 기간만 다름 | **1년** |

**로그인하는 순간 비회원 기록을 옮겨요** (`auth.py:207` `adopt_anonymous`):
- `USER#<비회원 id>/STUDYREC#…` → `USER#<회원 id>/STUDYREC#…` 로 **새로 쓰고 옛 줄은 삭제** (pk 는 바꿀 수 없어서 복사 후 삭제)
- 그 코드들의 `CODE#…/INFO` 는 `userId` 를 회원 id 로, 기한을 30일로 **고치기**
- 비회원 id 를 회원 `USER#…/PROFILE` 의 `formerUserIds` 에 기억 (로그인 전에 받은 코드도 계속 열리게)
- 비회원 `USER#<비회원 id>/PROFILE` **삭제**

### 1-3. 관리자

관리자는 학습 기록을 읽지 않고 **운영 항목(`OPS#`)**만 써요.

| 항목 (pk / sk) | C | R | U | D | 언제 | 코드 |
|---|---|---|---|---|---|---|
| `OPS#CONFIG` / `admin_code_hash` | ● | ● | ● | | 관리자 확인할 때마다 읽기 / 관리자 코드 바꾸기 | `admin.py:32`, `admin.py:178` |
| `OPS#CONFIG` / `ai_switch` | ● | ● | ● | | AI 켜기·끄기 | `admin.py:170` → `common.py:776` `set_meta` |
| `OPS#USAGE` / `<월>#<작업>#<모델>` | | ● | | | 작업별 AI 사용량·비용 | `admin.py:125` |
| `OPS#AILOG` / `<시각>` | | ● | | | 최근 AI 호출 기록 50건 | `admin.py:145` |
| `OPS#STATS` / `DAY#<날짜>` | | ● | | | 최근 2주 사용 수 (14번 `get_item`) | `admin.py:152` |
| `OPS#LIMIT` / `admin-fail:<IP>#<시간 칸>` | ● | ● | ● | | 관리자 코드를 틀리면 +1, 15분에 10번이면 잠금 | `admin.py:34`, `:46` |
| (예전 이름의 모든 항목) | ● | ● | | ● | "예전 데이터 옮기기" — 새 이름으로 쓰고 예전 것 삭제 | `admin.py:190` `migrate` |

### 1-4. 모두에게 공통 — 서버가 알아서 쓰는 항목

| 항목 | 누가 만들게 하나 | 언제 | 자동 삭제 |
|---|---|---|---|
| `OPS#LIMIT` / `all:<IP>#<분>` | 모든 요청 (관리자 경로 제외) | IP 당 1분 600번 제한 | 시간 칸 + 60초 |
| `OPS#LIMIT` / `new:<IP>#<시간>` | 새 학습자를 만들 때 | IP 당 1시간 120명 | 〃 |
| `OPS#LIMIT` / `ai-s:<학습자>#…` · `ai-ip:<IP>#…` · `ai-all#…` | AI 를 쓰는 요청 | 학습자·IP·전체 1시간 AI 요청 수 (`common.py:434` `ai_allowed`) | 〃 |
| `OPS#STATS` / `DAY#<날짜>` | 연습·더 쉽게·주제 판정·점검·첨삭·다시 쓰기·튜터 | 오늘 칸 +1 | 90일 |
| `OPS#USAGE` / `<월>#<작업>#<모델>` | AI 를 부를 때마다 | 호출 수·토큰·실패 누적 | 없음 |
| `OPS#AILOG` / `<시각>` | AI 를 부를 때마다 | 한 건씩 기록 | 14일 |
| `OPS#CONFIG` / `ai_switch` | AI 를 부르기 전 | 30초마다 읽어 AI 꺼짐 확인 (`common.py:529`, 값 `"on"`/`"off"`) | 없음 |

---

## 2. pk·sk 만들고 저장하기 — 항목마다

DB 도구는 모두 `common.py` 4번 구역에 있어요:
`get_item(pk, sk)` `:335` · `put_item(item)` `:339` · `update_item(pk, sk, set_values, add_values)` `:366` · `delete_item(pk, sk)` `:343` · `query_all(pk, prefix)` `:347`.
`put_item` 은 항목 딕셔너리 안에 `"pk"`, `"sk"` 를 함께 넣고, 나머지 함수는 pk·sk 를 따로 받아요.

### 2-1. 이름에 쓰는 재료

| 재료 | 만드는 코드 | 예 | 쓰는 곳 |
|---|---|---|---|
| 이름 함수 | `user_pk` · `studyrec_sk` · `code_pk` · `login_pk` · `account_pk` · `auth_pk` (`common.py` 4번 구역) | `user_pk("019a…")` → `USER#019a…` | 모든 pk·sk |
| 시간순 id | `new_id()` `common.py:932` — 시간순 UUID(버전 7): 앞 12글자 = 만든 시각(밀리초), 나머지 무작위 | `019a1b2c-3d4e-7f01-8a2b-5c6d7e8f9a0b` | 학습자 id, 코드 id |
| 무작위 id | `str(uuid.uuid4())` (파이썬 표준, 전부 무작위) | `3c90fba9-a5c3-4c44-b98e-e363f1dae667` | 로그인 토큰 (비밀번호 같은 값이라 시각을 넣지 않음) · 예전에 만든 학습자·코드 id |
| 시간순 번호 | `pad(time_id())` `common.py:326`, `:331` — 밀리초×1000 + 0~999, 앞을 0으로 16자리 | `1792592284764123` | `REVIEW#…`, `OPS#AILOG` |
| 한국 날짜 | `day_key()` `common.py:787` (UTC+9) | `2026-10-24` | `OPS#STATS` |
| 월 | `month_key()` `common.py:542` | `2026-10` | `OPS#USAGE` |
| 첨삭 아래 기록 키 | `review_key(review, kind, index)` `common.py:903` | `REVIEW#1792592284764123#CHAT#003` | 다시 쓰기·튜터 대화 |

> **시간순 UUID (`new_id`)**: 지금처럼 36글자 uuid 모양이라 id 검사(`SESSION_ID`, `load_code`)·화면 주소·예전 uuid4 데이터를 그대로 함께 쓸 수 있어요.
> 앞 12글자(하이픈 빼고)가 만든 시각(밀리초, 16진수)이라 콘솔에서 id 를 정렬하면 만든 순서가 되고, `int("019a1b2c3d4e", 16)` 로 시각을 꺼낼 수 있어요.
> 무작위 부분 74비트가 남아 있어 추측은 사실상 불가능해요 (그래도 코드는 userId 확인을 한 번 더 해요).

> 시각을 0으로 채워 자릿수를 맞추는 이유: sk 는 **글자 순서**로 정렬돼요. `"9"` 가 `"10"` 보다 뒤에 오는 일을 막아야 "가장 최근"을 정렬로 찾을 수 있어요.

### 2-2. 학습자 `USER#<학습자 id> / PROFILE` — 비회원

**언제**: `x-session-id` 가 없거나, 있는 id 가 기한이 지났을 때 (`get_user` 3번 단계)

```python
# lambda/api/common.py:488
item = {"pk": user_pk(new_id()), "sk": PROFILE,           # ① pk = USER# + 새 시간순 UUID, sk 는 고정 "PROFILE"
        "level": None, "recentTopics": [],
        "createdAt": now, "lastSeen": now,
        TTL_ATTR: ttl_after(keep_seconds(None, "user"))}  # ② 12시간 뒤 삭제
put_item(item)                                            # ③ 저장
req["user"] = user_from_item(item)                  # ④ id = pk 에서 "USER#" 를 뗀 값 → 응답 헤더 x-session-id 로 화면에 알려 줌 (reply)
```

**저장된 모양**
```json
{ "pk": "USER#019a1b2c-…", "sk": "PROFILE", "level": null, "recentTopics": [],
  "createdAt": 1792592284764, "lastSeen": 1792592284764, "jojo_ttl": 1792635484 }
```

**고치기**
- 15분마다 마지막 사용 시각·기한 연장: `common.py:499` `update_item(user_pk(id), PROFILE, set_values={"lastSeen": …, "jojo_ttl": …})`
- 주제를 고르면: `common.py:509` `update_item(user_pk(id), PROFILE, set_values={"recentTopics": […], "level": 2})`

### 2-3. 로그인 4단계 — `AUTH#` → `ACCOUNT#` → `USER#`(회원) → `LOGIN#`

**① 로그인 버튼** → `GET /auth/start` (`auth.py:56`)
```python
state = secrets.token_urlsafe(24)                           # 추측할 수 없는 일회용 값
put_item({"pk": auth_pk(state), "sk": STATE,                # auth.py:66  "AUTH#<state>" / "STATE"
          "provider": "google", "returnTo": "https://…/study/", "anonSid": "<비회원 id>",
          TTL_ATTR: ttl_after(600)})                        # 10분
# → Google 로그인 화면으로 302 (state 를 함께 넘김)
```

**② Google 이 돌려보냄** → `GET /auth/callback/google?code=…&state=…` (`auth.py:82`)
```python
saved = get_item(auth_pk(state), STATE)   # auth.py:85  우리가 보낸 state 인지
delete_item(auth_pk(state), STATE)        # auth.py:88  한 번만 쓰게 바로 삭제
profile = fetch_profile(...)              # auth.py:169 code → Google 토큰 → {"id": sub(고유 번호), "name": 이름}
```

**③ 계정 → 학습자** (`auth.py:190` `account_user`)
```python
key = account_pk(f"{provider}:{profile['id']}")              # auth.py:192  "ACCOUNT#google:1098…" (이름이 아닌 고유 번호)
account = get_item(key, USER)                                # 전에 로그인한 적이 있나?
if 있으면:  update_item(user_pk(account["userId"]), PROFILE, set_values={"name": …, "lastSeen": …, "jojo_ttl": 1년})
else:
    user_id = new_id()
    put_item({"pk": user_pk(user_id), "sk": PROFILE, "member": True, "name": "오준희", "provider": "google",
              "level": None, "recentTopics": [], …, TTL_ATTR: 1년})          # auth.py:201
    put_item({"pk": key, "sk": USER, "userId": user_id, …})           # auth.py:203
```
그다음 `adopt_anonymous(anonSid, user_id)` 로 비회원 기록을 옮겨요 (1-2 참고).

**④ 로그인 토큰**
```python
token = str(uuid.uuid4())                                    # auth.py:99
put_item({"pk": login_pk(token), "sk": USER, "userId": user_id, "provider": "google",
          "createdAt": …, TTL_ATTR: ttl_after(30 * 86400)})  # auth.py:100
# → 화면으로 302:  https://…/study/#login=<token>
```
화면은 `#login=` 값을 `localStorage` 에 저장하고(`src/lib/api.ts` `takeLoginFromUrl`), 이후 모든 요청 헤더에 넣어요.

**로그아웃** `POST /auth/logout`: `delete_item(login_pk(<토큰>), USER)` (`auth.py:110`)

**저장된 모양**
```json
{ "pk": "ACCOUNT#google:109876543210", "sk": "USER", "userId": "e5f6…", "createdAt": 1792… }
{ "pk": "LOGIN#9a8b7c6d-…", "sk": "USER", "userId": "e5f6…", "provider": "google", "jojo_ttl": 1795… }
{ "pk": "USER#e5f6…", "sk": "PROFILE", "member": true, "name": "오준희", "provider": "google",
  "formerUserIds": ["019a1b2c-…"], "level": 2, "recentTopics": ["카페 주문"], "jojo_ttl": 1824… }
```

### 2-4. 읽을 코드 `CODE#<코드 id> / INFO`

**언제**: 연습 코드 받기(`practice.py:153`), 더 쉽게·어렵게(`:173`), 내 코드 점검 시작(`inspect_code.py:71`)

```python
# lambda/api/common.py:870  save_code
code_id = new_id()                                                  # ① 새 코드 id (시간순 UUID)
keep = min(keep_seconds(user, fields.pop("keep", "code")), keep_seconds(user, "code"))
item = {"pk": code_pk(code_id), "sk": INFO,                         # ② pk = CODE# + id, sk = 고정 "INFO"
        "codeId": code_id, "userId": user["userId"],              #    userId = 만든 학습자 (나중에 내 것인지 확인)
        "language": …, "createdAt": now_ms(),
        "rootCodeId": … or code_id, "regenCount": …,                    #    더 쉽게·어렵게 횟수 세기
        TTL_ATTR: ttl_after(keep), **fields}                           #    source, level, topic, title, code, marks …
put_item(item)                                                         # ③ 저장
```
화면에는 `public_code(item)` (`common.py:914`) 으로 **모범 설명을 뺀** 모양만 보내요.

**저장된 모양** (marks 의 explanation·keywords 는 DB 에만 있어요)
```json
{ "pk": "CODE#3c90fba9-…", "sk": "INFO", "codeId": "3c90fba9-…", "userId": "019a1b2c-…",
  "source": "practice", "language": "python", "level": 1, "topic": "카페 주문", "title": "카페 주문 합계",
  "code": "# 카페 주문 합계 계산\nmenu = {…}\n…",
  "marks": [ { "id": "m1", "start": 6, "end": 8, "concept": "loop_update", "why": "반복문이 합계를 만드는 곳",
               "explanation": "order 의 메뉴를 하나씩 꺼내 … 10000원이에요.", "keywords": ["하나씩", "가격", "더해", "10000"] } ],
  "origin": "ai", "rootCodeId": "3c90fba9-…", "regenCount": 0, "createdAt": 1792…, "jojo_ttl": 1792… }
```

**읽기** `common.py:881` `load_code(code_id, user)`
1. id 가 36글자 uuid 모양인지 (아니면 400)
2. `get_item(code_pk(id), INFO)`
3. `userId` 가 나 또는 `formerUserIds` 중 하나인지 (아니면 404)

### 2-5. 첨삭 `CODE#<코드 id> / REVIEW#<시각>`

```python
# lambda/api/review.py:89  review 4번 단계
put_item({"pk": code_pk(item["codeId"]),                   # 같은 코드 서랍
          "sk": f"REVIEW#{pad(time_id())}",            # 시간순으로 정렬되는 칸 이름 → 첨삭할 때마다 새 줄
          "memos": memos, "result": result, "createdAt": now_ms(),
          TTL_ATTR: ttl_after(max(1, int(item.get(TTL_ATTR, 0) - now_ms() / 1000)))})   # 코드와 같은 날 삭제
```
**읽기** `common.py:891` `review_rows` — `query_all(code_pk(id), prefix="REVIEW#")` 로 첨삭과 그 아래 기록을 한 번에 읽고,
`common.py:896` `latest_review` 가 그중 `#` 이 하나뿐인 sk(첨삭 자체)의 마지막(최신) 것을 골라요.

### 2-6. 다시 써 보기 `REVIEW#<t>#RETRY#…` · 튜터 대화 `REVIEW#<t>#CHAT#…`

```python
rows = review_rows(id)                                  # 첨삭 + 그 아래 기록 (한 번 읽기)
rv = latest_review(id, rows)
key = review_key(rv, "RETRY", index)                    # common.py:903 → "REVIEW#1792592284764123#RETRY#002"
attempts = review_children(rv, "RETRY", rows).get(index, {}).get("attempts", [])   # review.py:134  있으면 이어서
attempts.append({...})
put_item({"pk": code_pk(id), "sk": key, "attempts": attempts, …})   # review.py:156  같은 키로 덮어써 이어 쓰기
```
튜터 대화도 같은 방식이에요: `tutor_chat.py:68` 읽기(`review_children(rv, "CHAT", rows)`) → `turns` 에 질문·답 추가 → `tutor_chat.py:94` 같은 키로 `put_item`.
`GET /code` 는 같은 `rows` 하나로 첨삭·대화·다시 쓰기를 모두 돌려줘요 (`practice.py` `get_code`).

### 2-7. 내 공부 `USER#<학습자 id> / STUDYREC#<코드 id>`

```python
# lambda/api/study.py:52  record_review
key = {"pk": user_pk(user["userId"]), "sk": studyrec_sk(code_item["codeId"])}   # 학습자 서랍 / 코드별 칸
old = get_item(key["pk"], key["sk"]) or {}                              # 전에 이 코드로 첨삭받았나 (횟수 세기)
put_item({**key, "codeId": code_item["codeId"], "source": …, "level": …, "language": …,
          "title": …, "counts": result["counts"], "items": [...개념·처음/최고 판정·내 설명...],
          "reviews": old.get("reviews", 0) + 1, "reviewedAt": now_ms(),
          TTL_ATTR: ttl_after(keep_seconds(user, "study"))})          # 비회원 1일 · 회원 1년
```
**읽기** `study.py:30` — `query_all(user_pk(user["userId"]), prefix="STUDYREC#")` 한 번으로 내 기록 전부 (`PROFILE` 은 prefix 가 달라 빠져요)

### 2-8. 운영 항목 `OPS#…` — `update_item` 의 ADD 로 숫자 더하기

```python
# 하루 사용 수  common.py:795
update_item(OPS_STATS, f"DAY#{day_key()}", set_values={TTL_ATTR: 90일}, add_values={"reviews": 1})

# AI 사용량  common.py:588
update_item(OPS_USAGE, f"{month}#{task}#{model}", set_values={마지막 시각·오류}, add_values={"calls": 1, "input": 토큰, …})

# 요청 수 제한  common.py:419
update_item(OPS_LIMIT, f"{key}#{window_start}", set_values={TTL_ATTR: 구간 끝 + 60}, add_values={"n": 1}, return_new=True)
```
- ADD 는 항목이 없으면 새로 만들어 주고, 여러 Lambda 가 동시에 더해도 숫자가 틀리지 않아요.
- AI 호출 기록은 한 건씩 새 줄: `put_item({"pk": OPS_AILOG, "sk": pad(time_id()), "task": …, "ok": …})` (`common.py:599`)
- 설정: `set_meta("ai_switch", "off")` → `put_item({"pk": "OPS#CONFIG", "sk": "ai_switch", "value": "off"})` (`common.py:776`, 관리자 `admin.py:172`)

---

## 3. 화면 → Lambda 함수 URL 요청

### 3-1. 전체 흐름

```
[브라우저 화면]                               [Lambda 함수 URL]                          [Lambda 코드]
src/lib/api.ts                                https://tmf42….lambda-url.ap-northeast-2.on.aws
  apiPost("/review", {...})
    └ fetch(POST, 헤더, JSON 본문) ────────▶  (HTTPS)  ──── event(JSON) ────▶  lambda_function.lambda_handler
                                                                                 ├ read_request(event)   요청 꺼내기
                                                                                 ├ run_route → review()  처리
  ◀──────── JSON 본문 + 헤더 ─────────────────  ◀── {"statusCode", "headers", "body"} ── reply()
    └ x-session-id 헤더 저장, 오류면 ApiError
```

### 3-2. 주소는 어디서 오나요?

```ts
// src/lib/api.ts
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787").replace(/\/$/, "");
export function apiUrl(path: string) { return `${API_URL}${path}`; }   // 예) https://…on.aws/review
```
- **배포 화면**: GitHub 저장소 변수 `API_URL` → `.github/workflows/pages.yml:38` 에서 빌드할 때 `NEXT_PUBLIC_API_URL` 로 넣어요. 정적 화면이라 주소가 빌드된 JS 안에 들어가요.
- **내 컴퓨터**: `npm run api` 가 같은 Lambda 코드를 `http://localhost:8787` 로 띄워요.
- 함수 URL 하나에 경로만 바꿔 모든 기능을 불러요 (`/practice`, `/review`, `/study` …). `/api` 같은 앞부분은 없어요.

### 3-3. 요청을 보내는 함수 (모든 화면이 이것만 써요)

```ts
// src/lib/api.ts  request()
const sid = readSession();                                   // ① localStorage 의 로그인 토큰 → 없으면 sessionStorage 의 학습자 id
res = await fetch(apiUrl(path), {
  method,                                                    // ② "GET" 또는 "POST" 두 가지만
  headers: {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),   // ③ 본문이 있으면 JSON 이라고 알림
    ...(sid ? { "x-session-id": sid } : {}),                 // ④ 누구인지 (처음이면 없음 → 서버가 새로 만듦)
    ...opts.headers,                                         // ⑤ 관리자 화면만: { "x-admin-token": 코드 }
  },
  body: body !== undefined ? JSON.stringify(body) : undefined,   // ⑥ 자바스크립트 객체 → JSON 문자열
});
const next = res.headers.get("x-session-id");                // ⑦ 서버가 알려 준 학습자 id·토큰 저장
if (next) saveSession(next);
const data = await res.json();
if (!res.ok) throw new ApiError(data.error, res.status);     // ⑧ 2xx 가 아니면 서버의 한국어 메시지로 오류
return data;
```
- `apiGet(path)` / `apiPost(path, body)` 가 이 함수를 불러요.
- 화면을 열 때 데이터가 필요하면 `useApi(path)` (GET + 로딩·오류 상태 관리).

### 3-4. 헤더 정리

**요청 헤더 (화면 → Lambda)**

| 헤더 | 언제 | 값 |
|---|---|---|
| `Content-Type` | POST (본문이 있을 때) | `application/json` |
| `x-session-id` | 두 번째 요청부터 (처음엔 없음) | 비회원: 학습자 id · 회원: 로그인 토큰 |
| `x-admin-token` | 관리자 화면의 요청만 | 관리자 코드 |
| `Origin` | 브라우저가 자동으로 | `https://torgeleli22-lang.github.io` |

**응답 헤더 (Lambda → 화면)** — `common.py:189` `reply`, `:176` `cors_headers`

| 헤더 | 값 | 이유 |
|---|---|---|
| `content-type` | `application/json; charset=utf-8` | 본문은 항상 JSON (한글 그대로) |
| `cache-control` | `no-store` | 사람마다 다른 응답이라 저장하지 않게 |
| `x-session-id` | 학습자 id 또는 로그인 토큰 | 처음 온 사람에게 id 를 알려 주고, 이후에도 확인용 |
| `access-control-allow-origin` | 허용한 화면 주소 (`ALLOWED_ORIGINS`) | **CORS**: 이 주소의 화면만 응답을 읽을 수 있음 |
| `access-control-allow-headers` | `content-type,x-session-id,x-admin-token` | 화면이 보내도 되는 헤더 |
| `access-control-expose-headers` | `x-session-id` | 이게 있어야 화면 JS 가 응답의 `x-session-id` 를 읽을 수 있음 |
| `access-control-allow-methods` | `GET,POST,OPTIONS` | |

### 3-5. CORS 사전 요청 (OPTIONS)

화면(`github.io`)과 Lambda(`lambda-url…on.aws`)는 주소가 달라요. 브라우저는 다른 주소로 `x-session-id` 같은 직접 만든 헤더나 JSON 을 보내기 전에 **먼저 `OPTIONS` 로 "보내도 되나요?"** 하고 물어요.

```
OPTIONS /review           ← 브라우저가 자동으로
Origin: https://torgeleli22-lang.github.io
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type,x-session-id

204 No Content            ← run_route 맨 처음 (common.py:201): OPTIONS 면 바로 CORS 헤더만 답함
access-control-allow-origin: https://torgeleli22-lang.github.io
access-control-allow-headers: content-type,x-session-id,x-admin-token
access-control-max-age: 86400     ← 하루 동안은 다시 묻지 않음
```
그래서 함수 URL 설정에서 CORS 를 따로 켜지 않아요 (코드가 직접 처리, `docs/DEPLOY_LAMBDA.md` 2단계).

### 3-6. Lambda 가 받는 event 와 돌려주는 값

함수 URL 은 HTTP 요청을 이런 JSON(event) 으로 바꿔 `lambda_handler(event, context)` 에 넘겨요 (필요한 부분만):
```json
{
  "rawPath": "/review",
  "rawQueryString": "",
  "headers": { "content-type": "application/json", "x-session-id": "a1b2c3d4-…", "origin": "https://torgeleli22-lang.github.io" },
  "body": "{\"codeId\":\"3c90fba9-…\",\"memos\":[…]}",
  "isBase64Encoded": false,
  "requestContext": { "domainName": "tmf42….lambda-url.ap-northeast-2.on.aws",
                      "http": { "method": "POST", "sourceIp": "211.234.…" } }
}
```
`read_request` (`common.py:139`) 가 이걸 다루기 쉬운 모양으로 바꿔요:
`{"method": "POST", "path": "/review", "query": {…}, "headers": {소문자 키}, "body": {JSON 을 푼 dict}, "ip": sourceIp, "origin": …}`
- 본문이 256KB(×1.4) 를 넘으면 413, JSON 이 아니면 400
- IP 는 화면이 보낸 헤더가 아니라 함수 URL 이 확인한 `sourceIp` 를 써요 (속일 수 없게)

`reply` 가 돌려주는 값 → 함수 URL 이 HTTP 응답으로 바꿔요:
```python
{"statusCode": 200,
 "headers": {"content-type": "application/json; charset=utf-8", "x-session-id": "a1b2…", "access-control-…": …},
 "body": "{\"summary\": \"메모를 붙여…\", …}"}    # JSON 문자열 (ensure_ascii=False 라 한글 그대로)
```

### 3-7. 상태 코드와 오류 모양

오류도 항상 같은 JSON 모양이에요: `{"error": "화면에 보여 줄 한국어 메시지"}`. 화면은 이 메시지를 그대로 분홍 포스트잇에 보여 줘요 (`ErrorNote`).

| 코드 | 언제 | 예 |
|---|---|---|
| 200 | 성공 | |
| 204 | OPTIONS (CORS 사전 요청) | |
| 302 | 로그인 시작·콜백 (다른 주소로 보내기) | |
| 400 | 요청 값이 틀림 (`field()` 검사, `common.py:223`) | `{"error": "주제를 골라 주세요."}` |
| 401 | 관리자 코드가 없거나 틀림 | `{"error": "관리자 권한이 필요해요."}` |
| 404 | 없는 경로 · 없거나 내 것이 아닌 코드 | `{"error": "코드를 찾을 수 없어요. 시간이 지나 지워졌을 수 있어요."}` |
| 413 | 본문이 너무 큼 | |
| 429 | 요청 수 제한 · 다시 만들기 5번 · 다시 쓰기 3번 등 | `{"error": "요청이 너무 많아요. 1분 뒤에 다시 시도해 주세요."}` |
| 500 | 예상 못 한 오류 (CloudWatch 로그에 남김) | `{"error": "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요."}` |

### 3-8. 전체 API 표

| 메서드 · 경로 | 누가 | 요청 본문 (POST) / 쿼리 (GET) | 응답 핵심 | 쓰는 DB 항목 |
|---|---|---|---|---|
| `GET /health` | 누구나 | — | `{ok, mode, ai, languages, maxCodeLines, regenLimit}` | (없음) |
| `GET /me` | 학습자 | — | `{member, name, provider, providers:{google, github}}` | USER#/PROFILE, LOGIN# |
| `GET /auth/start` | 학습자 | `?provider=google&return=<화면 주소>&sid=<비회원 id>` | 302 → Google | AUTH# |
| `GET /auth/callback/google` | (Google 이 부름) | `?code=…&state=…` | 302 → 화면`#login=<토큰>` | AUTH#, ACCOUNT#, USER#(PROFILE·STUDYREC#), LOGIN#, CODE#/INFO |
| `POST /auth/logout` | 회원 | `{}` | `{ok}` | LOGIN# |
| `GET /topic/random` | 학습자 | `?level=2` | `{topic}` | USER#/PROFILE |
| `POST /topic/check` | 학습자 | `{level, text}` | `{verdict, topic, suggestions, message}` | USER#/PROFILE, OPS#STATS, (AI) |
| `POST /practice` | 학습자 | `{level, topic, language, focus?}` | CodeItem (모범 설명 없음) | USER#/PROFILE, CODE#/INFO, OPS#STATS, (AI) |
| `POST /practice/adjust` | 학습자 | `{codeId, direction: "easier"\|"harder", reasons:[…]}` | 새 CodeItem | CODE#/INFO, OPS#STATS, (AI) |
| `GET /code` | 학습자 | `?codeId=<코드 id>` | `{codeItem, review, chats, retries}` | CODE#/INFO·REVIEW#… (첨삭·RETRY#·CHAT# 한 번에) |
| `POST /inspect` | 학습자 | `{code, filename}` | `{language, lines, code(가림), masked, functions, levelGuess}` | USER#/PROFILE |
| `POST /inspect/start` | 학습자 | `{code, filename, functions:[…]}` | CodeItem | CODE#/INFO, OPS#STATS, (AI) |
| `POST /review` | 학습자 | `{codeId, memos:[{start, end, text}]}` | `{summary, counts, items, byAi}` | CODE#/INFO·REVIEW#, USER#/STUDYREC#, OPS#STATS, (AI) |
| `POST /review/retry` | 학습자 | `{codeId, item, text}` | `{item, attempts, left}` | CODE#/REVIEW#…#RETRY#, USER#/STUDYREC#, OPS#STATS, (AI) |
| `POST /tutor` | 학습자 | `{codeId, item, message}` | `{item, turns, turnsLeft, byAi}` | CODE#/REVIEW#…#CHAT#, OPS#STATS, (AI) |
| `GET /study` | 학습자 | — | `{summary, levels, concepts, notes, recent}` | USER#/STUDYREC# |
| `GET /admin/overview` | 관리자 | — (헤더 `x-admin-token`) | 사용량·비용·AI 기록·2주 사용 수 | OPS#USAGE, OPS#AILOG, OPS#STATS, OPS#CONFIG |
| `POST /admin/ai` | 관리자 | `{enabled: true\|false}` | `{aiSwitch}` | OPS#CONFIG/ai_switch |
| `POST /admin/code` | 관리자 | `{code}` | `{ok}` | OPS#CONFIG/admin_code_hash |
| `POST /admin/migrate` | 관리자 | `{}` (헤더 `x-admin-token`) | `{moved, removed, untouched, byKind}` | 테이블 전체 (예전 이름 → 새 이름) |

"(AI)" 표시가 있는 요청은 `ask_ai` 를 거치며 `OPS#USAGE`·`OPS#AILOG`·`OPS#LIMIT`·`OPS#CONFIG/ai_switch` 도 함께 써요.
응답 모양(TypeScript)은 `src/lib/api-types.ts` 에 Lambda 와 똑같이 적어 두었어요.

### 3-9. 직접 보내 보기

**브라우저 개발자 도구 (F12) → Network 탭**: 화면에서 버튼을 누르면 요청이 보여요. Headers 탭에서 `x-session-id`, Payload 탭에서 본문, Response 탭에서 응답 JSON 을 볼 수 있어요.

**터미널 (curl)** — 처음 요청은 헤더 없이 보내고, 응답의 `x-session-id` 를 다음 요청에 넣어요:
```bash
URL=https://tmf42v2ronizv7zz7yjmw57o7y0zegwy.lambda-url.ap-northeast-2.on.aws

curl -i "$URL/health"

curl -i -X POST "$URL/practice" \
  -H "Content-Type: application/json" \
  -d '{"level": 1, "topic": "카페 주문", "language": "python"}'
#  → 응답 헤더 x-session-id: a1b2…  ,  본문의 "codeId": "3c90…"

curl -i -X POST "$URL/review" \
  -H "Content-Type: application/json" \
  -H "x-session-id: a1b2…" \
  -d '{"codeId": "3c90…", "memos": [{"start": 6, "end": 8, "text": "메뉴를 하나씩 꺼내 가격을 더해요"}]}'
```
- curl 은 브라우저가 아니라서 CORS 검사를 하지 않아요 (그래도 서버 응답은 같아요).
- 실제 AI 를 부르는 요청은 비용이 들어요. 시험은 내 컴퓨터 `npm run api` (목업 AI) 에서 하는 걸 추천해요.

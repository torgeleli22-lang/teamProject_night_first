# 코드 따라 읽기 — DB → Lambda

"이 동작은 어느 파일의 어느 줄이 해 주나?"를 따라가며 공부하는 안내서예요.
줄 번호는 지금 main 기준이에요 (코드가 바뀌면 조금씩 밀릴 수 있어요. 함수 이름으로 찾으면 정확해요).

- 1부 DB: DynamoDB 테이블 하나에 무엇이 어떻게 들어가고, 어느 함수가 쓰고 읽는지
- 2부 Lambda: 요청 하나가 들어와서 응답이 나갈 때까지, 기능별로
- 3부 직접 해 보기: 콘솔·내 컴퓨터에서 눈으로 확인하는 연습

그림: ERD(항목 관계)와 Lambda 구조도는 발표 자료용으로 만든 이미지를 함께 보면 좋아요.

---

## 1부. DB (DynamoDB `jojo_table`)

### 1-1. 테이블은 딱 하나 — "단일 테이블 설계"

보통 DB 는 학습자 표, 코드 표, 첨삭 표처럼 표를 여러 개 만들지만, 이 프로젝트는 **표(테이블) 하나**에 모든 것을 넣어요.
대신 모든 항목에 **이름표 두 개**를 붙여서 종류를 나눠요.

| 이름표 | 뜻 | 예 |
|---|---|---|
| `pk` (파티션 키) | 큰 서랍 이름 — 같은 pk 끼리 한곳에 모여요. **무엇의 것인가 + id** | `USER#01a1…`, `CODE#01a16d95…`, `LOGIN#9a8b…` |
| `sk` (정렬 키) | 서랍 안의 칸 이름 — pk 안에서 정렬돼요. **어떤 종류인가 (+ 시각·번호)** | `PROFILE`, `INFO`, `STUDYREC#01a16d95…`, `REVIEW#0001792592284764123` |

`pk + sk` 두 개가 합쳐서 항목 하나를 정확히 가리켜요 (주민등록번호처럼).
왜 이렇게 하나요? DynamoDB 는 **pk 하나를 주면 그 서랍을 한 번에 꺼내는 것**이 가장 빠르고 싸요.
예) `CODE#<코드 id>` 서랍 하나만 열면 그 코드 + 첨삭 + 다시 쓰기 + 튜터 대화가, `USER#<사용자 id>` 서랍 하나만 열면 그 사람의 정보 + 공부 기록이 한 번에 나와요.

**이름 규칙 3개** (키 이름표는 `common.py` 4번 구역 맨 위에 한눈에 있어요)
1. pk = **무엇의 것인가 + id** — `USER#<사용자 id>`, `CODE#<코드 id>`, `LOGIN#<토큰>` …
2. sk = **어떤 종류인가 (+ 시각·번호)** — `PROFILE`, `INFO`, `STUDYREC#<코드 id>`, `REVIEW#<시각>` …
3. **운영 데이터는 `OPS#`** 로 시작 — `OPS#STATS`, `OPS#USAGE`, `OPS#AILOG`, `OPS#CONFIG`, `OPS#LIMIT`

기능 파일은 문자열을 직접 쓰지 않고 `common.py` 의 `user_pk(id)`, `code_pk(id)`, `studyrec_sk(id)`, `login_pk(token)`, `account_pk(…)`, `auth_pk(state)` 와 이름 상수(`PROFILE`, `INFO`, `USER`, `STATE`, `OPS_…`)로만 키를 만들어요.

**설정이 있는 곳**
- 테이블 이름·TTL 속성 이름: `lambda/api/common.py:34` `TABLE_NAME`, `:35` `TTL_ATTR` (Lambda 환경 변수로 바꿀 수 있음)
- 테이블 연결: `common.py:112` `table = boto3.resource("dynamodb", ...).Table(TABLE_NAME)`
  - 함수가 처음 뜰 때 한 번만 연결하고, 다음 요청부터는 그대로 다시 써요 (빠름)

### 1-2. 항목 종류 (pk / sk 모양)

| 항목 | pk | sk | 들어 있는 것 | 자동 삭제 |
|---|---|---|---|---|
| 학습자 | `USER#<사용자 id>` | `PROFILE` | 난이도, 최근 주제 10개, (로그인) member·이름·제공자, formerUserIds | 12시간 · 로그인 1년 |
| 내 공부 | `USER#<사용자 id>` | `STUDYREC#<코드 id>` | 개념별 처음/최고 판정, 내 설명, 코드 몇 줄 | 1일 · 로그인 1년 |
| 읽을 코드 | `CODE#<코드 id>` | `INFO` | userId(만든 학습자), 코드, 언어, 난이도, ※ 지점(모범 설명 포함) | 1일 · 로그인 30일 |
| 첨삭 결과 | `CODE#<코드 id>` | `REVIEW#<시각>` | 메모, 결과(○△✕ 개수·항목별 코멘트) | 코드와 같이 |
| 다시 써 보기 | `CODE#<코드 id>` | `REVIEW#<첨삭 시각>#RETRY#<항목>` | 다시 쓴 설명·판정 (3번) | 코드와 같이 |
| 튜터 대화 | `CODE#<코드 id>` | `REVIEW#<첨삭 시각>#CHAT#<항목>` | 질문·답 (10번) | 코드와 같이 |
| 로그인 토큰 | `LOGIN#<토큰 uuid4>` | `USER` | userId, provider | 30일 (쓰면 늘어남) |
| 소셜 계정 | `ACCOUNT#google:<고유 번호>` | `USER` | userId (→ 학습자) | 없음 |
| 로그인 시작 | `AUTH#<state>` | `STATE` | provider, returnTo, anonSid | 10분 |
| 하루 사용 수 | `OPS#STATS` | `DAY#날짜` | practices, reviews … 개수 | 90일 |
| AI 사용량 | `OPS#USAGE` | `월#작업#모델` | 호출·토큰·실패 수 | 없음 |
| AI 호출 기록 | `OPS#AILOG` | 시각 | 작업, 성공 여부, 오류 | 14일 |
| 설정 | `OPS#CONFIG` | `ai_switch` · `admin_code_hash` | AI 켜고 끄기, 관리자 코드(해시) | 없음 |
| 요청 수 제한 | `OPS#LIMIT` | `이름#시간 칸` | 이 시간 칸의 요청 수 | 시간 칸이 지나면 |

> 예전 이름(2026년 10월까지): `LEARNER` → `USER#…/PROFILE`, `STUDY#…/R#…` → `USER#…/STUDYREC#…`, `READ#…/CODE` → `CODE#…/INFO`,
> `RETRY#t#n`·`CHAT#t#n` → `REVIEW#t#RETRY#n`·`REVIEW#t#CHAT#n`, `LOGIN`·`ACCOUNT`·`AUTH` → `LOGIN#…`·`ACCOUNT#…`·`AUTH#…`,
> `STATS`·`USAGE`·`AILOG`·`META`·`RL` → `OPS#STATS`·`OPS#USAGE`·`OPS#AILOG`·`OPS#CONFIG`·`OPS#LIMIT`. 필드도 `learnerId`·`owner` → `userId`, `readingId`·`id` → `codeId`, `formerIds` → `formerUserIds`, `rootId` → `rootCodeId`. 옮기기: 관리자 화면 '예전 데이터 옮기기' (`admin.py` `migrate`)

자세한 필드 표: `docs/PROJECT_BRIEF.md` §9.2

### 1-3. DB 도구 7개 — 모든 기능 파일은 이것만 써요 (`common.py` 4번 구역)

| 함수 | 줄 | 하는 일 | 쉬운 비유 |
|---|---|---|---|
| `get_item(pk, sk)` | `common.py:335` | 항목 하나 꺼내기 | 서랍의 칸 하나 열기 |
| `put_item(item)` | `common.py:339` | 항목 하나 통째로 쓰기 (있으면 덮어씀) | 칸에 새 종이 넣기 |
| `update_item(pk, sk, set_values=…, add_values=…)` | `common.py:366` | 필드 일부만 바꾸거나 숫자 더하기 | 종이의 한 줄만 고치기 |
| `delete_item(pk, sk)` | `common.py:343` | 항목 지우기 | 칸 비우기 |
| `query_all(pk, prefix=…)` | `common.py:347` | 한 서랍(pk)의 항목을 모두 (sk 가 prefix 로 시작하는 것만) | 서랍째 꺼내 보기 |
| `to_db` / `to_plain` | `common.py:301` / `:291` | 소수 ↔ Decimal 바꾸기 (DynamoDB 는 숫자를 Decimal 로만 받음) | 통역 |
| `ttl_after(초)` / `alive(item)` | `common.py:315` / `:320` | 자동 삭제 시각 만들기 / 기한 지났는지 확인 | 유통기한 붙이기 / 확인하기 |

> **TTL(자동 삭제)**: 항목에 `jojo_ttl = 유닉스 시각(초)`를 넣어 두면, 그 시각이 지난 뒤 DynamoDB 가 알아서 지워요.
> 지우는 데 몇 시간 늦을 수 있어서 읽을 때 `alive()` 로 한 번 더 걸러요.
> 보관 기간은 한 곳에서 정해요: `common.py:459` `keep_seconds(user, what)` (로그인 여부·종류별).

### 1-4. 항목마다 "누가 쓰고 누가 읽나"

#### 학습자 `USER#<id> / PROFILE`
- **만들기**: `common.py:468` `get_user(req)` 3번 단계 — 헤더의 id 가 없거나 기한이 지났으면 새 id(시간순 UUID, `new_id`) 로 `put_item` (`:488`)
- **찾기**: 같은 함수 1·2번 단계 — 로그인 안 함은 `USER#<id>/PROFILE` 직접, 로그인은 `LOGIN#<토큰>/USER` → `userId` → `USER#<id>/PROFILE`
- **고치기**: `common.py:495` `use_user` (15분마다 lastSeen·기한 늘리기), `:506` `remember_topic` (최근 주제·난이도)
- **로그인 계정**: `auth.py:190` `account_user` (member 학습자 만들기), `auth.py:207` `adopt_anonymous` (비회원 서랍의 공부 기록을 회원 서랍으로 옮기고 비회원 학습자 지우기)

#### 내 공부 `USER#<id> / STUDYREC#<코드 id>`
- 쓰기: 첨삭할 때 `study.py:49` `record_review` (코드 하나당 한 줄), 다시 써서 나아지면 `study.py:72` `record_retry`
- 읽기: `study.py:27` `overview` — `query_all(user_pk(나), prefix="STUDYREC#")` 한 번으로 전부 가져와 계산 (AI 없음)
- 학습자 정보(`PROFILE`)와 같은 서랍이라 `query_all(user_pk(나))` 한 번이면 둘 다 나와요

#### 읽을 코드 `CODE#<id> / INFO`
- **쓰기**: `common.py:867` `save_code` — 코드 id 는 `new_id()` (시간순 UUID: 앞 12글자가 만든 시각) — 연습 모드(`practice.py:148` `start_practice`, `:168` `adjust`)와 내 코드 점검(`inspect_code.py:71` `start`)이 함께 써요
- **읽기**: `common.py:878` `load_code(code_id, user)` — **userId 가 나(또는 로그인 전의 나)일 때만** 꺼내 줘요 (남의 코드 id 를 알아도 못 봄)
- **화면으로 보낼 모양**: `common.py:911` `public_code` — ※ 지점은 `start·end` 만, **모범 설명은 빼고** 보내요

#### 첨삭 `REVIEW#<시각>` · 다시 쓰기 `…#RETRY#` · 튜터 `…#CHAT#` (모두 `CODE#<id>` 서랍 안)
- 다시 쓰기·대화는 **첨삭의 sk 뒤에** 붙어요: `REVIEW#<시각>` → `REVIEW#<시각>#RETRY#002`, `REVIEW#<시각>#CHAT#000`
- 그래서 `common.py:888` `review_rows(코드 id)` 한 번(`query_all(code_pk(id), prefix="REVIEW#")`)으로 첨삭과 딸린 것이 모두 나와요
  - 가장 최근 첨삭: `common.py:893` `latest_review` — 그중 sk 에 `#` 가 하나뿐인 것(첨삭)의 마지막
  - 첨삭 하나에 딸린 다시 쓰기·대화: `common.py:905` `review_children(review, "RETRY"|"CHAT", rows)`
  - sk 이름 짓기: `common.py:900` `review_key(review, "CHAT"|"RETRY", 항목 번호)` → `REVIEW#<첨삭 시각>#CHAT#003`
- 첨삭 쓰기: `review.py:89` (`review` 함수 4번 단계)
- 다시 쓰기 읽기/쓰기: `review.py:134` / `review.py:156`, 목록: `review.py:266` `retries_for`
- 튜터 읽기/쓰기: `tutor_chat.py:68` / `:94`, 목록: `tutor_chat.py:107` `chats_for`

#### 로그인 `LOGIN#` · `ACCOUNT#` · `AUTH#`
- `AUTH#<state>/STATE` 쓰기 `auth.py:66` (로그인 시작) → 읽고 바로 지우기 `auth.py:85~88` (콜백, 한 번만)
- `ACCOUNT#<제공자>:<번호>/USER` 읽기/쓰기 `auth.py:193` / `:203`, `LOGIN#<토큰>/USER` 쓰기 `auth.py:100`, 지우기(로그아웃) `auth.py:110`

#### 운영 항목 `OPS#…`
- `OPS#STATS`: `common.py:789` `count_event("practices")` — 하루 사용 수 +1 (`update_item` 의 ADD)
- `OPS#USAGE` · `OPS#AILOG`: `common.py:580` `log_usage`, `:595` `log_ai_event` — AI 를 부를 때마다
- `OPS#CONFIG`: `common.py:769` `get_meta`, `:773` `set_meta` — AI 스위치(`:529` `ai_switch_on`)
- `OPS#LIMIT`: `common.py:417` `bump_counter`, `:429` `hit_limit` — "1분에 600번" 같은 제한을 함수 여러 개가 함께 세도록 DB 에 셈
- 관리자 화면이 모아 읽기: `admin.py:122` `overview`

---

## 2부. Lambda (`lambda/api/`)

### 2-1. 한 장 요약 — 은행에 비유하면

| 비유 | 파일 | 한 줄 |
|---|---|---|
| 안내 데스크 | `lambda_function.py` | 용건(경로)을 보고 창구로 보내요 |
| 창구 | `auth` `topics` `practice` `inspect_code` `review` `tutor_chat` `study` `admin` | 맡은 업무 처리. 파일 맨 아래 `ROUTES` 표가 "이 창구가 받는 용건" |
| 공용 도구 서랍 | `common.py` | 요청 읽기·응답, 학습자, DB, AI, 요청 수 제한 |
| 예비 서류 | `samples.py`, `samples_js.py` | AI 를 못 쓸 때 대신 줄 예시 코드 |

### 2-2. 요청 하나의 길 (모든 기능 공통)

```
화면 src/lib/api.ts  ──fetch──▶  함수 URL  ──▶  lambda_function.lambda_handler
```

1. **화면이 보냄**: `src/lib/api.ts` 의 `apiPost("/review", {...})` → 헤더 `x-session-id` 에 학습자(또는 로그인 토큰)
2. **입구** `lambda_function.py:54` `lambda_handler(event, context)` — 단계는 3개뿐
   1. `read_request(event)` (`common.py:139`): 함수 URL 이 준 event 에서 경로·메서드·헤더·본문(JSON)·IP 꺼내기
   2. `/admin` 이면 `admin.require_admin` (`admin.py:32`) 으로 관리자 코드 확인
   3. `run_route(req, ROUTES)` (`common.py:199`)
3. **경로 표**: `lambda_function.py:49~51` — 기능 파일마다 있는 `ROUTES` 를 하나로 합쳐요
   ```python
   ROUTES = {"GET /health": health}
   for feature in (auth, topics, practice, inspect_code, review, tutor_chat, study, admin, experiment):
       ROUTES.update(need(feature, "ROUTES"))
   ```
4. **`run_route`** (`common.py:199`): `"POST /review"` 로 표에서 함수를 찾아 실행
   - 없는 경로 → 404, IP 당 1분 요청 수 초과 → 429 (`hit_limit`)
   - 함수가 `ApiError(400, "메시지")` 를 던지면 → 그 상태 코드와 한국어 메시지로 응답
   - 예상 못 한 오류 → CloudWatch 로그에 남기고 500 "잠시 문제가 생겼어요"
5. **응답** `reply` (`common.py:189`): JSON + CORS 헤더(`cors_headers` `:176`, 허용한 화면 주소만) + `x-session-id` (학습자 id 를 화면에 알려 줌)

> 오류를 다루는 방식이 핵심이에요: 기능 함수는 문제가 생기면 그냥 `raise ApiError(상태, "화면에 보일 말")` 하면 끝이에요.
> 응답 모양 만들기는 `run_route` 가 대신해서, 기능 파일은 "일"만 해요.

### 2-3. AI 를 부르는 단 하나의 길 — `ask_ai` (`common.py:628`)

AI 를 쓰는 기능은 전부 이 함수 하나로 불러요. 그래서 비용·안전 장치를 한곳에서 지켜요.

```python
r = ask_ai("code_generation", SYSTEM_PROMPT, prompt, SCHEMA, max_tokens=3000, mock=lambda: sample_as_ai(sample))
```

| 순서 | 줄 근처 | 하는 일 |
|---|---|---|
| 1 | `ai_enabled()` `:537` | 관리자가 AI 를 껐거나 `AI_MODE=off` 면 → `AiUnavailable` |
| 2 | `AI_MODE == "mock"` | 시험용: `mock()` 이 만든 가짜 답 (비용 0) — 내 컴퓨터·smoke 테스트 |
| 3 | `check_budget` `:606` | 이번 달 예산($10)을 넘길 것 같으면 부르지 않음 |
| 4 | `bedrock().converse(...)` | Bedrock(Claude Haiku 4.5) 호출. **`answer` 도구 하나만 주고 그 도구로 답하게** 해서 정해진 JSON 모양으로 받음 |
| 5 | `repair_for_schema` `:701` · `check_schema` `:733` | 흔한 형식 실수 고치기 → 그래도 틀리면 `AiUnavailable` |
| 6 | `finally: log_usage` `:580` | 성공·실패 모두 토큰·비용 기록 (`OPS#USAGE`, `OPS#AILOG`) |

**부르는 쪽의 약속**: `ask_ai` 는 실패하면 `AiUnavailable` 을 던져요. 부르는 쪽은 꼭 받아서 **AI 없는 길**로 가요.
- 연습 코드 → 예시 코드 (`practice.py:350` `pick_sample`)
- 첨삭 → 규칙 첨삭 (`review.py:198` `rule_review`: 핵심 표현이 메모에 들어 있는지)
- 튜터 → 규칙 답 (`tutor_chat.py:127` `rule_answer`)
- 주제 판정 → 규칙 판정 (`topics.py:86` `rule_check`)

그 앞에서 한 번 더 막는 것: `common.py:434` `ai_allowed(req)` — 학습자·IP·전체의 1시간 AI 요청 수 제한.

### 2-4. 기능별로 따라 읽기

각 처리 함수 안에 `# 1.` `# 2.` 단계 주석이 있어요. **주석만 위에서 아래로 읽어도 흐름이 보여요.**

#### ① 연습 코드 받기 — `POST /practice` → `practice.py:148` `start_practice`
```
1. 요청 값 확인 (level 1~4, topic 50자, language, focus)      field() common.py:223
   get_user(req)                                           common.py:468
2. make_code()                                                practice.py:229
   ├ 예시 코드 미리 골라 두기 pick_sample                       practice.py:350
   ├ AI 를 못 쓰면 → 예시 코드                                  ai_allowed
   └ 최대 2번 반복:
       ① 출제   ask_ai("code_generation")
       ② 규칙 검사 check_generated                             practice.py:301
            Python: py_ast_problems (문법·금지 기능·오타·print)  practice.py:393
            JavaScript: js_shape_problems (괄호·따옴표 짝)       practice.py:457
            줄 수 · ※ 줄 찾기 find_line                         practice.py:338
       ③ AI 검토 ai_check_code → ask_ai("code_check")           practice.py:269
            틀린 모범 설명 고치기 fix_explanations               practice.py:287
       걸리면 이유 + 방금 코드를 붙여 ① 로 한 번 더, 2번 다 안 되면 예시 코드
3. save_code (CODE#id / INFO) · remember_topic · count_event
   return public_code(item)   ← 모범 설명은 빼고
```
- 더 쉽게·더 어렵게 `practice.py:168` `adjust`: 지금 코드와 이유를 프롬프트에 붙여 `make_code` 다시, `regenCount` 5번 제한
- 다시 열기 `GET /code` `practice.py:201` `get_code`: 코드 + 마지막 첨삭 + 튜터 대화 + 다시 쓰기 기록

#### ② 첨삭 받기 — `POST /review` → `review.py:63` `review`
```
1. 내 코드 꺼내기 load_code · 메모 검사 read_memos           review.py:169
2. 누락(⬚) 정하기 — AI 없이: ※ 범위와 겹치는 메모가 없으면 누락   overlaps review.py:183
3. 메모가 있으면 ask_ai("review") → 안 되면 rule_review          review.py:198
4. 결과 모으기 build_result (코드 위치 순서, 모범 설명은 이제 포함) review.py:223
   put_item CODE#id / REVIEW#시각
5. '내 공부' 기록 record_review                                 study.py:49
```
- 다시 써 보기 `POST /review/retry` `review.py:117` `retry`: 항목 하나만 다시 채점, 3번 제한, `REVIEW#<시각>#RETRY#<항목>` 에 기록, 나아지면 `record_retry`

#### ③ AI 튜터 — `POST /tutor` → `tutor_chat.py:51` `ask_tutor`
- 마지막 첨삭의 항목 하나 + 지금까지 대화(`REVIEW#<시각>#CHAT#<항목>`)를 `history` 로 넘겨 `ask_ai("tutor_chat", ..., history=turns)`
- 시스템 지시문 `tutor_chat.py:19`: 정답 대신 볼 줄·질문으로 이끌기, 코드 대신 짜 주지 않기
- 10번 제한, AI 못 쓰면 `rule_answer` (코멘트 → 다시 볼 줄 → 모범 설명 순서로 조금씩)

#### ④ 내 공부 — `GET /study` → `study.py:27` `overview` (AI 없음)
- `summarize` `:95` 요약, `recommend_levels` `:102` 난이도 추천 (최근 5개 ○ 비율 80%↑ 올리기 / 40%↓ 내리기)
- `concept_map` `:126` 개념별 약점, `explanation_notes` `:140` ○ 받은 내 설명 모음

#### ⑤ 주제 — `topics.py`
- `GET /topic/random` `:48` 목록에서 최근 10개 빼고 뽑기 (AI 없음)
- `POST /topic/check` `:57` AI 판정 (ok · vague · too_big · inappropriate), 안 되면 `rule_check` `:86`

#### ⑥ 내 코드 점검 — `inspect_code.py`
- `POST /inspect` `:59` `look` (AI 없음): `mask_secrets` `:135` 민감 정보 가리기 → `find_functions` `:156` 함수 목록 → 난이도 추정
- `POST /inspect/start` `:71` `start`: 고른 함수 범위 안에서 AI 가 ※ 지점, 안 되면 `rule_analysis` `:182`
- 올린 코드는 로그인해도 1일만 보관 (`keep_seconds(…, "upload")`)

#### ⑦ 로그인 — `auth.py` (OAuth, 라이브러리 없이 `urllib`)
```
GET /auth/start     start     :55   AUTH/state 저장 → Google 로그인 화면으로 302
GET /auth/callback  callback  :81   state 확인·삭제 → fetch_profile :168 (code → 토큰 → sub·이름)
                                    → account_user :190 → adopt_anonymous :207
                                    → LOGIN/토큰 저장 → 화면#login=토큰 으로 302
GET /me             me        :49   지금 학습자 (로그인 버튼 보이기)
POST /auth/logout   logout    :106  LOGIN 삭제
```

#### ⑧ 관리자 — `admin.py`
- `require_admin` `:32` 관리자 코드 확인 (여러 번 틀리면 잠깐 막힘)
- `overview` `:122` 작업별 AI 사용량·비용·최근 호출 기록·날짜별 사용 수, `switch_ai` `:170` AI 켜기/끄기

### 2-5. 안전 장치가 있는 곳 (발표 Q&A 대비)

| 걱정 | 막는 곳 |
|---|---|
| 요금 폭탄 | `check_budget` (월 예산), `ai_allowed` (1시간 AI 요청 수), `hit_limit` (IP 당 1분 600번), 관리자 AI 끄기 |
| 남의 코드 보기 | `load_code` 의 userId 확인 |
| 답 미리 보기 | `public_code` 가 모범 설명을 빼고 보냄 |
| 비밀 값 노출 | 화면 `src/lib/secrets.ts` + Lambda `mask_secrets` 두 번 가림, 키는 Lambda 환경 변수에만 |
| AI 가 이상한 형식 | 도구(JSON Schema)로만 답받기 + `check_schema` |
| AI 가 틀린 코드·설명 | 규칙 검사 + AI 검토 (`practice.py`) |
| 로그인 가로채기 | `safe_return` (허용한 화면만), state 한 번만, 고유 번호(sub)로 계정 구분 |

---

## 3부. 직접 해 보기

### 3-1. 콘솔에서 DB 들여다보기
DynamoDB 콘솔 → 테이블 `jojo_table` → **표 항목 탐색(Explore table items)** → **쿼리(Query)**
1. `pk` = `USER#<내 학습자 id>` → 내 정보(`PROFILE`)와 공부 기록(`STUDYREC#…`). 학습자 id 는 브라우저 F12 → Network → 응답 헤더 `x-session-id` (비회원)
2. 화면에서 코드를 하나 받고, 브라우저 주소의 `?id=…` 를 복사 → `pk` = `CODE#<그 id>` 로 쿼리 → `INFO` 한 줄
3. 그 코드로 첨삭을 받은 뒤 같은 쿼리 → `REVIEW#…` 가 하나 늘어남. 다시 써 보기·튜터를 하면 `REVIEW#…#RETRY#…`·`REVIEW#…#CHAT#…`
4. `pk` = `OPS#STATS` → 오늘 날짜의 `practices`·`reviews` 숫자가 늘어난 것 확인

### 3-2. 콘솔에서 Lambda 시험하기
Lambda `jojo_api_py` → **테스트** 탭 → 이벤트에 붙여넣고 테스트
```json
{"path": "/health", "method": "GET"}
{"path": "/topic/random", "method": "GET"}
{"path": "/practice", "method": "POST", "level": 1, "topic": "카페 주문"}
```
콘솔 테스트에서는 본문 값을 `path`·`method` 옆에 그대로 적어요 (`read_request` 가 그렇게 읽어 줘요, `common.py:139`).
더 많은 예: `lambda/api/test_events.json`. 오류가 나면 **모니터링 → CloudWatch 로그**에서 `[error]` 줄을 찾아요.

### 3-3. 내 컴퓨터에서 (AWS 없이)
```bash
npm run api      # Lambda 를 http://localhost:8787 로 (DynamoDB 흉내 + 목업 AI)
npm run dev      # 화면 http://localhost:3000
npm run smoke    # 모든 API 를 순서대로 불러 보는 점검 — scripts/smoke.mjs 를 읽으면 "어떤 요청 → 어떤 응답" 예시가 다 있어요
```

### 3-4. 추천 공부 순서 (하루 30분씩)
1. `lambda_function.py` 전체 (66줄) — 입구와 경로 표
2. `common.py` 3·4번 구역 — 요청·응답, DB 도구 7개
3. `common.py` 6번 구역 `get_user` — 학습자가 어떻게 생기고 이어지는지
4. `practice.py` `start_practice` → `make_code` — 가장 중요한 흐름 (단계 주석만 먼저)
5. `review.py` `review` → `build_result` — 누락 판정(규칙)과 AI 첨삭이 어떻게 합쳐지는지
6. `common.py` 7번 구역 `ask_ai` — AI 부르기와 대체 경로
7. `study.py` — AI 없이 기록으로 계산하는 부분
8. `auth.py` — 로그인 (OAuth) 은 마지막에

**스스로 확인 질문**
- `GET /code?codeId=…` 로 남의 코드 id 를 넣으면 어디서 막히나요? (힌트: `load_code`)
- 첨삭 전에 화면이 모범 설명을 모르는 이유는? (힌트: `public_code`)
- AI 를 끄면 첨삭은 어떻게 되나요? (힌트: `review` 3번 단계)
- 로그인 안 한 학습자의 기록은 언제 사라지나요? (힌트: `keep_seconds`, `jojo_ttl`)

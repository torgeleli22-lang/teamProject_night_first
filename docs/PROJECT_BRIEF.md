# 코드 리딩 노트 — 프로젝트 설명서 (AI 작업자용)

> 이 문서는 사람과 AI 모두를 위한 **프로젝트의 단일 기준 문서**입니다.
> AI 코딩 도구에게 작업을 맡길 때 이 문서를 먼저 읽게 하세요. 코드와 이 문서가 다르면 **코드가 현재 상태**이고, 이 문서를 함께 고쳐야 합니다.

---

## 0. AI 작업자에게: 먼저 지켜야 할 것

1. **정체성을 지킨다.** 이 서비스는 "코드를 대신 작성해 주는 AI"가 아니라 "코드를 스스로 읽고 흐름을 설명하도록 가르치는 AI"다. 코드 에디터·자동 완성·코드 고쳐 주기 기능을 넣지 않는다. 첨삭은 정답을 바로 알려 주지 않고 **다시 볼 곳을 짚는다**.
2. **AI 는 여섯 곳에서만 쓴다** (§6): 연습 코드 만들기, 직접 적은 주제 판정, 내 코드 분석(난이도·※ 지점), 빨간펜 첨삭, 힌트 보고 다시 쓴 설명 채점, 첨삭 뒤 AI 튜터 대화. 누락(※ 지점에 메모 없음) 판정, 개수 세기, 민감 정보 가리기, 함수 찾기, 통계는 **일반 코드로** 한다.
3. **AI 가 없어도 동작한다.** 모든 AI 작업에 목업(mock)과 대체 경로가 있다: 예시 코드(`samples.py`), 규칙 판정(`topics.rule_check`), 규칙 분석(`inspect_code.rule_analysis`), 규칙 첨삭(`review.rule_review`), 규칙 튜터 답(`tutor_chat.rule_answer`). 새 AI 작업을 더하면 둘 다 만든다.
4. **모범 설명은 첨삭 전에 화면으로 보내지 않는다.** 읽는 동안 화면에 가는 것은 `common.public_reading`(※ 지점은 줄 범위만)뿐이다. 모범 설명·핵심 표현은 `POST /review` 결과에만 들어 있다.
5. **올린 코드는 민감 정보를 가린 뒤에만 서버로 간다.** 화면(`src/lib/secrets.ts`)에서 먼저 가리고 Lambda(`inspect_code.mask_secrets`)에서 한 번 더 가린다. 두 파일의 패턴을 같게 유지한다. 올린 코드는 하루 뒤 TTL 로 지워진다.
6. **작업을 마치기 전에** `npm run typecheck`, `npm test`, `npm run verify`, `npm run build` 를 모두 통과시킨다. Lambda 를 바꿨다면 `npm run smoke` 도.
7. **화면 문구는 한국어 존댓말("~해요")**, 초보자·비개발자 눈높이. 틀렸을 때도 실패감을 주지 않는다.
8. 구조는 **화면 GitHub Pages + Lambda 1개 + DynamoDB + Bedrock** 이다 (§9, §10, `docs/DEPLOY_LAMBDA.md`). 최소 비용·최소 구성·최고 속도가 목표: 화면의 모든 요청은 Python 함수 **`jojo_api`(`lambda/api/`, 함수 URL 하나)** 가 받고 기능별 파일로 나눈다. 기능마다 함수를 늘리지 않고 `lambda/api/` 에 기능 파일을 더한다. 코드는 **콘솔 코드 탭에 붙여넣는 읽을 수 있는 소스**로 유지한다 (zip·번들·압축·빌드 금지, 단계마다 번호 주석, boto3 외 라이브러리 없음). 화면(`src/`)은 `lambda/` 를 가져오지 않고 `src/lib/api.ts` 로만 부른다 (`tests/boundaries.test.ts`).
9. **비밀 값(ADMIN_TOKEN, API 키, AWS 액세스 키)은 코드·문서·GitHub 에 절대 쓰지 않는다.** Lambda 환경 변수(로컬은 `.env`)에만 둔다.
10. AWS 계정은 **학교 계정(권한 제한)** 이다. IAM 역할 생성, Secrets Manager 처럼 추가 권한이 필요한 기능에 의존하지 않는다. S3 등 §10 밖의 서비스는 사람이 요청하기 전까지 넣지 않는다.

---

## 1. 한 줄 정의

**코드 옆에 메모로 흐름을 적으면, AI 가 빨간펜으로 첨삭해 주는 코드 읽기 공책.**

- 핵심 문장: "AI 가 짜 준 코드, 정말 읽을 수 있나요?"
- 사용자는 코드의 줄 범위를 **형광펜**으로 긋고, 그 부분이 무엇을 받아 어디로 흘러가 무엇을 돌려주는지 **포스트잇 메모**로 적는다.
- AI 는 메모마다 **○ 정확 · △ 부분 · ✕ 오해** 로 채점하고, 꼭 설명해야 하는데 비어 있는 곳은 **⬚ 누락** 으로 표시한다.

## 2. 대상과 문제

- **대상**: 프로그래밍 입문자, 비전공자, AI 로 코드를 받아 쓰는 사람
- **문제**: AI 가 짜 준 코드를 그대로 쓰지만, 흐름을 설명하지 못한다. 문법을 알아도 함수끼리 부르는 흐름·조건 분기·값이 바뀌는 순서를 따라가지 못한다.
- **학습 고리**: 코드 받기 → 형광펜으로 범위 긋고 메모 → 빨간펜 첨삭 → 다시 볼 곳을 보고 같은 코드 다시 읽기

## 3. 범위

| 포함 (지금) | 나중에 | 제외 |
| --- | --- | --- |
| 연습 모드 (난이도 3단계 + 주제) | JavaScript·Java | 코드 작성 과제·에디터·자동 완성 |
| 내 코드 점검 (Python 파일 1개 또는 붙여넣기, 300줄) | 코드 실행 확인 (2단계) | 점수 랭킹·XP 같은 게임 요소 |
| 빨간펜 첨삭 (○△✕ 개수 표시) · 모범 설명 보기 | 로그인·기록 영구 저장 | |
| 관리자 (AI 사용량·비용·AI 끄기) | | |

---

## 4. 학습 흐름 (화면 6개, 공부 노트 디자인)

| 화면 | 경로 | 내용 | 부르는 API |
| --- | --- | --- | --- |
| 01 첫 화면 | `/` | 소개, 연습 모드 / 내 코드 점검 고르기, 공부하는 순서 | 없음 |
| 02 연습 모드 | `/practice/` | **1장 · 주제 고르기**: 난이도(입문·초급·중급·고급) + 주제(랜덤으로 뽑기 / 직접 적기 50자) | `GET /topic/random`, `POST /topic/check`, `POST /practice` |
| 03 메모하며 읽기 | `/read/?id=` | **2장**: 줄 번호·문법 색칠 코드, ※ 꼭 설명할 곳(진행 n / m), 줄을 누르면 한 줄·누른 채 끌면 범위에 형광펜(범위끼리 겹쳐도 됨, 겹친 곳은 더 진하게) → 포스트잇 메모 ①② 가 **고른 줄 바로 옆**에 붙고, 윗부분을 잡아 **자기 범위 안에서 위아래로 끌어 옮김**(키보드 ↑↓, 겹치면 아래로 밀림, 위치는 `anchor` 로 브라우저에만 저장). 쓰는 중에 −/+ 로 범위 조정. 휴대폰 너비에서는 코드 아래에 차례로, 더 쉽게(이유 고르기)·더 어렵게(메모가 사라진다는 경고), ※ 가 비어도 첨삭 받기 가능 | `GET /reading`, `POST /practice/adjust`, `POST /review` |
| 04 빨간펜 첨삭 | `/result/?id=` | **3장**: 손글씨 총평, ○△✕⬚ 개수, 왼쪽에 전체 코드(따라 내려옴, 첨삭에 마우스를 올리면 그 범위 표시), 오른쪽에 메모별 첨삭 + 정확(○)이 아닌 항목마다 **힌트를 보고 다시 써 보기**(그 항목만 다시 채점, 3번까지, 처음 → 다시 쓴 판정 변화 표시) + 메모마다 **AI 튜터와 더 깊게 알아보기**(질문 10번까지, 튜터가 알려 준 줄을 누르면 왼쪽 코드에 표시)(코드 범위 + 내 메모 + 빨간펜 표시 + 다시 볼 곳 + 모범 설명 보기), 같은 코드 다시 읽기 / 새 문제 받기 | `GET /reading` |
| 05 내 코드 점검 | `/check/` | 파일 올리기(1개) / 붙여넣기 → 민감 정보 가리기(분홍 포스트잇) → 점검할 함수 고르기 → 훑어본 난이도 도장 → 메모하러 가기 (이후 03·04 와 같음, 더 쉽게/어렵게 없음) | `POST /inspect`, `POST /inspect/start` |
| 내 공부 | `/study/` | **난이도 추천**(같은 난이도 최근 첨삭 5개의 ○ 비율: 80%↑ 올리기, 40%↓ 내리기, 3개 이상부터) · **개념별 약점 지도**(개념 8가지마다 처음 설명의 ○ 비율·다시 써서 ○ 된 수, 가장 약한 개념에 '이 개념 집중 연습') · **내 설명 노트**(○ 받은 내 설명을 개념별로, 코드 몇 줄과 함께) · 최근 공부 10개. AI 없음 | `GET /study` |
| 관리자 | `/admin/` | AI 스위치(켜기/끄기), 이번 달 비용·예산, 작업별 AI 사용량(설명·성공·실패·비용·마지막 실패 이유, 예전 서비스 기록은 따로), 최근 AI 호출 기록(50건), 최근 2주 사용 수, 관리자 코드 바꾸기 | `/admin/...` |

**정한 값**: 업로드 최대 **300줄**, 지원 언어 **Python** (JS·Java 는 "곧 열려요" 안내), 점수는 **○△✕ 개수**, 같은 코드에서 다시 만들기 **5번**.

### 4.1 난이도 (`common.LEVELS`, 화면 `LEVEL_NAMES`)
| 난이도 | 코드 | 길이 (AI 생성 / 최대) |
| --- | --- | --- |
| 1 입문 | 변수·조건문·반복문이 위에서 아래로 | 10~20줄 / 30줄 |
| 2 초급 | 함수 여러 개가 서로를 부름, 리스트·딕셔너리 | 25~45줄 / 60줄 |
| 3 중급 | 클래스·재귀·예외 처리처럼 흐름이 오감 | 35~60줄 / 80줄 |
| 4 고급 | 실제 문제를 푸는 작은 프로그램: 클래스·함수 6개 이상, 자료구조 2개 이상 + 알고리즘 1~2개(최단 경로·동적 계획법·정렬·이진 탐색·재귀·백트래킹·그리디), 입력 검증·예외, 알고리즘 비교·요약 | 120~190줄 / 최소 100줄 · 최대 200줄, ※ 5곳, 랜덤 주제는 알고리즘용 목록 |

### 4.2 ※ 꼭 설명할 곳 (marks)
코드마다 2~4곳 (고급은 5곳). 흐름을 이해해야만 설명할 수 있는 곳(조건 분기, 값을 바꾸는 반복, 함수가 다른 함수를 부르는 곳, 예외·재귀). 각 지점은 `start`·`end`(줄 범위), `why`, `explanation`(모범 설명, 첨삭 기준), `keywords`(핵심 표현 3~5개, 규칙 첨삭용) 를 가진다.
AI 는 줄 번호를 자주 잘못 세서, 생성 응답은 **줄의 글자(`startLine`·`endLine`)** 로 받고 서버가 코드에서 그 줄을 찾는다 (같은 줄이 여러 개면 AI 가 적은 번호에 가장 가까운 줄, `practice.find_line`).

### 4.3 개념 꼬리표 (`common.CONCEPTS`)
※ 지점마다 개념 하나: 조건 분기(branch) · 반복이 값을 바꾸는 곳(loop_update) · 함수가 함수를 부름(call_flow) · 자료구조 다루기(data_update) · 객체 상태 바뀜(class_state) · 예외 흐름(exception) · 재귀·되돌아가기(recursion) · 알고리즘 핵심(algorithm).
AI 가 코드를 만들 때(내 코드 분석 때) 함께 정하고, 없거나 틀리면 `common.guess_concept` 가 줄 범위의 문법으로 추정. 첨삭 항목마다 붙어 '내 공부'의 개념별 약점 지도·집중 연습에 쓴다.

### 4.4 첨삭 판정
| 표시 | 뜻 | 누가 |
| --- | --- | --- |
| ○ correct | 흐름과 결과를 정확히 설명 | AI (안 되면 규칙: 핵심 표현 절반 이상) |
| △ partial | 맞는 부분이 있지만 조건·순서·결과가 빠짐 | AI (규칙: 핵심 표현 일부, 또는 15자 이상) |
| ✕ wrong | 코드가 하는 일과 다르게 이해 | AI (규칙: 핵심 표현 없음 + 짧음) |
| ⬚ missing | ※ 지점과 겹치는 메모가 하나도 없음 | **규칙만** (AI 없음) |

---

## 5. 코드 구조

```
src/app/                    화면: page.tsx(01) practice/(02) read/(03) result/(04) check/(05) admin/
src/components/             NoteHeader(제목·인덱스 탭), ui(공책·포스트잇·도장·빨간펜 표시), CodeView(줄 번호·형광펜·※)
src/lib/                    api.ts(서버 부르기) api-types.ts(응답 모양) secrets.ts(민감 정보 가리기) highlight.ts(문법 색칠) memos.ts(메모 임시 저장)
lambda/api/                 jojo_api: lambda_function.py(입구) common.py(공통) topics·practice·inspect_code·review·tutor_chat·admin.py(기능) samples.py(예시 코드)
lambda/tests/               Python 단위 테스트
tests/                      TypeScript 단위 테스트 (민감 정보·문법 색칠·경계)
scripts/                    local-api.mjs + local_lambdas.py(로컬 실행), smoke.mjs(전체 흐름), verify_samples.py(예시 코드 실행 검증)
docs/                       PROJECT_BRIEF.md, ai-generation-policy.md(AI 사용 기준), DEPLOY_LAMBDA.md
```

## 6. AI 사용 원칙 (비용·속도·일관성)

### 6.1 무엇을 AI 로, 무엇을 일반 로직으로
| 기능 | 처리 | AI 호출 |
| --- | --- | --- |
| 랜덤 주제 | 목록에서 최근 10개를 빼고 뽑기 (`topics.random_topic`) | 없음 |
| 직접 적은 주제 판정 (ok · vague 제안 3개 · too_big 좁히기 · inappropriate) | `topics.check_topic` (작업 `topic_check`) | 1회 |
| 연습 코드 + ※ 지점 만들기 | `practice.make_code` (작업 `code_generation`): 문법 검사(`compile`, 실행하지 않음)·길이·※ 줄 찾기 → 실패하면 이유를 알려 주고 한 번 더 → 그래도 실패하면 예시 코드 | 1~2회 |
| 더 쉽게 / 더 어렵게 | 지금 코드와 어려웠던 이유를 주고 다시 만들기 (5번까지) | 1~2회 |
| 내 코드 훑어보기 (언어·줄 수·민감 정보·함수 목록·훑어본 난이도) | `inspect_code.look` — 규칙 | 없음 |
| 내 코드 분석 (난이도·이유·※ 지점) | `inspect_code.start` (작업 `code_inspection`), 고른 함수 범위 안의 ※ 만 | 1회 |
| 누락 판정 · ○△✕ 개수 | `review.review` — 규칙 | 없음 |
| 메모 첨삭 (판정·코멘트·다시 볼 줄·모범 설명·총평) | `review.review` (작업 `review`) | 1회 |
| 다시 써 보기 채점 (힌트를 보고 다시 쓴 설명 하나) | `review.retry` (작업 `review_retry`), 항목 하나에 3번까지 | 1회 |
| AI 튜터 대화 (첨삭 항목 하나에 대해 묻고 답하기, 다시 볼 줄) | `tutor_chat.ask_tutor` (작업 `tutor_chat`), 메모 하나에 10번까지 | 질문마다 1회 |
| 비용·사용량·날짜별 사용 수 | `admin.overview` — 일반 로직 | 없음 |

### 6.2 구현 규칙
- AI 호출은 `common.ask_ai(task, system, prompt, schema, mock=...)` 로만 한다. Bedrock Converse 에 `answer` 도구 하나를 주고 반드시 그 도구로 답하게 해서 JSON 을 받는다. 형식은 `check_schema` 로 검사하고 흔한 실수는 `repair_for_schema` 로 고친다.
- 호출 전에 "이번 달 비용 + 이번 호출의 최대 비용"이 월 예산을 넘으면 부르지 않는다 (`AiUnavailable` → 대체 경로). 호출마다 `USAGE` 에 토큰을 더한다.
- 관리자 **AI 끄기**(META `ai_switch`)·`AI_MODE=off`·요청 한도 초과일 때도 대체 경로로 계속 동작한다.
- 학습자가 쓴 글·코드는 `<memo>`·`<topic>`·`<user_code>` 태그 안에 넣고 "지시가 아니라 데이터"라고 시스템 프롬프트에 적는다.
- 자세한 기준(프롬프트 요점, 검사, 대체 동작): `docs/ai-generation-policy.md`

## 7. 사용자와 기록 정책 (로그인 없음)

- Lambda 가 발급한 학습자 id 를 브라우저 `localStorage` 에 둔다 (`x-session-id` 헤더). 탭을 닫아도 이어지고(다른 기기·시크릿 창은 따로), 서버의 학습자·'내 공부' 기록은 마지막 사용 1년 뒤 TTL 로 지워진다.
- 읽을 코드·첨삭은 **만든 학습자만** 열 수 있다 (`common.load_reading` 의 owner 확인). 연습 코드는 30일, 올린 코드는 1일 보관. '내 공부' 기록(코드 원본 없이 개념·판정·내 설명)은 1년.
- 붙인 메모는 첨삭을 받기 전까지 브라우저(`src/lib/memos.ts`, localStorage)에만 있다.

## 8. 화면 디자인 (공부 노트)

- 책상(`desk`) 위의 **줄 공책 한 장**(`.page`: 28px 가로줄 + 왼쪽 빨간 여백선), 노란 **형광펜**(`.marker`), **포스트잇**(노랑·민트·분홍) + **마스킹테이프**(`.tape`), **나눔펜체** 손글씨(빨간펜 `pen-red`, 파란 볼펜 `pen-blue`), 빨간펜 **○△✕⬚**(`PenMark`), 난이도 **빨간 도장**(`.stamp`), 메뉴는 오른쪽 위 **인덱스 탭**.
- 제목은 고운바탕, 본문은 Pretendard, 코드는 나눔고딕코딩 (Google Fonts·jsDelivr).
- 쓰지 않는 것: 그라데이션, 둥근 카드, 이모지, 파란 버튼. 버튼은 네모난 잉크 버튼(노란 그림자) / 테두리 버튼(검은 그림자).
- 색과 모양은 `tailwind.config.ts` 와 `src/app/globals.css` 에 모여 있다. 모바일(390px)에서도 확인한다.

---

## 9. 아키텍처 (확정)

```
브라우저 ──→ GitHub Pages (정적 화면, Next.js output: export)
   │  JSON (x-session-id) — 주소 하나라 HTTPS 연결을 계속 다시 씀
   └─→ jojo_api 함수 URL (Python, 512MB, 5분) ──→ DynamoDB jojo_table (서울)
                                                 └─→ Bedrock Claude Haiku 4.5 (us-east-1, Converse)
```

### 9.1 요청 경로 (`lambda_function.ROUTES`)
| 경로 | 파일 | AI |
| --- | --- | --- |
| `GET /health` | `lambda_function.py` | |
| `GET /topic/random`, `POST /topic/check` | `topics.py` | 판정만 |
| `POST /practice`, `POST /practice/adjust`, `GET /reading` | `practice.py` | 만들기 |
| `POST /inspect`, `POST /inspect/start` | `inspect_code.py` | 시작만 |
| `POST /review`, `POST /review/retry` | `review.py` | ○ |
| `POST /tutor` | `tutor_chat.py` | ○ |
| `GET /study` | `study.py` | |
| `GET /admin/overview`, `POST /admin/ai`, `POST /admin/code` | `admin.py` (`x-admin-token`) | |

### 9.2 DynamoDB 항목 (pk / sk) — 바꾸면 읽는 모든 기능 파일과 `src/lib/api-types.ts` 를 함께 고치고 `npm run smoke`
| pk | sk | 내용 | 자동 삭제 |
| --- | --- | --- | --- |
| `LEARNER` | `<세션 id>` | level, recentTopics(최근 10개), createdAt, lastSeen | 마지막 사용 1년 뒤 |
| `STUDY#<세션 id>` | `R#<읽은 코드 id>` | readingId, source, level, title, counts, items[{concept, first, best, marked, start, end, memo, bestText, snippet(연습 코드만)}], reviews, createdAt, reviewedAt, readingTtl — '내 공부' 기록 (첨삭마다 갱신, 다시 써서 나아지면 best) | 1년 |
| `READ#<uuid>` | `CODE` | id, owner, source(practice·inspect), language, level, topic, title, code, marks[{id, start, end, why, explanation, keywords}], rootId, regenCount, origin(ai·sample·upload), note, functions, levelReason, createdAt | 연습 30일 · 올린 코드 1일 |
| `READ#<uuid>` | `REVIEW#<시각>` | memos[{start, end, text}], result(첨삭 결과) | 읽을 코드와 같이 |
| `READ#<uuid>` | `RETRY#<첨삭 시각>#<항목 번호>` | attempts[{text, mark, comment, lookAt, byAi, at}], updatedAt — 힌트 보고 다시 써 본 기록 | 읽을 코드와 같이 |
| `READ#<uuid>` | `CHAT#<첨삭 시각>#<항목 번호>` | turns[{role user·tutor, text, lookAt, at}], updatedAt — AI 튜터 대화 | 읽을 코드와 같이 |
| `STATS` | `DAY#yyyy-mm-dd` | practices, adjusts, topicChecks, inspections, reviews, retries, tutorChats (하루 사용 수) | 90일 |
| `USAGE` | `<연-월>#<작업>#<모델>` | calls, input, output, cacheRead, failures (AI 토큰), lastAt, lastError, lastErrorAt | |
| `AILOG` | `<시각>` | task, model, ok, stage(ai·check), input, output, ms, error — 관리자 화면 '최근 AI 호출 기록' | 14일 |
| `META` | `ai_switch` · `admin_code_hash` | AI 끄기 스위치, 관리자 코드(scrypt 해시) | |
| `RL` | `<이름>#<시간 칸>` | 요청 수 제한 카운터 | 시간 칸이 지나면 |

### 9.3 환경 변수
`TABLE_NAME`, `TTL_ATTR`, `AI_MODE`(live·mock·off), `ALLOWED_ORIGINS`, `AI_MONTHLY_BUDGET_USD`, `ADMIN_TOKEN`(관리자 복구 코드, 비밀), 선택 `MODEL_ID`, `RATE_LIMIT_*` — 표: `docs/DEPLOY_LAMBDA.md` 2단계

### 9.4 명령
```bash
npm run api       # Lambda http://localhost:8787 (DynamoDB 흉내 + 목업 AI, Python + boto3 필요)
npm run dev       # 화면 http://localhost:3000
npm run typecheck # 타입 검사
npm test          # 단위 테스트 (TS + Python)
npm run verify    # 예시 코드 실제 실행 + ※ 지점 검증
npm run build     # 정적 화면 빌드 (out/)
npm run smoke     # Lambda 전체 흐름 점검
```

## 10. AWS 운영

### 10.1 현재 자원
| 자원 | 값 |
| --- | --- |
| 계정 | 학교 계정 sgu-202688 (권한 제한 — IAM 역할 생성 불가). 리전 서울 ap-northeast-2, Bedrock 은 us-east-1 |
| 실행 역할 | `SafeRole-sgu-202688` (DynamoDB·Bedrock 가능, VPC 없음) |
| DynamoDB | `jojo_table` (pk·sk 문자열, TTL `jojo_ttl`, 보조 인덱스 없음) |
| Lambda | `jojo_api_py` (Python, 함수 URL). 예전 Node.js `jojo_api`·`jojo_generate_code` 는 삭제 대상 |
| Bedrock | Claude Haiku 4.5 (`us.anthropic.claude-haiku-4-5-20251001-v1:0`) |
| 화면 | GitHub Pages `https://torgeleli22-lang.github.io/teamProject_night_first/` (저장소 변수 `API_URL`) |

### 10.2 이후 단계 (사람이 요청하면 진행)
| 단계 | 내용 |
| --- | --- |
| JavaScript·Java | `inspect_code.read_code`·`find_functions`, 예시 코드, 문법 색칠, 생성 검사(문법 확인 방법)를 언어별로 |
| 코드 실행 확인 (2단계) | AI 가 만든 코드를 실제로 실행해 출력 확인 — 별도 실행 환경이 필요해서 지금은 문법 검사만 |
| 로그인 | 로그인 사용자의 읽은 코드·첨삭 기록 영구 저장 |

## 11. 현재 상태와 다음 할 일

**완료**
- 코드 리딩 노트로 전환: 화면 6개(공부 노트 디자인), Lambda 기능 파일 5개 + 예시 코드, 목업·대체 경로
- 품질: 단위 테스트(TS·Python), 예시 코드 실행 검증, Lambda 전체 흐름 점검(`npm run smoke`), 화면·Lambda 경계 테스트, CI
- 예전 기능(개념·코드 객관식 학습, 채점, 튜터, 학습 분석, 랭킹, AI 문제 생성, Node.js 생성 함수)은 모두 지웠다

**다음 순서**
1. 콘솔의 `jojo_api_py` 파일 바꾸기 (`docs/DEPLOY_LAMBDA.md` 2단계) → 화면 main 병합
2. 실제 AI 로 연습 코드·첨삭 품질 확인 → `SYSTEM_PROMPT` 다듬기
3. JavaScript·Java, 코드 실행 확인

**팀이 정해야 할 것**
- 첨삭 말투·엄격함 (부분 정답을 얼마나 너그럽게 볼지)
- 예시 코드 수 (지금 난이도마다 2개) — AI 를 끈 동안의 다양성
- 월 예산·요청 한도

## 12. AI 에게 작업을 맡길 때 (요청 템플릿)

```
이 저장소의 docs/PROJECT_BRIEF.md 를 먼저 읽고 규칙(§0)을 지켜 주세요.
작업: <예: 내 코드 점검에 JavaScript 추가>
완료 기준: <예: .js 파일을 올리면 함수 목록과 ※ 지점이 나오고 첨삭까지 됨>
제약: 화면 문구는 한국어 존댓말, 비밀 값은 코드에 넣지 않기, 학교 AWS 계정(권한 제한), Lambda 는 콘솔에 붙여넣는 소스
마무리: typecheck · test · verify · build · smoke 통과 후, 바뀐 점과 사람이 콘솔에서 할 일을 정리해 주세요.
```
- 오류를 물을 때는 화면의 메시지와 CloudWatch 로그(`[error]`, `[ai]`, `[generate]` 줄)를 함께 준다.
- 작업이 끝나면 이 문서의 §10·§11 을 최신 상태로 고치게 한다.

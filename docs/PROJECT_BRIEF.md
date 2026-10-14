# 코드리딩 — 프로젝트 설명서 (AI 작업자용)

> 이 문서는 사람과 AI 모두를 위한 **프로젝트의 단일 기준 문서**입니다.
> AI 코딩 도구에게 작업을 맡길 때 이 문서를 먼저 읽게 하세요. 코드와 이 문서가 다르면 **코드가 현재 상태**이고, 이 문서를 함께 고쳐야 합니다.

---

## 0. AI 작업자에게: 먼저 지켜야 할 것

1. **정체성을 지킨다.** 이 서비스는 "코드를 대신 작성해주는 AI"가 아니라 "코드를 스스로 읽고 이해하도록 가르치는 AI"다. 코드 생성 도구·IDE·자동 완성 기능을 추가하지 않는다.
2. **AI 호출은 최소한으로.** 객관식·빈칸·셔플·실행 결과 예측·오류 찾기 채점, 점수, 통계, 추천, 힌트, 해설 표시는 **일반 코드로** 처리한다. AI 는 §6 에 정한 곳에서만 쓴다.
3. **정답을 브라우저로 보내지 않는다.** 채점은 서버에서 한다. 클라이언트로 가는 문제 데이터(`PublicQuestion`)에는 정답·해설·채점 기준이 없다.
4. **콘텐츠는 검증을 통과해야 공개된다.** 문제를 추가·수정하면 `npm run verify` 로 실제 실행 검증을 통과시킨다.
5. **작업을 마치기 전에** `npm run typecheck`, `npm test`, `npm run verify`, `npm run build` 를 모두 통과시킨다.
6. **사용자 화면 문구는 한국어 존댓말("~해요" 체)**, 초보자 눈높이, 친근하지만 유치하지 않게. 틀렸을 때도 실패감을 주지 않는다.
7. 구조는 화면 **GitHub Pages** + 서버 두 가지 중 하나다 (§10, §11): **(A) EC2(API, Docker) + RDS PostgreSQL + 중계 Lambda 경유 Bedrock**, **(B) Lambda API(SafeRole, VPC 없음) + DynamoDB + Bedrock 직접 호출** (`docs/DEPLOY_LAMBDA.md`, 비용·관리 부담이 적어 (B)로 옮기는 중). AI 는 us-east-1 Claude Haiku 4.5. 같은 코드가 `DB_DRIVER`(sqlite·postgres·data-api·dynamodb)와 `AI_PROVIDER`(relay·converse 등)로 둘 다 지원한다. API 코드(`src/api`)는 같은 라우터로 EC2(`server.ts`)와 Lambda(`lambda.ts`)를 모두 지원한다. 화면 코드(`src/app`, `src/components`)는 서버 코드(`src/lib/server`, `src/lib/ai`, `src/api`)를 `import type` 으로만 가져온다 (`tests/boundaries.test.ts`). S3 등 그 밖의 AWS 서비스는 사람이 요청하기 전까지 넣지 않는다.
8. **비밀 값(DB 암호, API 키, ADMIN_TOKEN, AWS 액세스 키)은 코드·문서·GitHub 에 절대 쓰지 않는다.** 서버의 `.env` 에만 둔다.
9. AWS 계정은 **학교 계정(권한 제한)** 이다. IAM 역할 생성, Secrets Manager, 향상된 모니터링처럼 추가 권한이 필요한 기능에 의존하지 않는다.

---

## 1. 한 줄 정의

**개발 입문자가 AI 가 준비한 짧은 JavaScript 코드를 여러 형태의 질문으로 반복해서 읽으며, "이 코드를 보면 어떤 코드인지 이해할 수 있다" 수준에 도달하도록 돕는 웹 학습 서비스.**

- 핵심 문장: "코딩을 대신해주는 AI가 아니라, 코드를 읽고 이해하는 법을 가르쳐주는 AI."
- 차별점: "AI가 문제를 많이 만들어주는 것이 아니라, 학습자가 무엇을 이해하지 못하고 있는지 파악하고 그에 맞는 문제를 만들어준다."
- UX 문장: "어렵게 공부하는 코딩이 아니라, 매일 하나씩 이해하는 코딩."

## 2. 대상과 문제

- **대상**: 프로그래밍 입문자, 비전공자, 학생, 취업 준비생 (개발자가 아님)
- **문제**: 문법 하나하나는 알아도, 여러 문법이 섞인 실제 코드를 보면 흐름을 따라가지 못한다.
- **학습 고리**: 코드 읽기 → 실행 결과 예측 → 내 말로 설명 → 피드백 → 다시 읽기
- **벤치마킹**: GeeksforGeeks Explore(주제·난이도별 문제 탐색 구조), CodinGame(게임처럼 가벼운 학습 경험). UI 는 따라 하지 않고 새로 설계한다.

## 3. 범위

| 포함 (MVP) | 제외 |
| --- | --- |
| JavaScript 코드 읽기 학습 | 다른 언어 (데이터·효과 확인 후 확장) |
| 6가지 문제 유형, 5단계 난이도 | 코드 에디터, 코드 작성 과제, 자동 완성 |
| 규칙 채점 + 필요할 때만 AI 분석 | 프로젝트 생성, 배포 지원, 개발 생산성 도구 |
| 학습/복습 탭, 오답 노트, 캘린더, XP·레벨·배지, 랭킹 | 경쟁 중심 게임화 (랭킹은 보조 요소) |
| AI 콘텐츠 생성 + 실행 검증 + 관리자 화면 | 로그인 (다음 단계, §9 참고) |

---

## 4. 학습 콘텐츠 모델

### 4.1 단원과 개념 (`src/lib/curriculum.ts`)
7개 단원, 25개 개념.

| 단원 | 개념 |
| --- | --- |
| 1 JavaScript 기초 | 변수, let/const, 데이터 타입, 연산자 |
| 2 프로그램 흐름 | if/else, switch, for, while |
| 3 데이터 | 배열, 객체, 문자열 |
| 4 함수 | 함수 선언, 매개변수와 반환값, 화살표 함수, 스코프 |
| 5 배열 활용 | map, filter, forEach, find, reduce |
| 6 브라우저 | DOM, 이벤트 |
| 7 비동기 | Promise, async/await, fetch |

### 4.2 난이도 5단계 (단원과 별개)

| Level | 이름 | 요구하는 사고 | 예 |
| --- | --- | --- | --- |
| 1 | 🌱 입문 | 기억하고 확인하기 | 변수, 숫자, 문자열 |
| 2 | 🌿 기초 | 읽고 예측하기 | 조건문, 반복문, 간단한 배열·함수 |
| 3 | 🌳 초급 | 분석하기 | 배열·객체·함수·map·filter 조합 |
| 4 | 🔥 중급 | 추론하기 ("조건을 바꾸면?") | 여러 함수, 콜백, DOM, Promise |
| 5 | 🚀 심화 | 종합하기 (전체 흐름·데이터 변화 설명) | 실제 개발에 가까운 복합 로직 |

내부에서는 난이도를 숫자 하나로만 보지 않는다. `src/lib/content/analyzer.ts` 가 **코드 줄 수, 문법 요소 수, 개념 수, 논리 복잡도, 데이터 흐름, 추론 깊이**를 규칙으로 계산하고, 이를 합쳐 1~5 로 환산한다.

### 4.3 하나의 코드 → 여러 문제
콘텐츠 단위는 **`CodeItem`(코드 1개) + 여러 `Question`** 이다 (`src/lib/types.ts`). 세션은 같은 코드의 질문을 연달아 내서 "같은 코드, 다른 질문"으로 다시 읽게 한다.

| 문제 유형 (`type`) | 화면 이름 | 채점 |
| --- | --- | --- |
| `multiple_choice` | 객관식 (역할 찾기 포함, `focusLines` 로 줄 강조) | 규칙 |
| `predict_output` | 실행 결과 예측 (직접 입력) | 규칙 (공백·따옴표 차이 허용) |
| `fill_blank` | 빈칸 채우기 | 규칙 |
| `shuffle` | 코드 셔플 (실행 순서 맞추기) | 규칙 |
| `find_bug` | 오류 찾기 (줄 선택) | 규칙 |
| `short_answer` | 주관식 · 코드 해석 (내 말로 설명) | 규칙 1차 평가 → 필요할 때만 AI |

모든 문제에는 **4단계 힌트**(질문 → 핵심 짚기 → 문법 설명 → 방향 제시), 해설, 핵심 개념이 미리 저장되어 있다. 5단계는 "정답과 해설 보기"(오답으로 기록). 객관식·빈칸 보기에는 그 보기를 고르는 사람의 **오개념**이 연결되어 있어 AI 없이 오답 원인을 보여준다.

시드 콘텐츠: `src/lib/content/seed/` (코드 64개, 질문 90개). `sets.ts` 는 여러 문제 세트, `legacy/` 는 1차 MVP 문제를 변환한 것.

---

## 5. 기능 (화면별)

| 경로 | 기능 |
| --- | --- |
| `/` | 랜딩: "코드를 외우지 마세요. 읽고 이해하는 것부터 시작하세요." |
| `/learn` | **학습 탭**: ①난이도 ②문제 유형(여러 개 선택, 기본 "전체 섞어서") ③개념(추천 / 전체 개념 / 직접 선택)으로 **아직 풀지 않은 새 문제** 6개 세션 시작. 오늘의 목표, AI 학습 분석 카드, 복습 안내 카드 |
| `/review` | **복습 탭**: 오답 노트(최근 풀이가 오답인 문제, 다시 풀어서 맞히면 빠짐), 복습 세트(틀린 문제 → 취약 개념), 다지면 좋은 개념, 자주 하는 착각 |
| `/practice` | 문제 풀이. 쿼리: `mode=learn\|review`, `level`, `types=a,b`, `concept=id\|all`, `ids=문제id`. 제출 → 결과 + AI Tutor 영역 + 해설 → 다음 / 비슷한 문제 → 세션 결과 |
| `/ranking` | XP 기준 내 등수·상위 %, 상위 10명, 랭킹 이름(자동 생성, 변경 가능) |
| `/dashboard` | 내 학습: 레벨·XP, 정답률·평균 시간, AI 학습 분석, 개념별 이해도, **학습 캘린더**, 문제 유형별 정답률, 반복 오답·착각, 배지, 최근 기록 |
| `/concepts` | 탐색: 단원·개념별 코드와 질문, 난이도·유형 필터 |
| `/admin` | 콘텐츠 관리: 생성 기준, 출시 전 채우기, 개념×난이도 재고·수요 표, 생성 기록, 검증 보고서, AI 사용량·추정 비용 |
| `/demo` | UI/UX 확인용: 학습자 상태(처음 온 / 꾸준한 / map·filter 혼동) 바꾸기, 랭킹용 가상 참가자, 확인 시나리오 |

게임화: XP(정답 10~15 + 난이도 보너스, 오답도 2), 레벨, 연속 학습일, 오늘의 목표, 배지 7종, 랭킹. 경쟁보다 꾸준함이 목적이다.

---

## 6. AI 사용 원칙 (비용·속도·일관성)

### 6.1 무엇을 AI 로, 무엇을 일반 로직으로

| 기능 | 처리 | AI |
| --- | --- | --- |
| 객관식·빈칸·셔플·예측·오류 찾기 채점 | `src/lib/grading.ts` | 없음 |
| 오답 원인 (객관식) | 보기에 저장된 오개념 | 없음 |
| 힌트 1~4, 해설, 개념 설명 | 저장된 콘텐츠 | 없음 |
| 점수·XP·통계·이해도·연속 학습·랭킹 | `src/lib/learner/stats.ts` + 요약 테이블 | 없음 |
| 다음 문제 추천, 추천 난이도 | `src/lib/server/planner.ts`, `stats.ts` | 없음 |
| 주관식 평가 | 규칙 1차 평가 → 너무 짧음·일부 누락·오개념 표현·판단 불가일 때만 AI | 필요할 때 (smart) |
| "AI 에게 자세히 분석 받기", "튜터에게 질문" | 학습자가 직접 누를 때만 | 요청 시 (smart / fast) |
| 학습자 분석 (혼동 개념, 추천 난이도) | 10문제마다 1번, 백그라운드 | 10문제당 1회 (smart) |
| 새 콘텐츠 생성 | 생성 기준(§7)에 해당할 때만, 백그라운드 | 필요할 때 (smart + 검수 fast) |

### 6.2 구현 규칙 (`src/lib/ai/`)
- 모든 AI 호출은 `client.ts` 의 `askStructured()` 하나를 거친다: **Zod 스키마로 구조화된 출력**, 호출마다 `ai_usage` 테이블에 토큰 기록, 공통 시스템 프롬프트 캐시.
- **모델 분리**: `fast` = `claude-haiku-5-5` (튜터 질문, 콘텐츠 검수), `smart` = `claude-opus-5-5` (주관식 평가, 학습자 분석, 콘텐츠 생성). 환경 변수로 변경 가능.
- **AI 모드** `AI_MODE`: `live`(실제 호출) / `mock`(흉내 낸 응답 + 인위적 지연, UI 확인용) / `off`(AI 없이 규칙·저장 콘텐츠만). 새 AI 작업을 만들면 **반드시 `mock` 응답도 함께** 넣는다.
- AI 가 실패하거나 꺼져 있으면 `withFallback()` 으로 규칙 결과·저장된 해설로 대체한다. 학습 흐름이 끊기면 안 된다.
- 튜터 프롬프트 원칙(`prompts.ts`): 먼저 생각하게, 힌트에서 정답 금지, 왜 틀렸는지 분석, 지금 코드와 연결해 설명, 쉬운 말, 짧고 단계적으로. 학습자 입력은 `<learner_answer>` 태그 안의 데이터로만 취급.

---

## 7. AI 문제 생성 기준 (`src/lib/content/policy.ts`, 상세: `docs/ai-generation-policy.md`)

- 생성 단위는 **칸 = 개념 × 난이도**. 한 번에 코드 1개 + 6가지 유형 문제 세트. 생성된 문제는 **모든 사용자가 공유**.
- **난이도·유형을 바꿨다는 이유만으로는 생성하지 않는다.** 기준은 재고와 수요.

| 트리거 | 조건 (현재 값) |
| --- | --- |
| 출시 전 채우기 | 관리자 실행. 생성 대상 칸마다 최소 12문제까지 |
| 재고 하한 | 학습 세션에서 고른 칸의 공개 문제가 12개 미만 |
| 여러 학습자 소진 | 안 푼 문제가 4개 미만인 학습자가 최근 7일 동안 2명 이상 |
| 맞춤 복습 | 학습자 분석에서 혼동 발견 + 그 칸에 복습할 문제 부족 (학습자당 하루 1회) |

- 칸당 최대 40문제. DOM·이벤트·fetch 는 서버에서 실행 검증이 안 되어 사람이 작성.
- 안전장치: 같은 칸 중복 생성 방지, 하루 상한 30회, 월 예산 $10 (호출 전에 그 호출의 최대 비용까지 더해 확인하므로 넘지 않음).
- "전체 개념" 세션·복습·다시 풀기는 생성 판단을 하지 않는다.

## 8. 콘텐츠 품질 검증 (`src/lib/content/validate.ts`)

AI 생성 콘텐츠와 시드 콘텐츠 모두 같은 검증기를 거친다. 코드는 `runner.ts` 가 **워커 스레드 + vm 컨텍스트**(require/process 없음, 시간 제한)에서 실제로 실행한다.

- 제시한 실행 결과 = 실제 결과, 위험한 코드·무한 루프 없음
- 실행 결과를 묻는 객관식: 실제 결과와 일치하는 보기가 정답 하나뿐
- 빈칸: 보기를 하나씩 넣어 실행했을 때 원래 결과를 내는 보기가 정답 하나뿐
- 오류 찾기: 고친 코드는 기대 결과, 오류 코드는 다른 결과
- 셔플: 올바른 순서가 오류 없이 실행 · 주관식: 모범 답안이 자기 채점 기준 통과
- 목표 난이도 ±1, 난이도에 비해 어려운 문법 없음

AI 생성은 검증 실패 시 실패 이유를 알려주고 1회 재생성 → 저비용 모델 검수 → 통과하면 `published`, 아니면 `rejected`(비공개, 보고서 보관).

---

## 9. 사용자와 기록 정책 (현재: 로그인 없음)

- 첫 API 요청 때 서버가 세션 id(UUID)를 만들어 응답 헤더 `x-session-id` 로 준다. 화면은 이를 **`sessionStorage`** 에 두고 매 요청에 같은 헤더로 보낸다 (`src/lib/api.ts`).
- **창(탭)을 닫으면 새로 시작**한다. 서버 기록은 마지막 사용 후 `SESSION_TTL_HOURS`(기본 12)가 지나면 세션과 함께 자동 삭제(ON DELETE CASCADE).
- 서버는 모르는 세션 id 로 세션을 만들지 않는다(새 id 발급). 다른 사람의 세션 id 는 응답에 넣지 않는다 (랭킹은 `isMe` 만).
- 랭킹은 지금 참여 중인(최근 TTL 안) 세션끼리 비교한다.
- 로그인을 붙일 때: `users` 테이블을 추가하고 `src/api/router.ts` 의 `ctx.session()` 이 계정을 돌려주게 한다. 로그인 사용자만 기록을 영구 저장하는 방향으로 논의됨.

---

## 10. 아키텍처 (확정)

### 10.1 구성

```
브라우저 ──→ GitHub Pages: 정적 화면 (Next.js output: "export", basePath /teamProject_night_first)
   │
   └─ fetch (x-session-id 헤더, HTTPS) ─→ EC2: Caddy(HTTPS) → API 서버 (src/api/server.ts, Docker)  ※ Lambda(src/api/lambda.ts)로도 실행 가능
                                    ├─ router.ts: CORS, 세션, 경로 표 (routes.ts)
                                    ├─ views.ts : 화면별 데이터 (화면당 요청 1번)
                                    ├─ 도메인 로직 (src/lib): 채점, 통계, 추천, 생성 기준, 검증
                                    ├─ background.ts: AI 생성·학습자 분석은 응답 뒤에 실행 (EC2: 같은 프로세스, Lambda: 자기 자신 비동기 호출)
                                    ├─ DB (src/lib/server/db): RDS PostgreSQL ← pg 직접 연결 (EC2·RDS 모두 default 보안 그룹)
                                    └─ Claude API ← AI_MODE=live 일 때만
```

| 항목 | 기술 |
| --- | --- |
| 화면 | Next.js 15 정적 내보내기, React 19, TypeScript 5, Tailwind CSS 3 |
| API | Node.js 22. EC2: Docker(`Dockerfile`, `docker-compose.yml`, `Caddyfile`, `npm run build:server`). Lambda: `npm run build:lambda` → `dist/lambda.zip` |
| DB 드라이버 (`DB_DRIVER`) | `sqlite`(로컬·테스트, node:sqlite) · `postgres`(pg, 직접 연결 — 운영) · `data-api`(Aurora Data API, Aurora 허용 계정용) |
| 검증 | Zod 4 (API 입력, AI 구조화 출력) |
| AI | Anthropic SDK (`client.beta.messages.parse` + 구조화 출력) |
| 테스트 | `node:test` + `tsx`, API 흐름 점검 `scripts/api-smoke.ts` |
| CI/CD | `.github/workflows/ci.yml`(검사 + lambda.zip), `pages.yml`(main → GitHub Pages) |

### 10.2 주요 요청 흐름
1. **화면 열기** 정적 HTML 이 뜨고, 화면이 `GET /learn` 같은 화면용 API 를 한 번 부른다. 3초 넘게 걸리면 "서버를 깨우는 중" 안내 (Lambda 콜드 스타트·DB 재개).
2. **학습 시작** `POST /session` → `planner.ts` 가 저장된 문제에서 6개 선택(AI 없음) → 정답을 뺀 `PublicQuestion` 반환. 생성 기준에 해당하면 백그라운드 생성.
3. **답 제출** `POST /attempts` → `grade.ts` 가 규칙 채점(주관식만 필요 시 AI) → `attempts` + 요약 테이블 2개를 한 트랜잭션으로 저장 → 결과·해설·AI Tutor 내용 반환. 10문제마다 백그라운드로 학습자 분석.
4. **화면 갱신** 풀이·이름 변경·초기화 뒤 `notifyChanged()` → 헤더(XP·연속 학습) 등이 다시 불러온다.

### 10.3 DB 테이블 (`src/lib/server/db/schema.ts`)

| 그룹 | 테이블 | 내용 |
| --- | --- | --- |
| ① 문제 (공유, 메모리 캐시) | `code_items`, `questions` | 코드와 문제 (문제는 JSON payload) |
| ② 사용자 | `sessions` | 세션 1개 = 1줄 (닉네임, 선택 난이도, 하루 목표, 마지막 사용 시각) |
| ③ 학습 기록 (세션 삭제 시 함께 삭제) | `attempts` | 풀이 1건 = 1줄 |
| | `daily_activity` | 세션 × 날짜 요약 (캘린더·연속 학습·XP·랭킹) |
| | `concept_progress` | 세션 × 개념 요약 (이해도: 최근 5회 품질 × 풀이 수 신뢰도) |
| | `analyses` | 10문제마다 AI 학습 분석 |
| ④ 운영 | `generation_jobs`, `demand_signals`, `ai_usage`, `app_meta` | 생성 기록, 칸 소진 수요, AI 토큰 사용량, 시드 버전 |

- SQL 규칙: `?` 자리표시자, 참/거짓은 INTEGER 0/1, 집계는 `CAST(... AS INTEGER)`, upsert 의 기존 값은 `테이블명.열` (SQLite·PostgreSQL 공통).
- 시드 콘텐츠는 시드 해시가 바뀌었을 때만 DB 로 동기화한다. 콘텐츠 캐시는 30초마다 버전(개수·최근 시각)만 확인하고 바뀌면 다시 읽는다 (Lambda 인스턴스가 여러 개여도 새 콘텐츠 반영).

### 10.4 디렉터리

```
src/
  app/, components/        화면 (정적). API 는 src/lib/api.ts 의 apiGet·apiPost·useApi 로만
  api/                     API (Lambda): lambda.ts, server.ts, router.ts, routes.ts, views.ts, background.ts, core.ts
  lib/
    types.ts, curriculum.ts, grading.ts, schemas.ts   공용 (화면·API)
    learner/stats.ts       통계·이해도·XP·연속 학습·배지·랭킹 %  ← 순수 함수
    content/               analyzer(난이도), runner(격리 실행), validate(검증), policy(생성 기준), seed/
    server/                (API 전용) db/(드라이버·스키마), content-repo, session-repo, ops-repo, progress, planner, grade, demo
    ai/                    (API 전용) client, prompts, tutor, analysis, generate, mock-content
scripts/                   verify-content.ts(콘텐츠 검증), api-smoke.ts(API 흐름), build-lambda.mjs(zip)
tests/                     grading, validate, policy, ranking, boundaries, data-api
docs/                      이 문서, AI 생성 기준, DEPLOY_AWS.md(배포 순서)
```

### 10.5 API (Lambda 함수 URL 기준 경로)

| 메서드·경로 | 용도 |
| --- | --- |
| `GET /health` | 상태 (DB 드라이버, AI 모드) |
| `GET /me`, `POST /me` | 헤더 정보 / 선호 난이도·닉네임·기록 초기화 |
| `GET /learn`, `/review`, `/ranking`, `/dashboard`, `/concepts`, `/demo` | 화면별 데이터 |
| `POST /session` | 세션 구성 `{ level, mode?, concept?, types?, ids?, size?, exclude? }` |
| `POST /attempts` | 답 제출·채점 `{ questionId, answer?, giveUp?, hintsUsed, timeMs }` |
| `POST /hint` | 저장된 힌트 1단계씩 |
| `POST /ask`, `POST /explain` | AI 튜터 질문, 주관식 AI 자세히 분석 (학습자 요청 시) |
| `POST /demo` | 데모 학습자 / 가상 랭킹 참가자 (목업 모드·로컬만) |
| `GET /admin/overview`, `POST /admin/generate`, `GET·POST /admin/fill` | 관리자 (`x-admin-token`, 미설정 시 로컬만) |

### 10.6 환경 변수 (`.env.example`)
- API: `AI_MODE`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL_FAST/SMART`, `AI_GENERATION_DAILY_LIMIT`, `AI_MONTHLY_BUDGET_USD`(기본 10, 넘길 수 있는 호출은 하지 않음), `DB_DRIVER`, `DATABASE_PATH`, `DATABASE_URL`, `DB_CLUSTER_ARN`, `DB_SECRET_ARN`, `DB_NAME`, `ADMIN_TOKEN`, `ALLOWED_ORIGINS`, `SESSION_TTL_HOURS`, `BACKGROUND_MODE`(inline 이면 비동기 호출 없이 요청 안에서)
- 화면(빌드 시): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BASE_PATH`

### 10.7 명령

```bash
npm install
cp .env.example .env           # 기본 AI_MODE=mock, DB_DRIVER=sqlite
npm run api                    # API http://localhost:8787
npm run dev                    # 화면 http://localhost:3000 (데모: /demo, 관리자: /admin)
npm run typecheck && npm test && npm run verify && npm run build   # 작업 완료 전 필수
npm run smoke                  # API 흐름 점검 (API 를 바꿨다면)
npm run build:server           # dist/server/index.js (EC2 Docker 가 사용)
npm run build:lambda           # dist/lambda.zip (Lambda 를 쓸 때)
```

---

## 11. AWS 운영

### 11.1 현재 자원
| 자원 | 값 |
| --- | --- |
| 계정 | 학교 계정 (권한 제한). 리전 서울 ap-northeast-2 |
| 막힌 권한 | Aurora 클러스터 생성(`Shingu-AdditionalRule-AuroraCluster`), RDS 화면의 보안 그룹 규칙 추가(`ec2:AuthorizeSecurityGroupIngress`), IAM 역할 생성(`SafePowerUser`), 기존 Lambda 역할의 VPC 권한 없음 |
| RDS | `database-jojo`, PostgreSQL 18, db.t4g.micro, 퍼블릭 액세스 없음, 보안 그룹 `default`, DB `jojobase`, 마스터 `jojo` |
| API 서버 | EC2 `codereading-api` (Amazon Linux 2023, Docker: api + caddy). 보안 그룹: 80·443 공개 그룹 + **default**(RDS 접속용). 주소 `https://<공인IP-대시>.sslip.io` (Caddy 자동 HTTPS). 설정은 서버의 `.env` |
| 화면 | GitHub Pages `https://torgeleli22-lang.github.io/teamProject_night_first/` (저장소 변수 `API_URL`) |
| Bedrock | us-east-1 Claude Haiku 4.5 (`us.anthropic.claude-haiku-4-5-20251001-v1:0`). 액세스 키·역할 생성이 막혀 있어 **EC2 → 중계 Lambda(VPC 밖, 실행 역할 `SafeRole-sgu-202688`, 함수 URL + `RELAY_TOKEN`) → Bedrock Converse API**. Lambda 코드: `infra/bedrock-relay/lambda_function.py` (구조화 응답은 도구 강제 호출, 모델 고정). EC2 `.env`: `AI_PROVIDER=relay`, `AI_RELAY_URL`, `AI_RELAY_TOKEN`. 키가 있는 환경용 `AI_PROVIDER=bedrock`(직접 호출)도 남아 있음 |

| Lambda + DynamoDB (B) | API Lambda (Node.js 22, 실행 역할 `SafeRole-sgu-202688`, 함수 URL, `DB_DRIVER=dynamodb`, `AI_PROVIDER=converse`). DynamoDB 테이블 `codereading` (pk·sk 문자열, TTL `ttl`, 보조 인덱스 없음 — 구조는 `src/lib/server/dynamo/client.ts`). 권한 확인 결과: DynamoDB·Lambda 자기 호출·Bedrock 가능, Lambda 의 VPC(RDS) 접속은 불가. 업데이트는 Actions 의 `lambda-upload` 를 콘솔에 올림 |

배포 순서와 문제 해결: (A) `docs/DEPLOY_AWS.md`, (B) `docs/DEPLOY_LAMBDA.md`. 두 서버 사이에는 관리자 화면의 **데이터 옮기기**(내보내기·가져오기)로 AI 콘텐츠·설정·이번 달 사용량을 옮긴다. 코드는 Aurora Data API(`DB_DRIVER=data-api`)도 지원하므로, Aurora 가 허용되는 계정에서는 VPC 없이 배포할 수 있다.

### 11.2 이후 단계 (계획 — 사람이 요청하면 진행)
| 단계 | 내용 | 비고 |
| --- | --- | --- |
| 실제 AI | 코드 완료 (`AI_PROVIDER=relay`). Lambda 만들고 EC2 `.env` 설정 후 `AI_MODE=live` (`docs/DEPLOY_AWS.md` 8단계) | 예산(`AI_MONTHLY_BUDGET_USD`)을 넘으면 자동으로 규칙 기반으로 바뀜 |
| API 자동 배포 | Actions → EC2 (SSH) | 지금은 서버에서 git pull + docker build |
| S3 | AI 생성 원본·검증 보고서 보관 | 선택 |
| 로그인 | `users` 테이블, 로그인 사용자만 기록 영구 저장 | 방식 미정 (소셜 로그인 추천) |

---

## 12. UI/UX 가이드

- 키워드: Friendly · Modern · Simple · Educational · Focused. 기업용 SaaS 처럼 딱딱하지도, 게임처럼 유치하지도 않게.
- 사용자가 느껴야 할 것: "뭘 공부해야 하지?"가 아니라 "오늘 이것 하나만 해보자."
- 한 화면에 정보를 너무 많이 두지 않는다. 다음 행동 버튼을 항상 분명하게.
- 코드 영역은 어두운 개발 환경 느낌(구문 강조 색은 절제), 나머지는 밝은 교육 서비스 느낌. 카드, progress bar, badge, 가벼운 애니메이션.
- 색: `brand`(보라, 주 행동), `mint`(정답·좋음), `sun`(주의·힌트·복습), `coral`(오답) — `tailwind.config.ts`.
- 모바일과 데스크톱 모두 확인 (모바일 하단 메뉴: 학습·복습·랭킹·내 학습).
- AI 결과는 "AI Tutor" 영역에 표시하고, 배지로 출처를 구분한다: ✨ AI 분석 / ⚡ 자동 분석(규칙) / 📘 해설(저장).
- **Liquid Glass 스타일** (참고: dashersw/liquid-glass-js README): 카드·메뉴는 반투명 유리(`.glass`, `.glass-bar`, `.glass-soft`, `.glass-orb`, `.glass-hero` — `globals.css`). WebGL 라이브러리는 쓰지 않고 CSS(backdrop-filter, 테두리 빛, 위쪽 반사광)로 구현한다. 유리 안의 유리는 더 옅게, 코드 영역은 어둡게 유지. 미지원 브라우저·투명도 줄이기 설정에서는 불투명 바탕.
- `backdrop-filter` 가 있는 요소 안에 `position: fixed` 요소를 넣지 않는다 (기준이 바뀜 — 모바일 하단 메뉴는 헤더 밖 `MobileNav`).

---

## 13. 현재 상태와 다음 할 일

**완료**
- 기능: 학습·복습·랭킹·내 학습·탐색·문제 풀이·관리자·데모 (§5), 목업 AI 모드
- 구조 전환: 정적 화면 + Lambda API + DB 드라이버 3종 (SQLite·PostgreSQL·Aurora Data API), Liquid Glass UI
- 품질: 단위 테스트, 콘텐츠 실행 검증, API 흐름 점검(SQLite·PostgreSQL), 화면·서버 경계 테스트, CI
- 콘텐츠: 시드 64개 코드 / 90문제 (입문~초급 위주)

**다음 순서**
1. AWS 에 올리기: RDS(완료) → EC2(API) → GitHub Pages (`docs/DEPLOY_AWS.md`)
2. 실제 AI 연결 → `AI_MODE=live`, `/admin` 에서 출시 전 콘텐츠 채우기 (중급·심화)
3. 로그인 → 로그인 사용자 기록 영구 저장

**팀이 정해야 할 것**
- 생성 기준 숫자 (`docs/ai-generation-policy.md` 의 "팀이 정해야 할 것")
- 랭킹 범위(전체 / 오늘 / 이번 주)와 하위권 표시 방식
- 반려된 AI 콘텐츠 처리 방식 (버림 / 관리자 수정 후 재검증)
- 로그인 방식

---

## 14. AI 에게 작업을 맡길 때 (요청 템플릿)

```
이 저장소의 docs/PROJECT_BRIEF.md 를 먼저 읽고 규칙(§0)을 지켜 주세요.
작업: <예: §11.2 실제 AI 연결>
완료 기준: <예: /admin 에서 생성 → 검증 → 공개까지 동작>
제약: 화면 문구는 한국어 존댓말, 비밀 값은 코드에 넣지 않기, 학교 AWS 계정(권한 제한)
마무리: typecheck · test · verify · build 통과 후, 바뀐 점과 사람이 서버에서 할 일을 정리해 주세요.
```
- 한 번에 하나의 단계만 맡긴다. 큰 작업(DB 전환 등)은 "계획 먼저 보여 주고 진행"을 요청한다.
- API 오류를 물을 때는 브라우저 화면의 메시지와 Lambda CloudWatch 로그의 `[api]` 줄을 함께 준다.
- 작업이 끝나면 이 문서의 §11·§13 을 최신 상태로 고치게 한다.

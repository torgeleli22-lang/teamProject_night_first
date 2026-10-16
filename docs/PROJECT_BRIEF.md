# 코드리딩 — 프로젝트 설명서 (AI 작업자용)

> 이 문서는 사람과 AI 모두를 위한 **프로젝트의 단일 기준 문서**입니다.
> AI 코딩 도구에게 작업을 맡길 때 이 문서를 먼저 읽게 하세요. 코드와 이 문서가 다르면 **코드가 현재 상태**이고, 이 문서를 함께 고쳐야 합니다.

---

## 0. AI 작업자에게: 먼저 지켜야 할 것

1. **정체성을 지킨다.** 이 서비스는 "코드를 대신 작성해주는 AI"가 아니라 "코드를 스스로 읽고 이해하도록 가르치는 AI"다. 코드 생성 도구·IDE·자동 완성 기능을 추가하지 않는다.
2. **AI 호출은 최소한으로.** 객관식·빈칸·실행 결과 예측 채점, 점수, 통계, 추천, 힌트, 해설 표시는 **일반 코드로** 처리한다. AI 는 §6 에 정한 곳에서만 쓴다.
3. **정답을 브라우저로 보내지 않는다.** 채점은 Lambda(`submit_answer.py`)에서 한다. 화면으로 가는 문제 데이터(`PublicQuestion`, `questions.py` 의 `to_public`)에는 정답·해설·채점 기준이 없다.
4. **콘텐츠는 검증을 통과해야 공개된다.** 문제를 추가·수정하면 `npm run verify` 로 실제 실행 검증을 통과시킨다.
5. **작업을 마치기 전에** `npm run typecheck`, `npm test`, `npm run verify`, `npm run build` 를 모두 통과시킨다.
6. **사용자 화면 문구는 한국어 존댓말("~해요" 체)**, 초보자 눈높이, 친근하지만 유치하지 않게. 틀렸을 때도 실패감을 주지 않는다.
7. 구조는 **화면 GitHub Pages + Lambda 2개 + DynamoDB + Bedrock** 이다 (§10, §11, `docs/DEPLOY_LAMBDA.md`). 최소 비용·최소 구성·최고 속도가 목표: 화면의 모든 요청은 Python 함수 **`jojo_api`(`lambda/api/`, 함수 URL 하나)** 가 받고 기능별 파일(`questions.py`, `submit_answer.py` …)로 나눈다. 코드 실행 검증이 필요한 AI 코드 문제 생성만 Node.js 함수 `jojo_generate_code`(`lambda/generate-code/`). 코드는 **콘솔 코드 탭에 붙여넣는 읽을 수 있는 소스**로 유지한다 (zip·번들·압축 금지, 단계마다 번호 주석, 외부 라이브러리 없이 boto3·런타임 AWS SDK 만). 함수를 기능마다 늘리지 않는다. 화면(`src/app`, `src/components`, `src/lib`)은 `lambda/` 를 가져오지 않고 `src/lib/api.ts` 로만 부른다 (`tests/boundaries.test.ts`). AI 는 us-east-1 Claude Haiku 4.5. S3 등 그 밖의 AWS 서비스는 사람이 요청하기 전까지 넣지 않는다.
8. **비밀 값(ADMIN_TOKEN, API 키, AWS 액세스 키)은 코드·문서·GitHub 에 절대 쓰지 않는다.** Lambda 환경 변수(로컬은 `.env`)에만 둔다.
9. AWS 계정은 **학교 계정(권한 제한)** 이다. IAM 역할 생성, Secrets Manager, 향상된 모니터링처럼 추가 권한이 필요한 기능에 의존하지 않는다.

---

## 1. 한 줄 정의

**개발 입문자가 두 갈래로 배우는 웹 학습 서비스.**
- **개념**: 네트워크·개발·운영 및 유지보수·보안 지식을 자격증 시험처럼 객관식으로 확인한다 (자격증 과목 태그로 시험 대비도 가능).
- **코드**: 짧은 코드 하나를 읽는 순서대로(훑어보기 → 흐름 따라가기 → 핵심 줄 → 정리) 단계별로 읽으며 "이 코드를 보면 어떤 코드인지 이해할 수 있다" 수준에 도달한다.

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
| 개념 학습(4분야, 객관식, 자격증 과목 태그) + JavaScript 코드 읽기 학습(단계별) | 다른 언어 (실행 검증기를 붙이면 확장 — Python 다음) |
| 5단계 난이도, 규칙 채점 + 필요할 때만 AI 분석 | 코드 에디터, 코드 작성 과제, 자동 완성 |
| 학습/복습 탭, 오답 노트, 캘린더, XP·레벨·배지, 랭킹 | 경쟁 중심 게임화 (랭킹은 보조 요소) |
| AI 생성: 코드(실행 검증) · 개념(AI 교차 검수 + 관리자 승인) | 로그인 (Google·GitHub, 다음 단계), Python |

---

## 4. 학습 콘텐츠 모델 (`src/lib/types.ts`, `src/lib/curriculum.ts`)

### 4.1 두 갈래 (`Track`)
코드에서는 화면 이름 "개념"을 `theory` 라고 부른다 (개념 id `ConceptId` 와 헷갈리지 않게).

| 갈래 | 단원 | 주제·개념 | 문제 |
| --- | --- | --- | --- |
| `theory` (개념) | 분야 4개: 네트워크(11) · 개발(12) · 운영 및 유지보수(13) · 보안(14) | 18개 (OSI 7계층, TCP/UDP, IP·서브넷, HTTP, DNS, 개발 방법론, 자료구조, 객체지향, 테스트, Git, 운영체제, DB, 클라우드, 장애 대응, 암호화, 웹 공격, 인증, 보안 위협) | 4지선다 객관식. 문제마다 자격증 과목 태그 `certs` (`CERT_SUBJECTS`: 정보처리기사 1~5과목, 네트워크관리사, 리눅스마스터, SQLD, 정보보안기사) |
| `code` (코드) | JavaScript 단원 6개 (기초·흐름·데이터·함수·배열 활용·비동기) | 21개 | 코드 하나 + 읽기 단계 문제 |

### 4.2 코드 학습의 읽기 단계 (`Stage`, `STAGE_INFO`)
한 코드의 문제는 이 순서로 나온다. 세션 = 코드 2개.

| 단계 | 학습자가 하는 일 | 형식 |
| --- | --- | --- |
| ① `overview` 훑어보기 | "무엇을 하는 코드일까?" | 객관식 |
| ② `trace` 흐름 따라가기 | 강조된 줄이 실행될 때마다 변수 값 채우기 | 추적표. 정답은 서버가 코드를 실제로 실행하며 기록한 값 (`lambda/generate-code/checks.mjs` 의 `traceCode`) |
| ③ `key` 핵심 줄 | 가장 중요한 줄의 역할 | 객관식(`focusLines`) 또는 빈칸 |
| ④ `wrapup` 정리 | 결과 예측 + 내 말로 설명 | 출력 예측 + 주관식 |

### 4.3 난이도 5단계 (갈래와 별개)
| Level | 이름 | 코드 | 개념 |
| --- | --- | --- | --- |
| 1 | 🌱 입문 | 변수, 숫자, 문자열 | 용어의 뜻 |
| 2 | 🌿 기초 | 조건문, 반복문, 간단한 배열·함수 | 동작 원리 |
| 3 | 🌳 초급 | 배열·객체·함수·map·filter 조합 | 비슷한 개념 구분·비교 |
| 4 | 🔥 중급 | 여러 함수, 콜백, Promise | 상황에 맞는 방법 고르기 |
| 5 | 🚀 심화 | 실제 개발에 가까운 복합 로직 | 여러 개념을 엮어 판단 |

코드의 난이도는 `analyzer.ts` 가 코드 줄 수·문법 요소·개념 수·논리 복잡도·데이터 흐름·추론 깊이로 계산한다.

### 4.4 문제 형식과 채점
| `type` | 쓰는 곳 | 채점 |
| --- | --- | --- |
| `multiple_choice` | 개념 전부, 코드 훑어보기·핵심 줄 | 규칙. **보기는 문제 id 로 정한 순서로 섞어서 보여 주고**(`questions.py` 의 `to_public`), 고른 번호는 `submit_answer.py` 가 원래 번호로 되돌려 채점 (`common.py` 의 `unshuffle_answer`) |
| `fill_blank` | 코드 핵심 줄 | 규칙 (보기 섞기 동일) |
| `predict_output` | 코드 정리 | 규칙 (공백·따옴표 차이 허용) |
| `short_answer` | 코드 정리 | 규칙 1차 평가 → 필요할 때만 AI |
| `trace` | 코드 흐름 따라가기 | 규칙. 칸마다 실행 기록과 비교 (공백·바깥 따옴표 차이 허용), 절반 이상 맞으면 부분 정답 |

**흐름 따라가기 만드는 법**: 문제에 `watch`(따라갈 줄, 실행 직전 `before`/직후 `after`, 물어볼 식 `ask`, 상황 설명 `given`)를 정하면, 실행기가 그 줄 앞·뒤에 기록 문장을 끼워 넣고 실행해서 `rows`(칸과 정답)를 만든다. 기록을 넣어도 출력이 원래와 같아야 하고, 물어볼 식은 값을 바꾸거나 함수를 부르면 안 된다. 시드는 `rows` 를 적어 두고 `npm run verify` 가 다시 실행해 같은지 확인하며, AI 생성은 코드가 정해지면 따라갈 줄을 규칙으로 골라(`pickWatch`) 자동으로 만든다 (AI 호출 없음). 다른 언어는 `checks.mjs` 의 `traceCode` 에 같은 모양의 실행기를 추가한다.

모든 문제에 힌트 1~4개, 해설, 핵심 개념이 저장되어 있다. 힌트를 다 보면 "정답과 해설 보기"(오답으로 기록). 객관식·빈칸 오답 보기에는 **오개념**이 연결되어 있어 AI 없이 오답 원인을 보여준다.

시드 콘텐츠 (`src/lib/content/seed/`): `code-lessons.ts` 코드 6개(문제 30개, 코드마다 4단계 모두), `theory.ts` 주제 18개(문제 54개). 시드는 정답을 맨 앞에 써도 화면에서 섞인다.

**학습 구조 전환 (content model 2)**: 예전 형식(코드 하나에 6가지 유형, 셔플·오류 찾기)을 버리고 지금 구조로 바꿨다. 새 버전이 처음 뜰 때 예전 문제·학습 기록·랭킹을 **한 번** 지운다 (`db/index.ts` `resetForContentModel`, DynamoDB 는 `dynamo/content.ts`). AI 사용량·관리자 코드·자동 생성 설정은 남긴다. 데이터 옮기기의 예전 형식 파일(`codereading-export/1`)은 콘텐츠를 건너뛰고 설정·사용량만 가져온다.

---

## 5. 기능 (화면별)

| 경로 | 기능 |
| --- | --- |
| `/` | 랜딩: "코드를 외우지 마세요. 읽고 이해하는 것부터 시작하세요." |
| `/learn` | **학습 탭**: ① 개념 / 코드 고르기 → 개념: 분야 → 주제(분야 전체 가능) → 자격증 대비(선택) → 난이도로 **안 푼 객관식 10문제**. 코드: 언어(JavaScript, 나머지 준비 중) → 난이도 → 개념(추천 / 전체 / 직접)으로 **안 읽은 코드 2개를 단계별로**. 오늘의 목표, AI 학습 분석 카드, 복습 안내 카드 |
| `/review` | **복습 탭**: 오답 노트(최근 풀이가 오답인 문제, 다시 풀어서 맞히면 빠짐), 갈래별 복습 세트(틀린 문제 → 취약 개념), 다지면 좋은 개념, 자주 하는 착각 |
| `/practice` | 문제 풀이. 쿼리: `mode=learn\|review`, `track=theory\|code`, `level`, `concept=id\|all`, `unit=분야 id`, `cert=자격증 이름`, `ids=문제id`. 코드 문제는 단계 표시, 개념 문제는 주제·자격증 표시. 제출 → 결과 + AI Tutor 영역 + 해설 → 다음 / 비슷한 문제 → 세션 결과 |
| `/ranking` | XP 기준 내 등수·상위 %, 상위 10명, 랭킹 이름(자동 생성, 변경 가능) |
| `/dashboard` | 내 학습: 레벨·XP, 정답률·평균 시간, AI 학습 분석, 개념별 이해도, **학습 캘린더**, 문제 유형별 정답률, 반복 오답·착각, 배지, 최근 기록 |
| `/concepts` | 탐색: 분야·단원별 주제와 문제, 난이도·갈래 필터 |
| `/admin` | 콘텐츠 관리: 생성 기준, 출시 전 채우기, 개념×난이도 재고·수요 표, 생성 기록, 검증 보고서, 승인 대기(개념 문제), AI 사용량·추정 비용, 데이터 옮기기, 관리자 코드 |

게임화: XP(정답 10~15 + 난이도 보너스, 오답도 2), 레벨, 연속 학습일, 오늘의 목표, 배지 7종, 랭킹. 경쟁보다 꾸준함이 목적이다.

---

## 6. AI 사용 원칙 (비용·속도·일관성)

### 6.1 무엇을 AI 로, 무엇을 일반 로직으로

| 기능 | 처리 | AI |
| --- | --- | --- |
| 객관식·빈칸·예측·흐름 따라가기 채점 (보기 섞기·되돌리기 포함) | `submit_answer.py` (`grade`), `common.py` (`seeded_permutation`) | 없음 |
| 오답 원인 (객관식) | 보기에 저장된 오개념 | 없음 |
| 힌트 1~4, 해설, 개념 설명 | 저장된 콘텐츠 (`questions.py` `/hint`) | 없음 |
| 점수·XP·통계·이해도·연속 학습·랭킹 | `common.py` 8번 + `my_page.py` (하루·개념 요약 항목) | 없음 |
| 다음 문제 추천, 추천 난이도 | `questions.py` (`plan_session`), `common.py` (`suggest_level`) | 없음 |
| 주관식 평가 | 규칙 1차 평가 → 너무 짧음·일부 누락·오개념 표현·판단 불가일 때만 AI | 필요할 때 |
| "AI 에게 자세히 분석 받기", "튜터에게 질문" | 학습자가 직접 누를 때만 (`submit_answer.py` `/explain`, `tutor_chat.py`) | 요청 시 |
| 학습자 분석 (혼동 개념, 추천 난이도) | 10문제마다 1번, `learner_analysis.py` 가 뒤에서 | 10문제당 1회 |
| 새 콘텐츠 생성 | 생성 기준(§7)에 해당할 때만, `jojo_generate_code`·`generate_theory.py` 가 뒤에서 | 필요할 때 (+ 검수) |

### 6.2 구현 규칙
- Python 의 AI 호출은 `common.py` 의 `ask_ai()`(정해진 JSON 형식 — Bedrock Converse 의 도구 강제 호출 + 형식 검사·흔한 어긋남 고치기) 또는 `ask_text()`(튜터 대화 글)만 거친다. generate-code 는 `index.mjs` 의 `askAi()`. 모두 호출 전에 **월 예산**(이번 호출의 최대 비용 포함)을 확인하고, 호출마다 `USAGE` 항목에 토큰을 기록한다.
- 모델: Bedrock `us.anthropic.claude-haiku-4-5-20251001-v1:0` (환경 변수 `MODEL_ID`).
- **AI 모드** `AI_MODE`: `live`(실제 호출) / `mock`(흉내 낸 응답, 비용 없음 — 로컬 기본값) / `off`(AI 없이 규칙·저장 콘텐츠만). 새 AI 작업을 만들면 **반드시 `mock` 응답도 함께** 넣는다.
- AI 가 실패하거나 꺼져 있으면(`AiUnavailable`) 규칙 결과·저장된 해설로 대체한다. 학습 흐름이 끊기면 안 된다.
- 튜터 원칙: 먼저 생각하게, 아직 안 풀었으면 정답 금지, 왜 틀렸는지 분석, 지금 문제와 연결해 설명, 쉬운 말, 짧고 단계적으로. 학습자 입력은 `<learner>`·`<learner_answer>` 태그 안의 데이터로만 취급.

---

## 7. AI 문제 생성 기준 (`lambda/api/common.py` 의 `POLICY`·`LEVELS_BY_UNIT`, 판단: `questions.py`·`learner_analysis.py`, 상세: `docs/ai-generation-policy.md`)

- 생성 단위는 **칸 = 개념 × 난이도**. 코드 학습만: 한 번에 코드 1개 + 읽기 단계 문제 4개(훑어보기 1·핵심 줄 1·정리 2). 생성된 문제는 **모든 사용자가 공유**.
- **난이도·유형을 바꿨다는 이유만으로는 생성하지 않는다.** 기준은 재고와 수요.

| 트리거 | 조건 (현재 값) |
| --- | --- |
| 출시 전 채우기 | 관리자 실행. 생성 대상 칸마다 최소 8문제(코드 2개)까지 |
| 재고 하한 | 학습 세션에서 고른 칸의 공개 문제가 12개 미만 |
| 여러 학습자 소진 | 안 푼 문제가 4개 미만인 학습자가 최근 7일 동안 2명 이상 |
| 맞춤 복습 | 학습자 분석에서 혼동 발견 + 그 칸에 복습할 문제 부족 (학습자당 하루 1회) |

- 칸당 최대 28문제. 개념 학습 주제는 관리자가 직접 만들 때만 생성하고(자동 생성·출시 전 채우기 제외), AI 교차 검수를 통과한 문제를 `pending` 으로 저장해 관리자가 승인해야 공개된다.
- 안전장치: 같은 칸 중복 생성 방지, 하루 상한 30회, 월 예산 $10 (호출 전에 그 호출의 최대 비용까지 더해 확인하므로 넘지 않음).
- "전체 개념" 세션·복습·다시 풀기는 생성 판단을 하지 않는다.

## 8. 콘텐츠 품질 검증 (`lambda/generate-code/checks.mjs`)

AI 생성 콘텐츠(`jojo_generate_code`)와 시드 콘텐츠(`npm run verify`) 모두 같은 검증기를 거친다. 코드는 **워커 스레드 + vm 컨텍스트**(require/process 없음, 시간 제한)에서 실제로 실행한다.

- 제시한 실행 결과 = 실제 결과, 위험한 코드·무한 루프 없음
- 실행 결과를 묻는 객관식: 실제 결과와 일치하는 보기가 정답 하나뿐
- 빈칸: 보기를 하나씩 넣어 실행했을 때 원래 결과를 내는 보기가 정답 하나뿐
- 주관식: 모범 답안이 자기 채점 기준 통과 · 힌트 1~4개·해설·핵심 개념
- 목표 난이도 ±1, 난이도에 비해 어려운 문법 없음
- 흐름 따라가기: 따라갈 줄에 기록을 넣어도 실행 결과가 같고, 추적표 정답 = 실제 실행 기록
- `npm run verify` 추가 검사: 코드 학습 시드는 읽기 단계(훑어보기·흐름 따라가기·핵심 줄·정리)가 모두 있는지, 개념 학습은 코드 없는 4지선다·자격증 태그가 올바른지·모든 주제에 문제가 있는지

AI 코드 문제 생성(`generate-code`)은 2단계: 코드만 만들어 실행 → 코드 + 실제 실행 결과로 단계별 문제 4개 + 흐름 따라가기(규칙으로 자동) → 코드로 정해지는 정답 자동 수정(`autoFixQuestions`) → 실행 검증 → AI 검수 → 통과하면 `published`, 아니면 문제만 1회 재생성 후 `rejected`(비공개, 보고서 보관).
개념 문제 생성(`generate_theory.py`)은 AI 출제 → 규칙 검사 → 다른 AI 호출의 교차 풀이 → `pending` → 관리자 승인.

---

## 9. 사용자와 기록 정책 (현재: 로그인 없음)

- 첫 요청 때 Lambda 가 세션 id(UUID)를 만들어 응답 헤더 `x-session-id` 로 준다 (`common.py` 의 `get_learner`). 화면은 이를 **`sessionStorage`** 에 두고 매 요청에 같은 헤더로 보낸다 (`src/lib/api.ts`).
- **창(탭)을 닫으면 새로 시작**한다. 학습자(`LEARNER`)는 마지막 사용 후 12시간, 기록(`S#<세션>`)은 그 뒤 7일이 지나면 DynamoDB TTL 이 자동으로 지운다.
- 모르는 세션 id 로 학습자를 만들지 않는다(새 id 발급). 다른 사람의 세션 id 는 응답에 넣지 않는다 (랭킹은 `isMe` 만).
- 랭킹은 지금 참여 중인(TTL 안) 학습자끼리 비교한다.
- 로그인(Google·GitHub) 구조는 설명만 된 상태: `jojo_api` 에 로그인 기능 파일을 더해 OAuth 콜백을 받고, `USER`·`IDENT` 항목에 계정을 두고, 토큰 헤더로 `get_learner` 가 계정을 돌려주게 한다.

---

## 10. 아키텍처 (확정)

### 10.1 구성

```
브라우저 ──→ GitHub Pages: 정적 화면 (Next.js output: "export", basePath /teamProject_night_first)
   │  src/lib/api.ts → 주소 하나(함수 URL)로 JSON (x-session-id 헤더) — HTTPS 연결을 계속 다시 써서 빠름
   └─→ jojo_api (Python, lambda/api)
         lambda_function.py: 경로 → 기능 파일
           questions.py      /session /hint /concepts         ─┐
           submit_answer.py  /attempts /explain               ─┤  DynamoDB jojo_table (pk·sk, TTL jojo_ttl)
           tutor_chat.py     /ask                             ─┤  Bedrock Claude Haiku 4.5 (us-east-1)
           my_page.py        /me /learn /review /dashboard /ranking /health
           admin.py          /admin/...                       ─┘
         뒤에서 (자기 자신을 {"task": ...} 로 다시 부름): learner_analysis.py, generate_theory.py
         콘솔에서: {"task": "load-content"} → content.json 의 기본 문제를 DynamoDB 에
         └─→ jojo_generate_code (Node.js, lambda/generate-code): 코드 문제 생성 + 실행 검증
```

| 항목 | 기술 |
| --- | --- |
| 화면 | Next.js 15 정적 내보내기, React 19, TypeScript 5, Tailwind CSS 3 |
| Lambda | `jojo_api`: Python 3.13 + boto3, arm64, 1024MB. `jojo_generate_code`: Node.js 22 + 런타임 AWS SDK. 실행 역할 `SafeRole-sgu-202688`, VPC 없음 |
| DB | DynamoDB 테이블 하나 (보조 인덱스 없음) |
| AI | Bedrock Converse API (구조화 응답은 도구 강제 호출) |
| 로컬 실행 | `npm run api` → dynalite(DynamoDB 흉내) + `scripts/local_lambdas.py` 가 같은 코드를 한 주소로 |
| 테스트 | `node:test` + `tsx`(검증기·경계), Python `unittest`(`lambda/tests`), 전체 흐름 `scripts/smoke.mjs` |
| CI/CD | `.github/workflows/ci.yml`(검사), `pages.yml`(main → GitHub Pages). Lambda 는 콘솔에 붙여넣기 |

### 10.2 주요 요청 흐름
1. **화면 열기** 정적 HTML 이 뜨고, 화면이 `GET /learn` 같은 화면용 요청을 한 번 보낸다 (`my_page.py`). 3초 넘게 걸리면 "서버를 깨우는 중" 안내.
2. **학습 시작** `POST /session` (`questions.py`) → 저장된 문제에서 선택(AI 없음) → 정답을 뺀 `PublicQuestion`. 생성 기준에 해당하면 generate-code 를 부른다.
3. **답 제출** `POST /attempts` (`submit_answer.py`) → 규칙 채점(주관식만 필요 시 AI) → 풀이·하루 요약·개념 요약·학습자 총계 저장 → 결과·해설·AI Tutor 내용. 10문제마다 학습자 분석을 뒤에서 실행한다 (자기 자신을 `{"task": "learner-analysis"}` 로 다시 부름).
4. **화면 갱신** 풀이·이름 변경·초기화 뒤 `notifyChanged()` → 헤더(XP·연속 학습) 등이 다시 불러온다.

### 10.3 DynamoDB 항목 (pk / sk)

| pk / sk | 내용 | 쓰는 곳 |
| --- | --- | --- |
| `LEARNER` / `<세션 id>` | 닉네임, 선택 난이도, 하루 목표, 총 XP·푼 수(랭킹), TTL | common(get_learner), my_page, submit_answer |
| `S#<세션>` / `A#<번호>` | 풀이 1건 (문제, 맞음·부분, 힌트, 시간, 오개념, 채점 주체, 답) | submit_answer → 모두 읽음 |
| `S#<세션>` / `D#<날짜>`, `C#<개념>` | 하루 요약(캘린더·XP), 개념 요약(최근 5회 품질·10회 결과) | submit_answer → my_page |
| `S#<세션>` / `N#<번호>` | 학습자 분석 결과 | learner_analysis → my_page |
| `CONTENT` / `<코드 id>` | 코드(또는 개념 묶음) + 문제들, 상태(published·pending·rejected), 검증 보고서 | load_content, generate_theory, jojo_generate_code, admin → questions 등 |
| `CHAT#<대화 id>` / `<시각>#<role>` | 튜터 대화 (하루 뒤 삭제) | tutor_chat |
| `META` / `curriculum`, `content_version`, `seed_hash`, `content_model`, `admin_code_hash`, `auto_generation`, `generation_stop_at` | 설정·버전 | 여러 곳 |
| `JOB` / `<번호>` | 생성 작업 기록 (90일) | generate-*, admin |
| `USAGE` / `<연-월>#<작업>#<모델>` | AI 호출 수·토큰 (월 예산) | 모든 AI 호출 |
| `STATS` / `GRADED`, `DEMAND` / `<개념>#<난이도>#<세션>`, `RL` / `<키>#<구간>` | 채점 주체 통계, 칸 소진 수요, 요청 수 제한 카운터 | |

- 학습자 한 명의 기록(`S#<세션>`)은 화면마다 **조회 한 번**으로 통째로 읽는다 (`common.learner_records`).
- 학습자의 마지막 사용 시각은 15분마다만 고쳐 쓴다 (요청마다 쓰기 1번 절약).
- 커리큘럼은 함수 안의 `content.json` 에서 읽고, 문제 데이터는 메모리에 두고 30초마다 `META / content_version` 만 확인해 바뀌면 다시 읽는다.
- 항목 모양을 바꾸면 그 항목을 읽는 기능 파일·`jojo_generate_code` 를 함께 확인한다 (`npm run smoke`).

### 10.4 디렉터리

```
src/
  app/, components/        화면 (정적). API 는 src/lib/api.ts 의 apiGet·apiPost·useApi 로만
  lib/
    api.ts, api-types.ts   API 주소, 응답 모양 (Lambda 코드와 같게 유지)
    types.ts, curriculum.ts 공용 타입·커리큘럼 (화면 표시 + content.json 원본)
    content/seed/          기본 문제 (원본) · content/check-explain.ts (관리자 화면 검증 설명)
lambda/                    lambda/README.md
  api/                     jojo_api (Python): lambda_function.py(입구), common.py(공통), 기능 파일들, content.json(커리큘럼 + 기본 문제)
  generate-code/checks.mjs 코드 실행·검증 (npm run verify 도 사용)
  tests/                   Python 단위 테스트
scripts/                   local-api.mjs + local_lambdas.py(로컬 실행), smoke.mjs(전체 흐름), verify-content.ts, export-content.ts
tests/                     검증기·흐름 따라가기·경계 테스트 (TS)
docs/                      이 문서, AI 생성 기준, DEPLOY_LAMBDA.md(콘솔 배포 순서)
```

### 10.5 요청 경로

| 메서드·경로 | 기능 파일 (`lambda/api/`) | 용도 |
| --- | --- | --- |
| `GET /health`, `GET·POST /me`, `GET /learn`, `/review`, `/dashboard`, `/ranking` | my_page.py | 화면별 데이터, 난이도·이름·초기화 |
| `POST /session`, `POST /hint`, `GET /concepts` | questions.py | 문제 세트 `{ level, track, concept?, unit?, cert?, mode?, ids?, size?, exclude? }`, 힌트, 탐색 |
| `POST /attempts`, `POST /explain` | submit_answer.py | 채점 `{ questionId, answer?, giveUp?, hintsUsed, timeMs }`, 주관식 AI 분석 |
| `POST /ask` | tutor_chat.py | 튜터 질문 `{ chatId?, questionId, question, solved, answerText? }` |
| `/admin/...` | admin.py | 관리자 (`x-admin-token`) |

### 10.6 환경 변수
- Lambda: `TABLE_NAME`, `TTL_ATTR`, `AI_MODE`, `ALLOWED_ORIGINS`, `AI_MONTHLY_BUDGET_USD`, `AI_GENERATION_DAILY_LIMIT`, `ADMIN_TOKEN`, `GENERATE_CODE_FUNCTION`, `MODEL_ID`, `RATE_LIMIT_*` — 표는 `docs/DEPLOY_LAMBDA.md`
- 화면(빌드 시): `NEXT_PUBLIC_API_URL`(= GitHub 변수 `API_URL`, jojo_api 함수 URL), `NEXT_PUBLIC_BASE_PATH`

### 10.7 명령

```bash
npm install && pip install boto3   # Python 3.10 이상
npm run api                    # Lambda http://localhost:8787 (DynamoDB 흉내 + 목업 AI, AWS 계정 불필요)
npm run dev                    # 화면 http://localhost:3000 (관리자: /admin)
npm run typecheck && npm test && npm run verify && npm run build   # 작업 완료 전 필수
npm run smoke                  # Lambda 전체 흐름 점검 (Lambda 를 바꿨다면)
npm run export:content         # 기본 문제·커리큘럼을 바꿨다면 → lambda/api/content.json
```

---

## 11. AWS 운영

### 11.1 현재 자원
| 자원 | 값 |
| --- | --- |
| 계정 | 학교 계정 (권한 제한 — IAM 역할 생성 불가). 리전 서울 ap-northeast-2, Bedrock 은 us-east-1 |
| 실행 역할 | `SafeRole-sgu-202688` (DynamoDB·Lambda 호출·Bedrock 가능, VPC 접속 불가) |
| DynamoDB | `jojo_table` (pk·sk 문자열, TTL `jojo_ttl`, 보조 인덱스 없음) |
| Lambda | `jojo_api`(Python, 함수 URL) + `jojo_generate_code`(Node.js). 예전 Node.js API(zip)는 옮긴 뒤 삭제 |
| Bedrock | Claude Haiku 4.5 (`us.anthropic.claude-haiku-4-5-20251001-v1:0`), Converse API 를 Lambda 가 직접 호출 |
| 화면 | GitHub Pages `https://torgeleli22-lang.github.io/teamProject_night_first/` (저장소 변수 `API_URL`) |

EC2·RDS·중계 Lambda 구성(예전 A안)은 더 이상 쓰지 않는다 (코드는 저장소에서 지웠다). 남은 자원은 `docs/DEPLOY_LAMBDA.md` 5단계에서 정리한다.

### 11.2 이후 단계 (계획 — 사람이 요청하면 진행)
| 단계 | 내용 | 비고 |
| --- | --- | --- |
| 로그인 | Google·GitHub OAuth → `jojo_api` 의 로그인 기능 파일, 로그인 사용자만 기록 영구 저장 | 구조 설명 완료, 구현 대기 |
| Python 코드 학습 | 두 번째 언어 (실행기 추가) | 나중에 |
| S3 | AI 생성 원본·검증 보고서 보관 | 선택 |

---

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
- 기능: 학습·복습·랭킹·내 학습·탐색·문제 풀이·관리자 (§5), 목업 AI 모드
- 구조: 정적 화면 + **Lambda 2개(Python `jojo_api` + Node.js 코드 생성, 콘솔에 붙여넣는 소스)** + DynamoDB + Bedrock, Liquid Glass UI. 화면 하나에 DynamoDB 조회 한 번, 주소 하나로 연결 재사용
- 품질: 단위 테스트(TS·Python), 콘텐츠 실행 검증, Lambda 전체 흐름 점검(`npm run smoke`), 화면·Lambda 경계 테스트, CI
- 콘텐츠: 개념 18주제 / 54문제, 코드 6개 / 30문제
- 학습 구조 1~3단계: 개념 / 코드 갈래, 코드 읽기 단계, 흐름 따라가기 추적표, 개념 문제 AI 생성 + 교차 검수 + 관리자 승인
- Node API(`src/api`, zip 배포)를 읽을 수 있는 Python 소스로 옮김. `/demo`(데모 학습자) 화면은 없앰

**다음 순서**
1. 콘솔에 함수 2개 만들기·화면 연결 (`docs/DEPLOY_LAMBDA.md`) → 예전 Node.js `jojo_api` 삭제
2. 로그인 (Google·GitHub) → 로그인 사용자 기록 영구 저장
3. Python 실행기 (코드 학습 두 번째 언어)

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
- 오류를 물을 때는 브라우저 화면의 메시지와 Lambda 의 CloudWatch 로그(`[error]`, `[ai]`, `[invoke]` 줄)를 함께 준다.
- 작업이 끝나면 이 문서의 §11·§13 을 최신 상태로 고치게 한다.

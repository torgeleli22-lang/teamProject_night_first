# git 웹사이트 열기
👉 https://torgeleli22-lang.github.io/teamProject_night_first/

# 코드리딩 — AI 기반 인터랙티브 코드 읽기 학습 플랫폼

> 📄 프로젝트 전체 설명(개요·기능·AI 원칙·아키텍처·DynamoDB·다음 할 일): [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) — AI 코딩 도구에게 작업을 맡길 때도 이 문서를 먼저 읽게 하세요.

> 코딩을 대신해주는 AI가 아니라, 코드를 읽고 이해하는 법을 가르쳐주는 AI.
> AI가 문제를 많이 만들어주는 것이 아니라, 학습자가 무엇을 이해하지 못하고 있는지 파악하고 그에 맞는 문제를 만들어준다.

개발 입문자를 위한 두 갈래 학습 웹서비스입니다.
- **개념**: 네트워크·개발·운영 및 유지보수·보안 지식을 자격증 시험처럼 객관식으로 (정보처리기사·네트워크관리사·리눅스마스터·SQLD·정보보안기사 과목 태그)
- **코드**: 코드 하나를 훑어보기 → 흐름 따라가기(실행될 때마다 변수 값 채우기) → 핵심 줄 → 정리 순서로 읽으며 "이 코드를 보면 어떤 코드인지 이해할 수 있다" 수준까지 (JavaScript)

## 구성

```
GitHub Pages (정적 화면)  ──JSON (주소 하나)──→  jojo_api (Python Lambda)  ──→  DynamoDB (저장)
     src/app, src/components                        lambda/api/      │      └─→  Bedrock Claude Haiku 4.5 (AI)
                                                                     └─→  jojo_generate_code (Node.js Lambda): 코드 문제 생성 + 실행 검증
```

- **화면**은 Next.js 정적 내보내기(`output: "export"`)로 만든 파일이라 서버가 없습니다. GitHub Pages 에 올립니다.
- **서버는 Lambda 함수 2개**뿐입니다 ([`lambda/README.md`](lambda/README.md)). 콘솔 코드 탭에 **그대로 붙여넣는 읽을 수 있는 코드**(Python + boto3)이고 zip·빌드가 없습니다.
  `jojo_api` 하나가 화면의 모든 요청을 받아 기능 파일(`questions.py` 문제 고르기, `submit_answer.py` 채점, `tutor_chat.py` 튜터, `my_page.py` 내 학습·랭킹, `admin.py` 관리자 …)로 나눠 처리하고,
  JavaScript 코드를 실제로 실행해 확인해야 하는 코드 문제 생성만 Node.js 함수가 맡습니다.
- **최소 비용·최고 속도**: 함수 URL(무료) 하나로 브라우저 연결을 계속 다시 쓰고, 함수 하나가 모든 요청을 받아 콜드 스타트가 드물며, 화면 하나에 DynamoDB 조회 한 번만 합니다.
- 정답·해설·채점 기준은 Lambda 밖으로 나가지 않습니다 (채점은 `submit_answer.py`).
- **로그인 없는 세션**: Lambda 가 발급한 세션 id 를 브라우저 `sessionStorage` 에 둡니다. 창(탭)을 닫으면 사라지고, 서버 기록도 일정 시간 뒤 DynamoDB TTL 로 지워집니다.

## 빠른 시작 (로컬)

```bash
npm install
python3 -m pip install boto3   # Python 3.10 이상
npm run api                    # 터미널 1: Lambda  http://localhost:8787 (DynamoDB 흉내 서버 + 목업 AI)
npm run dev                    # 터미널 2: 화면 http://localhost:3000  (관리자: /admin)
```

AWS 계정·키 없이 실행됩니다. AI 는 기본으로 **목업**(`AI_MODE=mock`, 흉내 낸 응답·비용 없음)이라 화면 흐름과 UI/UX 를 확인할 수 있습니다. Node.js 22.13 이상이 필요합니다.

| 스크립트 | 설명 |
| --- | --- |
| `npm run api` | 로컬에서 Lambda 실행 (AWS 에서 도는 것과 같은 코드) |
| `npm run dev` / `build` | 화면 개발 서버 / 정적 빌드 (`out/`) |
| `npm test` | 단위 테스트 (TypeScript: 검증기·흐름 따라가기·경계 / Python: 채점·통계·문제 고르기·관리자 코드) |
| `npm run verify` | 기본 문제 전체를 실제로 실행해 검증 + `content.json` 최신 확인 |
| `npm run smoke` | Lambda 전체 흐름 점검 (학습·채점·튜터·분석·관리자·AI 생성) |
| `npm run export:content` | 커리큘럼·기본 문제 → `lambda/api/content.json` |
| `npm run typecheck` | TypeScript 타입 검사 |

## 핵심 설계: AI 비용을 고려한 구조

AI가 잘하는 것(콘텐츠 생성·자연어 분석·개인화)만 AI에게 맡기고, 나머지는 일반 코드와 DB로 처리합니다. **문제를 20개 풀어도 AI를 20번 부르지 않습니다.**

| 기능 | 처리 방식 | AI 호출 |
| --- | --- | --- |
| 객관식·빈칸·결과 예측·흐름 따라가기 채점 | 정답 비교 (`submit_answer.py`) | 없음 |
| 오답 원인 (객관식) | 보기마다 미리 저장된 오개념 표시 | 없음 |
| 힌트 1~4단계, 해설, 개념 설명 | 콘텐츠와 함께 미리 저장 | 없음 |
| 주관식 평가 | ① 규칙 평가(핵심 요소 표현 + 오개념 패턴) ② 너무 짧음·일부 누락·오개념 표현·판단 어려움일 때만 AI | 필요할 때만 |
| "AI에게 자세히 분석 받기", "튜터에게 질문" | 학습자가 직접 요청할 때만 | 요청 시 |
| 점수·XP·진도·정답률·통계·랭킹 | 일반 로직 (`common.py`, `my_page.py`) | 없음 |
| 다음 문제 추천, 추천 난이도 | 일반 알고리즘 (`questions.py`) | 없음 |
| 학습자 분석 (혼동 개념, 추천 난이도) | 10문제마다 한 번 (`learner_analysis.py`) | 10문제당 1회 |
| 새 콘텐츠 생성 | **생성 기준**(`docs/ai-generation-policy.md`)에 해당할 때만 | 기준에 해당할 때만 |

- 모든 AI 응답은 정해진 JSON 형식으로 받아 Lambda 에서 검사합니다. 호출마다 토큰 사용량을 기록하고, **월 예산**(`AI_MONTHLY_BUDGET_USD`, 기본 10달러)을 넘을 수 있는 호출은 하지 않습니다.
- AI 가 꺼져 있거나 실패해도 규칙 평가·저장된 해설·규칙 기반 분석으로 학습이 계속됩니다.

## 콘텐츠 품질 검증 (`lambda/generate-code/checks.mjs`)

AI 가 만든 코드 문제는 그대로 쓰지 않습니다. 코드를 **격리된 워커 스레드의 vm 컨텍스트**에서 실제로 실행해 확인하고, AI 가 한 번 더 검수합니다. 실패하면 한 번 재생성하고, 그래도 실패하면 `rejected` 로 저장해 관리자 화면에서 보고서를 볼 수 있습니다.

- 코드가 시간 안에 실행되는가, 제시한 실행 결과 = 실제 결과인가, 위험한 코드(require/eval/무한 루프)는 없는가
- 실행 결과를 묻는 객관식·빈칸은 원래 결과를 내는 보기가 정답 하나뿐인가
- 흐름 따라가기 정답 = 실제 실행 기록인가, 주관식 모범 답안이 자기 채점 기준을 통과하는가
- 목표 난이도와 측정 난이도가 ±1 이내인가, 난이도에 비해 어려운 문법이 없는가

개념 문제는 실행으로 확인할 수 없어서, **다른 AI 호출이 정답을 모르는 채로 풀어 보는 교차 검수**를 통과한 문제만 **관리자 승인** 뒤 공개합니다.
같은 검증기가 기본 문제(개념 54문제 · 코드 6개 30문제)에도 `npm run verify` 로 적용됩니다.

## 화면

| 경로 | 내용 |
| --- | --- |
| `/` | 랜딩 |
| `/learn` | **학습 탭**: 개념 / 코드 고르기 → 개념은 분야·주제·자격증·난이도로 객관식 10문제, 코드는 언어·난이도·개념으로 코드 2개를 단계별로. 오늘의 목표, AI 학습 분석 |
| `/review` | **복습 탭**: 오답 노트, 복습 세트(틀린 문제 → 취약 개념), 다지면 좋은 개념, 자주 하는 착각 |
| `/ranking` | **랭킹**: XP 기준 내 등수·상위 %, 상위 10명, 랭킹 이름 바꾸기 |
| `/practice` | 문제 풀이 → AI Tutor 영역 + 해설 → 비슷한 문제 → 세션 결과 |
| `/concepts` | 탐색: 분야·단원별 주제와 문제 |
| `/dashboard` | 내 학습: 정답률·풀이 시간·힌트, 개념별 이해도, 학습 캘린더, 배지, 기록 |
| `/admin` | 콘텐츠 관리: 생성 기준, 출시 전 채우기, 재고·수요, 생성 기록, 검증 보고서, 승인 대기, AI 사용량·추정 비용 |

## 디렉터리

```
src/app, src/components     화면 (정적). API 는 src/lib/api.ts 의 apiGet/apiPost/useApi 로만 부른다
src/lib/                    api.ts(API 주소), api-types.ts(응답 모양), types.ts, curriculum.ts, content/seed(기본 문제)
lambda/                     api/(jojo_api: 입구·공통·기능 파일·content.json), generate-code/(Node.js), tests/(Python 테스트)
scripts/                    local-api.mjs + local_lambdas.py(로컬 실행), smoke.mjs, verify-content.ts, export-content.ts
docs/                       PROJECT_BRIEF.md, ai-generation-policy.md, DEPLOY_LAMBDA.md
```

## 배포 (GitHub Pages + Lambda + DynamoDB + Bedrock)

[`docs/DEPLOY_LAMBDA.md`](docs/DEPLOY_LAMBDA.md) 를 따라 하세요. 요약:

1. DynamoDB 테이블 `jojo_table` (pk·sk, TTL `jojo_ttl`)
2. Lambda 2개를 콘솔에서 만들고 `lambda/api/`, `lambda/generate-code/` 파일을 코드 탭에 붙여넣기 (실행 역할 `SafeRole-sgu-202688`)
3. `jojo_api` 에서 **테스트** `{"task": "load-content"}` 한 번 → 기본 문제가 들어감
4. `jojo_api` 함수 URL 을 GitHub 저장소 변수 `API_URL` 에 넣고 Pages 배포

## 다음 단계

- 로그인(Google·GitHub) + 로그인 사용자 기록 영구 저장
- 코드 학습 두 번째 언어(Python)

# 코드 리딩 노트 — 프로젝트 설명서

> 사람과 AI 작업자 모두를 위한 기준 문서예요. 코드와 이 문서가 다르면 코드가 현재 상태이고, 이 문서를 함께 고쳐요.

## 1. 한 줄 정의
**AI 가 만들고 검증한 코드를 읽고, 흐름을 메모로 설명하면 빨간펜으로 채점해 주는 코드 읽기 공책.**
정답 값을 맞히는 곳이 아니라 **흐름을 이해하고 설명할 수 있는지** 연습하는 곳이에요. 코드를 대신 짜 주지 않아요.

## 2. 핵심 흐름 (이것만 해요)
| 단계 | 하는 일 | 어디서 |
|---|---|---|
| 1. 코드 만들기 | 학습자가 언어(Python·JavaScript)·난이도(초급·중급·고급)·주제(랜덤/직접)를 고름 → **생성 AI** 가 만들고 → **규칙 검사** → 생성 AI 가 **예상 출력**도 씀 → **검토 AI 두 개**(Luna·Haiku)가 따로 따라가 출력을 비교, 다르면 예상 출력까지 2:1 로 정함 (셋 다 다르면 다시 만들기) → 통과한 코드와 **정해진 출력**을 제공 | `jojo_practice` · [`GENERATION_STANDARD.md`](GENERATION_STANDARD.md) |
| 2. 해설 쓰기 | 학습자가 줄 범위에 형광펜을 긋고 흐름을 포스트잇 메모로 적음. ※ 는 꼭 설명해 볼 곳 | 화면 `/read/` |
| 3. 채점 | **검토 AI 의 실행 기록을 기준으로** 채점 AI 가 메모마다 ○ 정확 · △ 부분 · ✕ 오해, 설명할 곳이 비면 ⬚ 빈칸 (규칙). 정답 대신 다시 볼 곳을 짚음 | `jojo_review` |
| (로그인) | Google 로그인(선택) — 받은 코드·채점이 30일 남음 | `jojo_auth` |

## 3. 지켜야 할 것
1. **AI 는 세 곳에서만**: 코드 생성 · 코드 검토 · 메모 채점. 빈칸 판정·개수·문법 검사·랜덤 주제는 일반 코드로
2. **AI 호출은 `lambda/shared/ai.py` 의 `ask_ai()` 로만**, 새 AI 작업에는 목업 답과 AI 없이 쓰는 길(예시 코드·규칙 채점)을 함께
3. **채점 기준(검토 기록·모범 설명)은 채점 전에 화면으로 보내지 않아요** — 읽는 동안은 `core.public_code`(코드 + 설명할 곳 줄 범위 + 정해진 출력)만. 출력은 보여 줘요: 목적은 값을 맞히는 게 아니라 흐름을 설명하는 것
4. **검토를 거치지 않았거나, 출력 판정을 통과하지 못한 AI 코드는 내보내지 않아요** — 다시 만들거나 예시 코드
5. 언어 기능(모듈·랜덤·시각·입력)은 금지하지 않아요. 값이 정해지지 않는 곳은 검토 AI 가 값을 정하고 '가정'으로 표시
6. 화면 문구는 한국어 존댓말("~해요"), 초보자 눈높이. 디자인은 공부 노트(줄 공책·형광펜·포스트잇·빨간펜·도장·인덱스 탭) — 그라데이션·둥근 카드·이모지·파란 버튼은 쓰지 않아요. ○△✕⬚ 는 늘 빨간펜 그림(`ui.tsx` 의 `PenMark`, 문장은 `MarkText`)
7. 비밀 값(`ADMIN_TOKEN`·Google 비밀 값·AWS 키)은 Lambda 환경 변수(로컬은 `.env`)에만. 코드·문서·GitHub 에 쓰지 않아요
8. 작업을 마치기 전에 `npm run typecheck` · `npm test` · `npm run verify` · `npm run build`, Lambda 를 바꿨다면 `npm run smoke`

## 4. 구조
```
브라우저 ──→ GitHub Pages (Next.js 정적 화면: / · /practice/ · /read/?id= · /result/?id=)
   │  JSON (x-session-id) — 경로로 함수를 골라요 (src/lib/api-routes.ts, 주소는 GitHub 변수 API_URLS)
   ├─→ jojo_auth      /me · /auth/*        로그인
   ├─→ jojo_practice  POST /practice       코드 만들기 (생성 → 규칙 검사 → 검토)
   └─→ jojo_review    POST /review · GET /code   채점 · 다시 열기
         Lambda: Python 3.14 arm64 · 함수 URL · 계층 jojo_libs · 실행 역할 SafeRole
         ──→ DynamoDB jojo_table (서울) · Bedrock (us-east-1): 생성·확인·채점 Claude Haiku 4.5 · 검토 GPT-5.6 Luna
```
- Lambda 폴더·규칙·DynamoDB 항목: [`LAMBDA_STRUCTURE.md`](LAMBDA_STRUCTURE.md) · 올리기: [`DEPLOY_LAMBDA.md`](DEPLOY_LAMBDA.md) · 실험: [`EXPERIMENT.md`](EXPERIMENT.md)
- 화면(`src/`)은 `lambda/` 를 가져오지 않고 `src/lib/api.ts` 로만 불러요 (`tests/boundaries.test.ts`). 응답 모양은 `src/lib/api-types.ts` 를 Lambda 와 같게
- 학습자: 로그인 안 하면 탭마다 한 명(`sessionStorage`, 기록 하루), Google 로그인하면 계정(받은 코드·채점 30일). 메모는 채점 받기 전까지 이 탭에만(`src/lib/memos.ts`)
- AWS 는 학교 계정(권한 제한 — IAM 역할 만들기 불가, 새 함수도 SafeRole). Lambda·DynamoDB·Bedrock 밖의 서비스(S3 등)는 요청 없이 넣지 않아요

## 5. 명령
```bash
npm run setup:python   # 처음 한 번: .venv 에 Lambda 라이브러리 + boto3
npm run api            # Lambda 3개를 http://localhost:8787 하나로 (DynamoDB 흉내 + 목업 AI)
npm run dev            # 화면 http://localhost:3000
npm run typecheck      # 타입 검사
npm test               # 단위 테스트 (TS + Python)
npm run verify         # 예시 코드 실제 실행 + 흐름 단위 확인
npm run build          # 정적 화면 빌드 (out/)
npm run smoke          # Lambda 전체 흐름 점검
npm run layer          # 레이어 zip (dist/jojo_libs_layer.zip) — 라이브러리를 바꿀 때만
```

## 6. 다음에 할 수 있는 것 (요청하면)
- Java 추가: `core.LANGUAGES`, `rules.py`(문법 검사), 예시 코드, 화면 `highlight.ts`
- 실제 실행 확인: 격리된 실행 환경이 필요해서 지금은 AI 검토(시뮬레이션) + 실험 스크립트의 실제 실행 비교만

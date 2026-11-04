# git 웹사이트 열기
👉 https://torgeleli22-lang.github.io/teamProject_night_first/

# 코드 리딩 노트 — AI 가 만든 코드, 정말 읽을 수 있나요?

**코드를 대신 짜 주는 AI 가 아니라, 코드를 읽고 흐름을 설명하도록 가르치는 AI** 예요.
정답 값을 맞히는 곳이 아니라, 코드의 흐름을 이해하고 자기 말로 설명할 수 있는지 연습하는 곳이에요.

## 어떻게 쓰나요?
```
① 코드 받기                         ② 해설 쓰기                         ③ 채점
언어 · 난이도 · 주제(랜덤/직접)  →  줄 범위에 형광펜을 긋고        →  메모마다 ○ 정확 · △ 부분 · ✕ 오해
                                    흐름을 포스트잇 메모로            설명할 곳(※)이 비면 ⬚ 빈칸
                                    ※ 는 꼭 설명해 볼 곳              다시 볼 줄 · 모범 설명 · 실행 기록
```

## 코드는 어떻게 만들고 검증하나요? ([`docs/GENERATION_STANDARD.md`](docs/GENERATION_STANDARD.md))
1. **생성 AI** — 난이도를 줄 수가 아니라 **6요소**(문법 복잡도 · 코드 구조 · 논리적 복잡도 · 데이터 처리 · 실행 흐름 · 개념 간 연계)로 정의한 기준을 받아 코드를 만들어요
2. **규칙 검사** (AI 없음) — 문법 오류 · 정의하지 않은 이름
3. **검토 AI** — 코드를 실제로 실행하듯 따라가요: 함수는 매개변수에 값을 넣고, 반복문은 몇 번 돌고 언제 멈추는지, 재귀는 끝나는 조건에 닿는지. 동작하는지, 요청한 난이도와 맞는지(6요소)를 판정하고, 그 기록으로 모범 설명을 써요
4. 걸리면 그 줄만 고치거나(부분 수정) 검토 의견을 붙여 다시 만들고, 그래도 안 되면 미리 검증한 예시 코드를 드려요
5. **검토 AI 의 실행 기록은 버리지 않고 채점 기준으로 저장**해요. 채점 AI 는 그 기록을 기준으로 메모가 흐름을 이해했는지 봐요

## 구성
```
브라우저 ──→ GitHub Pages (Next.js 정적 화면, src/)
   ├─→ jojo_auth      로그인 (Google, 선택)
   ├─→ jojo_practice  코드 만들기 (생성 → 규칙 검사 → 검토)
   └─→ jojo_review    채점
         Lambda (Python 3.14) ──→ DynamoDB jojo_table · Bedrock Claude Haiku 4.5
```

| 문서 | 내용 |
|---|---|
| [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) | 프로젝트 기준 문서 (지켜야 할 것 · 구조 · 명령) |
| [`docs/GENERATION_STANDARD.md`](docs/GENERATION_STANDARD.md) | 코드 생성·검증·채점 기준 |
| [`docs/LAMBDA_STRUCTURE.md`](docs/LAMBDA_STRUCTURE.md) | Lambda 폴더·규칙·DynamoDB 항목 |
| [`docs/DEPLOY_LAMBDA.md`](docs/DEPLOY_LAMBDA.md) | 콘솔에 올리기 · 환경 변수 · 화면 연결 |
| [`docs/EXPERIMENT.md`](docs/EXPERIMENT.md) | 생성·검증 실험 |

## 내 컴퓨터에서
```bash
npm install && npm run setup:python   # 처음 한 번
npm run api                           # Lambda 3개 http://localhost:8787 (DynamoDB 흉내 + 목업 AI, 비용 없음)
npm run dev                           # 화면 http://localhost:3000
npm run typecheck && npm test && npm run verify && npm run build && npm run smoke   # 확인
```

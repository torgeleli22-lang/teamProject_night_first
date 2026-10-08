# 코드리딩 — AI 기반 JavaScript 코드 읽기 학습 서비스

> 코드를 대신 작성해주는 AI가 아니라, 코드를 스스로 읽고 이해할 수 있도록 가르치는 AI.
> 어렵게 공부하는 코딩이 아니라, 매일 하나씩 이해하는 코딩.

개발 입문자가 짧은 JavaScript 코드를 **읽고 → 결과를 예측하고 → 자신의 말로 설명하고 → AI 피드백을 받는** 고리를 반복하며 코드 이해력을 기르는 웹 서비스입니다. (MVP)

## 빠른 시작

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 를 넣으면 AI 튜터가 켜집니다
npm run dev                  # http://localhost:3000
```

API 키가 없어도 모든 기능이 동작합니다. 이 경우 미리 작성된 단계별 힌트·해설과 규칙 기반 분석을 쓰는 **오프라인 튜터**로 동작하고, 화면에는 `📘 기본 해설` 배지가 붙습니다. 키가 있으면 `✨ AI 튜터` 배지와 함께 Claude가 학습자의 답에 맞춘 피드백을 생성합니다. AI 호출이 실패해도 자동으로 오프라인 튜터로 대체되어 학습 흐름이 끊기지 않습니다.

| 스크립트 | 설명 |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js 개발 서버 / 빌드 / 실행 |
| `npm run typecheck` | TypeScript 타입 검사 |
| `npm run verify` | 문제 은행 검증 — 구조 검사 + 모든 실행 가능한 문제의 코드를 실제로 돌려 정답 출력과 비교 |

## 화면

| 경로 | 화면 |
| --- | --- |
| `/` | 랜딩 — "코드를 외우지 마세요. 읽고 이해하는 것부터 시작하세요." |
| `/learn` | 학습 홈 — 오늘의 학습(추천 개념·문제 3개·예상 시간), 오늘의 목표, 진행률, 복습 추천 |
| `/practice` | 문제 풀이 → AI 피드백 → 다음 문제 → 세션 결과 (`?concept=map`, `?ids=a,b,c`) |
| `/concepts` | 개념별 학습 — 레벨/개념/문제 유형별 탐색 (GeeksforGeeks Explore 참고) |
| `/dashboard` | 내 학습 — 레벨·XP, 연속 학습, 개념별 이해도, 강점/복습 개념, 자주 하는 착각, 배지, 최근 기록 |

## 기능 (MVP 범위)

- **커리큘럼**: JavaScript 7단계 · 25개 개념 · 58문제 (`src/lib/curriculum.ts`, `src/lib/problems/`)
- **문제 유형**: 실행 결과 예측(객관식/직접 입력), 빈칸 채우기, 개념 선택, 오류 찾기(줄 선택), 순서 맞추기, 코드 설명하기
- **AI 답변 분석**: 정답 여부뿐 아니라 "어디까지 이해했고 어디서 생각이 갈라졌는지", 실행 과정 단계별 따라가기, 이해 요소별 평가(좋음/보통/더 알아보기), 오개념 지적
- **AI 단계별 힌트**: 1 생각해 보기 → 2 핵심 짚기 → 3 문법 설명 → 4 방향 제시 → 5 정답과 해설 (힌트에서는 정답을 말하지 않음)
- **AI 개념 설명 / 튜터에게 질문**: 지금 보는 문제의 코드와 연결해 설명. 풀이 중에는 정답 대신 실마리만 제공
- **개인화**: 개념별 이해도(최근 5회 풀이 품질 × 풀이 수 신뢰도, 힌트 사용 시 감점), 취약 개념 복습 우선 추천, 선택한 오답 보기에 연결된 오개념 집계 → AI 추천 메시지에 반영
- **가벼운 게임화**: XP, 학습 레벨, 연속 학습(streak), 오늘의 목표, 배지. 리더보드/경쟁 요소는 의도적으로 제외

학습 기록은 MVP 단계에서 브라우저 `localStorage` 에 저장합니다 (`src/lib/progress-store.ts`). 로그인/DB를 붙일 때 이 모듈의 load/save만 서버 API로 바꾸면 됩니다.

## 구조

```
src/
  app/                    # Next.js App Router 페이지 + API 라우트
    api/ai/{feedback,hint,concept,ask,recommend,status}/route.ts
  components/             # CodeBlock(구문 강조), UI, practice/* (문제 풀이 화면)
  lib/
    curriculum.ts         # 레벨·개념 정의
    problems/             # 문제 은행 (레벨별 파일)
    grading.ts            # 결정적 채점 (객관식/입력/오류/순서), 출력 정규화
    feedback-offline.ts   # AI 없이 만드는 기본 피드백
    mastery.ts            # 개념 이해도 계산
    recommend.ts          # 오늘의 학습 추천 (규칙 기반)
    progress-store.ts     # 학습 기록 저장 (localStorage)
    ai/
      client.ts           # Claude API 호출 (구조화 출력 + 거절 시 fallback)
      prompts.ts          # 튜터 시스템 프롬프트 (AI 사용 원칙 1~7)
      tutor.ts            # 피드백/힌트/개념 설명/질문/추천 — AI 실패 시 오프라인 대체
scripts/verify-problems.ts
```

### AI 설계 메모

- 모델: `claude-opus-5-5` (환경 변수 `CLAUDE_MODEL` 로 변경 가능). 응답은 Zod 스키마로 구조화(`output_config.format`)해서 받습니다.
- 서버 측 refusal fallback(`fallbacks: "default"`)을 켜 두어, 안전 분류기가 요청을 거절하면 다른 모델로 자동 재시도합니다.
- 객관식·입력형·오류 찾기·순서 맞추기는 서버에서 결정적으로 채점하고 AI는 **설명만** 담당합니다 (AI가 채점을 뒤집지 않음). 설명형만 AI가 채점 기준(rubric)에 따라 정답/부분 정답/오답을 판단합니다.
- 문제 내용은 클라이언트가 보낸 값이 아니라 서버의 문제 은행에서 가져오고, 학습자 입력은 데이터로만 취급하도록 태그로 감쌉니다.

## 문제 추가하기

`src/lib/problems/` 의 레벨 파일에 문제를 추가하고 `npm run verify` 를 실행하세요. `output` 은 브라우저 콘솔 표기(`[2, 4, 6]`, `['a', 'b']`)로 적고, DOM·fetch 처럼 Node에서 실행할 수 없는 코드는 `runnable: false` 로 표시합니다. 오류 찾기 문제의 `output` 은 **수정한 코드**의 출력입니다.

## 다음 단계 (MVP 이후)

- 로그인 + 서버 DB 저장, 기기 간 동기화
- AI 문제 생성(취약 개념 맞춤 복습 문제) — 생성 후 `verify` 와 같은 실행 검증을 거쳐 출제
- AI 대화형 문제(코드를 한 줄씩 함께 추적), API 요청 rate limit

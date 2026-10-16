# generate-code — 코드 문제 만들기 Lambda (Node.js 22.x)

`jojo_api` 가 문제가 부족할 때(`questions.py`), 학습자 분석에서 혼동이 보일 때(`learner_analysis.py`), 관리자가 만들 때(`admin.py`) 불러요. 부른 쪽은 기다리지 않아요.
AI 가 만든 코드를 **실제로 실행해서** 정답을 확인해야 해서 이 함수만 Node.js 예요 (JavaScript 코드를 그대로 실행).

1. AI 가 코드만 만들어요 → 격리된 곳에서 실제로 실행해 검사 (최대 3번)
2. 코드 + 실제 실행 결과를 보고 AI 가 단계별 문제(훑어보기·핵심 줄·정리)를 만들어요
3. 정답을 실행 결과로 자동 수정 → 흐름 따라가기 문제는 실행 기록으로 직접 만들기 → 실행 검증 → AI 검수 (최대 2번)
4. 통과하면 공개(published), 아니면 반려(rejected)로 저장 — 관리자 화면에서 보고서를 볼 수 있어요

- 받는 값: `{"concept": "map", "level": 3, "count": 1, "trigger": "manual", "reason": "...", "instructions": "관리자 요청(선택)"}` 또는 `{"fill": [{"concept": "map", "level": 3, "stock": 0}]}`
- 기록: `JOB / <번호>`, `CONTENT / ai-<개념>-<8자리>`, `USAGE`(AI 사용량)

## 콘솔에 넣는 파일 (이 폴더 그대로)
| 파일 | 내용 |
|---|---|
| `index.mjs` | 흐름 (핸들러 `index.handler`): 확인 → 코드 만들기 → 문제 만들기 → 검증 → 저장, AI 호출, DynamoDB |
| `checks.mjs` | 코드 실행·흐름 따라가기 기록·검증·자동 수정 (`npm run verify` 도 같은 파일로 기본 문제를 검사) |
| `mock-content.json` | `AI_MODE=mock` 일 때 쓰는 예시 응답 (map, filter, for, if-else, reduce) |

코드 탭의 `index.mjs` 를 바꾸고, **파일 → 새 파일**로 나머지 두 파일을 만들어 붙여넣은 뒤 **Deploy**. AWS SDK 는 Lambda 런타임에 들어 있어요.

## 설정
- 런타임 **Node.js 22.x** · 아키텍처 arm64 · 핸들러 `index.handler` · 제한 시간 **5분** · 메모리 **1024MB** (코드 실행 검사) · 함수 URL 없음
- 실행 역할: `SafeRole-sgu-202688`
- 환경 변수: `TABLE_NAME`, `TTL_ATTR`, `AI_MODE`, `AI_MONTHLY_BUDGET_USD`, `AI_GENERATION_DAILY_LIMIT` (값은 [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md) 의 표)

## 콘솔에서 시험하기
**테스트 탭 → 새 이벤트**에 [`test_event.json`](test_event.json) 내용을 붙여넣고 **테스트** → 응답의 `results` 에 상태(published / rejected / failed)가 나와요.

## 고칠 만한 곳
| 바꾸고 싶은 것 | 코드 위치 |
|---|---|
| 코드 규칙·문제 구성 지시문 | `index.mjs` 의 `CODE_RULES`, `GENERATOR_SYSTEM` |
| 검증 항목 | `checks.mjs` 의 `validateCode`, `validateItem` |
| 난이도별로 막는 문법 | `checks.mjs` 의 `TOO_ADVANCED` |
| 생성을 허용하는 칸 | `index.mjs` 의 `LEVELS_BY_UNIT` (`api/common.py` 와 같게) |

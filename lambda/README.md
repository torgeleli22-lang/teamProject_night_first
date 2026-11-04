# Lambda (함수 3개)

| 폴더 | 함수 | 경로 |
|---|---|---|
| [`shared/`](shared) | 모든 함수에 함께 넣는 공통 코드 (`core.py` · `ai.py`) | — |
| [`jojo_auth/`](jojo_auth) | 로그인 (Google) | `/me` · `/auth/*` · `/health` |
| [`jojo_practice/`](jojo_practice) | 코드 만들기: 생성 AI → 규칙 검사 → 검토 AI | `POST /practice` |
| [`jojo_review/`](jojo_review) | 채점 (기준: 검토 AI 의 실행 기록) | `POST /review` · `GET /code` |

**콘솔에 올리기**: 함수 폴더의 파일 전부 + `shared/` 의 파일 전부를 그 함수 코드 탭에 같은 이름으로 붙여넣고 Deploy (핸들러 `lambda_function.lambda_handler`, 계층 `jojo_libs`).
자세한 순서·환경 변수: [`docs/DEPLOY_LAMBDA.md`](../docs/DEPLOY_LAMBDA.md) · 구조와 규칙: [`docs/LAMBDA_STRUCTURE.md`](../docs/LAMBDA_STRUCTURE.md)

내 컴퓨터: `npm run setup:python` (처음 한 번) → `npm run api` (세 함수를 http://localhost:8787 하나로) · 테스트: `npm run test:lambda`

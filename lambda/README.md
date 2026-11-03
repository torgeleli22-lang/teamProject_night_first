# Lambda

서버는 기능별 **Python Lambda 함수 6개**예요 (구조 기준: [`docs/LAMBDA_STRUCTURE.md`](../docs/LAMBDA_STRUCTURE.md)).

```
화면 ──JSON──▶ jojo_auth · jojo_practice · jojo_inspect · jojo_review · jojo_study · jojo_admin ──▶ DynamoDB jojo_table · Bedrock Claude Haiku 4.5
      (경로 앞부분으로 함수를 골라요: src/lib/api-routes.ts)
```

| 폴더·파일 | 내용 |
|---|---|
| [`api/`](api) | 공통 조각(`core`·`ai`·`code_store`) · 기능 파일 · 예시 코드 (저장소에 한 벌) |
| [`functions/`](functions) | 함수 6개의 입구 — zip 안에서는 `lambda_function.py` 가 돼요 |
| [`console/`](console) | **콘솔에 붙여넣을 파일**을 함수 이름별 폴더로 + 라이브러리 레이어 zip — `npm run package` 가 만든 복사본 (직접 고치지 않음) |
| [`functions.json`](functions.json) | 함수 표: 넣을 파일 · 라이브러리 · 환경 변수 이름 · 화면이 고를 경로 · 제한 시간 · 메모리 |
| `requirements.txt` | Lambda 에 묶어 넣는 외부 라이브러리 (Powertools · Pydantic · tree-sitter, 버전 고정) |
| `tests/` | Python 단위 테스트 (`npm run test:lambda`) — `test_functions.py` 가 함수 표·의존 규칙을 확인 |

## 왜 나누나요?
- **오류를 기능별로 찾기 쉽게**: 로그·오류 수·실행 시간이 함수마다 따로 쌓여요
- **한 기능의 문제가 번지지 않게**: 코드 만들기가 오래 걸리거나 실패해도 로그인·첨삭은 그대로
- **필요한 것만**: 로그인 함수에는 AI 코드가 없고(`core`·`auth` 만), 비밀 값도 쓰는 함수에만, 제한 시간·메모리도 기능마다 따로
- 공통 코드는 저장소에 **한 벌**만 두고, 배포할 때 함수마다 필요한 조각만 골라 묶어요

**원본은 이 폴더예요.** 내 컴퓨터에서 실행: `npm run setup:python` (처음 한 번) → `npm run api` · 묶기: `npm run package` · 올리기: 콘솔 [`console/`](console) 또는 CloudShell `npm run deploy` — [`docs/DEPLOY_LAMBDA.md`](../docs/DEPLOY_LAMBDA.md)

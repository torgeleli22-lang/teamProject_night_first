# Lambda

서버는 기능별 **Python Lambda 함수 6개**로 나눠 가는 중이에요 (구조 기준: [`docs/LAMBDA_STRUCTURE.md`](../docs/LAMBDA_STRUCTURE.md)).
지금은 전환 1단계까지 끝나서, 공통 코드는 `core.py`·`ai.py`·`code_store.py` 로 나뉘었고 배포는 아직 함수 하나(`jojo_api_py`)예요.

```
화면 ──JSON──▶ jojo_api_py (함수 URL 하나) ──▶ DynamoDB jojo_table · Bedrock Claude Haiku 4.5
            (전환 뒤: 로그인 · 연습 · 내 코드 점검 · 첨삭 · 내 공부 · 관리자 함수 6개)
```

| 폴더·파일 | 내용 |
|---|---|
| [`api/`](api) | 입구 · 공통 조각(`core`·`ai`·`code_store`) · 기능 파일 · 예시 코드 |
| `requirements.txt` | Lambda 에 묶어 넣는 외부 라이브러리 (Powertools · Pydantic · tree-sitter, 버전 고정) |
| `tests/` | Python 단위 테스트 (`npm run test:lambda`) |

## 왜 나누나요?
- **오류를 기능별로 찾기 쉽게**: 로그·오류 수·실행 시간이 함수마다 따로 쌓여요
- **한 기능의 문제가 번지지 않게**: 코드 만들기가 오래 걸리거나 실패해도 로그인·첨삭은 그대로
- **필요한 것만**: 로그인 함수에는 AI 코드가 없고, 제한 시간·메모리도 기능마다 따로
- 공통 코드는 저장소에 **한 벌**만 두고, 배포할 때 함수마다 필요한 조각만 골라 묶어요

**원본은 이 폴더예요.** 내 컴퓨터에서 실행: `npm run setup:python` (처음 한 번) → `npm run api` · 배포: [`docs/DEPLOY_LAMBDA.md`](../docs/DEPLOY_LAMBDA.md)

# Lambda

서버는 **Python Lambda 함수 하나**(`jojo_api`)예요. 콘솔 코드 탭에 그대로 붙여넣는 읽을 수 있는 코드이고, zip·빌드가 없어요.

```
화면 ──JSON──▶ jojo_api (함수 URL 하나) ──▶ DynamoDB jojo_table · Bedrock Claude Haiku 4.5
```

| 폴더 | 내용 |
|---|---|
| [`api/`](api) | `jojo_api` 의 파일들 (입구 · 공통 · 기능 파일 · 예시 코드) |
| `tests/` | Python 단위 테스트 (`npm run test:lambda`) |

## 왜 함수 하나인가요? (최소 비용·최소 구성·최고 속도)

| | 함수 하나 + 기능 파일 | 기능마다 함수 |
|---|---|---|
| 콘솔에서 만들 함수 | **1개** | 5개 이상 |
| 공통 코드(`common.py`) | **한 곳** | 함수마다 복사 |
| 화면 설정 변수 | **`API_URL` 하나** | 기능 수만큼 |
| 콜드 스타트 | **드묾** — 모든 요청이 같은 함수를 데워 둠 | 기능마다 따로 식음 |
| 브라우저 연결 | **주소 하나라 HTTPS 연결을 한 번 맺고 계속 다시 씀** | 기능마다 새로 연결 |
| 요금 | Lambda 무료 사용량 안에서 0원에 가까움 | 같음 |

예전에는 코드 문제를 실제로 실행해 확인하려고 Node.js 함수(`jojo_generate_code`)가 따로 있었지만, 지금은 Python 문법 검사(`compile`)만 해서 필요 없어졌어요 (코드 실행 확인은 2단계).

**원본은 이 폴더예요.** 콘솔에서 고쳤다면 같은 내용을 이 폴더에도 반영해 주세요 (팀원과 공유, 변경 기록, 자동 검사 `npm run smoke`).
만드는 방법: [`docs/DEPLOY_LAMBDA.md`](../docs/DEPLOY_LAMBDA.md) · 내 컴퓨터에서 실행: `npm run api`

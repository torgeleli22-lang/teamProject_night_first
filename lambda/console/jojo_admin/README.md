# jojo_admin — 관리자 화면·논문 실험

> 이 폴더의 `.py` 는 **자동으로 만든 복사본**이에요 (원본: `lambda/api` · `lambda/functions`). 여기서 고치지 말고 원본을 고친 뒤 `npm run package`.
> 화면이 이 함수로 보내는 경로: `/admin`

## 1. 함수 만들기 (Lambda → 함수 생성 → 새로 작성)
| 항목 | 값 |
|---|---|
| 함수 이름 | `jojo_admin` |
| 런타임 | **Python 3.14** |
| 아키텍처 | **arm64** |
| 실행 역할 | 기본 실행 역할 변경 → 기존 역할 사용 → `SafeRole-sgu-202688` |

## 2. 코드 붙여넣기 (코드 탭) — 파일 9개
| 순서 | 파일 | 하는 일 |
|---|---|---|
| 1 | [`lambda_function.py`](lambda_function.py) | **입구** — 이 함수의 경로 표 (처음부터 있는 파일이에요. 내용을 전부 바꿔요) |
| 2 | [`admin.py`](admin.py) | 관리자 화면 (AI 사용량·비용·AI 끄기·관리자 코드·예전 데이터 옮기기) |
| 3 | [`experiment.py`](experiment.py) | 논문 실험 (문항 하나를 만들고 단계 기록) |
| 4 | [`practice.py`](practice.py) | 연습 코드 만들기 (출제 → 규칙 검사 → 실행 추적표 → 교차 검토) |
| 5 | [`samples.py`](samples.py) | AI 를 쓸 수 없을 때의 예시 코드(Python) · 랜덤 주제 |
| 6 | [`samples_js.py`](samples_js.py) | AI 를 쓸 수 없을 때의 예시 코드(JavaScript) |
| 7 | [`core.py`](core.py) | 공통 조각: 설정·요청/응답·DynamoDB·요청 수 제한·학습자·AI 끄기 스위치 |
| 8 | [`ai.py`](ai.py) | 공통 조각: AI 호출(`ask_ai`)·월 예산·사용량 기록·AI 답의 모양 |
| 9 | [`code_store.py`](code_store.py) | 공통 조각: 읽을 코드 저장·꺼내기·화면으로 보낼 모양 |

1. 위 파일 이름을 눌러 열고 **Raw** → 전체 선택·복사
2. 콘솔 코드 탭: `lambda_function.py` 는 이미 있는 파일의 내용을 전부 바꾸고, 나머지는 **File → New File** → 이름을 **그대로** 저장 → 붙여넣기
3. 다 넣었으면 **Deploy**

## 3. 구성
- **일반 구성 → 편집**: 제한 시간 **10분**, 메모리 **512MB**
- **계층(Layers) → 계층 추가 → 사용자 지정 계층 → `jojo_libs`** (가장 최근 버전) — 라이브러리(Powertools·Pydantic·tree-sitter)가 들어 있어요. 처음 한 번 만드는 법: [`../README.md`](../README.md)
- **환경 변수** — 값은 `jojo_api_py` 의 구성 → 환경 변수에서 같은 이름의 값을 복사

  | 키 | 값 |
  |---|---|
  | `TABLE_NAME` | `jojo_table` (jojo_api_py 와 같게) |
  | `TTL_ATTR` | `jojo_ttl` (jojo_api_py 와 같게) |
  | `AI_MODE` | `live` (jojo_api_py 와 같게) |
  | `ALLOWED_ORIGINS` | `https://torgeleli22-lang.github.io` (jojo_api_py 와 같게) |
  | `AI_MONTHLY_BUDGET_USD` | `10` (jojo_api_py 와 같게) |
  | `ADMIN_TOKEN` | 관리자 복구 코드 — **비밀 값, 이 함수에만** |

  선택: `jojo_api_py` 에 `MODEL_ID` · `BEDROCK_REGION` · `DB_REGION` · `RATE_LIMIT_*` · `POWERTOOLS_LOG_LEVEL` 이 있으면 같은 값으로
- **함수 URL → 생성**: 인증 유형 **NONE**, **CORS 는 설정하지 않음** (코드가 `ALLOWED_ORIGINS` 로 처리)

## 4. 확인
- **테스트 탭** → 이벤트 `{"path": "/health", "method": "GET"}` → 응답 body 에 `"ok": true`
- 브라우저에서 `<함수 URL>health` → 같은 JSON. `{"Message":"Forbidden"}` 이면 CloudShell 에서 공개 허용 (이미 있으면 `ResourceConflictException` 은 괜찮음):
  ```bash
  FN=jojo_admin
  aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE
  aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowInvokeAction --action lambda:InvokeFunction --principal "*" --invoked-via-function-url
  ```
- 함수 URL 을 적어 두세요 → [`../README.md`](../README.md) 의 화면 주소(`API_URLS`)에 넣어요

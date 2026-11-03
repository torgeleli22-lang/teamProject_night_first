# jojo_auth — 로그인·현재 학습자

> 이 폴더의 `.py` 는 **자동으로 만든 복사본**이에요 (원본: `lambda/api` · `lambda/functions`). 여기서 고치지 말고 원본을 고친 뒤 `npm run package`.
> 화면이 이 함수로 보내는 경로: `/me`, `/auth`, `/health` (`/health` 연결 확인도 여기로)

## 1. 함수 만들기 (Lambda → 함수 생성 → 새로 작성)
| 항목 | 값 |
|---|---|
| 함수 이름 | `jojo_auth` |
| 런타임 | **Python 3.14** |
| 아키텍처 | **arm64** |
| 실행 역할 | 기본 실행 역할 변경 → 기존 역할 사용 → `SafeRole-sgu-202688` |

## 2. 코드 붙여넣기 (코드 탭) — 파일 3개
| 순서 | 파일 | 하는 일 |
|---|---|---|
| 1 | [`lambda_function.py`](lambda_function.py) | **입구** — 이 함수의 경로 표 (처음부터 있는 파일이에요. 내용을 전부 바꿔요) |
| 2 | [`auth.py`](auth.py) | Google 로그인 · 로그인 토큰 · 익명 기록 옮기기 |
| 3 | [`core.py`](core.py) | 공통 조각: 설정·요청/응답·DynamoDB·요청 수 제한·학습자·AI 끄기 스위치 |

1. 위 파일 이름을 눌러 열고 **Raw** → 전체 선택·복사
2. 콘솔 코드 탭: `lambda_function.py` 는 이미 있는 파일의 내용을 전부 바꾸고, 나머지는 **File → New File** → 이름을 **그대로** 저장 → 붙여넣기
3. 다 넣었으면 **Deploy**

## 3. 구성
- **일반 구성 → 편집**: 제한 시간 **15초**, 메모리 **256MB**
- **계층(Layers) → 계층 추가 → 사용자 지정 계층 → `jojo_libs`** (가장 최근 버전) — 라이브러리(Powertools·Pydantic·tree-sitter)가 들어 있어요. 처음 한 번 만드는 법: [`../README.md`](../README.md)
- **환경 변수** — 공통 값은 6개 함수 모두 같게 (이미 만든 다른 함수의 구성 → 환경 변수와 같은 값)

  | 키 | 값 |
  |---|---|
  | `TABLE_NAME` | `jojo_table` |
  | `TTL_ATTR` | `jojo_ttl` |
  | `AI_MODE` | `live` |
  | `ALLOWED_ORIGINS` | `https://torgeleli22-lang.github.io` |
  | `AI_MONTHLY_BUDGET_USD` | `10` |
  | `GOOGLE_CLIENT_ID` | Google 로그인 (없으면 로그인 버튼이 안 보여요) |
  | `GOOGLE_CLIENT_SECRET` | Google 로그인 — **비밀 값, 이 함수에만** |
  | `AUTH_CALLBACK_BASE` | 보통 비워 둬요 (넣지 않음) |

  선택: 다른 함수에 `MODEL_ID` · `BEDROCK_REGION` · `DB_REGION` · `RATE_LIMIT_*` · `POWERTOOLS_LOG_LEVEL` 이 있으면 같은 값으로
- **함수 URL → 생성**: 인증 유형 **NONE**, **CORS 는 설정하지 않음** (코드가 `ALLOWED_ORIGINS` 로 처리)

## 4. 확인
- **테스트 탭** → 이벤트 `{"path": "/health", "method": "GET"}` → 응답 body 에 `"ok": true`
- 브라우저에서 `<함수 URL>health` → 같은 JSON. `{"Message":"Forbidden"}` 이면 CloudShell 에서 공개 허용 (이미 있으면 `ResourceConflictException` 은 괜찮음):
  ```bash
  FN=jojo_auth
  aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE
  aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowInvokeAction --action lambda:InvokeFunction --principal "*" --invoked-via-function-url
  ```
- 함수 URL 을 적어 두세요 → [`../README.md`](../README.md) 의 화면 주소(`API_URLS`)에 넣어요

# admin — 관리자 Lambda (Python 3.13)

관리자 화면(`/admin`)의 요청을 모두 처리해요. 모든 요청에 `x-admin-token` 헤더(관리자 코드)가 필요해요.

| 요청 | 하는 일 |
|---|---|
| `GET /admin/overview` | 현황: AI 모드·비용·문제 재고·생성 작업·AI 콘텐츠 |
| `POST /admin/generate` | AI 문제 만들기 → 코드 주제는 **generate-code**, 개념 주제는 **generate-theory** 를 불러요 (기다리지 않음) |
| `GET·POST /admin/fill` | 출시 전 채우기 계획 / 시작 |
| `POST /admin/auto`, `/admin/stop` | 자동 생성 켜기·끄기 / 생성 멈추기 |
| `POST /admin/code` | 관리자 코드 바꾸기 (scrypt 해시로 저장) |
| `POST /admin/repair` | 반려된 AI 콘텐츠 고쳐서 다시 만들기 |
| `GET /admin/item`, `POST /admin/review` | 승인 대기 개념 문제 보기 / 승인·반려 |
| `GET /admin/export`, `POST /admin/import` | AI 콘텐츠·설정·사용량 내보내기·가져오기 |

- 복구 코드 `ADMIN_TOKEN`(환경 변수)은 관리자 코드를 잊어도 들어올 수 있는 코드예요. 직접 정한 긴 값을 넣고, GitHub·채팅에는 쓰지 마세요
- 틀린 코드를 15분에 10번 넣으면 그 IP 는 15분 동안 막혀요

## 콘솔에 넣는 파일
| 파일 | 어디서 |
|---|---|
| `lambda_function.py` | 이 폴더 |
| `common.py` | [`lambda/common/common.py`](../common/common.py) (모든 Python 함수에 같은 파일) |

코드 탭에서 `lambda_function.py` 를 통째로 바꾸고, **파일 → 새 파일**로 `common.py` 를 만들어 붙여넣은 뒤 **Deploy**.

## 설정
- 제한 시간 15초 · 메모리 256MB · 함수 URL 필요 (`ADMIN_URL`)
- 실행 역할: `SafeRole-sgu-202688`
- 환경 변수: `TABLE_NAME`, `TTL_ATTR`, `ALLOWED_ORIGINS`, `AI_MODE`, **`ADMIN_TOKEN`**, `GENERATE_CODE_FUNCTION`, `GENERATE_THEORY_FUNCTION` (값은 [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md) 의 표)

## 콘솔에서 시험하기
**테스트 탭 → 새 이벤트**에 [`test_event.json`](test_event.json) 내용을 붙여넣고 **테스트**.
`path`·`method` 로 경로를 고르고, 나머지 값은 요청 본문으로 쓰여요. 응답의 `body` 가 화면이 받는 JSON 이에요.

## 고칠 만한 곳
| 바꾸고 싶은 것 | 코드 위치 |
|---|---|
| 관리자 코드 길이 | `ADMIN_CODE_MIN`, `ADMIN_CODE_MAX` |
| 잠금 기준 | `MAX_FAILURES`, `LOCK_WINDOW_SEC` |
| 출시 전 채우기 계획 | `fill_plan` |

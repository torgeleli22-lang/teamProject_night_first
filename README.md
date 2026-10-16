# git 웹사이트 열기
👉 https://torgeleli22-lang.github.io/teamProject_night_first/

# 코드 리딩 노트 — AI 가 짜 준 코드, 정말 읽을 수 있나요?

> 📄 프로젝트 전체 설명(개요·화면 흐름·AI 원칙·아키텍처·DynamoDB·다음 할 일): [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) — AI 코딩 도구에게 작업을 맡길 때도 이 문서를 먼저 읽게 하세요.

코드 옆에 메모로 흐름을 적어 보세요. 내가 어디까지 제대로 읽었는지, 빨간펜으로 메모마다 첨삭해 드려요.

1. **코드를 받는다** — 연습 모드(난이도 입문·초급·중급 + 랜덤 또는 직접 적은 주제) 또는 내 코드 점검(Python 파일 1개·붙여넣기, 300줄까지)
2. **형광펜으로 범위를 긋고 메모한다** — 첫 줄과 끝 줄을 눌러 범위를 정하고 포스트잇에 흐름을 적어요. **※ 표시된 곳**은 꼭 설명해요
3. **빨간펜 첨삭을 받는다** — 메모마다 **○ 정확 · △ 부분 · ✕ 오해**, 비어 있는 ※ 는 **⬚ 누락**. 정답 대신 다시 볼 줄을 짚어 주고, '모범 설명 보기'로 확인해요

## 구성

```
GitHub Pages (정적 화면)  ──JSON (주소 하나)──→  jojo_api (Python Lambda 하나)  ──→  DynamoDB jojo_table
     src/app, src/components                       lambda/api/                    └─→  Bedrock Claude Haiku 4.5
```

- **화면**은 Next.js 정적 내보내기(`output: "export"`)라 서버가 없습니다. GitHub Pages 에 올립니다. 디자인은 공부 노트(줄 공책·형광펜·포스트잇·빨간펜·도장).
- **서버는 Lambda 함수 하나**입니다 ([`lambda/README.md`](lambda/README.md)). 콘솔 코드 탭에 **그대로 붙여넣는 읽을 수 있는 코드**(Python + boto3)이고 zip·빌드가 없습니다.
  입구 `lambda_function.py` 가 기능 파일(`topics.py` 주제, `practice.py` 연습 코드, `inspect_code.py` 내 코드 점검, `review.py` 첨삭, `admin.py` 관리자)로 나눠 처리합니다.
- **AI 가 없어도 동작**: AI 를 끄거나 월 예산에 닿으면 예시 코드·규칙 판정·규칙 첨삭으로 바뀝니다.
- **민감 정보 보호**: 올린 코드의 API 키·토큰·비밀번호는 화면에서 먼저 가리고 서버에서 한 번 더 가립니다. 올린 코드는 하루 뒤 자동으로 지워집니다.
- **로그인 없는 세션**: Lambda 가 발급한 세션 id 를 브라우저 `sessionStorage` 에 둡니다. 읽은 코드·첨삭은 만든 사람만 열 수 있습니다.

## 빠른 시작 (로컬)

```bash
npm install
python3 -m pip install boto3   # Python 3.10 이상
npm run api                    # 터미널 1: Lambda  http://localhost:8787 (DynamoDB 흉내 서버 + 목업 AI)
npm run dev                    # 터미널 2: 화면 http://localhost:3000  (관리자: /admin)
```

AWS 계정·키 없이 실행됩니다. AI 는 기본으로 **목업**(`AI_MODE=mock`, 비용 없음)이라 화면 흐름을 확인할 수 있습니다. Node.js 22.13 이상이 필요합니다.

| 스크립트 | 설명 |
| --- | --- |
| `npm run api` | 로컬에서 Lambda 실행 (AWS 에서 도는 것과 같은 코드) |
| `npm run dev` / `build` | 화면 개발 서버 / 정적 빌드 (`out/`) |
| `npm test` | 단위 테스트 (TypeScript: 민감 정보 가리기·문법 색칠·경계 / Python: 예시 코드·주제 판정·코드 검사·함수 찾기·규칙 첨삭·관리자 코드) |
| `npm run verify` | 예시 코드를 실제로 실행하고 ※ 줄 범위 확인 |
| `npm run smoke` | Lambda 전체 흐름 점검 (주제·연습·다시 만들기 5번·첨삭·내 코드 점검·AI 끄기·관리자) |
| `npm run typecheck` | TypeScript 타입 검사 |

## 화면

| 경로 | 내용 |
| --- | --- |
| `/` | 첫 화면: 연습 모드 / 내 코드 점검 |
| `/practice/` | 1장 · 주제 고르기: 난이도 + 주제(랜덤 / 직접 적기 → AI 판정) |
| `/read/?id=` | 2장 · 메모하며 읽기: 형광펜 범위 + 포스트잇 메모, 더 쉽게·더 어렵게, 첨삭 받기 |
| `/result/?id=` | 3장 · 빨간펜 첨삭: 총평, ○△✕⬚ 개수, 메모별 첨삭, 모범 설명 보기 |
| `/check/` | 내 코드 점검: 파일 올리기·붙여넣기, 민감 정보 가리기, 함수 고르기, 훑어본 난이도 |
| `/admin/` | 관리자: AI 끄기·켜기, 이번 달 비용·예산, 작업별 사용량, 날짜별 사용 수 |

## 배포 (GitHub Pages + Lambda + DynamoDB + Bedrock)

[`docs/DEPLOY_LAMBDA.md`](docs/DEPLOY_LAMBDA.md) 를 따라 하세요. 요약:

1. DynamoDB 테이블 `jojo_table` (pk·sk, TTL `jojo_ttl`)
2. Lambda 하나(`jojo_api_py`)의 코드 탭에 `lambda/api/` 의 `.py` 파일 8개를 붙여넣기 (실행 역할 `SafeRole-sgu-202688`, 512MB, 2분)
3. 함수 URL 을 GitHub 저장소 변수 `API_URL` 에 넣고 Pages 배포

## 다음 단계

- 내 코드 점검에 JavaScript·Java
- 코드 실행 확인 (AI 가 만든 코드의 실제 출력 확인)
- 로그인 + 기록 영구 저장

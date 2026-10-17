# 코드 리딩 노트 — AI 작업 안내 (Claude Code 외 다른 AI 코딩 도구용, 내용은 CLAUDE.md 와 같음)

작업 전에 **`docs/PROJECT_BRIEF.md`** 를 먼저 읽으세요. 프로젝트 개요, 화면 흐름, AI 사용 원칙, 아키텍처, DynamoDB 항목, 디렉터리, 다음 할 일이 모두 정리되어 있습니다.
AI 사용 기준(프롬프트·검사·대체 동작)은 `docs/ai-generation-policy.md`, Lambda 배포 순서는 `docs/DEPLOY_LAMBDA.md` 에 있습니다.

## 반드시 지킬 것
- 이 서비스는 "코드를 대신 작성해 주는 AI"가 아니라 "코드를 읽고 흐름을 설명하도록 가르치는 AI"다. 사용자는 코드 범위에 형광펜을 긋고 메모로 흐름을 적고, AI 는 빨간펜으로 ○ 정확 · △ 부분 · ✕ 오해 를 표시하며 정답 대신 다시 볼 곳을 짚는다. 두 모드: 연습 모드(난이도·주제로 받은 코드)와 내 코드 점검(올린 Python 코드).
- AI 는 연습 코드 만들기·주제 판정·내 코드 분석·첨삭·힌트 보고 다시 쓴 설명 채점·첨삭 뒤 AI 튜터 대화에만 쓴다. 튜터는 바로 정답을 주기보다 볼 줄과 질문으로 이끌고, 코드를 대신 짜 주지 않는다. 누락 판정, 개수, 민감 정보 가리기, 함수 찾기, 통계·'내 공부'(난이도 추천·개념별 약점·설명 노트)는 일반 코드로. AI 호출은 `lambda/api/common.py` 의 `ask_ai()` 로만 하고, 새 AI 작업에는 mock 응답과 AI 없이 쓰는 대체 경로(예시 코드·규칙)를 함께 만든다.
- 모범 설명·핵심 표현은 첨삭 전에 화면으로 보내지 않는다 (읽는 동안은 `common.public_reading` 만, 모범 설명은 `POST /review` 결과에만).
- 올린 코드는 화면(`src/lib/secrets.ts`)에서 민감 정보를 가린 뒤 보내고, Lambda(`inspect_code.py` 의 `mask_secrets`)에서 한 번 더 가린다. 두 곳의 패턴을 같게 유지한다.
- 구조: 화면은 정적 페이지(GitHub Pages), 서버는 **Python Lambda 하나** `jojo_api`(`lambda/api/`, 함수 URL 하나, 기능별 파일) + DynamoDB + Bedrock. 최소 비용·최고 속도가 목표라 기능마다 함수를 늘리지 않고 `lambda/api/` 에 기능 파일을 더한다. 화면(`src/`)은 `lambda/` 를 가져오지 않고 `src/lib/api.ts` 로만 부르며, 응답 모양은 `src/lib/api-types.ts` 에 Lambda 와 같게 유지한다.
- **Lambda 는 콘솔 코드 탭에 붙여넣는 읽을 수 있는 소스로 유지한다**: zip·번들·압축·빌드 단계를 만들지 않는다. `lambda_handler` 와 처리 함수에 단계 번호 주석, 외부 라이브러리 없이 boto3 만. 공통 코드는 `lambda/api/common.py` 하나.
- DynamoDB 항목 모양(pk·sk, 필드)을 바꾸면 그 항목을 읽는 모든 기능 파일과 `src/lib/api-types.ts` 를 함께 바꾸고 `npm run smoke` 로 확인한다.
- 예시 코드(`lambda/api/samples.py`, JavaScript 는 `samples_js.py`)를 추가·수정하면 `npm run verify` 를 통과시킨다 (실제 실행(Python·node) + ※ 줄 범위 확인).
- 정한 값: 업로드 최대 300줄, 연습 모드 언어 Python·JavaScript(`common.LANGUAGES`, Java 는 나중에) · 내 코드 점검은 Python 만, 점수는 ○△✕ 개수, 같은 코드 다시 만들기 5번 (`common.py` 1번 설정).
- 화면 문구는 한국어 존댓말("~해요"), 초보자 눈높이. 디자인은 공부 노트(줄 공책·여백선·형광펜·포스트잇·빨간펜·도장·인덱스 탭), 그라데이션·둥근 카드·이모지·파란 버튼은 쓰지 않는다. ○△✕⬚ 는 늘 빨간펜 그림(`ui.tsx` 의 `PenMark`, 문장은 `MarkText`)으로 — 글자로 쓰지 않는다.
- AWS 는 `docs/PROJECT_BRIEF.md` §10 에 확정된 범위만: Lambda(실행 역할 SafeRole, VPC 없음) + DynamoDB `jojo_table` + Bedrock Claude Haiku 4.5(us-east-1). S3 등은 요청 없이 넣지 않는다. 비밀 값은 코드·문서에 쓰지 않는다.

## 명령
```bash
npm run api            # Lambda http://localhost:8787 (DynamoDB 흉내 + 목업 AI, Python + boto3 필요)
npm run dev            # 화면 http://localhost:3000
npm run typecheck      # 타입 검사
npm test               # 단위 테스트 (TS + Python)
npm run verify         # 예시 코드 실제 실행 + ※ 지점 검증
npm run build          # 정적 화면 빌드 (out/)
npm run smoke          # Lambda 전체 흐름 점검 (Lambda 를 바꿨다면)
```
작업을 마치기 전에 위 네 가지(typecheck, test, verify, build)를 모두 통과시키세요. Lambda 를 바꿨다면 smoke 도.

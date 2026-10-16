# 코드리딩 — AI 작업 안내

작업 전에 **`docs/PROJECT_BRIEF.md`** 를 먼저 읽으세요. 프로젝트 개요, 기능, AI 사용 원칙, 아키텍처, DynamoDB 항목, 디렉터리, 다음 할 일이 모두 정리되어 있습니다.
AI 문제 생성 기준은 `docs/ai-generation-policy.md`, Lambda 배포 순서는 `docs/DEPLOY_LAMBDA.md` 에 있습니다.

## 반드시 지킬 것
- 이 서비스는 "코드를 대신 작성해주는 AI"가 아니라 "코드를 읽고 이해하도록 가르치는 AI"다. 학습은 두 갈래: 개념(4분야 객관식·자격증 태그, 코드에서는 `theory`)과 코드(코드 하나를 읽기 단계별로).
- 객관식·빈칸·실행 결과 예측 채점(보기 섞기 포함), 통계, 추천, 힌트·해설 표시에 AI 를 쓰지 않는다. AI 호출은 Python 은 `lambda/api/common.py` 의 `ask_ai()`·`ask_text()`, generate-code 는 `askAi()` 로만 하고, 새 AI 작업에는 mock 응답도 함께 만든다.
- 정답·해설·채점 기준을 화면으로 보내지 않는다 (`questions.py` 의 `to_public` 만 보냄). 채점은 `submit_answer.py` 에서.
- 구조: 화면은 정적 페이지(GitHub Pages), 서버는 **Lambda 2개** — Python `jojo_api`(`lambda/api/`, 함수 URL 하나, 기능별 파일)와 코드 문제 생성 Node.js `jojo_generate_code`(`lambda/generate-code/`) — + DynamoDB + Bedrock. 최소 비용·최고 속도가 목표라 기능마다 함수를 늘리지 않고 `lambda/api/` 에 기능 파일을 더한다. 화면(`src/`)은 `lambda/` 를 가져오지 않고 `src/lib/api.ts` 로만 부르며, 응답 모양은 `src/lib/api-types.ts` 에 Lambda 와 같게 유지한다.
- **Lambda 는 콘솔 코드 탭에 붙여넣는 읽을 수 있는 소스로 유지한다**: zip·번들·압축·빌드 단계를 만들지 않는다. `lambda_handler` 와 처리 함수에 단계 번호 주석, 외부 라이브러리 없이 boto3(Python)·런타임 AWS SDK(Node.js)만. 공통 코드는 `lambda/api/common.py` 하나.
- DynamoDB 항목 모양(pk·sk, 필드)을 바꾸면 그 항목을 읽는 모든 기능 파일·`jojo_generate_code` 와 `src/lib/api-types.ts` 를 함께 바꾸고 `npm run smoke` 로 확인한다.
- 문제 콘텐츠·커리큘럼을 추가·수정하면 `npm run export:content` 로 `lambda/api/content.json` 을 다시 만들고 `npm run verify` 를 통과시킨다.
- 화면 문구는 한국어 존댓말("~해요"), 초보자 눈높이.
- AWS 는 `docs/PROJECT_BRIEF.md` §11 에 확정된 범위만: Lambda(실행 역할 SafeRole, VPC 없음) + DynamoDB `jojo_table` + Bedrock Claude Haiku 4.5(us-east-1). S3 등은 요청 없이 넣지 않는다. 비밀 값은 코드·문서에 쓰지 않는다.

## 명령
```bash
npm run api            # Lambda http://localhost:8787 (DynamoDB 흉내 + 목업 AI, Python + boto3 필요)
npm run dev            # 화면 http://localhost:3000
npm run typecheck      # 타입 검사
npm test               # 단위 테스트 (TS + Python)
npm run verify         # 시드 콘텐츠 실제 실행 검증 + content.json 최신 확인
npm run build          # 정적 화면 빌드 (out/)
npm run smoke          # Lambda 전체 흐름 점검 (Lambda 를 바꿨다면)
npm run export:content # 커리큘럼·시드 → lambda/api/content.json
```
작업을 마치기 전에 위 네 가지(typecheck, test, verify, build)를 모두 통과시키세요. Lambda 를 바꿨다면 smoke 도.

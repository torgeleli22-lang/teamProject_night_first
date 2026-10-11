# 코드리딩 — AI 작업 안내

작업 전에 **`docs/PROJECT_BRIEF.md`** 를 먼저 읽으세요. 프로젝트 개요, 기능, AI 사용 원칙, 아키텍처, DB, 디렉터리, 다음 할 일이 모두 정리되어 있습니다.
AI 문제 생성 기준은 `docs/ai-generation-policy.md` 에 있습니다.

## 반드시 지킬 것
- 이 서비스는 "코드를 대신 작성해주는 AI"가 아니라 "코드를 읽고 이해하도록 가르치는 AI"다.
- 객관식·빈칸·셔플·실행 결과 예측·오류 찾기 채점, 통계, 추천, 힌트·해설 표시에 AI 를 쓰지 않는다. AI 호출은 `src/lib/ai/client.ts` 의 `askStructured()` 로만, 새 AI 작업에는 mock 응답도 함께 만든다.
- 정답·해설·채점 기준을 클라이언트로 보내지 않는다 (`PublicQuestion` 만 보냄). 채점은 서버에서.
- 구조: 화면은 정적 페이지(GitHub Pages), 서버는 Lambda API(`src/api`). `src/lib/server/**`, `src/lib/ai/**`, `src/api/**` 는 API 전용이고, 화면(`src/app`, `src/components`)은 이것들을 `import type` 으로만 가져온다. 화면에서 API 는 `src/lib/api.ts` 로만 부른다.
- 문제 콘텐츠를 추가·수정하면 실행 검증(`npm run verify`)을 통과시킨다.
- 화면 문구는 한국어 존댓말("~해요"), 초보자 눈높이.
- AWS 는 `docs/PROJECT_BRIEF.md` §11 에 확정된 범위(Lambda, Aurora PostgreSQL Data API)만 진행한다. Bedrock·S3 등은 요청 없이 넣지 않는다. 비밀 값은 코드·문서에 쓰지 않는다.
- SQL 은 SQLite·PostgreSQL 공통으로 쓴다 (`src/lib/server/db/types.ts` 의 규칙).

## 명령
```bash
npm run api          # API http://localhost:8787 (.env, AI_MODE=mock 이면 API 키 없이 AI 기능 확인)
npm run dev          # 화면 http://localhost:3000
npm run typecheck    # 타입 검사
npm test             # 단위 테스트
npm run verify       # 시드 콘텐츠 실제 실행 검증
npm run build        # 정적 화면 빌드 (out/)
npm run smoke        # API 전체 흐름 점검 (API 를 바꿨다면)
npm run build:lambda # Lambda 배포 파일 dist/lambda.zip
```
작업을 마치기 전에 위 네 가지(typecheck, test, verify, build)를 모두 통과시키세요.

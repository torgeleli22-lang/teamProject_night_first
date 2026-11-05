# 코드 리딩 노트 — AI 작업 안내 (Claude Code 외 다른 AI 코딩 도구용, 내용은 CLAUDE.md 와 같음)

작업 전에 **`docs/PROJECT_BRIEF.md`** 를 먼저 읽으세요 (핵심 흐름 · 지켜야 할 것 · 구조 · 명령).
기준 문서 두 개를 따르세요 (바꿀 때는 문서부터 고칩니다):
- **`docs/GENERATION_STANDARD.md`** — 코드 생성·검증·채점 기준 (난이도 6요소 → 생성 AI → 규칙 검사 → 검토 AI(실행 추적·동작·난이도·모범 설명) → 실패 처리 → 검토 기록을 채점 기준으로)
- **`docs/LAMBDA_STRUCTURE.md`** — Lambda 3개(`jojo_auth`·`jojo_practice`·`jojo_review`)의 폴더·규칙·DynamoDB 항목. 함수마다 폴더 하나(`lambda/jojo_*/`), 공통은 `lambda/shared/` 한 벌. 올릴 때는 함수 폴더 + shared 를 zip 하나로 묶어 CloudShell 명령으로 (`docs/DEPLOY_LAMBDA.md` 3)

## 반드시 지킬 것
- 이 서비스는 "코드를 대신 작성해 주는 AI"가 아니라 "코드를 읽고 흐름을 설명하도록 가르치는 AI"다. 핵심 기능은 세 가지뿐: **로그인 · 코드 생성(검증한 코드만 제공) · 해설 채점**. 목적은 정답 값이 아니라 흐름 이해다.
- AI 는 코드 생성·코드 검토·메모 채점에만 쓴다. 빈칸 판정·개수·문법 검사·랜덤 주제는 일반 코드로. AI 호출은 `lambda/shared/ai.py` 의 `ask_ai()` 로만 하고, 새 AI 작업에는 mock 응답과 AI 없이 쓰는 대체 경로(예시 코드·규칙 채점)를 함께 만든다.
- 난이도는 줄 수·문법 개수가 아니라 6요소(`lambda/jojo_practice/levels.py`, 문서 1~3장)로. 언어 기능(모듈·랜덤·시각·입력)은 금지하지 않는다.
- 검토를 거치지 않은 AI 코드는 내보내지 않는다. 검토의 실행 기록(units)은 저장해 채점 기준으로 쓰고, 채점 전에는 화면으로 보내지 않는다 (읽는 동안은 `core.public_code` 만).
- Lambda 코드: 처리 함수에 단계 번호 주석. 외부 라이브러리는 Powertools·Pydantic·tree-sitter 만 (`docs/LAMBDA_STRUCTURE.md`). 로그는 `core.logger` (JSON), `print` 쓰지 않기. 요청 본문은 `core.Body` 를 이은 모양 + `read_body`, AI 답은 `ai.AiAnswer` 를 이은 모양. 함수 폴더끼리 import 하지 않는다.
- 화면(`src/`)은 `lambda/` 를 가져오지 않고 `src/lib/api.ts` 로만 부르며, 응답 모양은 `src/lib/api-types.ts` 에 Lambda 와 같게 유지한다. 경로를 더하면 `src/lib/api-routes.ts` 도.
- DynamoDB 항목 모양을 바꾸면 읽는 기능 파일과 `src/lib/api-types.ts` 를 함께 바꾸고 `npm run smoke` 로 확인한다.
- 예시 코드(`lambda/jojo_practice/samples.py`)를 바꾸면 `npm run verify` 를 통과시킨다 (실제 실행).
- 화면 문구는 한국어 존댓말("~해요"), 초보자 눈높이. 디자인은 공부 노트(줄 공책·여백선·형광펜·포스트잇·빨간펜·도장·인덱스 탭), 그라데이션·둥근 카드·이모지·파란 버튼은 쓰지 않는다. ○△✕⬚ 는 늘 빨간펜 그림(`ui.tsx` 의 `PenMark`, 문장은 `MarkText`)으로.
- AWS 는 Lambda 3개(실행 역할 SafeRole, VPC 없음, Python 3.14 arm64, 계층 `jojo_libs`) + DynamoDB `jojo_table` + Bedrock Claude Haiku 4.5(us-east-1)만. S3 등은 요청 없이 넣지 않는다. 학교 계정은 IAM 역할 만들기가 막혀 있다. 비밀 값은 코드·문서에 쓰지 않는다.

## 명령
```bash
npm run setup:python   # 처음 한 번: .venv 에 Lambda 라이브러리(lambda/requirements.txt) + boto3
npm run api            # Lambda 3개 http://localhost:8787 (DynamoDB 흉내 + 목업 AI)
npm run dev            # 화면 http://localhost:3000
npm run typecheck      # 타입 검사
npm test               # 단위 테스트 (TS + Python)
npm run verify         # 예시 코드 실제 실행 + 흐름 단위 확인
npm run build          # 정적 화면 빌드 (out/)
npm run smoke          # Lambda 전체 흐름 점검 (Lambda 를 바꿨다면)
npm run layer          # 레이어 zip (라이브러리를 바꿀 때만)
```
작업을 마치기 전에 위 네 가지(typecheck, test, verify, build)를 모두 통과시키세요. Lambda 를 바꿨다면 smoke 도.

# 문항 생성·검증 실험 (논문 표 1)

`scripts/experiment_generation.py` 는 **서비스와 같은 Lambda 코드**(`lambda/api/practice.make_code`)로 연습 문항을 만들면서 단계마다 결과를 기록합니다. 서비스 코드는 바꾸지 않고, 단계 함수(규칙 검사 · 교차 검토 · AI 호출)를 감싸서 결과만 옆에 적습니다.

- 문항: 언어 2(Python · JavaScript) × 난이도 4 × 5회 = **40문항**. 주제는 서비스의 랜덤 주제 목록(고급은 알고리즘 주제)에서 고르고, `--seed` 가 같으면 같은 순서
- 실험 중에는 요청 수 한도(1시간 30번)만 끄고, 월 예산 확인·AI 사용량 기록(관리자 화면)은 서비스와 똑같이 동작
- 비용: Claude Haiku 4.5 로 40문항 약 **1~3달러** (이번 달 사용량에 더해짐 — 관리자 화면에서 남은 예산 확인) · 시간: 4개씩 동시에 **약 10~20분**

## 결과 파일 (`experiment_out/<시각>/`)

| 파일 | 내용 |
|---|---|
| `summary.md` | **표 1 값**, 참고 값(두 번째 시도 포함 비율·토큰), 언어·난이도별 표, 검출 사례, 항목 정의 |
| `results.csv` | 문항별 한 줄 (엑셀에서 열기) — 시도별 규칙 검사·교차 검토 문제, 교정 수, 최종 origin, 시간, 토큰 |
| `results.jsonl` | 모든 단계 기록 (코드·※ 지점·모범 설명 포함). 중간에 끊겨도 여기까지는 남음 |
| `verify.md` | 무작위 AI 문항 10개: 코드 + **실제 실행 출력** + ※ 모범 설명. 연구진이 `일치/불일치` 표시 |
| `verify_code/` | 그 10문항의 코드 파일 (직접 다시 실행해 볼 수 있음) |

## 표 1 항목 정의

| 항목 | 세는 방법 |
|---|---|
| 규칙 검사 재생성 판정 | 첫 생성 결과가 규칙 검사(ast 문법·정의 안 된 이름·금지 모듈/함수, JS 괄호·따옴표·금지 기능, 줄 수, ※ 줄 위치)에 걸린 문항 / 40 |
| 교차 검토 재생성 판정 | 첫 생성이 규칙 검사는 통과했지만 교차 검토가 실행 오류·난이도 불일치를 찾은 문항 / 40 |
| 교차 검토의 모범 설명 교정 | 최종 제공된 AI 문항에서 교체된 ※ 모범 설명 수 / 그 문항들의 ※ 지점 총수 (재생성으로 버려진 시도의 교정은 세지 않음) |
| AI 문항 최종 제공 · 예시 코드 대체 | 최종 결과가 AI 문항(`origin: ai`) / 예시 코드(`origin: sample`)인 문항 / 40 (둘을 더하면 100%) |
| 모범 설명 실행 확인 | `verify.md` 의 10문항 중 ※ 설명이 모두 실제 실행과 맞는 문항 수 (연구진 판정) |
| 문항당 평균 생성 시간 | 요청부터 최종 결과까지 (출제·검사·검토·재생성 포함), 평균과 중앙값 |

## AWS CloudShell 에서 실행하기

CloudShell 은 AWS 콘솔에서 바로 여는 터미널이에요. 로그인한 계정의 권한으로 Bedrock·DynamoDB 를 부르고, git·node 가 들어 있어요.

1. AWS 콘솔 → 오른쪽 위 리전 **서울(ap-northeast-2)** → 위쪽 막대의 **CloudShell** 아이콘(`>_`)
2. Python 3.11 준비 (기본 python3 는 3.9 라서 Lambda(3.13)의 문법 검사와 다를 수 있어요)
   ```bash
   sudo dnf install -y python3.11 python3.11-pip
   python3.11 -m pip install --user boto3
   ```
3. 저장소 받기
   ```bash
   git clone https://github.com/torgeleli22-lang/teamProject_night_first.git
   cd teamProject_night_first
   ```
4. 먼저 작게 시험 (8문항, 수십 센트)
   ```bash
   python3.11 scripts/experiment_generation.py --reps 1
   ```
   `✗ AI 를 부를 수 없어요` 가 나오면 CloudShell 계정에 Bedrock(us-east-1) 호출 권한이 없거나, 월 예산·관리자 AI 끄기에 걸린 거예요.
5. 본 실험 (40문항) — 화면을 닫아도 계속 돌도록 `nohup`
   ```bash
   nohup python3.11 scripts/experiment_generation.py > exp.log 2>&1 &
   tail -f exp.log          # 진행 보기 (Ctrl+C 로 보기만 멈춤)
   ```
   CloudShell 은 한동안 입력이 없으면 세션이 끝나 실행이 멈출 수 있어요. 그때는 같은 폴더로 이어서 하면 이미 만든 문항은 건너뜁니다:
   ```bash
   python3.11 scripts/experiment_generation.py --resume experiment_out/<시각>
   ```
6. 결과 내려받기
   ```bash
   cd experiment_out && zip -r ../experiment_result.zip . && cd ..
   ```
   CloudShell 오른쪽 위 **작업(Actions) → 파일 다운로드** → `teamProject_night_first/experiment_result.zip`
7. `verify.md` 를 열어 10문항의 ※ 설명을 실제 실행 출력과 비교해 `일치/불일치` 를 표시하고, "모범 설명 실행 확인" 칸을 채웁니다.

## 옵션

| 옵션 | 기본 | 뜻 |
|---|---|---|
| `--reps` | 5 | 언어·난이도마다 문항 수 (5 → 40문항) |
| `--workers` | 4 | 동시에 만들 문항 수 (늘리면 빨라지지만 Bedrock 요청 한도에 걸릴 수 있음) |
| `--seed` | 2026 | 주제 순서·확인 문항 고르기 |
| `--verify` | 10 | 실행 확인할 AI 문항 수 |
| `--resume` | — | 이어서 할 결과 폴더 |
| `--offline-db` | — | DynamoDB 없이 (예산 확인·사용량 기록 생략) — 내 컴퓨터에서 스크립트 확인용 |

Lambda 환경 변수에서 `MODEL_ID` 를 바꿔 쓰고 있다면 실험도 같은 값으로: `MODEL_ID=… python3.11 scripts/experiment_generation.py`

비용 없이 스크립트만 확인: `AI_MODE=mock MOCK_DELAY_SEC=0 python3 scripts/experiment_generation.py --offline-db --reps 1`

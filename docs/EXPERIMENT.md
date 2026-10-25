# 문항 생성·검증 실험 (논문 표 1)

연습 모드와 **같은 코드**(`practice.make_code`)로 문항을 만들면서 단계마다 결과를 기록합니다. 단계 기록은 Lambda 기능 파일 `lambda/api/experiment.py`(관리자 경로 `POST /admin/experiment`)가 하고, `scripts/experiment_generation.py` 가 이 경로를 40번 불러 결과를 모아 표 1 을 계산합니다. 서비스 코드는 바꾸지 않고 단계 함수(규칙 검사 · 교차 검토 · AI 호출)를 감싸서 기록만 하며, 실험이 아닌 요청에는 아무 영향이 없습니다.

- 문항: 언어 2(Python · JavaScript) × 난이도 4 × 5회 = **40문항**. 주제는 서비스의 랜덤 주제 목록(고급은 알고리즘 주제)에서 고르고, `--seed` 가 같으면 같은 순서
- 실험 문항은 저장하지 않아요 (학습자 기록과 섞이지 않게). AI 사용량은 관리자 화면 비용에 그대로 잡혀요
- 실험 중에는 요청 수 한도(1시간 30번)만 건너뛰고, 월 예산 확인·AI 끄기는 서비스와 똑같이 동작
- 실행 환경 = 서비스 환경: Lambda(Python 3.13) · 실행 역할의 Bedrock 권한 · 같은 모델(`MODEL_ID`)
- 비용: Claude Haiku 4.5 로 40문항 약 **3~6달러** (교차 검토의 생각 토큰 포함, 관리자 화면에서 남은 예산 확인) · 시간: 4개씩 동시에 **약 15~30분**

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
| 모범 설명 실행 확인 | `verify.md` 의 10문항 중 ※ 설명이 모두 실제 실행과 맞는 문항 수 (연구진 판정). Math.random·지금 시각을 쓴 코드는 실행마다 출력이 달라질 수 있어서, 값이 아니라 흐름이 맞는지로 판정 |
| 문항당 평균 생성 시간 | 요청부터 최종 결과까지 (출제·검사·검토·재생성 포함), 평균과 중앙값 |

## 실행하기

### 0. Lambda 에 실험 경로 넣기 (한 번)
제한 시간은 **10분**이어야 해요 (구성 → 일반 구성 — 중급·고급 코드는 한 번에 1~2분, 다시 만들면 두 배).
콘솔 `jojo_api_py` 코드 탭에서
- **새 파일 `experiment.py`** 를 만들고 GitHub main 의 `lambda/api/experiment.py` 를 Raw 로 붙여넣기
- **`lambda_function.py`** 를 main 의 것으로 바꾸기 (`import experiment` 와 경로 표 한 줄이 더해짐)
- **Deploy**

### 1. AWS CloudShell 열기
AWS 콘솔 → 리전 **서울(ap-northeast-2)** → 위쪽 막대의 **CloudShell** 아이콘(`>_`). (내 컴퓨터 터미널에서 해도 돼요 — Python 3 만 있으면 됨, boto3 불필요)

### 2. 저장소 받기 (이미 받았다면 최신으로)
```bash
git clone https://github.com/torgeleli22-lang/teamProject_night_first.git
cd teamProject_night_first
git pull
```

### 3. 먼저 작게 시험 (8문항, 수십 센트)
```bash
python3.11 scripts/experiment_generation.py --url https://<함수 URL> --reps 1
```
`관리자 코드:` 가 나오면 입력하고 Enter (입력해도 화면에 보이지 않아요).

### 4. 본 실험 (40문항)
화면을 닫아도 계속 돌도록 관리자 코드를 환경 변수로 주고 `nohup` 으로 실행:
```bash
read -s -p "관리자 코드: " EXPERIMENT_ADMIN_CODE; export EXPERIMENT_ADMIN_CODE; echo
nohup python3.11 scripts/experiment_generation.py --url https://<함수 URL> > exp.log 2>&1 &
tail -f exp.log          # 진행 보기 (Ctrl+C 로 보기만 멈춤)
```
CloudShell 세션이 끝나 멈추면, 같은 폴더로 이어서 (이미 만든 문항은 건너뜀):
```bash
python3.11 scripts/experiment_generation.py --url https://<함수 URL> --resume experiment_out/<시각>
```

### 5. 결과 내려받기
```bash
cd experiment_out && zip -r ../experiment_result.zip . && cd ..
```
CloudShell 오른쪽 위 **작업(Actions) → 파일 다운로드** → `teamProject_night_first/experiment_result.zip`

### 6. 모범 설명 실행 확인
`verify.md` 를 열어 10문항의 ※ 설명을 실제 실행 출력과 비교해 `일치/불일치` 를 표시하고, 표 1 의 "모범 설명 실행 확인" 칸을 채웁니다. (코드는 `verify_code/` 에 있어 다시 실행해 볼 수 있어요)

### 다른 방법: 이 컴퓨터에서 직접 (`--local`)
Bedrock·DynamoDB 권한이 있는 AWS 계정이면 Lambda 없이 실행할 수 있어요 (Python 3.10 이상 + boto3).
학교 계정의 CloudShell 사용자에게는 Bedrock 권한이 없어서 `AccessDeniedException` 이 나요 — 그때는 위의 `--url` 방식으로.
```bash
python3.11 -m pip install --user boto3
python3.11 scripts/experiment_generation.py --local
```

## 옵션

| 옵션 | 기본 | 뜻 |
|---|---|---|
| `--url` | — | Lambda 함수 URL — 이 Lambda 에서 만든다 (권장) |
| `--local` | — | 이 컴퓨터에서 Lambda 코드를 직접 실행 (AWS 권한 필요) |
| `--reps` | 5 | 언어·난이도마다 문항 수 (5 → 40문항) |
| `--workers` | 4 | 동시에 만들 문항 수 (늘리면 빨라지지만 Bedrock 요청 한도에 걸릴 수 있음) |
| `--seed` | 2026 | 주제 순서·확인 문항 고르기 |
| `--verify` | 10 | 실행 확인할 AI 문항 수 |
| `--resume` | — | 이어서 할 결과 폴더 |
| `--offline-db` | — | `--local` 과 함께: DynamoDB 없이 (예산 확인·사용량 기록 생략) — 스크립트 확인용 |

관리자 코드는 `EXPERIMENT_ADMIN_CODE` 환경 변수로도 줄 수 있어요 (명령 줄에 직접 쓰지 마세요 — 기록에 남아요).

비용 없이 스크립트만 확인: `AI_MODE=mock MOCK_DELAY_SEC=0 python3 scripts/experiment_generation.py --local --offline-db --reps 1`
내 컴퓨터의 흉내 Lambda 로 확인: `npm run api` 를 켠 뒤 `EXPERIMENT_ADMIN_CODE=x python3 scripts/experiment_generation.py --url http://localhost:8787 --reps 1`

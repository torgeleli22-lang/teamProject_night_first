# 코드 생성·검증 실험

서비스와 똑같이 `POST /practice` 로 코드를 만들고, 관리자 코드(`x-admin-token`)로 **단계별 기록**을 함께 받아 모아요.
기준은 [`docs/GENERATION_STANDARD.md`](GENERATION_STANDARD.md).

- 문항: 언어 2(Python·JavaScript) × 난이도 3(초급·중급·고급) × 반복 5 = **30문항** (기본값)
- 비용: 문항당 몇 센트 (생성·검토 2번이 보통) → 30문항이면 1~3달러

## 실행 (AWS CloudShell)
1. `jojo_practice` 에 최신 코드를 붙여넣고, 환경 변수 `ADMIN_TOKEN` 을 넣어 둬요 (DEPLOY_LAMBDA.md 3)
2. CloudShell (리전 서울):
```bash
cd ~/teamProject_night_first && git pull            # 처음이면: git clone https://github.com/torgeleli22-lang/teamProject_night_first.git
python3 scripts/experiment_generation.py --url https://<jojo_practice 함수 URL>
```
관리자 코드를 물어보면 `ADMIN_TOKEN` 값을 넣어요 (화면에 보이지 않아요). CloudShell 기본 `python3` 로 돼요.
- 오래 걸리면: `nohup python3 scripts/experiment_generation.py --url … > exp.log 2>&1 &` (관리자 코드는 `EXPERIMENT_ADMIN_CODE` 환경 변수로)
- 끊겼으면: 같은 명령에 `--resume experiment_out/<시각>`
- 결과 내려받기: CloudShell → 작업 → 파일 다운로드 → `teamProject_night_first/experiment_out/<시각>/summary.md`

## 옵션
| 옵션 | 기본 | 뜻 |
|---|---|---|
| `--url` | — | `jojo_practice` 함수 URL |
| `--reps` | 5 | 언어·난이도마다 문항 수 (5 → 30문항) |
| `--workers` | 4 | 동시에 만들 문항 수 |
| `--seed` | 2026 | 주제 순서·확인 문항 고르기 |
| `--verify` | 10 | verify.md 에 넣을 AI 문항 수 |
| `--resume` | — | 이어서 할 결과 폴더 |

내 컴퓨터(목업, 비용 없음): `ADMIN_TOKEN=x npm run api` 를 켜 두고 `EXPERIMENT_ADMIN_CODE=x python3 scripts/experiment_generation.py --url http://localhost:8787 --reps 1`

## 결과 (`experiment_out/<시각>/`)
| 파일 | 내용 |
|---|---|
| `summary.md` | 결과 표 + 언어·난이도별 표 + 작업별로 쓴 모델 |
| `results.csv` · `results.jsonl` | 문항마다 단계 기록 (생성·규칙 검사·검토 판정·부분 수정·다시 만들기·AI 호출과 토큰) |
| `verify.md` | 무작위 AI 문항: 코드 + 실제 실행 출력 + 검토 기록·모범 설명 — 연구진이 일치 여부 표시 |
| `run_code/` | AI 문항 코드 파일 (직접 다시 실행해 볼 수 있음) |

## 결과 표 항목
| 항목 | 세는 방법 |
|---|---|
| AI 문항 최종 제공 | 최종 결과가 AI 코드(`origin: ai`)인 문항 / 전체 (나머지는 예시 코드) |
| 첫 생성 그대로 통과 | 부분 수정·다시 만들기 없이 첫 생성이 끝까지 통과한 문항 |
| 규칙 검사 1에 걸림 | 첫 생성이 문법 오류·정의 안 된 이름에 걸린 비율 |
| 검토: 동작하지 않음 · 난이도 맞음 · 함수·반복문을 빠뜨림 | 첫 검토 답 기준 |
| 부분 수정 · 다시 만든 문항 | 문항 수 |
| AI 문항이 실제로 오류 없이 실행됨 | 이 컴퓨터에서 실제로 실행(15초 제한, 입력 없음) |
| 검토 출력 = 실제 출력 | 두 번 실행해 출력이 같은 코드만 (랜덤·시각을 쓰면 빼요), 줄바꿈·띄어쓰기 차이는 같다고 봐요 |
| 출력 판정 | 검토 2개(검토 1 Luna · 검토 2 초급·중급 Haiku, 고급 Luna)가 같음 · 2:1 로 정해 제공(검토 1 쪽 · 검토 2 쪽) · 셋 다 다르거나 정하지 못해 버림 (진행 줄의 '확인 ✓ ①2:1 ②2:1 ✗') |
| 검토 2개가 달랐을 때 실제로 맞은 쪽 | 그 시도의 코드를 실제로 실행해 세 의견(검토 1 · 검토 2 · 생성 AI 예상 출력)이 각각 맞았는지, 2:1 로 정한 출력이 맞았는지 (`run_disputes/`) |
| 검토 출력의 줄 단위 일치율 | 실제 출력 줄 중 검토가 같은 순서로 맞힌 비율 — 한 글자·한 줄 차이와 크게 틀린 것을 구분 |
| 손으로 따라가기에 너무 큼 · 실제 출력 줄 수 | 첫 검토 기록의 반복 횟수·출력 줄이 생성 기준 3.1 의 선을 넘은 비율 · AI 문항을 실제 실행한 출력 줄 수 |
| 문항당 AI 호출 · 비용 · 시간 | 평균 (비용: 호출마다 그 모델의 가격 — 검토를 다른 모델로 바꾸면 그 값으로) |
| 언어·난이도별의 '검토가 본 난이도' | 첫 검토의 종합 난이도 — 요청한 난이도와 얼마나 맞는지 |

## 생성 기록 지침의 효과 (GENERATION_STANDARD 8장)
`jojo_practice` 의 환경 변수 `HISTORY_HINTS` 를 `off` 로 두고 한 번, 지우고(켜고) 한 번, 같은 `--seed` 로 돌려 '예시 코드 대체'·'첫 생성 그대로 통과'·'출력 판정: 검토 2개가 같음'을 비교해요.
지침은 같은 언어·난이도의 기록이 5개 이상 쌓여야 나와요 (요약표의 '생성 기록 지침을 받은 문항').

## 검토 모델 비교
`jojo_practice` 의 `REVIEW_MODEL_ID` 만 바꿔 가며 같은 명령(같은 `--seed`)을 돌리면 같은 주제·언어·난이도로 비교돼요. 시작할 때 `✓ 함수 연결 확인 (… 생성 … · 검토 …)` 에 지금 모델이 보여요.

# 콘솔에 붙여넣을 Lambda 함수 6개

함수 이름별 폴더에 **그 함수에 붙여넣을 파일만** 있어요. 폴더를 열면 아래쪽에 그 함수의 설정 안내(README)가 보여요.
폴더의 `.py` 는 원본(`lambda/api` · `lambda/functions`)을 `npm run package` 가 복사한 것이라 **여기서 고치지 않아요**. 구조 기준: [`docs/LAMBDA_STRUCTURE.md`](../../docs/LAMBDA_STRUCTURE.md)

| 순서 | 함수 | 하는 일 | 붙여넣을 파일 | 제한 시간 · 메모리 | 이 함수에만 넣는 환경 변수 |
|---|---|---|---|---|---|
| 1 | [`jojo_auth`](jojo_auth/) | 로그인·현재 학습자 | 3개 | 15초 · 256MB | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| 2 | [`jojo_practice`](jojo_practice/) | 연습 코드 만들기·주제 | 8개 | 10분 · 512MB | — |
| 3 | [`jojo_inspect`](jojo_inspect/) | 내 코드 점검 | 5개 | 2분 · 512MB | — |
| 4 | [`jojo_review`](jojo_review/) | 첨삭·다시 쓰기·AI 튜터·코드 다시 열기 | 7개 | 3분 · 512MB | — |
| 5 | [`jojo_study`](jojo_study/) | 내 공부 (AI 없음) | 3개 | 30초 · 256MB | — |
| 6 | [`jojo_admin`](jojo_admin/) | 관리자 화면·논문 실험 | 9개 | 10분 · 512MB | `ADMIN_TOKEN` |

## 0. 라이브러리 레이어 만들기 (처음 한 번)
코드가 외부 라이브러리(Powertools · Pydantic · tree-sitter)를 써서, 라이브러리를 **레이어** 하나로 올리고 6개 함수에 붙여요.
1. 이 폴더의 [`jojo_libs_layer.zip`](jojo_libs_layer.zip) 를 열고 **Download raw file**(다운로드 단추) 로 내려받기
2. Lambda → 왼쪽 **계층(Layers)** → **계층 생성**
   - 이름 `jojo_libs` · **.zip 파일 업로드** → 내려받은 파일
   - 호환 아키텍처 **arm64** · 호환 런타임 **Python 3.14** → 생성
3. 라이브러리 버전이 바뀌면(`lambda/requirements.txt`) 같은 이름으로 새 버전을 올리고, 함수마다 계층 버전을 바꿔요

## 1. 함수 6개 만들기
위 표의 폴더를 하나씩 열어 README 순서대로: 함수 만들기 → 파일 붙여넣기 → 구성(제한 시간·메모리 · 계층 `jojo_libs` · 환경 변수 · 함수 URL) → `/health` 확인

## 2. 화면에 연결
GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables** → **New repository variable**
- 이름 **`API_URLS`**, 값은 아래 모양으로 (함수 URL 끝의 `/` 는 빼고):
  ```json
  {"auth": "<jojo_auth 함수 URL>", "practice": "<jojo_practice 함수 URL>", "inspect": "<jojo_inspect 함수 URL>", "review": "<jojo_review 함수 URL>", "study": "<jojo_study 함수 URL>", "admin": "<jojo_admin 함수 URL>"}
  ```
- 함수 URL 앞뒤에 `< >` 를 붙이지 않아요 (주소는 `https://` 로 시작해야 해요)
- **Actions → Deploy web (GitHub Pages) → Run workflow** 로 화면 다시 배포 → 연습·첨삭·내 코드 점검·내 공부·관리자 화면 확인

## 3. Google 로그인 (쓰고 있다면)
Google Cloud Console → 사용자 인증 정보 → OAuth 클라이언트 → **승인된 리디렉션 URI** 에 `<jojo_auth 함수 URL>auth/callback/google` 추가

## 코드가 바뀌면
GitHub 의 커밋에서 **`lambda/console/<함수 이름>/` 안의 바뀐 파일**만 그 함수에 다시 붙여넣고 **Deploy** 해요 (공통 조각 `core.py` 등이 바뀌면 그 파일이 있는 함수 모두).
`jojo_libs_layer.zip` 이 바뀌었으면 0번처럼 레이어 새 버전을 올려요.

> CloudShell 을 쓸 수 있으면 `npm run deploy -- setup` 이 함수 만들기·환경 변수·함수 URL 을 한 번에 해요 (그때는 라이브러리가 함수 zip 에 함께 들어가서 레이어가 없어도 돼요) — [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md)

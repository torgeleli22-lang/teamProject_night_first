"""
콘솔에 붙여넣을 파일을 함수 이름별 폴더로 (npm run package 가 함께 만들어요). 표는 lambda/functions.json 하나예요.

  lambda/console/README.md              순서: 레이어 한 번 → 함수 6개 → 화면 주소
  lambda/console/jojo_libs_layer.zip    레이어 (라이브러리 Powertools·Pydantic·tree-sitter, Lambda Python 3.14 · arm64 용)
  lambda/console/<함수 이름>/            그 함수에 붙여넣을 파일 + README.md (함수 설정·환경 변수·확인 방법)

폴더의 .py 는 원본(lambda/api · lambda/functions)을 그대로 복사한 것이라 여기서 고치지 않아요.
원본을 고쳤는데 다시 만들지 않으면 npm test 가 알려 줘요 (lambda/tests/test_console.py).
"""
import os
import shutil
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import package_lambdas as pkg  # noqa: E402

SPEC = pkg.SPEC
CONSOLE = os.path.join(pkg.LAMBDA, "console")
LAYER = "jojo_libs"
LAYER_ZIP = f"{LAYER}_layer.zip"
ROLE = "SafeRole-sgu-202688"
SHARED = ("core.py", "ai.py", "code_store.py")
ABOUT = {
    "lambda_function.py": "**입구** — 이 함수의 경로 표 (처음부터 있는 파일이에요. 내용을 전부 바꿔요)",
    "core.py": "공통 조각: 설정·요청/응답·DynamoDB·요청 수 제한·학습자·AI 끄기 스위치",
    "ai.py": "공통 조각: AI 호출(`ask_ai`)·월 예산·사용량 기록·AI 답의 모양",
    "code_store.py": "공통 조각: 읽을 코드 저장·꺼내기·화면으로 보낼 모양",
    "auth.py": "Google 로그인 · 로그인 토큰 · 익명 기록 옮기기",
    "practice.py": "연습 코드 만들기 (출제 → 규칙 검사 → 실행 추적표 → 교차 검토)",
    "topics.py": "주제 고르기 (랜덤 · 직접 적은 주제 판정)",
    "samples.py": "AI 를 쓸 수 없을 때의 예시 코드(Python) · 랜덤 주제",
    "samples_js.py": "AI 를 쓸 수 없을 때의 예시 코드(JavaScript)",
    "inspect_code.py": "내 코드 점검 (민감 정보 가리기 · 함수 찾기 · 난이도·※ 지점)",
    "review.py": "빨간펜 첨삭 · 힌트 보고 다시 쓰기 · 코드 다시 열기",
    "tutor_chat.py": "첨삭 뒤 AI 튜터 대화",
    "study.py": "내 공부 (난이도 추천 · 개념별 약점 · 설명 노트)",
    "admin.py": "관리자 화면 (AI 사용량·비용·AI 끄기·관리자 코드)",
    "experiment.py": "논문 실험 (문항 하나를 만들고 단계 기록)",
}
# 공통 환경 변수: 꼭 넣을 것 (값은 6개 함수 모두 같게 — 비밀 값이 아닌 것만 예로 적어요)
REQUIRED_ENV = {"TABLE_NAME": "jojo_table", "TTL_ATTR": "jojo_ttl", "AI_MODE": "live", "ALLOWED_ORIGINS": "https://torgeleli22-lang.github.io",
                "AI_MONTHLY_BUDGET_USD": "10"}
SECRET_ENV = {"GOOGLE_CLIENT_SECRET", "ADMIN_TOKEN"}
ENV_NOTE = {"GOOGLE_CLIENT_ID": "Google 로그인 (없으면 로그인 버튼이 안 보여요)", "GOOGLE_CLIENT_SECRET": "Google 로그인 — **비밀 값, 이 함수에만**",
            "AUTH_CALLBACK_BASE": "보통 비워 둬요 (넣지 않음)", "ADMIN_TOKEN": "관리자 복구 코드 — **비밀 값, 이 함수에만**"}


def functions():
    return SPEC["functions"]


def files_of(f):
    """[(붙여넣을 파일 이름, 원본 경로)] — 입구 → 기능 파일 → 공통 조각 순서"""
    own = [n for n in f["files"] if n not in SHARED]
    shared = [n for n in SHARED if n in f["files"]]
    return [("lambda_function.py", os.path.join(pkg.LAMBDA, f["entry"]))] + \
           [(n, os.path.join(pkg.LAMBDA, "api", n)) for n in own + shared]


def duration(seconds):
    return f"{seconds // 60}분" if seconds >= 60 and seconds % 60 == 0 else f"{seconds}초"


def function_readme(f):
    files = files_of(f)
    routes = ", ".join(f"`{p}`" for p in f["paths"])
    rows = "\n".join(f"| {i} | [`{name}`]({name}) | {ABOUT[name]} |" for i, (name, _) in enumerate(files, 1))
    env = "\n".join(f"| `{k}` | `{v}` |" for k, v in REQUIRED_ENV.items())
    own_env = "\n".join(f"| `{k}` | {ENV_NOTE[k]} |" for k in f["env"])
    return f"""# {f['name']} — {f['about']}

> 이 폴더의 `.py` 는 **자동으로 만든 복사본**이에요 (원본: `lambda/api` · `lambda/functions`). 여기서 고치지 말고 원본을 고친 뒤 `npm run package`.
> 화면이 이 함수로 보내는 경로: {routes}{' (`/health` 연결 확인도 여기로)' if f['key'] == 'auth' else ''}

## 1. 함수 만들기 (Lambda → 함수 생성 → 새로 작성)
| 항목 | 값 |
|---|---|
| 함수 이름 | `{f['name']}` |
| 런타임 | **Python 3.14** |
| 아키텍처 | **arm64** |
| 실행 역할 | 기본 실행 역할 변경 → 기존 역할 사용 → `{ROLE}` |

## 2. 코드 붙여넣기 (코드 탭) — 파일 {len(files)}개
| 순서 | 파일 | 하는 일 |
|---|---|---|
{rows}

1. 위 파일 이름을 눌러 열고 **Raw** → 전체 선택·복사
2. 콘솔 코드 탭: `lambda_function.py` 는 이미 있는 파일의 내용을 전부 바꾸고, 나머지는 **File → New File** → 이름을 **그대로** 저장 → 붙여넣기
3. 다 넣었으면 **Deploy**

## 3. 구성
- **일반 구성 → 편집**: 제한 시간 **{duration(f['timeout'])}**, 메모리 **{f['memory']}MB**
- **계층(Layers) → 계층 추가 → 사용자 지정 계층 → `{LAYER}`** (가장 최근 버전) — 라이브러리(Powertools·Pydantic·tree-sitter)가 들어 있어요. 처음 한 번 만드는 법: [`../README.md`](../README.md)
- **환경 변수** — 공통 값은 6개 함수 모두 같게 (이미 만든 다른 함수의 구성 → 환경 변수와 같은 값)

  | 키 | 값 |
  |---|---|
{chr(10).join('  ' + line for line in env.split(chr(10)))}
{chr(10).join('  ' + line for line in own_env.split(chr(10))) if own_env else ''}

  선택: 다른 함수에 `MODEL_ID` · `BEDROCK_REGION` · `DB_REGION` · `RATE_LIMIT_*` · `POWERTOOLS_LOG_LEVEL` 이 있으면 같은 값으로
- **함수 URL → 생성**: 인증 유형 **NONE**, **CORS 는 설정하지 않음** (코드가 `ALLOWED_ORIGINS` 로 처리)

## 4. 확인
- **테스트 탭** → 이벤트 `{{"path": "/health", "method": "GET"}}` → 응답 body 에 `"ok": true`
- 브라우저에서 `<함수 URL>health` → 같은 JSON. `{{"Message":"Forbidden"}}` 이면 CloudShell 에서 공개 허용 (이미 있으면 `ResourceConflictException` 은 괜찮음):
  ```bash
  FN={f['name']}
  aws lambda add-permission --region {SPEC['region']} --function-name $FN --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE
  aws lambda add-permission --region {SPEC['region']} --function-name $FN --statement-id FunctionURLAllowInvokeAction --action lambda:InvokeFunction --principal "*" --invoked-via-function-url
  ```
- 함수 URL 을 적어 두세요 → [`../README.md`](../README.md) 의 화면 주소(`API_URLS`)에 넣어요
"""


def top_readme():
    rows = "\n".join(f"| {i} | [`{f['name']}`]({f['name']}/) | {f['about']} | {len(files_of(f))}개 | {duration(f['timeout'])} · {f['memory']}MB | "
                     + (", ".join(f"`{e}`" for e in f["env"] if e != "AUTH_CALLBACK_BASE") or "—") + " |"
                     for i, f in enumerate(functions(), 1))
    urls = ", ".join(f'"{f["key"]}": "<{f["name"]} 함수 URL>"' for f in functions())
    return f"""# 콘솔에 붙여넣을 Lambda 함수 6개

함수 이름별 폴더에 **그 함수에 붙여넣을 파일만** 있어요. 폴더를 열면 아래쪽에 그 함수의 설정 안내(README)가 보여요.
폴더의 `.py` 는 원본(`lambda/api` · `lambda/functions`)을 `npm run package` 가 복사한 것이라 **여기서 고치지 않아요**. 구조 기준: [`docs/LAMBDA_STRUCTURE.md`](../../docs/LAMBDA_STRUCTURE.md)

| 순서 | 함수 | 하는 일 | 붙여넣을 파일 | 제한 시간 · 메모리 | 이 함수에만 넣는 환경 변수 |
|---|---|---|---|---|---|
{rows}

## 0. 라이브러리 레이어 만들기 (처음 한 번)
코드가 외부 라이브러리(Powertools · Pydantic · tree-sitter)를 써서, 라이브러리를 **레이어** 하나로 올리고 6개 함수에 붙여요.
1. 이 폴더의 [`{LAYER_ZIP}`]({LAYER_ZIP}) 를 열고 **Download raw file**(다운로드 단추) 로 내려받기
2. Lambda → 왼쪽 **계층(Layers)** → **계층 생성**
   - 이름 `{LAYER}` · **.zip 파일 업로드** → 내려받은 파일
   - 호환 아키텍처 **arm64** · 호환 런타임 **Python 3.14** → 생성
3. 라이브러리 버전이 바뀌면(`lambda/requirements.txt`) 같은 이름으로 새 버전을 올리고, 함수마다 계층 버전을 바꿔요

## 1. 함수 6개 만들기
위 표의 폴더를 하나씩 열어 README 순서대로: 함수 만들기 → 파일 붙여넣기 → 구성(제한 시간·메모리 · 계층 `{LAYER}` · 환경 변수 · 함수 URL) → `/health` 확인

## 2. 화면에 연결
GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables** → **New repository variable**
- 이름 **`API_URLS`**, 값은 아래 모양으로 (함수 URL 끝의 `/` 는 빼고):
  ```json
  {{{urls}}}
  ```
- 함수 URL 앞뒤에 `< >` 를 붙이지 않아요 (주소는 `https://` 로 시작해야 해요)
- **Actions → Deploy web (GitHub Pages) → Run workflow** 로 화면 다시 배포 → 연습·첨삭·내 코드 점검·내 공부·관리자 화면 확인

## 3. Google 로그인 (쓰고 있다면)
Google Cloud Console → 사용자 인증 정보 → OAuth 클라이언트 → **승인된 리디렉션 URI** 에 `<jojo_auth 함수 URL>auth/callback/google` 추가

## 코드가 바뀌면
GitHub 의 커밋에서 **`lambda/console/<함수 이름>/` 안의 바뀐 파일**만 그 함수에 다시 붙여넣고 **Deploy** 해요 (공통 조각 `core.py` 등이 바뀌면 그 파일이 있는 함수 모두).
`{LAYER_ZIP}` 이 바뀌었으면 0번처럼 레이어 새 버전을 올려요.

> CloudShell 을 쓸 수 있으면 `npm run deploy -- setup` 이 함수 만들기·환경 변수·함수 URL 을 한 번에 해요 (그때는 라이브러리가 함수 zip 에 함께 들어가서 레이어가 없어도 돼요) — [`docs/DEPLOY_LAMBDA.md`](../../docs/DEPLOY_LAMBDA.md)
"""


def layer(path):
    """모든 함수가 쓰는 라이브러리를 레이어 zip 으로 (python/ 아래 — Lambda 가 /opt/python 으로 풀어 불러요)"""
    folder = pkg.install_libs(sorted(pkg.pinned()))
    with zipfile.ZipFile(path, "w") as zf:
        for base, dirs, names in os.walk(folder):
            dirs[:] = sorted(d for d in dirs if d not in ("__pycache__", "bin"))
            for name in sorted(names):
                full = os.path.join(base, name)
                arc = os.path.relpath(full, folder).replace(os.sep, "/")
                if name != ".done" and not any(s in arc for s in pkg.SKIP):
                    pkg.add_file(zf, full, "python/" + arc)


def write_all():
    """lambda/console 을 functions.json 대로 다시 만든다 (없어진 파일은 지움)"""
    os.makedirs(CONSOLE, exist_ok=True)
    keep = {"README.md", LAYER_ZIP} | {f["name"] for f in functions()}
    for name in os.listdir(CONSOLE):
        if name not in keep:
            path = os.path.join(CONSOLE, name)
            shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
    for f in functions():
        folder = os.path.join(CONSOLE, f["name"])
        os.makedirs(folder, exist_ok=True)
        wanted = dict(files_of(f))
        for name in os.listdir(folder):
            if name not in wanted and name != "README.md":
                os.remove(os.path.join(folder, name))
        for name, source in wanted.items():
            shutil.copyfile(source, os.path.join(folder, name))
        with open(os.path.join(folder, "README.md"), "w", encoding="utf-8") as out:
            out.write(function_readme(f))
    with open(os.path.join(CONSOLE, "README.md"), "w", encoding="utf-8") as out:
        out.write(top_readme())
    layer(os.path.join(CONSOLE, LAYER_ZIP))
    size = os.path.getsize(os.path.join(CONSOLE, LAYER_ZIP)) / 1e6
    print(f"✓ 콘솔용 폴더 lambda/console/ (함수 {len(functions())}개 · 레이어 {LAYER_ZIP} {size:.1f}MB)")


if __name__ == "__main__":
    write_all()

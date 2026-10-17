import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
import uuid

from common import (ALLOWED_ORIGINS, LIMITS, LOGIN_DAYS, SESSION_HEADER, SESSION_ID, TTL_ATTR, ApiError, alive, delete_item, get_item,
                    get_learner, hit_limit, keep_seconds, now_ms, put_item, query_all, ttl_after, update_item)

# ─────────────────────────────────────────────────────────────
# 로그인 (auth.py) — jojo_api 의 기능 파일. Google · GitHub OAuth (외부 라이브러리 없이 urllib)
#
#   GET  /me                         지금 학습자: {"member", "name", "provider", "providers": {"google": 쓸 수 있는지, "github": …}}
#   GET  /auth/start?provider=google&return=<돌아갈 화면 주소>&sid=<지금 탭의 학습자 id>
#        → Google·GitHub 로그인 화면으로 보낸다 (302)
#   GET  /auth/callback/google · /auth/callback/github   (Google·GitHub 가 돌려보내는 곳)
#        → 코드를 토큰으로 바꿔 사용자 id·이름을 확인 → 계정의 학습자를 찾거나 만들고 → 로그인 토큰을 붙여 화면으로 (302)
#          화면 주소#login=<로그인 토큰>  (실패하면 #login_error=<이유>)
#   POST /auth/logout                로그인 토큰을 지운다
#
#   DynamoDB: AUTH / <state>(10분) · ACCOUNT / <provider>:<사용자 id> → learnerId · LOGIN / <토큰> → learnerId(30일, 쓰면 늘어남)
#             LEARNER / <learnerId> 에 member: true, name, provider
#   사용자 구분은 이름이 아니라 바뀌지 않는 고유 번호로 한다: Google 의 sub, GitHub 의 id (이름은 화면에 보여 줄 때만, 동명이인도 다른 계정)
#   로그인하면 그 탭에서 하던 기록(내 공부·연습 코드)을 계정으로 옮기고, 보관 기간이 길어진다 (common.keep_seconds)
#
#   환경 변수 (비밀 값은 Lambda 환경 변수에만): GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET · GITHUB_CLIENT_ID · GITHUB_CLIENT_SECRET
#   선택: AUTH_CALLBACK_BASE (콜백 주소의 앞부분, 비우면 함수 URL 도메인으로 만든다)
#   내 컴퓨터(LOCAL_DEV=1)에서 클라이언트 id 가 없으면 '로컬 테스트' 가짜 로그인으로 흐름을 시험할 수 있다
# ─────────────────────────────────────────────────────────────

PROVIDERS = {
    "google": {
        "name": "Google", "id_env": "GOOGLE_CLIENT_ID", "secret_env": "GOOGLE_CLIENT_SECRET",
        "authorize": "https://accounts.google.com/o/oauth2/v2/auth", "token": "https://oauth2.googleapis.com/token",
        "user": "https://openidconnect.googleapis.com/v1/userinfo", "scope": "openid profile",
    },
    "github": {
        "name": "GitHub", "id_env": "GITHUB_CLIENT_ID", "secret_env": "GITHUB_CLIENT_SECRET",
        "authorize": "https://github.com/login/oauth/authorize", "token": "https://github.com/login/oauth/access_token",
        "user": "https://api.github.com/user", "scope": "",
    },
}
STATE_SECONDS = 10 * 60
LOCAL_DEV = os.environ.get("LOCAL_DEV") == "1"


def me(req):
    learner = get_learner(req)
    return {"member": learner["member"], "name": learner.get("name"), "provider": learner.get("provider"),
            "providers": {p: configured(p) or LOCAL_DEV for p in PROVIDERS}}


def start(req):
    # 1. 요청 값 확인: 어느 로그인인지, 끝나고 돌아갈 화면 주소(허용한 화면만), 지금 탭의 학습자(기록을 옮기려고)
    if not hit_limit(f"auth:{req['ip']}", LIMITS["new_sessions_per_ip_hour"], 3600):
        raise ApiError(429, "로그인 시도가 너무 많아요. 잠시 뒤에 다시 시도해 주세요.")
    provider = provider_of(req["query"].get("provider", ""))
    return_to = safe_return(req["query"].get("return", ""))
    sid = req["query"].get("sid", "")

    # 2. 한 번만 쓰는 state 를 저장해 두고 (콜백이 진짜 우리가 보낸 것인지 확인)
    state = secrets.token_urlsafe(24)
    put_item({"pk": "AUTH", "sk": state, "provider": provider, "returnTo": return_to, "anonSid": sid if SESSION_ID.match(sid) else "",
              TTL_ATTR: ttl_after(STATE_SECONDS)})

    # 3. Google·GitHub 로그인 화면으로 (로컬에서 설정이 없으면 바로 가짜 콜백으로)
    redirect_uri = callback_url(req, provider)
    if not configured(provider):
        return {"_redirect": f"{redirect_uri}?{urllib.parse.urlencode({'code': 'local-test', 'state': state})}"}
    p = PROVIDERS[provider]
    query = {"client_id": os.environ[p["id_env"]], "redirect_uri": redirect_uri, "state": state, "response_type": "code"}
    if p["scope"]:
        query["scope"] = p["scope"]
    if provider == "google":
        query["prompt"] = "select_account"
    return {"_redirect": f"{p['authorize']}?{urllib.parse.urlencode(query)}"}


def callback(req, provider):
    # 1. state 확인 (한 번만 쓰고 지운다)
    state = req["query"].get("state", "")
    saved = get_item("AUTH", state) if state else None
    if not saved or not alive(saved) or saved["provider"] != provider:
        raise ApiError(400, "로그인 요청이 만료됐어요. 다시 로그인해 주세요.")
    delete_item("AUTH", state)
    back = saved["returnTo"]
    try:
        if req["query"].get("error"):
            raise ApiError(400, "로그인을 취소했어요.")
        # 2. 코드 → 액세스 토큰 → 사용자 id·이름 (Google·GitHub)
        profile = fetch_profile(req, provider, req["query"].get("code", ""))
        # 3. 계정의 학습자 찾기·만들기 → 이 탭의 기록 옮기기 → 로그인 토큰
        learner_id = account_learner(provider, profile)
        if saved.get("anonSid"):
            adopt_anonymous(saved["anonSid"], learner_id)
        token = str(uuid.uuid4())
        put_item({"pk": "LOGIN", "sk": token, "learnerId": learner_id, "provider": provider, "createdAt": now_ms(),
                  TTL_ATTR: ttl_after(LOGIN_DAYS * 86400)})
        return {"_redirect": f"{back}#{urllib.parse.urlencode({'login': token})}"}
    except ApiError as e:
        return {"_redirect": f"{back}#{urllib.parse.urlencode({'login_error': e.message})}"}


def logout(req):
    sid = req["headers"].get(SESSION_HEADER) or ""
    if SESSION_ID.match(sid) and get_item("LOGIN", sid):
        delete_item("LOGIN", sid)
    return {"ok": True}


ROUTES = {
    "GET /me": me,
    "GET /auth/start": start,
    "GET /auth/callback/google": lambda req: callback(req, "google"),
    "GET /auth/callback/github": lambda req: callback(req, "github"),
    "POST /auth/logout": logout,
}

# ───────────────────────── 도움 함수 ─────────────────────────


def configured(provider):
    p = PROVIDERS[provider]
    return bool(os.environ.get(p["id_env"]) and os.environ.get(p["secret_env"]))


def provider_of(name):
    if name not in PROVIDERS:
        raise ApiError(400, "Google 또는 GitHub 로그인만 할 수 있어요.")
    if not configured(name) and not LOCAL_DEV:
        raise ApiError(400, f"{PROVIDERS[name]['name']} 로그인은 아직 설정되지 않았어요.")
    return name


def safe_return(url):
    """로그인 뒤 돌아갈 주소는 허용한 화면(ALLOWED_ORIGINS)만 — 다른 사이트로 토큰이 새지 않게"""
    parts = urllib.parse.urlsplit(url)
    origin = f"{parts.scheme}://{parts.netloc}"
    allowed = origin in ALLOWED_ORIGINS or (LOCAL_DEV and parts.hostname in ("localhost", "127.0.0.1"))
    if parts.scheme not in ("http", "https") or not allowed:
        raise ApiError(400, "돌아갈 화면 주소를 확인해 주세요.")
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))


def callback_url(req, provider):
    """Google·GitHub 에 등록하는 콜백 주소와 같아야 한다: <함수 URL>/auth/callback/<provider>"""
    base = os.environ.get("AUTH_CALLBACK_BASE", "").rstrip("/")
    if not base:
        base = f"http://{req['host']}" if LOCAL_DEV else f"https://{req['domain'] or req['host']}"
    return f"{base}/auth/callback/{provider}"


def http_json(url, data=None, token=None):
    headers = {"Accept": "application/json", "User-Agent": "code-reading-note"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = urllib.parse.urlencode(data).encode() if data else None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers), timeout=10) as res:
            return json.loads(res.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError) as e:
        print("[auth]", url, repr(e))
        raise ApiError(502, "로그인 서버와 연결하지 못했어요. 잠시 뒤에 다시 시도해 주세요.")


def fetch_profile(req, provider, code):
    """{"id": 고유 번호(Google sub · GitHub id, 계정 구분에 씀), "name": 보여 줄 이름(구분에 쓰지 않음)}. 이메일 등 다른 정보는 받지도 저장하지도 않는다"""
    if not code:
        raise ApiError(400, "로그인 코드가 없어요. 다시 로그인해 주세요.")
    if not configured(provider):   # 로컬 가짜 로그인
        return {"id": "local-test", "name": "로컬 테스트"}
    p = PROVIDERS[provider]
    tokens = http_json(p["token"], {"client_id": os.environ[p["id_env"]], "client_secret": os.environ[p["secret_env"]], "code": code,
                                    "redirect_uri": callback_url(req, provider), "grant_type": "authorization_code"})
    access = tokens.get("access_token")
    if not access:
        print("[auth] 토큰 교환 실패:", provider, tokens.get("error"))
        raise ApiError(400, "로그인을 확인하지 못했어요. 다시 로그인해 주세요.")
    user = http_json(p["user"], token=access)
    uid = user.get("sub") if provider == "google" else user.get("id")
    if not uid:
        raise ApiError(400, "사용자 정보를 받지 못했어요.")
    name = user.get("name") or user.get("given_name") or user.get("login") or PROVIDERS[provider]["name"] + " 사용자"
    return {"id": str(uid), "name": str(name)[:40]}


def account_learner(provider, profile):
    """ACCOUNT / <provider>:<id> → 계정의 학습자 id. 처음이면 로그인 학습자(member)를 만든다"""
    key = f"{provider}:{profile['id']}"
    account = get_item("ACCOUNT", key)
    member = {"member": True}
    if account and get_item("LEARNER", account["learnerId"]):
        update_item("LEARNER", account["learnerId"], set_values={"name": profile["name"], "lastSeen": now_ms(),
                                                                 TTL_ATTR: ttl_after(keep_seconds(member, "learner"))})
        return account["learnerId"]
    learner_id = str(uuid.uuid4())
    put_item({"pk": "LEARNER", "sk": learner_id, "member": True, "name": profile["name"], "provider": provider, "level": None,
              "recentTopics": [], "createdAt": now_ms(), "lastSeen": now_ms(), TTL_ATTR: ttl_after(keep_seconds(member, "learner"))})
    put_item({"pk": "ACCOUNT", "sk": key, "learnerId": learner_id, "createdAt": now_ms()})
    return learner_id


def adopt_anonymous(anon_id, learner_id):
    """로그인하기 전 이 탭에서 한 공부(내 공부 기록·연습 코드·첨삭)를 계정으로 옮기고 보관 기간을 늘린다. 올린 코드는 짧게 그대로"""
    anon = get_item("LEARNER", anon_id)
    if not anon or anon.get("member") or anon_id == learner_id:
        return
    member = {"member": True}
    for row in query_all(f"STUDY#{anon_id}"):
        practice = row.get("source") == "practice"
        reading_ttl = ttl_after(keep_seconds(member, "reading")) if practice else row.get("readingTtl", 0)
        for part in query_all(f"READ#{row['readingId']}"):   # 코드·첨삭·다시 쓰기·튜터 대화
            values = {TTL_ATTR: reading_ttl} if practice else {}
            if part["sk"] == "CODE":
                values["owner"] = learner_id
            if values:
                update_item(part["pk"], part["sk"], set_values=values)
        put_item({**row, "pk": f"STUDY#{learner_id}", "readingTtl": reading_ttl, TTL_ATTR: ttl_after(keep_seconds(member, "study"))})
        delete_item(row["pk"], row["sk"])
    # 로그인 전에 받은 코드(아직 첨삭 전인 것 포함)도 계속 열 수 있게 예전 탭의 id 를 기억한다 (최근 20개)
    member_item = get_item("LEARNER", learner_id) or {}
    former = [i for i in member_item.get("formerIds", []) if i != anon_id][-19:] + [anon_id]
    update_item("LEARNER", learner_id, set_values={"formerIds": former})
    delete_item("LEARNER", anon_id)

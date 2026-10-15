# tutor-chat — 튜터 대화 Lambda (Python)

프론트(GitHub Pages)의 **"튜터에게 질문"** 이 이 Lambda URL 로 JSON 을 보내고, Lambda 가 DynamoDB 와 Bedrock 을 이어 줍니다.

```
화면 ──JSON──▶ Lambda URL (이 함수) ──▶ DynamoDB: 문제 정보 읽기, 대화 기록 읽기·저장
                                      └─▶ Bedrock: Claude Haiku 4.5 로 답변 만들기
       ◀──JSON── { chatId, answer, usage }
```

코드는 `lambda_function.py` 한 파일이에요. 단계마다 번호 주석(1~10)이 있어서 위에서부터 읽으면 흐름이 보여요.
외부 라이브러리 없이 Lambda 에 기본으로 들어 있는 `boto3` 만 써서, **콘솔 코드 탭에 붙여넣기만 하면 됩니다** (zip 필요 없음).

## 주고받는 JSON
보내는 값 (프론트 → Lambda)

| 키 | 뜻 |
|---|---|
| `chatId` | 대화 id. 처음에는 없이 보내면 새로 발급돼요. 같은 문제에서 이어서 물을 때는 받은 값을 그대로 보내요 |
| `codeItemId`, `questionId` | 어느 문제에 대한 질문인지 (문제 정보는 DynamoDB `CONTENT` 항목에서 꺼내요) |
| `question` | 학습자 질문 (500자까지) |
| `solved` | 이미 제출했는지. `false` 면 AI 가 정답을 직접 말하지 않아요 |
| `answerText` | (선택) 학습자의 지금 답. AI 가 이 답을 보고 어디가 다른지 짚어 줘요 |

받는 값 (Lambda → 프론트): `chatId`, `answer`(AI 답변), `usage`(토큰 사용량)

## 콘솔에서 만들기
1. **Lambda → 함수 생성 → 새로 작성**
   - 함수 이름: `jojo-tutor-chat` (예시)
   - 런타임: **Python 3.13**
   - 실행 역할: 기존 역할 사용 → **`SafeRole-sgu-202688`**
2. **코드 탭**: `lambda_function.py` 내용을 통째로 붙여넣고 **Deploy**
3. **구성 → 일반 구성 → 편집**: 제한 시간 **30초**, 메모리 256MB
4. **구성 → 환경 변수**
   | 키 | 값 |
   |---|---|
   | `TABLE_NAME` | `jojo_table` |
   | `TTL_ATTR` | `jojo_ttl` |
5. **구성 → 함수 URL → 함수 URL 생성**
   - 인증 유형: **NONE**
   - **CORS 구성 체크** → 허용 오리진 `https://torgeleli22-lang.github.io`, 허용 헤더 `content-type`, 허용 메서드 `POST`
   - 저장 후 CloudShell 에서 공개 허용 (함수 이름만 바꿔서, 한 줄씩):
     ```bash
     FN=jojo-tutor-chat
     aws lambda update-function-url-config --region ap-northeast-2 --function-name $FN --auth-type NONE
     aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE
     aws lambda add-permission --region ap-northeast-2 --function-name $FN --statement-id FunctionURLAllowInvokeAction --action lambda:InvokeFunction --principal "*" --invoked-via-function-url
     ```

## 콘솔에서 시험하기
**테스트 탭 → 새 이벤트** 에 `test_event.json` 내용을 붙여넣고 **테스트** → 응답의 `body` 에 `chatId` 와 `answer` 가 나오면 성공이에요.
같은 이벤트에 `"chatId": "받은 값"` 을 넣고 질문을 바꿔 한 번 더 보내면, 앞 대화를 기억하고 이어서 답해요.

> 문제 정보는 테이블에 이미 들어 있어야 해요. 지금 쓰는 API Lambda(`jojo_api`)가 처음 실행될 때 문제들을 `CONTENT` 로 넣어 둡니다.

## 화면에 연결하기
GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables** → `TUTOR_CHAT_URL` = 함수 URL (끝의 `/` 빼기)
→ Actions → **Deploy web (GitHub Pages) → Run workflow**.
이 값이 없으면 화면은 지금처럼 `API_URL` 의 `/ask` 로 튜터 질문을 보내요.

## 고칠 만한 곳
| 바꾸고 싶은 것 | 코드 위치 |
|---|---|
| 튜터 말투·규칙 | `SYSTEM_PROMPT` |
| 한 문제에서 물을 수 있는 횟수 (비용 보호) | `MAX_TURNS` |
| 답변 길이 | 7단계 `inferenceConfig` 의 `maxTokens` |
| 대화 기록 보관 기간 | `KEEP_DAYS` (DynamoDB TTL 로 자동 삭제) |
| AI 에게 주는 문제 정보 | `build_prompt` 함수 |

DynamoDB 에 저장되는 대화: `pk = CHAT#<chatId>`, `sk = 시각#role`, `role`, `text`, `jojo_ttl`(자동 삭제 시각).

# 기능별 Lambda (Python)

이 폴더의 Lambda 들은 **콘솔 코드 탭에 붙여넣어 쓰는 읽을 수 있는 코드**예요. 함수마다 파일 하나(`lambda_function.py`)이고, 외부 라이브러리 없이 `boto3` 만 씁니다.
프론트(GitHub Pages)는 기능마다 다른 Lambda URL 로 JSON 을 보내고, Lambda 가 DynamoDB(저장)와 Bedrock(AI)을 이어 줍니다.

| 폴더 | 기능 | 화면 설정 변수 | 상태 |
|---|---|---|---|
| `tutor-chat/` | 튜터에게 질문 (대화 기록 + Bedrock) | `TUTOR_CHAT_URL` | ✅ |

아직 옮기지 않은 기능은 기존 API Lambda(`jojo_api`, `API_URL`)가 처리해요. 하나씩 이 폴더로 옮겨 갈 예정이에요.

**원본은 이 폴더예요.** 콘솔에서 고쳤다면 같은 내용을 이 폴더 파일에도 반영해 주세요 (팀원과 공유, 변경 기록).

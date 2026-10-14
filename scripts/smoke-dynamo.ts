/**
 * DynamoDB 판 API 전체 흐름 점검: 로컬 DynamoDB 흉내 서버(dynalite)를 띄우고 api-smoke 를 그대로 실행한다.
 *   npm run smoke:dynamo        (AI_MODE=mock 이면 AI 경로까지)
 * 테이블은 앱이 처음 쓸 때 자동으로 만든다 (실제 AWS 에서 만드는 것과 같은 구조).
 */
import dynalite from "dynalite";

const port = 8000 + Math.floor(Math.random() * 1000);
const server = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });
server.listen(port, () => {
  process.env.DB_DRIVER = "dynamodb";
  process.env.DYNAMODB_ENDPOINT = `http://127.0.0.1:${port}`;
  process.env.DYNAMODB_TABLE = "codereading-smoke";
  console.log(`DynamoDB(로컬 흉내) : ${process.env.DYNAMODB_ENDPOINT}`);
  void import("./api-smoke");
});

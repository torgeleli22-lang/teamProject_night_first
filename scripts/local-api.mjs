/**
 * 내 컴퓨터에서 Lambda 실행:  npm run api  →  http://localhost:8787
 *
 * 1. DynamoDB 흉내 서버(dynalite)를 메모리에 띄우고 테이블을 만든다 (끄면 데이터는 사라짐)
 * 2. Python 개발 서버(scripts/local_lambdas.py)가 lambda/api 함수를 실제와 같은 이벤트로 부른다
 *
 * 필요한 것: Python 3.10 이상 + boto3 (pip install boto3). AWS 계정·키는 필요 없다.
 * AI 는 기본으로 목업(AI_MODE=mock, 비용 없음). .env 에 AI_MODE 를 적으면 그 값을 쓴다.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import dynalite from "dynalite";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

/** .env 의 KEY=VALUE 줄 (이미 있는 환경 변수가 먼저) */
function readDotEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** 로컬 API 시작 → { url, stop() } */
export async function startLocalApi({ port = 8787, quiet = false, env = {} } = {}) {
  const check = spawnSync(PYTHON, ["-c", "import boto3"], { encoding: "utf8" });
  if (check.status !== 0) {
    throw new Error(`Python 과 boto3 가 필요해요. 설치: ${PYTHON} -m pip install boto3  (Python 경로가 다르면 PYTHON=... 으로 알려 주세요)`);
  }

  // 1. DynamoDB 흉내 서버 + 테이블
  const db = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });
  await new Promise((resolve) => db.listen(0, "127.0.0.1", resolve));
  const dbUrl = `http://127.0.0.1:${db.address().port}`;
  const table = env.TABLE_NAME || process.env.TABLE_NAME || "jojo_table";
  const client = new DynamoDBClient({ region: "ap-northeast-2", endpoint: dbUrl, credentials: { accessKeyId: "local", secretAccessKey: "local" } });
  await client.send(
    new CreateTableCommand({
      TableName: table,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
    }),
  );

  // 2. Python 개발 서버 (jojo_api)
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(PYTHON, [path.join(ROOT, "scripts", "local_lambdas.py")], {
    cwd: ROOT,
    env: {
      ...process.env,
      AI_MODE: "mock",
      ...readDotEnv(),
      ...env,
      PORT: String(port),
      TABLE_NAME: table,
      DYNAMODB_ENDPOINT: dbUrl,
      LOCAL_DEV: "1",
      AWS_ACCESS_KEY_ID: "local",
      AWS_SECRET_ACCESS_KEY: "local",
      AWS_REGION: "ap-northeast-2",
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = (chunk) => {
    if (!quiet) process.stdout.write(chunk);
  };
  child.stdout.on("data", log);
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  // 서버가 뜰 때까지 기다린다
  for (let i = 0; ; i++) {
    if (child.exitCode !== null) throw new Error("Lambda 개발 서버가 시작하지 못했어요 (위 오류를 확인해 주세요)");
    try {
      if ((await fetch(`${url}/health`)).ok) break;
    } catch {
      /* 아직 */
    }
    if (i > 100) throw new Error("Lambda 개발 서버가 응답하지 않아요");
    await new Promise((r) => setTimeout(r, 200));
  }

  return {
    url,
    stop: () => {
      child.kill();
      db.close();
    },
  };
}

// npm run api 로 직접 실행했을 때
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startLocalApi({ port: Number(process.env.PORT || 8787) })
    .then(({ stop }) => {
      for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stop(), process.exit(0)));
    })
    .catch((e) => {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    });
}

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { runTask, type BackgroundRunner, type BackgroundTask } from "./background";
import { handle } from "./router";

/**
 * AWS Lambda 진입점 (함수 URL, 페이로드 2.0 형식).
 * - 일반 요청: 경로별 API 처리 → JSON 응답
 * - { background: task } 이벤트: 응답 뒤에 할 일(AI 생성·학습자 분석)을 이 함수가 따로 실행
 */
interface FunctionUrlEvent {
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
  background?: BackgroundTask;
}

let lambdaClient: LambdaClient | null = null;

/**
 * 같은 함수를 비동기(Event)로 불러서 작업만 따로 실행한다 (사용자는 기다리지 않음).
 * 실행 역할에 lambda:InvokeFunction 권한이 없으면 이 요청 안에서 끝까지 실행한다 (조금 느려질 뿐 동작은 같다).
 */
const invokeSelf: BackgroundRunner = async (task) => {
  const name = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (name && process.env.BACKGROUND_MODE !== "inline") {
    try {
      lambdaClient ??= new LambdaClient({});
      await lambdaClient.send(new InvokeCommand({ FunctionName: name, InvocationType: "Event", Payload: Buffer.from(JSON.stringify({ background: task })) }));
      return;
    } catch (e) {
      console.warn("[background] 비동기 호출 실패, 이 요청 안에서 실행:", e instanceof Error ? e.message : e);
    }
  }
  await runTask(task).catch((e) => console.error("[background]", task.kind, e));
};

export async function handler(event: FunctionUrlEvent) {
  if (event.background) {
    await runTask(event.background);
    return { ok: true };
  }
  const raw = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body) : "";
  let body: unknown = undefined;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      return { statusCode: 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "잘못된 요청 형식이에요." }) };
    }
  }
  const headers = Object.fromEntries(Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const res = await handle(
    {
      method: event.requestContext?.http?.method ?? "GET",
      path: event.rawPath ?? "/",
      query: new URLSearchParams(event.rawQueryString ?? ""),
      headers,
      body,
    },
    invokeSelf,
  );
  return { statusCode: res.status, headers: res.headers, body: res.body };
}

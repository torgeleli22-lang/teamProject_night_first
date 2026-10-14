import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";

/**
 * DynamoDB 저장소 (DB_DRIVER=dynamodb). Lambda 의 실행 역할 권한으로 접속한다 (VPC 불필요).
 *
 * 테이블 하나에 모든 데이터를 담는다 (파티션 키 pk, 정렬 키 sk, 보조 인덱스 없음).
 *   LEARNER / <세션 id>                  학습자 (닉네임, 총 XP·푼 수 → 랭킹)
 *   S#<세션 id> / A#시각, D#날짜, C#개념, N#시각   풀이 기록, 하루 요약, 개념 요약, 학습 분석
 *   CONTENT / <코드 id>                  코드와 문제 (문제는 코드 항목 안에 함께)
 *   JOB / <작업 id>, USAGE / 월#작업#모델, META / 키, STATS / GRADED, DEMAND / 개념#난이도#세션
 *   RL / 키#구간                         요청 제한·관리자 코드 오답 횟수
 * 모든 항목에 ttl(초)을 두면 DynamoDB 가 기한이 지난 항목을 알아서 지운다 (TTL 속성: ttl).
 * TTL 삭제는 최대 이틀까지 늦을 수 있으므로, 읽을 때 기한이 지난 항목은 걸러 낸다.
 */

export const TABLE = process.env.DYNAMODB_TABLE || "codereading";

let doc: DynamoDBDocumentClient | null = null;
let ready: Promise<void> | null = null;

function client(): DynamoDBDocumentClient {
  if (doc) return doc;
  const endpoint = process.env.DYNAMODB_ENDPOINT; // 로컬 테스트용 (dynalite / DynamoDB Local)
  const raw = new DynamoDBClient({
    region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "ap-northeast-2",
    ...(endpoint ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
    maxAttempts: 3,
  });
  doc = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true } });
  return doc;
}

/** 테이블이 없으면 만든다 (권한이 없으면 콘솔에서 만들라고 안내). 인스턴스마다 한 번만 */
export function ensureTable(): Promise<void> {
  ready ??= (async () => {
    const raw = client();
    try {
      await raw.send(new DescribeTableCommand({ TableName: TABLE }));
      return;
    } catch (e) {
      if (!(e instanceof ResourceNotFoundException) && (e as Error).name !== "ResourceNotFoundException") throw e;
    }
    try {
      await raw.send(
        new CreateTableCommand({
          TableName: TABLE,
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
      for (let i = 0; i < 30; i++) {
        const t = await raw.send(new DescribeTableCommand({ TableName: TABLE }));
        if (t.Table?.TableStatus === "ACTIVE") break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      await raw.send(new UpdateTimeToLiveCommand({ TableName: TABLE, TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true } })).catch(() => {});
    } catch (e) {
      throw new Error(
        `DynamoDB 테이블 '${TABLE}' 이 없고 자동으로 만들지 못했어요 (${(e as Error).name}). 콘솔에서 파티션 키 pk(문자열), 정렬 키 sk(문자열)로 만들어 주세요.`,
      );
    }
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export type Item = Record<string, unknown>;

export const nowSec = () => Math.floor(Date.now() / 1000);
/** 정렬 키용 고정 길이 숫자 (문자열 정렬 = 숫자 정렬) */
export const pad = (n: number, width = 16) => String(Math.max(0, Math.floor(n))).padStart(width, "0");
/** 시간순으로 정렬되는 고유 번호 (밀리초 × 1000 + 임의 수) */
export const timeId = (ms = Date.now()) => ms * 1000 + Math.floor(Math.random() * 1000);

export async function getItem<T extends Item>(pk: string, sk: string, consistent = false): Promise<T | null> {
  await ensureTable();
  const r = await client().send(new GetCommand({ TableName: TABLE, Key: { pk, sk }, ConsistentRead: consistent }));
  return (r.Item as T | undefined) ?? null;
}

export async function putItem(item: Item & { pk: string; sk: string }, condition?: string) {
  await ensureTable();
  await client().send(new PutCommand({ TableName: TABLE, Item: item, ...(condition ? { ConditionExpression: condition } : {}) }));
}

export async function deleteItem(pk: string, sk: string) {
  await ensureTable();
  await client().send(new DeleteCommand({ TableName: TABLE, Key: { pk, sk } }));
}

/**
 * 값 갱신. set 은 덮어쓰기, add 는 더하기(없으면 0 에서 시작), remove 는 속성 삭제.
 * condition 이 맞지 않으면 false (ConditionalCheckFailed).
 */
export async function updateItem(
  pk: string,
  sk: string,
  opts: {
    set?: Item;
    add?: Record<string, number>;
    remove?: string[];
    condition?: string;
    conditionNames?: Record<string, string>;
    conditionValues?: Item;
    returnNew?: boolean;
  },
): Promise<{ ok: boolean; attributes?: Item }> {
  await ensureTable();
  const names: Record<string, string> = { ...(opts.conditionNames ?? {}) };
  const values: Item = { ...(opts.conditionValues ?? {}) };
  const parts: string[] = [];
  let i = 0;
  const sets = Object.entries(opts.set ?? {}).filter(([, v]) => v !== undefined);
  if (sets.length) parts.push("SET " + sets.map(([k, v]) => ((names[`#s${i}`] = k), (values[`:s${i}`] = v), `#s${i} = :s${i++}`)).join(", "));
  const adds = Object.entries(opts.add ?? {});
  if (adds.length) parts.push("ADD " + adds.map(([k, v]) => ((names[`#a${i}`] = k), (values[`:a${i}`] = v), `#a${i} :a${i++}`)).join(", "));
  if (opts.remove?.length) parts.push("REMOVE " + opts.remove.map((k) => ((names[`#r${i}`] = k), `#r${i++}`)).join(", "));
  try {
    const r = await client().send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk, sk },
        UpdateExpression: parts.join(" "),
        ExpressionAttributeNames: names,
        ...(Object.keys(values).length ? { ExpressionAttributeValues: values } : {}),
        ...(opts.condition ? { ConditionExpression: opts.condition } : {}),
        ReturnValues: opts.returnNew ? "ALL_NEW" : "NONE",
      }),
    );
    return { ok: true, attributes: r.Attributes };
  } catch (e) {
    if ((e as Error).name === "ConditionalCheckFailedException") return { ok: false };
    throw e;
  }
}

/** 한 파티션을 (조건에 맞게) 끝까지 읽는다. 1MB 단위로 나눠 오는 결과를 이어 붙인다 */
export async function queryAll<T extends Item>(
  pk: string,
  opts: { prefix?: string; from?: string; to?: string; descending?: boolean; limit?: number; consistent?: boolean } = {},
): Promise<T[]> {
  await ensureTable();
  const values: Item = { ":pk": pk };
  let cond = "pk = :pk";
  if (opts.prefix !== undefined && opts.prefix !== "") {
    cond += " AND begins_with(sk, :p)";
    values[":p"] = opts.prefix;
  } else if (opts.from !== undefined && opts.to !== undefined) {
    cond += " AND sk BETWEEN :f AND :t";
    values[":f"] = opts.from;
    values[":t"] = opts.to;
  } else if (opts.from !== undefined) {
    cond += " AND sk >= :f";
    values[":f"] = opts.from;
  }
  const out: T[] = [];
  let start: Item | undefined;
  do {
    const input: QueryCommandInput = {
      TableName: TABLE,
      KeyConditionExpression: cond,
      ExpressionAttributeValues: values,
      ScanIndexForward: !opts.descending,
      ConsistentRead: opts.consistent,
      ...(opts.limit ? { Limit: opts.limit - out.length } : {}),
      ...(start ? { ExclusiveStartKey: start } : {}),
    };
    const r = await client().send(new QueryCommand(input));
    out.push(...((r.Items ?? []) as T[]));
    start = r.LastEvaluatedKey;
  } while (start && (!opts.limit || out.length < opts.limit));
  return out;
}

/** 여러 항목 쓰기·지우기 (25개씩, 처리되지 않은 항목은 다시 보냄) */
export async function batchWrite(ops: ({ put: Item } | { delete: { pk: string; sk: string } })[]) {
  if (!ops.length) return;
  await ensureTable();
  for (let i = 0; i < ops.length; i += 25) {
    let requests = ops.slice(i, i + 25).map((o) => ("put" in o ? { PutRequest: { Item: o.put } } : { DeleteRequest: { Key: o.delete } }));
    for (let attempt = 0; requests.length && attempt < 6; attempt++) {
      const r = await client().send(new BatchWriteCommand({ RequestItems: { [TABLE]: requests } }));
      requests = (r.UnprocessedItems?.[TABLE] ?? []) as typeof requests;
      if (requests.length) await new Promise((res) => setTimeout(res, 100 * 2 ** attempt));
    }
    if (requests.length) throw new Error("DynamoDB 일괄 쓰기를 끝내지 못했어요 (처리량 초과)");
  }
}

/** 고정 구간 카운터: key 의 이번 구간 값을 1 올리고 올린 뒤 값을 돌려준다 (요청 제한·오답 횟수) */
export async function bumpCounter(key: string, windowMs: number, by = 1): Promise<number> {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const r = await updateItem("RL", `${key}#${windowStart}`, {
    add: { n: by },
    set: { ttl: Math.ceil((windowStart + windowMs) / 1000) + 60 },
    returnNew: true,
  });
  return Number(r.attributes?.n ?? 0);
}

export async function readCounter(key: string, windowMs: number): Promise<number> {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  return Number((await getItem<{ n?: number }>("RL", `${key}#${windowStart}`))?.n ?? 0);
}

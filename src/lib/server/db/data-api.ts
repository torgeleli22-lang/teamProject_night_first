import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";
import { normalizeParams, numbered, splitStatements, type Db, type Param } from "./types";

/**
 * Aurora Data API: DB 연결 없이 HTTPS 로 쿼리한다.
 * Lambda 를 VPC 에 넣지 않아도 되고(→ AI API 호출용 인터넷도 그대로), 동시 실행이 늘어도 연결 수 걱정이 없다.
 * 필요: 클러스터에서 Data API 켜기, DB 암호를 담은 Secrets Manager 비밀, 실행 역할에 rds-data·secretsmanager 권한.
 */
interface Config {
  resourceArn: string;
  secretArn: string;
  database: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class DataApiDb implements Db {
  readonly dialect = "postgres" as const;
  constructor(
    private readonly client: RDSDataClient,
    private readonly cfg: Config,
    private readonly transactionId?: string,
  ) {}

  private async execute(sql: string, params?: Param[]) {
    const parameters: SqlParameter[] = normalizeParams(params).map((v, i) => ({
      name: `p${i + 1}`,
      value: v === null ? { isNull: true } : typeof v === "number" ? (Number.isInteger(v) ? { longValue: v } : { doubleValue: v }) : { stringValue: v },
    }));
    const command = new ExecuteStatementCommand({
      ...this.cfg,
      sql: numbered(sql, ":p"),
      parameters,
      formatRecordsAs: "JSON",
      transactionId: this.transactionId,
    });
    // 0 ACU 에서 깨어나는 동안은 DatabaseResumingException → 잠시 기다렸다가 다시 시도 (최대 약 40초)
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.client.send(command);
      } catch (e) {
        const name = (e as { name?: string }).name ?? "";
        if (attempt < 8 && /Resuming|Unavailable|Throttl/i.test(name)) {
          await sleep(Number(process.env.DATA_API_RETRY_MS ?? 5000));
          continue;
        }
        throw e;
      }
    }
  }

  async all<T>(sql: string, params?: Param[]) {
    const res = await this.execute(sql, params);
    return (res.formattedRecords ? JSON.parse(res.formattedRecords) : []) as T[];
  }
  async get<T>(sql: string, params?: Param[]) {
    return (await this.all<T>(sql, params))[0];
  }
  async run(sql: string, params?: Param[]) {
    return (await this.execute(sql, params)).numberOfRecordsUpdated ?? 0;
  }
  async insert(sql: string, params?: Param[]) {
    const [row] = await this.all<{ id: number }>(`${sql} RETURNING id`, params);
    return Number(row.id);
  }
  async exec(sql: string) {
    for (const statement of splitStatements(sql)) await this.execute(statement);
  }
  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    if (this.transactionId) return fn(this);
    // 트랜잭션 시작도 일시 중지 해제 대기를 거치도록 첫 쿼리로 깨운다
    await this.execute("SELECT 1");
    const { transactionId } = await this.client.send(new BeginTransactionCommand(this.cfg));
    try {
      const result = await fn(new DataApiDb(this.client, this.cfg, transactionId));
      await this.client.send(new CommitTransactionCommand({ resourceArn: this.cfg.resourceArn, secretArn: this.cfg.secretArn, transactionId }));
      return result;
    } catch (e) {
      await this.client
        .send(new RollbackTransactionCommand({ resourceArn: this.cfg.resourceArn, secretArn: this.cfg.secretArn, transactionId }))
        .catch(() => undefined);
      throw e;
    }
  }
}

/** client 는 테스트에서 가짜를 넣을 때만 지정 */
export function openDataApi(cfg: Config, client: Pick<RDSDataClient, "send"> = new RDSDataClient({})): Db {
  return new DataApiDb(client as RDSDataClient, cfg);
}

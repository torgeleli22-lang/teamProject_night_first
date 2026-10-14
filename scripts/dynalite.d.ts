/** dynalite (로컬 DynamoDB 흉내 서버, 테스트 전용) 에는 타입 정의가 없어서 쓰는 부분만 적는다 */
declare module "dynalite" {
  import type { Server } from "node:http";
  export default function dynalite(options?: { createTableMs?: number; deleteTableMs?: number; updateTableMs?: number; path?: string }): Server;
}

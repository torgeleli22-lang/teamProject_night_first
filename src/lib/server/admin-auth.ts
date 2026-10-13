import crypto from "node:crypto";
import { getMeta, setMeta } from "./ops-repo";

/**
 * 관리자 인증.
 * - 관리자 코드: 관리자 화면에서 바꾸는 코드. DB(app_meta)에는 원문이 아니라 scrypt 해시만 저장한다.
 * - 복구 코드: 서버 .env 의 ADMIN_TOKEN. 관리자 코드를 잊어도 항상 들어올 수 있도록 함께 허용한다 (서버 관리자만 알기).
 * 틀린 코드를 여러 번 넣으면 그 주소(IP)는 잠시 막는다.
 */

const KEY = "admin_code_hash";
export const ADMIN_CODE_MIN = 8;
export const ADMIN_CODE_MAX = 64;

function hash(code: string): string {
  const salt = crypto.randomBytes(16);
  const digest = crypto.scryptSync(code, salt, 32);
  return `scrypt$${salt.toString("hex")}$${digest.toString("hex")}`;
}

function matches(code: string, stored: string): boolean {
  const [scheme, saltHex, digestHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !digestHex) return false;
  const expected = Buffer.from(digestHex, "hex");
  const actual = crypto.scryptSync(code, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function sameText(a: string, b: string): boolean {
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

export async function adminCodeIsSet(): Promise<boolean> {
  return !!(await getMeta(KEY));
}

export async function setAdminCode(code: string) {
  await setMeta(KEY, hash(code));
}

export type AdminCheck = "ok" | "missing" | "wrong" | "open";

/** 코드 확인. open = 코드가 하나도 설정되지 않음 (로컬 개발용) */
export async function checkAdminCode(given: string | undefined): Promise<AdminCheck> {
  const recovery = process.env.ADMIN_TOKEN;
  const stored = await getMeta(KEY);
  if (!recovery && !stored) return "open";
  if (!given) return "missing";
  if (recovery && sameText(given, recovery)) return "ok";
  if (stored && matches(given, stored)) return "ok";
  return "wrong";
}

// ───────────────────────── 틀린 코드 반복 막기 ─────────────────────────

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60_000;
const failures = new Map<string, { count: number; since: number }>();

export function isLockedOut(who: string, now = Date.now()): boolean {
  const f = failures.get(who);
  if (!f) return false;
  if (now - f.since > WINDOW_MS) {
    failures.delete(who);
    return false;
  }
  return f.count >= MAX_FAILURES;
}

export function recordFailure(who: string, now = Date.now()) {
  const f = failures.get(who);
  if (!f || now - f.since > WINDOW_MS) failures.set(who, { count: 1, since: now });
  else f.count++;
}

export function clearFailures(who: string) {
  failures.delete(who);
}

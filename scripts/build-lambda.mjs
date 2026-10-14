/**
 * Lambda 배포 파일 만들기:  npm run build:lambda  →  dist/lambda.zip
 * - src/api/lambda.ts 와 필요한 코드·라이브러리를 index.js 하나로 묶는다 (esbuild)
 * - AWS SDK(DynamoDB·Bedrock·Lambda)도 함께 묶는다: 런타임에 든 SDK 버전과 상관없이 테스트한 그대로 동작하도록
 * - zip 은 운영체제 도구 없이 Node 로 만든다 (Windows 에서도 동작)
 * Lambda 설정: 런타임 Node.js 22.x, 핸들러 index.handler
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const out = path.resolve("dist/lambda");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

await build({
  entryPoints: ["src/api/lambda.ts"],
  outfile: path.join(out, "index.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  minify: true,
  sourcemap: false,
  external: ["pg-native", "pg-cloudflare"],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

// ── 최소 zip 작성기 (deflate) ──
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, compressed);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(0, 12);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(compressed.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(0, 30);
    cen.writeUInt32LE(0, 34);
    cen.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

const code = fs.readFileSync(path.join(out, "index.js"));
const zipPath = path.resolve("dist/lambda.zip");
fs.writeFileSync(zipPath, zip([{ name: "index.js", data: code }]));
console.log(`Lambda 패키지: ${path.relative(process.cwd(), zipPath)} (${(fs.statSync(zipPath).size / 1024).toFixed(0)} KB) — 핸들러: index.handler, 런타임: Node.js 22.x`);

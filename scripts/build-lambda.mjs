/**
 * Lambda 배포 파일 만들기:  npm run build:lambda  →  dist/lambda/ (폴더) + dist/lambda.zip
 *
 * 사람이 읽을 수 있는 "소스 형태"로 만든다.
 * - src/api, src/lib 의 TypeScript 파일을 파일마다 JavaScript 로만 바꾼다 (합치지 않음, 압축하지 않음, 주석 유지).
 *   폴더 구조는 GitHub 과 같다: src/lib/grading.ts → lib/grading.js
 * - Lambda 가 실제로 쓰는 파일만 넣는다 (src/api/lambda.ts 에서 따라가며 찾음).
 * - AWS SDK(DynamoDB·Bedrock·Lambda)는 Lambda 런타임(Node.js 22.x)에 이미 들어 있어서 넣지 않는다.
 * - 그 밖의 외부 라이브러리(입력 검사용 zod)만 node_modules/ 에 파일 하나로 넣는다.
 *
 * Lambda 설정: 런타임 Node.js 22.x, 핸들러 index.handler
 * zip 은 운영체제 도구 없이 Node 로 만든다 (Windows 에서도 동작)
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import ts from "typescript";

const root = process.cwd();
const out = path.resolve("dist/lambda");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

/** Lambda 런타임에 들어 있는 라이브러리 (넣지 않음) */
const IN_RUNTIME = [/^@aws-sdk\//, /^@smithy\//];
/** Lambda(AI_PROVIDER=converse, DB_DRIVER=dynamodb)에서는 쓰지 않는 라이브러리 (필요할 때만 import 하는 파일에 있음) */
const NOT_USED_ON_LAMBDA = [/^@anthropic-ai\//, /^pg$/, /^pg-/];

// ── 1. 진입점에서 따라가며 Lambda 가 쓰는 소스 파일 찾기 (esbuild 는 목록만 만들고 결과는 쓰지 않음) ──
const scan = await build({
  entryPoints: ["src/api/lambda.ts"],
  bundle: true,
  write: false,
  metafile: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  logLevel: "silent",
  external: ["@aws-sdk/*", "@smithy/*", "@anthropic-ai/*", "pg", "pg-native", "pg-cloudflare"],
});
const sources = Object.keys(scan.metafile.inputs)
  .filter((f) => f.startsWith("src/") && f.endsWith(".ts"))
  .sort();

// ── 2. 파일마다 TypeScript → JavaScript (CommonJS, 주석·줄바꿈 유지) ──
const outPathOf = (src) => path.join(out, src.replace(/^src\//, "").replace(/\.ts$/, ".js"));
const bareImports = new Set();
for (const src of sources) {
  const code = fs.readFileSync(path.join(root, src), "utf8");
  const js = ts.transpileModule(code, {
    fileName: src,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      removeComments: false,
      importHelpers: false,
    },
  }).outputText;
  for (const m of js.matchAll(/require\("([^".][^"]*)"\)|import\("([^".][^"]*)"\)/g)) {
    const spec = m[1] ?? m[2];
    if (!spec.startsWith("node:")) bareImports.add(spec);
  }
  const header = `// 원본: ${src} (GitHub 저장소). TypeScript 를 JavaScript 로 바꾼 파일이에요.\n// 고칠 때는 원본을 고치고 다시 빌드하는 것을 권장해요 (콘솔에서 고쳤다면 원본에도 같은 내용을 반영해 주세요).\n`;
  const dest = outPathOf(src);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, header + js);
}

// ── 3. 외부 라이브러리: 런타임에 없는 것만 node_modules/<이름>/<경로>.js 파일 하나로 넣기 ──
const vendored = [];
const byPackage = new Map();
for (const spec of [...bareImports].sort()) {
  if (IN_RUNTIME.some((r) => r.test(spec)) || NOT_USED_ON_LAMBDA.some((r) => r.test(spec))) continue;
  const parts = spec.split("/");
  const pkg = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const sub = parts.slice(pkg.split("/").length).join("/") || "index";
  byPackage.set(pkg, [...(byPackage.get(pkg) ?? []), { spec, sub }]);
}
for (const [pkg, entries] of byPackage) {
  const dir = path.join(out, "node_modules", pkg);
  fs.mkdirSync(dir, { recursive: true });
  const exportsMap = {};
  for (const { spec, sub } of entries) {
    const file = `${sub}.js`;
    await build({
      stdin: { contents: `module.exports = require(${JSON.stringify(spec)});`, resolveDir: root, loader: "js" },
      outfile: path.join(dir, file),
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      minify: false,
      legalComments: "inline",
      logLevel: "warning",
    });
    exportsMap[sub === "index" ? "." : `./${sub}`] = `./${file}`;
    vendored.push(spec);
  }
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: pkg, private: true, exports: exportsMap }, null, 2) + "\n");
}

// ── 4. 진입점과 안내 파일 ──
fs.writeFileSync(
  path.join(out, "index.js"),
  `// Lambda 진입점 (핸들러: index.handler)
// 실제 처리는 api/lambda.js → api/router.js → api/routes.js 순서로 이어져요. 폴더 구성은 README.md 를 보세요.
module.exports = require("./api/lambda");
`,
);
const tree = sources.map((s) => `  ${s.replace(/^src\//, "").replace(/\.ts$/, ".js")}`).join("\n");
fs.writeFileSync(
  path.join(out, "README.md"),
  `# 코드리딩 API (Lambda)

GitHub 저장소의 \`src/api\`, \`src/lib\` TypeScript 파일을 파일마다 JavaScript 로 바꾼 것이에요 (합치거나 압축하지 않았어요).

- 핸들러: \`index.handler\` · 런타임: Node.js 22.x
- 요청 흐름: \`api/lambda.js\` (Lambda 이벤트 → 요청) → \`api/router.js\` (요청 제한·세션) → \`api/routes.js\` (경로별 처리)
- 저장: \`lib/server/dynamo/\` (DynamoDB) · AI: \`lib/ai/\` (Bedrock) · 채점: \`lib/grading.js\` · 문제 고르기: \`lib/server/planner.js\` · 문제 데이터: \`lib/content/seed/\`
- AWS SDK 는 Lambda 런타임에 들어 있는 것을 써요. \`node_modules/\` 에는 런타임에 없는 라이브러리(${vendored.join(", ") || "없음"})만 있어요.
- 원본은 GitHub 이에요. 콘솔에서 고쳤다면 원본에도 같은 내용을 반영해 주세요 (다음 업로드 때 덮어써져요).

## 들어 있는 파일
${tree}
`,
);

// ── 5. zip (폴더 그대로) ──
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
    local.writeUInt16LE(0x0800, 6); // 파일 이름 UTF-8
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
    cen.writeUInt16LE(0x0800, 8);
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

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(out).map((f) => ({ name: path.relative(out, f).split(path.sep).join("/"), data: fs.readFileSync(f) }));
const zipPath = path.resolve("dist/lambda.zip");
fs.writeFileSync(zipPath, zip(files));
const unpacked = files.reduce((n, f) => n + f.data.length, 0);
console.log(
  `Lambda 패키지: dist/lambda/ (파일 ${files.length}개, ${(unpacked / 1024).toFixed(0)} KB) · dist/lambda.zip (${(fs.statSync(zipPath).size / 1024).toFixed(0)} KB) — 핸들러: index.handler, 런타임: Node.js 22.x`,
);
if (unpacked > 3 * 1024 * 1024) console.warn("⚠ 3MB 를 넘으면 Lambda 콘솔 편집기에서 코드를 볼 수 없어요.");

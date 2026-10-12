/**
 * EC2(또는 아무 Node 서버)용 API 묶음 만들기:  npm run build:server  →  dist/server/index.js
 * src/api/server.ts 와 필요한 코드·라이브러리를 파일 하나로 묶는다. 실행: node dist/server/index.js
 */
import { build } from "esbuild";
import fs from "node:fs";

fs.rmSync("dist/server", { recursive: true, force: true });
await build({
  entryPoints: ["src/api/server.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  minify: true,
  // Bedrock 연결에 AWS SDK 가 필요하므로 함께 묶는다. Aurora Data API(client-rds-data)·pg-native 는 이 서버에서 쓰지 않는다
  external: ["@aws-sdk/client-rds-data", "pg-native", "pg-cloudflare"],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
console.log(`API 서버 묶음: dist/server/index.js (${(fs.statSync("dist/server/index.js").size / 1024).toFixed(0)} KB) — 실행: node dist/server/index.js`);

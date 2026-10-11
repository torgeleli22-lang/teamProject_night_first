import fs from "node:fs";
import http from "node:http";

/**
 * 로컬 개발용 API 서버 (Lambda 와 같은 코드를 Node HTTP 서버로 실행).
 *   npm run api   → http://localhost:8787
 * 화면(npm run dev)은 NEXT_PUBLIC_API_URL 로 이 주소를 부른다.
 * 설정은 .env 파일에서 읽는다 (.env.example 참고).
 */
if (fs.existsSync(".env")) process.loadEnvFile(".env");
const PORT = Number(process.env.API_PORT ?? 8787);

(async () => {
  // 환경 변수를 읽은 뒤에 불러와야 설정(예산·세션 시간 등)이 반영된다
  const { handle } = await import("./router");
  http
    .createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = undefined;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "잘못된 요청 형식이에요." }));
        return;
      }
      const url = new URL(req.url ?? "/", "http://localhost");
      const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v]));
      const out = await handle({ method: req.method ?? "GET", path: url.pathname, query: url.searchParams, headers, body });
      res.writeHead(out.status, out.headers).end(out.body);
    })
    .listen(PORT, () => {
      console.log(`코드리딩 API: http://localhost:${PORT}  (DB: ${process.env.DB_DRIVER ?? "sqlite"}, AI: ${process.env.AI_MODE ?? "auto"})`);
    });
})();

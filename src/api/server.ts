import fs from "node:fs";
import http from "node:http";

/**
 * API 서버 (Lambda 와 같은 라우터를 Node HTTP 서버로 실행).
 * - 로컬:  npm run api   → http://localhost:8787  (화면은 NEXT_PUBLIC_API_URL 로 이 주소를 부른다)
 * - EC2 :  Docker 로 실행 (Dockerfile, docker-compose.yml) — 앞단의 Caddy 가 HTTPS 를 붙인다
 * 설정은 환경 변수, 없으면 .env 파일에서 읽는다 (.env.example 참고).
 * 항상 켜져 있는 서버라 응답 뒤 작업(AI 생성·학습자 분석)은 같은 프로세스에서 뒤로 실행한다.
 */
if (fs.existsSync(".env")) process.loadEnvFile(".env");
const PORT = Number(process.env.API_PORT ?? 8787);

(async () => {
  // 환경 변수를 읽은 뒤에 불러와야 설정(예산·세션 시간 등)이 반영된다
  const { handle } = await import("./router");
  const { LIMITS } = await import("./rate-limit");
  http
    .createServer(async (req, res) => {
      // 아주 큰 요청으로 메모리를 채우지 못하게 크기를 제한한다
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += (chunk as Buffer).length;
        // 관리자 데이터 가져오기만 큰 파일(최대 8MB)을 받는다 (관리자 코드는 라우터에서 확인)
        if (size > (req.url?.startsWith("/admin/import") ? 8 * 1024 * 1024 : LIMITS.maxBodyBytes)) {
          res.writeHead(413, { "content-type": "application/json" }).end(JSON.stringify({ error: "요청이 너무 커요." }));
          req.destroy();
          return;
        }
        chunks.push(chunk as Buffer);
      }
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
    })
    .on("error", (e) => {
      console.error("API 서버를 시작하지 못했어요:", e.message);
      process.exit(1);
    });
})();

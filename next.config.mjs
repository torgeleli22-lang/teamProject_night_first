/**
 * 화면은 정적 파일(HTML/JS)로 내보내서 GitHub Pages 에 올린다 (서버 없음).
 * 채점·기록·AI 는 모두 API(AWS Lambda 함수 URL)가 처리한다 — src/api/
 *
 * - NEXT_PUBLIC_BASE_PATH: GitHub Pages 프로젝트 주소의 하위 경로 (예: /teamProject_night_first)
 * - NEXT_PUBLIC_API_URL  : Lambda 함수 URL (로컬 기본값 http://localhost:8787)
 * TypeScript 가 없는 환경에서도 읽히도록 설정 파일은 JS 로 둔다.
 * @type {import("next").NextConfig}
 */
const nextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  // /learn → /learn/index.html 로 만들어서 GitHub Pages 에서 새로 고침해도 열리게 한다
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;

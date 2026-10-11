/**
 * 운영 서버(Docker)에는 TypeScript 가 없으므로 설정 파일은 JS 로 둔다.
 * @type {import("next").NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  webpack(config, { isServer }) {
    // node:sqlite 는 Node 내장 모듈이지만 번들러의 내장 모듈 목록에 없어 직접 외부 모듈로 지정한다
    if (isServer) config.externals = [...(config.externals ?? []), { "node:sqlite": "commonjs node:sqlite" }];
    return config;
  },
};

export default nextConfig;

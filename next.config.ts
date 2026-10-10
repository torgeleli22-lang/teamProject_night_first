import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  webpack(config, { isServer }) {
    // node:sqlite 는 Node 내장 모듈이지만 번들러의 내장 모듈 목록에 없어 직접 외부 모듈로 지정한다
    if (isServer) config.externals = [...(config.externals ?? []), { "node:sqlite": "commonjs node:sqlite" }];
    return config;
  },
};

export default nextConfig;

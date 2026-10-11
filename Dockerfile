# 코드리딩 서비스 이미지 (EC2 t4g(ARM)·x86 모두 동작)
# node:sqlite 를 쓰므로 Node 22.13 이상이 필요하다
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 이미지 안에서 시드 콘텐츠 실행 검증 → 빌드 (검증이 실패하면 이미지도 만들지 않는다)
RUN npm run verify && npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    DATABASE_PATH=/app/data/app.db
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.mjs ./
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]

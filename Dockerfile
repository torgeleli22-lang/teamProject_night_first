# 코드리딩 API 서버 이미지 (EC2 t4g(ARM)·x86 모두 동작)
# 화면은 GitHub Pages(정적)에 있고, 이 이미지는 API 만 실행한다.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 시드 콘텐츠를 실제로 실행해 검증한 뒤 API 를 파일 하나로 묶는다 (검증 실패 시 이미지도 만들지 않음)
RUN npm run verify && npm run build:server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    API_PORT=8787
COPY --from=build /app/dist/server/index.js ./index.js
USER node
EXPOSE 8787
CMD ["node", "index.js"]

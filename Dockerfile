# 仕様2章: Webをビルドし、同じNodeサーバーから配信する単一イメージ。
FROM node:22-bookworm-slim AS build

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
COPY web ./web

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @hcd-stamp-rally/shared build \
  && pnpm --filter @hcd-stamp-rally/web build \
  && pnpm --filter @hcd-stamp-rally/server build

# serverの本番依存と共有パッケージを自己完結した配置へ絞る。
RUN pnpm --filter @hcd-stamp-rally/server --prod deploy --legacy /runtime/server
RUN mkdir -p /runtime/web && cp -a web/dist /runtime/web/dist

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./

USER node
EXPOSE 8080

# Cloud RunはPORTを設定する。DATABASE_URL等の秘密情報は実行環境から渡す。
CMD ["node", "server/dist/index.js"]

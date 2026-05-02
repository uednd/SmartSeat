FROM node:24-alpine

RUN apk add --no-cache curl openssl \
  && corepack enable \
  && corepack prepare pnpm@10.10.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/device-simulator/package.json apps/device-simulator/package.json
COPY apps/miniapp/package.json apps/miniapp/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @smartseat/api db:generate

ENV NODE_ENV=production \
  API_HOST=0.0.0.0 \
  API_PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${API_PORT:-3000}/health" >/dev/null || exit 1

USER node

CMD ["pnpm", "--filter", "@smartseat/api", "dev"]

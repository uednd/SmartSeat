# @smartseat/api

SmartSeat NestJS 后端服务。当前已具备平台层能力和 `API-DB-01` 数据库基线：Prisma schema、migration、seed、数据库连接健康检查和只读 repository/service 基础封装。登录、预约规则、扫码签到、MQTT 消费、异常检测和统计计算仍未实现。

## 启动配置

本地启动会读取仓库根目录的 `.env`，并使用 `.env.example` 作为开发占位 fallback。`.env.example` 只能保存占位值，不得写入真实 secret。

启动时会校验以下配置边界：

- `NODE_ENV`、`API_HOST`、`API_PORT`
- PostgreSQL 配置：`POSTGRES_HOST`、`POSTGRES_PORT`、`POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`DATABASE_URL`
- MQTT 占位配置：`MQTT_HOST`、`MQTT_PORT`、`MQTT_USERNAME`、`MQTT_PASSWORD`
- 认证占位配置：`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET`

`production` 环境会拒绝 `replace-with-*`、`placeholder`、`example`、`changeme` 等占位 secret 或凭据值。

## 平台接口

- `GET /health`：返回服务状态、版本、运行环境、数据库连接检查结果和 MQTT 配置占位状态。数据库会执行轻量 `SELECT 1`，MQTT 仍不连接 broker。
- `GET /docs`：Swagger UI。
- `GET /openapi.json`：机器可读 OpenAPI JSON。

错误响应统一使用 `@smartseat/contracts` 中的 `ApiErrorResponse`：

```ts
{
  code: ApiErrorCode;
  message: string;
  request_id?: string;
  details?: Record<string, unknown>;
}
```

## 数据库基线

`API-DB-01` 使用 Prisma 和 PostgreSQL。Schema 位于 `prisma/schema.prisma`，首个 migration 位于 `prisma/migrations/20260502000000_api_db_01_baseline/`，seed 位于 `prisma/seed.ts`。

本地复现顺序：

```bash
pnpm infra:up
pnpm db:generate
pnpm db:reset-demo
pnpm db:seed
RUN_DATABASE_TESTS=1 pnpm --filter @smartseat/api test
```

常用数据库命令：

```bash
pnpm db:generate
pnpm db:migrate:dev
pnpm db:migrate
pnpm db:seed
pnpm db:reset-demo
```

`db:reset-demo` 使用 Prisma `migrate reset --force` 重建本地/演示数据库并自动执行 seed。Seed 使用 stable ID 和 upsert，可重复执行；当前 seed 会创建 1 个演示座位、1 个 ESP32-P4 演示设备、设备座位 active binding、1 个学生、1 个管理员，以及多用户脱敏学习记录样本，用于后续排行榜/统计任务验证读取。

Seed 中的设备在线状态和心跳时间只是演示数据，不表示真实 MQTT 已连接。真实 MQTT 连接、订阅、发布和设备在线判定仍属于后续任务。

Prisma Migrate 不维护手写 down migration。本地/演示回滚等价操作是 `pnpm db:reset-demo` 重建；已提交 migration 的修正通过新增 migration 或恢复数据库备份完成。

## 准生产单机 Docker 部署

仓库根目录提供 `infra/docker-compose.deploy.yml` 和 `apps/api/Dockerfile`，用于打包当前可运行的后端部署单元：

- `api`：NestJS API 容器，基于 Node.js 24 Alpine，非 root 用户运行，暴露 `3000`，使用 `/health` 做 Docker healthcheck。
- `postgres`：PostgreSQL 17 Alpine，使用 named volume 持久化。
- `mosquitto`：Mosquitto 2，复用 `infra/mosquitto/mosquitto.conf`。当前后端仍不连接真实 MQTT broker。
- `api-db-init`：一次性初始化服务，在 PostgreSQL healthy 后执行 migration 和 seed。

部署前准备：

```bash
cp .env.deploy.example .env.deploy
```

编辑 `.env.deploy`，替换数据库密码、MQTT 凭据、微信/OIDC 配置占位值。`.env.deploy` 不应提交到 Git。

常用命令：

```bash
pnpm docker:config
pnpm docker:build
pnpm docker:up
pnpm docker:ps
pnpm docker:logs
pnpm docker:down
```

验证端点：

```bash
curl http://localhost:${SMARTSEAT_API_PORT:-3000}/health
curl http://localhost:${SMARTSEAT_API_PORT:-3000}/openapi.json
```

`/health` 中 database dependency 会执行真实 `SELECT 1`；MQTT dependency 仍只是配置存在性检查，不代表真实 MQTT 消费、发布或设备在线判定已实现。

重复验证 migration/seed 幂等性：

```bash
docker compose --env-file .env.deploy -f infra/docker-compose.deploy.yml run --rm api-db-init
```

停止服务不会删除数据库 volume：

```bash
pnpm docker:down
```

需要清空单机部署数据库时，使用：

```bash
docker compose --env-file .env.deploy -f infra/docker-compose.deploy.yml down -v
```

## 日志与调度

请求日志包含 `request_id`、`method`、`path`、`status`、`duration_ms`。日志不记录请求体，也不输出 token、secret、password 等敏感字段。

`ScheduleModule` 已初始化，供后续业务模块注册定时任务；`API-DB-01` 不注册任何业务定时任务。

## 本地命令

```bash
pnpm --filter @smartseat/api dev
pnpm --filter @smartseat/api test
RUN_DATABASE_TESTS=1 pnpm --filter @smartseat/api test
pnpm --filter @smartseat/api typecheck
pnpm --filter @smartseat/api lint
```

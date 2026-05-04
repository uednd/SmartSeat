# @smartseat/api

SmartSeat NestJS 后端服务。当前已具备平台层能力、`API-DB-01` 数据库基线、`API-AUTH-01/02/03` 认证与用户基础能力、`API-SEAT-01` 座位/设备查询、`API-RES-01/02/03` 预约与扫码签到链路、`API-IOT-01/02/03` MQTT 与传感器/异常自动规则，以及 `API-ADM-01` 管理员 dashboard、手动释放、维护、配置脱敏读取和审计接口。统计计算、排行榜和小程序页面仍未实现。

## 启动配置

本地启动会读取仓库根目录的 `.env`，并使用 `.env.example` 作为开发占位 fallback。`.env.example` 只能保存占位值，不得写入真实 secret。

启动时会校验以下配置边界：

- `NODE_ENV`、`API_HOST`、`API_PORT`
- PostgreSQL 配置：`POSTGRES_HOST`、`POSTGRES_PORT`、`POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`DATABASE_URL`
- MQTT 配置：`MQTT_ENABLED`、`MQTT_BROKER_URL`、`MQTT_CLIENT_ID`、`MQTT_HOST`、`MQTT_PORT`、`MQTT_USERNAME`、`MQTT_PASSWORD`、`MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS`
- 动态二维码配置：`QR_TOKEN_REFRESH_SECONDS`、`QR_TOKEN_TTL_SECONDS`、`CHECKIN_ENABLED`
- 认证配置：`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_AUTH_PROVIDER_MODE`、`OIDC_ISSUER`、`OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET`、`OIDC_REDIRECT_URI`、`OIDC_AUTH_PROVIDER_MODE`、`AUTH_TOKEN_SECRET`、`AUTH_TOKEN_TTL_SECONDS`、`DEFAULT_AUTH_MODE`

`production` 环境会拒绝 `replace-with-*`、`placeholder`、`example`、`changeme` 等占位 secret 或凭据值。

## 平台接口

- `GET /health`：返回服务状态、版本、运行环境、数据库连接检查结果和 MQTT 连接/降级状态。数据库会执行轻量 `SELECT 1`；MQTT 启用时检查 broker client 连接状态，禁用时报告降级模式。
- `GET /docs`：Swagger UI。
- `GET /openapi.json`：机器可读 OpenAPI JSON。

## 认证与用户接口

- `GET /auth/mode`：返回当前登录模式和脱敏认证配置。
- `GET /admin/auth/mode`：管理员读取脱敏认证配置。
- `PUT /admin/auth/mode`：管理员修改登录模式和认证配置，secret 不明文返回。
- `POST /auth/wechat/login`：微信登录模式下使用 code 登录；支持 mock/real provider，测试不依赖微信外网。
- `GET /auth/oidc/authorize-url`：OIDC 登录模式下返回授权 URL 和签名 state。
- `POST /auth/oidc/callback`：OIDC 登录模式下完成 code 回调、用户绑定和系统 token 签发；支持 mock/real provider，测试不依赖学校真实 Provider。
- `GET /me`：返回当前用户、角色、匿名名、展示名、登录模式和小程序 `next_route`。
- `PATCH /me/leaderboard-preference`：更新当前用户是否参与匿名排行榜的隐私偏好，不计算排行榜。

当前认证边界：已实现 STUDENT/ADMIN 区分、首个用户成为管理员、微信/OIDC mock provider 可测闭环和 token 守卫；未实现小程序页面、OIDC 管理员组映射、真实微信外网联调、真实学校 OIDC 外网联调。

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

Seed 中的设备在线状态和心跳时间只是演示初始数据。`API-IOT-01` 启用 MQTT 后会通过 heartbeat 更新 Device 在线状态和最后心跳时间，并按配置阈值判定离线。

## MQTT 设备通信

`API-IOT-01` 使用 `packages/contracts` 中的 MQTT topic 与 payload 定义：

- 订阅 `seat/+/heartbeat`，QoS 1，校验 `device_id`、`seat_id`、`timestamp`、`sensor_status`、`display_status`。
- 发布 `seat/{device_id}/display`、`seat/{device_id}/light`、`seat/{device_id}/command`，QoS 1，retain false。
- `MQTT_ENABLED=false` 时 API 不连接 broker，启动和 HTTP API 不受影响，设备能力进入降级模式。
- 本地/初赛演示可使用匿名 Mosquitto；正式环境需要设备级凭据、ACL 或 TLS/mTLS，不能复用本地匿名 broker。

## 预约与扫码签到

`API-RES-01/02/03` 已实现预约创建/取消、当前使用、续约、主动离座、到期推进、动态 QRToken 和扫码签到：

- `POST /reservations`
- `GET /reservations/current`
- `GET /reservations/history`
- `DELETE /reservations/:reservation_id`
- `POST /reservations/:reservation_id/extend`
- `GET /current-usage`
- `POST /current-usage/release`
- `POST /checkin`
- `GET /admin/reservations/current`
- `GET /admin/reservations/seats/:seat_id`

动态二维码默认 15 秒刷新、30 秒有效，`CHECKIN_ENABLED=false` 可关闭扫码签到入口。后端通过 MQTT display payload 下发 `seat_id`、`device_id`、`timestamp`、`qr_token`，扫码签到成功后将预约置为 `CHECKED_IN`、座位业务状态置为 `OCCUPIED`，并发布 display/light 同步。

## 管理员接口

`API-ADM-01` 已实现小程序管理员页所需后端接口，所有接口均要求 Bearer token 且具备 ADMIN 角色：

- `GET /admin/dashboard`
- `GET /admin/no-shows`
- `GET /admin/anomalies`
- `GET /admin/anomalies/:event_id`
- `POST /admin/anomalies/handle`
- `POST /admin/seats/release`
- `POST /admin/seats/maintenance`
- `POST /admin/devices/maintenance`
- `GET /admin/config`
- `GET /admin/action-logs`

手动释放和维护/恢复会写入 `AdminActionLog`，并尝试通过 MQTT 同步终端 display/light 或维护命令；MQTT 禁用或断连时不回滚业务状态，会在审计 detail 中记录降级结果。配置读取接口只返回登录模式、MQTT 状态和阈值等脱敏字段，不返回 secret、client secret、password 或 token。设备维护不新增独立 `Device.maintenance` 字段，按绑定座位维护状态派生。

本阶段仍不处理统计计算、排行榜、小程序页面、设备模拟器或固件逻辑。

Prisma Migrate 不维护手写 down migration。本地/演示回滚等价操作是 `pnpm db:reset-demo` 重建；已提交 migration 的修正通过新增 migration 或恢复数据库备份完成。

## 准生产单机 Docker 部署

仓库根目录提供 `infra/docker-compose.deploy.yml` 和 `apps/api/Dockerfile`，用于打包当前可运行的后端部署单元：

- `api`：NestJS API 容器，基于 Node.js 24 Alpine，非 root 用户运行，暴露 `3000`，使用 `/health` 做 Docker healthcheck。
- `postgres`：PostgreSQL 17 Alpine，使用 named volume 持久化。
- `mosquitto`：Mosquitto 2，复用 `infra/mosquitto/mosquitto.conf`。API 在 `MQTT_ENABLED=true` 时连接配置的 broker。
- `api-db-init`：一次性初始化服务，在 PostgreSQL healthy 后执行 migration 和 seed。

部署前准备：

```bash
cp .env.deploy.example .env.deploy
```

编辑 `.env.deploy`，替换数据库密码、MQTT broker URL/client id/凭据、认证 token secret、微信/OIDC 配置占位值和当前登录模式。`.env.deploy` 不应提交到 Git。

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

`/health` 中 database dependency 会执行真实 `SELECT 1`；MQTT dependency 会报告启用/禁用和当前 broker client 连接状态。

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

# SmartSeat

SmartSeat 是一个校园图书馆智能座位管理原型项目。本仓库采用 pnpm monorepo，当前已完成共享契约/API client 基线、NestJS 后端平台基础、PostgreSQL 数据库基线和后端认证/用户基础能力，后续继续落地 ESP32-P4 终端、uni-app 微信小程序、MQTT Broker 集成、设备模拟器和座位预约等业务能力。

## 仓库结构

```text
apps/miniapp              uni-app 微信小程序骨架，业务页面和角色路由尚未实现
apps/api                  NestJS API，包含平台层、数据库基线、认证/用户基础模块和 /health
apps/device-simulator     TypeScript CLI 占位程序
firmware/smart-seat-terminal
                          ESP32-P4 固件工程骨架
packages/contracts        共享状态枚举、DTO、错误码、MQTT topic/payload 契约
packages/api-client       typed API client 与 transport/token/error 基础封装
packages/config           共享 TypeScript、ESLint、Prettier 配置
infra                     本地 PostgreSQL 与 Mosquitto Docker Compose 配置
docs                      已存在的产品与计划文档
scripts                   开发辅助脚本占位
```

## 环境要求

- Node.js 24 LTS
- pnpm 10 或更高版本
- Docker 和 Docker Compose，用于本地 PostgreSQL 与 Mosquitto
- ESP-IDF，用于后续固件开发
- 微信开发者工具，用于后续小程序开发

## 常用命令

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm dev:api
pnpm dev:sim
pnpm format
pnpm infra:up
pnpm infra:down
```

当前命令行为说明：

- `pnpm dev:api` 会启动 NestJS API 服务，并暴露健康检查、OpenAPI 和已实现的认证/用户接口。
- `pnpm dev:sim` 只输出 initialized-only 的模拟器信息并退出。
- `pnpm lint` 用于检查当前 TypeScript workspace。
- `pnpm typecheck` 用于运行 workspace 范围内的严格 TypeScript 检查。
- `pnpm infra:up` 会在 Docker 可用时启动本地 PostgreSQL 与 Mosquitto。
- `pnpm infra:down` 会停止本地基础设施服务。

数据库命令：

```bash
pnpm db:generate
pnpm db:migrate:dev
pnpm db:migrate
pnpm db:seed
pnpm db:reset-demo
```

准生产单机 Docker 命令：

```bash
pnpm docker:config
pnpm docker:build
pnpm docker:up
pnpm docker:ps
pnpm docker:logs
pnpm docker:down
```

## 当前实现状态

已完成：

- `packages/contracts`：共享状态枚举、REST DTO、错误码、分页/时间模型、MQTT topic 与 payload。
- `packages/api-client`：typed client 方法边界、transport 注入、base URL/token 注入、统一错误归一化。
- `apps/api`：配置校验、统一错误响应、request id 与请求日志、OpenAPI、ScheduleModule、增强版 `/health`、Prisma 数据库基线、migration 与 seed、登录模式配置、用户角色、`/me`、首个管理员引导、微信登录 mock/real provider、OIDC 登录 mock/real provider、系统 token 签发/解析。
- 准生产单机 Docker 部署包：NestJS API、PostgreSQL、Mosquitto、一次性 migrate + seed 初始化服务。

后端平台接口：

- `GET /health`
- `GET /docs`
- `GET /openapi.json`

后端认证/用户接口：

- `GET /auth/mode`
- `PUT /admin/auth/mode`
- `POST /auth/wechat/login`
- `GET /auth/oidc/authorize-url`
- `POST /auth/oidc/callback`
- `GET /me`

仍未实现：座位/设备业务接口、预约、扫码签到、续约、离座、真实 MQTT 连接、统计计算、排行榜接口、小程序真实页面与角色路由、固件业务逻辑。真实微信和学校 OIDC 外网联调需要按部署环境另行配置，不使用仓库占位 secret。

## 本地基础设施

`infra/docker-compose.yml` 定义了本地开发服务：

- PostgreSQL
- Mosquitto MQTT Broker

其中的凭据和 Mosquitto 配置都只是本地初始化占位值，不可用于生产环境。

## 准生产单机 Docker 部署

`infra/docker-compose.deploy.yml` 定义了单机部署口径的 API、PostgreSQL、Mosquitto 和 `api-db-init` 初始化服务。该部署支持单机持久化、容器健康检查、非 root API 容器、migration 和幂等 seed，但不包含公网高可用、TLS、备份、监控或正式 MQTT 安全闭环。

准备本地部署环境变量：

```bash
cp .env.deploy.example .env.deploy
```

然后编辑 `.env.deploy`，替换数据库密码、MQTT 凭据、认证 token secret、微信/OIDC 占位配置和当前登录模式。`.env.deploy` 已被 git 忽略，不要提交真实 secret。

启动与验证：

```bash
pnpm docker:config
pnpm docker:build
pnpm docker:up
pnpm docker:ps
curl http://localhost:${SMARTSEAT_API_PORT:-3000}/health
curl http://localhost:${SMARTSEAT_API_PORT:-3000}/openapi.json
```

运行后访问：

- API health: `http://localhost:${SMARTSEAT_API_PORT:-3000}/health`
- Swagger: `http://localhost:${SMARTSEAT_API_PORT:-3000}/docs`
- OpenAPI JSON: `http://localhost:${SMARTSEAT_API_PORT:-3000}/openapi.json`

`api-db-init` 会在 PostgreSQL healthy 后执行 `pnpm --filter @smartseat/api db:migrate` 和 `pnpm --filter @smartseat/api db:seed`。Seed 使用 stable ID 和 upsert，可重复执行；需要手动复核时可运行：

```bash
docker compose --env-file .env.deploy -f infra/docker-compose.deploy.yml run --rm api-db-init
```

查看日志与停止：

```bash
pnpm docker:logs
pnpm docker:down
```

`pnpm docker:down` 不删除 PostgreSQL volume。需要清空单机部署数据时，使用破坏性命令：

```bash
docker compose --env-file .env.deploy -f infra/docker-compose.deploy.yml down -v
```

常见失败原因：

- `.env.deploy` 未创建或仍包含 `replace-with-*` 占位值，`production` 配置校验会拒绝启动。
- `SMARTSEAT_API_PORT`、`SMARTSEAT_POSTGRES_PORT` 或 `SMARTSEAT_MQTT_PORT` 已被本机其他进程占用。
- 首次构建需要拉取 `node:24-alpine`、`postgres:17-alpine`、`eclipse-mosquitto:2`，Docker Hub 网络抖动可能导致 EOF，可重试构建。
- Mosquitto 当前复用本地匿名配置，仅用于单机准生产部署验证，不代表正式设备认证已经完成。

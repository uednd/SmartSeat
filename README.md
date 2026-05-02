# SmartSeat

SmartSeat 是一个校园图书馆智能座位管理原型项目。本仓库采用 pnpm monorepo，当前已完成共享契约/API client 基线与 NestJS 后端平台基础，后续继续落地 ESP32-P4 终端、uni-app 微信小程序、MQTT Broker 集成、设备模拟器和 PostgreSQL 业务能力。

## 仓库结构

```text
apps/miniapp              uni-app 微信小程序骨架，业务页面和角色路由尚未实现
apps/api                  NestJS API 平台层，包含配置校验、统一错误、日志、OpenAPI、调度和 /health
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

- `pnpm dev:api` 会启动 NestJS API 平台服务，并暴露 `GET /health`、`GET /docs`、`GET /openapi.json`。
- `pnpm dev:sim` 只输出 initialized-only 的模拟器信息并退出。
- `pnpm lint` 用于检查当前 TypeScript workspace。
- `pnpm typecheck` 用于运行 workspace 范围内的严格 TypeScript 检查。
- `pnpm infra:up` 会在 Docker 可用时启动本地 PostgreSQL 与 Mosquitto。
- `pnpm infra:down` 会停止本地基础设施服务。

## 当前实现状态

已完成：

- `packages/contracts`：共享状态枚举、REST DTO、错误码、分页/时间模型、MQTT topic 与 payload。
- `packages/api-client`：typed client 方法边界、transport 注入、base URL/token 注入、统一错误归一化。
- `apps/api`：配置校验、统一错误响应、request id 与请求日志、OpenAPI、ScheduleModule、增强版 `/health`。

后端平台接口：

- `GET /health`
- `GET /docs`
- `GET /openapi.json`

仍未实现：登录、预约、座位/设备业务接口、真实数据库模型/迁移/seed、真实 MQTT 连接、统计、排行榜、小程序真实页面、固件业务逻辑。

## 本地基础设施

`infra/docker-compose.yml` 定义了本地开发服务：

- PostgreSQL
- Mosquitto MQTT Broker

其中的凭据和 Mosquitto 配置都只是本地初始化占位值，不可用于生产环境。

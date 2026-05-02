# SmartSeat

SmartSeat 是一个校园图书馆智能座位管理原型项目。本仓库已初始化为 pnpm monorepo，后续用于承载 ESP32-P4 终端、uni-app 微信小程序、后端 API、MQTT Broker 集成、设备模拟器和 PostgreSQL 相关服务。

## 仓库结构

```text
apps/miniapp              uni-app 微信小程序骨架
apps/api                  仅提供 /health 的 NestJS API 占位服务
apps/device-simulator     TypeScript CLI 占位程序
firmware/smart-seat-terminal
                          ESP32-P4 固件工程骨架
packages/contracts        共享 TypeScript 枚举和空接口占位
packages/api-client       空的 API client 包入口
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

- `pnpm dev:api` 会启动 NestJS 占位 API 服务，并暴露 `GET /health`。
- `pnpm dev:sim` 只输出 initialized-only 的模拟器信息并退出。
- `pnpm lint` 用于检查当前初始化后的 TypeScript 工程骨架。
- `pnpm typecheck` 用于运行 workspace 范围内的严格 TypeScript 检查。
- `pnpm infra:up` 会在 Docker 可用时启动本地 PostgreSQL 与 Mosquitto。
- `pnpm infra:down` 会停止本地基础设施服务。

## API 占位说明

当前 NestJS API 仅提供以下接口：

```text
GET /health
```

返回内容只是 initialized-only 的健康检查结果。未实现认证、数据库连接、MQTT 连接、业务模块或持久化逻辑。

## 本地基础设施

`infra/docker-compose.yml` 定义了本地开发服务：

- PostgreSQL
- Mosquitto MQTT Broker

其中的凭据和 Mosquitto 配置都只是本地初始化占位值，不可用于生产环境。

# @smartseat/api

SmartSeat NestJS 后端服务。当前 `API-PLT-01` 只提供平台层能力，不包含登录、预约、座位、MQTT 连接、数据库模型或业务状态机。

## 启动配置

本地启动会读取仓库根目录的 `.env`，并使用 `.env.example` 作为开发占位 fallback。`.env.example` 只能保存占位值，不得写入真实 secret。

启动时会校验以下配置边界：

- `NODE_ENV`、`API_HOST`、`API_PORT`
- PostgreSQL 占位配置：`POSTGRES_HOST`、`POSTGRES_PORT`、`POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`DATABASE_URL`
- MQTT 占位配置：`MQTT_HOST`、`MQTT_PORT`、`MQTT_USERNAME`、`MQTT_PASSWORD`
- 认证占位配置：`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET`

`production` 环境会拒绝 `replace-with-*`、`placeholder`、`example`、`changeme` 等占位 secret 或凭据值。

## 平台接口

- `GET /health`：返回服务状态、版本、运行环境，以及数据库/MQTT 的配置占位状态。该接口不连接 PostgreSQL 或 MQTT。
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

## 日志与调度

请求日志包含 `request_id`、`method`、`path`、`status`、`duration_ms`。日志不记录请求体，也不输出 token、secret、password 等敏感字段。

`ScheduleModule` 已初始化，供后续业务模块注册定时任务；本任务不注册任何业务定时任务。

## 本地命令

```bash
pnpm --filter @smartseat/api dev
pnpm --filter @smartseat/api test
pnpm --filter @smartseat/api typecheck
pnpm --filter @smartseat/api lint
```

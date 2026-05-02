# ADR 0003: OpenAPI 生成与发布方式

## 状态

Accepted

## 背景

后端是 SmartSeat 的业务可信源，后续小程序、API client、测试和演示都依赖稳定接口契约。当前 API 只有 `/health` 占位接口，尚未配置 OpenAPI。

## 决策

`API-PLT-01` 引入 NestJS Swagger/OpenAPI 能力。

本地开发环境暴露：

- `/docs`：Swagger UI 或等价接口文档页面。
- `/openapi.json`：机器可读 OpenAPI JSON。

需要留存接口证据时，可导出 OpenAPI 文件到 `docs/openapi/`。本阶段不发布公网 OpenAPI，不配置外部文档站点。

OpenAPI 的 DTO、错误响应、分页模型和鉴权声明应与 `packages/contracts` 保持一致。涉及 MQTT payload 的契约仍以 `packages/contracts` 和 ADR/文档说明为准，不强行塞入 REST OpenAPI。

## 理由

NestJS Swagger 与后端框架匹配，能让 API 任务在实现时同步生成可检查接口文档。保留 `/openapi.json` 便于后续 API client、测试和证据归档使用。本阶段不做公网发布，避免提前引入部署、访问控制和文档站运维成本。

## 影响范围

- `API-PLT-01` 负责接入 OpenAPI 生成与本地访问路径。
- 后续 API 任务必须同步 DTO 装饰器、错误响应和鉴权声明。
- `SHR-01` 与 `packages/api-client` 可基于 OpenAPI 或手写 typed client，但契约含义必须一致。
- `QA-01` 可将 `/openapi.json` 或导出文件作为接口证据。

## 回滚或替代方案

若 NestJS Swagger 与项目 ESM 或 DTO 策略冲突，可改为构建期生成 OpenAPI 或维护手写 OpenAPI YAML。替代方案必须继续提供本地可访问或可导出的 OpenAPI 文件，并保证 Checklist 可追溯。

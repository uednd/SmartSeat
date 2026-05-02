# ADR 0001: ORM 选型、迁移策略与 seed 策略

## 状态

Accepted

## 背景

SmartSeat 后端采用 NestJS 和 PostgreSQL。PRD 已定义用户、认证配置、座位、设备、预约、二维码 token、传感器读数、异常事件、学习记录和管理员操作日志等数据模型。当前仓库只有后端启动骨架，尚未引入 ORM、业务 schema、迁移或 seed。

后续 `API-DB-01` 需要一个明确的 ORM 决策，避免在 Prisma、TypeORM、Drizzle 或手写 SQL 之间重复选择。

## 决策

本项目后端 ORM 选择 Prisma。

迁移策略使用 Prisma Migrate。数据库 schema、migration 与 seed 由 `API-DB-01` 落地，不在 GOV-02 中实现。

Seed 策略如下：

- seed 只生成本地开发和初赛演示所需的脱敏数据。
- 初始 seed 至少覆盖 1 个座位、1 个设备、学生/管理员占位账号和排行榜演示数据。
- seed 不包含真实 openid、unionid、OIDC subject、学号、手机号、微信 secret、OIDC client secret 或生产数据库信息。
- reset-demo 由后续 `OPS-01` 提供可重复执行脚本，确保演示状态可恢复。

## 理由

Prisma 对 TypeScript 类型推导、迁移管理、seed 和 PostgreSQL 开发体验支持较完整，适合当前 NestJS monorepo 的快速迭代。它能降低初赛阶段的数据模型落地成本，并为后续 OpenAPI、DTO 和测试数据准备提供稳定 schema 来源。

## 影响范围

- `API-DB-01` 按 Prisma schema、migration 和 seed 实现数据模型。
- `API-PLT-01` 需要为 Prisma client 的生命周期、配置和健康检查预留集成点。
- `OPS-01` 的 reset-demo 脚本基于 Prisma migration 和 seed 执行。
- 后续测试使用 Prisma seed 或测试专用数据库准备数据。

## 回滚或替代方案

若 Prisma 在 Node 24、目标部署环境或 ESP32 演示联调中出现不可接受问题，可新增 ADR 改为 TypeORM、Drizzle 或 SQL query builder。替代时必须同步迁移目录、seed 策略、测试夹具和 `API-DB-01` 任务说明，不得在业务代码中混用两套 ORM。

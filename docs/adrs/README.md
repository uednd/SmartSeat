# SmartSeat ADR Index

本目录记录 SmartSeat 后续实现必须遵守的关键架构决策。ADR 用于约束编码任务的默认技术路线，避免 ORM、测试、OpenAPI、部署、安全与凭据管理在后续任务中自行发散。

## 状态说明

- `Accepted`：本阶段已采纳，后续任务按该决策执行。
- `Proposed`：已有建议方向，但仍需在落地任务中验证。
- `Deferred`：本阶段明确暂缓，不阻塞本地或初赛演示。

ADR 变更不得直接抹除历史决策。若后续需要调整，应新增 ADR 或在原 ADR 中追加 supersede 说明。

## ADR 列表

| ADR | 状态 | 决策主题 |
|---|---|---|
| [0001](0001-orm-migrations-seed.md) | Accepted | ORM 选型、迁移策略、seed 策略 |
| [0002](0002-testing-strategy.md) | Accepted | 单元测试、集成测试、E2E 测试框架与目录约定 |
| [0003](0003-openapi-generation.md) | Accepted | OpenAPI 生成与发布方式 |
| [0004](0004-ci-cd-quality-gates.md) | Accepted | CI/CD 暂缓与本地质量闸门 |
| [0005](0005-deployment-targets.md) | Accepted | 本地演示、初赛演示与生产化边界 |
| [0006](0006-presence-sensor-adapter.md) | Accepted | 毫米波传感器 adapter 抽象策略 |
| [0007](0007-mqtt-security.md) | Accepted | MQTT 设备认证、安全策略与匿名 broker 边界 |
| [0008](0008-auth-credentials-management.md) | Accepted | 微信/OIDC 凭据、回调地址与 secret 管理 |

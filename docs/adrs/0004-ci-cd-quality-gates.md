# ADR 0004: CI/CD 暂缓与本地质量闸门

## 状态

Accepted

## 背景

当前仓库没有 CI/CD 配置。初赛阶段的优先目标是本地和演示环境闭环，不要求生产部署流水线。过早引入 CI/CD 可能扩大配置范围，并与尚未落地的测试框架、数据库迁移和固件构建产生耦合。

## 决策

本阶段不实现 CI/CD。

在 CI/CD 落地前，本地质量闸门为：

- `pnpm install`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm format`
- 后续测试框架落地后的单元、集成和 E2E 测试命令
- `docker compose -f infra/docker-compose.yml config`

`pnpm infra:up` 需要 Docker daemon，不能作为所有环境必过的静态闸门。若 Docker 未运行，应记录环境原因，不修改 Compose 文件来规避。

## 理由

当前阶段业务模块尚未实现，先用本地质量闸门可以验证文档、TypeScript、lint、格式和基础设施配置的最低一致性。CI/CD 推迟到核心测试与部署边界明确后再做，能减少无效流水线和后续重写成本。

## 影响范围

- `QA-01` 负责把本地质量闸门整理为发布闸门和证据索引。
- 后续新增测试命令时，需要同步根 `package.json` 或对应 workspace 脚本，并更新 Checklist 证据。
- 生产化 CI/CD 不属于本阶段完成条件。

## 回滚或替代方案

若项目需要在初赛前引入 CI，可新增 ADR 和任务，优先实现只读检查流水线：install、lint、typecheck、format、test 和 docker compose config。部署流水线仍需等待部署目标、secret 管理和生产边界明确。

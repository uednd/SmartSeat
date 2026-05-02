# ADR 0002: 测试框架与目录约定

## 状态

Accepted

## 背景

SmartSeat 包含 NestJS 后端、uni-app 微信小程序、设备模拟器、共享 contracts/API client 和 ESP32-P4 固件。当前仓库仅有 lint、typecheck 和 format 脚本，没有测试框架。

后续任务需要统一单元测试、集成测试、E2E 测试和演示证据的边界，避免各模块自行选择不同框架。

## 决策

TypeScript 单元测试和轻量集成测试统一使用 Vitest。

API HTTP 集成测试使用 Supertest 调用 NestJS application。后端测试优先覆盖 service、controller、权限、错误响应、状态机和数据库约束。

端到端测试使用 Playwright 驱动可浏览器化的演示入口和 API 链路；微信小程序真实端能力无法稳定自动化时，由 `QA-01` 留存截图、录屏或微信开发者工具执行记录。

目录约定如下：

- TypeScript 包内测试优先放在对应模块旁的 `__tests__` 目录，或使用 `*.spec.ts`。
- 跨模块 E2E 测试放在仓库级 `tests/e2e/` 或对应应用的 `e2e/` 目录。
- 演示证据放在后续 `docs/evidence/` 或 QA-01 指定目录，并按 Task ID 与 Checklist ID 索引。
- 固件测试不纳入 pnpm 统一测试链，ESP-IDF 构建与 smoke test 由固件任务单独说明。

## 理由

Vitest 与当前 ESM TypeScript monorepo 匹配，启动成本低，适合 packages、API client 和后端 service 测试。Supertest 是 NestJS HTTP 集成测试的常见选择。Playwright 可覆盖浏览器化页面、管理流程和演示链路；微信小程序专有能力保留人工执行证据，避免为初赛阶段过度建设复杂自动化。

## 影响范围

- `API-PLT-01` 需要建立后端测试基础设施。
- `API-DB-01` 到 `API-STAT-01` 的后端任务按 Vitest/Supertest 编写测试。
- `MINI-01` 到 `MINI-03` 的小程序任务按可自动化程度补 Vitest/Playwright 或演示证据。
- `QA-01` 负责汇总 E2E、演示证据和发布闸门。

## 回滚或替代方案

若 Vitest 与 NestJS、uni-app 或 ESM 配置存在不可接受兼容问题，可新增 ADR 改为 Jest。若 Playwright 无法覆盖微信开发者工具流程，E2E 可降级为 API E2E 加小程序截图/录屏证据，但必须在 `QA-01` 记录缺口与风险。

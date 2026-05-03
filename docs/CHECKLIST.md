# SmartSeat 功能完成核查清单

> 本文档与 [`docs/PLAN.md`](PLAN.md) 一一对应。任何任务只有在本文件的“通用完成宏”和对应任务专属核查项均通过，并填写证据路径后，才可在 PLAN 中标记为 `Done`。

## 1. 使用规则

1. 每个 Task ID 必须有唯一 Checklist ID，命名为 `CL-{TASK_ID}`。
2. 所有 P0/P1 任务必须先完成“通用完成宏”，再完成任务专属核查项。
3. 任何核查项不得凭口头说明勾选；必须提供证据路径。
4. 证据可以是代码路径、测试命令输出、OpenAPI 文档、MQTT 日志、截图、录屏、串口日志、E2E 报告或审计日志。
5. 涉及安全、权限、secret、用户身份、排行榜匿名、管理员操作的任务必须记录处理结论。
6. 若任务暂时无法完成，必须在 `docs/PLAN.md` 风险清单中记录阻塞原因、降级方案和责任人，不得直接勾选通过。

## 2. 通用完成宏

以下核查项默认适用于所有 P0/P1 任务。确实不适用的项必须填写“不适用原因”。

| 编号 | 核查项 | 结果 | 证据/备注 |
|---|---|---|---|
| G-01 | 代码或文档变更已提交到对应目录，未越界修改无关模块 | [x] | 当前已完成任务证据见 `CL-SHR-01`、`CL-API-PLT-01`；变更集中在 shared packages、`apps/api` 与任务文档。 |
| G-02 | 任务输入、输出、前置条件与 PLAN 中描述一致 | [x] | `docs/PLAN.md` 已标记 GOV-01、GOV-02、SHR-01、API-PLT-01 为 Done，并保留后续任务依赖。 |
| G-03 | contracts / DTO / 错误码 / MQTT payload / OpenAPI 已按需同步 | [x] | SHR-01 已同步 contracts/API client；API-PLT-01 已提供 `/docs` 与 `/openapi.json`。 |
| G-04 | 数据模型、迁移、seed、mock 数据已按需同步 | [x] | API-DB-01 已补 Prisma schema、migration 与 seed；Docker/PostgreSQL 可用后已完成实库 migration、seed 幂等和数据库集成测试核验，详见 `CL-API-DB-01`。 |
| G-05 | 单元测试、集成测试或 E2E 测试已覆盖至少一个正向场景和一个失败/边界场景 | [x] | contracts/api-client 类型样例覆盖正反向；API 平台测试覆盖 health/OpenAPI 正向与配置/错误边界。 |
| G-06 | 测试命令已实际执行并记录结果；无法执行时已记录原因 | [x] | 证据见 `CL-SHR-01`、`CL-API-PLT-01` 的测试命令与结果。 |
| G-07 | README、模块文档、接口文档或联调说明已按需更新 | [x] | `packages/contracts/README.md`、`packages/api-client/README.md`、`apps/api/README.md`、根 `README.md` 已记录当前边界。 |
| G-08 | 新增环境变量已写入 `.env.example`，未提交真实 secret | [x] | API-PLT-01 未新增环境变量；启动校验使用 `.env.example` 既有占位变量，未提交真实 secret。 |
| G-09 | 回滚或降级步骤已记录 | [x] | SHR-01 与 API-PLT-01 的回滚要求保留在 `docs/PLAN.md` 对应任务说明中。 |
| G-10 | 日志、监控、告警或至少可诊断日志已按需补齐 | [x] | API-PLT-01 请求日志包含 request id、method、path、status、duration；health 暴露依赖状态占位。 |
| G-11 | 权限、安全、隐私、匿名化检查已完成 | [x] | API-AUTH-01/02/03 已实现登录模式、用户角色、`/me`、微信/OIDC mock 闭环和 token 守卫；secret 只使用占位值且接口脱敏，未知异常不向客户端暴露 stack；小程序页面、座位/预约/MQTT 业务仍未实现。 |
| G-12 | 高风险任务的处理结论与处理意见已记录 | [x] | 高风险业务仍在后续任务；当前风险与处理方式保留在 `docs/PLAN.md` 风险清单和 ADR 中。 |

## 3. 证据记录格式

每个任务完成后，在对应条目下填写：

```md
- 代码路径：
- 测试命令：
- 测试结果：
- 接口/OpenAPI/MQTT 证据：
- 截图/录屏/日志：
- 结论：通过 / 有条件通过 / 未通过
```

## 4. 逐任务核查清单

### CL-GOV-01 需求追踪矩阵与完成性治理

- [x] 已建立“项目完成判定规则”，且规则覆盖 PRD、PLAN、CHECKLIST、证据路径、端到端链路和风险项。
- [x] 已建立 PRD 范围到 Task ID、Checklist ID 的追踪矩阵，并覆盖项目范围、登录与角色路由、MQTT 通信、座位/设备/预约状态、动态二维码、传感器与异常、管理员释放与维护、学习统计与匿名排行榜、数据模型、核心演示流程、非功能要求。
- [x] `docs/PLAN.md` 第 6 章中的每个 Task ID 在 `docs/CHECKLIST.md` 中均有唯一 `CL-{Task ID}` 对应项，且不存在孤儿 Checklist ID。
- [x] 所有 P0/P1 任务均有明确目标、非目标、前置条件、输入、输出、涉及文件/目录、接口契约、数据变更、测试要求、文档要求、部署/配置要求、回滚要求、监控与告警、验收标准、可分配给编码智能体的提示。
- [x] 已明确编码智能体执行边界，包含不得越界修改、不得顺手完成无关模块、不得重复定义契约。
- [x] 已标注高风险任务。
- [x] 已建立风险与未决问题清单，并覆盖 ORM、微信/OIDC 凭据、传感器型号、CI/CD、部署目标、单终端演示、MQTT 匿名 broker、Node/pnpm 环境一致性。
- [x] GOV-01 对应的治理结构调整已落入 `docs/PLAN.md` 与 `docs/CHECKLIST.md`。

### CL-GOV-02 ADR 决策包

- [x] ORM 选型、迁移策略、seed 策略已记录。
- [x] 测试框架、E2E 框架、测试目录约定已记录。
- [x] OpenAPI 生成与发布方式已记录。
- [x] CI/CD 是否本阶段实现已记录；若不实现，已说明本地闸门替代方式。
- [x] 部署目标范围已记录，且明确本阶段只保证本地/演示环境或其他指定环境。
- [x] 传感器型号未确定的 adapter 策略已记录。
- [x] MQTT 设备认证、安全策略、本地匿名 broker 的边界已记录。
- [x] 微信/OIDC 凭据、回调地址、secret 管理边界已记录。
- [x] 每个 ADR 均有状态、决策、理由、影响范围、回滚方式。

### CL-SHR-01 共享契约与 API Client 基线

- [x] 座位业务状态、设备在线状态、可用性状态、预约状态、异常状态与 PRD 一致。
- [x] REST DTO 覆盖登录、用户、座位、设备、预约、签到、异常、统计、排行榜、管理员接口的核心输入输出。
- [x] 统一错误码包含认证失败、权限不足、座位不可用、预约冲突、二维码过期、重复签到、设备离线、payload 非法等核心场景。
- [x] MQTT topic 与 payload 覆盖 heartbeat、presence、event、display、light、command。
- [x] `packages/api-client` 提供 typed client 方法签名，并统一处理 base URL、token、错误响应。
- [x] API、miniapp、simulator 不再各自重复手写核心状态字符串。
- [x] TypeScript 类型检查通过。
- [x] 证据路径已填写：

  - 代码路径：`packages/contracts/src/enums.ts`、`packages/contracts/src/api.ts`、`packages/contracts/src/mqtt.ts`、`packages/api-client/src/index.ts`
  - 类型样例：`packages/contracts/src/__tests__/contracts.typecheck.ts`、`packages/api-client/src/__tests__/api-client.typecheck.ts`
  - 文档路径：`packages/contracts/README.md`、`packages/api-client/README.md`
  - 测试命令：`pnpm --filter @smartseat/contracts typecheck`；`pnpm --filter @smartseat/api-client typecheck`；`pnpm typecheck`；`pnpm lint`；`pnpm format`
  - 测试结果：全部通过。
  - 接口/OpenAPI/MQTT 证据：REST DTO、统一错误模型、MQTT topic pattern/build helper、heartbeat/presence/event/display/light/command payload 均在 `packages/contracts` 统一导出；API client 采用 operation_id + transport 注入，真实 REST path 等 API-PLT-01/OpenAPI 绑定。
  - 截图/录屏/日志：不适用，SHR-01 不实现页面、真实后端或 MQTT 连接。
  - 结论：通过。

### CL-API-PLT-01 后端平台基础

- [x] 环境变量校验已启用，缺失关键配置时服务启动失败并给出明确错误。
- [x] 全局错误响应格式统一，并能映射 contracts 错误码。
- [x] 请求日志包含 request id、method、path、status、duration。
- [x] `/health` 可返回服务状态，并预留数据库/MQTT 状态检查。
- [x] OpenAPI 文档可生成或访问。
- [x] ScheduleModule 或等价调度机制已初始化，可注册周期任务。
- [x] 鉴权基础设施、用户上下文或装饰器已准备好供业务模块使用。
- [x] 已补充配置、错误处理、health 的测试。
- [x] 证据路径已填写：

  - 代码路径：`apps/api/src/common/config/api-env.ts`、`apps/api/src/common/errors/http-exception.filter.ts`、`apps/api/src/common/request/request-logging.middleware.ts`、`apps/api/src/common/openapi/openapi.ts`、`apps/api/src/app.controller.ts`、`apps/api/src/app.module.ts`
  - 鉴权占位：`apps/api/src/common/auth/request-user.ts`、`apps/api/src/common/auth/current-user.decorator.ts`
  - 测试路径：`apps/api/src/__tests__/api-env.spec.ts`、`apps/api/src/__tests__/api-platform.spec.ts`
  - 文档路径：`apps/api/README.md`
  - 测试命令：`pnpm --filter @smartseat/api test`；`pnpm --filter @smartseat/api typecheck`；`pnpm --filter @smartseat/api lint`；`pnpm typecheck`；`pnpm lint`；`pnpm format`
  - 测试结果：全部通过。
  - 接口/OpenAPI/MQTT 证据：`GET /health` smoke 返回 `status/service/version/environment/dependencies`；`GET /openapi.json` smoke 返回 OpenAPI `3.0.0` 且包含 `/health`；`GET /docs` smoke 返回 HTTP 200；本任务不实现真实 MQTT 连接。
  - 截图/录屏/日志：`pnpm dev:api` 本地启动成功；请求日志输出 `request_id/method/path/status/duration_ms`；手动 `SIGINT` 停止服务导致 dev 命令以 130 退出，属于人工停止。
  - 结论：通过。

### CL-API-DB-01 数据模型、迁移与 seed 基线

- [x] User 模型已包含角色、匿名名、微信 openid/OIDC subject 映射或等价字段。
- [x] AuthConfig 模型已支持登录模式与必要配置状态。
- [x] Seat 模型已包含座位编号、业务状态、可用性、不可用原因、维护状态。
- [x] Device 模型已包含 device_id、绑定座位、在线状态、最后心跳、固件/硬件信息占位。
- [x] Reservation 模型已支持预约、签到、使用中、取消、no-show、完成、待释放等状态流转所需字段。
- [x] QRToken 模型已支持 token、过期时间、使用状态、关联预约/座位/设备。
- [x] SensorReading 模型已支持 presence 四态、raw_value、时间戳、device_id/seat_id。
- [x] AnomalyEvent 模型已支持异常类型、状态、来源、处理人、处理时间、处理备注。
- [x] StudyRecord 模型已支持有效学习时长、开始/结束时间、来源预约。
- [x] AdminActionLog 模型已支持 admin、action、target、reason、detail、timestamp。
- [x] 索引、唯一约束、外键已按查询和状态机需要配置。
- [x] migration 可执行，rollback/down 或等价回滚说明已提供：Docker PostgreSQL 已执行 `api-db-init`，migration 输出 `No pending migrations to apply`；rollback 等价策略已写入 `apps/api/README.md`。
- [x] seed 可生成至少 1 个座位、1 个设备、学生/管理员测试账号、排行榜演示数据：Docker PostgreSQL 已落库，重复 seed 输出 `API-DB-01 seed complete: users=4, seats=1, devices=1, study_records=4`。
- [x] 证据路径已填写：

  - 代码路径：`apps/api/prisma/schema.prisma`、`apps/api/prisma/migrations/20260502000000_api_db_01_baseline/migration.sql`、`apps/api/prisma/seed.ts`、`apps/api/src/common/database/prisma.service.ts`、`apps/api/src/modules/database-baseline/**`
  - 测试路径：`apps/api/src/__tests__/api-db-enums.spec.ts`、`apps/api/src/__tests__/api-db.integration.spec.ts`、`apps/api/src/__tests__/api-platform.spec.ts`
  - 文档路径：`apps/api/README.md`、`docs/PLAN.md`、`docs/CHECKLIST.md`
  - 已通过命令：`pnpm install`；`pnpm --filter @smartseat/api db:generate`；`pnpm --filter @smartseat/api test`；`RUN_DATABASE_TESTS=1 pnpm --filter @smartseat/api test`；`pnpm --filter @smartseat/api typecheck`；`pnpm lint`；`pnpm typecheck`；`pnpm format`；`pnpm docker:config`；`pnpm docker:build`；`pnpm docker:up`；重复 `docker compose --env-file .env.deploy -f infra/docker-compose.deploy.yml run --rm api-db-init`；`curl http://localhost:3000/health`；`curl http://localhost:3000/openapi.json`
  - 阻塞命令：无。首次 `pnpm docker:build` 曾遇到 Docker Hub `node:24-alpine` metadata EOF，重试后通过。
  - 结论：通过；API-DB-01 状态已更新为 Done。

### CL-API-AUTH-01 登录模式配置、用户角色与首个管理员引导

- [x] `GET /auth/mode` 可返回当前登录模式和前端需要的脱敏配置状态。
- [x] 管理员可通过受保护接口切换登录模式。
- [x] 配置接口不返回 `client_secret`、微信 secret 或其他敏感明文。
- [x] `/me` 可返回当前用户、角色、匿名名、nextRoute 等小程序路由所需信息。
- [x] 系统无用户时，首个注册/登录用户成为管理员；该规则只触发一次。
- [x] 普通用户不能访问管理员配置接口。
- [x] token 签发、解析、过期处理具备基础测试。
- [x] 登录模式变更和首个管理员初始化有审计或日志记录。
- [x] 证据路径已填写：

  - 代码路径：`apps/api/src/modules/auth/**`、`apps/api/src/modules/users/**`、`apps/api/src/common/auth/**`、`apps/api/src/common/config/api-env.ts`、`apps/api/src/app.module.ts`、`packages/contracts/src/api.ts`、`.env.example`、`apps/api/package.json`
  - 测试路径：`apps/api/src/__tests__/api-auth.spec.ts`、`apps/api/src/__tests__/api-env.spec.ts`
  - 文档路径：`docs/PLAN.md`、`docs/CHECKLIST.md`
  - 已通过命令：`pnpm --filter @smartseat/api test`；`pnpm --filter @smartseat/api typecheck`；`pnpm lint`；`pnpm typecheck`；`pnpm format`
  - 阻塞命令：无。本任务未启动 Docker，未做真实微信 code 换 openid 或 OIDC 授权码回调联调。
  - 结论：通过；API-AUTH-01 状态已更新为 Done。

### CL-API-AUTH-02 微信登录闭环

- [x] 微信 provider 已封装 code 到 openid 的交换逻辑，且可 mock 测试。
- [x] `POST /auth/wechat/login` 已实现，并只在微信登录模式下可用。
- [x] 新微信用户可一键注册/登录。
- [x] 已存在微信用户可直接登录。
- [x] 首个用户成为管理员的规则与 API-AUTH-01 一致。
- [x] 微信接口失败、无效 code、登录模式不匹配均返回明确错误码。
- [x] 普通日志不记录 openid 明文或敏感凭据。
- [x] `.env.example` 已记录微信配置项但不含真实值。
- [x] 证据路径已填写：

  - 代码路径：`apps/api/src/modules/auth/wechat-auth.provider.ts`、`apps/api/src/modules/auth/wechat-auth.service.ts`、`apps/api/src/modules/auth/auth.controller.ts`、`apps/api/src/modules/users/users.service.ts`、`apps/api/prisma/schema.prisma`、`apps/api/prisma/migrations/20260502010000_api_auth_02_wechat_login/migration.sql`、`packages/contracts/src/api.ts`、`.env.example`
  - 测试路径：`apps/api/src/__tests__/api-auth.spec.ts`、`apps/api/src/__tests__/api-env.spec.ts`
  - 文档路径：`docs/PLAN.md`、`docs/CHECKLIST.md`
  - 已通过命令：`pnpm --filter @smartseat/api db:generate`；`pnpm --filter @smartseat/api test`；`pnpm --filter @smartseat/api typecheck`；`pnpm lint`；`pnpm typecheck`；`pnpm format`
  - 阻塞命令：无。本任务未启动真实微信服务，未实现小程序页面。
  - 结论：通过；API-AUTH-02 状态已更新为 Done。

### CL-API-AUTH-03 OIDC 登录闭环

- [x] `GET /auth/oidc/authorize-url` 可生成授权地址并返回小程序可处理的 `state`。
- [x] `POST /auth/oidc/callback` 可完成 mock code 换 subject、用户绑定和系统 token 签发。
- [x] OIDC state/nonce 或等价防重放机制已实现。
- [x] `client_secret` 仅后端使用，不出现在小程序代码、接口返回、普通日志中。
- [x] OIDC 模式下无前端注册入口和后端注册接口。
- [x] 已存在 subject 可映射到用户；新用户按首个管理员规则创建。
- [x] 回调失败、provider 不可达、登录模式不匹配均有明确错误码。
- [x] `.env.example` 已记录 issuer、client id、client secret、redirect uri、provider mode 等配置项。
- [x] 证据路径已填写：

  - 代码路径：`apps/api/src/modules/auth/oidc-auth.provider.ts`、`apps/api/src/modules/auth/oidc-auth.service.ts`、`apps/api/src/modules/auth/oidc-state.service.ts`、`apps/api/src/modules/auth/auth.controller.ts`、`apps/api/src/modules/auth/auth.module.ts`、`apps/api/src/common/config/api-env.ts`、`packages/contracts/src/api.ts`、`packages/api-client/src/index.ts`、`.env.example`、`apps/api/package.json`
  - 测试路径：`apps/api/src/__tests__/api-auth.spec.ts`、`apps/api/src/__tests__/api-env.spec.ts`
  - 文档路径：`docs/PLAN.md`、`docs/CHECKLIST.md`
  - 已通过命令：`pnpm add openid-client@^6.8.4 --filter @smartseat/api`；`pnpm --filter @smartseat/api test`；`pnpm --filter @smartseat/api typecheck`；`pnpm lint`；`pnpm typecheck`；`pnpm format`
  - 阻塞命令：无。本任务未启动真实学校 OIDC Provider 外网联调，未实现小程序页面或 OIDC 管理员组映射。
  - 结论：通过；API-AUTH-03 状态已更新为 Done。

### CL-API-SEAT-01 座位/设备查询聚合

- [ ] `GET /seats` 返回学生可用座位列表，并隐藏管理字段。
- [ ] `GET /seats/:id` 返回座位详情、可预约性、不可用原因。
- [ ] 管理员座位查询包含设备状态、维护状态、异常摘要、当前预约摘要。
- [ ] 派生状态包含 `business_status + availability_status + unavailable_reason + online_status`。
- [ ] 离线、维护、已预约、使用中、待释放等组合状态计算正确。
- [ ] 不可预约原因与 PRD 一致。
- [ ] 查询接口具备权限测试和字段脱敏测试。
- [ ] 证据路径已填写：____

### CL-API-RES-01 预约创建、冲突校验与取消

- [ ] 学生可对空闲且可用座位创建预约。
- [ ] 同一座位同一时间窗口冲突会被拒绝。
- [ ] 同一学生同一时间只能存在一个有效预约或符合 PRD 的限制规则。
- [ ] 不可用、维护、离线策略下的座位不能被预约。
- [ ] 签到窗口开始/结束时间计算正确。
- [ ] 签到前可取消预约，取消后座位状态一致回退。
- [ ] 无权限取消、重复取消、已签到后取消等边界场景已测试。
- [ ] 预约创建/取消有可诊断日志。
- [ ] 证据路径已填写：____

### CL-API-RES-02 续约、主动离座与到期结束

- [ ] 使用中预约可在无冲突时续约。
- [ ] 续约冲突、非法状态续约、非本人续约均被拒绝。
- [ ] 学生可主动离座，预约状态结束，座位释放。
- [ ] 主动离座后可生成 StudyRecord 或触发生成逻辑。
- [ ] 到期无人时预约正常结束并释放座位。
- [ ] 到期仍检测有人时进入 `PENDING_RELEASE` 或 PRD 指定状态。
- [ ] 状态机重复执行保持幂等，不产生重复记录。
- [ ] 终端状态同步触发点已预留或接入。
- [ ] 证据路径已填写：____

### CL-API-IOT-01 MQTT 接入、设备在线状态与命令总线

- [ ] 后端可连接本地 Mosquitto 或配置指定 broker。
- [ ] 已订阅 heartbeat topic，并校验 payload。
- [ ] 心跳可更新 Device 最后在线时间和在线状态。
- [ ] 超过 75 秒或配置阈值未收到心跳时可判定离线。
- [ ] 设备恢复在线后可重新同步最新座位显示/灯光状态。
- [ ] 后端可发布 display、light、command payload。
- [ ] 非法 device_id、非法 payload、broker 断连均有日志和错误处理。
- [ ] MQTT 配置项已写入 `.env.example`。
- [ ] 证据路径已填写：____

### CL-API-RES-03 动态二维码与扫码签到

- [ ] QRToken 数据模型支持生成、过期、已使用、失效状态。
- [ ] 终端 display payload 中可下发当前有效二维码 token 或二维码内容。
- [ ] token 刷新周期与有效期满足 PRD 约束，例如 15 秒刷新、30 秒有效，或配置等价规则。
- [ ] `POST /checkin` 校验用户、预约、座位、签到窗口、token 状态。
- [ ] token 一次性使用，重复签到失败。
- [ ] 过期 token、非本人签到、已取消预约、超出签到窗口均失败并返回明确错误码。
- [ ] 签到成功后预约进入 `OCCUPIED`，并触发终端状态同步。
- [ ] OpenAPI 与错误码文档已更新。
- [ ] 证据路径已填写：____

### CL-API-IOT-02 传感器接入与持续时间判断

- [ ] presence payload 统一映射为 `PRESENT/ABSENT/UNKNOWN/ERROR`。
- [ ] 原始传感器值 `raw_value` 或等价调试字段已保留。
- [ ] SensorReading 可按 device_id、seat_id、timestamp 持久化。
- [ ] PRESENT 持续阈值判断正确。
- [ ] ABSENT 持续阈值判断正确。
- [ ] UNKNOWN/ERROR 持续阈值判断正确。
- [ ] 抖动数据不会立即触发误判。
- [ ] 阈值可配置并记录在 `.env.example` 或文档中。
- [ ] 证据路径已填写：____

### CL-API-IOT-03 调度任务、自动规则与异常事件

- [ ] no-show 扫描可在签到窗口结束后自动释放预约并记录未到。
- [ ] ENDING_SOON 或到期提醒状态可按配置时间切换。
- [ ] 空闲座位持续检测到有人时生成“疑似未预约占用”异常。
- [ ] 使用中座位持续检测无人时生成“疑似提前离座”异常或提醒。
- [ ] 到期仍有人时进入待释放或生成异常。
- [ ] 设备离线事件可生成异常或影响可用性状态。
- [ ] 异常事件具有类型、状态、来源、关联座位/设备/预约、创建时间。
- [ ] 周期任务幂等，不重复生成同一未处理异常。
- [ ] 任务执行时长、扫描数量、失败原因有日志。
- [ ] 证据路径已填写：____

### CL-API-ADM-01 管理员接口、手动释放、维护与审计

- [ ] 管理员看板接口可返回座位、设备、异常、no-show 汇总。
- [ ] 普通学生访问管理员接口被拒绝。
- [ ] 管理员可查看座位详情与当前预约/设备/异常信息。
- [ ] 管理员可查看设备在线/离线和最后心跳。
- [ ] 管理员可查看异常事件并更新处理状态。
- [ ] 管理员手动释放必须填写原因。
- [ ] 手动释放后座位/预约/终端状态同步正确。
- [ ] 管理员可切换座位或设备维护状态，并可恢复。
- [ ] 关键操作写入 AdminActionLog，包含 admin、action、target、reason、detail、timestamp。
- [ ] 系统配置接口不暴露 secret 明文。
- [ ] 证据路径已填写：____

### CL-API-STAT-01 学习记录、个人统计与匿名排行榜

- [ ] 主动离座、正常结束、管理员释放等场景下学习记录生成规则明确。
- [ ] `<15` 分钟或 PRD 指定阈值以下记录不计入有效学习。
- [ ] `/stats/me` 返回本周到馆次数、累计学习时长、连续学习天数等个人统计。
- [ ] `/leaderboard` 支持周学习时长榜、到馆次数榜、连续学习榜。
- [ ] 榜单默认或按规则匿名展示，不暴露真实姓名、openid、学号等身份信息。
- [ ] 学生可退出/参与榜单，退出后不出现在公共榜单中。
- [ ] 当前学生可看到自己的匿名排名或个人位置。
- [ ] 统计跨天、跨周边界测试已覆盖。
- [ ] 证据路径已填写：____

### CL-MINI-01 小程序公共壳层、登录页与角色路由

- [ ] 所有实际页面均已注册到 `pages.json`。
- [ ] 小程序可作为体验版运行的基础配置已具备。
- [ ] 公共 API client 使用 `packages/api-client` 或统一封装，不散落手写请求。
- [ ] 登录页可展示当前登录模式。
- [ ] 微信登录入口可调用后端微信登录接口。
- [ ] OIDC 登录入口可进入后端 OIDC start/callback 流程或体验版等价流程。
- [ ] 登录后按后端返回角色进入学生或管理员首页。
- [ ] 未登录访问受保护页面会跳转登录。
- [ ] 退出登录会清除 token 和用户状态。
- [ ] token 过期或 401 有统一处理。
- [ ] 证据路径已填写：____

### CL-MINI-02 学生页面闭环

- [ ] 学生首页可展示座位状态、可预约性和不可用原因。
- [ ] 座位详情页可展示预约所需信息。
- [ ] 学生可创建预约并看到预约结果。
- [ ] 学生可取消未签到预约。
- [ ] 学生可调用扫码能力并提交二维码 token 签到。
- [ ] 签到成功后进入当前使用页，显示剩余时间和座位状态。
- [ ] 学生可续约，续约失败原因可理解展示。
- [ ] 学生可主动离座，离座后状态刷新。
- [ ] 学生可查看预约未到记录。
- [ ] 学生可查看学习统计。
- [ ] 学生可查看匿名排行榜，且不展示真实身份。
- [ ] 后端错误码已映射到用户可理解提示。
- [ ] 证据路径已填写：____

### CL-MINI-03 管理员页面闭环

- [ ] 管理员首页可展示座位、设备、异常、no-show 汇总。
- [ ] 座位管理页可查看座位状态、当前预约、维护状态。
- [ ] 设备管理页可查看设备在线/离线、最后心跳、绑定座位。
- [ ] 异常事件页可查看异常类型、状态、关联座位/设备、处理入口。
- [ ] no-show 记录可查看。
- [ ] 管理员可手动释放座位，并必须填写释放原因。
- [ ] 管理员可切换维护/恢复状态。
- [ ] 系统配置页可查看和切换登录模式。
- [ ] 配置页不展示或保存 secret 明文。
- [ ] 普通学生无法进入管理员页面；后端拒绝越权接口请求。
- [ ] 证据路径已填写：____

### CL-FW-01 固件基础与传感器适配抽象

- [ ] ESP-IDF 工程可配置、可编译或至少通过当前环境可执行的构建前检查。
- [ ] `display` component 边界已建立。
- [ ] `light` component 边界已建立。
- [ ] `mqtt` component 边界已建立。
- [ ] `presence_sensor` component 边界已建立。
- [ ] Wi-Fi 配置不写死真实凭据。
- [ ] MQTT broker、device_id 等配置不写死真实值。
- [ ] presence adapter 输出统一四态：`PRESENT/ABSENT/UNKNOWN/ERROR`。
- [ ] 传感器型号未确定时，可通过 mock adapter 或占位 adapter 开发联调。
- [ ] 串口日志可显示网络、MQTT、presence 基础状态。
- [ ] 证据路径已填写：____

### CL-FW-02 屏幕、灯光与状态同步

- [ ] 终端可订阅 display/light/command topic。
- [ ] 空闲、已预约、使用中、即将结束、待释放、维护/故障状态均有显示映射。
- [ ] 已预约状态可显示动态二维码或二维码内容。
- [ ] 使用中/即将结束状态可显示剩余时间。
- [ ] 状态灯可按后端命令切换。
- [ ] 后端状态变化后 3 秒内完成屏幕和灯光更新，或记录未达成原因。
- [ ] MQTT 断线后终端显示离线/同步中状态，不继续使用旧 token 完成签到。
- [ ] 重连后能同步最新状态。
- [ ] 本地异常状态有清晰显示或日志。
- [ ] 证据路径已填写：____

### CL-SIM-01 设备模拟器闭环

- [ ] 模拟器可通过 CLI 配置 broker、device_id、seat_id、scenario、interval。
- [ ] 模拟器可定时发送 heartbeat。
- [ ] 模拟器可发送 PRESENT、ABSENT、UNKNOWN、ERROR presence。
- [ ] 模拟器可模拟断线或停止心跳。
- [ ] 模拟器可订阅并打印 display 命令。
- [ ] 模拟器可订阅并打印 light 命令。
- [ ] 模拟器可用于 no-show、占用异常、提前离座、设备离线等演示场景。
- [ ] 模拟器日志包含 publish/subscribe 明细，便于作为证据。
- [ ] 证据路径已填写：____

### CL-OPS-01 本地基础设施、seed 与 demo reset

- [x] `docker-compose` 或等价命令可启动 PostgreSQL 与 Mosquitto：`pnpm docker:up` 已启动单机 deploy compose；`pnpm docker:ps` 显示 PostgreSQL 与 Mosquitto healthy。
- [x] 本地 MQTT 匿名配置的边界已写明，仅用于本地/演示。
- [ ] `.env.example` 覆盖 API、miniapp、simulator、firmware 本地联调所需配置。
- [x] seed 可创建演示座位、设备、学生、管理员、学习记录：`api-db-init` 重复执行通过，输出 `users=4, seats=1, devices=1, study_records=4`。
- [ ] reset-demo 可重复执行，并恢复演示初始状态。
- [ ] 脚本失败时输出可诊断错误。
- [x] README 或联调文档说明启动顺序、常见问题、停止/清理命令。
- [x] 回滚/清理步骤已写明，包括数据库 volume 或演示数据清理。
- [x] 证据路径已填写：

  - 代码路径：`apps/api/Dockerfile`、`infra/docker-compose.deploy.yml`、`.dockerignore`、`.env.deploy.example`、根 `package.json`
  - 文档路径：`README.md`、`apps/api/README.md`、`docs/PLAN.md`、`docs/CHECKLIST.md`
  - 已通过命令：`pnpm docker:config`；`pnpm docker:build`；`pnpm docker:up`；`pnpm docker:ps`；`curl http://localhost:3000/health`；`curl http://localhost:3000/openapi.json`；重复 `docker compose --env-file .env.deploy -f infra/docker-compose.deploy.yml run --rm api-db-init`
  - 剩余未勾选项：`.env.example` 全端联调覆盖、完整 reset-demo、脚本失败诊断、SIM-01 联动和端到端演示证据仍待 OPS-01 后续完成。

### CL-QA-01 测试、E2E、演示证据与发布闸门

- [ ] 已建立测试矩阵，覆盖所有 P0/P1 任务。
- [ ] 每个 P0/P1 任务至少有一个正向场景和一个失败/边界场景。
- [ ] 登录与角色路由 E2E 通过。
- [ ] 预约与取消 E2E 通过。
- [ ] 动态二维码与扫码签到 E2E 通过。
- [ ] 续约与主动离座 E2E 通过。
- [ ] no-show 自动释放 E2E 通过。
- [ ] 空闲占用异常 E2E 通过。
- [ ] 提前离座异常 E2E 通过。
- [ ] 设备离线/恢复 E2E 通过。
- [ ] 管理员手动释放 E2E 通过。
- [ ] 学习统计与匿名排行榜 E2E 通过。
- [ ] 登录模式切换演示通过。
- [ ] `docs/DEMO.md` 中所有演示脚本均已执行并留存证据。
- [ ] 所有证据已建立索引，能追溯到 Task ID 和 Checklist ID。
- [ ] 发布闸门结论已填写：____

## 5. 功能链路闸门

### 5.1 登录与角色路由闸门

- [ ] 微信登录模式可完成登录。
- [ ] OIDC 登录模式可完成登录或在缺少真实 Provider 时通过 mock/测试 Provider 证明流程。
- [ ] OIDC 模式不提供注册入口。
- [ ] 后端返回角色，小程序按角色进入对应页面。
- [ ] 普通学生不能访问管理员接口和管理员页面。
- [ ] 首个用户成为管理员的规则已验证。
- [ ] 关联任务：API-AUTH-01、API-AUTH-02、API-AUTH-03、MINI-01。

### 5.2 预约与扫码签到闸门

- [ ] 学生可查看座位状态。
- [ ] 学生可预约空闲座位。
- [ ] 终端或模拟器可收到已预约显示状态。
- [ ] 动态二维码刷新与有效期符合配置。
- [ ] 学生扫码签到成功后进入使用中。
- [ ] 重复、过期、非本人、超时签到失败。
- [ ] 关联任务：API-SEAT-01、API-RES-01、API-RES-03、MINI-02、FW-02、SIM-01。

### 5.3 设备与传感器闸门

- [ ] 设备或模拟器可上报心跳。
- [ ] 后端可判定在线/离线。
- [ ] 后端可下发 display/light 命令。
- [ ] 传感器上报四态可被后端接收并持久化。
- [ ] 持续时间阈值能避免短时抖动误判。
- [ ] 关联任务：API-IOT-01、API-IOT-02、FW-01、FW-02、SIM-01。

### 5.4 异常与管理员释放闸门

- [ ] no-show 可自动释放并记录。
- [ ] 空闲占用可生成异常。
- [ ] 提前离座可生成异常或提醒。
- [ ] 到期仍有人可进入待释放或异常处理。
- [ ] 管理员可查看异常并处理。
- [ ] 管理员手动释放必须填写原因并记录审计日志。
- [ ] 释放后终端和小程序状态同步。
- [ ] 关联任务：API-IOT-03、API-ADM-01、MINI-03、FW-02。

### 5.5 学习统计与匿名排行榜闸门

- [ ] 有效学习记录生成规则正确。
- [ ] 个人统计显示本周到馆次数、累计学习时长、连续学习天数。
- [ ] 匿名排行榜不展示真实身份。
- [ ] 退出榜单后不出现在公共榜单。
- [ ] 演示数据可展示多用户排名。
- [ ] 关联任务：API-STAT-01、MINI-02、OPS-01。

### 5.6 初赛演示闸门

- [ ] 初赛实际演示终端数量按 1 个真实终端准备。
- [ ] 无传感器或传感器未到货时，可用模拟器完成主要联调与演示备选。
- [ ] reset-demo 可恢复演示初始状态。
- [ ] `docs/DEMO.md` 中 8 个演示脚本均可执行或有明确降级说明。
- [ ] 演示用账号、座位、设备、排行榜数据已准备。
- [ ] 所有演示步骤有截图、录屏或日志证据。
- [ ] 关联任务：OPS-01、QA-01、SIM-01。

## 6. 全局发布闸门

项目发布或标记“全部功能完成”前，必须逐项通过：

| 编号 | 发布闸门 | 结果 | 证据 |
|---|---|---|---|
| R-GATE-01 | PLAN 中所有 P0/P1 任务均为 `Done` | [ ] |  |
| R-GATE-02 | 本 CHECKLIST 中所有 P0/P1 任务核查项均已完成 | [ ] |  |
| R-GATE-03 | 所有功能链路闸门均通过 | [ ] |  |
| R-GATE-04 | `docs/DEMO.md` 所有演示脚本均通过或已有降级说明 | [ ] |  |
| R-GATE-05 | 所有 OpenAPI/DTO/MQTT 契约与实现一致 | [ ] |  |
| R-GATE-06 | 数据迁移、seed、reset-demo 可执行 | [ ] |  |
| R-GATE-07 | 小程序体验版关键页面可运行 | [ ] |  |
| R-GATE-08 | 真实终端或模拟器可完成 MQTT 联调 | [ ] |  |
| R-GATE-09 | 安全检查通过：无真实 secret、无越权、无排行榜身份泄露 | [ ] |  |
| R-GATE-10 | 风险清单无未处理 P0 阻塞项 | [ ] |  |
| R-GATE-11 | 证据索引完整，可追溯到 Task ID、Checklist ID、PRD 范围 | [ ] |  |
| R-GATE-12 | 最终结论为通过 | [ ] |  |

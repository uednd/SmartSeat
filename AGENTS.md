## 项目定位

本项目是校园图书馆智能座位管理原型系统。初赛目标是运行 1 个 ESP32-P4 智能座位终端，交付 uni-app 微信小程序体验版，并通过后端完成认证、角色、座位、预约、设备、MQTT、异常、统计和管理能力。

## 必做任务

必须阅读一遍 `docs/PLAN.md`：任务拆解与依赖文档，了解项目当前基线。

## 当前基线与编码任务边界

### 关键边界：

- 学生和管理员共用同一小程序入口。
- 管理页面属于同一小程序内的管理员页面，不建设独立 Web 管理台。
- 设备通信采用 MQTT。
- 毫米波人体存在传感器必须通过统一适配层接入。

### 当前已完成基线

- `packages/contracts` 已提供共享状态枚举、REST DTO、错误码、分页/时间模型、MQTT topic 与 payload。
- `packages/api-client` 已提供 typed client 方法边界、transport 注入、base URL/token 注入与统一错误归一化。
- `apps/api` 已具备 NestJS 平台层：配置校验、统一错误响应、request id 与请求日志、OpenAPI、ScheduleModule、增强版 `/health`。
- `apps/miniapp`、`apps/device-simulator`、`firmware/smart-seat-terminal` 仍以骨架/占位为主。
- 数据库业务 schema、Prisma 模型/迁移/seed、真实 MQTT 连接、认证与预约等业务模块仍未实现。

### 未实现业务边界

除非任务明确要求，否则不得实现以下内容：

- 登录、微信登录、OIDC 登录。
- 座位预约、扫码签到、续约、离座。
- 真实 MQTT 连接、订阅、发布、topic 处理。
- 数据库业务 schema、Prisma/TypeORM 模型、迁移。
- 小程序真实页面、角色路由、API 调用逻辑。
- 排行榜、学习统计、异常检测。
- ESP32-P4 固件业务逻辑。
- 毫米波传感器真实适配。
- 真实密钥、生产配置或可用于生产的账号密码。

占位任务中允许输出 initialized-only 提示，但不得伪造业务行为、模拟真实鉴权结果、写入测试用户数据或创建业务状态流转。已完成的平台层、contracts 和 api-client 只能作为后续业务实现的基础，不代表认证、预约、数据库、MQTT 或小程序业务已完成。

### 任务边界

开始实现前先确认目标、非目标、前置条件、输入输出、涉及目录与验收口径。交付时必须遵守以下边界：

1. 只修改任务明确列出的文件或目录；确需越界时，先同步 `docs/PLAN.md` 中的任务边界、依赖关系与对应 `docs/CHECKLIST.md` 核查项。
2. 不在一个任务中顺手完成无关模块。例如实现扫码签到时，不得同时实现排行榜页面、管理员页面或固件联动之外的额外能力。
3. 不假设仓库中存在未声明的隐藏实现。当前工程基线以本文件“当前已完成基线”和 `docs/PLAN.md` 第 2 章为准，新增能力必须从现有骨架明确落地。
4. 跨端状态、DTO、错误码、MQTT payload 统一进入 `packages/contracts`，小程序访问封装优先进入 `packages/api-client`，不要在多端重复定义。
5. 后端始终是业务状态可信源；小程序、设备固件、设备模拟器只负责展示、输入、上报和联调，不做最终状态裁决。
6. 接口、数据模型、配置项、MQTT topic、错误码、状态机变更都必须同步代码、测试与文档，并核对 `docs/PRD.md`、`docs/PLAN.md`、`docs/DEMO.md`、`docs/CHECKLIST.md` 是否仍一致。
7. 涉及登录、角色、首个管理员规则、secret、用户身份、排行榜匿名、管理员释放、维护状态、管理员操作日志的任务必须重点核对权限、安全与隐私边界。
8. 不得提交真实密钥、真实用户数据或真实学校身份源敏感配置；演示账号、演示数据、排行榜样本数据也必须使用脱敏或占位值。
9. 演示链路、任务完成判定、Checklist、证据归档相关任务，必须同步 Task ID、Checklist ID 与证据路径，不能只改代码不补验收口径。
10. 文档冲突时，以 `docs/PRD.md` 定义需求，以 `docs/PLAN.md` 定义任务与依赖，以 `docs/DEMO.md` 定义演示口径，以 `docs/CHECKLIST.md` 定义验收，不得静默改写原意。
11. 完成任务后，回复中必须说明完成内容、关键文件、执行命令、未实现内容、已知风险和后续确认事项。

## 仓库结构

仓库采用 pnpm workspace，根目录结构如下：

```text
apps/miniapp
apps/api
apps/device-simulator
firmware/smart-seat-terminal
packages/contracts
packages/api-client
packages/config
infra
docs
scripts
```

职责边界：

- `apps/miniapp`：uni-app 微信小程序，包含登录入口、角色路由、学生页、管理员页、API 调用封装和前端状态管理。
- `apps/api`：NestJS 后端服务，包含认证、用户、座位、预约、设备、MQTT、传感器、异常、学习记录、排行榜和管理接口。
- `apps/device-simulator`：PC 端设备模拟器，用于模拟心跳、人体存在、离线、传感器异常和设备指令接收。
- `firmware/smart-seat-terminal`：ESP32-P4 固件，按显示、灯光、MQTT、人体存在传感器等模块拆分。
- `packages/contracts`：共享类型、枚举、DTO、MQTT payload 定义。
- `packages/api-client`：小程序访问后端 API 的客户端封装。
- `packages/config`：共享 TypeScript、ESLint、Prettier 等工程配置。

业务规则、权限校验、预约状态机、设备状态判断和异常检测必须在后端实现。小程序和设备端不能作为唯一可信逻辑来源。

## 包修改边界

- `packages/contracts` 是前端、后端、设备模拟器共享类型来源。跨端状态、DTO、MQTT payload 类型应优先放在这里。
- `packages/api-client` 只放小程序访问后端的客户端封装，不放页面状态和业务 UI。
- `packages/config` 只放共享工程配置，不放业务常量。
- `apps/api` 是业务可信源；状态机、权限、设备状态判断、异常检测都应在这里实现。
- `apps/miniapp` 与 `apps/device-simulator` 只负责界面、调用和模拟，不作为唯一可信业务逻辑来源。
- `firmware/smart-seat-terminal` 不纳入 Node workspace 构建，不应依赖 npm 包。
- `infra` 只放本地开发基础设施配置。生产部署配置必须单独评估，不得复用本地占位密钥。

## 技术栈

- 包管理器：pnpm。
- Node.js：24 LTS。
- TypeScript：全仓 strict 模式。
- 小程序：uni-app，目标为微信小程序体验版。
- 后端：NestJS / TypeScript。
- 数据库：PostgreSQL。
- MQTT Broker：Mosquitto。
- 固件：ESP-IDF / C / C++，不纳入 pnpm 构建链。
- 本地基础设施：Docker Compose。

## 工程规范

- TypeScript 必须保持 strict 模式。
- 新增 workspace package 时必须加入 pnpm workspace 范围，并提供必要的 `lint` / `typecheck` 脚本或明确 initialized-only 输出。
- 不要提交 `node_modules`、构建产物、日志、`.env`、ESP-IDF build 目录。
- 不要格式化或重写 `docs/PRD.md`、`docs/PLAN.md`、`docs/DEMO.md`、`docs/CHECKLIST.md`，除非任务明确要求修改业务文档。
- 新增依赖前先判断是否必要。基础设施、业务框架、ORM、MQTT client、UI 框架等依赖不得因占位任务提前引入。
- `.env.example` 只能放占位值；真实配置必须留在本地 `.env`。
- 脚本、README 和占位输出应明确说明 initialized only，避免误导为已实现业务能力。

## 命名与状态码

- 目录和文件使用 kebab-case，例如 `device-simulator`、`study-records`、`smart-seat-terminal`。
- 类型、接口、类使用 PascalCase。
- 函数、变量使用 camelCase。
- 枚举值使用 UPPER_SNAKE_CASE，或与 PRD 状态码保持一致。
- 状态码必须以 PRD 和 `packages/contracts` 为准。确需新增状态码时，先更新 PRD 和 contracts。

核心状态：

```text
FREE RESERVED OCCUPIED ENDING_SOON PENDING_RELEASE
ONLINE OFFLINE
AVAILABLE UNAVAILABLE DEVICE_OFFLINE SENSOR_ERROR ADMIN_MAINTENANCE
WAITING_CHECKIN CHECKED_IN FINISHED CANCELLED NO_SHOW USER_RELEASED ADMIN_RELEASED TIMEOUT_FINISHED
PRESENT ABSENT UNKNOWN ERROR
```

设备离线、传感器异常和管理员维护只影响设备在线状态、座位可用性和不可用原因，不得直接覆盖座位业务状态。

## 安全与隐私

禁止提交真实密钥或敏感配置，包括微信 AppID Secret、OIDC client secret、数据库生产密码、MQTT 用户密码、私钥、真实用户 openid、unionid、OIDC subject、学号、手机号。

`.env.example` 只能使用占位值，`.env` 必须加入 `.gitignore`。

后端保存敏感配置时，小程序管理员页面不得明文展示 secret，只能展示“已配置/未配置”或脱敏值。

座位终端屏幕、小程序排行榜和公共页面不得展示学生真实身份。排行榜使用匿名标识。

## MQTT 与传感器

MQTT topic 必须遵循以下模式：

```text
seat/{device_id}/heartbeat
seat/{device_id}/presence
seat/{device_id}/event
seat/{device_id}/display
seat/{device_id}/light
seat/{device_id}/command
```

每条设备消息至少包含 `device_id`、`seat_id`、`timestamp`。

后端是座位状态的唯一可信源。设备端只负责显示、上报和执行命令。

毫米波传感器型号未确定，必须通过统一抽象输出 `PRESENT`、`ABSENT`、`UNKNOWN`、`ERROR`。后端不得依赖具体传感器型号的私有字段作为核心业务判断，原始值只能作为可选调试数据。

## 状态机

预约状态流转必须由后端控制。

不得由小程序或设备端直接决定以下最终状态：

- 预约完成。
- 预约未到。
- 管理员释放。
- 到期释放。
- 设备离线导致不可预约。
- 占用异常。
- 提前离座异常。

## 常用命令与检查

每次修改后尽量运行与改动范围相关的检查：

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm format
pnpm dev:api
pnpm dev:sim
pnpm infra:up
pnpm infra:down
```

说明：

- `pnpm dev:api` 当前启动 NestJS API 平台服务，暴露 `/health`、`/docs`、`/openapi.json`；仍未实现认证、数据库业务或真实 MQTT。
- `pnpm dev:sim` 当前只打印 initialized-only 信息。
- `pnpm infra:up` 需要 Docker daemon 已启动。如果因 Docker daemon 未运行失败，不要修改 Compose 文件，先说明环境问题。
- 固件目录不纳入 pnpm 构建链，ESP-IDF 构建需单独处理。
- 如果命令不可用或失败，必须在回复中说明原因。

## 文档与回复

文档优先级如下：

- `docs/PRD.md`：产品需求
- `docs/PLAN.md`：任务拆解与依赖
- `docs/DEMO.md`：演示流程
- `docs/CHECKLIST.md`：验收标准

不得擅自改写业务需求文档。确需修改文档时，必须在任务说明中明确要求。

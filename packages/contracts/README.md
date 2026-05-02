# @smartseat/contracts

SmartSeat 共享契约是跨端 TypeScript 状态值、REST DTO 形状、错误响应、分页模型和 MQTT payload 的统一来源。

## 状态边界

座位展示必须使用 PRD 定义的双状态模型：

- `SeatStatus` 是业务状态：`FREE`、`RESERVED`、`OCCUPIED`、`ENDING_SOON`、`PENDING_RELEASE`。
- `SeatAvailability` 和 `SeatUnavailableReason` 描述是否允许发起新预约，以及不可用原因。
- `DeviceOnlineStatus` 只表示设备连接状态。设备离线不得覆盖座位业务状态。
- `PresenceStatus` 是统一传感器适配层输出：`PRESENT`、`ABSENT`、`UNKNOWN`、`ERROR`。

后端始终是预约状态流转、可用性判定、异常创建和管理员释放规则的可信源。小程序、模拟器和固件代码应导入这些值，不要重复定义字符串。

## API 契约

`src/api.ts` 定义 SmartSeat 计划 API 面的 DTO：认证、当前用户、座位、设备、预约、签到、异常、统计、排行榜和管理员操作。这些 DTO 只描述请求与响应形状；它们不实现后端行为、持久化、登录、MQTT 或状态机。

`ApiErrorResponse` 是统一错误包络：

- `code`：稳定的 `ApiErrorCode`
- `message`：面向人的诊断文本
- `request_id`：可选追踪 ID
- `details`：可选结构化调试上下文

不要通过公开 DTO 暴露微信 secret 或 OIDC client secret 等密钥。管理员配置 DTO 对密钥字段只暴露已配置/未配置的布尔值。

## MQTT 契约

MQTT topic 遵循 PRD 模式：

```text
seat/{device_id}/heartbeat
seat/{device_id}/presence
seat/{device_id}/event
seat/{device_id}/display
seat/{device_id}/light
seat/{device_id}/command
```

使用 `buildMqttTopic(device_id, segment)` 和 `src/mqtt.ts` 中的 `Mqtt*Payload` 类型。每条设备 payload 都包含 `device_id`、`seat_id` 和 `timestamp`。这些类型只定义 payload 形状；SHR-01 不创建 broker 连接、订阅、发布流程或模拟设备行为。

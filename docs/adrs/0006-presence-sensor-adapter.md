# ADR 0006: 毫米波传感器 Adapter 抽象策略

## 状态

Accepted

## 背景

PRD 要求智能座位终端接入毫米波人体存在传感器，但具体型号尚未确定。后端业务只需要可信的人体存在状态，不应依赖某个型号的私有字段。AGENTS.md 也要求传感器必须通过统一适配层接入。

## 决策

固件和后端都以统一 presence 状态作为核心契约：

- `PRESENT`
- `ABSENT`
- `UNKNOWN`
- `ERROR`

具体传感器型号隐藏在 adapter 后面。adapter 可以保留原始值作为调试字段，但业务状态机、异常判断和预约释放逻辑只能依赖统一状态和持续时间窗口。

固件 `FW-01` 负责建立 presence adapter 接口和 mock 输出。后端 `API-IOT-02` 负责接收统一 presence payload、记录原始调试信息并做持续时间判断。

## 理由

传感器型号未定时，直接绑定具体协议会阻塞固件和后端开发。使用 adapter 可以让业务链路先围绕稳定四态推进，后续更换传感器时只替换驱动或解析层，不改预约状态机和异常规则。

## 影响范围

- `FW-01` 建立 `presence_sensor` 组件边界。
- `API-IOT-02` 接收和验证统一 presence payload。
- `SHR-01` 在 contracts 中定义 presence 状态和 MQTT payload。
- `QA-01` 需要覆盖 `PRESENT`、`ABSENT`、`UNKNOWN`、`ERROR` 与抖动数据。

## 回滚或替代方案

若最终传感器无法稳定映射四态，可新增 ADR 扩展 presence 契约，但不得让后端核心业务依赖型号私有字段。短期演示可回退到 mock presence 或设备模拟器数据，并在风险清单中保留硬件阻塞影响。

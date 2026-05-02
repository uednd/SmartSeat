# ADR 0008: 微信/OIDC 凭据、回调地址与 Secret 管理

## 状态

Accepted

## 背景

PRD 要求支持微信登录模式和 OIDC 登录模式。微信 secret、OIDC client secret、openid、unionid、OIDC subject、学号、手机号等均属于敏感信息。当前仓库没有真实凭据、回调域名或学校 OIDC 测试环境。

## 决策

微信和 OIDC secret 只允许后端读取、保存和使用。小程序、设备端、设备模拟器和管理页面不得保存或展示 secret 明文。

凭据和回调地址策略如下：

- `.env.example` 只记录占位配置名，不包含真实值。
- 真实微信 AppID Secret、OIDC client secret、数据库密码、MQTT 密码和私钥不得提交到仓库。
- 管理页面只展示“已配置/未配置”或脱敏值。
- OIDC 回调地址由后端配置，真实域名未确定前，后端任务必须支持 mock provider 或测试 provider。
- 微信登录后端通过可替换 provider 封装 code 到 openid 的交换，测试使用 mock provider。
- OIDC 登录后端必须校验 state/nonce 或等价防重放机制。

真实微信/OIDC 联调仍是风险项。没有真实凭据时，`API-AUTH-02` 和 `API-AUTH-03` 可先通过 mock provider 证明后端流程和角色路由。

## 理由

认证凭据是高风险配置，必须集中在后端控制。通过 mock provider 和脱敏展示可以让业务链路在无真实学校身份源时继续推进，同时不降低 secret 管理要求。

## 影响范围

- `API-AUTH-01` 管理登录模式和脱敏配置状态。
- `API-AUTH-02` 实现微信 provider 封装和 mock 测试。
- `API-AUTH-03` 实现 OIDC provider 封装、回调校验和 mock/测试 provider。
- `MINI-01` 只根据后端返回的登录模式展示入口，不保存 secret。
- `MINI-03` 配置页只展示非敏感字段和脱敏状态。

## 回滚或替代方案

若真实微信或 OIDC 环境无法在初赛前准备，演示可降级为 mock provider，并在 `QA-01` 和风险清单中记录真实联调缺口。若后续接入学校身份源，需要新增联调任务明确回调域名、测试账号、secret 注入方式和上线审批边界。

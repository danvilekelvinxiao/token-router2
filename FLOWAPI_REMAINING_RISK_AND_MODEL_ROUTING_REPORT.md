# FlowAPI Remaining Risk And Model Routing Report

生成时间：2026-06-08 09:15:26 CST

## 1. 当前部署状态

本次执行的是验收与风险报告，不是重新部署。生产站点已能打开核心接口：

- `https://flowapi.fun/api/health`：通过，返回 `ok:true`、`database:"ok"`，并显示至少一个上游通道可连接。
- `https://flowapi.fun/v1/models` 未带 FlowAPI API Key：通过，返回 `401 Invalid FlowAPI API Key`。
- `https://flowapi.fun/v1/chat/completions` 未带 FlowAPI API Key：通过，返回 `401 MISSING_API_KEY`。
- `https://flowapi.fun/admin/boss-wizard`：通过，返回 200，页面标题为“老板后台向导 - FlowAPI Admin”，但需要管理员登录后操作。

结论：生产站点在线，数据库在线，未知 Key 防绕过仍然有效。真实 Codex/GPT5.5 扣费调用未完成，因为本轮没有可用于测试的 FlowAPI 自有 API Key。

## 2. sub2api 本地 Key 已可用情况

用户说明：CC-Switch 中已接入 sub2api 本地部署的 API Key，并且可以作为中转站使用。

本轮无法直接读取 sub2api 管理后台真实消耗，因为缺少可用的 sub2api 后台会话或 FlowAPI 管理密钥。代码侧已存在 sub2api / 上游状态读取入口：

- `pages/api/admin/channel-monitor/summary.js`
- `lib/commercial-health.js`
- `pages/api/admin/upstreams/index.js`
- `pages/api/admin/upstreams/[id]/test.js`
- `pages/api/admin/upstreams/[id]/sync-models.js`

## 3. FlowAPI 自有 API Key 创建测试

未完成真实创建测试。

原因：本轮未提供可用于登录生产 FlowAPI 的管理员会话、普通测试账号会话，或一把可消耗余额的 FlowAPI 自有 API Key。

代码侧已存在关键能力：

- API Key 表字段：`lib/db.js` 中 `api_keys` 包含 `public_model_id`、`actual_model_id`、`model_group`、`limit_*`、`total_used_*` 等字段。
- API Key 鉴权入口：`pages/api/v1/chat/completions.js` 使用 `findCustomerByToken(clientToken)` 校验 FlowAPI 本地 Key。
- 未知 Key 拒绝：线上已验证 `/v1/models` 和 `/v1/chat/completions` 均拒绝未知 Key。

## 4. Codex 模型修复结果

部分完成，未完成真实调用验收。

已确认：

- 后台存在模型发布/同步能力：`lib/admin-commercial-config.js` 的 `upsertPublishedModel`、`publishModels` 会写入 `published_models`、`model_pricing_configs`，并同步到运行时模型配置。
- 后台老板向导存在：`pages/admin/boss-wizard.js`。
- 上游模型拉取存在：`syncUpstreamModels(upstreamId)` 调用 `BASE_URL/v1/models`。

未确认：

- 生产数据库中 Codex 的 `modelId` 是否与 sub2api 实际可调用 modelId 一致。
- Codex 是否已经绑定正确 upstream/group。
- Codex 是否已出现在 API Key 创建面板。
- Codex 是否能通过 FlowAPI 自有 API Key 真实返回并扣费。

## 5. GPT-5.5 模型接入结果

部分完成，未完成真实调用验收。

已确认的能力同 Codex。未确认项：

- 生产数据库中是否存在 GPT-5.5 的正确 `modelId`。
- GPT-5.5 是否已经通过后台测试并标记可用。
- GPT-5.5 是否能通过 FlowAPI 自有 API Key 调用并产生 usage。

## 6. 真实调用 Token 消耗结果

未完成。

本轮未执行会消耗余额的真实模型调用，因为缺少 FlowAPI 自有测试 Key。为了不伪造结果，本报告不填写虚假的 Token 数字。

需要补跑的命令：

```bash
curl https://flowapi.fun/v1/models \
  -H "Authorization: Bearer <FlowAPI测试Key>"

curl https://flowapi.fun/v1/chat/completions \
  -H "Authorization: Bearer <FlowAPI测试Key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<Codex真实modelId>",
    "messages": [{"role": "user", "content": "测试 Codex 是否能通过 FlowAPI 调用，只回复 OK"}]
  }'

curl https://flowapi.fun/v1/chat/completions \
  -H "Authorization: Bearer <FlowAPI测试Key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<GPT5.5真实modelId>",
    "messages": [{"role": "user", "content": "测试 GPT-5.5 是否能通过 FlowAPI 调用，只回复 OK"}]
  }'
```

## 7. 使用日志同步结果

代码侧具备写入能力，但本轮未完成真实新增日志验收。

证据：

- `lib/db.js` 存在 `calls` 表。
- `pages/api/v1/chat/completions.js` 成功调用后执行 `finalizeReservedCallByToken(...)`，写入 endpoint、模型、provider、Token、cost。
- 数据面板读取调用流水：`pages/dashboard.js`、`pages/api/dashboard/recent-calls.js`、`lib/dashboard-metrics.js`。

## 8. 数据面板同步结果

代码侧具备同步基础，但本轮未完成真实调用后的差量验证。

已确认：

- 调用流水 `calls` 是数据面板统计来源之一。
- API 成功调用后会写入 `calls`。

未确认：

- Codex/GPT5.5 真实调用后，生产数据面板是否在页面刷新后立即体现 Token、金额、模型排行变化。

## 9. sub2api 渠道监控结果

部分完成。

已存在：

- `GET /api/admin/channel-monitor/summary`
- `pages/api/admin/upstreams/[id]/test.js`
- `pages/api/admin/upstreams/[id]/sync-models.js`
- `pages/admin/boss-wizard.js`
- `pages/admin/commercial-health.js`

未完全满足文本要求：

- 未发现独立页面 `/admin/upstream-status`。
- 未发现独立页面 `/admin/model-tests`。
- 未发现 `channel_monitor_status`、`channel_monitor_logs`、`channel_usage_logs` 三张专用表。
- `model_test_logs` 专用表未发现。

## 10. 后台傻瓜式说明页面路径

未完成。

未发现文本要求的：

- `/admin/operator-guide`
- `/admin/content-map`

已有近似入口：

- `/admin/boss-wizard`
- `/admin/commercial-health`
- `/admin/health-check`

## 11. 各 Agent 评分

说明：本轮尝试调用子 Agent，但平台返回 `429 Too Many Requests`，两个已启动 Agent 均失败。因此以下为主线程按角色模拟的验收会议评分，不冒充真实子 Agent 成功执行。

| Agent | 评分 | 通过项 | 不足项 | 上线前必须修复 | 上线后优化 | 后台傻瓜式评价 |
| --- | ---: | --- | --- | --- | --- | --- |
| CEO Agent | 6.0 | 站点在线；未知 Key 401；有老板向导雏形 | 未完成真实 Codex/GPT5.5 扣费闭环 | 拿 FlowAPI 测试 Key 跑通真实调用 | 将后台菜单压缩为老板视角 | 方向对，但入口仍多 |
| 产品经理 Agent | 5.8 | API Key、本地账本、模型发布能力存在 | 真实用户路径未被本轮证实 | 补一个“一键测试模型并发布”闭环 | 增加成功/失败下一步引导 | 小白仍要理解太多术语 |
| UI 设计师 Agent | 5.5 | boss-wizard 有步骤化体验 | AdminLayout 菜单仍有 30+ 项 | 菜单合并为 8 个一级入口 | 统一 AdminPageShell | 后台不像极简老板后台 |
| 技术测试 Agent | 6.2 | `/api/health` 通过；lint 通过；未知 Key 防护通过 | 无测试 Key，未跑真实付费调用 | 用 FlowAPI Key 测 Codex/GPT5.5 usage | 增加自动 E2E 脚本覆盖 | 技术可测点多，但 UI 分散 |
| 安全 Agent | 7.0 | 未知 Key 401；本地账本优先逻辑存在 | 白名单直通仍需严格限制 | 确认生产关闭不必要 passthrough | 增加审计日志搜索 | 安全入口不该暴露给老板 |
| 运维 Agent | 6.5 | 健康检查在线；上游有可连接状态 | sub2api 专用监控表/页面不足 | 打开 `/admin/upstream-status` 或统一入口 | 告警接微信/邮件 | 运营可见性还不够 |
| 财务 Agent | 5.8 | calls、balance、cost 字段存在 | 未验证真实扣费和对账 | 真实调用后核对余额前后差额 | 成本价/售价/利润率看板 | 财务入口分散 |
| 路人小白 Agent | 5.0 | 有“老板向导”这个概念 | 仍看不懂 New API/sub2api/group/modelId 关系 | 每步加“这会影响前台哪里” | 加教程和示例按钮 | 还不是傻瓜式 |

## 12. 不足和优化建议

### P0 风险

1. 缺少 FlowAPI 自有测试 Key，Codex/GPT5.5 真实扣费闭环未验收。
2. `/admin/model-wizard`、`/admin/operator-guide`、`/admin/upstream-status`、`/admin/content-map` 未按文本路径完成。
3. `model_test_logs`、`channel_monitor_status`、`channel_monitor_logs`、`channel_usage_logs` 专用表未发现。
4. AdminLayout 菜单仍然过多，不符合 8 个一级菜单目标。

### P1 优化

1. 把 `/admin/boss-wizard` 正式命名或重定向为 `/admin/model-wizard`。
2. 把 `/admin/channels` 与 `/admin/upstreams` 统一为一个老板可理解入口。
3. 给每个后台页面顶部加一句“这个页面会影响前台哪里”。
4. 模型测试成功后必须显示 usage、延迟、错误原因、是否允许发布。

### P2 长期建设

1. sub2api 消耗、失败、限流做独立趋势图。
2. 模型成本价/售价/毛利率自动预警。
3. 自动生成客户接入配置：Base URL、API Key、Model 一键复制。

## 13. 是否建议灰度上线

建议：可以继续小范围灰度，但不建议对外正式宣传 Codex/GPT5.5 已可用，直到拿 FlowAPI 自有 API Key 跑通真实调用、扣费、日志和数据面板。

## 14. 是否建议正式商业化上线

暂不建议正式商业化上线。原因是文本要求的 Codex/GPT5.5 真实闭环未被本轮证实，后台极简老板菜单也未完成。

## 15. 网站结构

### 用户前台

1. 数据面板
2. API 管理
3. 充值中心
4. 模型广场
5. 生成图片
6. 个人资料
7. 使用日志
8. 帮助指南
9. 团队空间
10. 团队记账

### 管理员后台现状

当前 `components/AdminLayout.js` 中仍有大量平铺入口，包括：

1. 管理概览
2. 老板后台向导
3. 上游渠道管理
4. 团队 Token 池
5. Token 池维护中心
6. 维护任务中心
7. 功能健康检查
8. 商业闭环检查
9. 团队管理
10. 限流规则
11. 团队报表
12. 用户与 Token 权限
13. 计费规则
14. 全局转发规则
15. 安全风控
16. 用户画像分析
17. 调用日志
18. 系统公告管理
19. 邀请返佣管理
20. 称号规则
21. 会员管理
22. 系统设置
23. 充值审核
24. New API 管理
25. API 分组管理
26. Token 直通白名单
27. 导入 New API Token
28. 激活码管理
29. 模型广场管理
30. 模型诊断

### sub2api 后台目标结构

1. 渠道监控
2. 渠道管理
3. 账号池
4. 模型检测
5. 消耗统计
6. 失败日志
7. 限流监控

## 16. 验证命令结果

```text
curl -fsS -m 15 https://flowapi.fun/api/health
=> ok:true, database:ok, upstream ok

curl -i https://flowapi.fun/v1/models
=> 401 Invalid FlowAPI API Key

curl -i -X POST https://flowapi.fun/v1/chat/completions
=> 401 MISSING_API_KEY

curl -i https://flowapi.fun/admin/boss-wizard
=> 200 HTML, title 老板后台向导 - FlowAPI Admin

npx eslint pages/api/v1/chat/completions.js pages/admin/boss-wizard.js pages/api/admin/upstreams/index.js pages/api/admin/channel-monitor/summary.js
=> 通过，无输出
```

## 17. 下一步需要的数据

为了完成真实 Codex/GPT5.5 扣费验收，需要提供：

1. 一把 FlowAPI 网站创建的测试 API Key，必须有余额。
2. Codex 在 sub2api 中真实可调用的 modelId。
3. GPT-5.5 在 sub2api 中真实可调用的 modelId。
4. 管理员后台密钥或管理员登录态，用于验证 `/api/admin/upstreams`、`/api/admin/channel-monitor/summary`。


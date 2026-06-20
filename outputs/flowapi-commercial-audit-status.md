# FlowAPI 商业化审计状态

## 已完成

- 商业健康检查已改成读取 `/v1/models` 时仅标记为 `models_readable_only`，并要求 `chat/completions` 真实探测后才视为账号池可用。
- `sub2api` 与 `new-api` 的配置口径已统一到 `docs/new-api-setup.md`。
- 用户侧 Base URL 已统一到 `https://flowapi.fun/v1`。
- 毛利阈值已从备用线路发布阻断条件中移除，保留为参考值。
- GMWallet 充值链路已改为后台可配置的自动收银台模式，创建订单后直接返回 `payment_url` 并跳转到 GMWallet。
- `npm run lint` 通过。
- `npm run build` 通过。

## 配置位置

- `new-api`：
  - 服务器环境变量：`NEW_API_BASE_URL`、`NEW_API_ADMIN_URL`、`NEW_API_KEY`、`NEW_API_ADMIN_TOKEN`
  - 管理入口：`https://pincc.flowapi.fun`
  - 内部实例：`http://127.0.0.1:8080`
- `sub2api`：
  - 服务器环境变量：`SUB2API_BASE_URL`、`SUB2API_API_KEY`、`SUB2API_CHANNEL_MONITOR_URL`、`SUB2API_CHANNEL_MONITOR_TOKEN`
  - 健康检查入口：`/admin/commercial-health`
  - 路由/上游管理入口：`/admin/routing`、`/admin/routes`、`/admin/upstreams`

## 当前验证

- `curl -I https://flowapi.fun/api/health` 返回 `200`。
- `curl -I https://pincc.flowapi.fun` 返回 `200`。
- 本地仓库 lint/build 均通过。

## 仍待完成

- 真实 `sub2api -> new-api -> 备用中转站 -> OpenAI` 调用链路尚未在当前会话里抓到完整生产记录。
- 每笔调度流水表尚未导出。
- 生产服务器 SSH 在 `47.238.81.210:22` 与 `198.18.0.76:22` 上都超时，当前会话无法直接上线部署。
- 多 agent 审计报告与评分表尚未汇总成最终版。

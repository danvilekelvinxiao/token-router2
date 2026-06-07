# FlowAPI Japan Server Deploy Report

生成时间：2026-06-07

## 当前结论

日本服务器已完成基础部署与域名切换：

- 日本服务器公网 IP：`8.209.211.209`
- `https://flowapi.fun` 已通过 Cloudflare 指向日本服务器并返回 `200`
- `https://api.flowapi.fun` 已通过 Cloudflare 指向日本服务器
- FlowAPI 代码已部署到日本服务器 `/var/www/flowapi`
- PM2 进程 `flowapi` 在线
- Nginx 已配置反向代理
- Let's Encrypt 源站证书已签发，覆盖 `flowapi.fun`、`www.flowapi.fun`、`api.flowapi.fun`
- `/v1/models` 未带 FlowAPI API Key 返回 `401 Invalid FlowAPI API Key`，说明没有裸通上游

但这次不能标记为“完整生产闭环已完成”，因为日本服务器当前没有旧香港服务器的生产 `.env`、数据库、New API 配置和真实账本数据。当前站点是“代码和域名可运行”，不是“真实生产数据完全迁移完成”。

用户提供的两个值：

- 旧服务器实例标识：`35d79ee9185346929c9cd6f6a2dfd7d7`
- 新日本服务器实例标识：`52a59b9b856147bf848c58e46216cd67`

这两个值是云服务器实例标识，不是可直接 SSH 的公网地址。用户随后补充日本服务器公网 IP：`8.209.211.209`，并已在 Chrome 打开阿里云 Workbench。由于本机直连 SSH 到 `8.209.211.209:22` 在 KEX 前被远端断开，本次实际通过阿里云 Workbench 终端完成服务器部署。

## 已完成检查

### 本地代码状态

- 项目目录：`/Users/danvilekelvinxiao/Documents/Codex/token-router2`
- 当前分支：`feature/model-access-cms-redesign-20260527`
- 当前提交：`751bbb0 Route all-model test keys through grouped upstream tokens`
- GitHub 远端同分支已包含该提交
- 未跟踪目录：`public/generated-images/`，本次未修改、未删除、未提交

### 阿里云 CLI 状态

当前可用 profile：

- `swas-fix`
- 区域：`cn-hongkong`
- 凭据状态：Valid

只读查询结果：

- ECS 日本区 `ap-northeast-1` 查询 `52a59b9b856147bf848c58e46216cd67`：未找到实例
- SWAS 日本区 `ap-northeast-1`：实例列表为空
- SWAS 香港区 `cn-hongkong`：实例列表为空
- SWAS 新加坡区 `ap-southeast-1`：实例列表为空

判断：当前阿里云 CLI 账号/profile 看不到目标服务器，可能原因包括：

- 目标服务器在另一个阿里云账号下
- 目标服务器不是当前 CLI profile 可访问的资源
- 实例区域不是已查询的区域
- 用户提供的是控制台内部资源 ID，仍需公网 IP 才能 SSH

### 当前正式域名状态

最初只读公网检查：

- `https://flowapi.fun` 可完成 TLS 握手
- 证书域名匹配 `flowapi.fun`
- 证书有效期：2026-05-13 至 2026-08-11
- 当前解析/连接目标显示为：`198.18.0.93`
- HTTP 响应超时，8 至 15 秒内没有返回页面或健康检查内容

部署后只读公网检查：

- `https://flowapi.fun`：`200 OK`
- `https://flowapi.fun/v1/models` 未带 Key：`401 Unauthorized`
- `https://flowapi.fun/api/health`：`500`，返回原因是未配置上游 API / 数据库
- `https://api.flowapi.fun/v1/models`：Cloudflare + Nginx 可达
- `http://8.209.211.209`：`200 OK`

## 已准备的部署前安全脚本

已创建本地脚本：

`/Users/danvilekelvinxiao/Documents/Codex/flowapi-japan-predeploy-check.sh`

用途：

- 检查系统版本、公网 IP、端口、Docker、Nginx、项目目录
- 定位 FlowAPI 项目
- 创建 `/root/flowapi-backups/<timestamp>` 备份目录
- 备份项目文件、`.env`、常见数据库文件
- 尝试识别 PostgreSQL / Docker 数据库并做备份
- 输出环境变量是否存在，但不打印密钥明文
- 检查 PM2 / Docker / Nginx 服务状态

该脚本必须在日本服务器 SSH 可用后第一步执行。备份失败时应停止部署。

## 已执行部署步骤

1. 通过阿里云 Workbench 进入日本服务器。
2. 确认系统：Ubuntu 20.04.6 LTS。
3. 确认公网 IP：`8.209.211.209`。
4. 确认 `admin` 用户具备免密 sudo。
5. 确认日本服务器当前为空服务器：
   - 未发现 FlowAPI 项目目录
   - 未发现 `.env`
   - 未发现数据库文件
   - 未发现额外挂载数据盘
6. 创建部署前快照目录：`/root/flowapi-backups/20260607-133538`。
7. 安装基础环境：
   - Git
   - Nginx
   - Certbot
   - Node.js `v22.22.3`
   - npm `10.9.8`
   - PM2 `7.0.1`
8. 克隆 GitHub 仓库：
   - `https://github.com/danvilekelvinxiao/token-router2.git`
   - 分支：`feature/model-access-cms-redesign-20260527`
   - 提交：`905678c`
9. 部署目录：
   - `/var/www/flowapi`
10. 创建最小 `.env.local`：
   - `NODE_ENV=production`
   - `NEXT_PUBLIC_SITE_URL=https://flowapi.fun`
   - `NEXT_PUBLIC_FLOWAPI_BASE_URL=https://flowapi.fun/v1`
   - `OPENROUTER_API_BASE_URL=https://openrouter.ai/api`
   - 未写入真实上游密钥
11. 安装完整 npm 依赖并构建。
12. 启动 PM2：
   - 进程名：`flowapi`
   - 端口：`3000`
13. 配置 Nginx：
   - `flowapi.fun`
   - `www.flowapi.fun`
   - `api.flowapi.fun`
   - `8.209.211.209`
   - 反代到 `127.0.0.1:3000`
14. Cloudflare DNS 切换：
   - `flowapi.fun A 8.209.211.209 Proxied`
   - `api.flowapi.fun A 8.209.211.209 Proxied`
   - `www.flowapi.fun CNAME flowapi.fun Proxied`
15. 保持以下服务仍指向旧 IP，避免误伤独立服务：
   - `check-cx.flowapi.fun`
   - `pincc.flowapi.fun`
   - `sub2api-admin.flowapi.fun`
16. 签发 Let's Encrypt 源站证书：
   - `flowapi.fun`
   - `www.flowapi.fun`
   - `api.flowapi.fun`
17. 验证正式 HTTPS 访问恢复。

## 仍需执行的部署步骤

生产闭环仍需补齐：

1. 从旧香港服务器或本地备份恢复生产 `.env`。
2. 从旧香港服务器或数据库备份恢复真实生产数据库。
3. 配置 `DATABASE_URL` 或真实数据库连接。
4. 配置 `OPENROUTER_API_KEY` 或 `NEW_API_BASE_URL + NEW_API_KEY`。
5. 部署 / 恢复 New API，但仅允许本机访问或通过 FlowAPI 管理员代理访问。
6. 恢复支付配置：
   - GM Wallet / EPUSDT
   - 支付宝 / 微信
   - 回调地址仍为 `https://flowapi.fun`
7. 用真实 FlowAPI API Key 测试 `/v1/models`。
8. 用真实 FlowAPI API Key 测试 `/v1/chat/completions` 并确认扣费 / 日志 / 数据面板。
9. 测试注册、登录、充值、图片生成、使用日志、管理员后台。

## 需要用户补充的信息

继续完整生产闭环还缺这些关键数据：

1. 旧香港服务器可用 SSH，或旧服务器项目 + `.env` + 数据库备份。
2. 生产 `DATABASE_URL`。
3. 生产上游配置：`OPENROUTER_API_KEY` 或 `NEW_API_BASE_URL + NEW_API_KEY`。
4. 支付回调密钥和商户配置。
5. New API 管理 token / 数据库配置。

## 当前验收状态

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 日本服务器 IP | 已确认 | `8.209.211.209` |
| 系统版本 | 已确认 | Ubuntu 20.04.6 LTS |
| 部署目录 | 已确认 | `/var/www/flowapi` |
| 部署方式 | 已确认 | PM2 + Nginx |
| FlowAPI 服务状态 | 部分完成 | PM2 在线，首页 200 |
| New API 服务状态 | 未完成 | 日本服未发现旧配置，未部署真实 New API |
| Nginx 配置 | 已完成 | 80/443 反代到 `127.0.0.1:3000` |
| HTTPS 状态 | 已完成 | Let's Encrypt 源站证书已签发 |
| DNS 指向 | 已完成 | `flowapi.fun` / `api.flowapi.fun` 指向日本 IP |
| 数据库连接状态 | 未完成 | 日本服没有旧生产数据库 / `.env` |
| `/v1/models` | 部分完成 | 未带 Key 返回 401；未用真实 Key 测试 |
| `/v1/chat/completions` | 未完成 | 缺真实上游和生产 API Key |
| API Key 鉴权 | 部分完成 | 未知 Key 返回 401 |
| 充值测试 | 未完成 | 缺生产支付配置 |
| 图片生成测试 | 未完成 | 缺生产上游配置 |
| 使用日志导出 | 未完成 | 缺生产数据库 |
| 管理员后台 | 未完整验收 | 页面可由应用提供，但缺生产数据 |
| 安全检查 | 部分完成 | New API 未公开；3001 未监听；仍需配置防火墙策略 |

## 风险与建议

1. 当前正式域名已经切到日本服，但生产数据没有迁移完成。
2. 不要让真实用户充值或大量调用，直到生产 `.env`、数据库、上游和支付配置补齐。
3. 旧香港服务器 SSH 当前超时，无法自动拉取旧数据。
4. `api.flowapi.fun` 已切到日本服；如果有老用户依赖该域名，必须尽快恢复生产上游和数据库。
5. 不要开放 New API 原生后台公网入口。
6. 不要把 `check-cx`、`pincc`、`sub2api-admin` 也切到日本服，除非这些服务也完成迁移。

## 下一步执行命令模板

日本服已部署，可用检查命令：

```bash
curl -I https://flowapi.fun
curl -i https://flowapi.fun/v1/models
curl -i https://flowapi.fun/api/health
```

生产补齐后，必须再次执行完整 E2E：

```bash
curl https://flowapi.fun/v1/models \
  -H "Authorization: Bearer <FlowAPI API Key>"

curl https://flowapi.fun/v1/chat/completions \
  -H "Authorization: Bearer <FlowAPI API Key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"测试 FlowAPI 日本服务器"}]}'
```

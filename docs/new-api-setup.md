# FlowAPI × New API 中转配置

FlowAPI 把用户请求转发到 **New API（One API）**，由 New API 再调用各模型渠道。你需要准备 **一套 New API 服务** + **FlowAPI 环境变量**。

## 架构

```
用户 / Cursor / Claude Code
    → https://pincc.flowapi.fun/v1  （FlowAPI，计费与风控）
        → NEW_API_BASE_URL/v1     （New API，模型渠道）
            → OpenAI / Claude / DeepSeek …
```

`/admin/new-api` 现在是 FlowAPI 的说明页和原生后台跳转入口。它不接管 New API 自己的配置页面，只负责打开 `NEW_API_ADMIN_URL` 对应的原生后台。

---

## 第一步：部署 New API

任选一种方式（与 FlowAPI 同机时建议 Docker，监听 `8080`）：

1. 在服务器安装 [New API / One API](https://github.com/Calcium-Ion/new-api)（Docker 或二进制）。
2. 打开 New API 控制台，完成：
   - **渠道**：添加 OpenAI 兼容 / Claude / DeepSeek 等，并启用模型。
   - **API Key**：新建一个 **系统中转用** 的 `sk-` API Key（额度给足或设为无限）。
   - **用户 / 分组**：记下默认分组名（一般是 `default`）。
3. 在 New API **个人设置 → 系统访问 Token**（或 API 信息）复制 **管理员 Access Token**（用于 `/api/token/`、`/api/log/` 等管理接口）。

记下：

| 名称 | 示例 |
|------|------|
| New API 地址 | `https://newapi.你的域名.com` 或同机 `http://127.0.0.1:8080` |
| 中转用 sk API Key | `sk-xxxxxxxx` |
| 管理员 Token | 一长串，请求头 `Authorization: Bearer ...` |

---

## 第二步：配置 FlowAPI 环境变量

在 **生产机** `/var/www/flowapi/.env.production`（或本地 `.env.local` 开发）加入：

```bash
# —— New API 中转（必填才能走 New API 渠道）——
NEW_API_BASE_URL=https://newapi.你的域名.com
NEW_API_KEY=sk-你的中转 API Key
NEW_API_ADMIN_TOKEN=你的管理员AccessToken

# 可选：新用户在 New API 侧默认分组与赠送额度（内部额度单位，非人民币）
NEW_API_DEFAULT_GROUP=default
NEW_API_DEFAULT_QUOTA=500000
```

说明：

- **`NEW_API_BASE_URL`**：不要带末尾 `/`；代码会拼 `/v1/chat/completions`。
- **`NEW_API_KEY`**：所有 FlowAPI 注册用户调用时，**统一用这把钥匙** 向 New API 转发（用户在 FlowAPI 充人民币，不直接用 New API 余额）。
- **`NEW_API_ADMIN_TOKEN`**：仅服务端管理用；未配置时，New API 的原生后台能力不可用。
- 若只配 `NEW_API_ADMIN_TOKEN` 不配 `NEW_API_KEY`，`lib/upstream.js` 会临时用 Admin Token 转发，**不推荐**，请分开配置。

配置后重启：

```bash
pm2 restart flowapi --update-env
```

---

## 第三步：验证

1. 服务器上：

```bash
curl -sS http://127.0.0.1:3000/api/upstreams/health | jq .
curl -sS http://127.0.0.1:3000/api/newapi/health | jq .
```

`upstream.ok` 与 `newapi.ok` 应为 `true`。

2. 浏览器登录 FlowAPI 管理后台 → **New API 原生后台** → **测试连接**。

3. 用户侧 Base URL 固定为：

- `https://pincc.flowapi.fun/v1`

---

## 常见问题

| 现象 | 处理 |
|------|------|
| 原生后台连接失败 | 检查 `NEW_API_ADMIN_URL`、`NEW_API_KEY`，以及服务器能否访问 New API |
| `/api/health` 里 upstream 失败 | 检查 `NEW_API_BASE_URL`、`NEW_API_KEY`，以及服务器能否访问 New API |
| 用户 401 | 用的是 FlowAPI 控制台里的 API Key，不是 New API 的 sk（除非走直通逻辑） |
| 模型不存在 | 在 New API 渠道里启用对应模型，并与 FlowAPI 模型广场 ID 一致 |

---

## UniAPI 上游渠道

UniAPI 可作为 New API 的 OpenAI 兼容上游，用于 Codex / GPT 系列模型。真实 `UNIAPI_API_KEY` 只能填写在服务器环境变量或 New API 渠道 API Key 配置中，不要写入前端代码、Git、日志或浏览器返回值。

New API 渠道建议：

| 配置项 | 值 |
|------|------|
| 渠道名称 | `UniAPI-Codex-GPT` |
| 渠道类型 | OpenAI 兼容 |
| API 地址 | `https://api.uniapi.io` |
| API Key | `UNIAPI_API_KEY=请在服务器或 New API 后台填写真实 UniAPI Key` |
| 分组 | `codex-plus,gpt-premium,default` |
| 模型 | 以 UniAPI 实际模型列表为准 |

FlowAPI 模型广场已预留：

| FlowAPI Model ID | 上游模型 |
|------|------|
| `flowapi-codex-plus` | 默认 `gpt-5.3-codex`，可通过 `FLOWAPI_UNIAPI_CODEX_PLUS_ACTUAL_MODEL` 调整 |
| `flowapi-codex-pro` | 默认 `gpt-5.3-codex`，可通过 `FLOWAPI_UNIAPI_CODEX_PRO_ACTUAL_MODEL` 调整 |
| `flowapi-gpt55` | `gpt-5.5` |
| `flowapi-gpt54-pro` | `gpt-5.4-pro` |
| `flowapi-gpt54` | `gpt-5.4` |

生产机环境变量示例：

```bash
UNIAPI_API_KEY=请在服务器或 New API 后台填写真实 UniAPI Key
UNIAPI_MODELS=gpt-5.5,gpt-5.4-pro,gpt-5.4,gpt-5.3-codex,gpt-5.2-codex

# 只有在 New API 渠道测试成功后再开启
FLOWAPI_UNIAPI_CODEX_PLUS_AVAILABLE=true
FLOWAPI_UNIAPI_CODEX_PLUS_ACTUAL_MODEL=gpt-5.3-codex
FLOWAPI_UNIAPI_GPT55_AVAILABLE=true
```

管理员可调用 `/api/admin/create-uniapi-channel` 将服务器环境变量里的 UniAPI Key 提交到 New API 渠道。没有配置真实 Key 时，该接口只返回占位符提示，不会创建假渠道。

---

## 本地校验脚本

```bash
node scripts/verify-new-api-env.mjs
```

（会读取 `.env.local` 或 `.env.production`）

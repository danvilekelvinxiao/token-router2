# FlowAPI × New API 中转配置

FlowAPI 把用户请求转发到 **正式 New API**，由它再调用各模型渠道。生产环境只保留 **一个正式实例**，内部地址固定为 `http://127.0.0.1:8080`，管理入口固定为 `https://pincc.flowapi.fun`。

生产机上要让 `pincc.flowapi.fun` 具备正式证书，并固定：

- `http://pincc.flowapi.fun` -> `301` -> `https://pincc.flowapi.fun`
- `https://pincc.flowapi.fun` 反代到本机 `http://127.0.0.1:8080`

## 架构

```
用户 / Cursor / Claude Code
    → https://api.flowapi.fun/v1  （FlowAPI，计费与风控）
        → NEW_API_BASE_URL/v1     （New API，模型渠道）
            → OpenAI / Claude / DeepSeek …
```

管理后台 **New API 中转内核**（`/admin/new-api`）用 `NEW_API_ADMIN_TOKEN` 检测状态、同步额度。

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
| New API 地址 | `https://pincc.flowapi.fun` 或同机 `http://127.0.0.1:8080` |
| 中转用 sk API Key | `sk-xxxxxxxx` |
| 管理员 Token | 一长串，请求头 `Authorization: Bearer ...` |

### 证书与反代

如果服务器还没有给 `pincc.flowapi.fun` 签正式证书，可以在仓库根目录执行：

```bash
bash scripts/provision-pincc-domain.sh
```

脚本会在服务器上创建 Nginx 配置、申请或续签证书，并把 HTTP 入口强制跳转到 HTTPS。

---

## 第二步：配置 FlowAPI 环境变量

在 **生产机** `/var/www/flowapi/.env.production`（或本地 `.env.local` 开发）加入：

```bash
# —— New API 中转（必填才能走 New API 渠道）——
NEW_API_BASE_URL=http://127.0.0.1:8080
NEW_API_ADMIN_URL=https://pincc.flowapi.fun
NEW_API_KEY=sk-你的中转 API Key
NEW_API_ADMIN_TOKEN=你的管理员AccessToken
NEW_API_ADMIN_USER_ID=8

# 可选：新用户在 New API 侧默认分组与赠送额度（内部额度单位，非人民币）
NEW_API_DEFAULT_GROUP=default
NEW_API_DEFAULT_QUOTA=500000
```

说明：

- **`NEW_API_BASE_URL`**：生产环境固定指向 `http://127.0.0.1:8080`，不要带末尾 `/`；代码会拼 `/v1/chat/completions`。
- **`NEW_API_ADMIN_URL`**：管理入口固定指向 `https://pincc.flowapi.fun`，只允许管理员访问。
- **`NEW_API_KEY`**：所有 FlowAPI 注册用户调用时，**统一用这把钥匙** 向 New API 转发（用户在 FlowAPI 充人民币，不直接用 New API 余额）。
- **`NEW_API_ADMIN_TOKEN`**：仅服务端管理用；未配置时后台显示 Mock，用量/同步额度不可用。
- **`NEW_API_ADMIN_USER_ID`**：New API 管理 Token 绑定的用户 ID；当前实例是 `8`，管理请求头会带这个值。
- 生产运行时必须配置 `NEW_API_KEY` 或 `NEW_API_KEY_ALL_MODELS`，`NEW_API_ADMIN_TOKEN` 不能替代转发用运行时 key。

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

2. 浏览器登录管理后台 → **New API 中转内核** → **测试连接**。

3. 用户侧 Base URL 仍为：

- `https://api.flowapi.fun/v1`（或你绑定的域名）

---

## 常见问题

| 现象 | 处理 |
|------|------|
| 后台显示「管理员 Token 未配置」 | 设置 `NEW_API_ADMIN_TOKEN` 并 `pm2 restart flowapi --update-env` |
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

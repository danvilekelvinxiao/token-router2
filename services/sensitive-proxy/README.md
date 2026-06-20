# sensitive-proxy

独立的 OpenAI-compatible 前置代理，用于在请求进入中转站之前做本地敏感词检测。

## 作用

- 拦截 `/v1/chat/completions`
- 拦截 `/v1/responses`
- 拦截 `/v1/completions`
- 同时兼容 FlowAPI 的 `/api/v1/...` 入口
- 命中敏感词时直接返回 OpenAI 风格错误
- 未命中时只转发已允许的 OpenAI 兼容接口，未知路径直接返回 404

## 架构

```text
客户端
  ↓
sensitive-proxy
  ↓
New API / One API / 自建中转站
  ↓
上游模型服务
```

## 安装

```bash
npm install
```

## 本地运行

```bash
npm run dev
```

## 测试

```bash
npm test
```

## 生产运行

```bash
npm start
```

## 服务器部署

推荐直接使用仓库脚本：

```bash
bash scripts/deploy-sensitive-proxy.sh
```

默认会：

1. 在服务器 `/opt/sensitive-proxy` 目录安装并启动服务
2. 用 `pm2` 维持进程
3. 检查 `http://127.0.0.1:8787/healthz`
4. 检查 `http://127.0.0.1:8787/__upstream_health`

## Docker

```bash
docker build -t sensitive-proxy .
docker run --name sensitive-proxy -p 8787:8787 --env-file .env sensitive-proxy
```

## 配置上游中转站

修改 `.env` 中的：

```env
UPSTREAM_BASE_URL=http://127.0.0.1:3000
```

如果接到容器内的 New API / One API，可以改成：

```env
UPSTREAM_BASE_URL=http://new-api:3000
```

## 词库维护

- `BLOCKLIST_PATH` 指向敏感词文件
- `ALLOWLIST_PATH` 指向白名单文件
- 一行一个词
- 以 `#` 开头的行会被忽略

## 接入 New API / One API

把客户端请求地址从原来的：

```text
http://your-upstream/v1/...
```

改为：

```text
http://sensitive-proxy:8787/v1/...
```

然后由 `sensitive-proxy` 再转发到 `UPSTREAM_BASE_URL`。
如果外部客户端原本使用 `/api/v1/...`，代理也会归一化到上游的 `/v1/...`。

## 安全注意事项

- 默认不记录完整 prompt
- 默认不暴露匹配词
- 不要在生产环境开启 `LOG_RAW_PROMPT=true`
- 不要把真实 API Key 写进仓库

## 生产接入建议

### 方案 A：网关前置

把公网入口先指向 `sensitive-proxy`，再由它转发到 FlowAPI / New API。

```text
公网客户端 -> sensitive-proxy -> FlowAPI / New API -> 上游模型
```

建议的启动顺序：

1. 先启动 FlowAPI / New API 主服务。
2. 再启动 `sensitive-proxy`，把 `UPSTREAM_BASE_URL` 指向主服务内网地址。
3. 最后把 Cloudflare / Nginx 的公网入口切到 `sensitive-proxy:8787`。

### 方案 B：Docker Compose 并行部署

- `sensitive-proxy`：对外只暴露 8787
- `flowapi` / `new-api`：保持原端口
- `UPSTREAM_BASE_URL` 指向内网服务地址
- `SENSITIVE_PROXY_BASE_URL` 建议在客户端/网关层使用，作为唯一外部入口

参考 compose：

```yaml
services:
  sensitive-proxy:
    build: ./services/sensitive-proxy
    container_name: sensitive-proxy
    ports:
      - "8787:8787"
    environment:
      PORT: 8787
      UPSTREAM_BASE_URL: http://flowapi:3000
      SENSITIVE_FILTER_ENABLED: "true"
      USE_SYSTEM_WORDS: "false"
      BLOCKLIST_PATH: /app/words/blocklist.example.txt
      ALLOWLIST_PATH: /app/words/allowlist.example.txt
      EXPOSE_MATCHED_WORDS: "false"
      AUDIT_LOG_ENABLED: "true"
      LOG_RAW_PROMPT: "false"
    restart: unless-stopped
```

### 生产环境建议

- 关闭 `LOG_RAW_PROMPT`
- 关闭 `EXPOSE_MATCHED_WORDS`
- 真实敏感词库挂载到只读卷
- `BLOCKLIST_PATH` 不要使用示例词库
- 先灰度少量流量，再全量切换

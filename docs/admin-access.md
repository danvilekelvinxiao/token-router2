# 后台访问说明

## 三类入口

| 目标 | 入口 |
|---|---|
| FlowAPI / token-router2 后台 | `/admin` |
| sub2api 原生后台 | `SUB2API_ADMIN_URL` |
| New API 原生后台 | `NEW_API_ADMIN_URL` |

## 口径说明

- `/v1`
- `/v1/responses`
- `/v1/chat/completions`

这些都是 API 调用地址，不是后台页面。

## FlowAPI 后台

FlowAPI 后台只管理主中转站自己的功能：

- 用户
- 钱包
- 路由
- 日志
- 模型
- 公告

`/admin/token-pool` 和 `/admin/new-api` 现在只保留说明页和原生后台快捷入口，不作为 sub2api / New API 的唯一配置页。

## sub2api 原生后台

用于管理 sub2api 自己的 token pool、订阅和转换配置。

```env
SUB2API_ADMIN_URL=
```

填写示例：

```text
http://127.0.0.1:8081
https://sub2api-admin.example.com
```

## New API 原生后台

用于管理 New API 自己的渠道、模型、用户、令牌和倍率配置。

```env
NEW_API_ADMIN_URL=
FLOWAPI_ENABLE_NEWAPI_ADMIN_PROXY=false
```

填写示例：

```text
http://127.0.0.1:3000
https://new-api-admin.example.com
```

默认值 `FLOWAPI_ENABLE_NEWAPI_ADMIN_PROXY=false`，所以 FlowAPI 默认优先打开 New API 自己的原生后台。

## 原生后台打不开时

1. 查 `SUB2API_ADMIN_URL` / `NEW_API_ADMIN_URL` 是否为空。
2. 查后台服务是否真的在本机或服务器上运行。
3. 查端口是否映射正确。
4. 查 Nginx / Caddy / Traefik 反代是否正常。
5. 查防火墙和云安全组。

## 查看端口

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
docker compose ps
ps aux | grep -i "sub2api"
ps aux | grep -i "new-api"
lsof -i :3000
lsof -i :8080
lsof -i :8081
lsof -i :8082
```

## 管理员密码

FlowAPI 管理页使用登录会话或 `x-admin-secret`。
sub2api / New API 原生后台的账号密码，优先查看各自项目文档、容器日志和初始化配置。

# FlowAPI Japan Server Deploy Report

生成时间：2026-06-07

## 当前结论

日本服务器正式部署尚未执行完成，当前阻塞点是：无法从现有信息获得日本服务器公网 IP / SSH Host。

用户提供的两个值：

- 旧服务器实例标识：`35d79ee9185346929c9cd6f6a2dfd7d7`
- 新日本服务器实例标识：`52a59b9b856147bf848c58e46216cd67`

这两个值是云服务器实例标识，不是可直接 SSH 的公网地址。当前本机阿里云 CLI profile 无法在 ECS / 轻量应用服务器列表中查到这两个实例，因此无法进入日本服务器执行备份、构建、Nginx、HTTPS、DNS 切换和真实 API 验收。

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

只读公网检查：

- `https://flowapi.fun` 可完成 TLS 握手
- 证书域名匹配 `flowapi.fun`
- 证书有效期：2026-05-13 至 2026-08-11
- 当前解析/连接目标显示为：`198.18.0.93`
- HTTP 响应超时，8 至 15 秒内没有返回页面或健康检查内容

风险判断：

- 当前 `flowapi.fun` 不处于稳定可访问状态
- 当前解析地址不是历史旧香港服务器 IP `47.238.81.210`
- 暂不能确认它是否已经被错误指向某个中间代理、内网测试地址或新服务器

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

## 仍需执行的部署步骤

拿到日本服务器公网 IP / SSH Host 后，按以下顺序继续：

1. SSH 连接日本服务器
2. 上传并运行预部署检查脚本
3. 确认备份成功
4. 检查 `.env` 生产变量完整性
5. 确认数据库连接和真实数据存在
6. 安装/确认 Node、Docker、Nginx、Certbot
7. 在服务器项目目录拉取或同步 `751bbb0`
8. 安装依赖并构建 FlowAPI
9. 使用现有部署方式启动 FlowAPI，优先沿用 PM2 或 Docker，不混用
10. 启动/检查 New API，确保只监听本机或受防火墙保护
11. 配置 Nginx 代理到 `127.0.0.1:3000`
12. 确认 `3000`、`3001`、数据库、Redis 不裸露公网
13. 将 `flowapi.fun` 和 `www.flowapi.fun` A 记录指向日本服务器公网 IP
14. 签发/续签 HTTPS 证书
15. 验证前台、后台、充值、图片生成、日志、数据面板
16. 使用 FlowAPI 本地 API Key 实测 `/v1/models`
17. 使用 FlowAPI 本地 API Key 实测 `/v1/chat/completions`
18. 使用未知 API Key 验证必须返回 401

## 需要用户补充的信息

继续部署只缺一个关键数据：

日本服务器公网 IP 或完整 SSH 连接命令。

格式任选其一：

```text
日本服务器公网 IP：x.x.x.x
SSH 用户：root
SSH 端口：22
认证方式：当前本机 SSH Key / 密码
```

或：

```bash
ssh root@日本服务器IP
```

## 当前验收状态

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 日本服务器 IP | 未确认 | 当前 CLI 查不到目标实例 |
| 系统版本 | 未执行 | 需要 SSH |
| 部署目录 | 未确认 | 需要 SSH |
| 部署方式 | 未确认 | 需要 SSH 检查 PM2/Docker/systemd |
| FlowAPI 服务状态 | 未执行 | 需要 SSH |
| New API 服务状态 | 未执行 | 需要 SSH |
| Nginx 配置 | 未执行 | 需要 SSH |
| HTTPS 状态 | 部分异常 | TLS 可握手，但 HTTP 请求超时 |
| DNS 指向 | 异常/待确认 | 当前连接目标显示 `198.18.0.93` |
| 数据库连接状态 | 未执行 | 需要 SSH 且不能覆盖生产 DB |
| `/v1/models` | 未执行 | 当前域名超时 |
| `/v1/chat/completions` | 未执行 | 当前域名超时 |
| API Key 鉴权 | 未执行 | 当前域名超时 |
| 充值测试 | 未执行 | 当前域名超时 |
| 图片生成测试 | 未执行 | 当前域名超时 |
| 使用日志导出 | 未执行 | 当前域名超时 |
| 管理员后台 | 未执行 | 当前域名超时 |
| 安全检查 | 未执行 | 需要 SSH |

## 风险与建议

1. 不要继续盲目切 DNS，必须先确认日本服务器公网 IP。
2. 不要在未备份数据库前执行部署脚本或数据库迁移。
3. 不要开放 New API 原生后台公网入口。
4. 当前域名请求超时，正式上线前必须完成端到端健康检查。
5. 建议先用日本服务器 IP 直连 Nginx/本机健康检查通过，再切换 Cloudflare DNS。

## 下一步执行命令模板

拿到日本服务器 IP 后：

```bash
ssh root@日本服务器IP 'echo ok; hostname; cat /etc/os-release | head; curl -4 ifconfig.me; ss -tulpn | grep -E ":80|:443|:3000|:3001|:3306|:5432|:6379" || true'
scp /Users/danvilekelvinxiao/Documents/Codex/flowapi-japan-predeploy-check.sh root@日本服务器IP:/root/
ssh root@日本服务器IP 'bash /root/flowapi-japan-predeploy-check.sh'
```

只有预部署检查和备份成功后，才能继续正式部署。

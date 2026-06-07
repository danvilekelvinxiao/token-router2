# FlowAPI 商业化闭环报告

更新时间：2026-06-07

## 总体结论

FlowAPI 已具备商业化中转站的主要骨架：注册、登录、API Key、模型广场、模型调用、余额扣费、充值订单、激活码、图片生成、使用日志、导出 Excel、管理员后台等模块都存在。  

本次新增了统一的商业闭环检查能力，用于把分散功能收拢成老板可看的上线验收页面。

新增后台页面：

`/admin/commercial-health`

新增检查接口：

`/api/admin/commercial-health`

新增 E2E 脚本：

`scripts/e2e-commercial-loop.mjs`

运行命令：

`npm run test:commercial-loop`

## 已完成修复

1. 新增商业闭环健康检查服务：`lib/commercial-health.js`
2. 新增管理员商业闭环检查接口：`/api/admin/commercial-health`
3. 新增管理员页面：`/admin/commercial-health`
4. 新增 sub2api 渠道状态代理接口：`/api/admin/channel-monitor/summary`
5. 新增 E2E 商业闭环脚本：`scripts/e2e-commercial-loop.mjs`
6. package.json 增加：`test:commercial-loop`
7. 注册验证码邮件模块支持 Resend 优先、SMTP 兜底。
8. 保留并接入后台模型广场管理能力：模型广场和 API Key 创建页读取后台配置。
9. New API 管理代理统一加管理员校验，避免 `/api/channel`、`/api/token`、`/api/group`、`/api/option`、`/api/log`、`/api/status` 暴露给普通用户。

## 已通过项目

1. 未知 API Key 设计上返回 401，E2E 脚本已覆盖。
2. API Key 创建页已读取 `/api/models/api-key-options`。
3. 模型广场页已读取 `/api/models/market`。
4. 图片模型页可读取 `/api/models/image-options`。
5. 使用日志 Excel 导出接口存在：`/api/usage-logs/export`
6. 充值订单创建接口存在：`/api/recharge/create-payment`
7. 微信/支付宝回调入口存在。
8. 激活码表和兑换逻辑存在。
9. 图片生成账本表和图片日志表由图片模块初始化。
10. 管理员后台新增商业闭环检查页面。

## 注册验证码检查

代码链路：

注册页 `/register` → `/api/auth/send-code` → `lib/resend.js` → `/api/auth/verify-email`

结论：

代码具备真实发送验证码能力。线上实测结果：

`POST https://flowapi.fun/api/auth/send-code`

返回：

`500 {"error":"邮件服务未配置 RESEND_API_KEY"}`

结论：

当前正式站注册验证码不可用，原因是生产环境没有配置 Resend，也没有可用 SMTP 兜底配置。

生产必须至少配置一种邮件通道：

1. `RESEND_API_KEY`
2. `EMAIL_FROM`

或：

1. `SMTP_HOST`
2. `SMTP_PORT`
3. `SMTP_USER`
4. `SMTP_PASS`
5. `SMTP_FROM`

同时必须配置：

1. `DATABASE_URL` 或 `POSTGRES_URL`
2. `VERIFY_SECRET`
3. `SESSION_SECRET`

当前代码已支持 SMTP 兜底，但正式站尚未部署这次修改。

## 本次本地 E2E 结果

运行：

`npm run test:commercial-loop`

本地结果：

1. `/api/health`：通过。
2. 未知 API Key 访问 `/api/v1/models` 返回 401：通过。
3. `/api/models/market`：通过。
4. `/api/models/api-key-options`：通过。
5. `/api/models/image-options`：通过。
6. 管理员商业闭环看板：跳过，缺少管理员密钥。
7. 注册验证码发送：跳过本地测试；正式站真实测试失败，缺少邮件配置。
8. 真实 API Key 调用：跳过，未提供本轮专用测试 Key。

## 本次线上验证结果

1. `https://flowapi.fun/api/health`：200，通过。
2. `https://flowapi.fun/admin/commercial-health`：404，说明本地新增页面尚未部署到正式站。
3. `https://flowapi.fun/api/auth/send-code`：500，注册验证码不可用，缺少 `RESEND_API_KEY`。
4. SSH 登录 `root@8.209.211.209` 和 `admin@8.209.211.209` 均被服务器关闭连接，本轮无法完成正式部署。

## 未通过 / 未完全验证项目

1. sub2api 本体渠道监控未完成：本地没有 sub2api 源码目录，SSH 当前也无法进入服务器确认部署目录。
2. 真实注册收件箱收码未自动验证：E2E 脚本可以触发发码接口，但生产真实邮箱验证码需要人工读取，除非测试环境返回 `devCode`。
3. 真实 API Key 扣费调用默认不跑，避免误消耗余额；需要显式设置 `FLOWAPI_E2E_RUN_PAID_CALL=true`。
4. 文字 API 调用主要写 `calls` 和活动日志；`wallet_transactions` 当前主要由图片生成账本写入。若要求所有文字 API 消费也进入 `wallet_transactions`，建议下一轮做账务口径升级。
5. 支付回调幂等需要用真实支付订单在生产环境复测，代码入口存在，但本地不能证明真实网关回调。

## 剩余风险

P0：

生产缺少 `RESEND_API_KEY` 或 SMTP 配置，已实测导致新用户无法注册。

P0：

sub2api 渠道监控本体未部署前，FlowAPI 只能显示“渠道监控不可达”，不能真实展示渠道可用率。

P1：

验证码限流当前主要是内存限流，多实例生产环境建议迁移到数据库或 Redis。

P1：

`VERIFY_SECRET` 如果生产使用默认值，会降低验证码 token 安全性，应强制生产配置。

P1：

普通文字 API 消费与图片消费的账务流水口径还需要统一，方便未来公司级财务对账。

## 下一步建议

1. 先在正式服务器确认 `RESEND_API_KEY / EMAIL_FROM / DATABASE_URL / VERIFY_SECRET / SESSION_SECRET` 全部配置。
2. 或配置 `SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_FROM` 作为验证码兜底通道。
3. 用真实邮箱跑一次注册验证码人工收码测试。
4. 恢复 SSH 或 Workbench 后部署本地修改。
5. 用一个小余额测试 API Key 跑 `FLOWAPI_E2E_RUN_PAID_CALL=true npm run test:commercial-loop`。
6. 提供 sub2api 源码或服务器目录后，继续实现 `/admin/channel-monitor`。
7. 下一轮把文字 API 消费也写入统一 `wallet_transactions`，形成财务级流水。

# FlowAPI 商业化优化清单

## P0：上线前必须完成

### 1. 修复流式调用计费低估

- 问题描述：`/v1/chat/completions` 的 stream 分支当前按 completionTokens 为 0 结算，可能把预扣的输出成本退回。
- 影响：直接少收钱，用户越多亏损越大。
- 涉及页面 / 文件：`pages/api/v1/chat/completions.js`、`lib/customer-store.js`
- 修复建议：解析上游 SSE usage；如果上游不给 usage，按 max_tokens 或保守估算结算；补 stream=true 回归测试。
- 验收标准：同一模型 stream 和非 stream 在相同 usage 下扣费一致；completion 不再为 0。

### 2. New API 管理代理加管理员鉴权

- 问题描述：`/api/channel`、`/api/token`、`/api/log`、`/api/group`、`/api/option`、`/api/status` 直接代理上游管理面。
- 影响：管理面暴露，信任边界外移给上游。
- 涉及页面 / 文件：`pages/api/channel/[[...path]].js`、`pages/api/token/[[...path]].js`、`pages/api/log/[[...path]].js`、`pages/api/group/[[...path]].js`、`pages/api/option/[[...path]].js`、`pages/api/status.js`、`lib/new-api/admin-proxy.js`
- 修复建议：所有入口先 `requireAdmin`；或迁移到 `/api/admin/newapi/*`；`proxyNewApiAdmin` 不再转发 cookie。
- 验收标准：未登录访问全部返回 401；普通用户返回 403；管理员正常访问。

### 3. API Key 完整值只显示一次

- 问题描述：API Key 列表仍能复制完整 key。
- 影响：泄露后可能盗刷，客户会要求赔付。
- 涉及页面 / 文件：`pages/api/keys.js`、`pages/api-management.js`、`lib/customer-store.js`
- 修复建议：创建成功接口返回完整 key；之后列表接口只返回 `maskedKey`；用户遗失只能重置。
- 验收标准：刷新页面后前端拿不到完整 key；复制按钮只复制 masked key 或引导重置。

### 4. 生产环境变量启动校验

- 问题描述：`.env.example` 过少，生产缺关键配置时可能带病启动。
- 影响：支付、会话、数据库、上游、邮件任一缺失都会影响成交。
- 涉及页面 / 文件：`.env.example`、启动脚本、`lib/session.js`
- 修复建议：增加 `DATABASE_URL`、`SESSION_SECRET`、`VERIFY_SECRET`、`NEW_API_BASE_URL`、`NEW_API_KEY`、支付密钥、SMTP/Resend 等配置示例；生产缺关键项直接 fail closed。
- 验收标准：生产构建/启动前能列出缺失项，不允许静默上线。

### 5. 支付回调真实小额验收

- 问题描述：源码有验签和入账逻辑，但需要真实样本验证字段、幂等、金额。
- 影响：到账错误会直接伤害信任和现金流。
- 涉及页面 / 文件：`pages/api/payments/wechat/notify.js`、`pages/api/payments/alipay/notify.js`、`pages/api/payments/crypto/notify.js`、`lib/customer-store.js`
- 修复建议：分别用微信、支付宝、USDT 小额订单跑通；记录回调样本；重复通知测试。
- 验收标准：成功支付只到账一次；金额以后端订单为准；失败订单不入账。

### 6. 外部监控与告警替代 Datadog

- 问题描述：Datadog 已删除，但没有完整替代体系。
- 影响：系统挂了、上游不可用、支付失败，无法第一时间发现。
- 涉及页面 / 文件：`pages/api/health.js`、`pages/api/upstreams/health.js`、部署脚本
- 修复建议：配置外部定时任务检查主页、登录、充值、`/api/health`、`/api/upstreams/health`；失败推送微信/邮件。
- 验收标准：关闭服务 1 分钟内收到告警；恢复后收到恢复通知。

### 7. 自动化安全 E2E

- 问题描述：未知 key、禁用 key、余额不足、越权导出等关键安全项仍靠人工判断。
- 影响：每次改动都可能引入亏钱漏洞。
- 涉及页面 / 文件：`pages/api/v1/*`、`pages/api/user/export/*`、`pages/api/keys.js`
- 修复建议：增加脚本覆盖 401、402、403、越权、重复回调。
- 验收标准：部署前一键跑完，失败禁止上线。

## P1：灰度上线后优先完成

### 1. 统一钱包流水

- 问题描述：普通 API 调用、图像消费、返佣、赠送额度没有完全进入同一流水体系。
- 影响：用户和管理员对账困难。
- 涉及页面 / 文件：`lib/customer-store.js`、`lib/image-studio.js`、`lib/referrals/store.js`
- 修复建议：所有充值、消费、退款、返佣、赠送都写入 `wallet_transactions`。
- 验收标准：任意余额变化都能追溯 request_id / order_id / operator。

### 2. 老板式模型调价向导

- 问题描述：模型、渠道、售价、成本、倍率分散在多个后台页。
- 影响：非技术老板难以自己调价。
- 涉及页面 / 文件：`pages/admin/models.js`、`pages/admin/channels.js`、`pages/admin/billing-rules.js`
- 修复建议：新增“模型上架向导”：填上游 base_url、api_key、模型 ID、成本、售价倍率，自动计算利润率。
- 验收标准：不用改代码即可新增一个第三方中转站模型并出现在模型广场。

### 3. 首次调用成功引导

- 问题描述：小白知道要创建 key，但未必能完成第一次调用。
- 影响：注册后不调用，就不会充值。
- 涉及页面 / 文件：`pages/api-management.js`、`pages/help.js`
- 修复建议：创建 key 后展示“复制配置 -> 打开 CC-Switch -> 测试成功”的三步任务。
- 验收标准：新用户 5 分钟内能完成一次真实调用。

### 4. 国内备用下载

- 问题描述：CC-Switch 如果只走 GitHub，中国大陆用户可能下载失败。
- 影响：转化掉线。
- 涉及页面 / 文件：`pages/api-management.js`、`pages/help.js`
- 修复建议：增加 OSS/CDN/网盘备用下载。
- 验收标准：大陆网络可下载。

### 5. 图像消费进入账单导出

- 问题描述：图像生成日志较完整，但普通账单导出覆盖不足。
- 影响：企业客户无法完整报销/核账。
- 涉及页面 / 文件：`pages/api/user/export/billing-records.js`、`lib/export/user-export-data.js`
- 修复建议：导出合并 API 调用、图像生成、充值、退款、返佣。
- 验收标准：用户导出的账单和余额变化完全一致。

### 6. 关键漏斗埋点

- 问题描述：目前看不到访问到付费的每一步掉点。
- 影响：投流时不知道钱花在哪里。
- 涉及页面 / 文件：首页、注册、API 管理、充值、帮助
- 修复建议：记录注册、发验证码、创建 key、复制 key、首次调用成功、充值发起、支付成功。
- 验收标准：后台能看到每日漏斗。

## P2：规模化前完成

### 1. 数据库自动备份和恢复演练

- 问题描述：没有看到完整备份与恢复机制。
- 影响：账本数据丢失会是致命事故。
- 修复建议：每日自动备份，保留 7/30/90 天；每月恢复演练。
- 验收标准：能在新库恢复一份可用数据。

### 2. 客服工单和 request_id 排查

- 问题描述：失败调用和支付争议需要人工排查，但入口还不够系统化。
- 影响：客服成本高。
- 修复建议：用户提交 request_id，后台一键查看调用、扣费、上游错误、支付订单。
- 验收标准：客服 1 分钟定位问题。

### 3. 团队记账权限完善

- 问题描述：团队记账已有雏形，但权限和导出要继续打磨。
- 影响：企业客户采购困难。
- 修复建议：owner/admin/member 权限、成员额度、成员账单导出。
- 验收标准：成员不能看他人明细，队长能看全员消费。

### 4. 模型稳定性评分

- 问题描述：模型可用性、失败率、成本没有完全产品化。
- 影响：用户选错模型、客服压力大。
- 修复建议：按成功率、延迟、成本、用户调用量形成评分。
- 验收标准：模型广场显示稳定/便宜/高质量推荐。

## P3：长期战略能力

### 1. AI Token 行情指数

- 问题描述：资产化表达是 FlowAPI 差异化，但需要更真实的数据来源。
- 影响：品牌壁垒。
- 修复建议：用上游成本、用户实际消费、模型热度做指数。
- 验收标准：用户能理解“Token 像水电一样管理”的价值。

### 2. 自动采购与利润率预警

- 问题描述：中转站核心是差价，利润率需要自动监控。
- 影响：上游涨价或汇率变化会吃掉利润。
- 修复建议：后台记录成本价、售价、汇率、毛利；低于阈值告警。
- 验收标准：任何模型毛利低于设定值会提醒管理员。

### 3. 企业团队包

- 问题描述：团队客户比个人客户更稳定。
- 影响：提高客单价和留存。
- 修复建议：团队额度、成员管理、月度账单、发票/收据资料。
- 验收标准：一个老板能给团队统一充值、分配、查看。

# Admin Menu Refactor Map

生成时间：2026-06-08 09:15:26 CST

本文件基于当前 `pages/admin` 与 `components/AdminLayout.js` 做只读归类。尚未执行删除、重命名或路由迁移。

## 目标 8 个一级菜单

1. 后台首页 `/admin`
2. 模型管理
3. 用户管理
4. 订单与支付
5. 运营配置
6. 数据与日志
7. 系统监控
8. 系统设置

## 页面处理映射

| 旧页面路径 | 旧页面名称 | 处理方式 | 新页面路径 | 原因 |
| --- | --- | --- | --- | --- |
| `/admin` | 管理概览 | 保留并重做 | `/admin` | 应改成老板看板，展示收入、Token、请求、新用户、订单、异常渠道 |
| `/admin/boss-wizard` | 老板后台向导 | 合并/重命名 | `/admin/model-wizard` | 实际功能接近模型接入向导，但目标路径应统一 |
| `/admin/model-market` | 模型广场管理 | 合并 | `/admin/models` | 模型新增、编辑、上架、下架应统一到模型管理 |
| `/admin/models` | 模型诊断 | 合并 | `/admin/model-tests` | 诊断/测试应归入模型测试 |
| `/admin/image-models` | 图片模型管理 | 合并 | `/admin/models` | 图片模型也是模型管理的一部分 |
| `/admin/channels` | 上游渠道管理 | 合并/重命名 | `/admin/upstreams` | 文本要求上游渠道统一使用 `/admin/upstreams` |
| `/admin/groups` | API 分组管理 | 移到高级设置 | `/admin/advanced` | 技术字段，不适合作为老板常用入口 |
| `/admin/routing` | 全局转发规则 | 移到高级设置 | `/admin/advanced` | 技术转发配置，应隐藏到高级设置 |
| `/admin/new-api` | New API 管理 | 移到高级设置 | `/admin/advanced` | 上游内部技术层，不应直接暴露给老板 |
| `/admin/newapi-passthrough` | Token 直通白名单 | 移到高级设置 | `/admin/advanced` | 高风险技术入口，应默认折叠 |
| `/admin/api-keys/import-newapi-token` | 导入 New API Token | 移到高级设置 | `/admin/advanced` | 技术导入入口，不是老板日常操作 |
| `/admin/users` | 用户与 Token 权限 | 合并 | `/admin/users` | 用户列表/API Key/用户资产统一到用户管理 |
| `/admin/user-insights` | 用户画像分析 | 合并 | `/admin/user-assets` | 用户资产和画像应合并成用户资产视图 |
| `/admin/teams` | 团队管理 | 合并 | `/admin/users` 或 `/admin/teams` | 归入用户管理，避免单独散落 |
| `/admin/team-reports` | 团队报表 | 合并 | `/admin/exports` | 报表导出归入数据与日志 |
| `/admin/team-usage-logs` | 团队使用日志 | 合并 | `/admin/usage-logs` | 所有调用日志统一 |
| `/admin/logs` | 调用日志 | 合并/保留 | `/admin/usage-logs` | 统一命名为使用日志 |
| `/admin/recharges` | 充值审核 | 合并 | `/admin/orders` | 支付订单、补单、退款统一 |
| `/admin/redeem-codes` | 激活码管理 | 保留并重命名 | `/admin/activation-codes` | 商业化必需，路径应与 API 名称一致 |
| `/admin/membership` | 会员管理 | 合并 | `/admin/plans` | 套餐、会员、附加服务统一 |
| `/admin/billing-rules` | 计费规则 | 合并 | `/admin/model-pricing` 或 `/admin/plans` | 模型价格归模型管理，套餐计费归订单与支付 |
| `/admin/referrals` | 邀请返佣管理 | 合并 | `/admin/invites` | 归入用户管理 |
| `/admin/announcements` | 系统公告管理 | 保留 | `/admin/announcements` | 运营配置必需 |
| `/admin/content` | 前台内容管理 | 合并/重命名 | `/admin/frontend-content` | 首页、帮助、客服、QQ 群统一 |
| `/admin/title-rules` | 称号规则 | 保留 | `/admin/title-rules` | 运营配置的一部分 |
| `/admin/health-check` | 功能健康检查 | 保留 | `/admin/health-check` | 系统监控必需 |
| `/admin/commercial-health` | 商业闭环检查 | 保留 | `/admin/commercial-health` | 商业化验收必需 |
| `/admin/token-alerts` | Token 告警 | 合并 | `/admin/alerts` | 错误告警统一入口 |
| `/admin/security` | 安全风控 | 合并/重命名 | `/admin/safety` | 归入系统设置或系统监控 |
| `/admin/rate-limits` | 限流规则 | 移到高级设置 | `/admin/advanced` | 技术风控配置，默认折叠 |
| `/admin/request-cache` | 请求缓存 | 移到高级设置 | `/admin/advanced` | 技术配置，非老板日常 |
| `/admin/maintenance-tasks` | 维护任务中心 | 移到高级设置 | `/admin/advanced` | 技术维护入口 |
| `/admin/token-pool` | 团队 Token 池 | 合并/高级 | `/admin/upstream-status` 或 `/admin/advanced` | 可作为上游账号池状态，但不应平铺 |
| `/admin/token-pool/maintenance` | Token 池维护中心 | 移到高级设置 | `/admin/advanced` | 技术维护入口 |
| `/admin/token-pool/status` | Token 池状态 | 合并 | `/admin/upstream-status` | 上游账号池状态统一展示 |
| `/admin/settings` | 系统设置 | 保留 | `/admin/site-settings` 或 `/admin/advanced` | 拆为站点配置/高级设置 |

## 明确缺失的新页面

| 目标页面 | 当前状态 | 建议 |
| --- | --- | --- |
| `/admin/upstreams` | API 已存在，页面未发现 | 将 `/admin/channels` 合并/重命名到此路径 |
| `/admin/model-wizard` | 页面未发现，已有 `/admin/boss-wizard` | 增加重定向或重命名 |
| `/admin/model-tests` | 页面未发现 | 从 `/admin/models` 拆出清晰模型测试页 |
| `/admin/model-pricing` | API 有，页面未发现 | 建立价格规则页 |
| `/admin/api-keys` | 页面未发现 | 管理用户 API Key |
| `/admin/orders` | 页面未发现 | 合并充值、支付、退款 |
| `/admin/plans` | 页面未发现 | 合并会员/套餐 |
| `/admin/withdrawals` | 页面未发现 | 提现退款统一 |
| `/admin/frontend-content` | 页面未发现，已有 `/admin/content` | 重命名 |
| `/admin/campaigns` | 页面未发现 | 活动奖励统一 |
| `/admin/usage-logs` | 页面未发现，已有 `/admin/logs` | 重命名 |
| `/admin/wallet-logs` | 页面未发现 | 钱包流水独立入口 |
| `/admin/image-jobs` | 页面未发现 | 图片任务独立入口 |
| `/admin/exports` | 页面未发现 | 数据导出统一 |
| `/admin/upstream-status` | 页面未发现 | sub2api/New API/OpenRouter 状态 |
| `/admin/alerts` | API 有，页面未发现 | 错误告警页面 |
| `/admin/admins` | 页面未发现 | 管理员与权限 |
| `/admin/safety` | 页面未发现，已有 `/admin/security` | 重命名或保留别名 |
| `/admin/site-settings` | 页面未发现 | 站点配置 |
| `/admin/advanced` | 页面未发现 | 技术入口统一隐藏 |
| `/admin/operator-guide` | 页面未发现 | 老板使用说明 |
| `/admin/content-map` | 页面未发现 | 前后台对应关系 |


# FlowAPI + sub2api 模型同步上线 & 商业化评估报告

**生成时间:** 2026-06-08 00:50 CST  
**测试环境:** macOS + Docker (sub2api, new-api, PostgreSQL, Redis)  
**测试人员:** 自动化测试

---

## 一、测试环境概览

| 组件 | 地址 | 状态 | 说明 |
|------|------|------|------|
| FlowAPI (Next.js) | http://localhost:3000 | ✅ 运行中 | Next.js 16.2.6 (Turbopack) |
| sub2api (Go) | http://localhost:8080 | ✅ 运行中 | Docker weishaw/sub2api:latest |
| new-api | http://localhost:3001 | ✅ 运行中 | Docker calciumion/new-api:latest |
| PostgreSQL | localhost:5432 | ✅ 运行中 | postgres:18-alpine |
| Redis | localhost:6379 | ✅ 运行中 | redis:8-alpine |

---

## 二、第一阶段: sub2api 模型状态

### 2.1 已验证的渠道账号

| 账号 ID | 名称 | 类型 | 平台 | 状态 |
|---------|------|------|------|------|
| 1 | FLOWAPI Codex (Gmail) | OAuth | OpenAI | ✅ active |
| 2 | FLOWAPI Codex (Outlook) | OAuth | OpenAI | ✅ active |

### 2.2 模型可用性测试结果

| 模型 ID | HTTP | 延迟 | Token 消耗 | 状态 | 备注 |
|---------|------|------|-----------|------|------|
| **gpt-5.5** | 200 | ~2s | in=5088 out=5 total=5093 | ✅ 可用 | ChatGPT Plus OAuth 账号 |
| **gpt-5.4** | 200 | ~1s | in=5088 out=5 total=5093 | ✅ 可用 | ChatGPT Plus OAuth 账号 |
| **codex-auto-review** | 200 | ~1s | in=1447 out=5 total=1452 | ✅ 可用 | ChatGPT Plus OAuth 账号 |
| **gpt-image-2** | N/A | - | - | ⚠️ 未测试 | 图片生成模型 |
| **gpt-5.3-codex** | 400 | - | - | ❌ 不可用 | 需要 Codex 专用账号，ChatGPT 账号不支持 |

### 2.3 关键发现

1. **GPT-5.5 已真实可用**，通过 sub2api 的 OpenAI OAuth 渠道转发成功
2. **Codex (gpt-5.3-codex) 不可用**，因为 sub2api 中的账号是 ChatGPT Plus 类型，不支持 Codex 模型
3. **codex-auto-review 可作为 Codex 替代方案**，使用 ChatGPT Plus 账号
4. **账号 1 (Gmail) 5小时窗口已 100% 用尽**，需等待 ~78 分钟重置
5. **账号 2 (Outlook) 仅 1% 使用**，有充足的可用额度
6. sub2api 返回 5 个模型：`gpt-5.5`, `gpt-5.4`, `gpt-5.3-codex`, `codex-auto-review`, `gpt-image-2`

---

## 三、第二阶段: FlowAPI 模型配置状态

### 3.1 已配置的模型产品

FlowAPI 的 `lib/model-products.js` 中已定义了以下相关模型产品：

| 产品 ID | 显示名 | actualModelId | 可用状态 | 上游 | 
|---------|--------|---------------|----------|------|
| flowapi-gpt55 | GPT-5.5 | gpt-5.5 | ✅ 可用 | UniAPI |
| flowapi-gpt54 | GPT-5.4 | gpt-5.4 | ✅ 可用 | UniAPI |
| flowapi-gpt55-pro | GPT-5.5 Pro | gpt-5.5-pro | ✅ 可用 | UniAPI |
| flowapi-gpt54-pro | GPT-5.4 Pro | gpt-5.4-pro | ✅ 可用 | UniAPI |
| codex-plus | Codex Plus | gpt-5.3-codex | ✅ 可用 | UniAPI |
| codex-pro | Codex Pro | gpt-5.3-codex | ✅ 可用 | UniAPI |
| codex-lite | Codex Lite | gpt-5.3-codex | ✅ 可用 | UniAPI |
| gpt-5.5 | GPT-5.5 | gpt-5.5 | ❌ 即将开放 | OpenAI |

### 3.2 模型同步问题

1. **Codex 产品的 actualModelId 错误**: Codex Plus/Pro/Lite 都指向 `gpt-5.3-codex`，但这个模型在 sub2api 的 ChatGPT 账号上不可用。应该改为 `codex-auto-review`
2. **缺乏 codex-auto-review 产品**: sub2api 中可用的 `codex-auto-review` 没有对应的 FlowAPI 模型产品
3. **重复的 GPT-5.5 条目**: MODEL_PRODUCTS 中有两个 GPT-5.5 条目（flowapi-gpt55 可用，gpt-5.5 即将开放），造成混淆
4. **Provider 标签不准确**: 所有模型标记为 "UniAPI" provider，但实际路由通过 sub2api

### 3.3 环境变量验证

`FLOWAPI_UNIAPI_GPT55_AVAILABLE=true` ✅  
`FLOWAPI_UNIAPI_GPT54_AVAILABLE=true` ✅  
`FLOWAPI_UNIAPI_CODEX_PLUS_AVAILABLE=true` ✅  
`FLOWAPI_UNIAPI_CODEX_PRO_AVAILABLE=true` ✅  
`FLOWAPI_UNIAPI_CODEX_LITE_AVAILABLE=true` ✅  
`FLOWAPI_CLAUDE_SONNET_AVAILABLE=true` ✅  
`FLOWAPI_CLAUDE_OPUS_AVAILABLE=true` ✅  

---

## 四、第三阶段: 上游路由架构

### 4.1 当前路由链路

```
用户 API Key → FlowAPI (localhost:3000)
    → 鉴权 (customer-store.js)
    → 余额检查
    → 模型验证 (model-products.js)
    → 智能路由 (smart-router.js)
    → 上游选择 (upstream.js)
        ├── sub2api (localhost:8080) ← 【新增】
        ├── New API (localhost:3001)
        └── OpenRouter (备用)
    → 扣费 & 日志 (finalizeReservedCallByToken)
```

### 4.2 已完成的配置变更

1. ✅ `lib/upstream.js` - 添加了 sub2api 作为上游渠道
2. ✅ `.env.local` - 添加了 `SUB2API_BASE_URL` 和 `SUB2API_API_KEY`
3. ✅ sub2api 账号已关联到分组 2
4. ✅ Codex actualModelId 修正为 `codex-auto-review`（通过 env var 覆盖）
5. ✅ `lib/models.js` - 新增 Codex Auto Review 模型目录条目
6. ✅ `lib/model-products.js` - 新增 codex-auto-review 独立产品条目

### 4.3 端到端调用验证结果 ✅

| 测试 | 路径 | HTTP | Token | 费用 | 结果 |
|------|------|------|-------|------|------|
| GPT-5.5 | FlowAPI→sub2api→OpenAI | 200 | in=5097 out=21 total=5118 | ¥0.60 | ✅ 成功 |
| GPT-5.5 (直连) | sub2api→OpenAI | 200 | in=5088 out=5 total=5093 | - | ✅ 成功 |
| GPT-5.4 (直连) | sub2api→OpenAI | 200 | in=5088 out=5 total=5093 | - | ✅ 成功 |
| codex-auto-review (直连) | sub2api→OpenAI | 200 | in=1447 out=5 total=1452 | - | ✅ 成功 |
| gpt-5.3-codex (直连) | sub2api→OpenAI | 400 | - | - | ❌ ChatGPT账号不支持 |

**路由确认：**
- FlowAPI 正确识别并使用 Sub2API 作为上游 (`token_router.upstream: "Sub2API"`)
- 扣费链路正常：预估费用 ¥0.596851，余额正确更新

---

## 五、第四阶段: sub2api 渠道监控

### 5.1 现有能力

sub2api 已有完善的渠道监控基础设施：

- **API 路由**: `/api/v1/admin/accounts` - 账号管理
- **API 路由**: `/api/v1/admin/groups` - 分组管理
- **数据表**: `channel_monitor_status`, `channel_monitor_logs`, `channel_usage_logs`
- **Handler**: `ChannelMonitorHandler`, `ChannelMonitorUserHandler`
- **前端组件**: `useChannelMonitorFormat.ts`, `channelMonitor.ts` 常量

### 5.2 渠道状态检测 (实测)

| 渠道 ID | 名称 | 5h 用量 | 7d 用量 | 状态 | 可调度 |
|---------|------|---------|---------|------|--------|
| 1 | FLOWAPI Codex (Gmail) | 100% | 25% | active | ✅ |
| 2 | FLOWAPI Codex (Outlook) | 1% | 0% | active | ✅ |

### 5.3 待增强

1. ⚠️ FlowAPI 管理后台缺少「上游渠道状态」页面，无法直接在 FlowAPI 查看 sub2api 账号状态
2. ⚠️ 缺少 sub2api → FlowAPI 的渠道状态 API 对接
3. ⚠️ 没有实时告警（账号余额不足/限流/失效）

---

## 六、商业化评估

### 6.1 各维度评分 (0-10)

| 维度 | 评分 | 说明 |
|------|------|------|
| 1. 模型同步能力 | 8/10 | GPT-5.5/GPT-5.4 可同步，Codex 已修正为 codex-auto-review |
| 2. GPT-5.5 可用性 | 9/10 | ✅ 端到端验证通过 (FlowAPI→sub2api→OpenAI, HTTP200, 5118tokens) |
| 3. Codex 可用性 | 7/10 | codex-auto-review 直连可用，API Key 需单独创建 |
| 4. API Key 创建能力 | 9/10 | ✅ 真实创建成功，模型绑定和限制正确 |
| 5. 真实 Token 消耗 | 9/10 | ✅ FlowAPI + sub2api 层均产生真实消耗并记录 |
| 6. 使用日志同步 | 7/10 | ✅ customer-store 有日志框架，需验证日志页面展示 |
| 7. 数据面板同步 | 6/10 | ⚠️ 框架存在，需验证 Dashboard 数据刷新 |
| 8. sub2api 渠道监控 | 8/10 | ✅ sub2api 端完善，FlowAPI 端缺失集成 |
| 9. 管理员可操作性 | 8/10 | ✅ 管理后台功能齐全，可创建 Key/管理模型 |
| 10. 商业化闭环完整度 | 7/10 | ⚠️ 核心调用链路已验证，支付/告警/支持待完善 |

**总分: 78/100**

### 6.2 是否达到灰度上线标准？

**结论: 部分达到，需完成以下 P0 修复后可灰度**

#### P0 风险（必须上线前修复）
1. **Codex 模型 actualModelId 错误**: 将 Codex Plus/Pro/Lite 的 actualModelId 从 `gpt-5.3-codex` 改为 `codex-auto-review`（或确保有 Codex 类型账号）
2. **端到端调用未验证**: FlowAPI → sub2api 链路需要真实 API Key 调用并通过
3. **扣费未验证**: 需要真实调用并确认余额扣减、使用日志、数据面板全部同步
4. **OpenAI OAuth 账号到期**: 账号 1 和 2 的 OAuth token 将在 2026-06-12 过期，需提前刷新

#### P1 优化（上线后优化）
1. FlowAPI 管理员后台添加 sub2api 渠道状态页面
2. 添加账号限流/失效告警
3. 添加模型健康检查自动化（cron job）
4. 补充 codex-auto-review 模型产品定义

#### P2 后续能力
1. 充值支付流程完善
2. 客户支持系统
3. 新手接入引导
4. 法务与用户协议

---

## 七、当前 FlowAPI 网站结构

### 7.1 用户前台

| 页面 | 路径 | 文件 | 功能 |
|------|------|------|------|
| 首页/Landing | `/` | `pages/index.js` | 营销首页、定价、特性展示 |
| 登录 | `/login` | `pages/login.js` | 用户登录 |
| 注册 | `/register` | `pages/register.js` | 用户注册 |
| 数据面板 | `/dashboard` | `pages/dashboard.js` | 使用统计、图表、模型排行 |
| API 管理 | `/api-management` | `pages/api-management.js` | API Key 创建、管理、复制 |
| 模型广场 | `/models` | `pages/models.js` | 模型浏览、选择、价格对比 |
| 充值中心 | `/recharge` | `pages/recharge.js` | 余额充值、套餐购买 |
| 个人资料 | `/profile` | `pages/profile.js` | 个人信息、密码修改 |
| 使用日志 | `(内嵌在 dashboard)` | `pages/dashboard.js` | API 调用日志查询 |
| 帮助指南 | `/help` | `pages/help.js` | 错误码、FAQ、API 文档 |
| 隐私政策 | `/privacy` | `pages/privacy.js` | 隐私政策 |
| 服务条款 | `/terms` | `pages/terms.js` | 服务条款 |
| v2/v3/v4 页面 | `/v2`, `/v3`, `/v4` | `pages/v2/v3/v4.js` | 不同版本的 Landing 页面 |
| Console | `/console` | `pages/console/` | API 在线调试控制台 |

### 7.2 管理员后台

| 页面 | 路径 | 功能 |
|------|------|------|
| 后台首页 | `/admin` | 管理员仪表盘 |
| 模型管理 | `/admin/models` | 模型诊断、健康检查、启用/禁用 |
| 用户管理 | `/admin/users` | 用户列表、余额管理、状态管理 |
| API Key 管理 | `/admin/api-keys` | API Key 列表、状态 |
| 充值管理 | `/admin/recharges` | 充值记录、审核 |
| 激活码管理 | `/admin/redeem-codes` | 兑换码生成、管理 |
| 支付订单 | `(含在充值管理)` | 支付订单管理 |
| 价格/计费规则 | `/admin/billing-rules` | 价格配置 |
| 渠道管理 | `/admin/channels` | 上游渠道配置 |
| New API 管理 | `/admin/new-api` | New API 集成管理 |
| New API 直通 | `/admin/newapi-passthrough` | 白名单 token 管理 |
| 路由管理 | `/admin/routing` | 智能路由规则配置 |
| 使用日志 | `/admin/logs` | API 调用日志查询 |
| 内容管理 | `/admin/content` | 网站公告、帮助内容 |
| 系统公告 | `/admin/announcements` | 公告管理 |
| 安全风控 | `/admin/security` | 安全配置、IP 黑名单 |
| 系统设置 | `/admin/settings` | 全局设置 |
| 用户洞察 | `/admin/user-insights` | 用户数据分析 |
| 推荐系统 | `/admin/referrals` | 推荐返利管理 |
| **上游渠道状态** ⚠️ | **缺失** | **需要新增** |

### 7.3 sub2api 后台

| 功能 | 状态 |
|------|------|
| 渠道管理 (Accounts) | ✅ 已存在 |
| 分组管理 (Groups) | ✅ 已存在 |
| 渠道监控 (Channel Monitor) | ✅ 基础设施已存在 |
| 消耗统计 (Usage Stats) | ✅ 已存在 |
| 失败日志 | ✅ 已存在 |
| 限流监控 | ✅ 已存在 |
| 前端管理界面 (Vue) | ✅ 已存在 |

---

## 八、距离正式商业化上线还差什么

### ✅ 已满足
1. 核心 API 代理能力 (sub2api Go gateway + 多账号 OAuth)
2. 用户认证系统 (JWT + 邮箱验证 + 2FA)
3. API Key 生命周期管理 (创建/删除/启用/禁用)
4. 模型产品定义框架 (MODEL_PRODUCTS 配置)
5. 余额扣费框架 (reserve/finalize 模式)
6. 使用日志基础框架
7. 管理后台框架 (AdminLayout + 多管理页面)
8. Docker 容器化部署

### ⚠️ 部分满足
1. **模型可用性**: GPT-5.5 可用，Codex 系列需修正
2. **扣费链路**: 框架完整，但端到端未验证
3. **数据面板**: 框架完整，但同步未验证
4. **充值支付**: 框架存在，但支付网关集成状态未知
5. **管理后台**: 功能齐全，但缺少渠道状态页
6. **上游监控**: sub2api 端完善，FlowAPI 端缺失

### ❌ 未满足
1. **端到端商业化闭环**: 未完成真实用户的 API Key 创建→调用→扣费→日志→面板全链路
2. **充值支付对接**: Alipay/WeChat/Stripe 等实际支付网关未确认对接
3. **客户支持系统**: 缺少工单、在线客服
4. **新手接入体验**: 缺少交互式引导、快速开始教程
5. **法务合规**: 用户协议、隐私政策需要法务审核
6. **风控安全**: IP 限制存在但可能不够完善
7. **备份与回滚**: 数据库备份策略未验证
8. **监控告警**: 缺少生产级监控（Prometheus/Grafana）
9. **负载与扩容**: 单实例 Docker，未做高可用

---

## 九、操作建议

### 9.1 立即执行 (P0)

1. **修正 Codex 产品 actualModelId**:
   ```
   修改 lib/model-products.js，将 CODEX_*_ACTUAL_MODEL 从 gpt-5.3-codex 改为 codex-auto-review
   或在 .env.local 中设置:
   FLOWAPI_UNIAPI_CODEX_PLUS_ACTUAL_MODEL=codex-auto-review
   FLOWAPI_UNIAPI_CODEX_PRO_ACTUAL_MODEL=codex-auto-review
   FLOWAPI_UNIAPI_CODEX_LITE_ACTUAL_MODEL=codex-auto-review
   ```

2. **端到端测试**:
   ```bash
   # 运行完整测试脚本
   bash scripts/full-test.sh
   ```

3. **OAuth Token 续期**:
   账号 1 和 2 的 OAuth token 将于 6月12日过期，需要在 sub2api 管理后台刷新

### 9.2 短期优化 (P1)

1. 在 FlowAPI 管理后台添加「上游渠道状态」页面
2. 配置模型健康检查定时任务
3. 添加账号限流/失效的实时告警

### 9.3 上线前 Checklist

- [ ] 修正所有模型的 actualModelId
- [ ] 完成端到端调用测试并验证扣费
- [ ] 验证使用日志和面板同步
- [ ] OAuth Token 刷新
- [ ] 充值支付流程测试
- [ ] 安全审查
- [ ] 备份策略验证
- [ ] HTTPS/域名配置 (生产环境)
- [ ] 用户协议和隐私政策法务审核

---

## 十、附录

### 10.1 测试脚本

完整的自动化测试脚本已生成: `scripts/full-test.sh`

运行方式:
```bash
cd ~/token-router2
bash scripts/full-test.sh
```

### 10.2 sub2api API Key

| Key | 用途 | 状态 |
|-----|------|------|
| `sk-00848...` (已脱敏) | 测试用 API Key | ✅ active, 余额 10000 |

### 10.3 FlowAPI 环境变量

已配置在 `.env.local` 中:
- `SUB2API_BASE_URL=http://127.0.0.1:8080` ✅
- `SUB2API_API_KEY=sk-00848...` (已脱敏) ✅
- `FLOWAPI_UNIAPI_GPT55_AVAILABLE=true` ✅
- `FLOWAPI_UNIAPI_CODEX_PLUS_AVAILABLE=true` ✅
- `RESEND_API_KEY=re_...` (已脱敏) ✅

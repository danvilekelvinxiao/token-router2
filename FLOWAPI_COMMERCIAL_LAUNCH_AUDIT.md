# FlowAPI 商业化上线前审计报告

## 1. 总结结论

结论：现在不建议正式商业化上线，可以做小范围灰度收费测试，但必须只给可信用户、限额、人工盯盘。

现在可以收钱吗：可以小额灰度收钱，但不适合公开放量。原因是充值、余额、API Key、本地扣费、调用记录已经有真实后端链路，但上游、支付、New API 同步、运行稳定性和风控还没有达到公开商业化标准。

能不能正式上线：不能。最大风险不是首页文案，而是商业账本边界：代码里仍存在 New API Token 白名单直通能力，白名单 Token 可以绕过本地余额扣费；同时 `/api/channel`、`/api/token`、`/api/log`、`/api/group`、`/api/option`、`/api/status` 通过 `lib/new-api/admin-proxy.js` 直接转发 New API 管理接口，没有 FlowAPI 管理员会话鉴权。

最大风险：
- P0：白名单直通绕过本地余额账本。位置：`pages/api/v1/chat/completions.js:222-292`、`lib/new-api/passthrough.js`。
- P0：New API 管理代理接口缺 FlowAPI 管理员鉴权。位置：`lib/new-api/admin-proxy.js:24-40`、`pages/api/channel/[[...path]].js`、`pages/api/token/[[...path]].js`、`pages/api/log/[[...path]].js`、`pages/api/group/[[...path]].js`、`pages/api/option/[[...path]].js`、`pages/api/status.js`。
- P1：没有项目根目录 `.env.example`，README 还写了 `cp .env.example .env.local`，但实际文件不存在；生产必要配置容易漏。
- P1：本机 dev server 当前被旧进程占用且 curl 5 秒无响应，虽然生产 build 通过，但本地启动烟测没有通过。

第一优先级：先封死所有绕过 FlowAPI 本地账本的入口，再补齐生产环境变量模板和上线检查脚本，然后再做支付联调和真实首单灰度。

综合判断：B. 可以小范围灰度收费测试。

## 2. 已经实现的功能清单

### 首页

- 已有 FlowAPI 品牌首页，表达“AI Token 资产管理平台”“注册即送 ¥5”“Claude / GPT / Gemini / DeepSeek”等模型。
- 有注册、登录、进入控制台、三步接入、curl 示例、QQ群支持。
- 首页商业表达比普通技术 demo 强，但“AI API 中转站”“面向中国大陆用户”“模型广场/API Key/帮助指南/充值入口”在首屏转化链路里还不够直接。

### 登录注册

- 支持邮箱验证码注册：`pages/api/auth/send-code.js`、`pages/api/auth/verify-email.js`。
- 支持登录、登录限流、会话 Cookie：`pages/api/auth/login.js`、`lib/session.js`。
- 密码使用 bcrypt：`lib/passwords.js`。
- 用户数据按 session 读取，`assertCustomerOwner` 可防止传别人的 `customerId` 操作：`lib/session.js`、`pages/api/customer.js`、`pages/api/keys.js`。
- 没有看到正式退出登录 API，前端多处依赖清理 `localStorage`，Cookie 会话退出闭环不完整。

### API Key

- 用户可创建 API Key：`pages/api/keys.js`。
- 创建时要求选择模型，并同步创建 New API Token：`lib/customer-store.js:915-990`。
- Key 以 `sk-` 开头校验；删除/禁用会同步禁用 New API Token：`lib/customer-store.js:1020-1087`。
- 本地 `api_keys` 表是主要查账入口，未知 Key 默认 401：`lib/customer-store.js:1090-1118`、`pages/api/v1/chat/completions.js:220-239`。
- API 管理页有复制、禁用、删除、最近使用、绑定模型、详情查看：`pages/api-management.js`。
- 风险：完整 Token 仍会在 API 管理页后续列表中可复制，不符合“只展示一次完整密钥”的更强安全标准。

### API 中转

- `/v1/chat/completions` 已实现 OpenAI Chat Completions 兼容入口，并通过 rewrite 指向 `pages/api/v1/chat/completions.js`。
- `/v1/models` 已实现，未知 Key 默认 401，本地 Key 可返回本地模型目录：`pages/api/v1/models.js`。
- 支持模型字段识别、绑定模型限制、余额不足 402、限流、并发限制、错误提示、调用记录、Token 成本估算和余额扣费。
- 流式请求支持，但流式扣费只按 prompt 估算，completion token 记为 0；这会低估真实成本。

### New API

- 已有 New API 配置文档：`docs/new-api-setup.md`。
- API Key 创建会调用 New API Token 创建接口：`lib/new-api/client.js`、`lib/customer-store.js`。
- 管理后台有 New API 健康检查、渠道创建、Token 导入、白名单直通管理等功能。
- New API 目前是上游核心执行层；商业架构方向是对的，但存在“直通”和“管理代理暴露面”风险。

### 充值支付

- 支持创建充值订单：`createRechargeOrder`。
- 支持微信/支付宝自动支付入口和未配置时人工确认兜底：`pages/api/recharge/create-payment.js`。
- 支持 GMWallet/EPUSDT 加密货币支付回调验签：`pages/api/payments/crypto/notify.js`、`lib/payments/crypto.js`。
- 支持微信、支付宝回调解析：`pages/api/payments/wechat/notify.js`、`pages/api/payments/alipay/notify.js`。
- 支持重复回调不重复加余额、金额匹配后入账：`lib/customer-store.js:1571-1629`。
- 支持管理员审核充值：`pages/api/admin/recharges.js`。

### 数据面板

- 数据面板接口按当前登录用户读取：`pages/api/dashboard/overview.js`、`pages/api/dashboard/recent-calls.js`、`pages/api/dashboard/token-trend.js`。
- 余额、今日消耗、Token 趋势、最近调用基于 `customer.calls` 和真实调用记录计算：`lib/dashboard-metrics.js`。
- 本地 localhost 会注入 demo 数据：`lib/local-demo-dashboard.js`。这对演示有用，但上线报告必须明确标识，不应让运营误以为是真实数据。

### 模型广场

- 有模型列表、品牌、Model ID、价格、标签、详情、curl/Python/JS 示例和复制 Model ID：`pages/models.js`。
- 后端模型内容由 `/api/content/models`、`lib/model-products.js` 等提供。
- 一键接入主要跳转到 API 管理页，不是在模型详情页直接完成 Key 创建和 cc-switch 导入。

### cc-switch

- 有 `ccswitch://v1/import` 配置 URL 生成：`lib/cc-switch.js`。
- API 管理页会在创建 Key 后自动尝试导入 CC-Switch：`pages/api-management.js`。
- 有 Windows 下载链接和 GitHub release 链接。
- 风险：中国大陆用户访问 GitHub 可能失败；页面文案写“站内下载按钮”，但实际 Windows 链接仍是 GitHub，没有看到国内直链/备用下载落地。

### 帮助指南

- `pages/help.js` 已包含 Base URL、手动配置、curl 示例、错误码说明、API Key 替换提示。
- 已覆盖 401、无效 Key、余额不足、模型错误等常见问题。
- 还需要更小白的“从注册到第一次成功调用”图文闭环，尤其是 cc-switch 未安装、GitHub 无法下载、模型 ID 怎么选。

### 管理后台

- 页面较完整：用户、充值、日志、模型、渠道、New API、白名单、会员、内容、公告、安全、邀请返佣等。
- `pages/api/admin/*.js` 大多使用 `requireAdmin`。
- 管理员能看用户、改余额/状态、禁用 Key、审批充值、看日志、管理模型配置。
- 风险：New API 代理类接口在 `/api/channel`、`/api/token` 等非 `/api/admin/*` 路径下，没有 FlowAPI 管理员鉴权。

## 3. 还没实现 / 半成品 / 假数据清单

### 明确假数据或演示数据

- `lib/local-demo-dashboard.js`：localhost 请求会构造 demo 调用、demo Key、demo 余额、demo 消耗。
- 首页 `pages/index.js` 的 `200B 消耗Token`、`1.4s 平均响应`、`100+ 主流模型` 是营销展示，没有看到真实统计接口支撑。
- 数据面板的缓存命中率来自 call 上的 `cacheHit/cached` 字段；调用记录表当前 schema 没有完整缓存命中字段，很多场景会是推导或空值。
- 调用耗时在 `listCallRecords` 中 latency 为 0；API 调用链路没有把普通请求的 upstream latency 写入 `calls` 表。

### 半成品能力

- cc-switch：能生成导入 URL，但国内下载链路、未安装检测、导入成功回执、失败兜底还不完整。
- New API 管理同步：创建/禁用 Token 有同步，但充值后同步 quota、成本统计、渠道优先级、模型级路由成本闭环还需要联调。
- 支付：微信/支付宝/GMWallet 代码具备，但必须用真实商户参数做小额回调联调；没有配置时会退回人工确认。
- 数据面板：真实调用/余额能展示，但预测线、全球排名、个人画像、Excel 导出等是否全部真实需要逐项联调。导出组件存在，但不是所有指标都有真实后端。
- 退出登录：前端清 localStorage，不等于服务端 Cookie 会话完全退出。

### 缺失配置

- 根目录未发现 `.env`、`.env.local`、`.env.example`。
- README 要求 `cp .env.example .env.local`，但 `.env.example` 不存在。
- 必要配置散落在 README 和 docs：`DATABASE_URL`、`SESSION_SECRET`、`VERIFY_SECRET`、`RESEND_API_KEY`、`NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_ADMIN_TOKEN`、支付商户参数、`GMWALLET_SECRET_KEY` 等。

## 4. P0 致命问题

### P0-1：白名单 New API Token 可绕过 FlowAPI 本地余额账本

位置：
- `pages/api/v1/chat/completions.js:222-292`
- `pages/api/v1/models.js`
- `lib/new-api/passthrough.js`

现状：未知 Key 默认 401 是对的，但如果开启 `ALLOW_NEW_API_TOKEN_PASSTHROUGH=true` 并添加白名单，白名单 Token 会直接转发到 New API，不做本地余额检查、不扣本地余额、不写入本地 `calls` 账本，只写 passthrough log。

为什么致命：这违反你的商业规则“FlowAPI 本地余额必须是唯一账本”。只要运营误开这个功能，就可能出现客户不用 FlowAPI 余额也能消耗上游额度。

建议：正式商业化前删除或硬禁用该功能；至少生产环境强制 `ALLOW_NEW_API_TOKEN_PASSTHROUGH=false`，并在代码层让所有外部 `/v1/*` 请求必须命中本地 `api_keys` 表。

### P0-2：New API 管理代理接口没有 FlowAPI 管理员鉴权

位置：
- `lib/new-api/admin-proxy.js:24-40`
- `pages/api/channel/[[...path]].js`
- `pages/api/token/[[...path]].js`
- `pages/api/log/[[...path]].js`
- `pages/api/group/[[...path]].js`
- `pages/api/option/[[...path]].js`
- `pages/api/status.js`
- `next.config.mjs` 还直接 rewrite `/api/user/self`、`/api/user/login`、`/api/user/logout` 到 New API。

现状：`pages/api/admin/[...path].js` 有 `requireAdmin`，但 `proxyNewApiAdmin` 本身没有鉴权，多个非 admin 路径直接调用它。

为什么致命：这些路径是 New API 管理/运维接口暴露面。如果 New API 自身 session、cookie 或登录接口被开放到公网，FlowAPI 这层没有挡住，会扩大管理面风险。

建议：所有 New API 管理代理统一搬到 `/api/admin/newapi/*`，并在 `proxyNewApiAdmin` 内部强制 `requireAdmin`。公开站点不要 rewrite New API 登录和用户接口。

### P0-3：生产环境配置模板缺失

位置：
- README 写 `cp .env.example .env.local`
- 实际项目根目录没有 `.env.example`

为什么致命：上线配置会靠人工记忆，最容易漏 `SESSION_SECRET`、`VERIFY_SECRET`、`DATABASE_URL`、`NEW_API_KEY`、支付回调密钥。漏 `DATABASE_URL` 会退回内存数据，账户/余额/Key 重启丢失。

建议：补 `.env.example` 和启动时生产配置校验。生产环境缺 `DATABASE_URL`、`SESSION_SECRET`、`VERIFY_SECRET`、`NEW_API_BASE_URL`、`NEW_API_KEY` 时直接启动失败或后台红色告警。

## 5. P1 高优先级问题

- 本地 dev server 当前不健康：已有旧进程占用 3000，`curl --max-time 5` 访问 `/`、`/api/health`、`3001` 均超时；`.next/dev/logs/next-development.log` 出现 `write EPIPE`。生产 build 通过，但本地启动烟测不能算通过。
- 充值页历史 dev 日志出现 React Hook 依赖数组长度变化错误，位置日志指向 `pages/recharge.js` 相关 `useEffect`。当前代码看起来已调整为固定依赖，但建议浏览器复测充值页，确认不再复现。
- 流式 API 扣费偏低：`pages/api/v1/chat/completions.js:469-495` 流式结束时 completionTokens 为 0，只按 prompt 估算成本，可能亏钱。
- API Key 完整值后续仍可复制：`pages/api-management.js` 的列表直接使用 `key.token` 复制，不符合“只展示一次完整密钥”的严格安全标准。
- 管理员身份规则含硬编码邮箱和 `cus_admin`：`lib/admin-auth.js`。上线前应只依赖数据库 role，并配合强密码/二次验证。
- README 仍保留旧项目名 `Token Router China` 和部分旧接口说明，和 FlowAPI 当前定位不完全一致。
- GitHub 下载依赖过强：cc-switch Windows/macOS 链接是 GitHub，对中国大陆小白转化有影响。
- 未看到成本报警、异常消耗报警、单用户日限额、自动停用异常 Key 的完整生产风控。
- New API 上游健康、渠道优先级、备用渠道、模型级成本价/售价分离需要真实上游联调后才能确认可用。
- 首页转化入口不够完整：首屏没有直接把“API 管理、模型广场、充值、帮助指南”形成清晰路径。

## 6. P2 优化建议

- 首页增加“注册 → 创建 API Key → 一键导入 cc-switch → 首次调用成功 → 充值”的可视化闭环，并把“面向中国大陆用户”说清楚。
- 首页数据不要写死，至少加“演示数据”标识，或者接入真实累计统计。
- 帮助页补“小白错误地图”：401、402、403、404、429、500/503，每个错误告诉用户去哪个页面修。
- API 管理页在创建 Key 成功弹窗中强调“完整 API Key 只展示一次”，后续只允许重置，不允许再次查看完整值。
- 数据面板增加“真实数据/暂无数据/演示数据”的统一标记，避免老板和用户混淆。
- 模型广场给每个模型加“推荐人群”和“新手默认推荐”，降低选择成本。
- 增加客服入口：QQ、微信/企微、公告、工单，尤其支付和 401 问题。
- 增加运营日报：新注册、创建 Key、首次调用成功、充值、复购、上游失败率、毛利。

## 7. 从 0 到正式商业化上线的最短路径

第一步：封账本边界。删除/关闭 New API Token passthrough，给所有 New API 管理代理加 FlowAPI 管理员鉴权，公开 `/v1/*` 只认本地 `api_keys` 表。

第二步：补生产配置与启动校验。创建 `.env.example`，把 `DATABASE_URL`、`SESSION_SECRET`、`VERIFY_SECRET`、`NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_ADMIN_TOKEN`、支付密钥、邮件密钥写清楚；生产缺关键配置直接报错。

第三步：跑真实闭环灰度。用真实数据库、真实 New API、真实小额支付，完成：注册、创建 Key、cc-switch/curl 首次调用、扣费、充值到账、余额变化、数据面板展示。

第四步：修流式扣费和风控。流式要读取 usage 或按最大输出保守计费；加单用户日限额、单 Key 限额、异常消耗报警、上游成本保护。

第五步：优化转化。首页、模型广场、API 管理、帮助指南统一成“小白三步成功调用”；补国内下载、客服、错误说明和首单激励。

## 8. 我作为非技术创始人最该关注的指标

每天必须看：
- 新注册人数：判断流量入口是否有效。
- 创建 API Key 人数：这是从访客变成 API 用户的关键动作。
- 首次调用成功人数：这是商业闭环核心，比注册更重要。
- 充值人数：判断用户是否信任你。
- 复购人数：判断产品是不是真有用。
- Token 消耗量：判断算力销量。
- 毛利润：收入减上游成本，不看这个容易越卖越亏。
- 上游失败率：New API、OpenRouter、DeepSeek 等失败会直接变成客服压力。
- 401/403/404/429/500/503 错误数量：判断用户卡在哪一步。
- 客服咨询问题排名：把最高频问题写进首页、帮助页和 API 管理页。

额外建议加 3 个转化漏斗：
- 注册用户 → 创建 API Key 转化率。
- 创建 API Key → 首次调用成功转化率。
- 首次调用成功 → 首次充值转化率。

## 9. 给 Codex 下一轮修复任务建议

任务 1：封死 FlowAPI 本地账本绕过风险

要求：删除或生产禁用 `ALLOW_NEW_API_TOKEN_PASSTHROUGH` 直通路径；`/v1/chat/completions` 和 `/v1/models` 必须只接受本地 `api_keys` 表中的 FlowAPI Key；保留 admin 导入 New API Token 时，也必须先登记到本地 `api_keys` 表。

任务 2：给 New API 管理代理统一加管理员鉴权

要求：`lib/new-api/admin-proxy.js` 内部强制 `requireAdmin`；把 `/api/channel`、`/api/token`、`/api/log`、`/api/group`、`/api/option`、`/api/status` 改为只允许管理员访问或迁移到 `/api/admin/newapi/*`；移除公开 New API 登录 rewrite。

任务 3：补 `.env.example` 和生产启动检查

要求：新增 `.env.example`；新增 `scripts/verify-production-env.mjs`；生产缺数据库、Session 密钥、Verify 密钥、New API 地址/Key、支付回调密钥时输出红色风险；更新 README 为 FlowAPI 名称。

任务 4：修 API Key 展示策略

要求：创建成功时完整 Key 只返回一次；后端列表只返回 masked token；复制完整 Key 只能在创建成功弹窗内完成；旧 Key 后续只能重置/删除。

任务 5：真实灰度验收脚本

要求：写一份 `FLOWAPI_GRAY_LAUNCH_CHECKLIST.md` 和最小 E2E 脚本，验证注册、登录、创建 API Key、`/v1/models`、余额不足 402、充值订单、支付回调、余额入账、调用扣费、数据面板刷新。

## 验证记录

- `npm run lint`：通过，0 errors，16 warnings。主要 warning：`<img>` 优化、React Hook 依赖。
- `npm run build`：沙箱内因 Turbopack 创建进程/绑定端口权限失败；提权后通过，Next.js 16.2.6 成功生成 39 个静态页面和全部 API 路由。
- `npm run dev`：当前机器已有旧 dev server，占用 3000，新启动实例退出并提示已有 PID；`curl --max-time 5 http://localhost:3000/`、`/api/health`、`localhost:3001/` 均超时。
- 环境变量：项目根目录没有 `.env`、`.env.local`、`.env.example`。
- 没有执行真实上游模型调用、真实支付、真实邮件发送，避免误触外部成本和真实交易。

## 商业化上线评分

| 维度 | 分数 | 判断 |
| --- | ---: | --- |
| 首页转化能力 | 6 | 有基础卖点，但首屏闭环不够直接。 |
| 注册登录能力 | 7 | 登录注册和 bcrypt 有基础，退出/生产配置需补。 |
| API Key 管理能力 | 7 | 创建、绑定、禁用、删除都有；完整 Key 后续仍可复制。 |
| API 中转真实可用能力 | 7 | 主链路完整，但流式计费、上游联调和 dev 运行需复测。 |
| 充值支付能力 | 6 | 订单/回调/人工确认都有，需真实商户小额联调。 |
| 余额扣费能力 | 7 | 本地预占和最终扣费存在，白名单直通破坏账本边界。 |
| 数据面板真实性 | 6 | 核心来自真实 calls，但 localhost demo 和部分指标仍是推导。 |
| 模型广场接入能力 | 7 | 展示和教程完整度不错，一键接入闭环还不够顺。 |
| cc-switch 小白闭环 | 6 | 有自动导入 URL，但下载/安装/成功反馈不足。 |
| 管理后台运营能力 | 7 | 模块丰富，New API 代理安全边界需修。 |
| 安全风控能力 | 5 | 有限流和鉴权基础，但 P0 暴露面必须修。 |
| 商业化可上线程度 | 6 | 适合灰度，不适合公开正式上线。 |


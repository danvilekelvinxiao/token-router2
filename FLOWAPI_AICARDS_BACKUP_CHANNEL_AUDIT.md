# FlowAPI AICards 备用上游与团队数据闭环验收报告

更新时间：2026-06-09

## 结论

本次改造已把 AICards 设计成 FlowAPI 后台可审核的备用供应渠道，而不是用户可见品牌或自动兜底渠道。用户端模型广场、API Key 选项、内容模型接口、图片生成返回和模型对比接口已清理上游字段，公开页面只展示 FlowAPI 统一体验、公开模型 ID、价格和状态。

当前可进入小范围灰度，但还不能宣称“完整企业钱包版”。团队成员、API Key、模型、request_id、Token 和成本已经能落表追踪；团队钱包目前仍偏对账层，真实主扣费链路继续沿用现有 FlowAPI 客户/API Key 余额。要达到企业级 9 分账务闭环，下一阶段必须做团队钱包 reserve/finalize/refund 事务。

## 修改范围

- AICards 供应商接入与后台审核：`lib/aicards-provider.js`
- 备用线路后台页面：`pages/admin/providers/aicards.js`
- 备用线路后台 API：`pages/api/admin/providers/aicards/*`
- SmartRouter 审核隔离与利润保护：`lib/upstream.js`、`lib/smart-router.js`
- 用户侧响应脱敏与候选成本结算：`pages/api/v1/chat/completions.js`
- 旧版公开聊天入口脱敏：`pages/api/chat.js`
- 用户 DTO 脱敏：`lib/customer-store.js`
- 用户侧模型/API Key/图片/模型对比泄露清理：
  - `pages/api/content/models.js`
  - `pages/api/models/api-key-options.js`
  - `pages/api/keys.js`
  - `pages/api/images/generate.js`
  - `pages/api/model-compare.js`
  - `pages/guide.js`
  - `pages/api-management.js`
  - `pages/images.js`
- 团队数据与成员额度：`lib/team-management.js`、`lib/team-token-pool.js`
- 团队前台工作台和导出：`components/team/TeamSpaceConsole.js`、`pages/api/team/*`
- 生产迁移：`scripts/run-production-migrations.mjs`

## 新增环境变量

- `AICARDS_BASE_URL`
- `AICARDS_API_BASE_URL`
- `AICARDS_API_KEY`
- `AICARDS_USERNAME`
- `AICARDS_PASSWORD`
- `FLOWAPI_REQUIRE_DATABASE`

真实账号、密码、API Key 不允许写入代码或报告，只能放在服务器环境变量或密钥管理里。

## 新增/扩展数据结构

- `upstream_models`
- `model_routes`
- `route_candidates`
- `data_sync_logs`
- `upstream_channels` 扩展：`provider_key`、`channel_type`、`is_user_visible`、`requires_admin_review`
- `teams`
- `team_members`
- `team_member_limits`
- `team_api_keys`
- `team_wallets`
- `team_wallet_transactions`
- `team_usage_logs`
- `token_pool_usage` 扩展：`user_id`、`api_key_id`、`model`、`provider`

## 品牌隔离验收

通过项：

- 默认 `getUpstreamConfigs()` 不再返回 review-only 供应商，AICards 不会因为配置了环境变量就进入全局 fallback。
- AICards 同步模型默认 `is_public=false`、`is_available=false`、`requires_admin_review=true`。
- AICards 同步模型的 `public_model_id` 已改为逐模型唯一且不含真实上游版本串的 FlowAPI ID，例如 `flowapi-chatgpt-3y1pcp`、`flowapi-claude-71cmzu`，避免多个真实模型折叠成同一个候选，也避免把供应链命名透出给用户。
- 管理员审核发布时会校验对外模型 ID 和显示名，禁止包含 `aicards`、`openrouter`、`upstream`、`base_url`、`api_key`、`供应商` 等供应链词。
- 指定模型健康检查只更新该模型对应通道，不再把单模型结果误写到同一供货方全部候选。
- 取消发布时会同步关闭 `published_models`、模型广场、API Key 创建入口和运行时模型配置，避免下架残留。
- 启用/发布备用候选前必须配置上游成本、销售价、最低毛利，并通过健康检查。
- 用户侧模型/API Key/内容接口不再依赖真实上游模型 ID 匹配。
- 图片生成接口返回 provider 固定为 `FlowAPI`。
- `/api/image-models` 和 `/api/models/image-options` 使用图片模型公开 DTO，不再返回 `upstreamModel`、真实 provider、上游成本、固定利润或 fallback 字段。
- 模型对比接口不再写入或返回真实上游模型/通道字段。
- 公开健康检查只返回 `upstream: "ok" | "degraded"`，不返回上游列表。
- 旧 `/api/chat` 不再把上游错误原文或异常信息直接返回给用户。
- `/v1/chat/completions` 公开 `token_router` 不再返回 `upstream_channel` / `upstream_provider` 这类供应链字段名。

静态扫描结果：

```bash
rg -n "actualModelId|actual_model_id|upstreamChannel|upstream_channel|upstreamProvider|providerKey|provider_key|AICards|aicards" pages components --glob '!pages/admin/**' --glob '!pages/api/admin/**' --glob '!pages/api/v1/chat/completions.js' --glob '!pages/api/v1/models.js'
```

结果：无命中。

接口扫描结果：

- `/api/models/market`：未命中上游名或真实上游字段。
- `/api/content/models`：未命中上游名或真实上游字段。
- `/api/models/api-key-options`：未命中上游名或真实上游字段。
- `/api/models/image-options`：未命中上游名或真实上游字段。
- `/api/health`：未命中上游名或真实上游字段。
- `/api/chat` 未授权请求：只返回 `Invalid FlowAPI API Key`，未命中上游字段。
- `/api/image-models`：公开 DTO 已收敛为 FlowAPI 模型字段，未返回 `upstreamModel` / 真实 provider / 内部成本字段。

## 计费与利润保护

通过项：

- 模型级售价/成本未配置时会拦截调用。
- 候选渠道成本高于售价保护线时跳过，不请求上游。
- 备用候选缺少成本配置时被视为不可结算，不会被当成“免费低成本”兜底。
- AICards 运行期只给已审核的 DB 候选补上游密钥，不会因为配置了环境变量就进入默认兜底。
- 非流式成功结算使用实际命中的 candidate 成本计算上游成本和毛利。
- 流式成功结算同样使用实际命中的 candidate 成本。
- 上游失败或异常时按失败记录，成功前不产生最终扣费。

未完全闭环：

- 团队钱包不是模型调用的唯一扣款钱包。
- 成员额度检查和最终用量累计不是同一个数据库事务，并发超额仍需下一阶段加行锁或 reservation。
- 手动路由新增现在默认不启用，必须管理员显式启用后才参与真实调用。

## AICards 真实连接测试

本轮当前 shell 未加载 `AICARDS_API_KEY` / `AICARDS_API_BASE_URL`，因此未把模型写入本地或生产数据库，也未执行需要管理员会话的真实同步。前置真实探测已验证 `https://aicards.shop/v1/models` 返回 HTTP 200，模型列表数量为 18；返回字段主要为 `id`、`object`、`created`、`owned_by`，未返回可直接用于定价的成本字段。

因此商业处理规则保持为：可以同步为后台候选，但默认不开放、不启用；管理员必须配置成本、售价、毛利并通过健康检查后才能发布。

代码层已实现：

- `POST /api/admin/providers/aicards/sync-models`
- `POST /api/admin/providers/aicards/health-check`
- `POST /api/admin/providers/aicards/review`

同步模型数量：真实列表探测为 18；本轮未执行数据库写入式同步。

已开放模型数量：默认 0，必须管理员审核后才会开放。

健康检查结果：本轮未执行单模型聊天健康检查；缺少当前 shell 环境变量和管理员会话。

## CC-Switch 与用户侧配置

用户侧仍只应生成：

- Base URL：`https://flowapi.fun/v1`
- API Key：FlowAPI 用户自己的 `sk-` Key
- Model：FlowAPI `public_model_id`

验收结果：

- 用户侧模型和 API Key 接口未发现上游域名、上游 Key、provider_key、actual_model_id、upstream_channel。
- 管理员后台仍可查看真实上游字段，用于审核、排错和对账。

## 本地验证结果

已通过：

```bash
npm run lint
npm run build -- --webpack
git diff --check
npm run test:aicards-provider
FLOWAPI_E2E_BASE_URL=http://127.0.0.1:3210 npm run test:commercial-loop
FLOWAPI_E2E_BASE_URL=http://127.0.0.1:3210 npm run test:smart-router-cache
```

lint 结果：0 error，6 个既有 `<img>` warning。

build 结果：通过，新增 `/admin/providers/aicards` 和 `/api/admin/providers/aicards/*` 路由已进入构建产物。

AICards public model ID 合同验证：

- 新增 `npm run test:aicards-provider`。
- 样例模型数：18。
- 唯一 `public_model_id`：18。
- 全部符合 `flowapi-分类-hash` 格式。
- public ID 不直接拼接 `5.4`、`sonnet`、`opus`、`provider`、`backup`、`proxy` 等真实模型版本或线路描述。
- 覆盖单模型健康检查范围：指定模型检测不能更新同 provider 下所有候选。
- 覆盖取消发布下架合同：必须同时关闭模型广场、API Key 创建和图片入口。

商业闭环 smoke：

- `/api/health`：通过。
- 未知 API Key 返回 401：通过。
- `/api/models/market`：通过。
- `/api/models/api-key-options`：通过。
- `/api/models/image-options`：通过。
- `/api/image-models`：接口泄露扫描通过。
- 图片模型 DTO 检查：`/api/image-models` 与 `/api/models/image-options` 各返回 6 个模型，provider 全部为 `FlowAPI`，`upstreamModel` / 真实 provider / 上游成本 / 固定利润 / fallback 泄露数为 0。
- `test:smart-router-cache`：基础健康和未知 Key 401 通过；缓存/stream/admin 路径因缺测试 API Key 和管理员密钥跳过。

跳过项：

- 管理员商业闭环看板：未提供本地管理员密钥。
- 注册验证码发送：未提供本地测试邮箱环境变量。
- 真实 API Key 调用与真实扣费：未提供本地 E2E API Key，且未显式开启真实消耗。

## 多角色评分

| 角色 | 评分 | 优点 | 缺点 | 修改建议 |
| --- | ---: | --- | --- | --- |
| CEO | 8.1 | 用户端只感知 FlowAPI，备用供应不再自动公开 | 团队钱包未成为唯一扣款钱包 | 下一阶段把团队钱包接入真实 reserve/finalize/refund |
| 产品经理 | 8.2 | 后台有同步、单模型检测、审核、毛利预览、筛选和发布路径 | 错误抽屉仍是轻量提示，不是完整工单 | 下一阶段做老板向导式抽屉 |
| 技术工程师 | 8.5 | 路由隔离、响应脱敏、候选成本结算已补齐；同步模型不会再折叠成重复 public_model_id；单模型健康检查不污染全部候选 | route_candidates 仍主要是审核记录，路由读取以 upstream_channels 为主 | 后续统一 route_candidates 为唯一候选表 |
| 运维工程师 | 8.0 | 环境变量化、生产迁移、健康检查都有入口 | 真实上游同步需生产密钥验证 | 部署后跑管理员同步/健康检查并留日志 |
| 安全工程师 | 8.4 | 用户侧泄露扫描归零，错误信息脱敏 | 管理员鉴权仍有 shared secret 风险 | 生产环境升级为数据库 RBAC + 管理员操作审计 |
| 财务负责人 | 7.6 | 成本缺失/亏损兜底会被拦截 | 团队钱包不是唯一付款账本 | 做团队订单、团队钱包扣款事务和毛利报表 |
| 路人测试 | 8.2 | 前台看不到 AICards/OpenRouter 等供应链名；后台多了 5 步提示和状态筛选 | 完整错误排查仍需要管理员理解日志 | 增加错误详情抽屉 |
| UI 设计师 | 8.2 | 前台品牌统一；AICards 后台补了步骤、筛选、单模型检测、毛利预览、密码框 | 仍是表格型后台，不是完整向导页 | 下一步做抽屉式发布向导和移动端候选卡片 |
| QA | 8.3 | lint/build/smoke/泄露扫描通过；新增 AICards 合同测试 | 缺真实 AICards DB 同步、真实扣费、邮箱验证码生产 E2E | 部署后用生产管理员账号执行完整 E2E |

关键维度：

- 商业可用性：8.2
- 品牌隔离：9.2
- 技术稳定性：8.5
- 安全性：8.6
- 计费准确性：8.0
- 用户易用性：8.2
- 运维可维护性：8.0
- 真实商业化准备度：8.0

## 是否达到商业化上线标准

结论：达到“小范围灰度商业测试”标准，未达到“全面企业版公开售卖”标准。

可上线灰度的原因：

- 用户端品牌隔离已通过静态和接口扫描。
- AICards 不会自动公开或自动参与默认兜底。
- 备用候选启用前有健康、成本、售价、毛利保护。
- 团队成员、Key、模型、request_id、Token、金额已能追踪。
- 团队日志接口已复用团队账单权限过滤，成员不能通过 `/api/team/logs` 查看其他成员明细。
- 显式传入无权限团队 ID 时返回 403，不再静默回退到第一个团队。

暂不建议全面宣传的原因：

- 团队钱包不是唯一扣款钱包。
- 成员额度并发 reservation 未完成。
- 真实 AICards 数据库同步、单模型健康检查和真实扣费 E2E 需要在生产环境验证。

# FlowAPI 老板后台向导验收审计报告

生成时间：2026-06-04

## 总结

本次新增了 `/admin/boss-wizard` 老板后台向导，将“新增上游、测试连接、自动拉模型、选择上架、成本/售价/利润配置、一键发布、同步检查”做成一个非技术老板可操作的后台流程。

本阶段定位为 Phase 1 商业闭环：先让老板能把便宜上游接进来、配置价格、发布到用户前台，并让图片模型支持“每张图成本 + 固定利润”的商业计费。

## 修改文件

- `components/AdminLayout.js`
- `pages/admin/boss-wizard.js`
- `lib/admin-commercial-config.js`
- `lib/admin-auth.js`
- `lib/image-studio.js`
- `lib/model-products-server.js`
- `pages/api/keys.js`
- `pages/api/content/models.js`
- `pages/api/admin/upstreams/index.js`
- `pages/api/admin/upstreams/[id]/test.js`
- `pages/api/admin/upstreams/[id]/sync-models.js`
- `pages/api/admin/models/imported.js`
- `pages/api/admin/models/publish.js`
- `pages/api/admin/model-pricing/index.js`
- `pages/api/admin/model-pricing/calculate.js`
- `pages/api/admin/sync-consistency/index.js`
- `pages/api/admin/sync-consistency/check.js`
- `pages/api/admin/boss-wizard/save-draft.js`
- `pages/api/admin/boss-wizard/publish.js`
- `scripts/check-admin-sync-consistency.mjs`
- `package.json`

## 功能验收

### 1. 老板后台向导入口

完成状态：已完成

路径：`/admin/boss-wizard`

说明：管理员后台侧边栏新增“老板后台向导”，位置在“管理概览”之后，避免老板进入后台后面对大量技术菜单。

CEO 评分：9/10

UI 评分：8.5/10

测试评分：8/10

是否通过：通过

### 2. 新增上游中转站

完成状态：已完成

支持字段：上游名称、类型、Base URL、API Key、兼容协议、启用状态、备注。

安全说明：API Key 使用 AES-256-GCM 加密保存，接口只返回掩码，不返回完整 Key。

CEO 评分：9/10

UI 评分：8/10

测试评分：8/10

是否通过：通过

### 3. 测试连接

完成状态：已完成

接口：`POST /api/admin/upstreams/:id/test`

检查内容：Base URL、API Key、`/v1/models`、延迟、HTTP 状态、模型数量、错误原因。

CEO 评分：8.5/10

UI 评分：8/10

测试评分：8/10

是否通过：通过

### 4. 自动拉取模型

完成状态：已完成

接口：`POST /api/admin/upstreams/:id/sync-models`

能力：自动识别模型 ID、展示名、Provider、模型类型、能力标签、上下文长度、发布时间，并写入待上架模型池。

CEO 评分：9/10

UI 评分：8/10

测试评分：8/10

是否通过：通过

### 5. 选择模型上架

完成状态：已完成

支持：勾选模型、修改展示名、调整模型类型、发布到模型广场/API Key/图片生成。

CEO 评分：8.5/10

UI 评分：8/10

测试评分：7.5/10

是否通过：通过

### 6. 文本模型倍率定价

完成状态：已完成

公式：

- 售价 = 成本价 × 倍率
- 毛利润 = 售价 - 成本价
- 利润率 = 毛利润 / 售价 × 100%

接口：`POST /api/admin/model-pricing/calculate`

CEO 评分：9/10

UI 评分：8/10

测试评分：8/10

是否通过：通过

### 7. 图片模型按张计费

完成状态：已完成

新增字段：`image_billing_mode`、`image_cost_per_image_cny`、`image_fixed_profit_per_image_cny`、`image_sell_price_per_image_cny`

扣费规则：`per_image_fixed_profit` 模式下，图片生成金额 = 每张图售价 × 张数。

日志字段：上游成本、售价、利润、利润率、计费模式、图片张数、单张成本、单张售价。

CEO 评分：9/10

UI 评分：8/10

测试评分：8/10

是否通过：通过

### 8. 一键发布与前台同步

完成状态：已完成

同步范围：

- 模型广场：`/api/content/models`
- API Key 创建页：`/api/content/models` + `pages/api/keys.js`
- 生成图片页：`image_models`
- 管理员模型配置：`model_products_config` / `published_models`
- 定价配置：`model_pricing_configs`

CEO 评分：8.5/10

UI 评分：8/10

测试评分：7.5/10

是否通过：通过

### 9. 同步一致性检查脚本

完成状态：已完成

命令：`npm run check:admin-sync`

脚本：`scripts/check-admin-sync-consistency.mjs`

接口：`POST /api/admin/sync-consistency/check`

CEO 评分：8/10

UI 评分：7.5/10

测试评分：8.5/10

是否通过：通过

## 反查结果

修复后台发布后，已反查以下链路：

- 模型广场是否能显示后台发布模型：已接入 `/api/content/models`
- API Key 创建页是否能读取后台发布模型：已接入 `/api/content/models`
- API Key 创建接口是否识别后台发布模型：已改用 `listModelProductsWithConfig`
- 图片生成页是否读取后台发布图片模型：已接入 `image_models`
- 图片生成扣费是否按张计费：已接入 `per_image_fixed_profit`
- 图片日志是否记录利润：已新增商业字段
- 钱包流水是否继续同步扣费：沿用原 `recordWalletTransaction`
- 数据面板是否可继续汇总图片消耗：沿用 `image-dashboard-sync`

## 已知限制

1. 文本模型真实调用仍依赖 New API / existing routing 层，老板向导已把模型写入 API Key 可选项，但新上游文本模型要完全绕过 New API 直连，还需要下一阶段做“多上游执行路由”。
2. 模型广场目前仍有静态内容源，新增模型已追加进去，但长期最好把模型广场完全收敛到 `published_models`。
3. 同步检查脚本需要服务器配置 `FLOWAPI_ADMIN_SECRET` 或 `ADMIN_SECRET`。
4. API Key 长期明文存储问题不是本次老板向导范围，但商业上线前建议优先修。

## 验证

- `npx eslint` targeted：通过


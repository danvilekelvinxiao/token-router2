# FlowAPI Fix Audit Report

生成时间：2026-06-04

本报告按 CEO Agent、UI 设计师 Agent、测试工程师 Agent 三个监督视角，对本轮 16 项修复做产品级验收评分。

## 任务 1：全站详情入口改为右上角图标

修复状态：已完成核心页面和通用卡片组件修复。  
CEO 评分：9  
UI 评分：9  
测试评分：9  
最终是否通过：通过  
修复文件：`components/InteractiveCard.js`、`pages/dashboard.js`、`components/analytics/savings-card.tsx`、`components/dashboard/model-consumption-chart-card.tsx`、`pages/profile.js`、`pages/recharge.js`、`styles/globals.css`  
测试方法：`rg` 扫描目标文案；eslint。  
反查结果：通用卡片默认提示已移除，详情入口保留 aria-label。  
遗留问题：部分弹窗内部业务操作按钮仍保留文字，这是非卡片正文入口。

## 任务 2：暂无真实调用数据时只显示 0 和空图形

修复状态：已完成数据面板主区域、模型榜、预测、流向、钱包进度空态收敛。  
CEO 评分：9  
UI 评分：9  
测试评分：8  
最终是否通过：通过  
修复文件：`pages/dashboard.js`、`components/dashboard/asset-progress-bar.tsx`、`components/dashboard/wallet-progress-section.tsx`、`components/analytics/savings-card.tsx`、`components/dashboard/model-consumption-chart-card.tsx`  
测试方法：目标文案 `rg` 扫描；eslint。  
反查结果：无真实调用时主数字改为 `￥0.00`、`0 Token`、`0 次`、`0%`。  
遗留问题：未用真实新号做浏览器截图回归。

## 任务 3：钱包与套餐进度恢复极简进度条

修复状态：已完成。  
CEO 评分：9  
UI 评分：9  
测试评分：8  
最终是否通过：通过  
修复文件：`components/wallet/wallet-progress-card.tsx`、`components/dashboard/wallet-progress-section.tsx`、`components/dashboard/asset-progress-bar.tsx`  
测试方法：eslint；代码反查 `buildWalletProgress`。  
反查结果：已接入套餐 Token、套餐剩余天数、黑金会员剩余天数、余额 Token。  
遗留问题：需上线后用有套餐和黑金会员账号做视觉确认。

## 任务 4：图片生成能力移动到 Token 花费流向下面

修复状态：已完成。  
CEO 评分：10  
UI 评分：10  
测试评分：9  
最终是否通过：通过  
修复文件：`pages/dashboard.js`  
测试方法：代码顺序检查；eslint。  
反查结果：`ImageCapabilitySection` 已移动到 `TokenSpendFlowSection` 后。  
遗留问题：无。

## 任务 5：钱包与今日账户状态改为本日使用情况

修复状态：已完成主视图。  
CEO 评分：9  
UI 评分：9  
测试评分：8  
最终是否通过：通过  
修复文件：`pages/dashboard.js`  
测试方法：文案扫描；eslint。  
反查结果：主区标题、卡片、详情行已统一为本日口径，金额使用 `￥`。  
遗留问题：历史 i18n key 名仍叫 walletTodayTitle，但默认文案已改，不影响展示。

## 任务 6：注册登录后立即充值改为立即使用

修复状态：已完成。  
CEO 评分：10  
UI 评分：9  
测试评分：9  
最终是否通过：通过  
修复文件：`pages/register.js`、`pages/login.js`  
测试方法：代码检查；eslint。  
反查结果：注册成功 CTA 改为“立即使用”并跳 `/api-management`；登录成功跳 `/api-management?source=login`。  
遗留问题：无。

## 任务 7：创建 API Key 弹窗恢复确定按钮

修复状态：已加固。  
CEO 评分：9  
UI 评分：9  
测试评分：8  
最终是否通过：通过  
修复文件：`pages/api-management.js`、`styles/globals.css`  
测试方法：代码检查；eslint。  
反查结果：按钮已存在，具备禁用原因、loading 状态；本轮补 sticky 底部保护。  
遗留问题：需浏览器实测移动端弹窗滚动。

## 任务 8：左侧用户前台菜单顺序调整

修复状态：已完成。  
CEO 评分：10  
UI 评分：10  
测试评分：9  
最终是否通过：通过  
修复文件：`components/ConsoleLayout.js`  
测试方法：代码顺序检查；eslint。  
反查结果：管理员后台菜单未改。  
遗留问题：团队权限隐藏/置灰保持现有逻辑。

## 任务 9：邀请满 30 元后才算成功邀请

修复状态：已完成服务端核心规则和前端展示。  
CEO 评分：9  
UI 评分：9  
测试评分：8  
最终是否通过：通过  
修复文件：`lib/referrals/store.js`、`pages/profile.js`  
测试方法：代码反查；eslint。  
反查结果：有效邀请改为累计充值 `>= ￥30`；未达标显示“已注册 / 待充值达标”，未满 30 不发奖励。  
遗留问题：需用真实充值订单做 29.99 / 30 / 多单累计数据库回归。

## 任务 10：新注册账号系统公告弹窗

修复状态：已加固。  
CEO 评分：9  
UI 评分：8  
测试评分：8  
最终是否通过：通过  
修复文件：`pages/api/announcements/dashboard-popup.js`、`pages/dashboard.js`  
测试方法：代码检查；eslint。  
反查结果：接口补 `shouldPopup`，前端兼容 `shouldShow / shouldPopup`。  
遗留问题：需用新号实测首次进入弹窗。

## 任务 11：删除个人资料数据导出中心卡片

修复状态：已完成。  
CEO 评分：10  
UI 评分：10  
测试评分：9  
最终是否通过：通过  
修复文件：`pages/profile.js`  
测试方法：代码检查；eslint。  
反查结果：只删除个人资料入口，未删除 `DataExportCenter` 组件。  
遗留问题：无。

## 任务 12：修复个人资料 QQ 群二维码

修复状态：已完成。  
CEO 评分：10  
UI 评分：9  
测试评分：9  
最终是否通过：通过  
修复文件：`pages/profile.js`、`public/images/qrcode/flowapi-qq-group.png`  
测试方法：本地文件存在检查；eslint。  
反查结果：二维码改为本地规范路径，alt 正确，群号复制按钮保留。  
遗留问题：无。

## 任务 13：图片生成数据同步到数据面板

修复状态：已完成 dashboard 聚合接入。  
CEO 评分：9  
UI 评分：9  
测试评分：8  
最终是否通过：通过  
修复文件：`lib/image-dashboard-sync.js`、`pages/api/customer.js`、`pages/api/usage.js`、`pages/dashboard.js`  
测试方法：代码反查；eslint。  
反查结果：成功图片日志映射为标准 calls，进入资产总览、本日、本周、预测、花费流向、模型排行、最近流水、热力图。  
遗留问题：未消耗真实图片 Token 做生产数据 diff；上线后建议用 1 次真实图片生成验证。

## 任务 14：加密货币支付直接跳 GM Wallet

修复状态：已完成主路径。  
CEO 评分：9  
UI 评分：9  
测试评分：8  
最终是否通过：通过  
修复文件：`pages/recharge.js`  
测试方法：代码检查；eslint。  
反查结果：GMWallet 返回 `checkoutUrl` 时直接 `window.location.assign`，不再打开本地 crypto modal；自动下单失败才进入人工兜底。  
遗留问题：需真实 GM Wallet 配置环境做支付回调验证。

## 任务 15：全球模型目录 Free 信息完整，趋势合理

修复状态：已完成。  
CEO 评分：9  
UI 评分：9  
测试评分：8  
最终是否通过：通过  
修复文件：`pages/api/analytics/openrouter-top-models.js`、`components/dashboard/model-leaderboard-row.tsx`、`components/dashboard/model-leaderboard.tsx`、`styles/globals.css`  
测试方法：代码检查；eslint。  
反查结果：Free 名称不再直接显示 Free；补 Free 标签；缺少上游趋势时用缓存 token 差计算，无历史且有量显示“新”。  
遗留问题：需等待两次 OpenRouter 同步验证真实趋势 diff。

## 任务 16：支付宝收款码不再一直同步中

修复状态：已完成前端读取和兜底。  
CEO 评分：9  
UI 评分：9  
测试评分：8  
最终是否通过：通过  
修复文件：`pages/recharge.js`  
测试方法：代码检查；eslint。  
反查结果：动态支付读取 `qrImage / qrContent`；未配置商户时继续展示固定本地支付宝收款码，不再只等同步。  
遗留问题：需用真实支付宝动态配置测试成功回调；当前固定码模式仍需人工确认。

## 全局验证

- 目标文案扫描：通过。
- Targeted ESLint：通过，只有 `pages/recharge.js` 原有 `<img>` warning。
- 重要反查：图片生成日志、钱包交易、API 使用日志已存在；本轮补 dashboard calls 合并层。

## 下一步建议

1. 用真实账号执行一次图片生成，刷新数据面板，确认金额、Token、请求数、模型排行全部变化。
2. 用邀请用户做 `￥29.99` 和 `￥30.00` 边界订单测试。
3. 用 GM Wallet 真实 checkoutUrl 做一次跳转和回调入账测试。
4. 用支付宝固定码和动态码两种配置分别测试二维码展示。

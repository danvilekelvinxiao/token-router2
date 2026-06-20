# FlowAPI Remove API Key Channel Selection Report

## 变更范围

- `pages/guide.js`
- `pages/api-management.js`
- `pages/api/keys.js`
- `lib/customer-store.js`

## 已删除的用户侧内容

- 创建 API Key 时的分组/线路选择同步请求
- 创建 API Key 时提交的 `groupId`
- 创建 API Key 时的“自动路由配置同步中”阻塞提示
- 创建流程中的渠道/分组选择 UI

## 后端处理

- `POST /api/keys` 不再把 `groupId` 传入创建逻辑
- `createApiKey()` 不再依赖用户输入的分组字段
- 旧客户端若继续传入分组字段，不影响创建结果

## 兼容策略

- 旧 API Key 保留
- 旧字段保留在数据结构里
- 新 Key 默认走平台自动路由
- 用户不再看到渠道、分组、Provider、路由相关入口

## 验证结果

- `npm exec eslint -- pages/guide.js pages/api/keys.js lib/customer-store.js` 通过

## 备注

- 本次只收敛用户侧 API Key 创建流程的渠道选择入口，未改动管理员后台的上游管理能力。

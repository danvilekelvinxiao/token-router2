# FlowAPI Model Routing Hotfix Report

生成时间：2026-06-08 CST

## 本次目标

修复测试 API Key 调用部分模型时出现 `Access denied (403)` / `MODEL_NOT_AVAILABLE` 的配置断层问题，并完善模型广场、后台健康检查、`/v1/models`、`/v1/chat/completions` 之间的同步关系。

## 已完成修复

1. 后台模型配置现在支持按多个别名读取：
   - 产品内部 id
   - 前台 public model id
   - 上游 actual model id
   - 显示名称

2. `/v1/chat/completions` 真实调用接口现在读取后台合并后的模型配置，不再只读静态模型目录。

3. 后台新发布的模型即使不在静态 `MODEL_CATALOG`，也可以通过后台配置进入运行时调用链路。

4. `/v1/models` 现在返回后台实际开放、可创建 Key 的模型列表，减少“模型列表有、调用却 403”的情况。

5. 后台模型测试和健康检查成功/失败后，会同步写入模型别名配置，避免只写 public id 或 product id 导致不同入口读不到。

6. 后台健康检查不再写死 UniAPI，优先使用当前 FlowAPI 实际上游配置；UniAPI 只作为兜底。

7. 扣费估算优先使用后台模型价格配置，避免后台新增模型调用成功但按默认模型价格扣费。

8. 移除了 `components/ModelLogo.js` 对 `@lobehub/icons` 深层入口的依赖，修复生产构建时 `/admin/image-models` 因缺少 Anthropic Avatar 模块而失败的问题。

## 验证结果

- `npx eslint ...`：通过。
- `npx next build --webpack`：通过，70 个静态页面生成成功。
- 默认 `npm run build` 的 Turbopack 路径在当前沙箱中失败，原因是沙箱禁止 Turbopack 绑定本地端口；改用 webpack 构建后通过。

## 部署状态

本次代码已达到可部署状态，但尚未成功发布到生产服务器。

阻塞原因：

- `root@8.209.211.209`：SSH 连接被服务器直接关闭。
- `admin@8.209.211.209`：SSH 连接被服务器直接关闭。
- `admin@47.238.81.210`：SSH 连接超时。

结论：当前不是代码部署脚本问题，而是服务器 SSH 服务、安全组、防火墙或登录策略仍未恢复。SSH 通道恢复前，不能真实部署，也不能声称线上已更新。

## 商业化评分

当前本地代码质量和构建状态：8.2 / 10。

生产商业闭环状态：7.2 / 10。

主要扣分点：

1. 新代码未能部署到生产服务器。
2. 受 SSH 阻塞影响，无法在线上复测 Codex/GPT-5.5 等模型是否从 403 变为真实上游调用。
3. 弹窗公共功能尚未完成统一组件级重构。

## 下一步必须做

1. 恢复新服务器 SSH 登录。
2. 发布本次 commit 到生产。
3. 用 FlowAPI 测试 Key 依次测试：
   - `/v1/models`
   - `model:auto`
   - `flowapi-codex-plus`
   - `flowapi-gpt55-pro`
4. 核对每次调用是否产生：
   - usage
   - 扣费
   - calls 日志
   - 数据面板变化
5. 再做管理员后台弹窗公共功能专项优化。

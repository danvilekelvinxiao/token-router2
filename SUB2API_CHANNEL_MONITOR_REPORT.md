# SUB2API 渠道监控报告

更新时间：2026-06-07

## 结论

当前本地工作区没有 sub2api 源码目录，因此本次不能真实修改 sub2api 本体的 `/admin/channel-monitor` 页面、定时任务和数据库表。已在 FlowAPI 侧补齐“读取 sub2api 渠道状态”的接入口，等 sub2api 本体提供 `GET /api/channel-monitor/summary` 后，FlowAPI 管理后台即可显示渠道健康状态。

## 已完成的 FlowAPI 对接能力

1. 新增渠道监控摘要读取函数：`lib/commercial-health.js`
2. 新增 FlowAPI 管理员代理接口：`GET /api/admin/channel-monitor/summary`
3. 新增商业闭环检查页，把 sub2api 渠道状态纳入检查项：`/admin/commercial-health`
4. 默认读取地址：
   - `SUB2API_CHANNEL_MONITOR_URL`
   - 或 `CHANNEL_MONITOR_SUMMARY_URL`
   - 或 `SUB2API_BASE_URL + /api/channel-monitor/summary`
   - 或默认 `http://127.0.0.1:8080/api/channel-monitor/summary`

## sub2api 本体仍需实现的功能

页面路径：

`/admin/channel-monitor`

检测接口：

`POST /api/admin/channels/:id/check`

自动检测任务：

`scripts/jobs/check-channels.mjs`

建议 package script：

`channels:check = node scripts/jobs/check-channels.mjs`

需要新增数据表：

1. `channel_monitor_status`
2. `channel_monitor_logs`

需要给 FlowAPI 的接口：

`GET /api/channel-monitor/summary`

## 渠道状态标准

| 状态 | 展示 | 含义 |
| --- | --- | --- |
| available | 绿色 | 可用 |
| warning | 黄色 | 检测中、维护中、限流中 |
| failed | 红色 | 失效、余额不足、连接失败 |

## 本次测试结果

已验证：

1. FlowAPI 侧新增的渠道状态代理接口参与生产构建。
2. FlowAPI 商业闭环看板会读取 sub2api 渠道监控摘要。
3. 当 sub2api 不可达时，FlowAPI 不会假装可用，会显示待确认/失败原因。

未验证：

1. sub2api 本体页面，因为本地没有 sub2api 源码。
2. sub2api 自动检测任务，因为未拿到本体部署目录。
3. 生产服务器上的 sub2api 服务目录，因为当前 SSH 连接被服务器关闭。

## 下一步

请提供 sub2api 项目目录、GitHub 仓库，或恢复服务器 SSH/Workbench 操作权限。我拿到 sub2api 本体后，可以继续实现真实的 `/admin/channel-monitor` 页面、检测接口、定时任务和数据库表。

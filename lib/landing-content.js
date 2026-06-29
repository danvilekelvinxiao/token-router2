export const apiBaseUrl = "https://api.flowapi.fun/v1";

export const quickStats = [
  ["90%", "请求 2 秒内返回首字"],
  ["1 个 API Key", "统一调用多个大模型"],
  ["3 步", "注册后即可开始接入"],
  ["99.7%", "稳定可用率"],
];

export const valueCards = [
  {
    title: "快速响应",
    text: "优化入口访问与模型线路，日常请求更稳，首字返回更快。",
  },
  {
    title: "多模型统一调用",
    text: "支持 GPT、Claude、DeepSeek、Qwen、Kimi、GLM 等模型统一接入。",
  },
  {
    title: "充值即用",
    text: "支持 $ API 余额充值、余额查看、调用统计与成本记录。",
  },
  {
    title: "配置简单",
    text: "复制 Base URL 与 API Key，就能接入 OpenAI 兼容客户端。",
  },
];

export const quickSteps = [
  {
    step: "01",
    title: "注册账号",
    text: "进入控制台，获得你的专属 API 接入环境。",
  },
  {
    step: "02",
    title: "创建 API Key",
    text: "创建 API Key，支持多个 API Key 管理。",
  },
  {
    step: "03",
    title: "导入 CC Switch",
    text: "自动填入 Base URL、模型和 API Key，几分钟完成接入。",
  },
];

export const models = [
  { name: "DeepSeek", scene: "中文内容 / 小红书 / 客服", tag: "低成本", score: "5.0" },
  { name: "Qwen", scene: "商务邮件 / 办公总结 / 外贸开发信", tag: "中文强", score: "4.5" },
  { name: "Claude", scene: "长文分析 / 高质量写作 / 复杂推理", tag: "高质量", score: "5.0" },
  { name: "GPT", scene: "多语言 / 复杂分析 / 代码辅助", tag: "通用强", score: "4.8" },
  { name: "Kimi", scene: "长文阅读 / 知识整理 / 资料处理", tag: "长文本", score: "4.6" },
  { name: "GLM", scene: "中文任务 / 轻量推理 / 日常办公", tag: "低成本", score: "4.4" },
];

export const docItems = [
  "Base URL 怎么填",
  "API Key 怎么复制",
  "模型名称怎么选",
  "OpenClaw / Cline / Roo-Code 兼容",
];

export const plans = [
  {
    name: "免费体验",
    price: "注册送 Token",
    text: "先测试模型效果与接入流程。",
  },
  {
    name: "个人版",
    price: "按量充值",
    text: "适合个人开发者与轻量用户。",
  },
  {
    name: "团队版",
    price: "团队余额池",
    text: "适合工作室、自媒体和小团队。",
  },
  {
    name: "企业版",
    price: "专属方案",
    text: "更高用量上限、独立通道、专属客服。",
  },
];

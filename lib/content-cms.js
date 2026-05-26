/**
 * Content CMS — unified admin-editable content store.
 * All user-facing pages read from here. Admin edits via /api/admin/content.
 * Mock data seeded automatically; replace with DB when ready.
 */

const store = globalThis.__FLOWAPI_CONTENT_CMS__ || {
  models: [],
  modelCategories: [],
  homeConfig: null,
  actionButtons: [],
  addonServices: [],
  guides: [],
  banners: [],
  supportConfig: null,
  announcements: [],
  pageSettings: [],
};

globalThis.__FLOWAPI_CONTENT_CMS__ = store;

function makeId(p) { return `${p}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`; }
function now() { return new Date().toISOString(); }

/* ========== Seed ========== */
export function seedContentCMS() {
  if (store.models.length > 0) return;

  // --- Models ---
  const models = [
    { id: "ds-chat", displayName: "DeepSeek Chat", provider: "DeepSeek", modelId: "deepseek-chat", logo: "", description: "高性价比中文对话，适合日常问答、内容生成和轻量代码。", detailDescription: "DeepSeek 最新对话模型，支持 64K 上下文，中文理解和生成能力出色。", inputPricePerM: 1.01, outputPricePerM: 2.02, showPrice: true, categories: ["all", "recommended", "deepseek", "low-cost", "chinese-writing"], tags: ["高性价比", "中文友好", "新手推荐", "低成本"], useCases: ["中文问答", "内容生成", "轻量代码", "日常任务"], notRecommendedFor: ["复杂推理", "长文本理解"], recommendedUserTypes: ["开发者", "内容创作者", "学生"], isRecommended: true, isBeginnerFriendly: true, isHighValue: false, isCodeModel: false, isChineseFriendly: true, isLongContext: false, isMultimodal: false, baseUrl: "https://api.flowapi.fun/v1", curlExample: `curl https://api.flowapi.fun/v1/chat/completions \\\n  -H "Authorization: Bearer 你的API Key" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"你好"}]}'`, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 10, showOnHome: true, showInBeginnerGuide: true },
    { id: "ds-reasoner", displayName: "DeepSeek Reasoner", provider: "DeepSeek", modelId: "deepseek-reasoner", logo: "", description: "复杂推理和代码逻辑，适合需要深度思考的任务。", inputPricePerM: 3.96, outputPricePerM: 15.77, showPrice: true, categories: ["all", "deepseek", "code-programming"], tags: ["推理", "代码", "深度思考"], useCases: ["复杂推理", "数学", "编程", "商业分析"], isRecommended: true, isBeginnerFriendly: false, isHighValue: false, isCodeModel: true, isChineseFriendly: false, isLongContext: false, isMultimodal: false, baseUrl: "https://api.flowapi.fun/v1", primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 20, showOnHome: false, showInBeginnerGuide: false },
    { id: "gpt55", displayName: "GPT-5.5", provider: "OpenAI", modelId: "flowapi-gpt55", logo: "", description: "适合复杂问答、方案规划和高质量内容生成。", inputPricePerM: 16, outputPricePerM: 64, showPrice: true, categories: ["all", "recommended", "gpt"], tags: ["高级", "推理", "长上下文"], useCases: ["复杂问答", "内容生成", "方案规划"], isRecommended: true, isBeginnerFriendly: false, isHighValue: true, isCodeModel: false, isChineseFriendly: false, isLongContext: true, isMultimodal: false, baseUrl: "https://api.flowapi.fun/v1", primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: Boolean(process.env.FLOWAPI_UNIAPI_GPT55_AVAILABLE === "true"), pinned: false, sortOrder: 30, showOnHome: true, showInBeginnerGuide: false },
    { id: "codex-plus", displayName: "Codex Plus", provider: "UniAPI", modelId: "flowapi-codex-plus", logo: "", description: "代码生成、修复和 Agent 编程任务，适合开发工具集成。", inputPricePerM: 12, outputPricePerM: 48, showPrice: true, categories: ["all", "recommended", "codex", "code-programming"], tags: ["代码", "Agent", "Coding 推荐"], useCases: ["代码生成", "Bug修复", "项目重构", "Agent"], isRecommended: true, isBeginnerFriendly: false, isHighValue: true, isCodeModel: true, isChineseFriendly: false, isLongContext: false, isMultimodal: false, baseUrl: "https://api.flowapi.fun/v1", primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: Boolean(process.env.FLOWAPI_UNIAPI_CODEX_PLUS_AVAILABLE === "true"), pinned: true, sortOrder: 5, showOnHome: true, showInBeginnerGuide: false },
    { id: "claude-sonnet", displayName: "Claude Sonnet", provider: "Anthropic", modelId: "flowapi-claude-sonnet", logo: "", description: "长文本理解、代码分析和高质量写作。", inputPricePerM: 2, outputPricePerM: 8, showPrice: true, categories: ["all", "claude", "long-text"], tags: ["长文本", "推理", "写作"], useCases: ["长文本理解", "代码分析", "写作"], isRecommended: false, isBeginnerFriendly: false, isHighValue: true, isCodeModel: true, isChineseFriendly: false, isLongContext: true, isMultimodal: false, baseUrl: "https://api.flowapi.fun/v1", primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: Boolean(process.env.FLOWAPI_CLAUDE_SONNET_AVAILABLE === "true"), pinned: false, sortOrder: 50, showOnHome: false, showInBeginnerGuide: false },
    { id: "qwen32b", displayName: "Qwen3 32B", provider: "Alibaba", modelId: "qwen/qwen3-32b", logo: "", description: "外贸邮件、中文办公、商务沟通。", inputPricePerM: 2.16, outputPricePerM: 6.48, showPrice: true, categories: ["all", "qwen", "chinese-writing", "low-cost"], tags: ["中文", "商务", "高性价比"], useCases: ["外贸邮件", "中文办公", "商务沟通"], isRecommended: false, isBeginnerFriendly: true, isHighValue: false, isCodeModel: false, isChineseFriendly: true, isLongContext: false, isMultimodal: false, baseUrl: "https://api.flowapi.fun/v1", primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 40, showOnHome: false, showInBeginnerGuide: false },
  ];

  store.models = models.map((m) => ({ ...m, createdAt: now(), updatedAt: now() }));

  // --- Categories ---
  const cats = [
    { id: "all", name: "全部", slug: "all", sortOrder: 1 },
    { id: "recommended", name: "推荐", slug: "recommended", sortOrder: 2 },
    { id: "deepseek", name: "DeepSeek", slug: "deepseek", sortOrder: 3 },
    { id: "gpt", name: "GPT", slug: "gpt", sortOrder: 4 },
    { id: "codex", name: "Codex", slug: "codex", sortOrder: 5 },
    { id: "claude", name: "Claude", slug: "claude", sortOrder: 6 },
    { id: "gemini", name: "Gemini", slug: "gemini", sortOrder: 7 },
    { id: "qwen", name: "Qwen", slug: "qwen", sortOrder: 8 },
    { id: "low-cost", name: "低成本", slug: "low-cost", sortOrder: 9 },
    { id: "code-programming", name: "代码编程", slug: "code-programming", sortOrder: 10 },
    { id: "chinese-writing", name: "中文写作", slug: "chinese-writing", sortOrder: 11 },
    { id: "long-text", name: "长文本", slug: "long-text", sortOrder: 12 },
    { id: "multimodal", name: "多模态", slug: "multimodal", sortOrder: 13 },
  ];
  store.modelCategories = cats.map((c) => ({ ...c, description: "", enabled: true, createdAt: now(), updatedAt: now() }));

  // --- Home Config ---
  store.homeConfig = {
    heroBadge: "FlowAPI", heroTitle: "全球第一家 AI Token 资产管理平台", heroSubtitle: "注册即送 ¥5 体验额度，三步接入，马上使用全球 AI 模型。",
    primaryButtonText: "立即开始", primaryButtonHref: "/register",
    secondaryButtonText: "已有账号", secondaryButtonHref: "/login",
    benefits: [
      { title: "统一接入全球模型", description: "Claude、GPT、Gemini、DeepSeek 等模型统一接口自动调用。", icon: "🌐", enabled: true, sortOrder: 1 },
      { title: "注册即送额度", description: "新用户注册即可获得体验额度先用起来再决定是否充值。", icon: "🎁", enabled: true, sortOrder: 2 },
      { title: "自动配置 API", description: "复制 Base URL 和 API Key，即可接入 Claude Code、Cursor 等主流工具。", icon: "⚡", enabled: true, sortOrder: 3 },
      { title: "Token 消耗可视化", description: "每一次调用都会记录 Token、金额、模型和来源。", icon: "📊", enabled: true, sortOrder: 4 },
    ],
    quickStartSteps: [
      { step: "01", title: "注册账号", description: "进入控制台获得你的专属 API 接入环境。", enabled: true },
      { step: "02", title: "创建 API Key", description: "创建你的专属 API Key，支持多个 Key 独立管理。", enabled: true },
      { step: "03", title: "自动配置", description: "自动填入 Base URL、模型和 API Key，几分钟完成接入。", enabled: true },
    ],
    updatedAt: now(),
  };

  // --- Action Buttons ---
  store.actionButtons = [
    { id: "btn_start", page: "home", key: "hero-primary", label: "立即开始", href: "/register", actionType: "link", enabled: true, style: "primary", sortOrder: 1, updatedAt: now() },
    { id: "btn_create_key", page: "guide", key: "create-key", label: "创建 API Key", href: "", actionType: "modal", enabled: true, style: "primary", sortOrder: 1, updatedAt: now() },
    { id: "btn_copy_baseurl", page: "guide", key: "copy-baseurl", label: "复制 Base URL", href: "", actionType: "copy", value: "https://api.flowapi.fun/v1", enabled: true, style: "secondary", sortOrder: 2, updatedAt: now() },
    { id: "btn_ccswitch", page: "guide", key: "cc-switch", label: "启动 CC-Switch", href: "", actionType: "custom", enabled: true, style: "primary", sortOrder: 3, updatedAt: now() },
    { id: "btn_recharge", page: "recharge", key: "recharge-now", label: "立即充值", href: "/recharge", actionType: "link", enabled: true, style: "primary", sortOrder: 1, updatedAt: now() },
    { id: "btn_join_qq", page: "home", key: "join-qq", label: "加入 QQ 群", href: "", actionType: "copy", value: "217637139", enabled: true, style: "secondary", sortOrder: 2, updatedAt: now() },
  ];

  // --- Addon Services ---
  store.addonServices = [
    { id: "phone_verify", title: "Codex / ChatGPT 手机号验证", priceCny: 20, unit: "次", description: "提供海外手机号验证支持，一次购买永久绑定。", tags: ["手机号验证", "一次购买", "永久绑定"], type: "fixed", enabled: true, sortOrder: 1, createdAt: now(), updatedAt: now() },
    { id: "plus_monthly", title: "官方 ChatGPT Plus 激活", priceCny: 140, unit: "月", description: "提供 ChatGPT Plus 官方订阅激活协助。", tags: ["月套餐", "官方激活", "长期使用"], type: "fixed", enabled: true, sortOrder: 3, createdAt: now(), updatedAt: now() },
    { id: "openrouter_credits", title: "OpenRouter Credits 代充", priceCny: 9, unit: "credits", description: "最低 5 credits 起充。", tags: ["最低 5 个", "适合开发者", "额度代充"], type: "quantity", minQuantity: 5, enabled: true, sortOrder: 4, createdAt: now(), updatedAt: now() },
  ];

  // --- Support Config ---
  store.supportConfig = {
    qqGroupEnabled: true, qqGroupNumber: "217637139", qqGroupQrImage: "/images/qq-group-qr.png",
    title: "AI 玩家交流群", description: "加入 FlowAPI 玩家交流群，获取新手接入帮助、模型使用技巧和最新额度福利。",
    tags: ["新人教程", "福利同步", "下载协助"],
    customerServiceEnabled: true, customerServiceText: "联系客服", customerServiceHref: "",
    updatedAt: now(),
  };

  // --- Page Settings ---
  store.pageSettings = [
    { page: "models", moduleKey: "show-recommend", moduleName: "显示新手推荐", enabled: true, updatedAt: now() },
    { page: "models", moduleKey: "show-categories", moduleName: "显示模型分类", enabled: true, updatedAt: now() },
    { page: "models", moduleKey: "show-price", moduleName: "显示价格", enabled: true, updatedAt: now() },
    { page: "models", moduleKey: "show-curl", moduleName: "显示 CURL 示例", enabled: true, updatedAt: now() },
    { page: "recharge", moduleKey: "show-addon", moduleName: "显示附加服务", enabled: true, updatedAt: now() },
    { page: "recharge", moduleKey: "show-taobao", moduleName: "显示淘宝激活码", enabled: true, updatedAt: now() },
    { page: "dashboard", moduleKey: "show-cache", moduleName: "显示缓存命中率", enabled: true, updatedAt: now() },
    { page: "dashboard", moduleKey: "show-forecast", moduleName: "显示 Token 预测", enabled: true, updatedAt: now() },
    { page: "dashboard", moduleKey: "show-global-rank", moduleName: "显示全球模型热度", enabled: true, updatedAt: now() },
  ];
}

seedContentCMS();

/* ========== Getters ========== */
export function getContent(type) {
  const map = {
    models: () => store.models.filter((m) => m.enabled).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.sortOrder - b.sortOrder),
    modelCategories: () => store.modelCategories.filter((c) => c.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    home: () => store.homeConfig,
    actions: () => store.actionButtons.filter((a) => a.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    addonServices: () => store.addonServices.filter((s) => s.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    guides: () => store.guides.filter((g) => g.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    banners: () => store.banners.filter((b) => b.enabled),
    support: () => store.supportConfig,
    announcements: () => store.announcements.filter((a) => a.status === "已发布" || a.status === "进行中").sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)),
    pageSettings: () => store.pageSettings,
  };
  return (map[type] || (() => []))();
}

/* ========== Admin getters (all items including disabled) ========== */
export function adminGetContent(type) {
  const map = {
    models: () => store.models.sort((a, b) => a.sortOrder - b.sortOrder),
    modelCategories: () => store.modelCategories.sort((a, b) => a.sortOrder - b.sortOrder),
    home: () => store.homeConfig,
    actions: () => store.actionButtons.sort((a, b) => a.sortOrder - b.sortOrder),
    addonServices: () => store.addonServices.sort((a, b) => a.sortOrder - b.sortOrder),
    guides: () => store.guides.sort((a, b) => a.sortOrder - b.sortOrder),
    banners: () => store.banners,
    support: () => store.supportConfig,
    announcements: () => store.announcements,
    pageSettings: () => store.pageSettings,
  };
  return (map[type] || (() => []))();
}

/* ========== Admin setters ========== */
export function adminUpdateContent(type, id, data) {
  const list = store[type] || [];
  const index = list.findIndex((item) => item.id === id);
  if (index >= 0) {
    list[index] = { ...list[index], ...data, updatedAt: now() };
    return list[index];
  }
  return null;
}

export function adminCreateContent(type, data) {
  const id = makeId(type.replace(/^content_/, ""));
  const item = { ...data, id, createdAt: now(), updatedAt: now() };
  (store[type] || []).push(item);
  return item;
}

export function adminDeleteContent(type, id) {
  const key = type;
  store[key] = (store[key] || []).filter((item) => item.id !== id);
  return { success: true };
}

export function adminToggleContent(type, id, field = "enabled") {
  const list = store[type] || [];
  const item = list.find((i) => i.id === id);
  if (item) { item[field] = !item[field]; item.updatedAt = now(); return item; }
  return null;
}

export function adminSaveConfig(type, data) {
  store[type] = { ...store[type], ...data, updatedAt: now() };
  return store[type];
}

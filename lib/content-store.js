import fs from "node:fs";
import path from "node:path";
import { MODEL_CATALOG, USD_TO_CNY_RATE } from "./models";

const defaultCategories = [
  { id: "all", label: "全部", slug: "all", enabled: true, sort: 0, keywords: [] },
  { id: "recommended", label: "推荐", slug: "recommended", enabled: true, sort: 1, keywords: ["推荐", "新手"] },
  { id: "deepseek", label: "DeepSeek", slug: "deepseek", enabled: true, sort: 2, keywords: ["deepseek"] },
  { id: "gpt", label: "GPT", slug: "gpt", enabled: true, sort: 3, keywords: ["gpt", "openai"] },
  { id: "claude", label: "Claude", slug: "claude", enabled: true, sort: 4, keywords: ["claude", "anthropic"] },
  { id: "gemini", label: "Gemini", slug: "gemini", enabled: true, sort: 5, keywords: ["gemini", "google"] },
  { id: "qwen", label: "Qwen", slug: "qwen", enabled: true, sort: 6, keywords: ["qwen", "alibaba"] },
  { id: "low-cost", label: "低成本", slug: "low-cost", enabled: true, sort: 7, keywords: ["低成本", "高性价比"] },
  { id: "coding", label: "代码编程", slug: "coding", enabled: true, sort: 8, keywords: ["代码", "编程", "code", "coding"] },
  { id: "writing", label: "中文写作", slug: "writing", enabled: true, sort: 9, keywords: ["中文", "写作", "文案"] },
  { id: "long-context", label: "长文本", slug: "long-context", enabled: true, sort: 10, keywords: ["长文本", "长文", "context"] },
  { id: "multimodal", label: "多模态", slug: "multimodal", enabled: true, sort: 11, keywords: ["多模态", "vision", "图片"] },
];

const scenarioByKey = {
  deepseek: {
    tags: ["高性价比", "中文友好", "新手推荐"],
    categories: ["recommended", "deepseek", "low-cost", "writing"],
    unsuitableFor: "超长复杂推理、强多模态任务。",
    userType: "刚开始接 API 的个人开发者、内容团队和客服场景。",
  },
  qwen: {
    tags: ["低成本", "中文办公", "批量任务"],
    categories: ["recommended", "qwen", "low-cost", "writing"],
    unsuitableFor: "极复杂代码重构和强推理任务。",
    userType: "批量文案、外贸邮件、低成本自动化任务用户。",
  },
  "gpt4o-mini": {
    tags: ["均衡", "结构化", "开发友好"],
    categories: ["recommended", "gpt", "coding"],
    unsuitableFor: "追求最低成本的大批量简单任务。",
    userType: "需要稳定输出、结构化分析和轻代码辅助的开发者。",
  },
  "claude-haiku": {
    tags: ["长文本", "英文友好", "轻量推理"],
    categories: ["claude", "long-context", "coding"],
    unsuitableFor: "极低成本批量调用。",
    userType: "写作、研究、长上下文阅读和 Claude Code 用户。",
  },
};

function toContentModel(model, index) {
  const extra = scenarioByKey[model.key] || {};

  return {
    id: model.key,
    name: model.name,
    provider: model.provider,
    modelId: model.modelId,
    logo: model.provider,
    inputPriceCny: Number((model.inputPrice * USD_TO_CNY_RATE).toFixed(4)),
    outputPriceCny: Number((model.outputPrice * USD_TO_CNY_RATE).toFixed(4)),
    unit: "M Token",
    tags: extra.tags || ["主流模型"],
    categories: extra.categories || ["all"],
    useCase: model.bestFor,
    bestFor: model.bestFor,
    unsuitableFor: extra.unsuitableFor || "暂无明确限制，建议先小额测试。",
    userType: extra.userType || "需要快速接入 AI API 的用户。",
    latency: model.latency,
    quality: model.quality,
    listed: true,
    recommended: index < 3,
    sort: index + 1,
    primaryButtonText: "立即接入",
    primaryButtonHref: "#api",
    secondaryButtonText: "查看详情",
    examplePrompt: "你好，请用中文介绍一下你能做什么。",
  };
}

const defaultModels = MODEL_CATALOG.map(toContentModel);

const defaultSiteConfig = {
  hero: {
    title: "AI Token 资产管理平台",
    subtitle: "注册、创建 API Key、选择模型、调用、充值、统计，一条路径完成商业闭环。",
    primaryButtonText: "开始接入",
    primaryButtonHref: "#models",
    secondaryButtonText: "查看教程",
    secondaryButtonHref: "#docs",
  },
  support: {
    qqGroup: "数据同步中",
    contactText: "联系客服",
    contactHref: "#profile",
  },
  rechargeServices: [
    { id: "balance", name: "账户余额充值", description: "用于 API 调用扣费。", enabled: true, sort: 1 },
    { id: "activation", name: "激活码兑换", description: "用于运营赠额和活动权益。", enabled: true, sort: 2 },
  ],
  helpGuides: [
    { id: "base-url", title: "Base URL 配置", href: "#docs", enabled: true, sort: 1 },
    { id: "api-key", title: "API Key 创建", href: "#api", enabled: true, sort: 2 },
    { id: "model-id", title: "Model ID 复制", href: "#models", enabled: true, sort: 3 },
  ],
  notices: [],
  moduleSwitches: {
    modelAccess: true,
    modelRanks: true,
    recharge: true,
    admin: true,
  },
};

const defaultStore = {
  models: defaultModels,
  categories: defaultCategories,
  siteConfig: defaultSiteConfig,
  updatedAt: new Date().toISOString(),
};

const contentStorePath = process.env.FLOWAPI_CONTENT_STORE_PATH
  || path.join(process.cwd(), "data", "content-store.json");

function readPersistedStore() {
  try {
    if (!fs.existsSync(contentStorePath)) {
      return null;
    }

    const parsed = JSON.parse(fs.readFileSync(contentStorePath, "utf8"));
    if (!parsed || !Array.isArray(parsed.models) || !Array.isArray(parsed.categories)) {
      return null;
    }

    return {
      ...defaultStore,
      ...parsed,
      siteConfig: {
        ...defaultSiteConfig,
        ...(parsed.siteConfig || {}),
      },
    };
  } catch {
    return null;
  }
}

function persistStore() {
  try {
    fs.mkdirSync(path.dirname(contentStorePath), { recursive: true });
    fs.writeFileSync(
      contentStorePath,
      `${JSON.stringify({
        models: store.models,
        categories: store.categories,
        siteConfig: store.siteConfig,
        updatedAt: store.updatedAt,
      }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // Persistence is best effort for local/demo environments. The API still works in memory.
  }
}

const store = globalThis.__FLOWAPI_CONTENT_STORE__ || readPersistedStore() || defaultStore;

globalThis.__FLOWAPI_CONTENT_STORE__ = store;

function touch() {
  store.updatedAt = new Date().toISOString();
  persistStore();
}

function publicModel(model) {
  return { ...model };
}

function sortBySort(items) {
  return [...items].sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
}

export function getPublicModels({ includeUnlisted = false } = {}) {
  return sortBySort(store.models)
    .filter((model) => includeUnlisted || model.listed !== false)
    .map(publicModel);
}

export function getPublicModelCategories() {
  return sortBySort(store.categories)
    .filter((category) => category.enabled !== false)
    .map((category) => ({ ...category }));
}

export function getPublicSiteConfig() {
  return {
    ...store.siteConfig,
    updatedAt: store.updatedAt,
  };
}

export function getContentSnapshot() {
  return {
    models: getPublicModels({ includeUnlisted: true }),
    categories: sortBySort(store.categories).map((category) => ({ ...category })),
    siteConfig: getPublicSiteConfig(),
    updatedAt: store.updatedAt,
  };
}

export function upsertContentModel(payload = {}) {
  const id = String(payload.id || payload.modelId || "").trim();
  if (!id) {
    return null;
  }

  const index = store.models.findIndex((model) => model.id === id || model.modelId === id);
  const previous = index >= 0 ? store.models[index] : {};
  const next = {
    ...previous,
    ...payload,
    id,
    tags: Array.isArray(payload.tags) ? payload.tags : previous.tags || [],
    categories: Array.isArray(payload.categories) ? payload.categories : previous.categories || ["all"],
    listed: payload.listed !== false,
    recommended: payload.recommended === true,
  };

  if (index >= 0) {
    store.models[index] = next;
  } else {
    store.models.push(next);
  }

  touch();
  return publicModel(next);
}

export function upsertContentCategory(payload = {}) {
  const id = String(payload.id || payload.slug || "").trim();
  if (!id) {
    return null;
  }

  const index = store.categories.findIndex((category) => category.id === id || category.slug === id);
  const previous = index >= 0 ? store.categories[index] : {};
  const next = {
    ...previous,
    ...payload,
    id,
    slug: payload.slug || previous.slug || id,
    label: payload.label || previous.label || id,
    enabled: payload.enabled !== false,
    keywords: Array.isArray(payload.keywords) ? payload.keywords : previous.keywords || [],
  };

  if (index >= 0) {
    store.categories[index] = next;
  } else {
    store.categories.push(next);
  }

  touch();
  return { ...next };
}

export function updateSiteConfig(payload = {}) {
  store.siteConfig = {
    ...store.siteConfig,
    ...payload,
  };
  touch();
  return getPublicSiteConfig();
}

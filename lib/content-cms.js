/**
 * Content CMS — unified admin-editable content store.
 * All user-facing pages read from here. Admin edits via /api/admin/content.
 * Default content is seeded automatically and admin edits are persisted locally.
 */

import fs from "node:fs";
import path from "node:path";
import { dedupePublicModelList, sanitizePublicModelProvider } from "./public-model-provider";
import { getPublicApiBaseUrl } from "./public-api";

const CONTENT_CMS_FILE = path.join(process.cwd(), "data", "content-cms.json");
const PUBLIC_API_BASE_URL = getPublicApiBaseUrl();

function createDefaultStore() {
  return {
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
}

function readPersistedStore() {
  try {
    if (!fs.existsSync(CONTENT_CMS_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(CONTENT_CMS_FILE, "utf8"));
    return { ...createDefaultStore(), ...(parsed || {}) };
  } catch (error) {
    console.warn("[content-cms] failed to read persisted content", error);
    return null;
  }
}

function persistContentCMS() {
  try {
    fs.mkdirSync(path.dirname(CONTENT_CMS_FILE), { recursive: true });
    fs.writeFileSync(CONTENT_CMS_FILE, JSON.stringify(store, null, 2));
  } catch (error) {
    console.warn("[content-cms] failed to persist content", error);
  }
}

const store = globalThis.__FLOWAPI_CONTENT_CMS__ || readPersistedStore() || createDefaultStore();

function normalizeModelCmsKey(item = {}) {
  return [item?.id, item?.modelId, item?.publicModelId]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .join("|");
}

function dedupeModelCmsItems(items = []) {
  const seen = new Set();
  const retired = new Set(["gpt55-pro", "flowapi-gpt55-pro"]);
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    const key = normalizeModelCmsKey(item);
    const modelKey = String(item?.id || item?.modelId || item?.publicModelId || "").trim().toLowerCase();
    if (!key || seen.has(key) || retired.has(modelKey) || isDeepSeekModelItem(item)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function isDeepSeekModelItem(item = {}) {
  const text = [
    item?.id,
    item?.modelId,
    item?.publicModelId,
    item?.displayName,
    item?.provider,
    item?.category,
    ...(Array.isArray(item?.categories) ? item.categories : []),
    ...(Array.isArray(item?.tags) ? item.tags : []),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");
  return text.includes("deepseek");
}

if (Array.isArray(store.models)) {
  store.models = dedupeModelCmsItems(store.models);
}

globalThis.__FLOWAPI_CONTENT_CMS__ = store;

function makeId(p) { return `${p}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`; }
function now() { return new Date().toISOString(); }
function resolveContentType(type) {
  const map = {
    categories: "modelCategories",
    model_categories: "modelCategories",
    modelCategories: "modelCategories",
    home: "homeConfig",
    support: "supportConfig",
  };
  return map[type] || type;
}

function getList(type) {
  const key = resolveContentType(type);
  return Array.isArray(store[key]) ? store[key] : [];
}

function getItemKey(item) {
  return item?.id || item?.moduleKey || item?.key || item?.slug;
}

const LEGACY_MODEL_DISPLAY_NAMES = new Set([
  "GPT-5.4 Pro",
  "GPT-5.3-Codex",
  "GPT-5.4",
  "Codex Plus",
  "Codex Pro",
  "Codex Lite",
  "Claude Sonnet",
  "Claude Opus",
  "Gemini Pro",
  "Gemini Flash",
  "Qwen3 32B",
]);

const MODEL_OFFICIAL_DISPLAY_NAMES = {
  gpt55: "GPT-5.5",
  "flowapi-gpt55": "GPT-5.5",
  "gpt54-pro": "GPT-5.4 Pro",
  "flowapi-gpt54-pro": "GPT-5.4 Pro",
  gpt54: "GPT-5.4 mini",
  "flowapi-gpt54": "GPT-5.4 mini",
  "gpt4o-mini": "GPT-4o mini",
  "flowapi-gpt4o-mini": "GPT-4o mini",
  "codex-plus": "GPT-5.3-Codex Plus",
  "flowapi-codex-plus": "GPT-5.3-Codex Plus",
  "codex-pro": "GPT-5.3-Codex Pro",
  "flowapi-codex-pro": "GPT-5.3-Codex Pro",
  "codex-lite": "GPT-5.3-Codex Lite",
  "flowapi-codex-lite": "GPT-5.3-Codex Lite",
  "claude-sonnet": "Claude Sonnet 4.6",
  "flowapi-claude-sonnet": "Claude Sonnet 4.6",
  "claude-opus": "Claude Opus 4.7",
  "flowapi-claude-opus": "Claude Opus 4.7",
  "gemini-pro": "Gemini 2.5 Pro",
  "flowapi-gemini-pro": "Gemini 2.5 Pro",
  "gemini-flash": "Gemini 2.5 Flash",
  "flowapi-gemini-flash": "Gemini 2.5 Flash",
  qwen32b: "Qwen3-32B",
  "qwen/qwen3-32b": "Qwen3-32B",
};

const MODEL_PUBLIC_INTROS = {
  "gpt55": {
    description: "GPT-5.5 是 OpenAI 面向复杂问答、方案规划和高质量内容生成的旗舰通用模型。它适合处理长链路推理、商业分析、内容策划、复杂文档理解和高质量 ChatGPT 替代场景。",
    detailDescription: "GPT-5.5 是 OpenAI 为专业用户和高质量内容任务设计的通用高阶模型，在推理、指令遵循、上下文理解和复杂问题拆解上更稳。它适合需要一次性处理大量信息、输出结构化方案、撰写高质量内容或承担 Agent 中枢角色的工作流。",
  },
  "gpt54-pro": {
    description: "GPT-5.4 是 OpenAI 面向专业办公、代码审查和结构化推理的高质量模型。它适合在成本和质量之间取得平衡，用于复杂分析、代码质量检查、报告生成和企业内部知识处理。",
    detailDescription: "GPT-5.4 适合需要较强推理能力但不一定使用最高档模型的场景。它可以承担代码审查、技术文档整理、商业分析、结构化写作和流程型 Agent 任务，是从轻量模型升级到专业模型时的稳妥选择。",
  },
  "gpt54": {
    description: "GPT-5.4 mini 是 OpenAI 面向通用 ChatGPT 类体验的轻量模型，适合办公问答、内容总结、结构化输出和日常知识处理。它在响应质量、速度和调用成本之间保持平衡。",
    detailDescription: "GPT-5.4 mini 适合日常高频使用场景：写作、总结、翻译、资料整理、办公问答和结构化输出。它适合新手用户、内容团队和需要长期调用的业务场景。",
  },
  "gpt4o-mini": {
    description: "GPT-4o Mini 是 OpenAI 的轻量高性价比模型，适合日常问答、文本处理、轻量推理和高频批量任务。它响应快、成本低，适合新手先跑通 API 调用和低成本验证业务流程。",
    detailDescription: "GPT-4o Mini 适合把 AI 接入到客服、内容处理、文本清洗、轻量分类和日常助手类产品中。它不是最强推理模型，但在成本、速度和通用能力之间非常均衡，适合高频调用和批量任务。",
  },
  "codex-plus": {
    description: "GPT-5.3-Codex 是 OpenAI 面向开发者和 Agent 编程任务的代码模型，适合代码生成、Bug 修复、项目重构、脚本编写和开发工具集成。它比普通通用模型更适合复杂上下文和项目级任务。",
    detailDescription: "GPT-5.3-Codex 适合 Cursor、Claude Code、Cline、Roo Code 等开发工具中的真实编程工作流。它能理解项目上下文、拆解代码问题、生成修复方案并辅助重构，适合需要更高代码质量和更强任务连续性的开发者。",
  },
  "codex-pro": {
    description: "GPT-5.3-Codex 是 OpenAI 面向复杂工程任务的代码模型，适合大型项目重构、复杂 Debug、架构分析和多步骤 Agent 编程。它更适合专业开发者和企业技术团队。",
    detailDescription: "GPT-5.3-Codex 适合处理更难的工程问题，例如跨文件代码理解、复杂错误定位、架构改造建议、测试补全和项目级自动化。它的定位不是低成本批量调用，而是为高价值开发任务提供更稳定的代码推理能力。",
  },
  "codex-lite": {
    description: "GPT-5.3-Codex 是 OpenAI 面向编程场景的代码模型，适合日常代码问答、脚本生成、简单修复和新手开发者学习。它适合先跑通开发工具接入和高频代码任务。",
    detailDescription: "GPT-5.3-Codex 适合处理代码任务：解释报错、生成小脚本、补全函数、写简单测试、整理代码片段和回答基础编程问题。它适合新手和价格敏感用户，也适合作为批量代码辅助任务的入口。",
  },
  "claude-sonnet": {
    description: "Claude Sonnet 4.6 是 Anthropic 面向长文本理解、代码分析和高质量写作的专业模型，适合文档阅读、复杂任务拆解、代码解释和稳定的长内容输出。",
    detailDescription: "Claude Sonnet 4.6 适合需要长上下文理解和温和稳定表达的任务，例如合同和资料阅读、长文总结、代码库分析、产品方案撰写和复杂任务拆解。它很适合 Claude Code 用户和需要高质量文字表达的内容团队。",
  },
  "claude-opus": {
    description: "Claude Opus 4.7 是 Anthropic 面向高难度推理、深度分析和专业写作的高阶模型，适合重要方案、复杂文档、严肃研究和高价值企业任务。",
    detailDescription: "Claude Opus 4.7 适合把质量放在成本前面的场景：深度研究、复杂材料分析、专业报告、高质量长文、重要代码审查和多步骤推理任务。它更适合高价值用户和企业测试，而不是低成本批量调用。",
  },
  "gemini-pro": {
    description: "Gemini 2.5 Pro 是 Google 面向多模态理解、复杂内容处理和长上下文分析的专业模型，适合文本、图像和复杂资料混合处理的任务。",
    detailDescription: "Gemini 2.5 Pro 适合多模态和复杂上下文场景，例如图文理解、长资料分析、内容审核、复杂问答和跨格式信息整理。它适合需要 Google 模型能力的开发者、内容团队和企业测试用户。",
  },
  "gemini-flash": {
    description: "Gemini 2.5 Flash 是 Google 面向快速响应和高频轻量任务的多模态模型，适合内容处理、轻量图文理解、快速问答和成本敏感的批量任务。",
    detailDescription: "Gemini 2.5 Flash 适合需要速度和成本平衡的场景：快速问答、轻量多模态识别、内容处理、批量摘要和高频调用。它不是最强深度推理模型，但很适合做用户体验流畅的 AI 功能入口。",
  },
  qwen32b: {
    description: "Qwen3-32B 是 Alibaba 面向中文办公、商务沟通和高性价比调用的模型，适合外贸邮件、中文资料整理、客户跟进和轻量内容生产。",
    detailDescription: "Qwen3-32B 适合中国大陆用户常见的中文和商务场景：外贸开发信、客户沟通、中文办公、资料整理、内容改写和低成本批量调用。它适合价格敏感用户和需要大量中文文本处理的团队。",
  },
};

function applyModelIntro(model) {
  const intro = MODEL_PUBLIC_INTROS[model.id] || MODEL_PUBLIC_INTROS[model.modelId] || MODEL_PUBLIC_INTROS[model.displayName];
  const displayName = MODEL_OFFICIAL_DISPLAY_NAMES[model.id] || MODEL_OFFICIAL_DISPLAY_NAMES[model.modelId] || MODEL_OFFICIAL_DISPLAY_NAMES[model.displayName];
  if (model?.contentEdited) return model;
  if (!intro && !displayName) return model;
  const shouldMigrateName = displayName && model.displayName !== displayName;
  const shouldUseDefaultPrimaryButton = !model.primaryButtonText || model.primaryButtonText === "复制 Model ID";
  const shouldUseDefaultSecondaryButton = !model.secondaryButtonText || model.secondaryButtonText === "创建 API Key";
  return {
    ...model,
    ...(shouldMigrateName ? { displayName } : {}),
    ...(intro ? {
      description: intro.description,
    } : {}),
    ...(intro ? {
      detailDescription: intro.detailDescription || intro.description,
    } : {}),
    ...(shouldUseDefaultPrimaryButton ? {
      primaryButtonText: "立即接入",
      primaryButtonHref: "/api-management",
    } : {}),
    ...(shouldUseDefaultSecondaryButton ? {
      secondaryButtonText: "复制 Model ID",
      secondaryButtonHref: "",
    } : {}),
  };
}

/* ========== Seed ========== */
export function seedContentCMS() {
  if (store.models.length > 0) return;

  // --- Models ---
  const models = [
    { id: "codex-plus", displayName: "GPT-5.3-Codex Plus", provider: "OpenAI", modelId: "flowapi-codex-plus", logo: "", description: "代码生成、修复和 Agent 编程任务，适合开发工具集成。", inputPricePerM: 14.4, outputPricePerM: 57.6, showPrice: true, categories: ["all", "recommended", "codex", "code-programming"], tags: ["代码", "Agent", "Coding 推荐"], useCases: ["代码生成", "Bug修复", "项目重构", "Agent"], recommendedUserTypes: ["开发者", "Cursor 用户", "Claude Code 用户"], isRecommended: true, isBeginnerFriendly: false, isHighValue: true, isCodeModel: true, isChineseFriendly: false, isLongContext: false, isMultimodal: false, baseUrl: PUBLIC_API_BASE_URL, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: true, sortOrder: 5, showOnHome: true, showInBeginnerGuide: false },
    { id: "codex-pro", displayName: "GPT-5.3-Codex Pro", provider: "OpenAI", modelId: "flowapi-codex-pro", logo: "", description: "更高阶的 Agent 编程和项目级代码任务入口。", inputPricePerM: 21.6, outputPricePerM: 86.4, showPrice: true, categories: ["all", "codex", "code-programming"], tags: ["复杂代码", "Agent", "项目重构"], useCases: ["复杂代码", "项目级重构", "专业调试"], recommendedUserTypes: ["专业开发者", "企业测试用户"], isRecommended: true, isBeginnerFriendly: false, isHighValue: true, isCodeModel: true, isChineseFriendly: false, isLongContext: false, isMultimodal: false, baseUrl: PUBLIC_API_BASE_URL, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 6, showOnHome: false, showInBeginnerGuide: false },
    { id: "codex-lite", displayName: "GPT-5.3-Codex Lite", provider: "OpenAI", modelId: "flowapi-codex-lite", logo: "", description: "轻量编程入口，适合日常代码问答、脚本生成、简单修复。", inputPricePerM: 7.2, outputPricePerM: 28.8, showPrice: true, categories: ["all", "recommended", "codex", "code-programming", "low-cost"], tags: ["轻量代码", "低成本", "新手推荐"], useCases: ["代码问答", "脚本生成", "简单修复"], recommendedUserTypes: ["新手开发者", "价格敏感用户"], isRecommended: true, isBeginnerFriendly: true, isHighValue: true, isCodeModel: true, isChineseFriendly: false, isLongContext: false, isMultimodal: false, baseUrl: PUBLIC_API_BASE_URL, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 7, showOnHome: true, showInBeginnerGuide: true },
    { id: "gpt55", displayName: "GPT-5.5", provider: "OpenAI", modelId: "flowapi-gpt55", logo: "", description: "适合复杂问答、方案规划和高质量内容生成。", inputPricePerM: 16, outputPricePerM: 64, showPrice: true, categories: ["all", "recommended", "gpt"], tags: ["高级", "推理", "长上下文"], useCases: ["复杂问答", "内容生成", "方案规划"], recommendedUserTypes: ["开发者", "内容工作室", "ChatGPT 替代用户"], isRecommended: true, isBeginnerFriendly: false, isHighValue: true, isCodeModel: false, isChineseFriendly: false, isLongContext: true, isMultimodal: false, baseUrl: PUBLIC_API_BASE_URL, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 30, showOnHome: true, showInBeginnerGuide: false },
    { id: "gpt54-pro", displayName: "GPT-5.4 Pro", provider: "OpenAI", modelId: "flowapi-gpt54-pro", logo: "", description: "适合高质量推理、代码审查和专业办公任务。", inputPricePerM: 14.4, outputPricePerM: 57.6, showPrice: true, categories: ["all", "gpt", "code-programming"], tags: ["ChatGPT", "代码审查", "专业办公"], useCases: ["代码审查", "专业办公", "结构化输出"], isRecommended: true, isBeginnerFriendly: false, isHighValue: true, isCodeModel: true, isChineseFriendly: false, isLongContext: true, isMultimodal: false, baseUrl: PUBLIC_API_BASE_URL, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 32, showOnHome: false, showInBeginnerGuide: false },
    { id: "gpt54", displayName: "GPT-5.4 mini", provider: "OpenAI", modelId: "flowapi-gpt54", logo: "", description: "适合通用 ChatGPT 类体验、办公问答和结构化任务。", inputPricePerM: 12, outputPricePerM: 48, showPrice: true, categories: ["all", "gpt"], tags: ["ChatGPT", "通用问答", "办公"], useCases: ["通用问答", "办公总结", "结构化输出"], isRecommended: false, isBeginnerFriendly: true, isHighValue: true, isCodeModel: false, isChineseFriendly: false, isLongContext: false, isMultimodal: false, baseUrl: PUBLIC_API_BASE_URL, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 34, showOnHome: false, showInBeginnerGuide: true },
    { id: "gpt4o-mini", displayName: "GPT-4o mini", provider: "OpenAI", modelId: "flowapi-gpt4o-mini", logo: "", description: "高性价比 ChatGPT 类体验，适合轻量推理与日常问答。", inputPricePerM: 0.18, outputPricePerM: 0.72, showPrice: true, categories: ["all", "recommended", "gpt", "low-cost"], tags: ["低成本", "ChatGPT", "新手推荐"], useCases: ["轻量推理", "日常问答", "文本处理"], recommendedUserTypes: ["新手用户", "价格敏感用户"], isRecommended: true, isBeginnerFriendly: true, isHighValue: true, isCodeModel: false, isChineseFriendly: false, isLongContext: false, isMultimodal: false, baseUrl: PUBLIC_API_BASE_URL, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 36, showOnHome: true, showInBeginnerGuide: true },
    { id: "claude-sonnet", displayName: "Claude Sonnet 4.6", provider: "Anthropic", modelId: "flowapi-claude-sonnet", logo: "", description: "长文本理解、代码分析和高质量写作。", inputPricePerM: 2.4, outputPricePerM: 9.6, showPrice: true, categories: ["all", "recommended", "claude", "long-text", "code-programming"], tags: ["长文本", "推理", "写作"], useCases: ["长文本理解", "代码分析", "写作"], recommendedUserTypes: ["Claude Code 用户", "开发者", "内容团队"], isRecommended: true, isBeginnerFriendly: false, isHighValue: true, isCodeModel: true, isChineseFriendly: false, isLongContext: true, isMultimodal: false, baseUrl: PUBLIC_API_BASE_URL, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 50, showOnHome: true, showInBeginnerGuide: false },
    { id: "claude-opus", displayName: "Claude Opus 4.7", provider: "Anthropic", modelId: "flowapi-claude-opus", logo: "", description: "适合深度分析、专业写作和高难度任务。", inputPricePerM: 6, outputPricePerM: 24, showPrice: true, categories: ["all", "claude", "long-text"], tags: ["高质量", "深度分析", "专业写作"], useCases: ["深度分析", "专业写作", "高难度任务"], recommendedUserTypes: ["企业测试用户", "高价值用户"], isRecommended: false, isBeginnerFriendly: false, isHighValue: true, isCodeModel: true, isChineseFriendly: false, isLongContext: true, isMultimodal: false, baseUrl: PUBLIC_API_BASE_URL, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 52, showOnHome: false, showInBeginnerGuide: false },
    { id: "gemini-pro", displayName: "Gemini 2.5 Pro", provider: "Google", modelId: "flowapi-gemini-pro", logo: "", description: "适合多模态理解、复杂内容处理和长上下文分析。", inputPricePerM: 6, outputPricePerM: 24, showPrice: true, categories: ["all", "gemini", "long-text", "multimodal"], tags: ["多模态", "长文本", "Google"], useCases: ["多模态理解", "复杂内容处理", "长上下文分析"], recommendedUserTypes: ["开发者", "内容团队"], isRecommended: false, isBeginnerFriendly: false, isHighValue: true, isCodeModel: false, isChineseFriendly: false, isLongContext: true, isMultimodal: true, baseUrl: PUBLIC_API_BASE_URL, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 60, showOnHome: false, showInBeginnerGuide: false },
    { id: "gemini-flash", displayName: "Gemini 2.5 Flash", provider: "Google", modelId: "flowapi-gemini-flash", logo: "", description: "适合快速响应、内容处理、轻量多模态和高频通用任务。", inputPricePerM: 3, outputPricePerM: 12, showPrice: true, categories: ["all", "recommended", "gemini", "low-cost", "multimodal"], tags: ["快速", "多模态", "高性价比"], useCases: ["快速响应", "内容处理", "轻量多模态"], recommendedUserTypes: ["新手用户", "价格敏感用户"], isRecommended: true, isBeginnerFriendly: true, isHighValue: true, isCodeModel: false, isChineseFriendly: false, isLongContext: false, isMultimodal: true, baseUrl: PUBLIC_API_BASE_URL, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 62, showOnHome: true, showInBeginnerGuide: true },
    { id: "qwen32b", displayName: "Qwen3-32B", provider: "Alibaba", modelId: "qwen/qwen3-32b", logo: "", description: "外贸邮件、中文办公、商务沟通。", inputPricePerM: 2.16, outputPricePerM: 6.48, showPrice: true, categories: ["all", "qwen", "chinese-writing", "low-cost"], tags: ["中文", "商务", "高性价比"], useCases: ["外贸邮件", "中文办公", "商务沟通"], isRecommended: false, isBeginnerFriendly: true, isHighValue: false, isCodeModel: false, isChineseFriendly: true, isLongContext: false, isMultimodal: false, baseUrl: PUBLIC_API_BASE_URL, primaryButtonText: "复制 Model ID", primaryButtonHref: "", secondaryButtonText: "创建 API Key", secondaryButtonHref: "/guide", enabled: true, pinned: false, sortOrder: 40, showOnHome: false, showInBeginnerGuide: false },
  ];

  store.models = models.map((m) => ({ ...applyModelIntro(m), createdAt: now(), updatedAt: now() }));

  // --- Categories ---
  const cats = [
    { id: "all", name: "全部", slug: "all", sortOrder: 1 },
    { id: "recommended", name: "推荐", slug: "recommended", sortOrder: 2 },
    { id: "gpt", name: "GPT", slug: "gpt", sortOrder: 3 },
    { id: "codex", name: "Codex", slug: "codex", sortOrder: 4 },
    { id: "claude", name: "Claude", slug: "claude", sortOrder: 5 },
    { id: "gemini", name: "Gemini", slug: "gemini", sortOrder: 6 },
    { id: "qwen", name: "Qwen", slug: "qwen", sortOrder: 7 },
    { id: "low-cost", name: "低成本", slug: "low-cost", sortOrder: 8 },
    { id: "code-programming", name: "代码编程", slug: "code-programming", sortOrder: 9 },
    { id: "chinese-writing", name: "中文写作", slug: "chinese-writing", sortOrder: 10 },
    { id: "long-text", name: "长文本", slug: "long-text", sortOrder: 11 },
    { id: "multimodal", name: "多模态", slug: "multimodal", sortOrder: 12 },
  ];
  store.modelCategories = cats.map((c) => ({ ...c, description: "", enabled: true, createdAt: now(), updatedAt: now() }));

  // --- Home Config ---
  store.homeConfig = {
    heroBadge: "FlowAPI", heroTitle: "AI API Token 企业级多模型统一调用平台", heroSubtitle: "注册即送 $20 API 体验额度，三步接入，马上使用全球 AI 模型。",
    primaryButtonText: "立即开始", primaryButtonHref: "/register",
    secondaryButtonText: "已有账号", secondaryButtonHref: "/login",
    benefits: [
      { title: "统一接入全球模型", description: "Claude、GPT、Gemini、Qwen 等模型统一接口自动调用。", icon: "🌐", enabled: true, sortOrder: 1 },
      { title: "注册即送 $20 API 体验额度", description: "新用户注册即可获得 $20 API 体验额度，先用起来再决定是否充值。", icon: "🎁", enabled: true, sortOrder: 2 },
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
    { id: "btn_copy_baseurl", page: "guide", key: "copy-baseurl", label: "复制 Base URL", href: "", actionType: "copy", value: PUBLIC_API_BASE_URL, enabled: true, style: "secondary", sortOrder: 2, updatedAt: now() },
    { id: "btn_ccswitch", page: "guide", key: "cc-switch", label: "启动 CC-Switch", href: "", actionType: "custom", enabled: true, style: "primary", sortOrder: 3, updatedAt: now() },
    { id: "btn_recharge", page: "recharge", key: "recharge-now", label: "立即充值", href: "/recharge", actionType: "link", enabled: true, style: "primary", sortOrder: 1, updatedAt: now() },
    { id: "btn_join_qq", page: "home", key: "join-qq", label: "加入 QQ 群", href: "", actionType: "copy", value: "217637139", enabled: true, style: "secondary", sortOrder: 2, updatedAt: now() },
  ];

  // --- Addon Services ---
  store.addonServices = [
    { id: "phone_verify", title: "Codex / ChatGPT 手机号验证", priceCny: 20, unit: "次", description: "提供海外手机号验证支持，一次购买永久绑定。", tags: ["手机号验证", "一次购买", "永久绑定"], type: "fixed", enabled: true, sortOrder: 1, createdAt: now(), updatedAt: now() },
    { id: "plus_monthly", title: "官方 ChatGPT Plus 激活", priceCny: 140, unit: "月", description: "提供 ChatGPT Plus 官方订阅激活协助。", tags: ["月套餐", "官方激活", "长期使用"], type: "fixed", enabled: true, sortOrder: 3, createdAt: now(), updatedAt: now() },
    { id: "openrouter_credits", title: "全球模型额度代充", priceCny: 9, unit: "credits", description: "最低 5 份起充。", tags: ["最低 5 个", "适合开发者", "额度代充"], type: "quantity", minQuantity: 5, enabled: true, sortOrder: 4, createdAt: now(), updatedAt: now() },
  ];

  // --- Support Config ---
  store.supportConfig = {
    qqGroupEnabled: true, qqGroupNumber: "217637139", qqGroupQrImage: "/images/qrcode/flowapi-qq-group.png",
    title: "AI 玩家交流群", description: "加入 FlowAPI 玩家交流群，获取新手接入帮助、模型使用技巧和最新额度福利。",
    tags: ["新人教程", "福利同步", "下载协助"],
    customerServiceEnabled: true, customerServiceText: "联系客服", customerServiceHref: "",
    updatedAt: now(),
  };

  // --- Page Settings ---
  store.pageSettings = [
    { page: "models", moduleKey: "show-recommend", moduleName: "显示 FlowAPI Top 5", enabled: true, updatedAt: now() },
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
  const key = resolveContentType(type);
  const map = {
    models: () => dedupePublicModelList(
      store.models
        .filter((m) => m.enabled && !isDeepSeekModelItem(m))
        .map(applyModelIntro)
        .map(sanitizePublicModelProvider)
    ).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.sortOrder - b.sortOrder),
    modelCategories: () => store.modelCategories.filter((c) => c.enabled && String(c.id || c.slug || "").toLowerCase() !== "deepseek").sort((a, b) => a.sortOrder - b.sortOrder),
    homeConfig: () => store.homeConfig,
    actions: () => store.actionButtons.filter((a) => a.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    addonServices: () => store.addonServices.filter((s) => s.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    guides: () => store.guides.filter((g) => g.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    banners: () => store.banners.filter((b) => b.enabled),
    supportConfig: () => store.supportConfig,
    announcements: () => store.announcements.filter((a) => a.status === "已发布" || a.status === "进行中").sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)),
    pageSettings: () => store.pageSettings,
  };
  return (map[key] || (() => []))();
}

/* ========== Admin getters (all items including disabled) ========== */
export function adminGetContent(type) {
  const key = resolveContentType(type);
  const map = {
    models: () => store.models.filter((m) => !isDeepSeekModelItem(m)).sort((a, b) => a.sortOrder - b.sortOrder),
    modelCategories: () => store.modelCategories.filter((c) => String(c.id || c.slug || "").toLowerCase() !== "deepseek").sort((a, b) => a.sortOrder - b.sortOrder),
    homeConfig: () => store.homeConfig,
    actions: () => store.actionButtons.sort((a, b) => a.sortOrder - b.sortOrder),
    addonServices: () => store.addonServices.sort((a, b) => a.sortOrder - b.sortOrder),
    guides: () => store.guides.sort((a, b) => a.sortOrder - b.sortOrder),
    banners: () => store.banners,
    supportConfig: () => store.supportConfig,
    announcements: () => store.announcements,
    pageSettings: () => store.pageSettings,
  };
  return (map[key] || (() => []))();
}

/* ========== Admin setters ========== */
export function adminUpdateContent(type, id, data) {
  const key = resolveContentType(type);
  const list = getList(type);
  const index = list.findIndex((item) => getItemKey(item) === id);
  if (index >= 0) {
    list[index] = { ...list[index], ...data, ...(key === "models" ? { contentEdited: true } : {}), updatedAt: now() };
    persistContentCMS();
    return list[index];
  }
  return null;
}

export function adminCreateContent(type, data) {
  const key = resolveContentType(type);
  const id = data?.id || data?.slug || makeId(key.replace(/^content_/, ""));
  const item = { ...data, id, slug: data?.slug || data?.id || id, ...(key === "models" ? { contentEdited: true } : {}), createdAt: now(), updatedAt: now() };
  if (!Array.isArray(store[key])) store[key] = [];
  store[key].push(item);
  persistContentCMS();
  return item;
}

export function adminDeleteContent(type, id) {
  const key = resolveContentType(type);
  store[key] = getList(type).filter((item) => getItemKey(item) !== id);
  persistContentCMS();
  return { success: true };
}

export function adminToggleContent(type, id, field = "enabled") {
  const list = getList(type);
  const item = list.find((i) => getItemKey(i) === id);
  if (item) { item[field] = !item[field]; item.updatedAt = now(); persistContentCMS(); return item; }
  return null;
}

export function adminSaveConfig(type, data) {
  const key = resolveContentType(type);
  store[key] = { ...(store[key] || {}), ...data, updatedAt: now() };
  persistContentCMS();
  return store[key];
}

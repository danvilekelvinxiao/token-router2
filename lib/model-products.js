const CODEX_PLUS_ACTUAL_MODEL =
  process.env.FLOWAPI_UNIAPI_CODEX_PLUS_ACTUAL_MODEL ||
  process.env.FLOWAPI_CODEX_PLUS_ACTUAL_MODEL ||
  process.env.NEXT_PUBLIC_CODEX_PLUS_ACTUAL_MODEL ||
  "gpt-5.3-codex";

const CODEX_PLUS_AVAILABLE =
  process.env.NEXT_PUBLIC_CODEX_PLUS_AVAILABLE === "true" ||
  process.env.FLOWAPI_CODEX_PLUS_AVAILABLE === "true" ||
  process.env.FLOWAPI_UNIAPI_CODEX_PLUS_AVAILABLE === "true";

const CODEX_PRO_ACTUAL_MODEL =
  process.env.FLOWAPI_UNIAPI_CODEX_PRO_ACTUAL_MODEL ||
  process.env.NEXT_PUBLIC_UNIAPI_CODEX_PRO_ACTUAL_MODEL ||
  "gpt-5.3-codex";

const CODEX_PRO_AVAILABLE =
  process.env.FLOWAPI_UNIAPI_CODEX_PRO_AVAILABLE === "true" ||
  process.env.NEXT_PUBLIC_UNIAPI_CODEX_PRO_AVAILABLE === "true";

const CODEX_LITE_ACTUAL_MODEL =
  process.env.FLOWAPI_CODEX_LITE_ACTUAL_MODEL ||
  process.env.FLOWAPI_UNIAPI_CODEX_LITE_ACTUAL_MODEL ||
  process.env.NEXT_PUBLIC_CODEX_LITE_ACTUAL_MODEL ||
  "gpt-5.3-codex";

const CODEX_LITE_AVAILABLE =
  process.env.FLOWAPI_UNIAPI_CODEX_LITE_AVAILABLE === "true" ||
  process.env.NEXT_PUBLIC_CODEX_LITE_AVAILABLE === "true";

const CLAUDE_SONNET_AVAILABLE =
  process.env.FLOWAPI_CLAUDE_SONNET_AVAILABLE === "true" ||
  process.env.NEXT_PUBLIC_CLAUDE_SONNET_AVAILABLE === "true";

const CLAUDE_OPUS_AVAILABLE =
  process.env.FLOWAPI_CLAUDE_OPUS_AVAILABLE === "true" ||
  process.env.NEXT_PUBLIC_CLAUDE_OPUS_AVAILABLE === "true";

const GPT55_AVAILABLE =
  process.env.FLOWAPI_UNIAPI_GPT55_AVAILABLE === "true" ||
  process.env.NEXT_PUBLIC_UNIAPI_GPT55_AVAILABLE === "true";

const GPT54_PRO_AVAILABLE =
  process.env.FLOWAPI_UNIAPI_GPT54_PRO_AVAILABLE === "true" ||
  process.env.NEXT_PUBLIC_UNIAPI_GPT54_PRO_AVAILABLE === "true";

const GPT54_AVAILABLE =
  process.env.FLOWAPI_UNIAPI_GPT54_AVAILABLE === "true" ||
  process.env.NEXT_PUBLIC_UNIAPI_GPT54_AVAILABLE === "true";

const DEEPSEEK_CHAT_ACTUAL_MODEL =
  process.env.FLOWAPI_DEEPSEEK_CHAT_ACTUAL_MODEL ||
  process.env.NEXT_PUBLIC_DEEPSEEK_CHAT_ACTUAL_MODEL ||
  "deepseek-chat";

const DEEPSEEK_REASONER_ACTUAL_MODEL =
  process.env.FLOWAPI_DEEPSEEK_REASONER_ACTUAL_MODEL ||
  process.env.NEXT_PUBLIC_DEEPSEEK_REASONER_ACTUAL_MODEL ||
  "deepseek-reasoner";

export const MODEL_PRODUCTS = [
  {
    id: "deepseek-chat",
    displayName: "DeepSeek Chat",
    publicModelId: "deepseek-chat",
    actualModelId: DEEPSEEK_CHAT_ACTUAL_MODEL,
    group: "deepseek-basic",
    executionGroup: process.env.NEW_API_DEEPSEEK_EXECUTION_GROUP || process.env.NEW_API_EXECUTION_GROUP || process.env.NEW_API_DEFAULT_GROUP || "default",
    planId: "deepseek-basic",
    description: "日常聊天、写作、总结、轻量代码，适合新手第一条 API 调用。",
    useCases: ["日常聊天", "中文写作", "总结", "轻量代码"],
    recommendedTools: ["CC-Switch", "Chatbox", "Cherry Studio"],
    priceMultiplier: 1.2,
    isAvailable: true,
    isComingSoon: false,
    sortOrder: 10,
    provider: "DeepSeek",
    underlyingRoute: "",
  },
  {
    id: "deepseek-reasoner",
    displayName: "DeepSeek Reasoner",
    publicModelId: "deepseek-reasoner",
    actualModelId: DEEPSEEK_REASONER_ACTUAL_MODEL,
    group: "deepseek-basic",
    executionGroup: process.env.NEW_API_DEEPSEEK_EXECUTION_GROUP || process.env.NEW_API_EXECUTION_GROUP || process.env.NEW_API_DEFAULT_GROUP || "default",
    planId: "deepseek-basic",
    description: "复杂推理、数学、代码逻辑和商业分析，适合需要深度思考的任务。",
    useCases: ["复杂推理", "代码逻辑", "数学", "商业分析"],
    recommendedTools: ["CC-Switch", "Cursor", "Claude Code"],
    priceMultiplier: 1.5,
    isAvailable: true,
    isComingSoon: false,
    sortOrder: 20,
    provider: "DeepSeek",
    underlyingRoute: "",
  },
  {
    id: "codex-plus",
    displayName: "Codex Plus",
    publicModelId: "flowapi-codex-plus",
    actualModelId: CODEX_PLUS_ACTUAL_MODEL,
    group: "codex-plus",
    executionGroup: process.env.NEW_API_CODEX_EXECUTION_GROUP || "codex-plus",
    planId: "codex-plus",
    description: "适合代码生成、代码修复、Agent 编程任务、项目级重构和复杂开发工作流。",
    useCases: ["代码生成", "代码修复", "Agent 编程", "项目级重构"],
    recommendedTools: ["CC-Switch", "Codex", "Cursor", "Claude Code", "Cline", "Roo Code"],
    priceMultiplier: 2,
    isAvailable: CODEX_PLUS_AVAILABLE,
    isComingSoon: !CODEX_PLUS_AVAILABLE,
    sortOrder: 30,
    provider: "UniAPI",
    underlyingRoute: CODEX_PLUS_AVAILABLE ? CODEX_PLUS_ACTUAL_MODEL : "上游未开通",
  },
  {
    id: "codex-pro",
    displayName: "Codex Pro",
    publicModelId: "flowapi-codex-pro",
    actualModelId: CODEX_PRO_ACTUAL_MODEL,
    group: "codex-plus",
    executionGroup: process.env.NEW_API_CODEX_EXECUTION_GROUP || "codex-plus",
    planId: "codex-plus",
    description: "更高阶的 Agent 编程和项目级代码任务入口，底层由 UniAPI 上游模型提供。",
    useCases: ["复杂代码", "Agent 编程", "项目级重构", "专业调试"],
    recommendedTools: ["CC-Switch", "Codex", "Cursor", "Claude Code", "Cline", "Roo Code"],
    priceMultiplier: 2.8,
    isAvailable: CODEX_PRO_AVAILABLE,
    isComingSoon: !CODEX_PRO_AVAILABLE,
    sortOrder: 35,
    provider: "UniAPI",
    underlyingRoute: CODEX_PRO_AVAILABLE ? CODEX_PRO_ACTUAL_MODEL : "上游未开通",
  },
  {
    id: "codex-lite",
    displayName: "Codex Lite",
    publicModelId: "flowapi-codex-lite",
    actualModelId: CODEX_LITE_ACTUAL_MODEL,
    group: "codex-plus",
    executionGroup: process.env.NEW_API_CODEX_EXECUTION_GROUP || "codex-plus",
    planId: "codex-plus",
    description: "轻量编程入口，适合日常代码问答、脚本生成、简单修复。底层供应商为 UniAPI。",
    useCases: ["代码问答", "脚本生成", "简单修复"],
    recommendedTools: ["CC-Switch", "Chatbox", "Cursor"],
    priceMultiplier: 1.5,
    isAvailable: CODEX_LITE_AVAILABLE,
    isComingSoon: !CODEX_LITE_AVAILABLE,
    sortOrder: 25,
    provider: "UniAPI",
    underlyingRoute: CODEX_LITE_AVAILABLE ? CODEX_LITE_ACTUAL_MODEL : "上游未开通",
  },
  {
    id: "flowapi-claude-sonnet",
    displayName: "Claude Sonnet",
    publicModelId: "flowapi-claude-sonnet",
    actualModelId: process.env.FLOWAPI_CLAUDE_SONNET_ACTUAL_MODEL || process.env.FLOWAPI_UNIAPI_CLAUDE_SONNET_ACTUAL_MODEL || "",
    group: "claude-premium",
    executionGroup: process.env.NEW_API_CLAUDE_EXECUTION_GROUP || process.env.NEW_API_OPENAI_EXECUTION_GROUP || "claude-premium",
    planId: "claude-premium",
    description: "适合长文本理解、代码分析、复杂任务拆解和高质量写作，底层供应商为 UniAPI。",
    useCases: ["长文本理解", "代码分析", "任务拆解", "高质量写作"],
    recommendedTools: ["CC-Switch", "Cursor", "Claude Code", "Chatbox"],
    priceMultiplier: 3.0,
    isAvailable: CLAUDE_SONNET_AVAILABLE,
    isComingSoon: !CLAUDE_SONNET_AVAILABLE,
    sortOrder: 55,
    provider: "UniAPI",
    underlyingRoute: CLAUDE_SONNET_AVAILABLE ? (process.env.FLOWAPI_CLAUDE_SONNET_ACTUAL_MODEL || "claude-sonnet") : "上游未开通",
  },
  {
    id: "flowapi-claude-opus",
    displayName: "Claude Opus",
    publicModelId: "flowapi-claude-opus",
    actualModelId: process.env.FLOWAPI_CLAUDE_OPUS_ACTUAL_MODEL || process.env.FLOWAPI_UNIAPI_CLAUDE_OPUS_ACTUAL_MODEL || "",
    group: "claude-premium",
    executionGroup: process.env.NEW_API_CLAUDE_EXECUTION_GROUP || process.env.NEW_API_OPENAI_EXECUTION_GROUP || "claude-premium",
    planId: "claude-premium",
    description: "适合最强推理、深度分析、专业写作和高难度任务，底层供应商为 UniAPI。",
    useCases: ["最强推理", "深度分析", "专业写作", "高难度任务"],
    recommendedTools: ["CC-Switch", "Cursor", "Claude Code"],
    priceMultiplier: 4.0,
    isAvailable: CLAUDE_OPUS_AVAILABLE,
    isComingSoon: !CLAUDE_OPUS_AVAILABLE,
    sortOrder: 60,
    provider: "UniAPI",
    underlyingRoute: CLAUDE_OPUS_AVAILABLE ? (process.env.FLOWAPI_CLAUDE_OPUS_ACTUAL_MODEL || "claude-opus") : "上游未开通",
  },
  {
    id: "flowapi-gpt55",
    displayName: "GPT-5.5",
    publicModelId: "flowapi-gpt55",
    actualModelId: "gpt-5.5",
    group: "gpt-premium",
    executionGroup: process.env.NEW_API_GPT_PREMIUM_EXECUTION_GROUP || process.env.NEW_API_OPENAI_EXECUTION_GROUP || "gpt-premium",
    planId: "gpt-premium",
    description: "适合复杂推理、专业代码和长上下文 Agent，底层供应商为 UniAPI。",
    useCases: ["复杂推理", "专业代码", "长上下文 Agent"],
    recommendedTools: ["CC-Switch", "Codex", "Cursor", "Claude Code"],
    priceMultiplier: 2.8,
    isAvailable: GPT55_AVAILABLE,
    isComingSoon: !GPT55_AVAILABLE,
    sortOrder: 40,
    provider: "UniAPI",
    underlyingRoute: GPT55_AVAILABLE ? "gpt-5.5" : "上游未开通",
  },
  {
    id: "flowapi-gpt54-pro",
    displayName: "GPT-5.4 Pro",
    publicModelId: "flowapi-gpt54-pro",
    actualModelId: "gpt-5.4-pro",
    group: "gpt-premium",
    executionGroup: process.env.NEW_API_GPT_PREMIUM_EXECUTION_GROUP || process.env.NEW_API_OPENAI_EXECUTION_GROUP || "gpt-premium",
    planId: "gpt-premium",
    description: "适合高质量推理、代码审查和专业办公任务，底层供应商为 UniAPI。",
    useCases: ["高质量推理", "代码审查", "专业办公"],
    recommendedTools: ["CC-Switch", "Cursor", "Chatbox"],
    priceMultiplier: 2.5,
    isAvailable: GPT54_PRO_AVAILABLE,
    isComingSoon: !GPT54_PRO_AVAILABLE,
    sortOrder: 45,
    provider: "UniAPI",
    underlyingRoute: GPT54_PRO_AVAILABLE ? "gpt-5.4-pro" : "上游未开通",
  },
  {
    id: "flowapi-gpt54",
    displayName: "GPT-5.4",
    publicModelId: "flowapi-gpt54",
    actualModelId: "gpt-5.4",
    group: "gpt-premium",
    executionGroup: process.env.NEW_API_GPT_PREMIUM_EXECUTION_GROUP || process.env.NEW_API_OPENAI_EXECUTION_GROUP || "gpt-premium",
    planId: "gpt-premium",
    description: "适合通用 ChatGPT 类体验、办公问答和结构化任务，底层供应商为 UniAPI。",
    useCases: ["通用问答", "办公总结", "结构化输出"],
    recommendedTools: ["CC-Switch", "Chatbox", "Cherry Studio"],
    priceMultiplier: 2.2,
    isAvailable: GPT54_AVAILABLE,
    isComingSoon: !GPT54_AVAILABLE,
    sortOrder: 50,
    provider: "UniAPI",
    underlyingRoute: GPT54_AVAILABLE ? "gpt-5.4" : "上游未开通",
  },
  {
    id: "chatgpt-5",
    displayName: "ChatGPT-5",
    publicModelId: "gpt-5",
    actualModelId: "gpt-5",
    group: "gpt-premium",
    executionGroup: process.env.NEW_API_OPENAI_EXECUTION_GROUP || "gpt-premium",
    planId: "gpt-premium",
    description: "高级 ChatGPT 系列模型入口，待真实上游接通后开放。",
    useCases: ["专业写作", "复杂推理", "Agent 任务"],
    recommendedTools: ["CC-Switch", "Chatbox", "Cursor"],
    priceMultiplier: 2.2,
    isAvailable: false,
    isComingSoon: true,
    sortOrder: 80,
    provider: "OpenAI",
    underlyingRoute: "",
  },
  {
    id: "gpt-5.5",
    displayName: "GPT-5.5",
    publicModelId: "gpt-5.5",
    actualModelId: "gpt-5.5",
    group: "gpt-premium",
    executionGroup: process.env.NEW_API_OPENAI_EXECUTION_GROUP || "gpt-premium",
    planId: "gpt-premium",
    description: "高级推理与专业代码模型，待真实上游接通后开放。",
    useCases: ["复杂推理", "专业代码", "长上下文 Agent"],
    recommendedTools: ["CC-Switch", "Cursor", "Claude Code"],
    priceMultiplier: 2.5,
    isAvailable: false,
    isComingSoon: true,
    sortOrder: 90,
    provider: "OpenAI",
    underlyingRoute: "",
  },
];

export function normalizeModelProduct(product) {
  if (!product) return null;
  const allowedModels = [product.publicModelId, product.actualModelId].filter(Boolean);
  const upstreamModels = [product.actualModelId || product.publicModelId].filter(Boolean);
  return {
    ...product,
    allowedModels: [...new Set(allowedModels)],
    upstreamModels: [...new Set(upstreamModels)],
  };
}

export function getModelProduct(idOrModel) {
  const key = String(idOrModel || "").trim().toLowerCase();
  if (!key) return null;
  const product = MODEL_PRODUCTS.find((item) => {
    return [item.id, item.publicModelId, item.displayName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase() === key);
  }) || MODEL_PRODUCTS.find((item) => String(item.actualModelId || "").toLowerCase() === key);
  return normalizeModelProduct(product);
}

export function listModelProducts({ includeUnavailable = true } = {}) {
  return MODEL_PRODUCTS
    .filter((item) => includeUnavailable || item.isAvailable)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map(normalizeModelProduct);
}

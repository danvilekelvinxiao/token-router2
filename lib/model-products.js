export const MODEL_PRODUCTS = [
  {
    id: "deepseek-chat",
    displayName: "DeepSeek Chat",
    publicModelId: "deepseek-chat",
    actualModelId: "deepseek-chat",
    group: "deepseek-basic",
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
    actualModelId: "deepseek-reasoner",
    group: "deepseek-basic",
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
    publicModelId: "flowapi-code-lite",
    actualModelId: "deepseek-chat",
    group: "codex-plus",
    planId: "codex-plus",
    description: "适合 Codex、Cursor、Claude Code 类工具的轻量编程额度。",
    useCases: ["轻量编程", "脚本改写", "代码解释", "自动化任务"],
    recommendedTools: ["CC-Switch", "Cursor", "Claude Code"],
    priceMultiplier: 1.5,
    isAvailable: true,
    isComingSoon: false,
    sortOrder: 30,
    provider: "FlowAPI",
    underlyingRoute: "DeepSeek Chat",
  },
  {
    id: "chatgpt-5",
    displayName: "ChatGPT-5",
    publicModelId: "gpt-5",
    actualModelId: "gpt-5",
    group: "gpt-premium",
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
  return {
    ...product,
    allowedModels: [product.actualModelId].filter(Boolean),
  };
}

export function getModelProduct(idOrModel) {
  const key = String(idOrModel || "").trim().toLowerCase();
  if (!key) return null;
  const product = MODEL_PRODUCTS.find((item) => {
    return [item.id, item.publicModelId, item.actualModelId, item.displayName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase() === key);
  });
  return normalizeModelProduct(product);
}

export function listModelProducts({ includeUnavailable = true } = {}) {
  return MODEL_PRODUCTS
    .filter((item) => includeUnavailable || item.isAvailable)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map(normalizeModelProduct);
}

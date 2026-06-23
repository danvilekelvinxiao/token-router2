export const MODEL_CATALOG = [
  {
    name: "GPT-5.3-Codex",
    key: "codex-plus",
    provider: "OpenAI",
    modelId: "flowapi-codex-plus",
    actualModelId: process.env.FLOWAPI_CODEX_PLUS_ACTUAL_MODEL || process.env.FLOWAPI_UNIAPI_CODEX_PLUS_ACTUAL_MODEL || process.env.NEXT_PUBLIC_CODEX_PLUS_ACTUAL_MODEL || "gpt-5.3-codex",
    bestFor: "代码生成、代码修复、Agent 编程任务、项目级重构",
    inputPrice: Number(process.env.FLOWAPI_CODEX_PLUS_INPUT_CNY_PER_M || 12),
    outputPrice: Number(process.env.FLOWAPI_CODEX_PLUS_OUTPUT_CNY_PER_M || 48),
    latency: "中等",
    quality: 98,
    routeKeywords: ["codex", "cursor", "claude code", "cline", "roo", "代码", "编程", "重构", "修复", "agent"],
  },
  {
    name: "GPT-5.3-Codex",
    key: "codex-pro",
    provider: "OpenAI",
    modelId: "flowapi-codex-pro",
    actualModelId: process.env.FLOWAPI_UNIAPI_CODEX_PRO_ACTUAL_MODEL || "gpt-5.3-codex",
    bestFor: "复杂代码、Agent 编程、项目级重构",
    inputPrice: Number(process.env.FLOWAPI_CODEX_PRO_INPUT_CNY_PER_M || 18),
    outputPrice: Number(process.env.FLOWAPI_CODEX_PRO_OUTPUT_CNY_PER_M || 72),
    latency: "中等",
    quality: 99,
    routeKeywords: ["codex pro", "复杂代码", "大型项目", "重构", "debug", "agent"],
  },
  {
    name: "GPT-5.5",
    key: "flowapi-gpt55",
    provider: "OpenAI",
    modelId: "flowapi-gpt55",
    actualModelId: "gpt-5.5",
    bestFor: "复杂推理、专业代码、长上下文 Agent",
    inputPrice: Number(process.env.FLOWAPI_GPT55_INPUT_CNY_PER_M || 16),
    outputPrice: Number(process.env.FLOWAPI_GPT55_OUTPUT_CNY_PER_M || 64),
    latency: "中等",
    quality: 99,
    routeKeywords: ["gpt-5.5", "chatgpt", "复杂推理", "专业代码", "agent"],
  },
  {
    name: "GPT-5.4",
    key: "flowapi-gpt54-pro",
    provider: "OpenAI",
    modelId: "flowapi-gpt54-pro",
    actualModelId: "gpt-5.4-pro",
    bestFor: "高质量推理、代码审查、专业办公",
    inputPrice: Number(process.env.FLOWAPI_GPT54_PRO_INPUT_CNY_PER_M || 12),
    outputPrice: Number(process.env.FLOWAPI_GPT54_PRO_OUTPUT_CNY_PER_M || 48),
    latency: "中等",
    quality: 97,
    routeKeywords: ["gpt-5.4 pro", "代码审查", "专业办公", "推理"],
  },
  {
    name: "GPT-5.4 mini",
    key: "flowapi-gpt54",
    provider: "OpenAI",
    modelId: "flowapi-gpt54",
    actualModelId: "gpt-5.4-mini",
    bestFor: "通用问答、办公总结、结构化输出",
    inputPrice: Number(process.env.FLOWAPI_GPT54_INPUT_CNY_PER_M || 10),
    outputPrice: Number(process.env.FLOWAPI_GPT54_OUTPUT_CNY_PER_M || 40),
    latency: "中等",
    quality: 96,
    routeKeywords: ["gpt-5.4 mini", "gpt-5.4-mini", "chatgpt", "办公", "总结", "结构化"],
  },
  {
    name: "DeepSeek V4 Flash",
    key: "deepseek-chat",
    provider: "DeepSeek",
    modelId: "deepseek-chat",
    actualModelId: process.env.FLOWAPI_DEEPSEEK_CHAT_ACTUAL_MODEL || process.env.NEXT_PUBLIC_DEEPSEEK_CHAT_ACTUAL_MODEL || "deepseek-chat",
    bestFor: "中文对话、通用问答、日常使用",
    inputPrice: 0.14,
    outputPrice: 0.28,
    latency: "快",
    quality: 91,
    routeKeywords: ["中文", "文案", "小红书", "抖音", "客服", "种草", "口播", "标题", "对话"],
  },
  {
    name: "DeepSeek V4 Flash Thinking",
    key: "deepseek-reasoner",
    provider: "DeepSeek",
    modelId: "deepseek-reasoner",
    actualModelId: process.env.FLOWAPI_DEEPSEEK_REASONER_ACTUAL_MODEL || process.env.NEXT_PUBLIC_DEEPSEEK_REASONER_ACTUAL_MODEL || "deepseek-reasoner",
    bestFor: "复杂推理、数学、编程",
    inputPrice: 0.55,
    outputPrice: 2.19,
    latency: "中等",
    quality: 95,
    routeKeywords: ["推理", "数学", "编程", "代码", "算法"],
  },
  {
    name: "DeepSeek V4 Flash",
    key: "deepseek",
    provider: "DeepSeek",
    modelId: "deepseek/deepseek-chat",
    bestFor: "中文内容、批量文案、低成本客服",
    inputPrice: 0.14,
    outputPrice: 0.28,
    latency: "快",
    quality: 91,
    routeKeywords: ["中文", "文案", "小红书", "抖音", "客服", "种草", "口播", "标题"],
  },
  {
    name: "Qwen3-32B",
    key: "qwen",
    provider: "Alibaba",
    modelId: "qwen/qwen3-32b",
    bestFor: "外贸邮件、商务沟通、中文办公",
    inputPrice: 0.3,
    outputPrice: 0.9,
    latency: "很快",
    quality: 88,
    routeKeywords: ["外贸", "邮件", "开发信", "报价", "客户", "商务", "跟进", "email", "follow"],
  },
  {
    name: "GPT-4o mini",
    key: "gpt4o-mini",
    provider: "OpenAI",
    modelId: "flowapi-gpt4o-mini",
    actualModelId: process.env.FLOWAPI_GPT4O_MINI_ACTUAL_MODEL || process.env.FLOWAPI_UNIAPI_GPT4O_MINI_ACTUAL_MODEL || "gpt-4o-mini",
    bestFor: "复杂分析、结构化总结、代码辅助",
    inputPrice: 0.15,
    outputPrice: 0.6,
    latency: "中等",
    quality: 94,
    routeKeywords: ["分析", "方案", "总结", "战略", "代码", "架构", "报告", "复杂"],
  },
  {
    name: "GPT-5.3-Codex",
    key: "flowapi-codex-lite",
    provider: "OpenAI",
    modelId: "flowapi-codex-lite",
    actualModelId: process.env.FLOWAPI_CODEX_LITE_ACTUAL_MODEL || process.env.FLOWAPI_UNIAPI_CODEX_LITE_ACTUAL_MODEL || "gpt-5.3-codex",
    bestFor: "轻量编程入口，适合日常代码问答、脚本生成、简单修复",
    inputPrice: Number(process.env.FLOWAPI_CODEX_LITE_INPUT_CNY_PER_M || 6),
    outputPrice: Number(process.env.FLOWAPI_CODEX_LITE_OUTPUT_CNY_PER_M || 24),
    latency: "中等",
    quality: 94,
    routeKeywords: ["轻量代码", "脚本", "问答", "修复", "编程", "coding"],
  },
  {
    name: "Claude Sonnet 4.6",
    key: "flowapi-claude-sonnet",
    provider: "Anthropic",
    modelId: "flowapi-claude-sonnet",
    actualModelId: process.env.FLOWAPI_CLAUDE_SONNET_ACTUAL_MODEL || process.env.FLOWAPI_UNIAPI_CLAUDE_SONNET_ACTUAL_MODEL || "",
    bestFor: "长文本理解、代码分析、复杂任务拆解和高质量写作",
    inputPrice: Number(process.env.FLOWAPI_CLAUDE_SONNET_INPUT_CNY_PER_M || 2),
    outputPrice: Number(process.env.FLOWAPI_CLAUDE_SONNET_OUTPUT_CNY_PER_M || 8),
    latency: "中等",
    quality: 96,
    routeKeywords: ["claude", "sonnet", "长文", "分析", "写作", "拆解", "复杂"],
    isAvailable: Boolean(process.env.FLOWAPI_CLAUDE_SONNET_ACTUAL_MODEL || process.env.FLOWAPI_UNIAPI_CLAUDE_SONNET_ACTUAL_MODEL),
  },
  {
    name: "Claude Opus 4.7",
    key: "flowapi-claude-opus",
    provider: "Anthropic",
    modelId: "flowapi-claude-opus",
    actualModelId: process.env.FLOWAPI_CLAUDE_OPUS_ACTUAL_MODEL || process.env.FLOWAPI_UNIAPI_CLAUDE_OPUS_ACTUAL_MODEL || "",
    bestFor: "最强推理、深度分析、专业写作和高难度任务",
    inputPrice: Number(process.env.FLOWAPI_CLAUDE_OPUS_INPUT_CNY_PER_M || 6),
    outputPrice: Number(process.env.FLOWAPI_CLAUDE_OPUS_OUTPUT_CNY_PER_M || 24),
    latency: "中等",
    quality: 98,
    routeKeywords: ["claude", "opus", "推理", "分析", "专业", "高难度", "深度"],
    isAvailable: Boolean(process.env.FLOWAPI_CLAUDE_OPUS_ACTUAL_MODEL || process.env.FLOWAPI_UNIAPI_CLAUDE_OPUS_ACTUAL_MODEL),
  },
  {
    name: "Gemini 2.5 Pro",
    key: "flowapi-gemini-pro",
    provider: "Google",
    modelId: "flowapi-gemini-pro",
    actualModelId: process.env.FLOWAPI_GEMINI_PRO_ACTUAL_MODEL || process.env.FLOWAPI_UNIAPI_GEMINI_PRO_ACTUAL_MODEL || "gemini-2.5-pro",
    bestFor: "多模态理解、复杂内容处理、长上下文分析",
    inputPrice: Number(process.env.FLOWAPI_GEMINI_PRO_INPUT_CNY_PER_M || 6),
    outputPrice: Number(process.env.FLOWAPI_GEMINI_PRO_OUTPUT_CNY_PER_M || 24),
    latency: "中等",
    quality: 96,
    routeKeywords: ["gemini", "多模态", "图片", "视频", "长文本", "内容处理"],
  },
  {
    name: "Gemini 2.5 Flash",
    key: "flowapi-gemini-flash",
    provider: "Google",
    modelId: "flowapi-gemini-flash",
    actualModelId: process.env.FLOWAPI_GEMINI_FLASH_ACTUAL_MODEL || process.env.FLOWAPI_UNIAPI_GEMINI_FLASH_ACTUAL_MODEL || "gemini-2.5-flash",
    bestFor: "快速响应、内容处理、轻量多模态和高频通用任务",
    inputPrice: Number(process.env.FLOWAPI_GEMINI_FLASH_INPUT_CNY_PER_M || 3),
    outputPrice: Number(process.env.FLOWAPI_GEMINI_FLASH_OUTPUT_CNY_PER_M || 12),
    latency: "快",
    quality: 93,
    routeKeywords: ["gemini flash", "快速", "多模态", "内容处理", "通用任务"],
  },
];

export const USD_TO_CNY_RATE = Number(process.env.PROXY_USD_CNY_RATE || 7.2);

const PUBLIC_MODEL_REQUEST_ALIASES = {
  "flowapi-gpt55": "gpt-5.5",
  "gpt-5.5": "gpt-5.5",
  "gpt55": "gpt-5.5",
  "gpt5.5": "gpt-5.5",
  "flowapi-gpt54-pro": "gpt-5.4-pro",
  "gpt-5.4-pro": "gpt-5.4-pro",
  "gpt54-pro": "gpt-5.4-pro",
  "gpt5.4-pro": "gpt-5.4-pro",
  "flowapi-gpt54": "gpt-5.4-mini",
  "gpt-5.4": "gpt-5.4-mini",
  "gpt-5-4": "gpt-5.4-mini",
  "gpt-5.4-mini": "gpt-5.4-mini",
  "gpt54": "gpt-5.4-mini",
  "gpt5.4-mini": "gpt-5.4-mini",
  "flowapi-gpt4o-mini": "gpt-4o-mini",
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt4o-mini": "gpt-4o-mini",
  "flowapi-codex-plus": "gpt-5.3-codex",
  "codex-plus": "gpt-5.3-codex",
  "flowapi-codex-pro": "gpt-5.3-codex",
  "codex-pro": "gpt-5.3-codex",
  "flowapi-codex-lite": "gpt-5.3-codex",
  "codex-lite": "gpt-5.3-codex",
  "gpt-5.3-codex": "gpt-5.3-codex",
  "gpt5.3-codex": "gpt-5.3-codex",
  "flowapi-claude-sonnet": "claude-sonnet-4.6",
  "claude-sonnet": "claude-sonnet-4.6",
  "flowapi-claude-opus": "claude-opus-4.7",
  "claude-opus": "claude-opus-4.7",
  "flowapi-gemini-pro": "gemini-2.5-pro",
  "gemini-pro": "gemini-2.5-pro",
  "flowapi-gemini-flash": "gemini-2.5-flash",
  "gemini-flash": "gemini-2.5-flash",
  "deepseek-chat": "deepseek-chat",
  "deepseek-reasoner": "deepseek-reasoner",
  "qwen/qwen3-32b": "qwen/qwen3-32b",
};

const PUBLIC_MODEL_DISPLAY_NAMES = {
  "gpt-5.5": "GPT5.5",
  "gpt-5.4-pro": "GPT5.4 Pro",
  "gpt-5.4-mini": "GPT5.4 mini",
  "gpt-4o-mini": "GPT4o mini",
  "gpt-5.3-codex": "GPT5.3-Codex",
  "claude-sonnet-4.6": "Claude Sonnet 4.6",
  "claude-opus-4.7": "Claude Opus 4.7",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "deepseek-chat": "DeepSeek V4 Flash",
  "deepseek-reasoner": "DeepSeek V4 Flash Thinking",
  "qwen/qwen3-32b": "Qwen3-32B",
};

function normalizeModelLookupKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function compactDigits(value = "") {
  return String(value)
    .replace(/\b(gpt|claude|gemini)(\d)/gi, "$1-$2")
    .replace(/-+/g, "-");
}

export function getPublicModelRequestId(modelId = "") {
  const normalized = normalizeModelLookupKey(modelId);
  if (PUBLIC_MODEL_REQUEST_ALIASES[normalized]) return PUBLIC_MODEL_REQUEST_ALIASES[normalized];
  if (normalized.startsWith("flowapi-")) {
    const stripped = normalized.replace(/^flowapi-/, "");
    if (PUBLIC_MODEL_REQUEST_ALIASES[stripped]) return PUBLIC_MODEL_REQUEST_ALIASES[stripped];
    return stripped;
  }
  return normalized || String(modelId || "").trim();
}

export function getPublicModelDisplayName(modelId = "", fallback = "") {
  const requestId = getPublicModelRequestId(modelId);
  if (PUBLIC_MODEL_DISPLAY_NAMES[requestId]) return PUBLIC_MODEL_DISPLAY_NAMES[requestId];
  const compact = compactDigits(requestId)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bGpt\b/gi, "GPT")
    .replace(/\bAi\b/gi, "AI");
  if (compact && compact.trim()) return compact.trim();
  return fallback || "FlowAPI 模型";
}

export function normalizeModelLookup(value = "") {
  const raw = String(value || "").trim();
  const normalized = normalizeModelLookupKey(raw);

  const aliases = {
    "deepseek-chat": "deepseek-chat",
    "deepseek-v3": "deepseek-chat",
    "deepseek-reasoner": "deepseek-reasoner",
    "deepseek-r1": "deepseek-reasoner",
    "codex-plus": "flowapi-codex-plus",
    "flowapi-codex-plus": "flowapi-codex-plus",
    "codex-pro": "flowapi-codex-pro",
    "flowapi-codex-pro": "flowapi-codex-pro",
    "codex-lite": "flowapi-codex-lite",
    "flowapi-code-lite": "flowapi-codex-lite",
    "flowapi-codex-lite": "flowapi-codex-lite",
    "gpt55": "gpt-5.5",
    "gpt5.5": "gpt-5.5",
    "gpt5-5": "gpt-5.5",
    "flowapi-gpt55": "flowapi-gpt55",
    "gpt-5.5": "gpt-5.5",
    "gpt-5-5": "gpt-5.5",
    "flowapi-gpt54-pro": "flowapi-gpt54-pro",
    "gpt-5.4-pro": "gpt-5.4-pro",
    "gpt-5-4-pro": "gpt-5.4-pro",
    "gpt54-pro": "gpt-5.4-pro",
    "gpt5.4-pro": "gpt-5.4-pro",
    "gpt5-4-pro": "gpt-5.4-pro",
    "flowapi-gpt54": "flowapi-gpt54",
    "gpt-5.4": "gpt-5.4-mini",
    "gpt-5-4": "gpt-5.4-mini",
    "gpt54": "gpt-5.4-mini",
    "gpt5.4": "gpt-5.4-mini",
    "gpt5-4": "gpt-5.4-mini",
    "gpt-5.4-mini": "flowapi-gpt54",
    "gpt-5-4-mini": "flowapi-gpt54",
    "gpt54-mini": "flowapi-gpt54",
    "gpt5.4-mini": "flowapi-gpt54",
    "gpt5-4-mini": "flowapi-gpt54",
    "flowapi-gpt4o-mini": "flowapi-gpt4o-mini",
    "gpt-4o-mini": "flowapi-gpt4o-mini",
    "gpt4o-mini": "flowapi-gpt4o-mini",
    "gpt-5.3-codex": "gpt-5.3-codex",
    "gpt-5-3-codex": "gpt-5.3-codex",
    "gpt53-codex": "gpt-5.3-codex",
    "gpt5.3-codex": "gpt-5.3-codex",
    "gpt5-3-codex": "gpt-5.3-codex",
    "flowapi-claude-sonnet": "flowapi-claude-sonnet",
    "claude-sonnet": "flowapi-claude-sonnet",
    "claude-sonnet-4.6": "flowapi-claude-sonnet",
    "flowapi-claude-opus": "flowapi-claude-opus",
    "claude-opus": "flowapi-claude-opus",
    "claude-opus-4.7": "flowapi-claude-opus",
    "flowapi-gemini-pro": "flowapi-gemini-pro",
    "gemini-pro": "flowapi-gemini-pro",
    "gemini-2.5-pro": "flowapi-gemini-pro",
    "flowapi-gemini-flash": "flowapi-gemini-flash",
    "gemini-flash": "flowapi-gemini-flash",
    "gemini-2.5-flash": "flowapi-gemini-flash",
    "deepseek/deepseek-chat": "deepseek-chat",
    "qwen/qwen3-32b": "qwen/qwen3-32b",
    "openai/gpt-4o-mini": "flowapi-gpt4o-mini",
  };

  return aliases[normalized] || raw;
}

export function getCatalogModel(modelId) {
  const id = normalizeModelLookup(modelId);
  if (!id) return null;
  const key = id.toLowerCase();
  const exact = MODEL_CATALOG.find((item) => {
    return [item.modelId, item.actualModelId, item.key]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase() === key);
  });
  if (exact) return exact;

  return MODEL_CATALOG.find((item) => String(item.name || "").toLowerCase() === key) || null;
}

export function getActualModelId(model = {}) {
  return model.actualModelId || model.modelId;
}

export function selectModelForPrompt(prompt = "") {
  const text = prompt.toLowerCase();
  const ranked = MODEL_CATALOG.map((model) => {
    const keywordScore = model.routeKeywords.reduce((score, keyword) => {
      return text.includes(keyword.toLowerCase()) ? score + 8 : score;
    }, 0);
    const valueScore = model.quality - model.inputPrice * 2 - model.outputPrice;

    return {
      ...model,
      keywordScore,
      routeScore: Math.round(valueScore + keywordScore),
    };
  }).sort((a, b) => b.routeScore - a.routeScore);

  const keywordMatch = ranked.find((model) => model.keywordScore > 0);
  return keywordMatch || MODEL_CATALOG[0];
}

export function estimateCnyCost(modelId, usage = {}) {
  const model = getCatalogModel(modelId) || MODEL_CATALOG[0];
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const inputCost = (promptTokens / 1_000_000) * model.inputPrice * USD_TO_CNY_RATE;
  const outputCost = (completionTokens / 1_000_000) * model.outputPrice * USD_TO_CNY_RATE;

  return Number((inputCost + outputCost).toFixed(6));
}

export const MODEL_CATALOG = [
  {
    name: "DeepSeek V3",
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
    name: "Qwen3 32B",
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
    name: "GPT-4o Mini",
    key: "gpt4o-mini",
    provider: "OpenAI",
    modelId: "openai/gpt-4o-mini",
    bestFor: "复杂分析、结构化总结、代码辅助",
    inputPrice: 0.15,
    outputPrice: 0.6,
    latency: "中等",
    quality: 94,
    routeKeywords: ["分析", "方案", "总结", "战略", "代码", "架构", "报告", "复杂"],
  },
  {
    name: "Claude Haiku",
    key: "claude-haiku",
    provider: "Anthropic",
    modelId: "anthropic/claude-3.5-haiku",
    bestFor: "长上下文、英文写作、轻量推理",
    inputPrice: 0.8,
    outputPrice: 4,
    latency: "中等",
    quality: 92,
    routeKeywords: ["英文", "长文", "润色", "合同", "条款", "研究", "推理"],
  },
];

export const USD_TO_CNY_RATE = Number(process.env.PROXY_USD_CNY_RATE || 7.2);

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
  const model = MODEL_CATALOG.find((item) => item.modelId === modelId) || MODEL_CATALOG[0];
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const inputCost = (promptTokens / 1_000_000) * model.inputPrice * USD_TO_CNY_RATE;
  const outputCost = (completionTokens / 1_000_000) * model.outputPrice * USD_TO_CNY_RATE;

  return Number((inputCost + outputCost).toFixed(6));
}

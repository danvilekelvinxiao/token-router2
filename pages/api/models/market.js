import { listModelProducts, getModelProduct } from "@/lib/model-products";

const FRONTEND_MODEL_ORDER = [
  "flowapi-gpt55-pro",
  "flowapi-gpt55",
  "flowapi-gpt54-pro",
  "flowapi-gpt54",
  "flowapi-gpt4o-mini",
  "flowapi-codex-lite",
  "flowapi-codex-plus",
  "flowapi-codex-pro",
  "deepseek-chat",
  "deepseek-reasoner",
  "flowapi-claude-sonnet",
  "flowapi-claude-opus",
  "flowapi-gemini-pro",
  "flowapi-gemini-flash",
];

const CATEGORY_META = {
  chatgpt: { providerId: "openai", providerName: "ChatGPT" },
  codex: { providerId: "codex", providerName: "Codex" },
  deepseek: { providerId: "deepseek", providerName: "DeepSeek" },
  claude: { providerId: "anthropic", providerName: "Claude" },
  gemini: { providerId: "google", providerName: "Gemini" },
};

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const products = listModelProducts({ includeUnavailable: true })
      .filter((p) => FRONTEND_MODEL_ORDER.includes(p.publicModelId));

    const models = products.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      publicModelId: p.publicModelId,
      providerId: getFrontendMeta(p).providerId,
      providerName: getFrontendMeta(p).providerName,
      category: mapCategory(p),
      description: p.description || "",
      useCases: p.useCases || [],
      recommendedTools: p.recommendedTools || [],
      typeTags: getTypeTags(p),
      inputPrice: p.isAvailable ? getDisplayPrice(p, "input") : null,
      outputPrice: p.isAvailable ? getDisplayPrice(p, "output") : null,
      billingUnit: "1M tokens",
      isAvailable: Boolean(p.isAvailable),
      isComingSoon: Boolean(p.isComingSoon),
      status: p.isAvailable ? "available" : p.isComingSoon ? "coming_soon" : "unavailable",
      statusLabel: p.isAvailable ? "可用" : p.isComingSoon ? "即将开放" : "暂不可用",
      sortOrder: p.sortOrder || 0,
    })).sort((a, b) => {
      return FRONTEND_MODEL_ORDER.indexOf(a.publicModelId) - FRONTEND_MODEL_ORDER.indexOf(b.publicModelId);
    });

    const categories = getCategoryCounts(models);

    return res.status(200).json({
      models,
      providers: categories,
      categories,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[models/market]", e);
    return res.status(500).json({ error: "模型数据加载失败" });
  }
}

function getFrontendMeta(p) {
  return CATEGORY_META[mapCategory(p)] || { providerId: "openai", providerName: "ChatGPT" };
}

function mapCategory(p) {
  const publicId = String(p.publicModelId || "").toLowerCase();
  if (publicId.includes("codex")) return "codex";
  if (publicId.includes("deepseek")) return "deepseek";
  if (publicId.includes("claude")) return "claude";
  if (publicId.includes("gemini")) return "gemini";
  if (publicId.includes("gpt") || publicId.includes("chatgpt")) return "chatgpt";
  const g = (p.group || "").toLowerCase();
  if (g.includes("codex")) return "codex";
  if (g.includes("gpt") || g.includes("openai")) return "chatgpt";
  if (g.includes("claude")) return "claude";
  if (g.includes("deepseek")) return "deepseek";
  if (g.includes("gemini") || g.includes("google")) return "gemini";
  return "chatgpt";
}

function getCategoryCounts(models) {
  const defs = [
    { id: "all", name: "全部模型", count: models.length },
    { id: "newcomer", name: "新手推荐", count: models.filter((m) => isNewcomerModel(m)).length },
    { id: "chatgpt", name: "ChatGPT", count: models.filter((m) => m.category === "chatgpt").length },
    { id: "codex", name: "Codex", count: models.filter((m) => m.category === "codex").length },
    { id: "deepseek", name: "DeepSeek", count: models.filter((m) => m.category === "deepseek").length },
    { id: "claude", name: "Claude", count: models.filter((m) => m.category === "claude").length },
    { id: "gemini", name: "Gemini", count: models.filter((m) => m.category === "gemini").length },
    { id: "coming_soon", name: "即将开放", count: models.filter((m) => m.status === "coming_soon").length },
  ];
  return defs;
}

function isNewcomerModel(m) {
  return m.isAvailable && ["deepseek-chat", "deepseek-reasoner", "flowapi-codex-lite"].includes(m.publicModelId);
}

function getTypeTags(p) {
  const tags = [];
  const name = (p.displayName || "").toLowerCase();
  const desc = (p.description || "").toLowerCase();
  if (desc.includes("代码") || desc.includes("编程") || name.includes("codex")) tags.push("编程");
  if (desc.includes("推理") || name.includes("reasoner")) tags.push("推理");
  if (desc.includes("写作") || desc.includes("文本")) tags.push("写作");
  if (desc.includes("对话") || desc.includes("聊天") || desc.includes("chat")) tags.push("对话");
  if (desc.includes("工具") || desc.includes("agent")) tags.push("工具");
  if (desc.includes("长文") || desc.includes("长上下文")) tags.push("长文本");
  return tags;
}

function getDisplayPrice(p, type) {
  const multiplier = Number(p.priceMultiplier || 1);
  // Base prices in CNY/M tokens
  if (p.group?.includes("deepseek")) {
    return type === "input" ? (1.0 * multiplier).toFixed(1) : (2.0 * multiplier).toFixed(1);
  }
  if (p.group?.includes("codex")) {
    return type === "input" ? (6.0 * multiplier).toFixed(1) : (24.0 * multiplier).toFixed(1);
  }
  if (p.group?.includes("gpt")) {
    return type === "input" ? (8.0 * multiplier).toFixed(1) : (32.0 * multiplier).toFixed(1);
  }
  if (p.group?.includes("claude")) {
    return type === "input" ? (4.0 * multiplier).toFixed(1) : (16.0 * multiplier).toFixed(1);
  }
  if (p.group?.includes("gemini")) {
    return type === "input" ? (3.0 * multiplier).toFixed(1) : (12.0 * multiplier).toFixed(1);
  }
  return type === "input" ? "待配置" : "待配置";
}

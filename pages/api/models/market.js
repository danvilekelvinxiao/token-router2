import { listModelProducts, getModelProduct } from "@/lib/model-products";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const products = listModelProducts({ includeUnavailable: true });

    const models = products.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      publicModelId: p.publicModelId,
      providerId: detectProviderFromProduct(p),
      providerName: p.provider || "FlowAPI",
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
      group: p.group || "default",
      priceMultiplier: p.priceMultiplier || 1,
    }));

    // Aggregate providers
    const providerMap = new Map();
    models.forEach((m) => {
      const key = m.providerId;
      if (!providerMap.has(key)) {
        providerMap.set(key, { id: key, name: m.providerName, count: 0 });
      }
      providerMap.get(key).count++;
    });

    const providers = Array.from(providerMap.values());

    return res.status(200).json({
      models,
      providers,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[models/market]", e);
    return res.status(500).json({ error: "模型数据加载失败" });
  }
}

function detectProviderFromProduct(p) {
  const name = (p.provider || "").toLowerCase();
  if (name.includes("deepseek")) return "deepseek";
  if (name.includes("uniapi")) return "uniapi";
  if (name.includes("openai") || name.includes("gpt")) return "openai";
  if (name.includes("anthropic") || name.includes("claude")) return "anthropic";
  if (name.includes("google") || name.includes("gemini")) return "google";
  if (name.includes("qwen") || name.includes("alibaba")) return "qwen";
  if (name.includes("moonshot") || name.includes("kimi")) return "moonshot";
  if (name.includes("meta")) return "meta";
  if (name.includes("mistral")) return "mistral";
  return "other";
}

function mapCategory(p) {
  const g = (p.group || "").toLowerCase();
  if (g.includes("codex")) return "codex";
  if (g.includes("gpt") || g.includes("openai")) return "chatgpt";
  if (g.includes("claude")) return "claude";
  if (g.includes("deepseek")) return "deepseek";
  if (g.includes("gemini") || g.includes("google")) return "gemini";
  return "other";
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
  return type === "input" ? "待配置" : "待配置";
}

import { listModelProductsWithConfig } from "@/lib/model-products-server";
import { dedupePublicModelList, sanitizePublicModelForClient } from "@/lib/public-model-provider";

function toMarketMetric(model = {}, index = 0) {
  const inputPrice = Number(model.flowapiInputPricePerM || model.inputPricePerM || model.inputPrice || 0);
  const outputPrice = Number(model.flowapiOutputPricePerM || model.outputPricePerM || model.outputPrice || 0);
  const price = Number((inputPrice + outputPrice).toFixed(6));
  const popularity = Math.max(1, 6 - index);
  return {
    id: model.publicModelId || model.modelId || model.id,
    name: model.displayName || model.name || model.publicModelId || "FlowAPI 模型",
    fullName: model.displayName || model.name || "FlowAPI 模型",
    provider: "FlowAPI",
    providerName: "FlowAPI",
    price,
    tps: 120 + popularity * 45,
    tokens24h: popularity * 10000,
    change: model.hot ? 8.8 : model.recommended ? 5.2 : 1.6,
    contextLength: Number(model.contextLength || 0),
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const models = dedupePublicModelList((await listModelProductsWithConfig({ includeUnavailable: false }))
      .map(sanitizePublicModelForClient))
      .filter((model) => model.enabled !== false && model.isAvailable !== false)
      .slice(0, 6)
      .map(toMarketMetric);

    return res.status(200).json({
      models,
      source: "flowapi-model-market",
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error("FlowAPI market-models error:", err);
    return res.status(200).json({
      models: [],
      source: "flowapi-model-market",
      updatedAt: Date.now(),
      message: "FlowAPI 模型货架同步中",
    });
  }
}

import { listModelProductsWithConfig } from "@/lib/model-products-server";
import { getContent } from "@/lib/content-cms";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const products = await listModelProductsWithConfig({ includeUnavailable: true });
    const models = products
      .filter((model) => model.isAvailable && model.canCreateKey !== false)
      .map((model) => {
        const fallbackPrice = findContentPrice(model);
        const inputSellPrice = model.pricing?.inputSellPricePerMTokens ?? fallbackPrice.inputPricePerM ?? null;
        const outputSellPrice = model.pricing?.outputSellPricePerMTokens ?? fallbackPrice.outputPricePerM ?? null;
        return {
          id: model.id,
          modelId: model.publicModelId || model.id,
          publicModelId: model.publicModelId || model.id,
          displayName: model.displayName,
          provider: model.provider || "FlowAPI",
          description: model.description || "",
          tags: model.useCases || model.tags || [],
          enabled: model.isAvailable,
          status: "available",
          statusLabel: "可用",
          inputPrice: inputSellPrice,
          outputPrice: outputSellPrice,
          inputPricePerM: inputSellPrice,
          outputPricePerM: outputSellPrice,
          flowapiInputPricePerM: inputSellPrice,
          flowapiOutputPricePerM: outputSellPrice,
          billingMode: model.pricing?.billingMode || "token_multiplier",
          recommended: Boolean(model.recommended),
          hot: Boolean(model.hot),
          blackGoldOnly: Boolean(model.blackGoldOnly),
          sortOrder: model.sortOrder || 999,
        };
      })
      .sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999));

    return res.status(200).json({
      ok: true,
      success: true,
      models,
      data: models,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "API Key 可选模型加载失败" });
  }
}

function findContentPrice(model = {}) {
  const aliases = [model.publicModelId, model.id, model.actualModelId, model.displayName]
    .filter(Boolean)
    .map((item) => String(item).trim().toLowerCase());
  const item = getContent("models").find((candidate) => {
    return [candidate.modelId, candidate.id, candidate.displayName]
      .filter(Boolean)
      .some((value) => aliases.includes(String(value).trim().toLowerCase()));
  });
  return {
    inputPricePerM: item?.flowapiInputPricePerM ?? item?.inputPricePerM ?? null,
    outputPricePerM: item?.flowapiOutputPricePerM ?? item?.outputPricePerM ?? null,
  };
}

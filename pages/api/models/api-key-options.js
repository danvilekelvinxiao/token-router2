import { listModelProductsWithConfig } from "@/lib/model-products-server";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const products = await listModelProductsWithConfig({ includeUnavailable: true });
    const models = products
      .filter((model) => model.isAvailable && model.canCreateKey !== false)
      .map((model) => ({
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
        inputPrice: model.pricing?.inputSellPricePerMTokens ?? null,
        outputPrice: model.pricing?.outputSellPricePerMTokens ?? null,
        billingMode: model.pricing?.billingMode || "token_multiplier",
        recommended: Boolean(model.recommended),
        hot: Boolean(model.hot),
        blackGoldOnly: Boolean(model.blackGoldOnly),
        sortOrder: model.sortOrder || 999,
      }))
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

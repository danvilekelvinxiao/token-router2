import { getContent } from "@/lib/content-cms";
import { listModelProductsWithConfig } from "@/lib/model-products-server";
import { listPublishedModels, listModelPricing } from "@/lib/admin-commercial-config";
import { dedupePublicModelList, sanitizePublicModelForClient } from "@/lib/public-model-provider";
import { getPublicModelDisplayName, getPublicModelRequestId } from "@/lib/models";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const data = getContent("models");
  let payload = data;

  try {
    const [products, publishedModels, pricingConfigs] = await Promise.all([
      listModelProductsWithConfig({ includeUnavailable: true }),
      listPublishedModels({ target: "modelSquare" }).catch(() => []),
      listModelPricing().catch(() => []),
    ]);
    const pricingMap = new Map(pricingConfigs.map((item) => [item.modelId, item]));
    const releaseMap = new Map();
    products.forEach((product) => {
      const value = product.officialReleaseDate || "";
      [product.id, product.publicModelId, product.displayName]
        .filter(Boolean)
        .forEach((key) => releaseMap.set(String(key).toLowerCase(), value));
    });
    payload = data.map((model) => {
      const key = [model.id, model.modelId, model.publicModelId, model.displayName]
        .map((item) => String(item || "").toLowerCase())
        .find((item) => releaseMap.has(item));
      return sanitizePublicModelForClient(key ? { ...model, officialReleaseDate: releaseMap.get(key) || model.officialReleaseDate || "" } : model);
    });
    const existingIds = new Set(payload.flatMap((model) => [model.id, model.modelId, model.publicModelId].filter(Boolean)));
    const appended = publishedModels
      .filter((model) => !existingIds.has(model.modelId))
      .map((model) => {
        const pricing = pricingMap.get(model.modelId);
        const requestModelId = getPublicModelRequestId(model.requestModelId || model.publicModelId || model.modelId || model.id || "");
        return sanitizePublicModelForClient({
          id: model.modelId,
          modelId: requestModelId,
          publicModelId: requestModelId,
          requestModelId,
          displayName: getPublicModelDisplayName(model.displayName || model.name || requestModelId, model.displayName || model.name || requestModelId),
          provider: model.provider || "FlowAPI",
          providerName: model.provider || "FlowAPI",
          officialReleaseDate: model.officialReleaseDate || "",
          categories: ["all", model.modelType === "image" ? "multimodal" : "recommended"].filter(Boolean),
          tags: model.tags || [],
          useCases: [],
          recommendedUserTypes: [],
          description: model.description,
          enabled: model.enabled,
          isMemberOnly: model.memberOnly,
          isFreeModel: model.free,
          sortOrder: model.sortOrder || 999,
          inputPrice: pricing?.inputSellPricePerMTokens || 0,
          outputPrice: pricing?.outputSellPricePerMTokens || 0,
          billingMode: pricing?.billingMode || "",
          imageSellPricePerImageCny: pricing?.imageSellPricePerImageCny || 0,
          primaryButtonText: "立即接入",
          primaryButtonHref: "/api-management",
        });
      });
    payload = dedupePublicModelList([...payload, ...appended]).sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999));
  } catch {
    payload = dedupePublicModelList(data.map((model) => sanitizePublicModelForClient(model)));
  }

  return res.status(200).json({
    success: true,
    ok: true,
    source: "real",
    type: "models",
    models: payload,
    data: payload,
    updatedAt: new Date().toISOString(),
  });
}

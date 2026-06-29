import { listModelProductsWithConfig } from "@/lib/model-products-server";
import { listModelPricing, listPublishedModels } from "@/lib/admin-commercial-config";
import { getContent } from "@/lib/content-cms";
import { dedupePublicModelList, sanitizePublicModelForClient } from "@/lib/public-model-provider";
import { listImageModels, mapPublicImageModel } from "@/lib/image-studio";

const CATEGORY_META = {
  chatgpt: { providerId: "openai", providerName: "ChatGPT" },
  codex: { providerId: "codex", providerName: "Codex" },
  deepseek: { providerId: "deepseek", providerName: "DeepSeek" },
  claude: { providerId: "anthropic", providerName: "Claude" },
  gemini: { providerId: "google", providerName: "Gemini" },
  image: { providerId: "image", providerName: "图片生成" },
};

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const [products, publishedModels, pricingConfigs, imageModels] = await Promise.all([
      listModelProductsWithConfig({ includeUnavailable: true }),
      listPublishedModels({ target: "modelSquare" }).catch(() => []),
      listModelPricing().catch(() => []),
      listImageModels().then((models) => models.map(mapPublicImageModel)).catch(() => []),
    ]);
    const pricingMap = new Map(pricingConfigs.map((item) => [item.modelId, item]));
    const legacyProIds = new Set(["gpt55-pro", "flowapi-gpt55-pro", "gpt-5.5-pro"]);
    const staticModels = products
      .filter((p) => !legacyProIds.has(String(p.id || p.publicModelId || p.modelId || "").toLowerCase()))
      .filter((p) => p.isAvailable && p.showInModelSquare !== false)
      .map((p) => sanitizePublicModelForClient(normalizeMarketModel({
        id: p.id,
        modelId: p.publicModelId || p.id,
        displayName: p.displayName,
        provider: p.provider || "FlowAPI",
        description: p.description || "",
        tags: p.useCases || [],
        enabled: p.isAvailable,
        officialReleaseDate: p.officialReleaseDate || "",
        sortOrder: p.sortOrder || 999,
        pricing: p.pricing,
      })));
    const existing = new Set(staticModels.map((model) => model.modelId));
    const adminModels = publishedModels
      .filter((model) => model.enabled && model.showInModelSquare && !existing.has(model.modelId) && !legacyProIds.has(String(model?.id || model?.modelId || model?.publicModelId || "").toLowerCase()))
      .map((model) => sanitizePublicModelForClient(normalizeMarketModel({ ...model, pricing: pricingMap.get(model.modelId) })));
    adminModels.forEach((model) => existing.add(model.modelId));
    const publicImageModels = imageModels
      .filter((model) => model.enabled && !existing.has(model.modelId || model.publicModelId || model.id))
      .map((model) => sanitizePublicModelForClient(normalizeMarketModel({
        id: model.id,
        modelId: model.modelId || model.publicModelId || model.id,
        publicModelId: model.publicModelId || model.modelId || model.id,
        displayName: model.displayName,
        provider: "FlowAPI",
        modelType: "image",
        description: model.sceneDescription || "",
        tags: model.labelTags || model.tags || [],
        enabled: model.enabled,
        recommended: model.recommended,
        hot: Boolean(model.recommended),
        sortOrder: Number(model.sortOrder || 500) + 700,
        pricing: {
          billingMode: model.imageBillingMode?.startsWith("per_image") ? model.imageBillingMode : "per_image_fixed_profit",
          imageSellPricePerImageCny: model.imageSellPricePerImageCny || model.unitPriceRmbTextToImage || 0,
        },
      })));

    const models = dedupePublicModelList([...staticModels, ...adminModels, ...publicImageModels])
      .sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999));
    const categories = getCategoryCounts(models);

    return res.status(200).json({
      ok: true,
      success: true,
      source: "admin_config",
      models,
      data: models,
      providers: categories,
      categories,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[models/market]", e);
    return res.status(500).json({ error: "模型数据加载失败" });
  }
}

function normalizeMarketModel(model) {
  const category = mapCategory(model);
  const meta = CATEGORY_META[category] || CATEGORY_META.chatgpt;
  const fallbackPrice = findContentPrice(model);
  const inputSellPrice = model.pricing?.inputSellPricePerMTokens ?? fallbackPrice.inputPricePerM ?? null;
  const outputSellPrice = model.pricing?.outputSellPricePerMTokens ?? fallbackPrice.outputPricePerM ?? null;
  return {
    id: model.id || model.modelId,
    displayName: model.displayName,
    modelId: model.modelId,
    publicModelId: model.modelId,
    provider: model.provider || meta.providerName,
    providerId: meta.providerId,
    providerName: meta.providerName,
    category,
    description: model.description || "",
    typeTags: model.tags || [],
    tags: model.tags || [],
    inputPrice: inputSellPrice,
    outputPrice: outputSellPrice,
    inputPricePerM: inputSellPrice,
    outputPricePerM: outputSellPrice,
    flowapiInputPricePerM: inputSellPrice,
    flowapiOutputPricePerM: outputSellPrice,
    imageSellPricePerImageCny: model.pricing?.imageSellPricePerImageCny ?? null,
    billingUnit: model.pricing?.billingMode?.startsWith("per_image") ? "张" : "1M Token",
    officialReleaseDate: model.officialReleaseDate || "",
    isAvailable: model.enabled !== false,
    enabled: model.enabled !== false,
    status: model.enabled === false ? "unavailable" : "available",
    statusLabel: model.enabled === false ? "暂不可用" : "可用",
    recommended: Boolean(model.recommended),
    hot: Boolean(model.hot),
    isMemberOnly: Boolean(model.memberOnly),
    isFreeModel: Boolean(model.free),
    sortOrder: model.sortOrder || 999,
    primaryButtonText: category === "image" ? "去生成图片" : "立即接入",
    primaryButtonHref: category === "image" ? "/images" : "/api-management",
  };
}

function findContentPrice(model = {}) {
  const aliases = [model.modelId, model.publicModelId, model.id, model.displayName]
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

function mapCategory(model) {
  const publicId = String(model.modelId || model.publicModelId || "").toLowerCase();
  const provider = String(model.provider || "").toLowerCase();
  const type = String(model.modelType || "").toLowerCase();
  if (type.includes("image")) return "image";
  if (publicId.includes("codex") || provider.includes("codex")) return "codex";
  if (publicId.includes("deepseek") || provider.includes("deepseek")) return "deepseek";
  if (publicId.includes("claude") || provider.includes("anthropic")) return "claude";
  if (publicId.includes("gemini") || provider.includes("google")) return "gemini";
  return "chatgpt";
}

function getCategoryCounts(models) {
  return [
    { id: "all", name: "全部模型", count: models.length },
    { id: "chatgpt", name: "ChatGPT", count: models.filter((m) => m.category === "chatgpt").length },
    { id: "codex", name: "Codex", count: models.filter((m) => m.category === "codex").length },
    { id: "deepseek", name: "DeepSeek", count: models.filter((m) => m.category === "deepseek").length },
    { id: "claude", name: "Claude", count: models.filter((m) => m.category === "claude").length },
    { id: "gemini", name: "Gemini", count: models.filter((m) => m.category === "gemini").length },
    { id: "image", name: "图片生成", count: models.filter((m) => m.category === "image").length },
  ];
}

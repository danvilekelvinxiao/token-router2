/**
 * Server-only model product functions that require the database/store.
 * Never import this module from client/browser code.
 */
import { MODEL_PRODUCTS, normalizeModelProduct } from "./model-products.js";
import { getAllModelConfigs } from "./model-store.js";
import { listPublishedModels, listModelPricing } from "./admin-commercial-config.js";

export async function listModelProductsWithConfig({ includeUnavailable = true } = {}) {
  let configs = {};
  try {
    configs = await getAllModelConfigs();
  } catch {
    // use empty configs if store unavailable
  }

  const staticProducts = MODEL_PRODUCTS
    .filter((item) => includeUnavailable || item.isAvailable)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map((product) => {
      const cfg = configs[product.id] || {};
      const merged = { ...product };

      if (cfg.actualModelId !== undefined) {
        merged.actualModelId = cfg.actualModelId;
      }
      if (cfg.isAvailable !== undefined) {
        merged.isAvailable = cfg.isAvailable;
        merged.isComingSoon = !cfg.isAvailable;
      }
      if (cfg.statusLabel) merged.statusLabel = cfg.statusLabel;
      if (cfg.lastHealthCheckAt) merged.lastHealthCheckAt = cfg.lastHealthCheckAt;
      if (cfg.lastError) merged.lastError = cfg.lastError;
      if (cfg.upstreamChannel) merged.upstreamChannel = cfg.upstreamChannel;
      if (cfg.officialReleaseDate !== undefined) merged.officialReleaseDate = cfg.officialReleaseDate;

      return normalizeModelProduct(merged);
    });

  let published = [];
  try {
    const [publishedModels, pricingConfigs] = await Promise.all([
      listPublishedModels({ target: "apiKey" }),
      listModelPricing(),
    ]);
    const pricingMap = new Map(pricingConfigs.map((item) => [item.modelId, item]));
    const staticIds = new Set(staticProducts.flatMap((item) => [item.id, item.publicModelId, item.actualModelId].filter(Boolean)));
    published = publishedModels
      .filter((item) => !staticIds.has(item.modelId) && !["image", "image-edit", "video", "audio", "embedding"].includes(item.modelType))
      .map((item) => {
        const pricing = pricingMap.get(item.modelId);
        return normalizeModelProduct({
          id: item.modelId,
          publicModelId: item.modelId,
          actualModelId: item.modelId,
          displayName: item.displayName,
          provider: item.provider || "FlowAPI",
          description: item.description || "",
          useCases: [],
          recommendedTools: [],
          isAvailable: item.enabled,
          isComingSoon: !item.enabled,
          canCreateKey: item.showInApiKeyCreate,
          status: item.enabled ? "available" : "coming_soon",
          statusLabel: item.enabled ? "可用" : "已下架",
          officialReleaseDate: item.officialReleaseDate || "",
          sortOrder: item.sortOrder || 999,
          pricing,
        });
      });
  } catch {
    published = [];
  }

  return [...staticProducts, ...published].sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999));
}

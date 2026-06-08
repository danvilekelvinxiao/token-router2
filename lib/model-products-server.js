/**
 * Server-only model product functions that require the database/store.
 * Never import this module from client/browser code.
 */
import { MODEL_PRODUCTS, normalizeModelProduct } from "./model-products.js";
import { getAllModelConfigs } from "./model-store.js";
import { listPublishedModels, listModelPricing } from "./admin-commercial-config.js";

export async function listModelProductsWithConfig({ includeUnavailable = true } = {}) {
  let configs = {};
  let pricingConfigs = [];
  try {
    [configs, pricingConfigs] = await Promise.all([
      getAllModelConfigs(),
      listModelPricing(),
    ]);
  } catch {
    // use empty configs if store unavailable
  }
  const pricingMap = new Map();
  pricingConfigs.forEach((item) => {
    [item.modelId, item.publicModelId, item.actualModelId, item.displayName]
      .filter(Boolean)
      .forEach((key) => pricingMap.set(String(key).trim().toLowerCase(), item));
  });

  const pickConfig = (product) => {
    const aliases = [
      product.id,
      product.publicModelId,
      product.actualModelId,
      product.displayName,
    ].filter(Boolean);

    for (const alias of aliases) {
      const direct = configs[alias];
      if (direct) return direct;
      const normalized = String(alias).trim().toLowerCase();
      const matchedKey = Object.keys(configs).find((key) => String(key).trim().toLowerCase() === normalized);
      if (matchedKey) return configs[matchedKey];
    }

    return {};
  };

  const pickPricing = (product) => {
    const aliases = [
      product.id,
      product.publicModelId,
      product.actualModelId,
      product.displayName,
    ].filter(Boolean);
    for (const alias of aliases) {
      const matched = pricingMap.get(String(alias).trim().toLowerCase());
      if (matched) return matched;
    }
    return product.pricing || null;
  };

  const staticProducts = MODEL_PRODUCTS
    .filter((item) => includeUnavailable || item.isAvailable)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map((product) => {
      const cfg = pickConfig(product);
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
      const pricing = pickPricing(product);
      if (pricing) merged.pricing = pricing;

      return normalizeModelProduct(merged);
    });

  let published = [];
  try {
    const publishedModels = await listPublishedModels({ target: "apiKey" });
    const staticIds = new Set(staticProducts.flatMap((item) => [item.id, item.publicModelId, item.actualModelId].filter(Boolean)));
    published = publishedModels
      .filter((item) => !staticIds.has(item.modelId) && !["image", "image-edit", "video", "audio", "embedding"].includes(item.modelType))
      .map((item) => {
        const pricing = pricingMap.get(String(item.modelId || "").trim().toLowerCase());
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

export async function getModelProductWithConfig(idOrModel) {
  const key = String(idOrModel || "").trim().toLowerCase();
  if (!key) return null;

  const products = await listModelProductsWithConfig({ includeUnavailable: true });
  return products.find((item) => {
    const aliases = [
      item.id,
      item.publicModelId,
      item.actualModelId,
      item.displayName,
      ...(item.allowedModels || []),
      ...(item.upstreamModels || []),
    ].filter(Boolean);

    return aliases.some((value) => String(value).trim().toLowerCase() === key);
  }) || null;
}

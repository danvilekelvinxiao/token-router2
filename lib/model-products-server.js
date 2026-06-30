/**
 * Server-only model product functions that require the database/store.
 * Never import this module from client/browser code.
 */
import { MODEL_PRODUCTS, normalizeModelProduct } from "./model-products.js";
import { getAllModelConfigs } from "./model-store.js";
import { listPublishedModels, listModelPricing } from "./admin-commercial-config.js";
import { getPublicModelRequestId } from "./models.js";

export async function listModelProductsWithConfig({ includeUnavailable = true } = {}) {
  let configs = {};
  let pricingConfigs = [];
  let publishedModels = [];
  try {
    [configs, pricingConfigs, publishedModels] = await Promise.all([
      getAllModelConfigs(),
      listModelPricing(),
      listPublishedModels(),
    ]);
  } catch {
    // use empty configs if store unavailable
  }
  const pricingMap = new Map();
  pricingConfigs.forEach((item) => {
    [item.modelId, item.publicModelId, item.actualModelId, item.displayName, getPublicModelRequestId(item.modelId), getPublicModelRequestId(item.publicModelId)]
      .filter(Boolean)
      .forEach((key) => pricingMap.set(String(key).trim().toLowerCase(), item));
  });

  const pickConfig = (product) => {
    const aliases = [
      product.id,
      product.publicModelId,
      product.actualModelId,
      product.displayName,
      getPublicModelRequestId(product.id),
      getPublicModelRequestId(product.publicModelId),
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
      getPublicModelRequestId(product.id),
      getPublicModelRequestId(product.publicModelId),
    ].filter(Boolean);
    for (const alias of aliases) {
      const matched = pricingMap.get(String(alias).trim().toLowerCase());
      if (matched) return matched;
    }
    return product.pricing || null;
  };

  const publishedEntries = publishedModels.map((item) => {
      const cfg = pickConfig({
        id: item.modelId,
        publicModelId: item.modelId,
        actualModelId: item.upstreamModelId || item.actualModelId || item.modelId,
        displayName: item.displayName,
    });
    const pricing = pricingMap.get(String(item.modelId || "").trim().toLowerCase()) || cfg.pricing || null;
    return normalizeModelProduct({
      id: item.modelId,
      publicModelId: item.modelId,
      actualModelId: cfg.actualModelId || item.upstreamModelId || item.actualModelId || item.modelId,
      displayName: item.displayName,
      provider: item.provider || "FlowAPI",
      description: item.description || "",
      useCases: item.tags || [],
      recommendedTools: [],
      isAvailable: item.enabled,
      isComingSoon: !item.enabled,
      canCreateKey: item.showInApiKeyCreate,
      showInModelSquare: item.showInModelSquare,
      showInApiKeyCreate: item.showInApiKeyCreate,
      showInImageGeneration: item.showInImageGeneration,
      status: item.enabled ? "available" : "coming_soon",
      statusLabel: item.enabled ? "可用" : "已下架",
      officialReleaseDate: item.officialReleaseDate || "",
      sortOrder: item.sortOrder || 999,
      group: cfg.group || item.modelType || "text",
      routeStrategy: cfg.routeStrategy,
      upstreamChannel: cfg.upstreamChannel,
      executionGroup: cfg.executionGroup,
      pricing,
    });
  });
  const publishedByAlias = new Map();
  publishedEntries.forEach((item) => {
    [item.id, item.publicModelId, item.actualModelId, item.displayName, getPublicModelRequestId(item.id), getPublicModelRequestId(item.publicModelId)]
      .filter(Boolean)
      .forEach((alias) => publishedByAlias.set(String(alias).trim().toLowerCase(), item));
  });

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

      const normalized = normalizeModelProduct(merged);
      const publishedMatch = [
        normalized.id,
        normalized.publicModelId,
        normalized.actualModelId,
      ]
        .filter(Boolean)
        .map((alias) => publishedByAlias.get(String(alias).trim().toLowerCase()))
        .find(Boolean);

      if (!publishedMatch) return normalized;

      return normalizeModelProduct({
        ...normalized,
        actualModelId: publishedMatch.actualModelId || normalized.actualModelId,
        displayName: publishedMatch.displayName || normalized.displayName,
        provider: publishedMatch.provider || normalized.provider,
        description: publishedMatch.description || normalized.description,
        useCases: publishedMatch.useCases?.length ? publishedMatch.useCases : normalized.useCases,
        tags: publishedMatch.tags?.length ? publishedMatch.tags : normalized.tags,
        isAvailable: publishedMatch.isAvailable,
        isComingSoon: publishedMatch.isComingSoon,
        canCreateKey: publishedMatch.canCreateKey,
        showInModelSquare: publishedMatch.showInModelSquare,
        showInApiKeyCreate: publishedMatch.showInApiKeyCreate,
        showInImageGeneration: publishedMatch.showInImageGeneration,
        status: publishedMatch.status || normalized.status,
        statusLabel: publishedMatch.statusLabel || normalized.statusLabel,
        officialReleaseDate: publishedMatch.officialReleaseDate || normalized.officialReleaseDate,
        sortOrder: publishedMatch.sortOrder || normalized.sortOrder,
        pricing: publishedMatch.pricing || normalized.pricing,
      });
    });

  const staticIds = new Set(staticProducts.flatMap((item) => [item.id, item.publicModelId, item.actualModelId, item.requestModelId].filter(Boolean)));
  const published = publishedEntries.filter((item) => {
    if (["image", "image-edit", "video", "audio", "embedding"].includes(item.group) || ["image", "image-edit", "video", "audio", "embedding"].includes(item.modelType)) {
      return false;
    }
    return !staticIds.has(item.id) && !staticIds.has(item.publicModelId) && !staticIds.has(item.actualModelId) && !staticIds.has(getPublicModelRequestId(item.id)) && !staticIds.has(getPublicModelRequestId(item.publicModelId));
  });

  return [...staticProducts, ...published].sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999));
}

export async function getModelProductWithConfig(idOrModel) {
  const key = String(idOrModel || "").trim().toLowerCase();
  const requestKey = String(getPublicModelRequestId(idOrModel || "")).trim().toLowerCase();
  if (!key) return null;

  const products = await listModelProductsWithConfig({ includeUnavailable: true });
  return products.find((item) => {
    const aliases = [
      item.id,
      item.publicModelId,
      item.actualModelId,
      item.displayName,
      item.requestModelId,
      ...(item.allowedModels || []),
      ...(item.upstreamModels || []),
    ].filter(Boolean);

    return aliases.some((value) => {
      const alias = String(value).trim().toLowerCase();
      return alias === key || (requestKey && alias === requestKey);
    });
  }) || null;
}

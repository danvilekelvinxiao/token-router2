/**
 * Server-only model product functions that require the database/store.
 * Never import this module from client/browser code.
 */
import { MODEL_PRODUCTS, normalizeModelProduct } from "./model-products.js";
import { getAllModelConfigs } from "./model-store.js";
import { listPublishedModels, listModelPricing } from "./admin-commercial-config.js";
import { sortModelsForDisplay } from "./models/model-sorter.js";
import { normalizeModelDisplayLabel } from "./models/model-name-normalizer.js";

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

  const publishedEntries = publishedModels.map((item) => {
    const cfg = pickConfig({
      id: item.modelId,
      publicModelId: item.modelId,
      actualModelId: item.upstreamModelId || item.actualModelId || item.modelId,
      displayName: item.displayName,
    });
    const pricing = pricingMap.get(String(item.modelId || "").trim().toLowerCase()) || cfg.pricing || null;
    const displayName = normalizeModelDisplayLabel({
      displayName: item.displayName,
      name: item.displayName,
      modelId: item.modelId,
      publicModelId: item.modelId,
      id: item.modelId,
    }) || item.displayName;
    const isAvailable = cfg.isAvailable !== undefined ? Boolean(cfg.isAvailable) : Boolean(item.enabled);
    const showInModelSquare = cfg.showInModelSquare !== undefined ? Boolean(cfg.showInModelSquare) : Boolean(item.showInModelSquare);
    const showInApiKeyCreate = cfg.showInApiKeyCreate !== undefined ? Boolean(cfg.showInApiKeyCreate) : Boolean(item.showInApiKeyCreate);
    const showInImageGeneration = cfg.showInImageGeneration !== undefined ? Boolean(cfg.showInImageGeneration) : Boolean(item.showInImageGeneration);
    return normalizeModelProduct({
      id: item.modelId,
      publicModelId: item.modelId,
      actualModelId: cfg.actualModelId || item.upstreamModelId || item.actualModelId || item.modelId,
      displayName,
      provider: item.provider || "FlowAPI",
      description: item.description || "",
      useCases: item.tags || [],
      recommendedTools: [],
      isAvailable,
      isComingSoon: !isAvailable,
      canCreateKey: showInApiKeyCreate,
      showInModelSquare,
      showInApiKeyCreate,
      showInImageGeneration,
      status: isAvailable ? "available" : "coming_soon",
      statusLabel: isAvailable ? "可用" : "已下架",
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
    [item.id, item.publicModelId, item.actualModelId, item.displayName]
      .filter(Boolean)
      .forEach((alias) => publishedByAlias.set(String(alias).trim().toLowerCase(), item));
  });

  const normalizedStaticProducts = sortModelsForDisplay(
    MODEL_PRODUCTS
      .filter((item) => includeUnavailable || item.isAvailable)
      .map((product) => {
        const cfg = pickConfig(product);
        const merged = { ...product };

        if (cfg.actualModelId !== undefined) merged.actualModelId = cfg.actualModelId;
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

        const publishedCfg = pickConfig({
          id: publishedMatch.modelId,
          publicModelId: publishedMatch.publicModelId || publishedMatch.modelId,
          actualModelId: publishedMatch.actualModelId,
          displayName: publishedMatch.displayName,
        });
        const publishedIsAvailable = publishedCfg.isAvailable !== undefined ? Boolean(publishedCfg.isAvailable) : Boolean(publishedMatch.isAvailable);
        const publishedShowInModelSquare = publishedCfg.showInModelSquare !== undefined ? Boolean(publishedCfg.showInModelSquare) : Boolean(publishedMatch.showInModelSquare);
        const publishedShowInApiKeyCreate = publishedCfg.showInApiKeyCreate !== undefined ? Boolean(publishedCfg.showInApiKeyCreate) : Boolean(publishedMatch.showInApiKeyCreate);
        const publishedShowInImageGeneration = publishedCfg.showInImageGeneration !== undefined ? Boolean(publishedCfg.showInImageGeneration) : Boolean(publishedMatch.showInImageGeneration);
        const normalizedDisplayName = normalizeModelDisplayLabel({
          displayName: publishedMatch.displayName,
          name: publishedMatch.displayName,
          modelId: publishedMatch.modelId,
          publicModelId: publishedMatch.publicModelId,
          id: publishedMatch.id,
        }) || publishedMatch.displayName || normalized.displayName;

        return normalizeModelProduct({
          ...normalized,
          actualModelId: publishedMatch.actualModelId || normalized.actualModelId,
          displayName: normalizedDisplayName,
          provider: publishedMatch.provider || normalized.provider,
          description: publishedMatch.description || normalized.description,
          useCases: publishedMatch.useCases?.length ? publishedMatch.useCases : normalized.useCases,
          tags: publishedMatch.tags?.length ? publishedMatch.tags : normalized.tags,
          isAvailable: publishedIsAvailable,
          isComingSoon: !publishedIsAvailable,
          canCreateKey: publishedShowInApiKeyCreate,
          showInModelSquare: publishedShowInModelSquare,
          showInApiKeyCreate: publishedShowInApiKeyCreate,
          showInImageGeneration: publishedShowInImageGeneration,
          status: publishedIsAvailable ? (publishedMatch.status || normalized.status) : "coming_soon",
          statusLabel: publishedIsAvailable ? (publishedMatch.statusLabel || normalized.statusLabel) : "已下架",
          officialReleaseDate: publishedMatch.officialReleaseDate || normalized.officialReleaseDate,
          sortOrder: publishedMatch.sortOrder || normalized.sortOrder,
          pricing: publishedMatch.pricing || normalized.pricing,
          lastHealthCheckAt: publishedCfg.lastHealthCheckAt || publishedMatch.lastHealthCheckAt || normalized.lastHealthCheckAt,
          lastError: publishedCfg.lastError || publishedMatch.lastError || normalized.lastError,
        });
      })
  );

  const staticIds = new Set(normalizedStaticProducts.flatMap((item) => [item.id, item.publicModelId, item.actualModelId].filter(Boolean)));
  const published = publishedEntries.filter((item) => {
    if (["image", "image-edit", "video", "audio", "embedding"].includes(item.group) || ["image", "image-edit", "video", "audio", "embedding"].includes(item.modelType)) {
      return false;
    }
    return !staticIds.has(item.id) && !staticIds.has(item.publicModelId) && !staticIds.has(item.actualModelId);
  });

  return sortModelsForDisplay([...normalizedStaticProducts, ...published]);
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

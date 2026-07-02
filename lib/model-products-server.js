/**
 * Server-only model product functions that require the database/store.
 * Never import this module from client/browser code.
 */
import { MODEL_PRODUCTS, normalizeModelProduct } from "./model-products.js";
import { getAllModelConfigs } from "./model-store.js";
import { listPublishedModels, listModelPricing } from "./admin-commercial-config.js";
import { listUpstreamModels } from "./model-store.js";
import { getPublicModelRequestId } from "./models.js";

function normalizeLookupKey(value = "") {
  return String(value || "").trim().toLowerCase();
}

function modelAliases(model = {}) {
  return [
    model.requestModelId,
    model.publicModelId,
    model.modelId,
    model.actualModelId,
    model.id,
    model.displayName,
  ]
    .filter(Boolean)
    .map((value) => normalizeLookupKey(value));
}

function dedupeModelList(models = []) {
  const seen = new Set();
  const result = [];
  for (const model of Array.isArray(models) ? models : []) {
    const aliases = modelAliases(model);
    if (!aliases.length || aliases.some((alias) => seen.has(alias))) continue;
    aliases.forEach((alias) => seen.add(alias));
    result.push(model);
  }
  return result;
}

function detectProviderFromModelId(modelId = "") {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("claude")) return "Anthropic";
  if (id.includes("gemini")) return "Google";
  if (id.includes("qwen")) return "Alibaba";
  if (id.includes("deepseek")) return "DeepSeek";
  if (id.includes("gpt") || id.includes("codex")) return "OpenAI";
  return "FlowAPI";
}

function detectGroupFromModelId(modelId = "") {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("codex")) return "codex";
  if (id.includes("claude")) return "claude-premium";
  if (id.includes("gemini")) return "gemini";
  if (id.includes("image")) return "image";
  return "text";
}

function mapUpstreamModelToProduct(row = {}, config = {}, pricing = null) {
  const actualModelId = String(row.actualModelId || row.actual_model_id || "").trim();
  const canonicalPublicModelId = getPublicModelRequestId(row.publicModelId || row.public_model_id || actualModelId || row.displayName || row.display_name || row.id || "");
  const displayName = row.displayName || row.display_name || canonicalPublicModelId || actualModelId;
  const enabled = config.isAvailable !== undefined ? Boolean(config.isAvailable) : false;

  return normalizeModelProduct({
    id: row.id || `upstream:${canonicalPublicModelId}`,
    publicModelId: canonicalPublicModelId,
    actualModelId,
    displayName,
    provider: row.provider || detectProviderFromModelId(actualModelId),
    description: config.description || row.description || "",
    useCases: config.useCases || row.useCases || [],
    recommendedTools: config.recommendedTools || [],
    isAvailable: enabled,
    isComingSoon: config.isComingSoon !== undefined ? Boolean(config.isComingSoon) : !enabled,
    canCreateKey: config.canCreateKey !== undefined ? Boolean(config.canCreateKey) : false,
    showInModelSquare: config.showInModelSquare !== undefined ? Boolean(config.showInModelSquare) : false,
    showInApiKeyCreate: config.showInApiKeyCreate !== undefined ? Boolean(config.showInApiKeyCreate) : false,
    showInImageGeneration: config.showInImageGeneration !== undefined ? Boolean(config.showInImageGeneration) : false,
    status: config.status || (enabled ? "available" : "unavailable"),
    statusLabel: config.statusLabel || (enabled ? "可用" : "待发布"),
    officialReleaseDate: config.officialReleaseDate || row.officialReleaseDate || row.official_release_date || "",
    sortOrder: Number(config.sortOrder || row.sortOrder || row.sort_order || 999),
    group: config.group || detectGroupFromModelId(actualModelId),
    routeStrategy: config.routeStrategy || row.routeStrategy || row.route_strategy || "",
    upstreamChannel: row.upstreamChannel || row.upstream_channel || "",
    executionGroup: config.executionGroup || "",
    pricing,
  });
}

export async function listModelProductsWithConfig({ includeUnavailable = true } = {}) {
  let configs = {};
  let pricingConfigs = [];
  let publishedModels = [];
  let upstreamModels = [];
  try {
    [configs, pricingConfigs, publishedModels, upstreamModels] = await Promise.all([
      getAllModelConfigs().catch(() => ({})),
      listModelPricing().catch(() => []),
      listPublishedModels().catch(() => []),
      listUpstreamModels().catch(() => []),
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

  const upstreamEntries = upstreamModels.map((item) => {
    const cfg = pickConfig({
      id: item.id,
      publicModelId: item.publicModelId || item.public_model_id || item.actualModelId || item.actual_model_id || item.displayName || item.display_name || item.id,
      actualModelId: item.actualModelId || item.actual_model_id,
      displayName: item.displayName || item.display_name,
    });
    const pricing = pickPricing({
      id: item.id,
      publicModelId: item.publicModelId || item.public_model_id || item.actualModelId || item.actual_model_id || item.displayName || item.display_name || item.id,
      actualModelId: item.actualModelId || item.actual_model_id,
      displayName: item.displayName || item.display_name,
    });
    return mapUpstreamModelToProduct(item, cfg, pricing);
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
  const merged = dedupeModelList([...staticProducts, ...published, ...upstreamEntries]);
  return merged.sort((a, b) => Number(a.sortOrder || 999) - Number(b.sortOrder || 999));
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
      item.requestModelId,
      ...(item.allowedModels || []),
      ...(item.upstreamModels || []),
    ].filter(Boolean);

    return aliases.some((value) => String(value).trim().toLowerCase() === key);
  }) || null;
}

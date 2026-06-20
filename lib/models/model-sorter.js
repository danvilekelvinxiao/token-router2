const PROVIDER_FAMILY_ORDER = {
  openai: 10,
  anthropic: 20,
  google: 30,
  xai: 40,
  deepseek: 50,
  alibaba: 60,
  moonshot: 70,
  other: 999,
};

const FEATURED_MODEL_ORDER = [
  "gpt-5.5",
  "claude-opus-4.8",
  "gpt-5.4",
  "claude-opus-4.7",
  "gpt-5.3",
  "claude-opus-4.6",
  "gpt-5",
  "claude-opus-4.5",
  "gemini-2.5-pro",
  "grok-4",
  "gemini-2.5-flash",
  "grok-3.5",
];

const OPENAI_SERIES_ORDER = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.3",
  "gpt-5",
  "gpt-4.9",
  "gpt-4.8",
  "gpt-4.7",
  "gpt-4.6",
  "gpt-4.5",
  "gpt-4.1",
  "gpt-4o",
  "gpt-4",
  "gpt-3.5",
  "codex-pro",
  "codex-plus",
  "codex",
];

const ANTHROPIC_SERIES_ORDER = [
  "claude-opus-4.8",
  "claude-opus-4.7",
  "claude-opus-4.6",
  "claude-opus-4.5",
  "claude-sonnet-4.8",
  "claude-sonnet-4.7",
  "claude-sonnet-4.6",
  "claude-sonnet-4.5",
  "claude-haiku",
];

const GOOGLE_SERIES_ORDER = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-pro",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
];

const XAI_SERIES_ORDER = [
  "grok-4",
  "grok-3.5",
  "grok-3",
  "grok-2",
];

const DEEPSEEK_SERIES_ORDER = [
  "deepseek-reasoner",
  "deepseek-chat",
  "deepseek-v3",
  "deepseek-v2",
];

const ALIBABA_SERIES_ORDER = [
  "qwen3",
  "qwen2.5",
  "qwen2",
  "qwen1.5",
  "qwen",
];

const MOONSHOT_SERIES_ORDER = [
  "kimi-k2",
  "kimi-k1.5",
  "kimi-k1",
  "kimi",
];

function toText(model) {
  return [
    model?.providerFamily,
    model?.providerName,
    model?.provider,
    model?.id,
    model?.modelId,
    model?.publicModelId,
    model?.name,
    model?.displayName,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_\/]+/g, "-")
    .replace(/([a-z])([0-9])/gi, "$1-$2")
    .replace(/([0-9])([a-z])/gi, "$1-$2")
    .replace(/-+/g, "-")
    .trim();
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function getExplicitDisplayOrder(model = {}) {
  const candidates = [model.displayOrder, model.display_order];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return Number.POSITIVE_INFINITY;
}

function isFeaturedModel(model = {}) {
  return Boolean(
    model.featured
    ?? model.pinned
    ?? model.hot
    ?? model.recommended
  );
}

function getFeaturedModelRank(model = {}) {
  const text = normalizeText(toText(model));
  if (!text) return Number.POSITIVE_INFINITY;
  const exact = FEATURED_MODEL_ORDER.findIndex((item) => text.includes(item));
  return exact >= 0 ? exact : Number.POSITIVE_INFINITY;
}

export function getModelProviderFamily(model = {}) {
  const explicit = normalizeText(model.providerFamily || "");
  if (explicit && explicit !== "other") return explicit;

  const text = toText(model);
  const normalized = normalizeText(text);

  if (containsAny(normalized, ["anthropic", "claude", "sonnet", "haiku", "opus"])) return "anthropic";
  if (containsAny(normalized, ["google", "gemini", "palm", "imagen", "veo"])) return "google";
  if (containsAny(normalized, ["xai", "x-ai", "grok"])) return "xai";
  if (containsAny(normalized, ["deepseek"])) return "deepseek";
  if (containsAny(normalized, ["qwen", "alibaba", "tongyi", "dashscope"])) return "alibaba";
  if (containsAny(normalized, ["moonshot", "kimi"])) return "moonshot";
  if (containsAny(normalized, ["openai", "chatgpt", "gpt", "codex", "o1", "o3", "o4", "o5"])) return "openai";
  return "other";
}

function extractVersionText(model = {}) {
  const text = normalizeText(toText(model));
  const match = text.match(/(?:gpt|claude|gemini|grok|qwen|kimi|deepseek|openai|anthropic|google|xai|moonshot|alibaba|o[1345])[-:/ ]*([0-9]+(?:\.[0-9]+){0,2}|[0-9]+o)/);
  if (match?.[1]) return match[1];
  const fallback = text.match(/([0-9]+(?:\.[0-9]+){0,2})/);
  return fallback?.[1] || "";
}

export function getModelVersionScore(model = {}) {
  const versionText = extractVersionText(model);
  if (!versionText) return 0;
  const normalized = versionText.replace(/o$/i, ".0");
  const parts = normalized.split(".").map((part) => Number(part));
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
  const [major = 0, minor = 0, patch = 0] = parts;
  return (major * 1000) + (minor * 10) + patch;
}

function getFamilySeriesScore(model = {}) {
  const family = getModelProviderFamily(model);
  const normalized = normalizeText(toText(model));
  const versionScore = getModelVersionScore(model);

  const pickScore = (order, fallbackBase) => {
    const exactIndex = order.findIndex((item) => normalized.includes(item));
    if (exactIndex >= 0) {
      return Math.max(1, fallbackBase - (exactIndex * 1000) + versionScore);
    }
    return Math.max(1, fallbackBase - (order.length * 1000) + versionScore);
  };

  if (family === "openai") {
    if (normalized.includes("codex-pro")) return pickScore(["codex-pro"], 900000);
    if (normalized.includes("codex-plus")) return pickScore(["codex-plus"], 890000);
    if (normalized.includes("codex")) return pickScore(["codex"], 880000);
    return pickScore(OPENAI_SERIES_ORDER, 950000);
  }

  if (family === "anthropic") {
    return pickScore(ANTHROPIC_SERIES_ORDER, 940000);
  }

  if (family === "google") {
    return pickScore(GOOGLE_SERIES_ORDER, 930000);
  }

  if (family === "xai") {
    return pickScore(XAI_SERIES_ORDER, 920000);
  }

  if (family === "deepseek") {
    return pickScore(DEEPSEEK_SERIES_ORDER, 910000);
  }

  if (family === "alibaba") {
    return pickScore(ALIBABA_SERIES_ORDER, 900000);
  }

  if (family === "moonshot") {
    return pickScore(MOONSHOT_SERIES_ORDER, 890000);
  }

  return Math.max(1, 100000 + versionScore);
}

export function getModelSeriesScore(model = {}) {
  return getFamilySeriesScore(model);
}

function getPopularityScore(model = {}) {
  const candidates = [model.popularityScore, model.popularity_score, model.popularity, model.hot ? 1 : null, model.recommended ? 0.5 : null];
  for (const value of candidates) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function getReleaseTime(model = {}) {
  const value = model.releaseDate || model.release_date || model.officialReleaseDate || model.official_release_date || model.createdAt || model.created_at;
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getDisplayName(model = {}) {
  return String(model.displayName || model.name || model.modelId || model.publicModelId || model.id || "")
    .trim()
    .toLowerCase();
}

function getCategoryKey(model = {}) {
  return normalizeText(model.category || model.modelType || model.providerFamily || getModelProviderFamily(model));
}

function getPriceKey(model = {}) {
  const values = [
    model.inputPricePerM,
    model.flowapiInputPricePerM,
    model.inputPrice,
    model.outputPricePerM,
    model.flowapiOutputPricePerM,
    model.outputPrice,
    model.imageSellPricePerImageCny,
    model.sellInputPricePerMillion,
    model.sellOutputPricePerMillion,
    model.pricing?.inputSellPricePerMTokens,
    model.pricing?.outputSellPricePerMTokens,
    model.pricing?.imageSellPricePerImageCny,
  ].map((value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(6) : "";
  });
  return values.filter(Boolean).join("|");
}

function getModelDedupKey(model = {}) {
  return [
    getDisplayName(model),
    getCategoryKey(model),
    getPriceKey(model),
  ].filter(Boolean).join("::");
}

export function sortModelsForDisplay(models = []) {
  const sorted = [...models]
    .map((model, index) => ({ model, index }))
    .sort((left, right) => {
      const a = left.model || {};
      const b = right.model || {};

      const aFamily = PROVIDER_FAMILY_ORDER[getModelProviderFamily(a)] ?? PROVIDER_FAMILY_ORDER.other;
      const bFamily = PROVIDER_FAMILY_ORDER[getModelProviderFamily(b)] ?? PROVIDER_FAMILY_ORDER.other;
      if (aFamily !== bFamily) return aFamily - bFamily;

      const aDisplayOrder = getExplicitDisplayOrder(a);
      const bDisplayOrder = getExplicitDisplayOrder(b);
      if (aDisplayOrder !== bDisplayOrder) return aDisplayOrder - bDisplayOrder;

      const aFeatured = isFeaturedModel(a) ? 1 : 0;
      const bFeatured = isFeaturedModel(b) ? 1 : 0;
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;

      const aFeaturedRank = getFeaturedModelRank(a);
      const bFeaturedRank = getFeaturedModelRank(b);
      if (aFeaturedRank !== bFeaturedRank) return aFeaturedRank - bFeaturedRank;

      const aSeries = getFamilySeriesScore(a);
      const bSeries = getFamilySeriesScore(b);
      if (aSeries !== bSeries) return bSeries - aSeries;

      const aPopularity = getPopularityScore(a);
      const bPopularity = getPopularityScore(b);
      if (aPopularity !== bPopularity) return bPopularity - aPopularity;

      const aRelease = getReleaseTime(a);
      const bRelease = getReleaseTime(b);
      if (aRelease !== bRelease) return bRelease - aRelease;

      const aName = getDisplayName(a);
      const bName = getDisplayName(b);
      if (aName !== bName) return aName.localeCompare(bName, "zh-Hans-CN");

      return left.index - right.index;
    })
    .map((item) => item.model);

  const seen = new Set();
  const deduped = [];
  for (const model of sorted) {
    const key = getModelDedupKey(model);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(model);
  }
  return deduped;
}

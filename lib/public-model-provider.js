const PUBLIC_FORBIDDEN_TERMS = [
  "aicards",
  "aicards.shop",
  "openrouter",
  "uniapi",
  "aheapi",
  "new api",
  "new-api",
  "newapi",
  "sub2api",
  "upstream",
  "actual_model",
  "provider_key",
  "base_url",
  "api_key",
  "bearer",
  "authorization",
  "proxy",
  "backup",
  "supplier",
  "vendor",
  "sk-",
  "cr_",
  "上游",
  "供应商",
  "供货商",
  "备用通道",
  "备用线路",
  "中转",
];

const PUBLIC_TEXT_REPLACEMENTS = [
  [/DeepSeek\s*V3\s*\((?:OpenRouter|openrouter)\)/gi, "DeepSeek V3"],
  [/\((?:OpenRouter|openrouter|AICards|aicards|UniAPI|uniapi|AHEAPI|aheapi|New API|new-api|newapi)\)/g, ""],
  [/\bOpenRouter\s+Credits\b/gi, "全球模型额度"],
  [/\bOpenRouter\b/gi, "全球模型"],
  [/\bAICards\b/gi, "FlowAPI"],
  [/\baicards\.shop\b/gi, "flowapi.fun"],
  [/\bUniAPI\b/gi, "高级通道"],
  [/\bAHEAPI\b/gi, "高级通道"],
  [/\bNew API\b/gi, "管理后台"],
  [/\bnew-api\b/gi, "管理后台"],
  [/\bsub2api\b/gi, "账号池服务"],
  [/上游/g, "模型服务"],
  [/供应商/g, "模型服务"],
  [/供货商/g, "模型服务"],
];

function containsForbiddenPublicText(value = "") {
  const text = String(value || "").toLowerCase();
  return PUBLIC_FORBIDDEN_TERMS.some((term) => text.includes(term));
}

export function sanitizePublicText(value = "") {
  let text = String(value || "");
  for (const [pattern, replacement] of PUBLIC_TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  if (containsForbiddenPublicText(text)) {
    return "FlowAPI";
  }
  return text.replace(/\s{2,}/g, " ").trim();
}

export function getPublicModelProvider(model = {}) {
  return "FlowAPI";
}

export function sanitizePublicModelProvider(model = {}) {
  const provider = getPublicModelProvider(model);
  return {
    ...model,
    provider,
    providerName: provider,
  };
}

export function sanitizePublicModelForClient(model = {}) {
  const sanitized = sanitizePublicModelProvider(model);
  const tags = Array.isArray(sanitized.tags)
    ? sanitized.tags.map((tag) => sanitizePublicText(tag)).filter(Boolean)
    : sanitized.tags;
  const typeTags = Array.isArray(sanitized.typeTags)
    ? sanitized.typeTags.map((tag) => sanitizePublicText(tag)).filter(Boolean)
    : sanitized.typeTags;
  const publicModel = {
    id: sanitized.id,
    modelId: sanitized.modelId,
    publicModelId: sanitized.publicModelId,
    displayName: sanitizePublicText(sanitized.displayName || sanitized.name || sanitized.modelId || ""),
    name: sanitized.name ? sanitizePublicText(sanitized.name) : sanitized.name,
    provider: sanitized.provider,
    providerName: sanitized.providerName,
    providerId: sanitized.providerId,
    category: sanitized.category,
    categories: sanitized.categories,
    description: sanitized.description ? sanitizePublicText(sanitized.description) : sanitized.description,
    tags,
    typeTags,
    useCases: sanitized.useCases,
    recommendedUserTypes: sanitized.recommendedUserTypes,
    inputPrice: sanitized.inputPrice,
    outputPrice: sanitized.outputPrice,
    inputPricePerM: sanitized.inputPricePerM,
    outputPricePerM: sanitized.outputPricePerM,
    flowapiInputPricePerM: sanitized.flowapiInputPricePerM,
    flowapiOutputPricePerM: sanitized.flowapiOutputPricePerM,
    imageSellPricePerImageCny: sanitized.imageSellPricePerImageCny,
    billingMode: sanitized.billingMode,
    billingUnit: sanitized.billingUnit,
    officialReleaseDate: sanitized.officialReleaseDate,
    isAvailable: sanitized.isAvailable,
    enabled: sanitized.enabled,
    status: sanitized.status,
    statusLabel: sanitized.statusLabel,
    recommended: sanitized.recommended,
    hot: sanitized.hot,
    isMemberOnly: sanitized.isMemberOnly,
    isFreeModel: sanitized.isFreeModel,
    memberOnly: sanitized.memberOnly,
    free: sanitized.free,
    blackGoldOnly: sanitized.blackGoldOnly,
    sortOrder: sanitized.sortOrder,
    primaryButtonText: sanitized.primaryButtonText,
    primaryButtonHref: sanitized.primaryButtonHref,
  };
  return Object.fromEntries(Object.entries(publicModel).filter(([, value]) => value !== undefined));
}

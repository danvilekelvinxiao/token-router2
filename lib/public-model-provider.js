function normalizeText(value = "") {
  return String(value || "").trim();
}

export function getPublicModelProvider(model = {}) {
  const displayName = normalizeText(model.displayName || model.name || model.model || "");
  const modelId = normalizeText(model.modelId || model.publicModelId || model.id || "");
  const provider = normalizeText(model.provider || model.providerName || "");
  const haystack = `${displayName} ${modelId} ${provider}`.toLowerCase();

  if (haystack.includes("codex") || haystack.includes("gpt") || haystack.includes("chatgpt") || haystack.includes("openai")) {
    return "OpenAI";
  }
  if (haystack.includes("claude") || haystack.includes("anthropic")) {
    return "Anthropic";
  }
  if (haystack.includes("gemini") || haystack.includes("google")) {
    return "Google";
  }
  if (haystack.includes("deepseek")) {
    return "DeepSeek";
  }
  if (haystack.includes("qwen") || haystack.includes("通义") || haystack.includes("alibaba")) {
    return "Alibaba";
  }

  if (!provider || provider.toLowerCase().includes("uniapi")) {
    return "FlowAPI";
  }

  return provider.replace(/uniapi/gi, "FlowAPI");
}

export function sanitizePublicModelProvider(model = {}) {
  const provider = getPublicModelProvider(model);
  return {
    ...model,
    provider,
    providerName: provider,
  };
}

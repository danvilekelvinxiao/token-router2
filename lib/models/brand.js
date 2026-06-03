export const MODEL_BRANDS = {
  openai: { label: "OpenAI", shortLabel: "AI" },
  anthropic: { label: "Anthropic", shortLabel: "C" },
  google: { label: "Google Gemini", shortLabel: "G" },
  deepseek: { label: "DeepSeek", shortLabel: "DS" },
  alibaba: { label: "Qwen", shortLabel: "Q" },
  moonshot: { label: "Moonshot Kimi", shortLabel: "K" },
  minimax: { label: "MiniMax", shortLabel: "M" },
  spark: { label: "讯飞 Spark", shortLabel: "讯" },
  meta: { label: "Meta", shortLabel: "M" },
  mistral: { label: "Mistral AI", shortLabel: "M" },
  cohere: { label: "Cohere", shortLabel: "C" },
  xai: { label: "xAI Grok", shortLabel: "X" },
  flux: { label: "Black Forest Labs Flux", shortLabel: "FX" },
  stability: { label: "Stability AI", shortLabel: "S" },
  midjourney: { label: "Midjourney", shortLabel: "MJ" },
  bytedance: { label: "ByteDance Seedream", shortLabel: "BD" },
  doubao: { label: "Doubao", shortLabel: "DB" },
  kling: { label: "Kling", shortLabel: "KL" },
  image: { label: "图片模型", shortLabel: "IM" },
  default: { label: "通用模型", shortLabel: "O" },
};

export function getModelBrand(model = "", provider = "") {
  const name = `${provider} ${model}`.toLowerCase();
  if (name.includes("openai") || name.includes("chatgpt") || name.includes("gpt") || name.includes("codex")) return "openai";
  if (name.includes("anthropic") || name.includes("claude")) return "anthropic";
  if (name.includes("google") || name.includes("gemini") || name.includes("imagen")) return "google";
  if (name.includes("deepseek")) return "deepseek";
  if (name.includes("qwen") || name.includes("通义千问") || name.includes("alibaba")) return "alibaba";
  if (name.includes("moonshot") || name.includes("kimi")) return "moonshot";
  if (name.includes("minimax")) return "minimax";
  if (name.includes("讯飞") || name.includes("spark")) return "spark";
  if (name.includes("meta") || name.includes("llama")) return "meta";
  if (name.includes("mistral")) return "mistral";
  if (name.includes("cohere")) return "cohere";
  if (name.includes("x-ai") || name.includes("xai") || name.includes("grok")) return "xai";
  if (name.includes("flux") || name.includes("black-forest")) return "flux";
  if (name.includes("stability") || name.includes("stable-diffusion")) return "stability";
  if (name.includes("midjourney")) return "midjourney";
  if (name.includes("seedream") || name.includes("bytedance")) return "bytedance";
  if (name.includes("doubao")) return "doubao";
  if (name.includes("kling") || name.includes("kuaishou")) return "kling";
  if (name.includes("image")) return "image";
  return "default";
}

export function getModelBrandLabel(model = "", provider = "") {
  const key = getModelBrand(model, provider);
  return MODEL_BRANDS[key]?.label || provider || "通用模型";
}

export function getModelBrandInitial(model = "", provider = "") {
  const key = getModelBrand(model, provider);
  return MODEL_BRANDS[key]?.shortLabel || String(provider || model || "O").slice(0, 2).toUpperCase();
}

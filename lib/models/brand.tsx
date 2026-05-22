import React from "react";

// Brand color + logo mapping for model providers
const PROVIDERS: Record<string, { label: string; shortLabel: string; bg: string; fg: string }> = {
  deepseek: { label: "DeepSeek", shortLabel: "DS", bg: "#4F46E5", fg: "#fff" },
  anthropic: { label: "Anthropic", shortLabel: "C", bg: "#D97706", fg: "#fff" },
  claude: { label: "Anthropic", shortLabel: "C", bg: "#D97706", fg: "#fff" },
  openai: { label: "OpenAI", shortLabel: "AI", bg: "#10B981", fg: "#fff" },
  gpt: { label: "OpenAI", shortLabel: "AI", bg: "#10B981", fg: "#fff" },
  google: { label: "Google Gemini", shortLabel: "G", bg: "#4285F4", fg: "#fff" },
  gemini: { label: "Google Gemini", shortLabel: "G", bg: "#4285F4", fg: "#fff" },
  qwen: { label: "Qwen", shortLabel: "Q", bg: "#6366F1", fg: "#fff" },
  alibaba: { label: "Qwen", shortLabel: "Q", bg: "#6366F1", fg: "#fff" },
  kimi: { label: "Moonshot Kimi", shortLabel: "K", bg: "#8B5CF6", fg: "#fff" },
  moonshot: { label: "Moonshot Kimi", shortLabel: "K", bg: "#8B5CF6", fg: "#fff" },
  minimax: { label: "MiniMax", shortLabel: "M", bg: "#F59E0B", fg: "#fff" },
  spark: { label: "讯飞 Spark", shortLabel: "讯", bg: "#06B6D4", fg: "#fff" },
  meta: { label: "Meta", shortLabel: "M", bg: "#1877F2", fg: "#fff" },
  mistral: { label: "Mistral AI", shortLabel: "M", bg: "#F97316", fg: "#fff" },
  xai: { label: "xAI Grok", shortLabel: "X", bg: "#1D1D1F", fg: "#fff" },
  grok: { label: "xAI Grok", shortLabel: "X", bg: "#1D1D1F", fg: "#fff" },
  cohere: { label: "Cohere", shortLabel: "C", bg: "#EC4899", fg: "#fff" },
};

const FALLBACK = { label: "通用模型", shortLabel: "O", bg: "#6B7280", fg: "#fff" };

function detectProvider(model = "", provider = ""): string {
  const m = `${provider} ${model}`.toLowerCase();
  if (m.includes("chatgpt")) return "openai";
  if (m.includes("通义千问")) return "qwen";
  if (m.includes("讯飞")) return "spark";
  for (const key of Object.keys(PROVIDERS)) {
    if (m.includes(key)) return key;
  }
  return "";
}

export function getModelBrand(model = "", provider = ""): string {
  return detectProvider(model, provider) || "default";
}

export function getModelBrandLabel(model = "", provider = ""): string {
  const key = detectProvider(model, provider);
  return PROVIDERS[key]?.label || provider || FALLBACK.label;
}

export function getModelBrandInitial(model = "", provider = ""): string {
  const key = detectProvider(model, provider);
  return PROVIDERS[key]?.shortLabel || FALLBACK.shortLabel;
}

export function getModelProvider(model: string): { label: string; shortLabel: string; bg: string; fg: string } {
  const key = detectProvider(model);
  return PROVIDERS[key] || FALLBACK;
}

/* ------------------------------------------------------------------ */
/*  ModelBrandIcon                                                     */
/* ------------------------------------------------------------------ */
export function ModelBrandIcon({
  model,
  size = 24,
}: {
  model: string;
  size?: number;
}) {
  const { shortLabel, bg, fg } = getModelProvider(model);
  return (
    <span
      className="model-brand-icon"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: fg,
        fontSize: size * 0.4,
        fontWeight: 700,
        flexShrink: 0,
        lineHeight: 1,
      }}
      title={model}
    >
      {shortLabel}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  ModelNameWithLogo                                                  */
/* ------------------------------------------------------------------ */
export function ModelNameWithLogo({
  model,
  size = 24,
  gap = 8,
  className = "",
}: {
  model: string;
  size?: number;
  gap?: number;
  className?: string;
}) {
  return (
    <span
      className={`model-name-with-logo ${className}`}
      style={{ display: "inline-flex", alignItems: "center", gap, minWidth: 0 }}
    >
      <ModelBrandIcon model={model} size={size} />
      <span className="truncate" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {model}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  ModelBrandLogo – larger standalone logo (used in rankings etc.)   */
/* ------------------------------------------------------------------ */
export function ModelBrandLogo({
  model,
  size = 28,
}: {
  model: string;
  size?: number;
}) {
  const { shortLabel, bg, fg } = getModelProvider(model);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: fg,
        fontSize: size * 0.42,
        fontWeight: 800,
        flexShrink: 0,
        lineHeight: 1,
        boxShadow: `0 0 0 1px rgba(0,0,0,0.06)`,
      }}
    >
      {shortLabel}
    </span>
  );
}

export { PROVIDERS as MODEL_PROVIDER_MAP };

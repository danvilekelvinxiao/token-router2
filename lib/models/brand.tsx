import React from "react";

// Brand color + logo mapping for model providers
const PROVIDERS: Record<string, { label: string; bg: string; fg: string }> = {
  deepseek: { label: "DS", bg: "#4F46E5", fg: "#fff" },
  anthropic: { label: "C", bg: "#D97706", fg: "#fff" },
  claude: { label: "C", bg: "#D97706", fg: "#fff" },
  openai: { label: "AI", bg: "#10B981", fg: "#fff" },
  gpt: { label: "AI", bg: "#10B981", fg: "#fff" },
  google: { label: "G", bg: "#4285F4", fg: "#fff" },
  gemini: { label: "G", bg: "#4285F4", fg: "#fff" },
  qwen: { label: "Q", bg: "#6366F1", fg: "#fff" },
  alibaba: { label: "Q", bg: "#6366F1", fg: "#fff" },
  kimi: { label: "K", bg: "#8B5CF6", fg: "#fff" },
  moonshot: { label: "K", bg: "#8B5CF6", fg: "#fff" },
  minimax: { label: "M", bg: "#F59E0B", fg: "#fff" },
  meta: { label: "M", bg: "#1877F2", fg: "#fff" },
  mistral: { label: "M", bg: "#F97316", fg: "#fff" },
  xai: { label: "X", bg: "#1D1D1F", fg: "#fff" },
  grok: { label: "X", bg: "#1D1D1F", fg: "#fff" },
  cohere: { label: "C", bg: "#EC4899", fg: "#fff" },
};

const FALLBACK = { label: "O", bg: "#6B7280", fg: "#fff" };

function detectProvider(model: string): string {
  const m = model.toLowerCase();
  for (const key of Object.keys(PROVIDERS)) {
    if (m.includes(key)) return key;
  }
  return "";
}

export function getModelProvider(model: string): { label: string; bg: string; fg: string } {
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
  const { label, bg, fg } = getModelProvider(model);
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
      {label}
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
  const { label, bg, fg } = getModelProvider(model);
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
      {label}
    </span>
  );
}

export { PROVIDERS as MODEL_PROVIDER_MAP };

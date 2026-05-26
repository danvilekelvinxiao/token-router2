const VARIANT_STYLES = {
  deepseek: "brand-deepseek",
  openai: "brand-openai",
  google: "brand-google",
  anthropic: "brand-anthropic",
  qwen: "brand-qwen",
  default: "brand-default",
};

function getInitials(label = "") {
  const clean = String(label).trim();

  if (!clean) {
    return "?";
  }

  if (/deepseek/i.test(clean)) return "DS";
  if (/openai/i.test(clean)) return "OA";
  if (/google/i.test(clean)) return "G";
  if (/anthropic/i.test(clean)) return "A";
  if (/qwen/i.test(clean)) return "Q";

  const parts = clean.split(/[\s/._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return clean.slice(0, 2).toUpperCase();
}

export default function ModelBrandIcon({ brand, label, title }) {
  const text = getInitials(label || brand);
  const variant = (() => {
    const source = `${brand || ""} ${label || ""}`.toLowerCase();
    if (source.includes("deepseek")) return VARIANT_STYLES.deepseek;
    if (source.includes("openai") || source.includes("gpt")) return VARIANT_STYLES.openai;
    if (source.includes("google") || source.includes("gemini")) return VARIANT_STYLES.google;
    if (source.includes("anthropic") || source.includes("claude")) return VARIANT_STYLES.anthropic;
    if (source.includes("qwen") || source.includes("alibaba")) return VARIANT_STYLES.qwen;
    return VARIANT_STYLES.default;
  })();

  return (
    <span className={`model-brand-icon ${variant}`} aria-hidden="true" title={title || label || brand}>
      {text}
    </span>
  );
}

const PREFIX_RE = /^(?:flowapi|openai|anthropic|google|xai|aicards|openrouter|uniapi|aheapi|new-api|newapi|sub2api)[\s/_-]*/i;
const CURATED_PREFIX_RE = /^(?:gpt|claude|gemini|grok|deepseek|qwen|kimi)\b/i;

function normalizeWhitespace(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function removeCommonPrefixes(text = "") {
  return String(text || "")
    .replace(/\bflowapi\b/gi, "")
    .replace(/\bopenai\/?/gi, "")
    .replace(/\banthropic\/?/gi, "")
    .replace(/\bgoogle\/?/gi, "")
    .replace(/\bxai\/?/gi, "")
    .replace(/\baicards\/?/gi, "")
    .replace(/\bnew-api\/?/gi, "")
    .replace(/\bnewapi\/?/gi, "")
    .replace(/\bsub2api\/?/gi, "")
    .replace(/\bopenrouter\/?/gi, "")
    .replace(/\buniapi\/?/gi, "")
    .replace(/\baheapi\/?/gi, "")
    .replace(PREFIX_RE, "");
}

function versionFromDigits(text = "") {
  const digits = String(text || "").trim();
  const hyphenated = digits.replace(/-/g, ".");
  if (/^\d+\.\d+$/.test(hyphenated)) return hyphenated;
  if (/^\d+\.\d+$/.test(digits)) return digits;
  if (/^\d{2}$/.test(digits)) return `${digits[0]}.${digits[1]}`;
  return digits;
}

function formatFamilyName(family = "", version = "", suffix = "") {
  const head = family === "gpt" ? "GPT" : family === "deepseek" ? "DeepSeek" : family[0].toUpperCase() + family.slice(1).toLowerCase();
  const parts = family === "gpt" && version ? [`${head}${version}`] : [head];
  if (family !== "gpt" && version) parts.push(version);
  if (suffix) parts.push(suffix[0].toUpperCase() + suffix.slice(1).toLowerCase());
  return parts.join(" ");
}

function normalizeRawName(text = "") {
  const cleaned = removeCommonPrefixes(text)
    .replace(/[()]/g, " ")
    .replace(/[\/_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lower = cleaned.toLowerCase();

  const gpt = lower.match(/(?:chat)?gpt[- ]?(4o|\d{2}|\d+(?:[.-]\d+)?)(?:[- ]?(mini|pro))?/i);
  if (gpt) {
    const version = gpt[1] === "4o" ? "4o" : versionFromDigits(gpt[1]);
    return formatFamilyName("gpt", version, gpt[2] || "");
  }

  const claude = lower.match(/claude[- ]?(opus|sonnet|haiku)?[- ]?(\d+(?:[.-]\d+)?)/i);
  if (claude) {
    const tier = claude[1] ? `${claude[1][0].toUpperCase()}${claude[1].slice(1).toLowerCase()} ` : "";
    return `Claude ${tier}${versionFromDigits(claude[2].replace(/-/g, "."))}`.replace(/\s+/g, " ").trim();
  }

  const gemini = lower.match(/gemini[- ]?(\d+(?:\.\d+)?)(?:[- ]?(pro|flash))?/i);
  if (gemini) {
    return `Gemini ${versionFromDigits(gemini[1])}${gemini[2] ? ` ${gemini[2][0].toUpperCase()}${gemini[2].slice(1).toLowerCase()}` : ""}`.trim();
  }

  const grok = lower.match(/grok[- ]?(\d+(?:\.\d+)?)/i);
  if (grok) {
    return `Grok ${versionFromDigits(grok[1])}`.trim();
  }

  const deepseek = lower.match(/deepseek[- ]?(chat|reasoner|v\d+)?/i);
  if (deepseek) {
    const suffix = deepseek[1] ? ` ${deepseek[1][0].toUpperCase()}${deepseek[1].slice(1)}` : "";
    return `DeepSeek${suffix}`.trim();
  }

  const qwen = lower.match(/qwen(?:\/)?(?:qwen)?(\d+(?:\.\d+)?)(?:[- ]?([0-9]+[bk]))?/i);
  if (qwen) {
    return `Qwen${versionFromDigits(qwen[1])}${qwen[2] ? `-${qwen[2].toUpperCase()}` : ""}`.trim();
  }

  const kimi = lower.match(/kimi[- ]?(k\d+(?:\.\d+)?)?/i);
  if (kimi) {
    return `Kimi${kimi[1] ? ` ${kimi[1].toUpperCase()}` : ""}`.trim();
  }

  return cleaned
    .replace(/\bchatgpt\b/gi, "ChatGPT")
    .replace(/\bopenai\b/gi, "OpenAI")
    .replace(/\banthropic\b/gi, "Anthropic")
    .replace(/\bgoogle\b/gi, "Google")
    .replace(/\bxai\b/gi, "xAI")
    .replace(/\bmini\b/gi, "mini")
    .replace(/\bpro\b/gi, "Pro")
    .replace(/\bflash\b/gi, "Flash");
}

export function normalizeModelDisplayName(model = {}) {
  const candidates = [model.displayName, model.name, model.modelId, model.publicModelId, model.id]
    .filter(Boolean)
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);

  const source = candidates[0] || "";
  if (!source) return "";

  if (CURATED_PREFIX_RE.test(source) && !/flowapi|aicards|openrouter|uniapi|aheapi|new-api|newapi|sub2api/i.test(source)) {
    return source;
  }

  const cleaned = normalizeRawName(source);
  return normalizeWhitespace(cleaned || source);
}

export function normalizeModelDisplayLabel(model = {}) {
  return normalizeModelDisplayName(model) || normalizeWhitespace(model.displayName || model.name || model.modelId || model.id || "");
}

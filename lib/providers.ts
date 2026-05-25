export interface ProviderInfo {
  id: string;
  name: string;
  label: string;
  logo: string;
  fallbackText: string;
  color: string;
  bgColor: string;
  category: string;
  modelCount: number;
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    label: "OpenAI",
    logo: "/logos/providers/openai.svg",
    fallbackText: "O",
    color: "#fff",
    bgColor: "#10A37F",
    category: "chatgpt",
    modelCount: 6,
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    label: "Claude",
    logo: "/logos/providers/anthropic.svg",
    fallbackText: "A",
    color: "#fff",
    bgColor: "#D97757",
    category: "claude",
    modelCount: 3,
  },
  google: {
    id: "google",
    name: "Google",
    label: "Gemini",
    logo: "/logos/providers/google.svg",
    fallbackText: "G",
    color: "#fff",
    bgColor: "#4285F4",
    category: "gemini",
    modelCount: 5,
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    label: "DeepSeek",
    logo: "/logos/providers/deepseek.svg",
    fallbackText: "D",
    color: "#fff",
    bgColor: "#4F46E5",
    category: "deepseek",
    modelCount: 3,
  },
  uniapi: {
    id: "uniapi",
    name: "UniAPI",
    label: "UniAPI",
    logo: "/logos/providers/uniapi.svg",
    fallbackText: "U",
    color: "#fff",
    bgColor: "#6366F1",
    category: "aggregator",
    modelCount: 8,
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    label: "OpenRouter",
    logo: "/logos/providers/openrouter.svg",
    fallbackText: "R",
    color: "#fff",
    bgColor: "#111827",
    category: "aggregator",
    modelCount: 100,
  },
  codex: {
    id: "codex",
    name: "Codex",
    label: "Codex",
    logo: "/logos/providers/codex.svg",
    fallbackText: "C",
    color: "#fff",
    bgColor: "#111827",
    category: "codex",
    modelCount: 3,
  },
  qwen: {
    id: "qwen",
    name: "Qwen",
    label: "Qwen",
    logo: "/logos/providers/qwen.svg",
    fallbackText: "Q",
    color: "#fff",
    bgColor: "#6366F1",
    category: "qwen",
    modelCount: 4,
  },
  moonshot: {
    id: "moonshot",
    name: "Moonshot",
    label: "Kimi",
    logo: "/logos/providers/moonshot.svg",
    fallbackText: "K",
    color: "#fff",
    bgColor: "#8B5CF6",
    category: "moonshot",
    modelCount: 2,
  },
  mistral: {
    id: "mistral",
    name: "Mistral",
    label: "Mistral",
    logo: "/logos/providers/mistral.svg",
    fallbackText: "M",
    color: "#fff",
    bgColor: "#F97316",
    category: "mistral",
    modelCount: 5,
  },
  grok: {
    id: "grok",
    name: "Grok",
    label: "Grok",
    logo: "/logos/providers/grok.svg",
    fallbackText: "X",
    color: "#fff",
    bgColor: "#1D1D1F",
    category: "grok",
    modelCount: 2,
  },
  meta: {
    id: "meta",
    name: "Meta",
    label: "Llama",
    logo: "/logos/providers/meta.svg",
    fallbackText: "M",
    color: "#fff",
    bgColor: "#1877F2",
    category: "meta",
    modelCount: 6,
  },
  cohere: {
    id: "cohere",
    name: "Cohere",
    label: "Cohere",
    logo: "/logos/providers/cohere.svg",
    fallbackText: "C",
    color: "#fff",
    bgColor: "#EC4899",
    category: "cohere",
    modelCount: 2,
  },
  minimax: {
    id: "minimax",
    name: "MiniMax",
    label: "MiniMax",
    logo: "/logos/providers/minimax.svg",
    fallbackText: "M",
    color: "#fff",
    bgColor: "#F59E0B",
    category: "minimax",
    modelCount: 2,
  },
  doubao: {
    id: "doubao",
    name: "Doubao",
    label: "豆包",
    logo: "/logos/providers/doubao.svg",
    fallbackText: "豆",
    color: "#fff",
    bgColor: "#22C55E",
    category: "doubao",
    modelCount: 3,
  },
  // Fallback for unknown providers
  unknown: {
    id: "unknown",
    name: "其他供应商",
    label: "其他",
    logo: "",
    fallbackText: "?",
    color: "#fff",
    bgColor: "#6B7280",
    category: "other",
    modelCount: 0,
  },
};

export function getProvider(id?: string): ProviderInfo {
  if (!id) return PROVIDERS.unknown;
  return PROVIDERS[id] || PROVIDERS.unknown;
}

export function detectProviderFromModel(model: string, provider?: string): string {
  const m = `${provider || ""} ${model || ""}`.toLowerCase();
  if (m.includes("openai") || m.includes("chatgpt") || m.includes("gpt")) return "openai";
  if (m.includes("anthropic") || m.includes("claude")) return "anthropic";
  if (m.includes("google") || m.includes("gemini")) return "google";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("uniapi")) return "uniapi";
  if (m.includes("openrouter")) return "openrouter";
  if (m.includes("codex")) return "codex";
  if (m.includes("qwen") || m.includes("alibaba")) return "qwen";
  if (m.includes("moonshot") || m.includes("kimi")) return "moonshot";
  if (m.includes("mistral")) return "mistral";
  if (m.includes("grok") || m.includes("xai")) return "grok";
  if (m.includes("meta") || m.includes("llama")) return "meta";
  if (m.includes("cohere")) return "cohere";
  if (m.includes("minimax")) return "minimax";
  if (m.includes("doubao") || m.includes("豆包")) return "doubao";
  return "unknown";
}

export function getProvidersByCategory(category: string): ProviderInfo[] {
  return Object.values(PROVIDERS).filter((p) => p.category === category);
}

export const FEATURED_PROVIDER_IDS = [
  "openai", "anthropic", "google", "deepseek", "uniapi", "openrouter",
  "codex", "qwen", "moonshot", "mistral", "grok", "meta",
];

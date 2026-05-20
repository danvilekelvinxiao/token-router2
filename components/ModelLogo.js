import Anthropic from "@lobehub/icons/es/Anthropic";
import Cohere from "@lobehub/icons/es/Cohere";
import DeepSeek from "@lobehub/icons/es/DeepSeek";
import Gemini from "@lobehub/icons/es/Gemini";
import Grok from "@lobehub/icons/es/Grok";
import Meta from "@lobehub/icons/es/Meta";
import Mistral from "@lobehub/icons/es/Mistral";
import Moonshot from "@lobehub/icons/es/Moonshot";
import OpenAI from "@lobehub/icons/es/OpenAI";
import Qwen from "@lobehub/icons/es/Qwen";

const PROVIDER_LOGOS = {
  openai: { label: "OpenAI", Logo: OpenAI },
  anthropic: { label: "Anthropic", Logo: Anthropic },
  google: { label: "Google Gemini", Logo: Gemini },
  deepseek: { label: "DeepSeek", Logo: DeepSeek },
  alibaba: { label: "Qwen", Logo: Qwen },
  moonshot: { label: "Moonshot Kimi", Logo: Moonshot },
  meta: { label: "Meta", Logo: Meta },
  mistral: { label: "Mistral AI", Logo: Mistral },
  cohere: { label: "Cohere", Logo: Cohere },
  xai: { label: "xAI Grok", Logo: Grok },
};

export function getModelProvider(model = "", provider = "") {
  const name = `${provider} ${model}`.toLowerCase();
  if (name.includes("openai") || name.includes("gpt")) return "openai";
  if (name.includes("anthropic") || name.includes("claude")) return "anthropic";
  if (name.includes("google") || name.includes("gemini")) return "google";
  if (name.includes("deepseek")) return "deepseek";
  if (name.includes("qwen") || name.includes("alibaba")) return "alibaba";
  if (name.includes("moonshot") || name.includes("kimi")) return "moonshot";
  if (name.includes("meta") || name.includes("llama")) return "meta";
  if (name.includes("mistral")) return "mistral";
  if (name.includes("cohere")) return "cohere";
  if (name.includes("x-ai") || name.includes("xai") || name.includes("grok")) return "xai";
  return "default";
}

export function getModelProviderLabel(model = "", provider = "") {
  const key = getModelProvider(model, provider);
  return PROVIDER_LOGOS[key]?.label || provider || "通用模型";
}

function DefaultModelIcon({ size }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none">
      <rect x="4" y="4" width="16" height="16" rx="5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M8.5 9.5h7M8.5 14.5h4.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M17.5 13.8l.42 1.02 1.08.32-1.08.32-.42 1.04-.42-1.04-1.08-.32 1.08-.32.42-1.02Z" fill="currentColor" />
    </svg>
  );
}

export default function ModelLogo({ model = "", provider = "", size = 24, className = "" }) {
  const key = getModelProvider(model, provider);
  const meta = PROVIDER_LOGOS[key];
  const Logo = meta?.Logo;
  const BrandLogo = Logo?.Color || Logo;
  const label = meta?.label || provider || model || "通用模型";
  const iconSize = Math.max(16, Math.round(size * 0.72));

  return (
    <span
      aria-label={`${label} Logo`}
      className={`model-logo model-logo-${key}${className ? ` ${className}` : ""}`}
      role="img"
      style={{ "--model-logo-size": `${size}px` }}
      title={label}
    >
      {BrandLogo ? <BrandLogo size={iconSize} /> : <DefaultModelIcon size={iconSize} />}
    </span>
  );
}

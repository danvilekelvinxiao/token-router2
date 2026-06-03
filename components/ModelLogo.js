import Anthropic from "@lobehub/icons/es/Anthropic";
import Cohere from "@lobehub/icons/es/Cohere";
import DeepSeek from "@lobehub/icons/es/DeepSeek";
import Gemini from "@lobehub/icons/es/Gemini";
import Grok from "@lobehub/icons/es/Grok";
import ByteDance from "@lobehub/icons/es/ByteDance";
import Doubao from "@lobehub/icons/es/Doubao";
import Flux from "@lobehub/icons/es/Flux";
import Kling from "@lobehub/icons/es/Kling";
import Meta from "@lobehub/icons/es/Meta";
import Midjourney from "@lobehub/icons/es/Midjourney";
import Mistral from "@lobehub/icons/es/Mistral";
import Moonshot from "@lobehub/icons/es/Moonshot";
import OpenAI from "@lobehub/icons/es/OpenAI";
import Qwen from "@lobehub/icons/es/Qwen";
import Stability from "@lobehub/icons/es/Stability";
import { getModelBrand, getModelBrandInitial, getModelBrandLabel } from "@/lib/models/brand";
import { getPublicModelProvider } from "@/lib/public-model-provider";

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
  flux: { label: "Black Forest Labs Flux", Logo: Flux },
  stability: { label: "Stability AI", Logo: Stability },
  midjourney: { label: "Midjourney", Logo: Midjourney },
  bytedance: { label: "ByteDance Seedream", Logo: ByteDance },
  doubao: { label: "Doubao", Logo: Doubao },
  kling: { label: "Kling", Logo: Kling },
};

export function getModelProvider(model = "", provider = "") {
  return getModelBrand(model, provider);
}

export function getModelProviderLabel(model = "", provider = "") {
  return getPublicModelProvider({ displayName: model, provider });
}

export default function ModelLogo({ model = "", provider = "", size = 24, className = "" }) {
  const key = getModelProvider(model, provider);
  const meta = PROVIDER_LOGOS[key];
  const Logo = meta?.Logo;
  const BrandLogo = Logo?.Color || Logo;
  const label = meta?.label || getModelBrandLabel(model, provider);
  const initial = getModelBrandInitial(model, provider);
  const iconSize = Math.max(16, Math.round(size * 0.72));

  return (
    <span
      aria-label={`${label} Logo`}
      className={`model-logo model-logo-${key}${className ? ` ${className}` : ""}`}
      role="img"
      style={{ "--model-logo-size": `${size}px` }}
      title={label}
    >
      {BrandLogo ? <BrandLogo size={iconSize} /> : <span className="model-logo-fallback">{initial}</span>}
    </span>
  );
}

export function ModelNameWithLogo({ model = "", provider = "", size = 24, className = "" }) {
  return (
    <span className={`model-name-cell${className ? ` ${className}` : ""}`}>
      <ModelLogo model={model} provider={provider} size={size} />
      <span className="model-text">
        <strong className="model-name">{model || "Unknown Model"}</strong>
        <small className="model-provider">{getModelProviderLabel(model, provider)}</small>
      </span>
    </span>
  );
}

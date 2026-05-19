/* ===================================================================
   ModelLogo — auto-detect provider from model name, render SVG icon
   =================================================================== */

const PROVIDERS = {
  openai: { name: "OpenAI", color: "#10a37f", bg: "rgba(16,163,127,0.12)" },
  anthropic: { name: "Anthropic", color: "#d97706", bg: "rgba(217,119,6,0.12)" },
  google: { name: "Google", color: "#4285f4", bg: "rgba(66,133,244,0.12)" },
  deepseek: { name: "DeepSeek", color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  alibaba: { name: "Qwen", color: "#ff6a00", bg: "rgba(255,106,0,0.12)" },
  moonshot: { name: "Kimi", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  meta: { name: "Meta", color: "#0668e1", bg: "rgba(6,104,225,0.12)" },
  mistral: { name: "Mistral", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  cohere: { name: "Cohere", color: "#39594d", bg: "rgba(57,89,77,0.12)" },
  xai: { name: "xAI", color: "#e5e5e5", bg: "rgba(229,229,229,0.12)" },
  default: { name: "AI", color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

function IconOpenAI() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21.5 11.5c-.5-2-2.5-3.5-4.5-3.5-1.5 0-3 .7-3.9 1.8l-1.1-.6c.8-1.4.9-3 .3-4.4C11.1 2.2 8.6 1 6 1 3.3 1 .9 2.7.2 5.3c-.6 2.6.6 5.3 2.8 6.6 1.4.8 3.1.9 4.6.4l1.2.7c-.9 1.4-1 3.2-.2 4.7 1.3 2.5 4 3.7 6.7 3 2.6-.6 4.6-2.8 5-5.5.5-2.4-.8-4.7-2.8-5.7zm-5.3-1.7l1.4.8c.8.4 1.7.5 2.6.2 1.5-.6 2.2-2.2 1.6-3.7-.6-1.3-2.2-1.9-3.5-1.3-.8.4-1.4 1.1-1.6 2l-.5 2zm-4.7 8.1c-.9.5-2 .5-2.9 0-1.5-.8-2.1-2.6-1.3-4.1.8-1.5 2.6-2.1 4.1-1.3.9.5 1.5 1.4 1.7 2.4l.5 2-2.1 1zM7 5.2c.5-.9 1.4-1.5 2.4-1.7l2-.5-.6 1.1c-.4.8-.6 1.7-.4 2.6-.9-.3-2-.2-2.9.1-1.5.8-2 2.6-1.3 4.1.1.3.3.5.5.7l-1.1-.6C4.1 10 3.7 7.3 5 5.3z"/></svg>; }
function IconAnthropic() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 2l4.5 12h-3.5l-1-3h-5l-1 3H7L11.5 2h5zm-1.2 6.5L13.5 4l-1.8 4.5h3.6zM3 20h7v-2H5.5L12 7h-2.5L3 18v2z"/></svg>; }
function IconGoogle() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6a6 6 0 00-5.2 9l-1.7 1.7A8 8 0 0112 4a8 8 0 017.1 4.1L16.5 10A6 6 0 0012 6z" fill="var(--dash-bg)"/></svg>; }
function IconDeepSeek() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="3" rx="1"/><rect x="13" y="9" width="8" height="3" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1.5"/><rect x="13" y="14" width="8" height="6" rx="1"/></svg>; }
function IconAlibaba() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7" r="3"/><ellipse cx="8" cy="17" rx="3" ry="3"/><ellipse cx="16" cy="17" rx="3" ry="3"/></svg>; }
function IconMoonshot() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="var(--dash-bg)"/></svg>; }
function IconMeta() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-4-5 4 2 3-4 4 5-4-2-3 4z"/></svg>; }
function IconDefault() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><path d="M8 15c1 2 3 3 4 3s3-1 4-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }

const ICON_MAP = {
  openai: IconOpenAI, anthropic: IconAnthropic, google: IconGoogle,
  deepseek: IconDeepSeek, alibaba: IconAlibaba, moonshot: IconMoonshot,
  meta: IconMeta, mistral: IconAlibaba, cohere: IconDefault, xai: IconDefault,
  default: IconDefault,
};

export function getModelProvider(model = "") {
  const name = model.toLowerCase();
  if (name.includes("openai") || name.includes("gpt")) return "openai";
  if (name.includes("anthropic") || name.includes("claude")) return "anthropic";
  if (name.includes("google") || name.includes("gemini")) return "google";
  if (name.includes("deepseek")) return "deepseek";
  if (name.includes("qwen") || name.includes("alibaba")) return "alibaba";
  if (name.includes("moonshot") || name.includes("kimi")) return "moonshot";
  if (name.includes("meta") || name.includes("llama")) return "meta";
  if (name.includes("mistral")) return "mistral";
  if (name.includes("cohere")) return "cohere";
  if (name.includes("x-ai") || name.includes("grok")) return "xai";
  return "default";
}

export default function ModelLogo({ model = "", size = 24 }) {
  const key = getModelProvider(model);
  const info = PROVIDERS[key] || PROVIDERS.default;
  const Icon = ICON_MAP[key] || ICON_MAP.default;

  return (
    <span
      title={info.name}
      style={{
        width: size, height: size, borderRadius: 6, flex: "none",
        background: info.bg, color: info.color,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.55, fontWeight: 800, lineHeight: 1,
      }}
    >
      <Icon />
    </span>
  );
}

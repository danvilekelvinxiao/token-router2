export const ccSwitchModels = [
  "deepseek/deepseek-chat",
  "gpt-4o-mini",
  "gpt-4o",
  "claude-3.5-sonnet",
  "claude-opus-4-7",
  "gemini-2.5-pro",
  "grok-4",
];

function encodeUtf8Base64(value) {
  const bytes = new TextEncoder().encode(value);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary);
}

export function buildCcSwitchUrl({ apiKey, baseUrl, model, name = "FlowAPI", enabled = true }) {
  const params = new URLSearchParams({
    resource: "provider",
    app: "codex",
    name,
    endpoint: baseUrl,
    apiKey,
    model,
  });

  if (enabled) params.append("enabled", "true");

  return `ccswitch://v1/import?${params.toString()}`;
}

export function buildCcSwitchCodexConfig({ apiKey, baseUrl, model }) {
  return {
    auth: {
      auth_mode: "apikey",
      OPENAI_API_KEY: apiKey,
    },
    config: `[model_providers.openai]\nname = "FlowAPI"\nbase_url = "${baseUrl}"\nwire_api = "chat"\n\n[general]\nmodel_provider = "openai"\nmodel = "${model}"`,
  };
}

export function buildCcSwitchConfigUrl({ apiKey, baseUrl, model, name = "FlowAPI", enabled = true }) {
  const config = buildCcSwitchCodexConfig({ apiKey, baseUrl, model });
  const params = new URLSearchParams({
    resource: "provider",
    app: "codex",
    name,
    configFormat: "json",
    config: encodeUtf8Base64(JSON.stringify(config)),
  });

  if (enabled) params.append("enabled", "true");

  return `ccswitch://v1/import?${params.toString()}`;
}

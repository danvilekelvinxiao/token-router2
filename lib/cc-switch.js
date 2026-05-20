export const ccSwitchModels = [
  "deepseek-chat",
  "deepseek-reasoner",
  "gpt-4o-mini",
  "gpt-4o",
  "claude-3.5-sonnet",
  "gemini-2.5-flash",
];

function encodeUtf8Base64(value) {
  const bytes = new TextEncoder().encode(value);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary);
}

/**
 * Build a CC-Switch import URL for a custom provider (FlowAPI).
 * Uses the "provider" resource to avoid the OpenAI preset tab.
 */
export function buildCcSwitchUrl({ apiKey, baseUrl, model, name = "FlowAPI", enabled = true }) {
  const params = new URLSearchParams({
    resource: "provider",
    app: "codex",
    providerId: "flowapi",
    name,
    endpoint: baseUrl,
    baseUrl,
    apiKey,
    model,
    wireApi: "chat",
    protocol: "openai-chat-completions",
  });

  if (enabled) params.append("enabled", "true");

  return `ccswitch://v1/import?${params.toString()}`;
}

/**
 * Build a Codex-compatible config for manual import.
 * Uses custom provider "flowapi" instead of "openai" to avoid Responses API.
 */
export function buildCcSwitchCodexConfig({ apiKey, baseUrl, model }) {
  return {
    auth: {
      auth_mode: "apikey",
      OPENAI_API_KEY: apiKey,
    },
    config: [
      `[model_providers.flowapi]`,
      `name = "FlowAPI"`,
      `base_url = "${baseUrl}"`,
      `wire_api = "chat"`,
      ``,
      `[general]`,
      `model_provider = "flowapi"`,
      `model = "${model}"`,
    ].join("\n"),
  };
}

export function buildCcSwitchConfigUrl({ apiKey, baseUrl, model, name = "FlowAPI", enabled = true }) {
  const config = buildCcSwitchCodexConfig({ apiKey, baseUrl, model });
  const params = new URLSearchParams({
    resource: "provider",
    app: "codex",
    providerId: "flowapi",
    name,
    configFormat: "json",
    config: encodeUtf8Base64(JSON.stringify(config)),
  });

  if (enabled) params.append("enabled", "true");

  return `ccswitch://v1/import?${params.toString()}`;
}

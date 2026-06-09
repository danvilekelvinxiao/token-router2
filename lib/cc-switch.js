import { normalizePublicApiBaseUrl } from "./public-api.js";

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
export function buildCcSwitchUrl({ apiKey, baseUrl, model, name = "FlowAPI", displayName, enabled = true }) {
  const publicBaseUrl = normalizePublicApiBaseUrl(baseUrl);
  const params = new URLSearchParams({
    resource: "provider",
    app: "codex",
    providerId: "flowapi",
    name,
    displayName: displayName || model || "FlowAPI",
    homepage: "https://flowapi.fun",
    endpoint: publicBaseUrl,
    baseUrl: publicBaseUrl,
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
  const publicBaseUrl = normalizePublicApiBaseUrl(baseUrl);
  return {
    auth: {
      OPENAI_API_KEY: apiKey,
    },
    config: [
      `[model_providers.flowapi]`,
      `name = "FlowAPI"`,
      `base_url = "${publicBaseUrl}"`,
      `wire_api = "chat"`,
      ``,
      `[general]`,
      `model_provider = "flowapi"`,
      `model = "${model}"`,
      `model_reasoning_effort = "high"`,
      `disable_response_storage = true`,
    ].join("\n"),
  };
}

export function buildCcSwitchConfigUrl({ apiKey, baseUrl, model, name = "FlowAPI", displayName, enabled = true }) {
  const publicBaseUrl = normalizePublicApiBaseUrl(baseUrl);
  const config = buildCcSwitchCodexConfig({ apiKey, baseUrl: publicBaseUrl, model });
  const params = new URLSearchParams({
    resource: "provider",
    app: "codex",
    providerId: "flowapi",
    name,
    displayName: displayName || model || "FlowAPI",
    homepage: "https://flowapi.fun",
    baseUrl: publicBaseUrl,
    model,
    wireApi: "chat",
    protocol: "openai-chat-completions",
    configFormat: "json",
    config: encodeUtf8Base64(JSON.stringify(config)),
  });

  if (enabled) params.append("enabled", "true");

  return `ccswitch://v1/import?${params.toString()}`;
}

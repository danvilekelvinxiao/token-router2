import { normalizePublicApiBaseUrl } from "./public-api.js";
import { getPublicModelDisplayName, getPublicModelRequestId } from "./models.js";

export const ccSwitchModels = [
  "chatgpt5.5",
  "gpt-5.5-pro",
  "gpt-5.5",
  "gpt-5.4-pro",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-4o-mini",
  "deepseek-chat",
  "deepseek-reasoner",
  "gpt-4o",
  "claude-3.5-sonnet",
  "gemini-2.5-flash",
];

function encodeUtf8Base64(value) {
  const bytes = new TextEncoder().encode(value);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary);
}

function getHomepageFromPublicBaseUrl(baseUrl = "") {
  return String(baseUrl || "").replace(/\/v1\/?$/, "").replace(/\/+$/, "");
}

/**
 * Build a CC-Switch import URL for a custom provider (FlowAPI).
 * Uses the "provider" resource to avoid the OpenAI preset tab.
 */
export function buildCcSwitchUrl({ apiKey, baseUrl, model, name = "FlowAPI", displayName, enabled = true }) {
  const publicBaseUrl = normalizePublicApiBaseUrl(baseUrl);
  const homepage = getHomepageFromPublicBaseUrl(publicBaseUrl);
  const requestModel = getPublicModelRequestId(model);
  const params = new URLSearchParams({
    resource: "provider",
    app: "codex",
    providerId: "flowapi",
    name,
    displayName: displayName || getPublicModelDisplayName(requestModel, requestModel),
    homepage,
    endpoint: publicBaseUrl,
    baseUrl: publicBaseUrl,
    apiKey,
    model: requestModel,
    wireApi: "responses",
    protocol: "openai-responses",
  });

  if (enabled) params.append("enabled", "true");

  return `ccswitch://v1/import?${params.toString()}`;
}

/**
 * Build a Codex-compatible config for manual import.
 * Uses Responses API mode so Codex can expose local terminal/browser/file tools.
 */
export function buildCcSwitchCodexConfig({ apiKey, baseUrl, model }) {
  const publicBaseUrl = normalizePublicApiBaseUrl(baseUrl);
  const requestModel = getPublicModelRequestId(model);
  return {
    auth: {
      OPENAI_API_KEY: apiKey,
    },
    config: [
      `[model_providers.flowapi]`,
      `name = "FlowAPI"`,
      `base_url = "${publicBaseUrl}"`,
      `env_key = "OPENAI_API_KEY"`,
      `wire_api = "responses"`,
      ``,
      `[general]`,
      `model_provider = "flowapi"`,
      `model = "${requestModel}"`,
      `model_reasoning_effort = "high"`,
      `disable_response_storage = true`,
    ].join("\n"),
  };
}

export function buildCcSwitchConfigUrl({ apiKey, baseUrl, model, name = "FlowAPI", displayName, enabled = true }) {
  const publicBaseUrl = normalizePublicApiBaseUrl(baseUrl);
  const homepage = getHomepageFromPublicBaseUrl(publicBaseUrl);
  const requestModel = getPublicModelRequestId(model);
  const config = buildCcSwitchCodexConfig({ apiKey, baseUrl: publicBaseUrl, model: requestModel });
  const params = new URLSearchParams({
    resource: "provider",
    app: "codex",
    providerId: "flowapi",
    name,
    displayName: displayName || getPublicModelDisplayName(requestModel, requestModel),
    homepage,
    baseUrl: publicBaseUrl,
    model: requestModel,
    wireApi: "responses",
    protocol: "openai-responses",
    configFormat: "json",
    config: encodeUtf8Base64(JSON.stringify(config)),
  });

  if (enabled) params.append("enabled", "true");

  return `ccswitch://v1/import?${params.toString()}`;
}

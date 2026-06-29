#!/usr/bin/env node

import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function loadPublicApi() {
  const file = path.join(repoRoot, "lib/public-api.js");
  const source = fs.readFileSync(file, "utf8")
    .replace(/export function /g, "function ")
    + "\nmodule.exports = { normalizePublicApiBaseUrl, getPublicApiBaseUrl };\n";
  const context = {
    module: { exports: {} },
    process: { env: {} },
  };
  vm.runInNewContext(source, context, { filename: file });
  return { exports: context.module.exports, context };
}

function loadCcSwitch(publicApi) {
  const file = path.join(repoRoot, "lib/cc-switch.js");
  const source = fs.readFileSync(file, "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/export const ccSwitchModels = /, "const ccSwitchModels = ")
    .replace(/export function /g, "function ")
    + "\nmodule.exports = { ccSwitchModels, buildCcSwitchUrl, buildCcSwitchCodexConfig, buildCcSwitchConfigUrl };\n";
  const context = {
    module: { exports: {} },
    TextEncoder,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    URLSearchParams,
    normalizePublicApiBaseUrl: publicApi.normalizePublicApiBaseUrl,
    getPublicModelRequestId: (value) => String(value || ""),
    getPublicModelDisplayName: (value) => String(value || ""),
  };
  vm.runInNewContext(source, context, { filename: file });
  return context.module.exports;
}

const { exports: publicApi, context: publicApiContext } = loadPublicApi();

assert(
  publicApi.normalizePublicApiBaseUrl("https://pincc.flowapi.fun") === "https://pincc.flowapi.fun/v1",
  "pincc.flowapi.fun must normalize to https://pincc.flowapi.fun/v1"
);
assert(
  publicApi.normalizePublicApiBaseUrl("https://pincc.flowapi.fun/v1") === "https://pincc.flowapi.fun/v1",
  "pincc.flowapi.fun/v1 must remain unchanged"
);
assert(
  publicApi.normalizePublicApiBaseUrl("https://api.xiaoleai.team/v1") === "https://pincc.flowapi.fun/v1",
  "api.xiaoleai.team must never be exported as the public API base URL"
);
assert(
  publicApi.normalizePublicApiBaseUrl("https://sub2api.example.com/v1") === "https://pincc.flowapi.fun/v1",
  "sub2api upstreams must never be exported as the public API base URL"
);
publicApiContext.process.env.PUBLIC_API_BASE_URL = "https://pincc.flowapi.fun";
assert(
  publicApi.getPublicApiBaseUrl() === "https://pincc.flowapi.fun/v1",
  "PUBLIC_API_BASE_URL should be accepted and normalized with /v1"
);

const ccSwitch = loadCcSwitch(publicApi);
const codexConfig = ccSwitch.buildCcSwitchCodexConfig({
  apiKey: "sk-test-flowapi",
  baseUrl: "https://pincc.flowapi.fun",
  model: "gpt-5.5",
});
assert(
  codexConfig.config.includes('base_url = "https://pincc.flowapi.fun/v1"'),
  "Codex/CC-Switch config must include base_url with /v1"
);
assert(
  codexConfig.config.includes('model = "gpt-5.5"'),
  "Codex/CC-Switch config must keep model gpt-5.5"
);
assert(
  codexConfig.config.includes('env_key = "OPENAI_API_KEY"'),
  "Codex/CC-Switch config must read the API key from OPENAI_API_KEY"
);
assert(
  codexConfig.config.includes('wire_api = "responses"'),
  "Codex/CC-Switch config must use Responses API mode so local tools can be exposed"
);
assert(
  !codexConfig.config.includes('wire_api = "chat"'),
  "Codex/CC-Switch config must not force Chat mode for Codex"
);
assert(
  !codexConfig.config.includes("api.xiaoleai.team") && !codexConfig.config.includes("sub2api"),
  "Codex/CC-Switch config must not expose internal upstream domains"
);

const importUrl = ccSwitch.buildCcSwitchConfigUrl({
  apiKey: "sk-test-flowapi",
  baseUrl: "https://pincc.flowapi.fun",
  model: "gpt-5.5",
});
const parsed = new URL(importUrl);
assert(parsed.searchParams.get("baseUrl") === "https://pincc.flowapi.fun/v1", "CC-Switch deeplink baseUrl must include /v1");
assert(parsed.searchParams.get("homepage") === "https://pincc.flowapi.fun", "CC-Switch deeplink homepage should match the customer-facing site");
assert(parsed.searchParams.get("model") === "gpt-5.5", "CC-Switch deeplink model must be gpt-5.5");
assert(parsed.searchParams.get("wireApi") === "responses", "CC-Switch deeplink must request Responses API mode for Codex tools");
assert(parsed.searchParams.get("protocol") === "openai-responses", "CC-Switch deeplink protocol must be openai-responses");
const embeddedConfig = JSON.parse(Buffer.from(parsed.searchParams.get("config") || "", "base64").toString("utf8"));
assert(embeddedConfig.config.includes('wire_api = "responses"'), "Embedded CC-Switch config must use Responses API mode");
assert(!embeddedConfig.config.includes('wire_api = "chat"'), "Embedded CC-Switch config must not use Chat mode");

if (failures.length) {
  console.error("Public API config checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Public API config checks passed");

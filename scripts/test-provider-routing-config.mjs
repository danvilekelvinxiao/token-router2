#!/usr/bin/env node

process.env.FLOWAPI_REQUIRE_DATABASE = "false";
process.env.DATABASE_URL = "";
process.env.POSTGRES_URL = "";
process.env.PROVIDER_SECRET_KEY = process.env.PROVIDER_SECRET_KEY || "test-provider-secret-key";

const {
  saveProvider,
  saveModelMapping,
  getProviderRouteCandidates,
  listProviders,
  listProviderUpstreamConfigs,
} = await import("../lib/provider-store.js");

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

await saveProvider({
  id: "sub2api-pool-1",
  name: "sub2api-pool-1",
  type: "sub2api",
  baseUrl: "https://sub2api.example.com/v1",
  apiKey: "sk-sub2api-secret-1234567890",
  enabled: true,
  priority: 100,
  weight: 2,
  supportsStream: true,
  supportsResponsesApi: true,
  supportsChatCompletionsApi: true,
  models: ["chatgpt5.5"],
});

await saveProvider({
  id: "upstream-new-api-1",
  name: "upstream-new-api-1",
  type: "new-api",
  baseUrl: "https://new-api.example.com/v1",
  apiKey: "sk-newapi-secret-0987654321",
  enabled: true,
  priority: 80,
  weight: 1,
  supportsStream: true,
  supportsResponsesApi: false,
  supportsChatCompletionsApi: true,
  models: ["chatgpt5.5"],
});

await saveModelMapping({
  id: "map-gpt55-sub2api",
  publicModelName: "gpt-5.5",
  upstreamProviderId: "sub2api-pool-1",
  upstreamModelName: "chatgpt5.5",
  enabled: true,
  inputPricePer1M: 16,
  outputPricePer1M: 64,
});

await saveModelMapping({
  id: "map-gpt55-newapi",
  publicModelName: "gpt-5.5",
  upstreamProviderId: "upstream-new-api-1",
  upstreamModelName: "chatgpt5.5-newapi",
  enabled: true,
  inputPricePer1M: 16,
  outputPricePer1M: 64,
});

const clientProviders = await listProviders();
assert(clientProviders.length === 2, "should list two providers");
assert(!JSON.stringify(clientProviders).includes("sk-sub2api-secret"), "client provider list must not expose sub2api key");
assert(!JSON.stringify(clientProviders).includes("sk-newapi-secret"), "client provider list must not expose new-api key");
assert(clientProviders.some((item) => item.apiKeyPreview.includes("...")), "client provider list should include only masked API key preview");

const upstreamConfigs = await listProviderUpstreamConfigs();
assert(upstreamConfigs.length === 2, "runtime upstream configs should include two enabled providers");
assert(upstreamConfigs.some((item) => item.apiKey === "sk-sub2api-secret-1234567890"), "runtime server configs should decrypt sub2api key server-side");

const candidates = await getProviderRouteCandidates("gpt-5.5");
assert(candidates.length >= 3, "weighted candidates should expand by provider weight");
assert(candidates[0].providerId === "sub2api-pool-1", "higher priority sub2api should be first candidate");
assert(candidates[0].actualModelId === "chatgpt5.5", "candidate should map to upstream model name");
assert(candidates.every((candidate) => candidate.apiKey && candidate.upstreamUrl.includes("/v1/chat/completions")), "candidates should include server-side key and chat completions URL");

if (failures.length) {
  console.error("Provider routing config tests failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Provider routing config tests passed");

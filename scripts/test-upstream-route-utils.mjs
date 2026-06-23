import assert from "assert/strict";
import { DEFAULT_ROUTE_POLICY } from "../lib/route-policy-constants.js";
import { normalizeUpstreamIdentity, orderUpstreamCandidates, shouldRetryUpstreamStatus } from "../lib/upstream-route-utils.mjs";

const sameKeyA = {
  name: "new-api",
  upstreamUrl: "https://relay.example.com/v1/chat/completions",
  apiKey: "sk-test-1",
};
const sameKeyB = {
  name: "backup",
  upstreamUrl: "https://relay.example.com/v1/chat/completions",
  apiKey: "sk-test-1",
};
const differentKey = {
  name: "openrouter",
  upstreamUrl: "https://relay.example.com/v1/chat/completions",
  apiKey: "sk-test-2",
};

assert.equal(normalizeUpstreamIdentity(sameKeyA), "https://relay.example.com|sk-test-1");
assert.equal(normalizeUpstreamIdentity({ upstreamUrl: "https://relay.example.com/v1/models", apiKey: "sk-test-1" }), "https://relay.example.com|sk-test-1");

const ordered = orderUpstreamCandidates({
  upstream: sameKeyA,
  fallbackChain: [sameKeyA, sameKeyB, differentKey],
}, []);
assert.equal(ordered.length, 2);
assert.equal(ordered[0].name, "new-api");
assert.equal(ordered[1].name, "openrouter");

const orderedAfter429 = orderUpstreamCandidates({
  upstream: sameKeyA,
  fallbackChain: [sameKeyA, sameKeyB, differentKey, sameKeyA],
}, []);
assert.equal(orderedAfter429.length, 2);
assert.equal(orderedAfter429[0].name, "new-api");
assert.equal(orderedAfter429[1].name, "openrouter");

assert.equal(shouldRetryUpstreamStatus(429), false);
assert.equal(shouldRetryUpstreamStatus(429, { retry429: true }), true);
assert.equal(shouldRetryUpstreamStatus(503), true);
assert.equal(shouldRetryUpstreamStatus(200), false);
assert.deepEqual(DEFAULT_ROUTE_POLICY.fallbackOrder.slice(0, 4), ["sub2api", "newApi", "backup", "openai"]);
assert.equal(DEFAULT_ROUTE_POLICY.tierLabels.openai, "OpenAI");

console.log(JSON.stringify({
  ok: true,
  orderedNames: ordered.map((item) => item.name),
  orderedAfter429Names: orderedAfter429.map((item) => item.name),
  routePolicyOrder: DEFAULT_ROUTE_POLICY.fallbackOrder,
  retryPolicy: {
    default429: shouldRetryUpstreamStatus(429),
    optIn429: shouldRetryUpstreamStatus(429, { retry429: true }),
    retry503: shouldRetryUpstreamStatus(503),
  },
  identities: ordered.map((item) => normalizeUpstreamIdentity(item)),
}));

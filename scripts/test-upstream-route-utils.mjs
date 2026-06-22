import assert from "assert/strict";
import { normalizeUpstreamIdentity, orderUpstreamCandidates } from "../lib/upstream-route-utils.mjs";

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

console.log(JSON.stringify({
  ok: true,
  orderedNames: ordered.map((item) => item.name),
  orderedAfter429Names: orderedAfter429.map((item) => item.name),
  identities: ordered.map((item) => normalizeUpstreamIdentity(item)),
}));

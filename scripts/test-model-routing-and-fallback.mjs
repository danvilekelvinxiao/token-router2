#!/usr/bin/env node

const args = new Set(process.argv.slice(2));
const LIVE_MODE = args.has("--live");
const BASE_URL = String(
  process.env.FLOWAPI_BASE_URL ||
  process.env.FLOWAPI_TEST_BASE_URL ||
  `http://127.0.0.1:${process.env.PORT || 3000}`
).replace(/\/+$/, "");
const ADMIN_SECRET = process.env.FLOWAPI_ADMIN_SECRET || process.env.ADMIN_SECRET || "";
const TEST_API_KEY = process.env.FLOWAPI_TEST_API_KEY || process.env.FLOWAPI_LIVE_TEST_API_KEY || "";
const MODELS = ["gpt-5.5", "opus4.8", "opus4.7", "opus4.6"];
const failures = [];

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`[FAIL] ${message}`);
}

function assert(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

function maskSecret(value = "") {
  const text = String(value || "").trim();
  if (!text) return "未配置";
  if (text.length <= 10) return `${text.slice(0, 2)}***${text.slice(-2)}`;
  return `${text.slice(0, 6)}***${text.slice(-4)}`;
}

function hasFlowapiBrand(value = "") {
  return /flowapi/i.test(String(value || ""));
}

async function request(pathname, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (ADMIN_SECRET) headers["x-admin-secret"] = ADMIN_SECRET;
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = json?.message || json?.error || json?.code || response.statusText || "request failed";
    throw new Error(`${method} ${pathname} -> ${response.status} ${reason}`);
  }
  return json;
}

function summarizeChain(chain = []) {
  return chain.map((item) => `${item.routeCode || item.line || "?"}:${item.channelName || item.name || item.providerName || "unknown"}`).join(" -> ");
}

function routeCodes(chain = []) {
  return chain.map((item) => item.routeCode || item.line || "").filter(Boolean);
}

function sameModelFamily(actualModel = "", requestedModel = "") {
  const actual = String(actualModel || "").toLowerCase();
  const requested = String(requestedModel || "").toLowerCase();
  if (!actual || !requested) return false;
  if (requested === "gpt-5.5") return actual.includes("gpt") || actual.includes("chatgpt5.5");
  if (requested === "opus4.8") return actual.includes("4-8") || actual.includes("4.8") || actual.includes("opus-4-8");
  if (requested === "opus4.7") return actual.includes("4-7") || actual.includes("4.7") || actual.includes("opus-4-7") || actual.includes("20250514");
  if (requested === "opus4.6") return actual.includes("4-6") || actual.includes("4.6") || actual.includes("opus-4-6");
  return false;
}

async function runPreview(model) {
  const data = await request(`/api/admin/model-routing-test?model=${encodeURIComponent(model)}`);
  const chain = data?.routePreview?.fallbackChain || data?.routeCandidates || [];
  const first = chain[0] || null;
  const last = chain.at(-1) || null;

  assert(!hasFlowapiBrand(data?.requestedModel), `${model} preview does not expose flowapi prefix in requested model`);
  assert(!hasFlowapiBrand(data?.requestModelId), `${model} preview does not expose flowapi prefix in request model id`);
  assert(Array.isArray(chain) && chain.length > 0, `${model} preview returns route chain`);
  assert(Boolean(data?.actualModelId), `${model} preview resolves actual model`);

  if (model === "gpt-5.5") {
    assert(Boolean(first), "gpt-5.5 preview returns primary candidate");
    assert((first?.routeCode || first?.line || "") === "A", "gpt-5.5 primary candidate is route A");
    assert(routeCodes(chain).includes("B") || chain.length >= 2, "gpt-5.5 preview includes backup candidate after A");
    if (routeCodes(chain).includes("X")) {
      assert((last?.routeCode || last?.line || "") === "X", "gpt-5.5 preview keeps openrouter as the last fallback");
    }
    pass(`gpt-5.5 chain: ${summarizeChain(chain)}`);
  } else {
    assert(sameModelFamily(data?.actualModelId, model), `${model} preview maps to matching Opus family actual model`);
    pass(`${model} chain: ${summarizeChain(chain)}`);
  }

  return data;
}

async function runSimulate(model, scenario, statusChain, expectations = {}) {
  const data = await request("/api/admin/model-routing-test", {
    method: "POST",
    body: { mode: "simulate", model, scenario, statusChain },
  });
  const simulation = data?.simulation || {};
  const attempts = Array.isArray(simulation.attempts) ? simulation.attempts : [];
  const winner = simulation.winner || null;
  const codes = attempts.map((item) => item.statusCode);

  assert(attempts.length > 0, `${model} simulate ${scenario} returns attempts`);
  if (expectations.expectedStatusPrefix) {
    const prefix = codes.slice(0, expectations.expectedStatusPrefix.length);
    assert(JSON.stringify(prefix) === JSON.stringify(expectations.expectedStatusPrefix), `${model} simulate ${scenario} starts with ${expectations.expectedStatusPrefix.join(",")}`);
  }
  if (expectations.expectedWinnerIndex != null) {
    assert(Number(winner?.attemptIndex) === expectations.expectedWinnerIndex, `${model} simulate ${scenario} wins on hop ${expectations.expectedWinnerIndex + 1}`);
  }
  if (expectations.expectedWinnerRouteCode) {
    const routeCode = winner?.candidate?.routeCode || winner?.candidate?.line || "";
    assert(routeCode === expectations.expectedWinnerRouteCode, `${model} simulate ${scenario} lands on route ${expectations.expectedWinnerRouteCode}`);
  }
  if (expectations.disallowWinnerRouteCode) {
    const routeCode = winner?.candidate?.routeCode || winner?.candidate?.line || "";
    assert(routeCode !== expectations.disallowWinnerRouteCode, `${model} simulate ${scenario} does not stop on route ${expectations.disallowWinnerRouteCode}`);
  }

  return data;
}

async function runLive(model, options = {}) {
  const body = {
    mode: "live",
    model,
    apiKey: TEST_API_KEY,
    api: options.api || "chat",
    stream: options.stream === true,
    useTools: options.useTools === true,
  };
  const data = await request("/api/admin/model-routing-test", { method: "POST", body });
  const live = data?.live || {};

  assert(Boolean(live.requestId), `${model} live ${body.api} returns request id`);
  assert(Boolean(live.debugHeaders?.selectedChannel || live.debugHeaders?.upstreamProvider), `${model} live ${body.api} returns debug routing headers`);
  assert(Boolean(live.evidenceSummary?.hasAnyEvidence || (live.attempts || []).length || (live.providerLogs || []).length || (live.calls || []).length), `${model} live ${body.api} returns evidence chain`);

  if (model.startsWith("opus")) {
    assert(!live.modelNotFound, `${model} live ${body.api} is not model_not_found`);
    assert(!live.authError, `${model} live ${body.api} is not auth blocked`);
  }

  pass(`${model} live ${body.api}: status=${live.status} request_id=${live.requestId || "-"} selected=${live.debugHeaders?.selectedChannel || live.debugHeaders?.upstreamProvider || "-"}`);
  return data;
}

async function main() {
  console.log(`Routing test base URL: ${BASE_URL}`);
  console.log(`Admin secret: ${maskSecret(ADMIN_SECRET)}`);
  console.log(`Live API key: ${LIVE_MODE ? maskSecret(TEST_API_KEY) : "未启用 live 模式"}`);

  if (!ADMIN_SECRET) {
    fail("缺少 FLOWAPI_ADMIN_SECRET 或 ADMIN_SECRET，本地先配置后再运行脚本");
  }

  for (const model of MODELS) {
    await runPreview(model).catch((error) => fail(`${model} preview failed: ${error.message}`));
  }

  await runSimulate("gpt-5.5", "primary_429_secondary_503", "429,503,200", {
    expectedStatusPrefix: [429, 503, 200],
    expectedWinnerIndex: 2,
    disallowWinnerRouteCode: "A",
  }).catch((error) => fail(`gpt-5.5 simulate primary_429_secondary_503 failed: ${error.message}`));

  await runSimulate("gpt-5.5", "primary_401", "401,200", {
    expectedStatusPrefix: [401, 200],
    expectedWinnerIndex: 1,
    expectedWinnerRouteCode: "B",
  }).catch((error) => fail(`gpt-5.5 simulate primary_401 failed: ${error.message}`));

  await runSimulate("gpt-5.5", "primary_timeout", "408,200", {
    expectedStatusPrefix: [408, 200],
    expectedWinnerIndex: 1,
    expectedWinnerRouteCode: "B",
  }).catch((error) => fail(`gpt-5.5 simulate primary_timeout failed: ${error.message}`));

  if (LIVE_MODE) {
    if (!TEST_API_KEY) {
      fail("缺少 FLOWAPI_TEST_API_KEY 或 FLOWAPI_LIVE_TEST_API_KEY，本地先配置低额度测试 Key 再运行 --live");
    } else {
      await runLive("gpt-5.5", { api: "chat" }).catch((error) => fail(`gpt-5.5 live chat failed: ${error.message}`));
      await runLive("gpt-5.5", { api: "responses", useTools: true }).catch((error) => fail(`gpt-5.5 live responses failed: ${error.message}`));
      await runLive("opus4.8", { api: "chat" }).catch((error) => fail(`opus4.8 live failed: ${error.message}`));
      await runLive("opus4.7", { api: "chat" }).catch((error) => fail(`opus4.7 live failed: ${error.message}`));
      await runLive("opus4.6", { api: "chat" }).catch((error) => fail(`opus4.6 live failed: ${error.message}`));
    }
  }

  if (failures.length) {
    console.error("\nModel routing / fallback tests failed:");
    for (const item of failures) console.error(`- ${item}`);
    process.exit(1);
  }

  console.log("\nModel routing / fallback tests passed");
}

await main();

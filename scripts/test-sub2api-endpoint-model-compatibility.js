#!/usr/bin/env node
/*
 * End-to-end FlowAPI endpoint/model compatibility smoke test.
 *
 * Required env:
 *   FLOWAPI_TEST_KEY / FLOWAPI_E2E_API_KEY / E2E_API_KEY
 * Optional env:
 *   FLOWAPI_TEST_BASE_URL=https://flowapi.fun
 *   FLOWAPI_TEST_MODEL=gpt-5.5
 *   FLOWAPI_RUN_DIRECT_SUB2API=true  (requires SUB2API_* env; never prints key/url)
 *
 * The script never prints API keys or upstream URLs. It validates the public
 * FlowAPI surfaces used by cc-switch and, when explicitly enabled, checks which
 * sub2api endpoint accepts a simple gpt-5.5 request.
 */

const BASE_URL = String(process.env.FLOWAPI_TEST_BASE_URL || process.env.FLOWAPI_E2E_BASE_URL || "https://flowapi.fun").replace(/\/+$/, "");
const API_KEY = process.env.FLOWAPI_TEST_KEY || process.env.FLOWAPI_E2E_API_KEY || process.env.E2E_API_KEY || "";
const MODEL = process.env.FLOWAPI_TEST_MODEL || "gpt-5.5";
const RUN_DIRECT_SUB2API = process.env.FLOWAPI_RUN_DIRECT_SUB2API === "true";
const REQUEST_TIMEOUT_MS = Number(process.env.FLOWAPI_TEST_TIMEOUT_MS || 60_000);

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchWithTimeout(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function sanitizeText(value = "") {
  return String(value || "")
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, "sk-***")
    .replace(/https?:\/\/[^\s\"']+/g, "[url]")
    .slice(0, 500);
}

function authHeaders(extra = {}) {
  assert(API_KEY, "Missing FLOWAPI_TEST_KEY / FLOWAPI_E2E_API_KEY / E2E_API_KEY");
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: sanitizeText(text) };
  }
}

async function postJson(path, body, headers = {}) {
  const response = await fetchWithTimeout(`${BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(headers),
    body: JSON.stringify(body),
  });
  const json = await readJsonResponse(response);
  return { response, json };
}

async function readSse(response) {
  const events = [];
  let buffer = "";
  let text = "";
  let sawDone = false;
  let sawResponseCompleted = false;
  let sawUsage = false;
  const requestIds = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
      const dataText = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!dataText) continue;
      if (dataText === "[DONE]") {
        sawDone = true;
        events.push({ event: eventName, data: "[DONE]" });
        continue;
      }
      let data;
      try { data = JSON.parse(dataText); } catch { data = dataText; }
      events.push({ event: eventName, data });
      if (eventName === "response.completed" || data?.type === "response.completed") sawResponseCompleted = true;
      if (data?.usage || data?.response?.usage) sawUsage = true;
      const requestId = data?.request_id || data?.id || data?.response?.id || "";
      if (requestId) requestIds.push(String(requestId));
      const delta = data?.delta || data?.choices?.[0]?.delta?.content || data?.response?.output_text || "";
      if (typeof delta === "string" && delta && !delta.startsWith("resp_")) text += delta;
    }
  }

  return { events, text, sawDone, sawResponseCompleted, sawUsage, requestIds };
}

function extractChatText(json = {}) {
  const content = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? "";
  return typeof content === "string" ? content : JSON.stringify(content || "");
}

async function testChatNonStream() {
  const { response, json } = await postJson("/v1/chat/completions", {
    model: MODEL,
    messages: [{ role: "user", content: "只回复 OK" }],
    stream: false,
    max_tokens: 20,
    request_id: `compat_chat_${Date.now()}`,
  });
  assert(response.ok, "chat/completions stream=false failed", { status: response.status, json });
  const text = extractChatText(json).trim();
  assert(text.length > 0, "chat/completions stream=false missing content", { json });
  return { status: response.status, text, requestId: json.request_id || json.token_router?.request_id || json.id || "", usage: json.usage || null };
}

async function testChatStream() {
  const response = await fetchWithTimeout(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: "只回复 OK" }],
      stream: true,
      max_tokens: 20,
      request_id: `compat_chat_stream_${Date.now()}`,
      stream_options: { include_usage: true },
    }),
  });
  assert(response.ok, "chat/completions stream=true HTTP failed", { status: response.status });
  assert((response.headers.get("content-type") || "").includes("text/event-stream"), "chat/completions stream=true not SSE", { contentType: response.headers.get("content-type") });
  const result = await readSse(response);
  assert(result.sawDone, "chat/completions stream=true missing data: [DONE]", { tail: result.events.slice(-5) });
  assert(result.requestIds.some((id) => id.endsWith("A")), "chat/completions stream request_id missing A suffix", { requestIds: result.requestIds.slice(0, 8) });
  return { status: response.status, sawDone: result.sawDone, sawUsage: result.sawUsage, text: result.text.trim(), requestIds: result.requestIds.slice(0, 8) };
}

async function testResponsesNonStream() {
  const { response, json } = await postJson("/v1/responses", {
    model: MODEL,
    input: "只回复 OK",
    stream: false,
    max_output_tokens: 20,
    request_id: `compat_resp_${Date.now()}`,
  });
  assert(response.ok, "responses stream=false failed", { status: response.status, json });
  assert(json?.status === "completed", "responses stream=false did not complete", { json });
  assert(String(json?.output_text || "").trim().length > 0, "responses stream=false missing output_text", { json });
  return { status: response.status, outputText: json.output_text, usage: json.usage || null, id: json.id || "" };
}

async function testResponsesStream() {
  const response = await fetchWithTimeout(`${BASE_URL}/v1/responses`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: MODEL,
      input: "只回复 OK",
      stream: true,
      max_output_tokens: 20,
      request_id: `compat_resp_stream_${Date.now()}`,
    }),
  });
  assert(response.ok, "responses stream=true HTTP failed", { status: response.status });
  assert((response.headers.get("content-type") || "").includes("text/event-stream"), "responses stream=true not SSE", { contentType: response.headers.get("content-type") });
  const result = await readSse(response);
  assert(result.sawResponseCompleted, "responses stream=true missing response.completed", { tail: result.events.slice(-5) });
  return { status: response.status, sawResponseCompleted: result.sawResponseCompleted, sawUsage: result.sawUsage, text: result.text.trim(), lastEvents: result.events.slice(-4).map((event) => ({ event: event.event, type: event.data?.type || null })) };
}

async function directSub2apiProbe(path, body) {
  const rawBase = process.env.SUB2API_API_BASE_URL || process.env.SUB2API_BASE_URL || process.env.SUB2API_INTERNAL_URL || "";
  const key = process.env.SUB2API_API_KEY || "";
  if (!RUN_DIRECT_SUB2API || !rawBase || !key) return { skipped: true };
  const base = String(rawBase).replace(/\/+$/, "").replace(/\/v1$/i, "");
  const response = await fetchWithTimeout(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJsonResponse(response);
  const error = json?.error || json || {};
  return {
    status: response.status,
    ok: response.ok,
    hasContent: Boolean(extractChatText(json) || json?.output_text),
    usage: json?.usage || null,
    errorCode: sanitizeText(error.code || error.type || ""),
    errorMessage: sanitizeText(error.message || json?.message || json?.raw || ""),
  };
}

async function main() {
  const results = {};
  results.flowapiChatNonStream = await testChatNonStream();
  results.flowapiChatStream = await testChatStream();
  results.flowapiResponsesNonStream = await testResponsesNonStream();
  results.flowapiResponsesStream = await testResponsesStream();
  results.directSub2apiChat = await directSub2apiProbe("/v1/chat/completions", {
    model: MODEL,
    messages: [{ role: "user", content: "只回复 OK" }],
    max_tokens: 20,
    stream: false,
  });
  results.directSub2apiResponses = await directSub2apiProbe("/v1/responses", {
    model: MODEL,
    input: "只回复 OK",
    max_output_tokens: 20,
    stream: false,
  });
  console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, model: MODEL, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: error.message, details: error.details || {} }, null, 2));
  process.exit(1);
});

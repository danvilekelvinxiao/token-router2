#!/usr/bin/env node
/*
 * End-to-end stream completion smoke test for FlowAPI.
 *
 * Required env:
 *   FLOWAPI_TEST_KEY / FLOWAPI_E2E_API_KEY / E2E_API_KEY
 * Optional env:
 *   FLOWAPI_TEST_BASE_URL=https://flowapi.fun
 *   FLOWAPI_TEST_MODEL=gpt-5.5
 *   FLOWAPI_RUN_ABORT_TEST=true
 *
 * The script never prints the API key. It verifies externally visible stream
 * completion markers; balance/log reconciliation still belongs to admin/UI checks.
 */

const BASE_URL = String(process.env.FLOWAPI_TEST_BASE_URL || process.env.FLOWAPI_E2E_BASE_URL || "https://flowapi.fun").replace(/\/+$/, "");
const API_KEY = process.env.FLOWAPI_TEST_KEY || process.env.FLOWAPI_E2E_API_KEY || process.env.E2E_API_KEY || "";
const MODEL = process.env.FLOWAPI_TEST_MODEL || "gpt-5.5";
const RUN_ABORT_TEST = process.env.FLOWAPI_RUN_ABORT_TEST === "true";

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
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
    return { raw: text };
  }
}

async function postJson(path, body, headers = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(headers),
    body: JSON.stringify(body),
  });
  const json = await readJsonResponse(response);
  return { response, json };
}

async function readSse(response, { abortAfterFirstDelta = false } = {}) {
  const events = [];
  let buffer = "";
  let done = false;
  let text = "";
  let sawResponseCompleted = false;
  let sawChatDone = false;
  let sawUsage = false;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done: readerDone } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
      const dataText = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (!dataText) continue;
      if (dataText === "[DONE]") {
        sawChatDone = true;
        done = true;
        events.push({ event: eventName, data: "[DONE]" });
        continue;
      }
      let data;
      try {
        data = JSON.parse(dataText);
      } catch {
        data = dataText;
      }
      events.push({ event: eventName, data });
      if (eventName === "response.completed" || data?.type === "response.completed") sawResponseCompleted = true;
      if (data?.usage || data?.response?.usage) sawUsage = true;
      const delta = data?.delta || data?.choices?.[0]?.delta?.content || "";
      if (typeof delta === "string") text += delta;
      if (abortAfterFirstDelta && delta) {
        await reader.cancel("abort-test");
        return { events, done, text, sawResponseCompleted, sawChatDone, sawUsage, aborted: true };
      }
    }
  }

  return { events, done, text, sawResponseCompleted, sawChatDone, sawUsage, aborted: false };
}

async function testResponsesNonStream() {
  const { response, json } = await postJson("/v1/responses", {
    model: MODEL,
    input: "只回复 OK，用于测试非流式。",
    stream: false,
    max_output_tokens: 20,
  });
  assert(response.ok, "responses stream=false failed", { status: response.status, json });
  assert(json?.status === "completed", "responses stream=false did not complete", { json });
  assert(String(json?.output_text || "").trim().length > 0, "responses stream=false missing output_text", { json });
  return { status: response.status, output: json.output_text, usage: json.usage };
}

async function testResponsesStream() {
  const response = await fetch(`${BASE_URL}/v1/responses`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: MODEL,
      input: "只回复 OK，用于测试 response.completed。",
      stream: true,
      max_output_tokens: 20,
    }),
  });
  assert(response.ok, "responses stream=true HTTP failed", { status: response.status });
  assert((response.headers.get("content-type") || "").includes("text/event-stream"), "responses stream=true not SSE", { contentType: response.headers.get("content-type") });
  const result = await readSse(response);
  assert(result.sawResponseCompleted, "responses stream=true missing response.completed", { events: result.events.slice(-5) });
  assert(result.text.trim().length > 0, "responses stream=true missing text delta", { events: result.events.slice(-5) });
  return result;
}

async function testChatStream() {
  const requestBase = `script_${Date.now()}`;
  const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: "只回复 OK，用于测试 Chat Completions DONE。" }],
      stream: true,
      max_tokens: 20,
      request_id: requestBase,
      stream_options: { include_usage: true },
    }),
  });
  assert(response.ok, "chat/completions stream=true HTTP failed", { status: response.status });
  assert((response.headers.get("content-type") || "").includes("text/event-stream"), "chat/completions stream=true not SSE", { contentType: response.headers.get("content-type") });
  const result = await readSse(response);
  assert(result.sawChatDone, "chat/completions stream=true missing data: [DONE]", { events: result.events.slice(-5) });
  const requestIds = result.events.map((event) => event.data?.request_id || event.data?.id).filter(Boolean);
  const hasA = requestIds.some((id) => String(id).endsWith("A"));
  assert(hasA, "chat/completions stream request_id missing A suffix in SSE", { requestIds: requestIds.slice(0, 5) });
  return { ...result, requestIds: requestIds.slice(0, 5) };
}

async function testAbortPath() {
  if (!RUN_ABORT_TEST) return { skipped: true, reason: "set FLOWAPI_RUN_ABORT_TEST=true to exercise client abort" };
  const response = await fetch(`${BASE_URL}/v1/responses`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ model: MODEL, input: "请输出稍长一点的文本用于中途断流测试。", stream: true, max_output_tokens: 120 }),
  });
  assert(response.ok, "abort test HTTP failed", { status: response.status });
  const result = await readSse(response, { abortAfterFirstDelta: true });
  assert(result.aborted, "abort test did not abort after first delta", result);
  return result;
}

async function testInvalidKeySanitization() {
  const response = await fetch(`${BASE_URL}/v1/responses`, {
    method: "POST",
    headers: { Authorization: "Bearer sk-invalid-test", "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: "hello", stream: false }),
  });
  const json = await readJsonResponse(response);
  const text = JSON.stringify(json);
  for (const forbidden of ["sub2api", "OpenRouter", "openrouter.ai", "New API", "upstream", "provider", "channel", "api.xiaoleai.team"]) {
    assert(!text.includes(forbidden), "user-visible error leaked provider detail", { forbidden, json });
  }
  return { status: response.status, error: json.error || json };
}

async function main() {
  const results = {};
  results.responsesNonStream = await testResponsesNonStream();
  results.responsesStream = await testResponsesStream();
  results.chatStream = await testChatStream();
  results.abortPath = await testAbortPath();
  results.invalidKey = await testInvalidKeySanitization();
  console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, model: MODEL, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: error.message, details: error.details || {} }, null, 2));
  process.exit(1);
});

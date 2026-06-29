#!/usr/bin/env node
/*
 * FlowAPI stream delivery, billing, and routed request_id verification.
 *
 * Required env:
 *   FLOWAPI_TEST_KEY / FLOWAPI_E2E_API_KEY / E2E_API_KEY
 * Optional env:
 *   FLOWAPI_TEST_BASE_URL=https://flowapi.fun
 *   FLOWAPI_TEST_MODEL=gpt-5.5
 *   FLOWAPI_VERIFY_DB=true       (uses DATABASE_URL/POSTGRES_URL, never prints secrets)
 *   FLOWAPI_RUN_ABORT_TEST=true  (aborts a chat stream after first chunk)
 */

try {
  require("@next/env").loadEnvConfig(process.cwd());
} catch {}

const BASE_URL = String(process.env.FLOWAPI_TEST_BASE_URL || process.env.FLOWAPI_E2E_BASE_URL || "https://flowapi.fun").replace(/\/+$/, "");
const API_KEY = process.env.FLOWAPI_TEST_KEY || process.env.FLOWAPI_E2E_API_KEY || process.env.E2E_API_KEY || "";
const MODEL = process.env.FLOWAPI_TEST_MODEL || "gpt-5.5";
const REQUEST_TIMEOUT_MS = Number(process.env.FLOWAPI_TEST_TIMEOUT_MS || 120_000);
const VERIFY_DB = process.env.FLOWAPI_VERIFY_DB === "true";
const RUN_ABORT_TEST = process.env.FLOWAPI_RUN_ABORT_TEST === "true";

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
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***")
    .replace(/https?:\/\/[^\s\"']+/g, "[url]")
    .slice(0, 700);
}

function authHeaders(extra = {}) {
  assert(API_KEY, "Missing FLOWAPI_TEST_KEY / FLOWAPI_E2E_API_KEY / E2E_API_KEY");
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", ...extra };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: options.signal || controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: sanitizeText(text) }; }
}

function extractChatText(json = {}) {
  const content = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? "";
  return typeof content === "string" ? content : JSON.stringify(content || "");
}

async function postJson(path, body) {
  const response = await fetchWithTimeout(`${BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await readJsonResponse(response);
  return { response, json };
}

async function readSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let sawDone = false;
  let sawResponseCreated = false;
  let sawOutputItemAdded = false;
  let sawContentPartAdded = false;
  let sawOutputTextDone = false;
  let sawContentPartDone = false;
  let sawOutputItemDone = false;
  let sawResponseCompleted = false;
  let sawUsage = false;
  const requestIds = [];
  const events = [];
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
        events.push({ event: eventName, type: "[DONE]" });
        continue;
      }
      let data;
      try { data = JSON.parse(dataText); } catch { data = dataText; }
      events.push({ event: eventName, type: data?.type || null });
      if (eventName === "response.created" || data?.type === "response.created") sawResponseCreated = true;
      if (eventName === "response.output_item.added" || data?.type === "response.output_item.added") sawOutputItemAdded = true;
      if (eventName === "response.content_part.added" || data?.type === "response.content_part.added") sawContentPartAdded = true;
      if (eventName === "response.output_text.done" || data?.type === "response.output_text.done") sawOutputTextDone = true;
      if (eventName === "response.content_part.done" || data?.type === "response.content_part.done") sawContentPartDone = true;
      if (eventName === "response.output_item.done" || data?.type === "response.output_item.done") sawOutputItemDone = true;
      if (eventName === "response.completed" || data?.type === "response.completed") sawResponseCompleted = true;
      if (data?.usage || data?.response?.usage) sawUsage = true;
      const requestId = data?.request_id || data?.response?.request_id || "";
      if (requestId) requestIds.push(String(requestId));
      const delta = data?.delta || data?.choices?.[0]?.delta?.content || data?.response?.output_text || "";
      if (typeof delta === "string" && delta && !delta.startsWith("resp_")) text += delta;
    }
  }
  return {
    text: sanitizeText(text.trim()),
    sawDone,
    sawResponseCreated,
    sawOutputItemAdded,
    sawContentPartAdded,
    sawOutputTextDone,
    sawContentPartDone,
    sawOutputItemDone,
    sawResponseCompleted,
    sawUsage,
    requestIds,
    eventsTail: events.slice(-8),
  };
}

function hasRouteSuffix(id = "") {
  return /[ABCDX]$/.test(String(id || ""));
}

async function testChatNonStream(marker) {
  const requestId = `billing_chat_${marker}`;
  const { response, json } = await postJson("/v1/chat/completions", {
    model: MODEL,
    messages: [{ role: "user", content: "只回复 OK" }],
    stream: false,
    max_tokens: 20,
    request_id: requestId,
  });
  assert(response.ok, "chat/completions non-stream failed", { status: response.status, json });
  const routedRequestId = json.request_id || json.token_router?.request_id || json.id || "";
  assert(hasRouteSuffix(routedRequestId), "chat non-stream request_id missing route suffix", { routedRequestId });
  return { requestId, routedRequestId, status: response.status, text: sanitizeText(extractChatText(json).trim()), usage: json.usage || null };
}

async function testChatStream(marker) {
  const requestId = `billing_chat_stream_${marker}`;
  const response = await fetchWithTimeout(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: "只回复 OK" }],
      stream: true,
      max_tokens: 20,
      request_id: requestId,
      stream_options: { include_usage: true },
    }),
  });
  assert(response.ok, "chat/completions stream HTTP failed", { status: response.status });
  const result = await readSse(response);
  assert(result.sawDone, "chat/completions stream missing data: [DONE]", { tail: result.eventsTail });
  assert(result.requestIds.some(hasRouteSuffix), "chat stream SSE request_id missing route suffix", { requestIds: result.requestIds.slice(0, 8) });
  return { requestId, routedRequestIds: result.requestIds.slice(0, 8), status: response.status, sawDone: result.sawDone, sawUsage: result.sawUsage, text: result.text };
}

async function testResponsesNonStream(marker) {
  const requestId = `billing_resp_${marker}`;
  const { response, json } = await postJson("/v1/responses", {
    model: MODEL,
    input: "只回复 OK",
    stream: false,
    max_output_tokens: 20,
    request_id: requestId,
  });
  assert(response.ok, "responses non-stream failed", { status: response.status, json });
  assert(json.status === "completed", "responses non-stream did not complete", { status: json.status });
  assert(hasRouteSuffix(json.request_id), "responses non-stream request_id missing route suffix", { requestId: json.request_id || "", responseId: json.id || "" });
  return { requestId, routedRequestId: json.request_id || "", responseId: json.id || "", status: response.status, responseStatus: json.status, outputText: sanitizeText(json.output_text || ""), usage: json.usage || null };
}

async function testResponsesStream(marker) {
  const requestId = `billing_resp_stream_${marker}`;
  const response = await fetchWithTimeout(`${BASE_URL}/v1/responses`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ model: MODEL, input: "只回复 OK", stream: true, max_output_tokens: 20, request_id: requestId }),
  });
  assert(response.ok, "responses stream HTTP failed", { status: response.status });
  const result = await readSse(response);
  assert(result.sawResponseCompleted, "responses stream missing response.completed", { tail: result.eventsTail });
  assert(result.sawResponseCreated && result.sawOutputItemAdded && result.sawContentPartAdded && result.sawOutputTextDone && result.sawContentPartDone && result.sawOutputItemDone, "responses stream missing OpenAI-compatible output event chain", { tail: result.eventsTail, flags: { sawResponseCreated: result.sawResponseCreated, sawOutputItemAdded: result.sawOutputItemAdded, sawContentPartAdded: result.sawContentPartAdded, sawOutputTextDone: result.sawOutputTextDone, sawContentPartDone: result.sawContentPartDone, sawOutputItemDone: result.sawOutputItemDone } });
  assert(result.requestIds.some(hasRouteSuffix), "responses stream SSE request_id missing route suffix", { requestIds: result.requestIds.slice(0, 8), tail: result.eventsTail });
  return { requestId, routedRequestIds: result.requestIds.slice(0, 8), status: response.status, sawResponseCompleted: result.sawResponseCompleted, sawUsage: result.sawUsage, text: result.text, eventsTail: result.eventsTail };
}

async function testAbort(marker) {
  const requestId = `billing_abort_${marker}`;
  const controller = new AbortController();
  const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    signal: controller.signal,
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: "请缓慢输出 3 句话，用于断流测试。" }],
      stream: true,
      max_tokens: 120,
      request_id: requestId,
      stream_options: { include_usage: true },
    }),
  });
  const reader = response.body.getReader();
  await reader.read().catch(() => null);
  controller.abort();
  await reader.cancel().catch(() => null);
  return { requestId, aborted: true, status: response.status };
}

async function verifyDb(marker) {
  if (!VERIFY_DB) return { skipped: true };
  const pg = await import("pg");
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  if (!connectionString) return { skipped: true, reason: "DATABASE_URL/POSTGRES_URL missing" };
  const useSsl = process.env.DATABASE_SSL === "false" ? false : (connectionString.includes("sslmode=require") || /supabase\.co/i.test(connectionString));
  const pool = new pg.Pool({ connectionString, ssl: useSsl ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 8000, query_timeout: 12000, statement_timeout: 12000, max: 2 });
  const rows = await pool.query(
    `SELECT id, request_id, delivery_status, billing_status, upstream_channel, upstream_status, status, input_tokens, output_tokens, total_tokens, cost, error_code
     FROM calls
     WHERE request_id ILIKE $1
     ORDER BY created_at ASC`,
    [`%${marker}%`]
  );
  await pool.end();
  const calls = rows.rows.map((row) => ({
    callId: row.id,
    requestId: row.request_id,
    suffix: String(row.request_id || "").match(/[ABCDX]$/)?.[0] || "",
    deliveryStatus: row.delivery_status || "",
    billingStatus: row.billing_status || "",
    upstreamChannel: row.upstream_channel || "",
    upstreamStatus: Number(row.upstream_status || 0),
    status: Number(row.status || 0),
    inputTokens: Number(row.input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0),
    totalTokens: Number(row.total_tokens || 0),
    cost: Number(row.cost || 0),
    errorCode: row.error_code || "",
  }));
  return { skipped: false, count: calls.length, calls };
}

(async () => {
  const marker = Date.now().toString(36);
  const results = {
    chatNonStream: await testChatNonStream(marker),
    chatStream: await testChatStream(marker),
    responsesNonStream: await testResponsesNonStream(marker),
    responsesStream: await testResponsesStream(marker),
  };
  if (RUN_ABORT_TEST) results.abort = await testAbort(marker);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const db = await verifyDb(marker);
  if (!db.skipped) {
    const successful = db.calls.filter((row) => !row.requestId.includes("abort"));
    assert(successful.length >= 4, "DB verification missing successful call rows", { count: db.count, calls: db.calls });
    assert(successful.every((row) => hasRouteSuffix(row.requestId)), "DB calls request_id missing route suffix", { calls: successful });
    assert(successful.every((row) => row.deliveryStatus === "success_completed" || row.billingStatus === "success_completed"), "DB successful calls missing success_completed status", { calls: successful });
    assert(successful.every((row) => row.cost > 0 && row.totalTokens > 0), "DB successful calls missing cost/tokens", { calls: successful });
    const aborted = db.calls.filter((row) => row.requestId.includes("abort"));
    assert(!RUN_ABORT_TEST || aborted.every((row) => row.billingStatus !== "success_completed" && row.cost === 0), "Abort rows must not be billed as success", { aborted });
  }
  console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, model: MODEL, marker, results, db }, null, 2));
})().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: sanitizeText(error.message), details: error.details || {} }, null, 2));
  process.exit(1);
});

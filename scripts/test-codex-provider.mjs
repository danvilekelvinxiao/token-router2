#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://127.0.0.1:3000/v1";
const TOOL_JSON_TEXT_PATTERN = /^\s*(?:```(?:json)?\s*)?\{[\s\S]{0,6000}?(?:"cmd"|"command"|"workdir"|"tool_call"|"function_call")[\s\S]*\}\s*(?:```)?\s*$/i;

const baseUrl = String(process.env.FLOWAPI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
const apiKey = String(process.env.FLOWAPI_TEST_KEY || "").trim();
const model = String(process.env.FLOWAPI_MODEL || "gpt-5.5").trim();
const bodyLimitBytes = Math.max(1024, Number(process.env.FLOWAPI_BODY_LIMIT_TEST_BYTES || 262_144));

const results = [];

function record(ok, name, detail = "") {
  const line = `[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`;
  results.push({ ok, name, detail });
  console.log(line);
}

function skip(name, detail = "") {
  console.log(`[SKIP] ${name}${detail ? ` — ${detail}` : ""}`);
}

function endpoint(path) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function redactKey(value = "") {
  const raw = String(value || "");
  if (raw.length <= 12) return raw ? `${raw.slice(0, 3)}***` : "";
  return `${raw.slice(0, 6)}***${raw.slice(-4)}`;
}

function textLooksLikeToolJson(text = "") {
  const value = String(text || "").trim();
  if (!value || !TOOL_JSON_TEXT_PATTERN.test(value)) return false;
  const unwrapped = value.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(unwrapped);
    return Boolean(parsed && typeof parsed === "object" && (parsed.cmd || parsed.command || parsed.workdir || parsed.tool_call || parsed.function_call));
  } catch {
    return true;
  }
}

function extractResponseText(payload = {}) {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (Array.isArray(payload.output)) {
    return payload.output.map((item) => {
      if (item?.type === "message" && Array.isArray(item.content)) {
        return item.content.map((part) => part?.text || part?.output_text || "").join("\n");
      }
      return "";
    }).filter(Boolean).join("\n");
  }
  return "";
}

function hasFunctionCall(payload = {}) {
  return Array.isArray(payload.output) && payload.output.some((item) => item?.type === "function_call");
}

async function postJson(path, body, key = apiKey) {
  const response = await fetch(endpoint(path), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Request-Id": `codex_provider_test_${Date.now().toString(36)}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { response, text, json };
}

async function testResponsesText() {
  const { response, json, text } = await postJson("/responses", {
    model,
    input: "只回复 OK",
    max_output_tokens: 20,
  });
  const output = extractResponseText(json || {});
  record(response.ok && Boolean(output), "responses text", `status=${response.status} text=${JSON.stringify(output.slice(0, 80) || text.slice(0, 80))}`);
  record(!textLooksLikeToolJson(output), "no tool-call textification", output ? "ordinary text is not shell/tool JSON" : "no output text");
}

async function readSse(response) {
  const reader = response.body?.getReader();
  if (!reader) return { raw: "", events: [] };
  const decoder = new TextDecoder();
  let raw = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  const events = [];
  let currentEvent = "";
  let currentData = "";
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) currentEvent = line.slice(6).trim();
    if (line.startsWith("data:")) currentData += `${line.slice(5).trim()}\n`;
    if (!line.trim() && (currentEvent || currentData)) {
      const data = currentData.trim();
      let json = null;
      try { json = data && data !== "[DONE]" ? JSON.parse(data) : null; } catch {}
      events.push({ event: currentEvent, data, json });
      currentEvent = "";
      currentData = "";
    }
  }
  return { raw, events };
}

async function testResponsesStream() {
  const response = await fetch(endpoint("/responses"), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Request-Id": `codex_provider_stream_${Date.now().toString(36)}`,
    },
    body: JSON.stringify({
      model,
      input: "只回复 STREAM_OK",
      stream: true,
      max_output_tokens: 30,
    }),
  });
  const { raw, events } = await readSse(response);
  const eventNames = events.map((item) => item.event || item.json?.type || "data");
  const completed = eventNames.includes("response.completed") || raw.includes("response.completed");
  const hasDelta = eventNames.includes("response.output_text.delta") || raw.includes("response.output_text.delta") || raw.includes("STREAM_OK");
  record(response.ok && completed && hasDelta, "responses stream", `status=${response.status} events=${eventNames.slice(0, 8).join(",")}`);
}

async function testToolsPassthrough() {
  const tool = {
    type: "function",
    name: "flowapi_probe_tool",
    description: "A diagnostic probe tool. Call it with {\"ok\":true}.",
    parameters: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
      },
      required: ["ok"],
      additionalProperties: false,
    },
  };
  const { response, json, text } = await postJson("/responses", {
    model,
    input: "请调用 flowapi_probe_tool，参数 ok=true，不要用普通文本回答。",
    tools: [tool],
    tool_choice: { type: "function", name: "flowapi_probe_tool" },
    parallel_tool_calls: false,
    max_output_tokens: 80,
  });
  const output = extractResponseText(json || {});
  const functionCall = hasFunctionCall(json || {});
  record(response.ok && functionCall, "tools passthrough", functionCall ? "function_call output item returned" : `status=${response.status} output=${JSON.stringify((output || text).slice(0, 120))}`);
  record(!textLooksLikeToolJson(output), "tool call not returned as text", functionCall ? "structured function_call observed" : "no shell/tool JSON text observed");
}

async function testPreviousResponseId() {
  const previousResponseId = `resp_codex_prev_${Date.now().toString(36)}`;
  const { response, json } = await postJson("/responses", {
    model,
    input: "只回复 PREV_OK",
    previous_response_id: previousResponseId,
    max_output_tokens: 20,
  });
  record(response.ok && json?.previous_response_id === previousResponseId, "previous_response_id passthrough", `returned=${json?.previous_response_id || ""}`);
}

async function testBodyLimit() {
  const largeText = `body-limit-probe ${"x".repeat(bodyLimitBytes)}`;
  const { response, json, text } = await postJson("/responses", {
    model,
    input: largeText,
    max_output_tokens: 1,
  });
  record(response.status !== 413, "body limit", `status=${response.status} bytes=${bodyLimitBytes}`);
  if (!response.ok) {
    console.log(`[INFO] body limit response: ${JSON.stringify(json || text.slice(0, 160))}`);
  }
}

async function testErrorPassthrough() {
  const { response, json, text } = await postJson("/responses", {
    model,
    input: "ping",
    max_output_tokens: 1,
  }, "sk-invalid-codex-provider-test");
  record(!response.ok && Boolean(json?.error || json?.code || text), "upstream/auth error passthrough", `status=${response.status}`);
}

async function main() {
  console.log(`[INFO] FLOWAPI_BASE_URL=${baseUrl}`);
  console.log(`[INFO] FLOWAPI_MODEL=${model}`);
  console.log(`[INFO] FLOWAPI_TEST_KEY=${redactKey(apiKey) || "<missing>"}`);
  if (!apiKey) {
    skip("codex provider live tests", "set FLOWAPI_TEST_KEY to a low-balance test key");
    process.exit(0);
  }

  await testResponsesText();
  await testResponsesStream();
  await testToolsPassthrough();
  await testPreviousResponseId();
  await testBodyLimit();
  await testErrorPassthrough();

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`[FAIL] ${failed.length} Codex provider check(s) failed`);
    process.exit(1);
  }
  console.log("[PASS] Codex provider compatibility checks completed");
}

main().catch((error) => {
  console.error(`[FAIL] test runner crashed — ${error?.message || error}`);
  process.exit(1);
});

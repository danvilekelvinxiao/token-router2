/**
 * /v1/responses adapter
 *
 * Converts the common OpenAI Responses API shape into Chat Completions,
 * sends it through FlowAPI's existing /api/v1/chat/completions route, then
 * converts the result back into Responses-compatible payloads and SSE events.
 *
 * This intentionally reuses the FlowAPI main route so auth, balance reserve,
 * usage logs, model routing, and Chinese error handling stay consistent. It
 * preserves function/tool-call items so Codex can expose local terminal,
 * browser and file-edit tools when configured with wire_api = "responses".
 */

import { Readable } from "stream";
import { MODEL_CATALOG, getCatalogModel, getPublicModelRequestId, normalizeModelLookup } from "@/lib/models";
import { findCustomerByToken, issueRefundCreditForRequest } from "@/lib/customer-store";
import { getUpstreamSuggestion } from "@/lib/upstream";

const SUPPORTED_MODEL_IDS = new Set(MODEL_CATALOG.map((model) => model.modelId));
const CODEX_DIAGNOSTIC_PREFIX = "[flowapi-codex-diagnostic]";
const TOOL_JSON_TEXT_PATTERN = /^\s*(?:```(?:json)?\s*)?\{[\s\S]{0,6000}?(?:"cmd"|"command"|"workdir"|"tool_call"|"function_call")[\s\S]*\}\s*(?:```)?\s*$/i;
const FLOW_DEBUG_RESPONSE_HEADERS = [
  "X-Flow-Request-Id",
  "X-Flow-Model",
  "X-Flow-Wire-Api",
  "X-Flow-Selected-Channel",
  "X-Flow-Upstream-Provider",
  "X-Flow-Upstream-Model",
  "X-Flow-Fallback-Attempt",
  "X-Flow-Fallback-Chain",
  "X-Flow-Fallback-Reason",
  "X-Flow-Upstream-Status",
  "X-Flow-Upstream-Endpoint",
];

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
    responseLimit: false,
  },
  maxDuration: 600,
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-api-key, idempotency-key, x-request-id, x-flow-debug, x-flowapi-debug");
  res.setHeader("Access-Control-Expose-Headers", FLOW_DEBUG_RESPONSE_HEADERS.join(", "));
  res.setHeader("Access-Control-Max-Age", "86400");
}

function shouldExposeFlowDebugHeaders(req) {
  return req?.headers?.["x-flow-debug"] === "1" || req?.headers?.["x-flowapi-debug"] === "1";
}

function safeHeaderValue(value = "", maxLength = 240) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\x20-\x7E]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function appendExposeHeaders(res, names = []) {
  const existing = String(res.getHeader("Access-Control-Expose-Headers") || "");
  const merged = new Set(existing.split(",").map((item) => item.trim()).filter(Boolean));
  for (const name of names) merged.add(name);
  if (merged.size) res.setHeader("Access-Control-Expose-Headers", Array.from(merged).join(", "));
}

function copyFlowDebugHeaders(upstreamHeaders, res, enabled = false) {
  if (!enabled || !upstreamHeaders || !res || res.headersSent) return;
  appendExposeHeaders(res, FLOW_DEBUG_RESPONSE_HEADERS);
  for (const headerName of FLOW_DEBUG_RESPONSE_HEADERS) {
    const value = safeHeaderValue(upstreamHeaders.get(headerName) || upstreamHeaders.get(headerName.toLowerCase()) || "");
    if (value) res.setHeader(headerName, value);
  }
}

function getClientToken(req) {
  const auth = req.headers.authorization || "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : String(req.headers["x-api-key"] || "").trim();
  while (token.toLowerCase().startsWith("bearer ")) token = token.slice(7).trim();
  return token.replace(/^["']|["']$/g, "");
}

function estimateBodySize(value = {}) {
  try {
    return Buffer.byteLength(JSON.stringify(value || {}));
  } catch {
    return 0;
  }
}

function getInputType(body = {}) {
  if (Array.isArray(body.messages)) return "messages";
  if (Array.isArray(body.input)) return "array";
  if (typeof body.input === "string") return "string";
  if (body.input && typeof body.input === "object") return "object";
  if (body.instructions) return "instructions_only";
  return "empty";
}

function hasResponseFunctionInput(input) {
  if (!Array.isArray(input)) return false;
  return input.some((item) => item?.type === "function_call" || item?.type === "function_call_output");
}

function buildCodexDiagnostic(req, body = {}) {
  const headerRequestId = String(req.headers["x-request-id"] || req.headers["idempotency-key"] || "").trim();
  return {
    stage: "responses_adapter",
    request_id: String(body.request_id || body.requestId || headerRequestId || "").slice(0, 160),
    path: "/v1/responses",
    model: String(body.model || "").slice(0, 120),
    wire_api: "responses",
    stream: body.stream === true,
    has_tools: Array.isArray(body.tools) && body.tools.length > 0,
    tools_count: Array.isArray(body.tools) ? body.tools.length : 0,
    has_tool_choice: body.tool_choice != null,
    has_parallel_tool_calls: body.parallel_tool_calls != null,
    has_previous_response_id: Boolean(body.previous_response_id),
    input_type: getInputType(body),
    body_size: estimateBodySize(body),
    upstream_status: 0,
    response_content_type: "",
    is_sse: false,
    first_event_type: "",
    event_count: 0,
    has_tool_call_event: false,
    has_function_call_event: hasResponseFunctionInput(body.input) || hasResponseFunctionInput(body.messages),
    has_output_item: false,
    duration_ms: 0,
    forwarded_has_tools: false,
    forwarded_tools_count: 0,
    forwarded_has_tool_choice: false,
    forwarded_has_parallel_tool_calls: false,
    previous_response_id_preserved: Boolean(body.previous_response_id),
    text_looks_like_tool_json: false,
  };
}

function noteDiagnosticEvent(diagnostic, eventType = "", data = {}) {
  if (!diagnostic) return;
  diagnostic.event_count += 1;
  if (!diagnostic.first_event_type) diagnostic.first_event_type = eventType;
  if (eventType.includes("tool_call")) diagnostic.has_tool_call_event = true;
  if (eventType.includes("function_call")) diagnostic.has_function_call_event = true;
  if (eventType.includes("output_item")) diagnostic.has_output_item = true;
  const item = data?.item || data?.response?.output?.[data?.output_index];
  if (item?.type === "function_call") {
    diagnostic.has_tool_call_event = true;
    diagnostic.has_function_call_event = true;
  }
  const deltaText = typeof data?.delta === "string"
    ? data.delta
    : typeof data?.part?.text === "string"
      ? data.part.text
      : typeof data?.response?.output_text === "string"
        ? data.response.output_text
        : "";
  if (deltaText) diagnostic.text_looks_like_tool_json = diagnostic.text_looks_like_tool_json || textLooksLikeToolJson(deltaText);
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

function finalizeCodexDiagnostic(diagnostic, patch = {}) {
  if (!diagnostic) return;
  Object.assign(diagnostic, patch);
  try {
    console.info(CODEX_DIAGNOSTIC_PREFIX, JSON.stringify(diagnostic));
  } catch {
    console.info(CODEX_DIAGNOSTIC_PREFIX, "{\"error\":\"diagnostic_serialization_failed\"}");
  }
}

function sendJsonAfterDelivery(res, statusCode = 200, payload = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      res.off?.("finish", onFinish);
      res.off?.("close", onClose);
      res.off?.("error", onError);
    };
    const done = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onFinish = () => done({ delivered: true, status: "delivered" });
    const onClose = () => {
      if (res.writableFinished || res.finished || res.writableEnded) {
        done({ delivered: true, status: "delivered" });
      } else {
        done({ delivered: false, status: "client_aborted" });
      }
    };
    const onError = (error) => done({ delivered: false, status: "downstream_failed", errorMessage: error?.message || "downstream write failed" });

    res.once?.("finish", onFinish);
    res.once?.("close", onClose);
    res.once?.("error", onError);

    try {
      const text = JSON.stringify(payload);
      res.statusCode = Number(statusCode || 200);
      if (!res.getHeader?.("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
      if (!res.getHeader?.("Cache-Control")) res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", Buffer.byteLength(text));
      res.end(text);
    } catch (error) {
      onError(error);
    }
  });
}

async function refundDeliveredChatIfNeeded(req, chatJson = {}, reason = "responses_downstream_failed") {
  const requestId = String(chatJson?.request_id || chatJson?.token_router?.request_id || "").trim();
  const amount = Number(chatJson?.token_router?.estimated_cost_cny || chatJson?.token_router?.user_charge || chatJson?.cost || 0);
  if (!requestId || amount <= 0) return null;
  const match = await findCustomerByToken(getClientToken(req)).catch(() => null);
  if (!match?.customer?.id) return null;
  return issueRefundCreditForRequest({
    customerId: match.customer.id,
    requestId,
    amount,
    reason,
  }).catch((error) => {
    console.error("[v1/responses] downstream refund failed:", error);
    return null;
  });
}

function normalizeContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        if (item.type === "input_text" || item.type === "output_text" || item.type === "text") return item.text || "";
        if (item.type === "refusal") return item.refusal || "";
        return item.text || item.content || item.input_text || item.output_text || item.output || "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    if (content.type === "input_text" || content.type === "output_text" || content.type === "text") return content.text || "";
    return content.text || content.content || content.input_text || content.output_text || content.output || JSON.stringify(content);
  }
  return "";
}

function normalizeChatRole(role) {
  const value = String(role || "").toLowerCase();
  if (value === "assistant") return "assistant";
  if (value === "system" || value === "developer") return "system";
  if (value === "tool") return "tool";
  return "user";
}

function normalizeChatToolCalls(toolCalls = []) {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls
    .map((toolCall, index) => {
      if (!toolCall || typeof toolCall !== "object") return null;
      const fn = toolCall.function || {};
      const name = String(fn.name || toolCall.name || "").trim();
      if (!name) return null;
      const rawArguments = fn.arguments ?? toolCall.arguments ?? "{}";
      const args = typeof rawArguments === "string" ? rawArguments : JSON.stringify(rawArguments || {});
      const id = String(toolCall.id || toolCall.call_id || `call_${index + 1}`).trim();
      return {
        id,
        type: "function",
        function: { name, arguments: args },
      };
    })
    .filter(Boolean);
}

function responseFunctionCallToChatMessage(item = {}, index = 0) {
  const name = String(item.name || item.function?.name || "").trim();
  if (!name) return null;
  const callId = String(item.call_id || item.id || `call_${index + 1}`).trim();
  const rawArguments = item.arguments ?? item.function?.arguments ?? "{}";
  const args = typeof rawArguments === "string" ? rawArguments : JSON.stringify(rawArguments || {});
  return {
    role: "assistant",
    content: null,
    tool_calls: [{ id: callId, type: "function", function: { name, arguments: args } }],
  };
}

function responseFunctionOutputToChatMessage(item = {}) {
  const callId = String(item.call_id || item.id || item.tool_call_id || "").trim();
  const content = normalizeContent(item.output ?? item.content ?? item.text ?? "");
  if (!callId) return content ? { role: "user", content } : null;
  return {
    role: "tool",
    tool_call_id: callId,
    content: content || "",
  };
}

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((message, index) => {
      if (message?.type === "function_call") return responseFunctionCallToChatMessage(message, index);
      if (message?.type === "function_call_output") return responseFunctionOutputToChatMessage(message);

      const role = normalizeChatRole(message?.role);
      const content = normalizeContent(message?.content ?? message?.text ?? message?.input_text ?? "");
      if (role === "tool") {
        const toolCallId = String(message?.tool_call_id || message?.call_id || "").trim();
        return toolCallId ? { role: "tool", tool_call_id: toolCallId, content } : null;
      }

      const rawToolCalls = [
        ...(Array.isArray(message?.tool_calls) ? message.tool_calls : []),
        ...(Array.isArray(message?.toolCalls) ? message.toolCalls : []),
        ...(message?.function_call ? [message.function_call] : []),
      ];
      const toolCalls = normalizeChatToolCalls(rawToolCalls);
      if (toolCalls.length > 0) return { role: "assistant", content: content || null, tool_calls: toolCalls };
      return content ? { role, content } : null;
    })
    .filter(Boolean);
}

function inputToMessages(input, instructions) {
  const messages = [];
  if (instructions) {
    messages.push({ role: "system", content: normalizeContent(instructions) });
  }

  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const [index, item] of input.entries()) {
      if (typeof item === "string") {
        messages.push({ role: "user", content: item });
      } else if (item?.type === "function_call") {
        const message = responseFunctionCallToChatMessage(item, index);
        if (message) messages.push(message);
      } else if (item?.type === "function_call_output") {
        const message = responseFunctionOutputToChatMessage(item);
        if (message) messages.push(message);
      } else if (item?.type === "message" || item?.role) {
        const normalized = normalizeMessages([item]);
        messages.push(...normalized);
      } else {
        const content = normalizeContent(item);
        if (content) messages.push({ role: "user", content });
      }
    }
  }

  if (messages.length === 0) {
    messages.push({ role: "user", content: "ping" });
  }

  return messages;
}

function normalizeResponsesModel(model) {
  const rawModel = String(model || "").trim();
  const normalizedModel = normalizeModelLookup(rawModel);
  if (SUPPORTED_MODEL_IDS.has(rawModel) || getCatalogModel(normalizedModel)) return getPublicModelRequestId(normalizedModel);

  const name = rawModel.toLowerCase();

  if (name === "chatgpt5.5" || name === "chatgpt-5.5" || name === "chatgpt55") return "flowapi-gpt55";
  if (name.includes("reasoner") || name.includes("r1")) return "deepseek-reasoner";
  if (name.includes("deepseek")) return "deepseek-chat";
  if (name.includes("qwen") || name.includes("alibaba")) return "qwen/qwen3-32b";
  if (name.includes("claude") || name.includes("anthropic")) return "anthropic/claude-3.5-haiku";
  if (name.includes("flowapi-codex") || name.includes("codex")) return "flowapi-codex-plus";
  if (name.includes("gpt5.5-pro") || name.includes("gpt55-pro")) return "flowapi-gpt55";
  if (name.includes("gpt-5.5-pro")) return "flowapi-gpt55";
  if (name.includes("gpt5.5") || name.includes("gpt55")) return "flowapi-gpt55";
  if (name.includes("gpt-5.5")) return "flowapi-gpt55";
  if (name.includes("gpt5.4-pro") || name.includes("gpt54-pro")) return "flowapi-gpt54-pro";
  if (name.includes("gpt-5.4-pro")) return "flowapi-gpt54-pro";
  if (name.includes("gpt5.4-mini") || name.includes("gpt54-mini") || name.includes("gpt54")) return "flowapi-gpt54";
  if (name.includes("gpt-5.4")) return "flowapi-gpt54";
  if (name.includes("gpt-5.3-codex")) return "flowapi-codex-plus";
  if (name.includes("gpt-4o-mini")) return "flowapi-gpt54";
  if (name.includes("gpt") || name.includes("openai")) return "flowapi-gpt54";

  return "deepseek-chat";
}

function normalizeToolForChat(tool = {}) {
  if (!tool || typeof tool !== "object") return null;
  if (tool.type === "function" && !tool.function) {
    const name = String(tool.name || "").trim();
    if (!name) return null;
    return {
      type: "function",
      function: {
        name,
        ...(tool.description ? { description: String(tool.description) } : {}),
        parameters: tool.parameters || tool.input_schema || {},
        ...(tool.strict != null ? { strict: tool.strict } : {}),
      },
    };
  }
  if (tool.type === "function" && tool.function?.name) return tool;
  if (tool.name) {
    return {
      type: "function",
      function: {
        name: String(tool.name),
        ...(tool.description ? { description: String(tool.description) } : {}),
        parameters: tool.parameters || tool.input_schema || {},
      },
    };
  }
  return null;
}

function normalizeToolsForChat(tools = []) {
  if (!Array.isArray(tools)) return [];
  return tools.map(normalizeToolForChat).filter(Boolean);
}

function normalizeToolChoiceForChat(toolChoice) {
  if (!toolChoice || typeof toolChoice === "string") return toolChoice;
  if (toolChoice.type === "function" && toolChoice.name && !toolChoice.function) {
    return { type: "function", function: { name: toolChoice.name } };
  }
  return toolChoice;
}

function responsesToChatCompletions(body = {}) {
  const chatMessages = normalizeMessages(body.messages);
  const messages = chatMessages.length > 0
    ? chatMessages
    : inputToMessages(body.input, body.instructions);
  const stream = body.stream === true;
  const tools = normalizeToolsForChat(body.tools);
  const toolChoice = normalizeToolChoiceForChat(body.tool_choice);

  return {
    model: normalizeResponsesModel(body.model),
    messages,
    ...(body.temperature != null ? { temperature: body.temperature } : {}),
    ...(body.max_output_tokens ? { max_tokens: body.max_output_tokens } : {}),
    ...(body.stream != null ? { stream } : {}),
    ...(stream ? { stream_options: { include_usage: true, ...(body.stream_options || {}) } } : {}),
    ...(body.top_p != null ? { top_p: body.top_p } : {}),
    ...(tools.length > 0 ? { tools } : {}),
    ...(toolChoice != null ? { tool_choice: toolChoice } : {}),
    ...(body.parallel_tool_calls != null ? { parallel_tool_calls: body.parallel_tool_calls } : {}),
    ...(body.previous_response_id ? { previous_response_id: String(body.previous_response_id) } : {}),
    ...(body.metadata && typeof body.metadata === "object" ? { metadata: body.metadata } : {}),
    ...(body.reasoning != null ? { reasoning: body.reasoning } : {}),
    ...(body.store != null ? { store: body.store } : {}),
    ...(body.request_id ? { request_id: body.request_id } : {}),
    ...(body.requestId ? { requestId: body.requestId } : {}),
  };
}

function normalizeResponsesUsage(usage = {}) {
  return {
    input_tokens: Number(usage.input_tokens || usage.prompt_tokens || 0),
    output_tokens: Number(usage.output_tokens || usage.completion_tokens || 0),
    total_tokens: Number(usage.total_tokens || ((usage.input_tokens || usage.prompt_tokens || 0) + (usage.output_tokens || usage.completion_tokens || 0))),
  };
}

function buildResponseFunctionCallItem(toolCall = {}, index = 0) {
  const fn = toolCall.function || {};
  const name = String(fn.name || toolCall.name || "").trim();
  if (!name) return null;
  const callId = String(toolCall.id || toolCall.call_id || `call_${index + 1}`).trim();
  const rawArguments = fn.arguments ?? toolCall.arguments ?? "{}";
  const args = typeof rawArguments === "string" ? rawArguments : JSON.stringify(rawArguments || {});
  const itemId = String(toolCall.response_item_id || "").trim() || `fc_${callId.replace(/^call_/, "") || index + 1}`;
  return {
    id: itemId,
    type: "function_call",
    status: "completed",
    call_id: callId,
    name,
    arguments: args,
  };
}

function extractResponsesOutputText(output = []) {
  if (!Array.isArray(output)) return "";
  return output
    .map((item) => {
      if (item?.type !== "message" || !Array.isArray(item.content)) return "";
      return item.content
        .map((part) => part?.text || part?.output_text || part?.content || "")
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeExistingResponsePayload(chatBody, chatResponse) {
  if (!chatResponse || typeof chatResponse !== "object" || Array.isArray(chatResponse)) return null;
  if (chatResponse.object !== "response" && !Array.isArray(chatResponse.output)) return null;
  const requestId = String(chatResponse?.request_id || chatResponse?.token_router?.request_id || "").trim();
  const previousResponseId = String(chatBody?.previous_response_id || chatResponse?.previous_response_id || "").trim();
  const responseId = String(chatResponse?.id || "").startsWith("resp_")
    ? chatResponse.id
    : `resp_${(requestId || chatResponse?.id || Date.now().toString(36)).toString().replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const output = Array.isArray(chatResponse.output) ? chatResponse.output : [];
  const outputText = typeof chatResponse.output_text === "string"
    ? chatResponse.output_text
    : extractResponsesOutputText(output);
  return {
    ...chatResponse,
    id: responseId,
    request_id: requestId || chatResponse.request_id || undefined,
    previous_response_id: previousResponseId || undefined,
    object: "response",
    created_at: Number(chatResponse.created_at || Math.floor(Date.now() / 1000)),
    status: chatResponse.status || "completed",
    model: chatResponse.model || chatBody.model,
    output,
    output_text: outputText,
    usage: normalizeResponsesUsage(chatResponse.usage || {}),
  };
}

function chatCompletionToResponse(chatBody, chatResponse) {
  const existingResponse = normalizeExistingResponsePayload(chatBody, chatResponse);
  if (existingResponse) return existingResponse;
  const choice = chatResponse?.choices?.[0] || {};
  const message = choice.message || {};
  const usage = normalizeResponsesUsage(chatResponse?.usage || {});
  const text = typeof message.content === "string"
    ? message.content
    : normalizeContent(message.content);
  const requestId = String(chatResponse?.request_id || chatResponse?.token_router?.request_id || "").trim();
  const previousResponseId = String(chatBody?.previous_response_id || "").trim();
  const responseId = String(chatResponse?.id || "").startsWith("resp_")
    ? chatResponse.id
    : `resp_${(requestId || chatResponse?.id || Date.now().toString(36)).toString().replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const output = [];

  if (text) {
    output.push({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }],
    });
  }

  const toolCalls = [
    ...(Array.isArray(message.tool_calls) ? message.tool_calls : []),
    ...(message.function_call ? [{ id: message.function_call.id || message.function_call.call_id || "call_1", type: "function", function: message.function_call }] : []),
  ];
  for (const [index, toolCall] of toolCalls.entries()) {
    const item = buildResponseFunctionCallItem(toolCall, index);
    if (item) output.push(item);
  }

  if (output.length === 0) {
    output.push({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "" }],
    });
  }

  return {
    id: responseId,
    request_id: requestId || undefined,
    previous_response_id: previousResponseId || undefined,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: chatResponse?.model || chatBody.model,
    output,
    output_text: text,
    usage,
  };
}

function adaptChatErrorForResponses(payload, status = 502) {
  if (!payload || typeof payload !== "object") return payload;
  const code = payload.code || payload.error?.code || "";
  if (code !== "MODEL_SERVICE_ERROR" && code !== "MODEL_SERVICE_REQUEST_FAILED") return payload;
  return {
    ...payload,
    suggestion: getUpstreamSuggestion(status, "responses"),
  };
}

function getInternalChatUrl() {
  const configured = process.env.INTERNAL_FLOWAPI_BASE_URL?.replace(/\/+$/, "");
  if (configured) return `${configured}/api/v1/chat/completions`;
  const port = process.env.FLOWAPI_INTERNAL_PORT || process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/v1/chat/completions`;
}

function makeResponseId() {
  return `resp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function writeResponsesSse(res, event, data, diagnostic = null) {
  if (res.writableEnded || res.destroyed) return false;
  noteDiagnosticEvent(diagnostic, event, data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof res.flush === "function") res.flush();
  return true;
}

function extractChatDelta(event = {}) {
  const choice = Array.isArray(event?.choices) ? event.choices[0] : null;
  const delta = choice?.delta?.content
    ?? choice?.message?.content
    ?? event?.delta?.text
    ?? event?.content?.[0]?.text
    ?? "";
  return typeof delta === "string" ? delta : normalizeContent(delta);
}

function extractChatToolCallDeltas(event = {}) {
  const choice = Array.isArray(event?.choices) ? event.choices[0] : null;
  const deltas = choice?.delta?.tool_calls || choice?.message?.tool_calls || [];
  const normalized = Array.isArray(deltas) ? [...deltas] : [];
  const legacyFunctionCall = choice?.delta?.function_call || choice?.message?.function_call || event?.function_call;
  if (legacyFunctionCall && typeof legacyFunctionCall === "object") {
    normalized.push({
      index: 0,
      id: legacyFunctionCall.id || legacyFunctionCall.call_id || "call_legacy_1",
      type: "function",
      function: {
        name: legacyFunctionCall.name || "",
        arguments: legacyFunctionCall.arguments || "",
      },
    });
  }
  return normalized;
}

function mergeChatToolCallDeltas(target = [], deltas = []) {
  for (const delta of deltas) {
    if (!delta || typeof delta !== "object") continue;
    const index = Number.isInteger(delta.index) ? delta.index : target.length;
    if (!target[index]) target[index] = { id: "", type: "function", function: { name: "", arguments: "" } };
    if (delta.id) target[index].id = delta.id;
    if (delta.type) target[index].type = delta.type;
    if (delta.function?.name) target[index].function.name += delta.function.name;
    if (delta.function?.arguments) target[index].function.arguments += delta.function.arguments;
    if (delta.name) target[index].function.name += delta.name;
    if (delta.arguments) target[index].function.arguments += delta.arguments;
  }
}

function buildOutputMessage({ outputItemId, outputText = "", status = "in_progress" }) {
  return {
    id: outputItemId,
    type: "message",
    status,
    role: "assistant",
    content: outputText
      ? [{ type: "output_text", text: outputText }]
      : [],
  };
}

function buildCompletedResponse({ responseId, requestId = "", previousResponseId = "", createdAt, model, outputText, outputItems, usage }) {
  return {
    id: responseId,
    request_id: requestId || undefined,
    previous_response_id: previousResponseId || undefined,
    object: "response",
    created_at: createdAt,
    status: "completed",
    model,
    output: outputItems?.length
      ? outputItems
      : [buildOutputMessage({ outputItemId: `msg_${responseId.slice(5)}`, outputText, status: "completed" })],
    output_text: outputText,
    usage: normalizeResponsesUsage(usage || {}),
  };
}

function buildFailedStreamEvent({ responseId, requestId = "", previousResponseId = "", createdAt, model, code = "STREAM_INCOMPLETE" }) {
  return {
    type: "response.failed",
    request_id: requestId || undefined,
    response: {
      id: responseId,
      request_id: requestId || undefined,
      previous_response_id: previousResponseId || undefined,
      object: "response",
      created_at: createdAt,
      status: "failed",
      model,
      error: {
        message: "当前响应传输中断，请稍后重试。",
        type: "stream_incomplete",
        code,
      },
    },
  };
}

async function streamResponsesPassThrough({ chatRes, res, abortController, diagnostic = null, startedAt = Date.now() }) {
  const nodeStream = Readable.fromWeb(chatRes.body);
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let streamEnded = false;
  let diagnosticLogged = false;

  const logStreamDiagnostic = (patch = {}) => {
    if (diagnosticLogged) return;
    diagnosticLogged = true;
    finalizeCodexDiagnostic(diagnostic, {
      upstream_status: chatRes.status,
      response_content_type: chatRes.headers.get("content-type") || "",
      is_sse: true,
      duration_ms: Date.now() - startedAt,
      ...patch,
    });
  };

  const processText = (text = "", { flush = false } = {}) => {
    sseBuffer += text;
    const lines = sseBuffer.split(/\r?\n/);
    sseBuffer = flush ? "" : (lines.pop() || "");
    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload);
        noteDiagnosticEvent(diagnostic, String(event?.type || "response.event"), event);
      } catch {
        // Preserve raw SSE even when a single event body is not valid JSON.
      }
    }
  };

  res.status(chatRes.status);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  res.on("close", () => {
    if (streamEnded) return;
    abortController?.abort();
    logStreamDiagnostic({ stream_closed_by_client: true });
    nodeStream.destroy(new Error("CLIENT_CONNECTION_CLOSED"));
  });

  nodeStream.on("data", (chunk) => {
    const text = decoder.decode(chunk, { stream: true });
    processText(text);
    if (!res.writableEnded && !res.destroyed) res.write(text);
    if (typeof res.flush === "function" && !res.writableEnded && !res.destroyed) res.flush();
  });

  nodeStream.on("end", () => {
    streamEnded = true;
    const tail = decoder.decode();
    if (tail) {
      processText(tail, { flush: true });
      if (!res.writableEnded && !res.destroyed) res.write(tail);
    }
    logStreamDiagnostic();
    res.end();
  });

  nodeStream.on("error", () => {
    streamEnded = true;
    if (!res.writableEnded && !res.destroyed) {
      writeResponsesSse(res, "response.failed", buildFailedStreamEvent({ responseId: makeResponseId(), code: "STREAM_INCOMPLETE" }), diagnostic);
    }
    logStreamDiagnostic({ stream_error: true });
    res.end();
  });

  return new Promise((resolve) => {
    nodeStream.once("end", resolve);
    nodeStream.once("error", resolve);
  });
}

async function streamChatAsResponses({ chatRes, chatBody, res, abortController, diagnostic = null, startedAt = Date.now() }) {
  const responseId = makeResponseId();
  const outputItemId = `msg_${responseId.slice(5)}`;
  const createdAt = Math.floor(Date.now() / 1000);
  const model = chatBody.model;
  const nodeStream = Readable.fromWeb(chatRes.body);
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let outputText = "";
  const accumulatedToolCalls = [];
  let usage = null;
  let completed = false;
  let streamEnded = false;
  let flowRequestId = String(chatBody.request_id || chatBody.requestId || "").trim();
  const previousResponseId = String(chatBody.previous_response_id || "").trim();
  const toolIndexes = new Map();
  const emittedToolIndexes = new Set();
  const emittedToolArgumentDeltas = new Set();
  let createdSent = false;
  let outputItemStarted = false;
  let contentPartStarted = false;
  let textOutputIndex = 0;

  const responseBase = (status = "in_progress") => ({
    id: responseId,
    request_id: flowRequestId || undefined,
    previous_response_id: previousResponseId || undefined,
    object: "response",
    created_at: createdAt,
    status,
    model,
    output: [],
    usage: null,
  });
  const sendCreated = () => {
    if (createdSent || res.writableEnded || res.destroyed) return;
    createdSent = true;
    writeResponsesSse(res, "response.created", {
      type: "response.created",
      request_id: flowRequestId || undefined,
      response: responseBase("in_progress"),
    }, diagnostic);
  };

  const sendOutputItemStarted = () => {
    sendCreated();
    if (outputItemStarted || res.writableEnded || res.destroyed) return;
    outputItemStarted = true;
    writeResponsesSse(res, "response.output_item.added", {
      type: "response.output_item.added",
      request_id: flowRequestId || undefined,
      response_id: responseId,
      output_index: ensureTextOutputIndex(),
      item: buildOutputMessage({ outputItemId, status: "in_progress" }),
    }, diagnostic);
  };

  const ensureTextOutputIndex = () => {
    if (!outputItemStarted && toolIndexes.size > 0) {
      textOutputIndex = Math.max(...toolIndexes.values()) + 1;
    }
    return textOutputIndex;
  };

  const sendContentPartStarted = () => {
    sendOutputItemStarted();
    if (contentPartStarted || res.writableEnded || res.destroyed) return;
    contentPartStarted = true;
    writeResponsesSse(res, "response.content_part.added", {
      type: "response.content_part.added",
      request_id: flowRequestId || undefined,
      response_id: responseId,
      item_id: outputItemId,
      output_index: ensureTextOutputIndex(),
      content_index: 0,
      part: { type: "output_text", text: "" },
    }, diagnostic);
  };

  const getToolOutputIndex = (index = 0) => {
    if (!toolIndexes.has(index)) {
      const base = outputItemStarted ? 1 : 0;
      toolIndexes.set(index, base + toolIndexes.size);
    }
    return toolIndexes.get(index);
  };

  const emitToolCallDeltaEvents = (deltas = []) => {
    for (const delta of deltas) {
      if (!delta || typeof delta !== "object") continue;
      const index = Number.isInteger(delta.index) ? delta.index : 0;
      const toolCall = accumulatedToolCalls[index];
      const item = buildResponseFunctionCallItem(toolCall, index);
      if (!item) continue;
      const outputIndex = getToolOutputIndex(index);
      if (!emittedToolIndexes.has(index)) {
        emittedToolIndexes.add(index);
        writeResponsesSse(res, "response.output_item.added", {
          type: "response.output_item.added",
          request_id: flowRequestId || undefined,
          response_id: responseId,
          output_index: outputIndex,
          item: { ...item, arguments: "" },
        }, diagnostic);
      }
      const argsDelta = delta.function?.arguments ?? delta.arguments ?? "";
      if (argsDelta) {
        emittedToolArgumentDeltas.add(index);
        writeResponsesSse(res, "response.function_call_arguments.delta", {
          type: "response.function_call_arguments.delta",
          request_id: flowRequestId || undefined,
          response_id: responseId,
          item_id: item.id,
          output_index: outputIndex,
          delta: argsDelta,
        }, diagnostic);
      }
    }
  };

  const completeOnce = () => {
    if (completed) return;
    sendCreated();
    completed = true;
    const outputItemsWithIndexes = [];
    const toolItems = accumulatedToolCalls
      .map((toolCall, index) => ({ index, item: buildResponseFunctionCallItem(toolCall, index) }))
      .filter((entry) => Boolean(entry.item));

    if (outputText || toolItems.length === 0) {
      sendContentPartStarted();
      const textIndex = ensureTextOutputIndex();
      writeResponsesSse(res, "response.output_text.done", {
        type: "response.output_text.done",
        request_id: flowRequestId || undefined,
        response_id: responseId,
        item_id: outputItemId,
        output_index: textIndex,
        content_index: 0,
        text: outputText,
      }, diagnostic);
      writeResponsesSse(res, "response.content_part.done", {
        type: "response.content_part.done",
        request_id: flowRequestId || undefined,
        response_id: responseId,
        item_id: outputItemId,
        output_index: textIndex,
        content_index: 0,
        part: { type: "output_text", text: outputText },
      }, diagnostic);
      const textItem = buildOutputMessage({ outputItemId, outputText, status: "completed" });
      writeResponsesSse(res, "response.output_item.done", {
        type: "response.output_item.done",
        request_id: flowRequestId || undefined,
        response_id: responseId,
        output_index: textIndex,
        item: textItem,
      }, diagnostic);
      outputItemsWithIndexes.push({ index: textIndex, item: textItem });
    }

    for (const { index, item: toolItem } of toolItems) {
      const outputIndex = getToolOutputIndex(index);
      if (!emittedToolIndexes.has(index)) {
        emittedToolIndexes.add(index);
        writeResponsesSse(res, "response.output_item.added", {
          type: "response.output_item.added",
          request_id: flowRequestId || undefined,
          response_id: responseId,
          output_index: outputIndex,
          item: { ...toolItem, arguments: "" },
        }, diagnostic);
      }
      if (toolItem.arguments && !emittedToolArgumentDeltas.has(index)) {
        writeResponsesSse(res, "response.function_call_arguments.delta", {
          type: "response.function_call_arguments.delta",
          request_id: flowRequestId || undefined,
          response_id: responseId,
          item_id: toolItem.id,
          output_index: outputIndex,
          delta: toolItem.arguments,
        }, diagnostic);
      }
      writeResponsesSse(res, "response.function_call_arguments.done", {
        type: "response.function_call_arguments.done",
        request_id: flowRequestId || undefined,
        response_id: responseId,
        item_id: toolItem.id,
        output_index: outputIndex,
        arguments: toolItem.arguments,
      }, diagnostic);
      writeResponsesSse(res, "response.output_item.done", {
        type: "response.output_item.done",
        request_id: flowRequestId || undefined,
        response_id: responseId,
        output_index: outputIndex,
        item: toolItem,
      }, diagnostic);
      outputItemsWithIndexes.push({ index: outputIndex, item: toolItem });
    }

    const outputItems = outputItemsWithIndexes
      .sort((a, b) => a.index - b.index)
      .map((entry) => entry.item);
    diagnostic && (diagnostic.text_looks_like_tool_json = diagnostic.text_looks_like_tool_json || textLooksLikeToolJson(outputText));
    writeResponsesSse(res, "response.completed", {
      type: "response.completed",
      request_id: flowRequestId || undefined,
      response: buildCompletedResponse({ responseId, requestId: flowRequestId, previousResponseId, createdAt, model, outputText, outputItems, usage }),
    }, diagnostic);
  };

  const failOnce = (code = "STREAM_INCOMPLETE") => {
    if (completed || res.writableEnded || res.destroyed) return;
    sendCreated();
    completed = true;
    writeResponsesSse(res, "response.failed", buildFailedStreamEvent({ responseId, requestId: flowRequestId, previousResponseId, createdAt, model, code }), diagnostic);
  };

  const processLine = (line = "") => {
    const trimmed = String(line || "").trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    if (payload === "[DONE]") {
      completeOnce();
      return;
    }

    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }

    const eventRequestId = String(event?.request_id || event?.token_router?.request_id || event?.id || "").trim();
    if (/[ABCDX]$/.test(eventRequestId)) flowRequestId = eventRequestId;
    if (event?.usage) usage = event.usage;
    const toolDeltas = extractChatToolCallDeltas(event);
    if (toolDeltas.length > 0) {
      mergeChatToolCallDeltas(accumulatedToolCalls, toolDeltas);
      emitToolCallDeltaEvents(toolDeltas);
    }
    const delta = extractChatDelta(event);
    if (delta) {
      outputText += delta;
      sendContentPartStarted();
      diagnostic && (diagnostic.text_looks_like_tool_json = diagnostic.text_looks_like_tool_json || textLooksLikeToolJson(delta));
      writeResponsesSse(res, "response.output_text.delta", {
        type: "response.output_text.delta",
        request_id: flowRequestId || undefined,
        response_id: responseId,
        item_id: outputItemId,
        output_index: ensureTextOutputIndex(),
        content_index: 0,
        delta,
      }, diagnostic);
    }
  };

  const transformText = (text = "", { flush = false } = {}) => {
    sseBuffer += text;
    const lines = sseBuffer.split(/\r?\n/);
    sseBuffer = flush ? "" : (lines.pop() || "");
    for (const line of lines) processLine(line);
  };

  let diagnosticLogged = false;
  const logStreamDiagnostic = (patch = {}) => {
    if (diagnosticLogged) return;
    diagnosticLogged = true;
    finalizeCodexDiagnostic(diagnostic, {
      upstream_status: chatRes.status,
      response_content_type: chatRes.headers.get("content-type") || "",
      is_sse: true,
      duration_ms: Date.now() - startedAt,
      ...patch,
    });
  };

  res.status(chatRes.status);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  res.on("close", () => {
    if (streamEnded || completed) return;
    abortController?.abort();
    logStreamDiagnostic({ stream_closed_by_client: true });
    nodeStream.destroy(new Error("CLIENT_CONNECTION_CLOSED"));
  });

  nodeStream.on("data", (chunk) => {
    transformText(decoder.decode(chunk, { stream: true }));
  });

  nodeStream.on("end", () => {
    streamEnded = true;
    transformText(decoder.decode(), { flush: true });
    if (!completed && chatRes.status >= 200 && chatRes.status < 300 && (outputText || accumulatedToolCalls.length > 0)) completeOnce();
    if (!completed) failOnce("STREAM_INCOMPLETE");
    logStreamDiagnostic();
    res.end();
  });

  nodeStream.on("error", () => {
    streamEnded = true;
    failOnce("STREAM_INCOMPLETE");
    logStreamDiagnostic({ stream_error: true });
    res.end();
  });

  return new Promise((resolve) => {
    nodeStream.once("end", resolve);
    nodeStream.once("error", resolve);
  });
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({
      error: {
        message: "请使用 POST 请求调用 /v1/responses。",
        type: "method_not_allowed",
      },
    });
  }

  const startedAt = Date.now();
  const requestBody = req.body || {};
  const chatBody = {
    ...responsesToChatCompletions(requestBody),
    __flowapi_responses_request: requestBody,
  };
  const diagnostic = buildCodexDiagnostic(req, requestBody);
  const flowDebugEnabled = shouldExposeFlowDebugHeaders(req);
  diagnostic.forwarded_has_tools = Array.isArray(chatBody.tools) && chatBody.tools.length > 0;
  diagnostic.forwarded_tools_count = Array.isArray(chatBody.tools) ? chatBody.tools.length : 0;
  diagnostic.forwarded_has_tool_choice = chatBody.tool_choice != null;
  diagnostic.forwarded_has_parallel_tool_calls = chatBody.parallel_tool_calls != null;
  const abortController = new AbortController();
  const configuredTimeoutMs = Number(process.env.RESPONSES_ADAPTER_TIMEOUT_MS || process.env.UPSTREAM_REQUEST_TIMEOUT_MS || 600_000);
  const timeoutMs = Number.isFinite(configuredTimeoutMs) ? Math.max(60_000, configuredTimeoutMs) : 600_000;
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const chatRes = await fetch(getInternalChatUrl(), {
      method: "POST",
      headers: {
        Authorization: req.headers.authorization || (req.headers["x-api-key"] ? `Bearer ${req.headers["x-api-key"]}` : ""),
        "Content-Type": "application/json",
        "x-flowapi-wire-api": "responses",
        "x-flowapi-codex-diagnostic": "1",
        ...(req.headers["x-flow-debug"] ? { "x-flow-debug": req.headers["x-flow-debug"] } : {}),
        ...(req.headers["x-flowapi-debug"] ? { "x-flowapi-debug": req.headers["x-flowapi-debug"] } : {}),
        ...(req.headers["idempotency-key"] ? { "Idempotency-Key": req.headers["idempotency-key"] } : {}),
        ...(req.headers["x-request-id"] ? { "x-request-id": req.headers["x-request-id"] } : {}),
      },
      body: JSON.stringify(chatBody),
      signal: abortController.signal,
    });

    const upstreamContentType = chatRes.headers.get("content-type") || "";
    const upstreamEndpointType = String(chatRes.headers.get("x-flowapi-upstream-endpoint") || "").toLowerCase();
    copyFlowDebugHeaders(chatRes.headers, res, flowDebugEnabled);
    diagnostic.upstream_status = chatRes.status;
    diagnostic.response_content_type = upstreamContentType;
    diagnostic.is_sse = upstreamContentType.includes("text/event-stream");
    if (chatBody.stream && upstreamContentType.includes("text/event-stream") && chatRes.body) {
      if (upstreamEndpointType === "responses") {
        await streamResponsesPassThrough({ chatRes, res, abortController, diagnostic, startedAt });
        return;
      }
      await streamChatAsResponses({ chatRes, chatBody, res, abortController, diagnostic, startedAt });
      return;
    }

    const chatJson = await chatRes.json().catch(() => null);
    if (!chatRes.ok || !chatJson) {
      finalizeCodexDiagnostic(diagnostic, {
        duration_ms: Date.now() - startedAt,
        error_passthrough: true,
      });
      await sendJsonAfterDelivery(res, chatRes.status || 502, adaptChatErrorForResponses(chatJson, chatRes.status || 502) || {
        error: {
          message: "FlowAPI Responses 适配失败，请检查 API Key、Base URL 和模型名。",
          type: "flowapi_responses_adapter_error",
        },
      });
      return;
    }

    const payload = upstreamEndpointType === "responses"
      ? (normalizeExistingResponsePayload(requestBody, chatJson) || chatJson)
      : chatCompletionToResponse(chatBody, chatJson);
    for (const [index, item] of (payload.output || []).entries()) {
      noteDiagnosticEvent(diagnostic, item?.type === "function_call" ? "response.function_call" : "response.output_item", { item, output_index: index });
    }
    finalizeCodexDiagnostic(diagnostic, {
      duration_ms: Date.now() - startedAt,
      text_looks_like_tool_json: textLooksLikeToolJson(payload.output_text),
    });
    const delivery = await sendJsonAfterDelivery(res, 200, payload);
    if (!delivery.delivered) {
      await refundDeliveredChatIfNeeded(req, chatJson, delivery.status === "client_aborted" ? "responses_client_aborted" : "responses_downstream_failed");
    }
    return;
  } catch (error) {
    const aborted = error?.name === "AbortError";
    if (flowDebugEnabled && !res.headersSent) {
      appendExposeHeaders(res, FLOW_DEBUG_RESPONSE_HEADERS);
      res.setHeader("X-Flow-Wire-Api", "responses");
      if (diagnostic?.request_id) res.setHeader("X-Flow-Request-Id", safeHeaderValue(diagnostic.request_id));
      if (requestBody?.model) res.setHeader("X-Flow-Model", safeHeaderValue(requestBody.model));
      res.setHeader("X-Flow-Fallback-Reason", aborted ? "responses_adapter_timeout" : "responses_adapter_error");
    }
    finalizeCodexDiagnostic(diagnostic, {
      duration_ms: Date.now() - startedAt,
      adapter_error: aborted ? "timeout" : "service_error",
    });
    if (!aborted) console.error("[v1/responses]", error);
    if (res.headersSent || res.writableEnded || res.destroyed) return;
    return res.status(aborted ? 504 : 502).json({
      error: {
        message: aborted ? "FlowAPI Responses 请求超时，请稍后重试。" : "FlowAPI Responses 适配服务暂时不可用，请稍后重试。",
        type: aborted ? "timeout" : "service_error",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

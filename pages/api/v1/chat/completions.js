import crypto from "crypto";
import { estimateCnyCost, getActualModelId, getCatalogModel, getPublicModelRequestId, normalizeModelLookup } from "@/lib/models";
import { getModelProductWithConfig } from "@/lib/model-products-server";
import { smartSelectModel } from "@/lib/smart-router";
import { beginApiRequestIdempotency, finalizeReservedCallByToken, findCustomerByToken, issueRefundCreditForRequest, reserveBalanceByToken } from "@/lib/customer-store";
import { acquireConcurrency, getClientIp, graylistKey, isGraylisted, rateLimit, releaseConcurrency, securityLog } from "@/lib/security";
import { getUpstreamConfigsAsync, getUpstreamSuggestion, sendApiError } from "@/lib/upstream";
import { selectUpstream, STRATEGY } from "@/lib/smart-router";
import { userCanUseMemberModel } from "@/lib/membership/store";
import { getContent } from "@/lib/content-cms";
import { hasDatabase, query } from "@/lib/db";
import { assertSafeUpstreamUrl, sanitizeSecretText } from "@/lib/safe-upstream-url";
import { listModelMappings, recordProviderRequestLog } from "@/lib/provider-store";
import { validateTextModelProfitConfig } from "@/lib/model-profit-guard";
import { buildResponseCacheKey, CACHE_TTLS, getCacheManager, shouldUseResponseCache } from "@/lib/cache-manager";
import {
  buildRequestCacheKey,
  enforceTeamRateLimits,
  getCachedTeamResponse,
  getUserTeamIds,
  recordTeamUsageLog,
  saveCachedTeamResponse,
  selectTeamTokenCandidatesForRequest,
} from "@/lib/team-token-pool";
import { enforceTeamMemberLimit, recordTeamMemberUsage } from "@/lib/team-management";
import { Readable } from "stream";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
    responseLimit: false,
  },
  maxDuration: 600,
};

const CODEX_CHAT_DIAGNOSTIC_PREFIX = "[flowapi-codex-chat-diagnostic]";
const TOOL_JSON_TEXT_PATTERN = /^\s*(?:```(?:json)?\s*)?\{[\s\S]{0,6000}?(?:"cmd"|"command"|"workdir"|"tool_call"|"function_call")[\s\S]*\}\s*(?:```)?\s*$/i;

const BILLING_FLOW_STATUS = {
  SUCCESS_COMPLETED: "success_completed",
  STREAM_INCOMPLETE: "stream_incomplete",
  CLIENT_ABORTED: "client_aborted",
  UPSTREAM_ERROR: "upstream_error",
  DOWNSTREAM_FAILED: "downstream_failed",
  UPSTREAM_COMPLETED_DOWNSTREAM_FAILED: "upstream_completed_downstream_failed",
  USAGE_MISSING: "usage_missing",
  STREAM_FAILED: "stream_failed",
  BILLING_PENDING_RECONCILIATION: "billing_pending_reconciliation",
  BILLING_REFUNDED: "billing_refunded",
  NOT_BILLED: "not_billed",
};

function zeroBilling(modelProduct = null) {
  return {
    sellPriceCny: 0,
    upstreamCostCny: 0,
    profitCny: 0,
    profitMargin: 0,
    billingMode: modelProduct?.pricing?.billingMode || "token_multiplier",
  };
}

function zeroUsage() {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
}

function buildRoutedRequestId(baseRequestId = "", routeNameOrCode = "") {
  const base = String(baseRequestId || "").trim().replace(/[ABCDX]$/, "");
  if (!base) return base;
  const raw = String(routeNameOrCode || "").trim();
  const explicitCode = /^[ABCDX]$/i.test(raw) ? raw.toUpperCase() : "";
  const routed = explicitCode ? `${base}${explicitCode}` : appendRouteSuffix(base, raw);
  return routed || base;
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
        done({ delivered: false, status: BILLING_FLOW_STATUS.CLIENT_ABORTED, errorCode: "CLIENT_ABORTED" });
      }
    };
    const onError = (error) => done({
      delivered: false,
      status: BILLING_FLOW_STATUS.DOWNSTREAM_FAILED,
      errorCode: "DOWNSTREAM_FAILED",
      errorMessage: error?.message || "downstream write failed",
    });

    res.once?.("finish", onFinish);
    res.once?.("close", onClose);
    res.once?.("error", onError);

    try {
      const body = JSON.stringify(payload);
      res.statusCode = Number(statusCode || 200);
      if (!res.getHeader?.("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
      if (!res.getHeader?.("Cache-Control")) res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", Buffer.byteLength(body));
      res.end(body);
    } catch (error) {
      onError(error);
    }
  });
}

async function issueDownstreamRefundIfNeeded({ customerId = "", requestId = "", callId = "", amount = 0, reason = "downstream_failed" } = {}) {
  const value = Number(amount || 0);
  if (!customerId || !requestId || value <= 0) return null;
  return issueRefundCreditForRequest({ customerId, requestId, callId, amount: value, reason }).catch((error) => {
    console.error("[flowapi] downstream refund failed:", error);
    return null;
  });
}

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

function summarizeRouteCandidate(candidate = {}, index = 0) {
  const name = safeHeaderValue(candidate.name || candidate.id || candidate.label || `attempt-${index + 1}`, 48);
  const line = routeLineFromName(candidate.name || candidate.id || candidate.label || "");
  return line ? `${line}:${name}` : name;
}

function summarizeFallbackChain(candidates = []) {
  return safeHeaderValue(candidates.map((candidate, index) => summarizeRouteCandidate(candidate, index)).filter(Boolean).join(","), 240);
}

function buildFallbackTraceEntry({ candidate = {}, attemptIndex = 0, status = 0, errorCode = "", endpointType = "", reason = "" } = {}) {
  const route = summarizeRouteCandidate(candidate, Math.max(0, attemptIndex - 1));
  const endpoint = safeHeaderValue(endpointType || "unknown", 24);
  const code = safeHeaderValue(errorCode || reason || "unknown", 56);
  const normalizedStatus = Number(status || 0);
  return safeHeaderValue(`${Math.max(1, Number(attemptIndex || 0))}:${route}@${endpoint}:${normalizedStatus || 0}:${code}`, 140);
}

function summarizeFallbackAttempt(attemptIndex = 0, total = 0) {
  const cleanAttempt = Math.max(0, Number(attemptIndex || 0));
  const cleanTotal = Math.max(0, Number(total || 0));
  if (!cleanTotal) return String(cleanAttempt || 0);
  return `${Math.min(cleanAttempt, cleanTotal)}/${cleanTotal}`;
}

function setFlowDebugHeaders(res, enabled = false, details = {}) {
  if (!enabled || !res || res.headersSent) return;
  appendExposeHeaders(res, FLOW_DEBUG_RESPONSE_HEADERS);
  const headerMap = {
    "X-Flow-Request-Id": details.requestId,
    "X-Flow-Model": details.model,
    "X-Flow-Wire-Api": details.wireApi,
    "X-Flow-Selected-Channel": details.selectedChannel,
    "X-Flow-Upstream-Provider": details.upstreamProvider,
    "X-Flow-Upstream-Model": details.upstreamModel,
    "X-Flow-Fallback-Attempt": details.fallbackAttempt,
    "X-Flow-Fallback-Chain": details.fallbackChain,
    "X-Flow-Fallback-Reason": details.fallbackReason,
    "X-Flow-Upstream-Status": details.upstreamStatus,
    "X-Flow-Upstream-Endpoint": details.upstreamEndpoint,
  };
  for (const [key, value] of Object.entries(headerMap)) {
    const safeValue = safeHeaderValue(value);
    if (safeValue) res.setHeader(key, safeValue);
  }
}

function getClientToken(req) {
  const auth = req.headers.authorization || "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : String(req.headers["x-api-key"] || "").trim();
  while (token.toLowerCase().startsWith("bearer ")) {
    token = token.slice(7).trim();
  }
  return token.replace(/^["']|["']$/g, "");
}

function estimateBodySize(value = {}) {
  try {
    return Buffer.byteLength(JSON.stringify(value || {}));
  } catch {
    return 0;
  }
}

function shouldLogCodexChatDiagnostic(req, body = {}) {
  return req.headers["x-flowapi-codex-diagnostic"] === "1"
    || req.headers["x-flowapi-wire-api"] === "responses"
    || (Array.isArray(body.tools) && body.tools.length > 0);
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

function extractChatResponseText(payload = {}) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  return choices.map((choice) => normalizeMessageContent(choice?.message?.content ?? choice?.delta?.content ?? choice?.text ?? "")).filter(Boolean).join("\n");
}

function buildCodexChatDiagnostic(req, body = {}) {
  const headerRequestId = String(req.headers["x-request-id"] || req.headers["idempotency-key"] || "").trim();
  return {
    stage: "chat_completions_upstream",
    method: "POST",
    path: "/v1/chat/completions",
    wire_api: String(req.headers["x-flowapi-wire-api"] || "chat").slice(0, 40),
    request_id: String(body.request_id || body.requestId || headerRequestId || "").slice(0, 160),
    model: String(body.model || "").slice(0, 120),
    stream: body.stream === true,
    has_tools: Array.isArray(body.tools) && body.tools.length > 0,
    tools_count: Array.isArray(body.tools) ? body.tools.length : 0,
    has_previous_response_id: Boolean(body.previous_response_id),
    body_size: estimateBodySize(body),
    incoming_body_size: estimateBodySize(body),
    incoming_shape: summarizeBodyShape(body),
    forwarded_shape: null,
    forwarded_has_tools: false,
    forwarded_tools_count: 0,
    forwarded_has_tool_choice: false,
    forwarded_has_parallel_tool_calls: false,
    user_id: "",
    api_key_id: "",
    selected_public_model: "",
    selected_upstream_model: "",
    selected_channel_id: "",
    selected_channel: "",
    selected_provider: "",
    fallback_chain: "",
    fallback_attempt: "",
    fallback_reason: "",
    upstream_status: 0,
    upstream_content_type: "",
    upstream_error_code: "",
    upstream_error_message: "",
    route_attempts: 0,
    first_event_type: "",
    event_count: 0,
    has_tool_call_event: false,
    has_function_call_event: false,
    has_output_item: false,
    text_looks_like_tool_json: false,
    duration_ms: 0,
  };
}

function noteCodexChatSseEvent(diagnostic, event = {}) {
  if (!diagnostic) return;
  diagnostic.event_count += 1;
  const objectType = String(event?.object || event?.type || "chat.completion.chunk");
  if (!diagnostic.first_event_type) diagnostic.first_event_type = objectType;
  const choice = Array.isArray(event?.choices) ? event.choices[0] : null;
  const toolCalls = choice?.delta?.tool_calls || choice?.message?.tool_calls || event?.tool_calls || [];
  const legacyFunctionCall = choice?.delta?.function_call || choice?.message?.function_call || event?.function_call;
  const responseOutput = Array.isArray(event?.response?.output) ? event.response.output : [];
  const responseItem = event?.item || responseOutput[event?.output_index] || null;
  if ((Array.isArray(toolCalls) && toolCalls.length > 0) || legacyFunctionCall || responseItem?.type === "function_call") {
    diagnostic.has_tool_call_event = true;
  }
  if (legacyFunctionCall || String(event?.type || "").includes("function_call") || responseItem?.type === "function_call") {
    diagnostic.has_function_call_event = true;
  }
  if (String(event?.type || "").includes("output_item") || responseOutput.length > 0) diagnostic.has_output_item = true;
  const deltaText = choice?.delta?.content
    ?? choice?.message?.content
    ?? (typeof event?.delta === "string" ? event.delta : event?.delta?.text)
    ?? event?.part?.text
    ?? event?.response?.output_text
    ?? "";
  if (deltaText) diagnostic.text_looks_like_tool_json = diagnostic.text_looks_like_tool_json || textLooksLikeToolJson(deltaText);
}

function finalizeCodexChatDiagnostic(diagnostic, patch = {}) {
  if (!diagnostic) return;
  Object.assign(diagnostic, patch);
  try {
    console.info(CODEX_CHAT_DIAGNOSTIC_PREFIX, JSON.stringify(diagnostic));
  } catch {
    console.info(CODEX_CHAT_DIAGNOSTIC_PREFIX, "{\"error\":\"diagnostic_serialization_failed\"}");
  }
}

function parseRequestBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return typeof body === "object" ? body : {};
}

function getPromptFromMessages(messages = []) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  return typeof lastUserMessage?.content === "string" ? lastUserMessage.content : "";
}

function normalizeMessageContent(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text" || item?.type === "input_text" || item?.type === "output_text") {
          return item.text || item.content || item.input_text || "";
        }
        return item?.text || item?.content || item?.input_text || "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (content && typeof content === "object") {
    return String(content.text || content.content || content.input_text || JSON.stringify(content)).trim();
  }
  return "";
}

function normalizeChatRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (["system", "assistant", "user", "tool"].includes(normalized)) return normalized;
  if (normalized === "developer") return "system";
  if (normalized === "function") return "tool";
  return "user";
}

function normalizeToolCalls(toolCalls = []) {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls
    .map((call, index) => {
      const fn = call?.function || {};
      const name = String(fn.name || call?.name || "").trim();
      const args = fn.arguments ?? call?.arguments ?? "{}";
      const id = String(call?.id || call?.tool_call_id || `call_${index}`).trim();
      if (!name || !id) return null;
      return {
        id,
        type: call?.type || "function",
        function: {
          name,
          arguments: typeof args === "string" ? args : JSON.stringify(args || {}),
        },
      };
    })
    .filter(Boolean);
}

function normalizeChatMessage(message = {}) {
  let role = normalizeChatRole(message?.role);
  const rawToolCalls = [
    ...(Array.isArray(message?.tool_calls) ? message.tool_calls : []),
    ...(Array.isArray(message?.toolCalls) ? message.toolCalls : []),
    ...(message?.function_call ? [{ id: message.function_call.id || message.function_call.call_id || "call_legacy_1", type: "function", function: message.function_call }] : []),
  ];
  const toolCalls = normalizeToolCalls(rawToolCalls);
  const content = normalizeMessageContent(message?.content || message?.text || message?.input_text);

  if (role === "assistant") {
    if (!content && !toolCalls.length) return null;
    return {
      role,
      content: content || "",
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      ...(message?.name ? { name: String(message.name).slice(0, 64) } : {}),
    };
  }

  if (role === "tool") {
    const toolCallId = String(message?.tool_call_id || message?.toolCallId || message?.id || "").trim();
    if (!content) return null;
    if (!toolCallId) {
      // Some clients send historical tool output without the matching assistant
      // tool_call_id. Forwarding that as role=tool makes OpenAI-compatible
      // upstreams reject the whole request, so keep the information as user text.
      return { role: "user", content: `Tool result:\n${content}` };
    }
    return {
      role: "tool",
      tool_call_id: toolCallId,
      content,
    };
  }

  if (!content) return null;
  return {
    role,
    content,
    ...(message?.name ? { name: String(message.name).slice(0, 64) } : {}),
  };
}

function normalizeChatMessages(body = {}) {
  const messages = [];
  const instructions = normalizeMessageContent(body.instructions || body.system);

  if (instructions) {
    messages.push({ role: "system", content: instructions });
  }

  if (Array.isArray(body.messages)) {
    for (const message of body.messages) {
      const normalized = normalizeChatMessage(message);
      if (normalized) messages.push(normalized);
    }
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      const content = normalizeMessageContent(item?.content || item?.text || item);
      if (!content) continue;
      messages.push({
        role: normalizeChatRole(item?.role),
        content,
      });
    }
  } else {
    const content = normalizeMessageContent(body.input || body.prompt || body.query);
    if (content) {
      messages.push({ role: "user", content });
    }
  }

  if (!messages.some((message) => message.role === "user")) {
    messages.push({ role: "user", content: "ping" });
  }

  return sanitizeChatMessageSequence(messages);
}

function toolCallIds(message = {}) {
  return Array.isArray(message.tool_calls)
    ? message.tool_calls.map((call) => String(call?.id || "").trim()).filter(Boolean)
    : [];
}

function convertToolMessageToUser(message = {}) {
  const content = normalizeMessageContent(message.content || "");
  return content ? { role: "user", content: `Tool result:\n${content}` } : null;
}

function sanitizeChatMessageSequence(messages = []) {
  const pendingToolIds = new Set();
  const sanitized = [];

  for (const message of messages) {
    if (!message) continue;
    if (message.role === "assistant") {
      const calls = toolCallIds(message);
      if (calls.length) {
        calls.forEach((id) => pendingToolIds.add(id));
        sanitized.push(message);
        continue;
      }
      pendingToolIds.clear();
      sanitized.push(message);
      continue;
    }

    if (message.role === "tool") {
      const id = String(message.tool_call_id || "").trim();
      if (id && pendingToolIds.has(id)) {
        pendingToolIds.delete(id);
        sanitized.push(message);
        continue;
      }
      const converted = convertToolMessageToUser(message);
      if (converted) sanitized.push(converted);
      continue;
    }

    if (message.role === "user" || message.role === "system") pendingToolIds.clear();
    sanitized.push(message);
  }

  return sanitized.filter((message, index) => {
    const calls = toolCallIds(message);
    if (message.role !== "assistant" || !calls.length) return true;
    const pending = new Set(calls);
    for (let cursor = index + 1; cursor < sanitized.length; cursor += 1) {
      const next = sanitized[cursor];
      if (next?.role !== "tool") break;
      pending.delete(String(next.tool_call_id || "").trim());
    }
    return pending.size === 0 || normalizeMessageContent(message.content || "");
  });
}

function estimateRequestChars(value) {
  if (value == null) return 0;
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + estimateRequestChars(item), 0);
  if (typeof value === "object") return JSON.stringify(value).length;
  return String(value).length;
}

function compactChatMessagesForUpstream(messages = []) {
  const maxMessages = Math.max(20, Number(process.env.FLOWAPI_MAX_UPSTREAM_MESSAGES || 180));
  const maxChars = Math.max(10_000, Number(process.env.FLOWAPI_MAX_UPSTREAM_MESSAGE_CHARS || 160_000));
  const charsBefore = estimateRequestChars(messages);
  if (messages.length <= maxMessages && charsBefore <= maxChars) {
    return { messages, compacted: false, removed: 0, charsBefore, charsAfter: charsBefore };
  }

  const systemMessages = messages.filter((message) => message.role === "system").slice(0, 4);
  const nonSystem = messages.filter((message) => message.role !== "system");
  const kept = [];
  let chars = estimateRequestChars(systemMessages);

  for (let index = nonSystem.length - 1; index >= 0; index -= 1) {
    const message = nonSystem[index];
    const nextChars = chars + estimateRequestChars(message);
    const nextCount = systemMessages.length + kept.length + 1;
    if (kept.length >= 8 && (nextCount > maxMessages || nextChars > maxChars)) break;
    kept.unshift(message);
    chars = nextChars;
  }

  const removed = Math.max(0, messages.length - systemMessages.length - kept.length);
  const notice = removed > 0
    ? [{ role: "system", content: `[FlowAPI relay note] ${removed} older conversation messages were omitted to fit the upstream context limit. Continue using the recent visible context.` }]
    : [];
  const compactedMessages = sanitizeChatMessageSequence([...systemMessages, ...notice, ...kept]);
  return {
    messages: compactedMessages,
    compacted: true,
    removed,
    charsBefore,
    charsAfter: estimateRequestChars(compactedMessages),
  };
}

function normalizeChatRequestBody(body = {}, upstreamModelId) {
  const normalized = {
    ...body,
    model: upstreamModelId,
    messages: normalizeChatMessages(body),
  };

  delete normalized.input;
  delete normalized.prompt;
  delete normalized.query;
  delete normalized.instructions;
  delete normalized.system;
  delete normalized.__flowapi_responses_request;

  // Responses-only state fields are kept by /v1/responses for the client-facing
  // response object, but must not be forwarded to Chat Completions upstreams.
  // Many OpenAI-compatible relays reject them before they ever reach tool-call
  // handling, which makes Codex look like it can only do ordinary chat.
  delete normalized.previous_response_id;
  delete normalized.previousResponseId;
  delete normalized.store;
  if (normalized.reasoning && typeof normalized.reasoning === "object" && !normalized.reasoning_effort) {
    normalized.reasoning_effort = normalized.reasoning.effort || normalized.reasoning.summary || normalized.reasoning.level;
  }
  delete normalized.reasoning;

  if (normalized.max_output_tokens && !normalized.max_tokens) {
    normalized.max_tokens = Number(normalized.max_output_tokens) || 16;
  }
  delete normalized.max_output_tokens;

  const requestedMaxTokens = Number(normalized.max_tokens);
  const maxCompletionTokens = Math.max(1, Number(process.env.MAX_COMPLETION_TOKENS || 4096));
  if (!Number.isFinite(requestedMaxTokens) || requestedMaxTokens <= 0) {
    normalized.max_tokens = 16;
  } else if (requestedMaxTokens > maxCompletionTokens) {
    normalized.max_tokens = maxCompletionTokens;
  }

  const compaction = compactChatMessagesForUpstream(normalized.messages);
  normalized.messages = compaction.messages;
  Object.defineProperty(normalized, "__flowapi_compaction", {
    value: {
      compacted: compaction.compacted,
      removedMessages: compaction.removed,
      charsBefore: compaction.charsBefore,
      charsAfter: compaction.charsAfter,
    },
    enumerable: false,
  });

  if (!normalized.stream) {
    delete normalized.stream_options;
  }

  return normalized;
}

function getWireApiMode(req) {
  return String(req?.headers?.["x-flowapi-wire-api"] || "chat").trim().toLowerCase();
}

function getInternalResponsesRequest(body = {}) {
  const request = body?.__flowapi_responses_request;
  return request && typeof request === "object" && !Array.isArray(request) ? request : null;
}

function normalizeResponsesRequestBody(body = {}, upstreamModelId) {
  const normalized = {
    ...body,
    model: upstreamModelId,
  };

  delete normalized.__flowapi_responses_request;
  delete normalized.__flowapi_compaction;
  delete normalized.teamId;
  delete normalized.team_id;
  delete normalized.purpose;
  delete normalized.usagePurpose;

  if (normalized.stream === true) {
    normalized.stream_options = {
      include_usage: true,
      ...(normalized.stream_options || {}),
    };
  } else {
    delete normalized.stream_options;
  }

  return normalized;
}

function shouldRetryResponsesAsChat(status = 0, upstreamError = {}) {
  if ([404, 405, 415, 422, 501].includes(Number(status || 0))) return true;
  const code = String(upstreamError?.code || "").toLowerCase();
  const message = String(upstreamError?.message || "").toLowerCase();
  if (Number(status || 0) !== 400) return false;
  return /unsupported|unknown|unrecognized|not found|no route|messages|max_tokens|chat\.completions|responses/.test(`${code} ${message}`);
}

function shouldRetryBadRequestViaFallback(status = 0, upstreamError = {}, requestBody = {}) {
  if (Number(status || 0) !== 400) return false;
  const code = String(upstreamError?.code || "").toLowerCase();
  const message = String(upstreamError?.message || "").toLowerCase();
  const hasTools = Array.isArray(requestBody?.tools) && requestBody.tools.length > 0;
  const isStream = requestBody?.stream === true;
  if (/no tool call found for function call output/.test(message)) return true;
  if ((hasTools || isStream) && /event:\s*error|upstream request failed/.test(message)) return true;
  if ((hasTools || isStream) && /invalid_request_error/.test(code) && /tool call|function call|call_id/.test(message)) return true;
  return false;
}

function summarizeResponsesRequestShape(body = {}) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const input = body?.input;
  const tools = Array.isArray(body?.tools) ? body.tools : [];
  return {
    fields: Object.keys(body || {}).sort(),
    endpointType: "responses",
    hasMessages: messages.length > 0,
    messagesCount: messages.length,
    messageRoles: messages.map((message) => message?.role || message?.type || "").slice(0, 12),
    hasInput: input != null,
    inputType: Array.isArray(input) ? "array" : typeof input,
    stream: Boolean(body?.stream),
    maxTokens: body?.max_output_tokens ?? null,
    hasTools: tools.length > 0,
    toolsCount: tools.length,
    toolsChars: estimateRequestChars(tools),
  };
}

function findContentModelForMemberAccess(modelId = "", product = null) {
  const keys = [modelId, product?.id, product?.publicModelId, product?.displayName]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return getContent("models").find((model) => {
    return [model.id, model.modelId, model.publicModelId, model.displayName]
      .filter(Boolean)
      .some((value) => keys.includes(String(value).toLowerCase()));
  }) || null;
}

function estimatePromptTokens(messages = []) {
  const text = messages
    .map((message) => {
      const content = typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content || "");
      return `${message.role || ""}:${content}`;
    })
    .join("\n");
  return Math.max(1, Math.ceil(text.length / 4));
}

function normalizeClientRequestId(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 120);
  return normalized ? `chat_${normalized}` : "";
}

function estimateCompletionTokensFromResponse(payload = {}) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const text = choices.map((choice) => {
    const message = choice?.message || {};
    const content = message.content ?? choice?.text ?? choice?.delta?.content ?? "";
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((part) => part?.text || part?.content || "").filter(Boolean).join("\n");
    }
    return content ? JSON.stringify(content) : "";
  }).filter(Boolean).join("\n");
  return Math.max(0, Math.ceil(text.length / 4));
}

function normalizeSuccessUsage(payload = {}, fallbackPromptTokens = 1) {
  const usage = payload?.usage || {};
  const prompt = Math.max(0, Number(usage.prompt_tokens || usage.input_tokens || fallbackPromptTokens || 0));
  const completion = Math.max(0, Number(usage.completion_tokens || usage.output_tokens || estimateCompletionTokensFromResponse(payload)));
  const total = Math.max(prompt + completion, Number(usage.total_tokens || 0));
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
  };
}

function estimateModelProductCnyCost(modelId, usage = {}, modelProduct = null) {
  const pricing = modelProduct?.pricing || {};
  const inputPrice = Number(pricing.inputSellPricePerMTokens);
  const outputPrice = Number(pricing.outputSellPricePerMTokens);

  if (Number.isFinite(inputPrice) && Number.isFinite(outputPrice) && inputPrice + outputPrice > 0) {
    const promptTokens = Number(usage.prompt_tokens || 0);
    const completionTokens = Number(usage.completion_tokens || 0);
    const inputCost = (promptTokens / 1_000_000) * inputPrice;
    const outputCost = (completionTokens / 1_000_000) * outputPrice;
    return Number((inputCost + outputCost).toFixed(6));
  }

  return estimateCnyCost(modelId, usage);
}

function estimateModelProductUpstreamCost(usage = {}, modelProduct = null) {
  const pricing = modelProduct?.pricing || {};
  const inputCost = Number(pricing.inputCostPerMTokens || 0);
  const outputCost = Number(pricing.outputCostPerMTokens || 0);
  if (!Number.isFinite(inputCost + outputCost) || inputCost + outputCost <= 0) return 0;
  const promptTokens = Number(usage.prompt_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || 0);
  return Number((((promptTokens / 1_000_000) * inputCost) + ((completionTokens / 1_000_000) * outputCost)).toFixed(6));
}

function buildBillingSnapshot(modelId, usage = {}, modelProduct = null, multiplier = 1) {
  const sellBase = estimateModelProductCnyCost(modelId, usage, modelProduct);
  const sellPriceCny = Number((sellBase * Math.max(0, Number(multiplier || 1))).toFixed(6));
  const upstreamCostCny = estimateModelProductUpstreamCost(usage, modelProduct);
  const profitCny = Number((sellPriceCny - upstreamCostCny).toFixed(6));
  const profitMargin = sellPriceCny > 0 ? Number(((profitCny / sellPriceCny) * 100).toFixed(4)) : 0;
  return {
    sellPriceCny,
    upstreamCostCny,
    profitCny,
    profitMargin,
    billingMode: modelProduct?.pricing?.billingMode || "token_multiplier",
  };
}

function estimateCandidateCostCny(candidate = {}, usage = {}) {
  const inputCost = Number(candidate.inputCostPerMillion || 0);
  const outputCost = Number(candidate.outputCostPerMillion || 0);
  if (!Number.isFinite(inputCost + outputCost) || inputCost + outputCost <= 0) return null;
  const promptTokens = Number(usage.prompt_tokens || usage.inputTokens || 0);
  const completionTokens = Number(usage.completion_tokens || usage.outputTokens || 0);
  return Number((((promptTokens / 1_000_000) * inputCost) + ((completionTokens / 1_000_000) * outputCost)).toFixed(6));
}

function textCharCount(value = "") {
  if (value == null) return 0;
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.map((item) => textCharCount(item)).reduce((sum, item) => sum + item, 0);
  if (typeof value === "object") return JSON.stringify(value).length;
  return String(value).length;
}

function collectRequestMessageSources(body = {}) {
  const sources = [];
  if (body.instructions || body.system) sources.push("system");
  if (Array.isArray(body.messages)) sources.push("messages");
  if (Array.isArray(body.input) || body.input) sources.push("input");
  if (body.prompt || body.query) sources.push("prompt");
  if (Array.isArray(body.tools) && body.tools.length) sources.push("tools");
  return Array.from(new Set(sources));
}

function buildRelayAuditContext({
  body = {},
  normalizedMessages = [],
  requestId = "",
  clientToken = "",
  prompt = "",
} = {}) {
  const sources = collectRequestMessageSources(body);
  const originalMessageCount = Array.isArray(body.messages)
    ? body.messages.length
    : Array.isArray(body.input)
      ? body.input.length
      : body.input
        ? 1
        : body.prompt || body.query
          ? 1
          : 0;
  const systemText = [body.instructions, body.system].filter(Boolean).join("\n");
  const toolSchemaText = Array.isArray(body.tools) ? JSON.stringify(body.tools) : "";
  const userMessages = normalizedMessages.filter((message) => message?.role === "user");
  const auditText = normalizedMessages
    .map((message) => `${message.role || ""}:${typeof message.content === "string" ? message.content : JSON.stringify(message.content || "")}`)
    .join("\n");

  return {
    requestId,
    apiKeyFingerprint: clientToken ? crypto.createHash("sha256").update(clientToken).digest("hex").slice(0, 16) : "",
    promptHash: crypto.createHash("sha256").update(`${prompt}\n${auditText}`).digest("hex"),
    userMessageChars: userMessages.reduce((sum, message) => sum + textCharCount(message?.content || ""), 0),
    userMessageCount: userMessages.length,
    serverSystemChars: textCharCount(systemText),
    toolSchemaChars: textCharCount(toolSchemaText),
    messagesBeforeEnrich: originalMessageCount,
    messagesAfterEnrich: normalizedMessages.length,
    enrichmentSources: sources,
    tokenAnomalyFlag: false,
  };
}

function buildBillingSnapshotForCandidate(modelId, usage = {}, modelProduct = null, multiplier = 1, candidate = null) {
  const base = buildBillingSnapshot(modelId, usage, modelProduct, multiplier);
  if (!candidate) return base;
  const candidateCost = estimateCandidateCostCny(candidate, usage);
  if (candidateCost === null) return base;
  const profitCny = Number((base.sellPriceCny - candidateCost).toFixed(6));
  return {
    ...base,
    upstreamCostCny: candidateCost,
    profitCny,
    profitMargin: base.sellPriceCny > 0 ? Number(((profitCny / base.sellPriceCny) * 100).toFixed(4)) : 0,
  };
}

function candidateRequiresExplicitCost(candidate = {}) {
  const haystack = [
    candidate.id,
    candidate.name,
    candidate.providerName,
    candidate.channelName,
    candidate.groupName,
    candidate.raw?.provider_key,
    candidate.raw?.group_name,
  ].filter(Boolean).join(" ").toLowerCase();
  return Boolean(candidate.raw?.id && candidate.raw?.base_url) || haystack.includes("aicards") || haystack.includes("backup") || haystack.includes("备用");
}

const UPSTREAM_RESPONSE_KEYS = new Set([
  "provider",
  "upstream",
  "upstream_provider",
  "upstream_channel",
  "upstream_channel_id",
  "upstreamprovider",
  "upstreamchannel",
  "upstreamchannelid",
  "actual_model_id",
  "actualmodelid",
  "provider_key",
  "providerkey",
  "base_url",
  "api_base",
  "api_key",
  "headers",
]);

function stripUpstreamFields(value) {
  if (Array.isArray(value)) return value.map(stripUpstreamFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !UPSTREAM_RESPONSE_KEYS.has(String(key).toLowerCase()))
      .map(([key, entry]) => [key, stripUpstreamFields(entry)]),
  );
}

function sanitizeOpenAiResponseForClient(payload = {}, { publicModelId = "", requestId = "", forceRequestId = false } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const sanitized = stripUpstreamFields(payload);
  sanitized.model = publicModelId || sanitized.model || "flowapi-model";
  if (requestId && (forceRequestId || !sanitized.id)) sanitized.id = requestId;
  if (requestId) sanitized.request_id = requestId;
  return sanitized;
}

function sanitizeSseEventForClient(event = {}, context = {}) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return event;
  return sanitizeOpenAiResponseForClient(event, { ...context, forceRequestId: true });
}

function sanitizeResponsesPayloadForClient(payload = {}, { publicModelId = "", requestId = "" } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const sanitized = stripUpstreamFields(payload);
  if (publicModelId && typeof sanitized.model === "string") sanitized.model = publicModelId;
  if (requestId) sanitized.request_id = requestId;
  if (sanitized.response && typeof sanitized.response === "object" && !Array.isArray(sanitized.response)) {
    if (publicModelId && typeof sanitized.response.model === "string") sanitized.response.model = publicModelId;
    if (requestId) sanitized.response.request_id = requestId;
  }
  return sanitized;
}

function sanitizeResponsesSseEventForClient(event = {}, context = {}) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return event;
  return sanitizeResponsesPayloadForClient(event, context);
}

function buildSanitizedSsePlaceholder({ publicModelId = "", requestId = "" } = {}) {
  return {
    id: requestId || `chatcmpl_${Date.now().toString(36)}`,
    object: "chat.completion.chunk",
    model: publicModelId || "flowapi-model",
    choices: [{ index: 0, delta: {}, finish_reason: null }],
  };
}

function assertCandidateMargin(candidate = {}, { modelId = "", usage = {}, modelProduct = null, multiplier = 1 } = {}) {
  if (candidate.name === "team-token-pool") return { ok: true, snapshot: buildBillingSnapshot(modelId, usage, modelProduct, multiplier) };
  if (candidateRequiresExplicitCost(candidate) && estimateCandidateCostCny(candidate, usage) === null) {
    return {
      ok: false,
      code: "CHANNEL_COST_MISSING",
      snapshot: buildBillingSnapshot(modelId, usage, modelProduct, multiplier),
    };
  }
  const snapshot = buildBillingSnapshotForCandidate(modelId, usage, modelProduct, multiplier, candidate);
  if (shouldBlockForProfitProtection(snapshot)) {
    return { ok: false, code: "CHANNEL_MARGIN_PROTECTED", snapshot };
  }
  return { ok: true, snapshot };
}

function mapModelForUpstream(upstreamName = "", modelId = "") {
  const normalizedUpstream = String(upstreamName || "").toLowerCase();
  const id = String(modelId || "").trim();
  if (normalizedUpstream !== "openrouter") return id;
  const aliases = {
    "deepseek-chat": "deepseek/deepseek-chat",
    "deepseek-reasoner": "deepseek/deepseek-r1",
    "gpt-4o-mini": "openai/gpt-4o-mini",
    "flowapi-gpt4o-mini": "openai/gpt-4o-mini",
    "qwen3-32b": "qwen/qwen3-32b",
  };
  return aliases[id.toLowerCase()] || id;
}

function estimateReserveCostForProduct(modelId, body = {}, promptTokens = 1, modelProduct = null) {
  const maxTokens = Math.min(Number(body.max_tokens || 1024) || 1024, Number(process.env.MAX_COMPLETION_TOKENS || 4096));
  const estimated = estimateModelProductCnyCost(modelId, {
    prompt_tokens: promptTokens,
    completion_tokens: maxTokens,
  }, modelProduct);
  const minimum = Number(process.env.MIN_API_RESERVE_CNY || 0.001);
  return Number(Math.max(minimum, estimated * 1.25).toFixed(6));
}

function shouldBlockForProfitProtection(snapshot = {}) {
  const configured = Number(process.env.FLOWAPI_MIN_TEXT_PROFIT_MARGIN ?? 0.2);
  const minMargin = Number.isFinite(configured) ? Math.max(0, configured) : 0.2;
  if (!Number.isFinite(snapshot.upstreamCostCny) || snapshot.upstreamCostCny <= 0) return true;
  if (!Number.isFinite(snapshot.sellPriceCny) || snapshot.sellPriceCny <= 0) return true;
  return snapshot.sellPriceCny < snapshot.upstreamCostCny * (1 + minMargin);
}

async function recordRouteAttempt(attempt = {}) {
  if (!hasDatabase()) return null;
  try {
    await recordProviderRequestLog({
      ...attempt,
      providerId: attempt.providerId || String(attempt.upstreamChannelId || "").split(":")[0] || attempt.upstreamChannel || "",
      publicModelName: attempt.publicModelName || attempt.publicModelId || "",
      upstreamModelName: attempt.upstreamModelName || attempt.actualModelId || "",
      httpStatus: attempt.statusCode || 0,
      userId: attempt.customerId || "",
      userApiKeyId: attempt.apiKeyId || "",
    }).catch((error) => console.error("[flowapi] record provider request log failed:", error));
    await query(
      `INSERT INTO route_attempts (
        id, call_id, request_id, customer_id, api_key_id, public_model_id, actual_model_id,
        upstream_channel_id, upstream_channel, upstream_provider, attempt_index, attempt_order,
        status, status_code, ok, first_token_ms, latency_ms, error_code, error_message
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        makeRequestId("route"),
        attempt.callId || "",
        attempt.requestId || "",
        attempt.customerId || "",
        attempt.apiKeyId || "",
        attempt.publicModelId || "",
        attempt.actualModelId || "",
        attempt.upstreamChannelId || "",
        attempt.upstreamChannel || "",
        attempt.upstreamProvider || "",
        Number(attempt.attemptIndex || 0),
        Number(attempt.attemptOrder || attempt.attemptIndex || 0),
        attempt.status || (attempt.ok ? "success" : "failed"),
        Number(attempt.statusCode || 0),
        Boolean(attempt.ok),
        Number(attempt.firstTokenMs || 0),
        Number(attempt.latencyMs || 0),
        attempt.errorCode || "",
        String(attempt.errorMessage || "").slice(0, 500),
      ]
    );
  } catch (error) {
    console.error("[flowapi] record route attempt failed:", error);
  }
  return null;
}

async function updateRouteAttemptFirstToken({ requestId = "", attemptIndex = 0, firstTokenMs = 0 } = {}) {
  if (!hasDatabase() || !requestId || !attemptIndex || !firstTokenMs) return;
  try {
    await query(
      `UPDATE route_attempts
       SET first_token_ms = $3
       WHERE request_id = $1 AND attempt_index = $2 AND first_token_ms = 0`,
      [requestId, Number(attemptIndex), Number(firstTokenMs)]
    );
  } catch (error) {
    console.error("[flowapi] update route first token failed:", error);
  }
}

function getProxyReferer(req) {
  const configured = String(process.env.PROXY_HTTP_REFERER || "").trim();
  if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) return configured;
  const host = req.headers.host || "flowapi.fun";
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host.replace(/^api\./, "")}`;
}

function orderUpstreamsForFlowApiKey(routeDecision, upstreams) {
  const defaultCandidates = upstreams.filter((upstream) => upstream.includeAsDefaultCandidate !== false);
  const candidates = Array.isArray(routeDecision.fallbackChain)
    ? routeDecision.fallbackChain
    : defaultCandidates;
  const routeOrdered = routeDecision.upstream
    ? [routeDecision.upstream, ...candidates.filter((u) => u.name !== (routeDecision.upstream?.name))]
    : candidates;
  return routeOrdered;
}

function normalizeEnvKey(value = "") {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function getNewApiGroupToken(group = "") {
  const normalizedGroup = normalizeEnvKey(group || process.env.NEW_API_DEFAULT_GROUP || "default");
  const candidates = [
    `NEW_API_KEY_${normalizedGroup}`,
    `NEW_API_${normalizedGroup}_KEY`,
    "NEW_API_KEY_ALL_MODELS",
    "NEW_API_ADMIN_TOKEN",
  ];

  for (const key of candidates) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }

  return "";
}

function getNewApiAuthorizationToken({ modelProduct } = {}) {
  const executionGroup = modelProduct?.executionGroup || modelProduct?.group || process.env.NEW_API_DEFAULT_GROUP || "default";
  const serverToken = getNewApiGroupToken(executionGroup) || String(process.env.NEW_API_KEY || "").trim();
  if (serverToken) return serverToken;
  return "";
}

export default async function handler(req, res) {
  const requestStartedAt = Date.now();
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendApiError(res, 405, "METHOD_NOT_ALLOWED", "Only POST is allowed", "请使用 POST 请求调用 /v1/chat/completions。");
  }

  const clientToken = getClientToken(req);
  const ip = getClientIp(req);
  const flowDebugEnabled = shouldExposeFlowDebugHeaders(req);
  const body = parseRequestBody(req.body);
  const clientRequestId = normalizeClientRequestId(req.headers["idempotency-key"] || req.headers["x-request-id"] || body.request_id || body.requestId || "");
  let requestId = clientRequestId || makeRequestId("chat");
  const sendEarlyInternalError = ({
    status = 503,
    code = "MODEL_SERVICE_REQUEST_FAILED",
    message = "模型服务暂时不可用",
    suggestion = "当前模型服务繁忙，请稍后重试；紧急使用时建议切换其他模型。",
    fallbackReason = "service_unavailable",
    error = null,
  } = {}) => {
    if (error) console.error(`[flowapi:${fallbackReason}]`, error);
    setFlowDebugHeaders(res, flowDebugEnabled, {
      requestId,
      model: body?.model || "",
      wireApi: getWireApiMode(req),
      fallbackReason,
      upstreamStatus: status,
      upstreamEndpoint: "chat",
    });
    return sendApiError(res, status, code, message, suggestion, { request_id: requestId });
  };

  if (isGraylisted(`api:${ip}`)) {
    return sendApiError(res, 429, "REQUEST_BLOCKED", "请求异常，请稍后再试", "你的请求短时间内异常次数较多，请 30 分钟后重试。");
  }

  const ipLimit = rateLimit(`api:ip:${ip}`, {
    limit: Number(process.env.API_IP_RPM || 120),
    windowMs: 60 * 1000,
  });
  if (!ipLimit.ok) {
    securityLog("api_ip_limited", { ip });
    return sendApiError(res, 429, "IP_RATE_LIMITED", "请求过快，请稍后再试", "同一 IP 请求频率过高，请降低并发或稍后重试。");
  }

  if (!clientToken) {
    const missingLimit = rateLimit(`api-missing-key:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 });
    if (!missingLimit.ok) graylistKey(`api:${ip}`, 30 * 60 * 1000);
    return sendApiError(res, 401, "MISSING_API_KEY", "缺少 API Key", "请在请求头加入 Authorization: Bearer 你的 API Key，API Key 可在 FlowAPI 的 API 管理页面复制。");
  }

  let customerMatch = null;
  try {
    customerMatch = await findCustomerByToken(clientToken);
  } catch (error) {
    return sendEarlyInternalError({
      code: "AUTH_STORE_UNAVAILABLE",
      message: "认证服务暂时不可用",
      suggestion: "FlowAPI 服务端当前无法完成认证，请稍后重试。",
      fallbackReason: "auth_store_unavailable",
      error,
    });
  }

  if (!customerMatch) {
    const invalidLimit = rateLimit(`api-invalid-key:${ip}`, { limit: 12, windowMs: 10 * 60 * 1000 });
    securityLog("invalid_api_key", { ip, tokenPrefix: clientToken.slice(0, 8) });
    if (!invalidLimit.ok) {
      graylistKey(`api:${ip}`, 30 * 60 * 1000);
      return sendApiError(res, 429, "INVALID_API_KEY_LIMITED", "无效 API Key 尝试过多，请稍后再试", "请停止重试错误 API Key，回到 API 管理页面重新复制完整 API Key。");
    }
    return sendApiError(res, 401, "INVALID_API_KEY", "Invalid API key for this relay service", "请确认该 API Key 是在本平台 API 管理页创建，其他平台的 Key 不能直接调用。", {
      error: {
        message: "Invalid API key for this relay service",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    });
  }

  const keyLimit = rateLimit(`api:key:${customerMatch.apiKey.id}`, {
    limit: Number(process.env.API_KEY_RPM || 60),
    windowMs: 60 * 1000,
  });
  if (!keyLimit.ok) {
    securityLog("api_key_limited", { ip, customerId: customerMatch.customer.id, keyId: customerMatch.apiKey.id });
    return sendApiError(res, 429, "API_KEY_RATE_LIMITED", "该 API Key 请求过快，请稍后再试", "请降低请求频率，或为不同业务创建不同 API Key 分开使用。");
  }

  const concurrencyKey = `api:key:${customerMatch.apiKey.id}`;
  const maxConcurrency = Number(process.env.API_KEY_MAX_CONCURRENCY || 3);
  if (!acquireConcurrency(concurrencyKey, maxConcurrency)) {
    securityLog("api_key_concurrency_limited", { ip, customerId: customerMatch.customer.id, keyId: customerMatch.apiKey.id });
    return sendApiError(res, 429, "API_KEY_CONCURRENCY_LIMITED", "该 API Key 并发请求过多，请稍后再试", "请减少同时发起的请求数量，或稍后重试。");
  }

  let upstreams = [];
  try {
    upstreams = await getUpstreamConfigsAsync({ includeReviewOnly: true });
  } catch (error) {
    releaseConcurrency(concurrencyKey);
    return sendEarlyInternalError({
      code: "UPSTREAM_CONFIG_UNAVAILABLE",
      message: "模型路由配置暂时不可用",
      suggestion: "FlowAPI 服务端当前无法读取模型路由配置，请稍后重试。",
      fallbackReason: "upstream_config_unavailable",
      error,
    });
  }
  if (upstreams.length === 0) {
    releaseConcurrency(concurrencyKey);
    return sendApiError(res, 500, "MODEL_SERVICE_NOT_CONFIGURED", "未配置模型服务", "FlowAPI 服务端暂未配置模型服务，请联系管理员处理。");
  }

  const wireApiMode = getWireApiMode(req);
  const internalResponsesRequest = getInternalResponsesRequest(body);
  const preferResponsesUpstream = wireApiMode === "responses" && Boolean(internalResponsesRequest);
  const codexDiagnostic = shouldLogCodexChatDiagnostic(req, body) ? buildCodexChatDiagnostic(req, body) : null;
  const explicitTeamId = String(req.headers["x-flowapi-team-id"] || body.teamId || body.team_id || "").trim();
  const boundTeamId = String(customerMatch.apiKey.teamId || "").trim();
  const requestedTeamId = explicitTeamId || boundTeamId;
  const requestedPurpose = String(req.headers["x-flowapi-purpose"] || body.purpose || body.usagePurpose || customerMatch.apiKey.usagePurpose || "").trim();
  const clientName = String(req.headers["x-flowapi-client"] || req.headers["user-agent"] || "").slice(0, 160);
  if (codexDiagnostic) codexDiagnostic.request_id = requestId;
  const normalizedMessages = normalizeChatMessages(body);
  const prompt = getPromptFromMessages(normalizedMessages);
  const boundPublicModel = customerMatch.apiKey.publicModelId || "";
  const boundActualModel = customerMatch.apiKey.actualModelId || boundPublicModel;
  const requestedModel = body.model && body.model !== "auto" ? normalizeModelLookup(body.model) : "";
  const apiKeyPriceMultiplier = Math.max(0.01, Number(customerMatch.apiKey?.priceMultiplier || 1));
  const localePriceMultiplier = Math.max(0.01, Number(customerMatch.apiKey?.localePriceMultiplier || 1));
  const billingMultiplier = Number((apiKeyPriceMultiplier * localePriceMultiplier).toFixed(6));
  const effectiveRequestedModel = requestedModel || boundPublicModel;
  const requestedManualModel = Boolean(effectiveRequestedModel);
  if (boundPublicModel && effectiveRequestedModel && ![boundPublicModel, boundActualModel].includes(effectiveRequestedModel)) {
    releaseConcurrency(concurrencyKey);
    return sendApiError(
      res,
      403,
      "MODEL_NOT_ALLOWED",
      "该 API Key 不能调用这个模型",
      `这个 API Key 绑定的是 ${boundPublicModel}，请在模型广场为其他模型单独创建 API Key。`
    );
  }
  const catalogModel = requestedManualModel ? getCatalogModel(effectiveRequestedModel) : null;
  const configuredModelProduct = requestedManualModel
    ? await getModelProductWithConfig(effectiveRequestedModel)
    : null;
  const providerModelMappings = requestedManualModel && !catalogModel && !configuredModelProduct
    ? await listModelMappings({ publicModelName: effectiveRequestedModel }).catch(() => [])
    : [];
  const providerModelMapping = providerModelMappings.find((item) => item?.enabled !== false) || null;
  const mappedModelProduct = providerModelMapping
    ? {
        id: providerModelMapping.publicModelName,
        publicModelId: providerModelMapping.publicModelName,
        actualModelId: providerModelMapping.upstreamModelName,
        displayName: providerModelMapping.displayName || providerModelMapping.publicModelName,
        provider: "FlowAPI",
        isAvailable: true,
        statusLabel: "可用",
        pricing: {
          inputSellPricePerMTokens: Number(providerModelMapping.inputPricePer1M || 0),
          outputSellPricePerMTokens: Number(providerModelMapping.outputPricePer1M || 0),
          cachedInputSellPricePerMTokens: Number(providerModelMapping.cachedInputPricePer1M || 0),
          inputCostPerMTokens: Number(providerModelMapping.inputPricePer1M || 0) / 1.25,
          outputCostPerMTokens: Number(providerModelMapping.outputPricePer1M || 0) / 1.25,
          cachedInputCostPerMTokens: Number(providerModelMapping.cachedInputPricePer1M || 0) / 1.25,
          billingMode: "token_multiplier",
        },
      }
    : null;
  if (requestedManualModel && !catalogModel && !configuredModelProduct && !mappedModelProduct) {
    releaseConcurrency(concurrencyKey);
    return sendApiError(
      res,
      400,
      "UNSUPPORTED_MODEL",
      "模型暂未接入 FlowAPI",
      "请在模型广场复制推荐的 Model ID，或使用 model: auto 让 FlowAPI 自动选择可用模型。"
    );
  }

  const selected = requestedManualModel
    ? (catalogModel || {
        name: (configuredModelProduct || mappedModelProduct)?.displayName,
        key: (configuredModelProduct || mappedModelProduct)?.id,
        provider: (configuredModelProduct || mappedModelProduct)?.provider || "FlowAPI",
        modelId: (configuredModelProduct || mappedModelProduct)?.publicModelId || (configuredModelProduct || mappedModelProduct)?.id,
        actualModelId: (configuredModelProduct || mappedModelProduct)?.actualModelId,
        inputPrice: 0,
        outputPrice: 0,
      })
    : smartSelectModel(prompt);
  const publicModelId = getPublicModelRequestId(selected.modelId);

  // Check model product availability
  const modelProduct = configuredModelProduct || mappedModelProduct || await getModelProductWithConfig(effectiveRequestedModel || selected.modelId);
  if (modelProduct) {
    const contentModel = findContentModelForMemberAccess(effectiveRequestedModel || selected.modelId, modelProduct);
    if (contentModel?.isMemberOnly && !userCanUseMemberModel(customerMatch.customer.id, contentModel)) {
      releaseConcurrency(concurrencyKey);
      return sendApiError(
        res,
        403,
        "MEMBER_MODEL_REQUIRED",
        "该模型为 FLOWAPI 黑金会员专属模型",
        "开通 FLOWAPI 黑金会员后即可使用会员专属模型；也可以先在大模型接入页选择普通模型。"
      );
    }
    if (!modelProduct.isAvailable) {
      releaseConcurrency(concurrencyKey);
      return sendApiError(
        res,
        403,
        "MODEL_NOT_AVAILABLE",
        "该模型暂未开放，请选择其他模型。",
        `${modelProduct.displayName} 当前状态为"${modelProduct.statusLabel || '即将开放'}"，暂未开放调用。请在模型广场选择状态为"可用"的模型。`
      );
    }
    const pricingGuard = validateTextModelProfitConfig(modelProduct, { multiplier: billingMultiplier });
    if (!pricingGuard.ok) {
      releaseConcurrency(concurrencyKey);
      return sendApiError(
        res,
        503,
        pricingGuard.code || "MODEL_PRICING_NOT_READY",
        pricingGuard.userMessage || "该模型价格尚未通过毛利审核，请先选择其他模型。",
        "该模型正在进行价格和成本审核。你可以先切换其他模型，或把 request_id 发给 FlowAPI 客服排查。"
      );
    }
  }
  const upstreamModelId = modelProduct?.actualModelId || getActualModelId(selected);

  if (!upstreamModelId || String(upstreamModelId).trim() === "") {
    releaseConcurrency(concurrencyKey);
    return sendApiError(
      res,
      500,
      "MODEL_NOT_CONFIGURED",
      "模型路由未配置",
      "该模型服务尚未配置完成，请联系管理员在后台配置。"
    );
  }
  if (requestedTeamId) {
    if (boundTeamId && explicitTeamId && explicitTeamId !== boundTeamId) {
      releaseConcurrency(concurrencyKey);
      securityLog("team_api_key_scope_mismatch", {
        ip,
        customerId: customerMatch.customer.id,
        apiKeyId: customerMatch.apiKey.id,
        boundTeamId,
        requestedTeamId,
      });
      return sendApiError(
        res,
        403,
        "TEAM_KEY_SCOPE_MISMATCH",
        "这个 API Key 已绑定到其他团队",
        "团队 API Key 只能记入创建时绑定的团队账本。请切换正确的团队 Key，或联系队长重新创建。"
      );
    }
    const allowedTeamIds = new Set(boundTeamId ? [boundTeamId] : await getUserTeamIds(customerMatch.customer.id));
    if (!allowedTeamIds.has(requestedTeamId)) {
      releaseConcurrency(concurrencyKey);
      securityLog("team_token_pool_forbidden", {
        ip,
        customerId: customerMatch.customer.id,
        apiKeyId: customerMatch.apiKey.id,
        requestedTeamId,
      });
      return sendApiError(
        res,
        403,
        "TEAM_ACCESS_FORBIDDEN",
        "你没有权限使用这个团队空间",
        "请使用绑定该团队的 API Key，或联系队长把你的账号加入团队后再调用。"
      );
    }
  }
  const upstreamBody = normalizeChatRequestBody(body, upstreamModelId);
  if (codexDiagnostic) {
    codexDiagnostic.forwarded_shape = summarizeBodyShape(upstreamBody);
    codexDiagnostic.forwarded_has_tools = Array.isArray(upstreamBody.tools) && upstreamBody.tools.length > 0;
    codexDiagnostic.forwarded_tools_count = Array.isArray(upstreamBody.tools) ? upstreamBody.tools.length : 0;
    codexDiagnostic.forwarded_has_tool_choice = upstreamBody.tool_choice != null;
    codexDiagnostic.forwarded_has_parallel_tool_calls = upstreamBody.parallel_tool_calls != null;
    codexDiagnostic.selected_public_model = publicModelId;
    codexDiagnostic.selected_upstream_model = upstreamModelId;
    codexDiagnostic.user_id = customerMatch.customer.id;
    codexDiagnostic.api_key_id = customerMatch.apiKey.id;
  }
  delete upstreamBody.teamId;
  delete upstreamBody.team_id;
  delete upstreamBody.purpose;
  delete upstreamBody.usagePurpose;

  const relayAuditContext = buildRelayAuditContext({
    body,
    normalizedMessages,
    requestId,
    clientToken,
    prompt,
  });
  const finalizeWithRelayAudit = (record, reservation) => finalizeReservedCallByToken(clientToken, {
    ...relayAuditContext,
    ...record,
  }, reservation);

  const teamRequestContext = {
    teamId: requestedTeamId,
    userId: customerMatch.customer.id,
    apiKeyId: customerMatch.apiKey.id,
    model: selected.modelId,
    provider: selected.provider,
    purpose: requestedPurpose,
    body: upstreamBody,
  };
  const { cacheKey, requestHash } = buildRequestCacheKey(teamRequestContext);
  const billableTeamCacheEnabled = process.env.FLOWAPI_ENABLE_BILLABLE_TEAM_CACHE === "true";
  let cachedTeamResponse = null;

  if (requestedTeamId && billableTeamCacheEnabled) {
    cachedTeamResponse = await getCachedTeamResponse(teamRequestContext);
  }
  const responseCacheEnabled = process.env.FLOWAPI_ENABLE_RESPONSE_CACHE === "true"
    && !requestedTeamId
    && shouldUseResponseCache(upstreamBody);
  const responseCacheKey = responseCacheEnabled
    ? buildResponseCacheKey({ userId: customerMatch.customer.id, model: selected.modelId, body: upstreamBody })
    : "";


  const promptTokens = estimatePromptTokens(upstreamBody.messages || []);
  const estimatedCompletionTokens = Math.min(Number(upstreamBody.max_tokens || 1024) || 1024, Number(process.env.MAX_COMPLETION_TOKENS || 4096));
  const estimatedBilling = buildBillingSnapshot(selected.modelId, {
    prompt_tokens: promptTokens,
    completion_tokens: estimatedCompletionTokens,
  }, modelProduct, billingMultiplier);
  let routeDecision = { strategy: "not_started" };
  if (shouldBlockForProfitProtection(estimatedBilling)) {
    releaseConcurrency(concurrencyKey);
    return sendApiError(
      res,
      503,
      "MODEL_MARGIN_PROTECTED",
      "该模型当前维护中，请稍后再试。",
      "该模型正在维护。你可以先切换其他模型，或把 request_id 发给 FlowAPI 客服排查。"
    );
  }
  routeDecision = await selectUpstream({
    modelId: upstreamModelId,
    publicModelId,
    modelProduct,
    strategy: modelProduct?.routeStrategy || STRATEGY.AUTO,
    usageEstimate: {
      prompt_tokens: promptTokens,
      completion_tokens: estimatedCompletionTokens,
    },
    userChargeEstimate: estimatedBilling.sellPriceCny,
    endpoint: preferResponsesUpstream ? "responses" : "chat",
  });
  if (routeDecision?.error === "profit_protected") {
    releaseConcurrency(concurrencyKey);
    return sendApiError(
      res,
      503,
      "MODEL_SERVICE_MAINTENANCE",
      "该模型当前上游成本过高，暂时维护中，请稍后再试。",
      "FlowAPI 已阻止亏损线路，本次没有请求上游，也不会扣费。请稍后再试或切换其他模型。",
      { request_id: requestId }
    );
  }
  requestId = buildRoutedRequestId(requestId, routeDecision?.upstream?.name || routeDecision?.channel?.name || routeDecision?.upstream?.label || "");
  if (codexDiagnostic) codexDiagnostic.request_id = requestId;
  if (requestedTeamId) {
    const limited = await enforceTeamRateLimits({
      teamId: requestedTeamId,
      apiKeyId: customerMatch.apiKey.id,
      model: selected.modelId,
      provider: selected.provider,
    });
    if (limited.limited) {
      await recordTeamUsageLog({
        requestId,
        userId: customerMatch.customer.id,
        teamId: requestedTeamId,
        apiKeyId: customerMatch.apiKey.id,
        provider: selected.provider,
        model: selected.modelId,
        purpose: requestedPurpose,
        requestSummary: prompt,
        requestHash,
        clientIp: ip,
        clientName,
        rateLimited: true,
        success: false,
        errorCode: limited.code,
        errorMessage: limited.message,
        finalStatus: "rate_limited",
      });
      releaseConcurrency(concurrencyKey);
      return res.status(429).json({
        error: {
          code: limited.code,
          message: limited.message,
          retryAfter: limited.retryAfter,
          request_id: requestId,
        },
      });
    }
  }
  if (clientRequestId) {
    const idempotency = await beginApiRequestIdempotency(customerMatch.customer.id, requestId);
    if (idempotency.duplicate) {
      releaseConcurrency(concurrencyKey);
      return sendApiError(
        res,
        409,
        "DUPLICATE_REQUEST",
        "这次请求已经提交过",
        "FlowAPI 已识别到相同 Idempotency-Key。为避免重复扣费，本次不会再次执行；如果你确实要重新生成，请换一个新的 Idempotency-Key。",
        { request_id: requestId }
      );
    }
  }
  const reserveCost = Number((estimateReserveCostForProduct(selected.modelId, upstreamBody, promptTokens, modelProduct) * billingMultiplier).toFixed(6));
  if (requestedTeamId) {
    const teamQuota = await enforceTeamMemberLimit({
      teamId: requestedTeamId,
      userId: customerMatch.customer.id,
      estimatedCostCny: reserveCost,
      estimatedTokens: promptTokens + estimatedCompletionTokens,
      estimatedRequests: 1,
    });
    if (teamQuota.limited) {
      await recordTeamUsageLog({
        requestId,
        userId: customerMatch.customer.id,
        teamId: requestedTeamId,
        apiKeyId: customerMatch.apiKey.id,
        provider: selected.provider,
        model: selected.modelId,
        modelType: modelProduct?.group || "",
        purpose: requestedPurpose,
        requestSummary: prompt,
        requestHash,
        clientIp: ip,
        clientName,
        success: false,
        errorCode: teamQuota.code || "TEAM_MEMBER_QUOTA_EXCEEDED",
        errorMessage: teamQuota.message || "你已达到团队分配余额，请联系团队队长调整。",
        balanceInsufficient: true,
        finalStatus: "team_quota_exceeded",
      });
      releaseConcurrency(concurrencyKey);
      return sendApiError(
        res,
        429,
        teamQuota.code || "TEAM_MEMBER_QUOTA_EXCEEDED",
        teamQuota.message || "你已达到团队分配余额，请联系团队队长调整。",
        teamQuota.remaining !== undefined ? `当前剩余限制约为 ${teamQuota.remaining}，请联系队长调整。` : "请联系团队队长调整成员限制。",
        { request_id: requestId, team_id: requestedTeamId }
      );
    }
  }
  const reserve = await reserveBalanceByToken(clientToken, reserveCost, {
    tokens: promptTokens + estimatedCompletionTokens,
  });

  if (reserve.error) {
    releaseConcurrency(concurrencyKey);
    if (reserve.quotaExceeded) {
      return sendApiError(
        res,
        reserve.status || 429,
        reserve.code || "API_KEY_QUOTA_EXCEEDED",
        reserve.error,
        reserve.nextResetAt ? `下次重置时间：${reserve.nextResetAt}` : "请调整该 API Key 的余额限制后再调用。",
        { nextResetAt: reserve.nextResetAt || null }
      );
    }
    return sendApiError(
      res,
      reserve.code === "WALLET_FROZEN" ? 403 : 402,
      reserve.code || "INSUFFICIENT_BALANCE",
      reserve.error,
      "请进入 FlowAPI 钱包充值页面补充余额，到账后再继续调用。",
      {
        api_balance: reserve.apiBalance || "0.000000",
        api_balance_display: reserve.apiBalanceDisplay || "$ API 0.00",
        required_api: reserve.requiredApi || "0.000000",
        required_api_display: reserve.requiredApiDisplay || "$ API 0.00",
      }
    );
  }

  const referer = getProxyReferer(req);
  const title = process.env.PROXY_TITLE || "FlowAPI";

  let routeAttemptCount = 0;
  let upstream = null;
  let upstreamResponse = null;
  let upstreamLatencyMs = 0;
  let teamToken = null;
  let settlementFinalized = false;
  let orderedFallbackChain = "";
  let orderedFallbackTotal = 0;
  let selectedDebugCandidate = routeDecision?.upstream || routeDecision?.channel || null;
  let fallbackTrace = [];
  let lastFallbackReason = "";
  let lastUpstreamStatus = 0;
  let lastUpstreamErrorCode = "";
  let lastUpstreamErrorMessage = "";
  const applyCurrentFlowDebugHeaders = ({
    candidate = null,
    requestIdOverride = requestId,
    upstreamEndpoint = "",
    upstreamStatus = lastUpstreamStatus,
    fallbackReason = lastFallbackReason,
  } = {}) => {
    const activeCandidate = candidate || upstream || selectedDebugCandidate || routeDecision?.upstream || routeDecision?.channel || null;
    setFlowDebugHeaders(res, flowDebugEnabled, {
      requestId: requestIdOverride,
      model: publicModelId || body.model || "",
      wireApi: wireApiMode,
      selectedChannel: activeCandidate?.name || activeCandidate?.id || "",
      upstreamProvider: activeCandidate?.label || activeCandidate?.provider || activeCandidate?.name || activeCandidate?.id || "",
      upstreamModel: activeCandidate?.actualModelId || upstreamModelId || body.model || "",
      fallbackAttempt: summarizeFallbackAttempt(routeAttemptCount, orderedFallbackTotal),
      fallbackChain: orderedFallbackChain,
      fallbackReason,
      upstreamStatus: upstreamStatus || "",
      upstreamEndpoint: upstreamEndpoint || activeCandidate?.endpointType || (preferResponsesUpstream ? "responses" : "chat"),
    });
  };

  if (cachedTeamResponse?.response) {
    const cachedUsageBase = normalizeSuccessUsage(cachedTeamResponse.response, promptTokens);
    const savedTokens = Math.max(0, Number(cachedTeamResponse.savedTokens || 0));
    const usage = savedTokens > cachedUsageBase.total_tokens
      ? {
          prompt_tokens: cachedUsageBase.prompt_tokens,
          completion_tokens: Math.max(0, savedTokens - cachedUsageBase.prompt_tokens),
          total_tokens: savedTokens,
        }
      : cachedUsageBase;
    const billing = buildBillingSnapshot(selected.modelId, usage, modelProduct, billingMultiplier);

    try {
      const customer = await finalizeWithRelayAudit({
        requestId,
        endpoint: "/v1/chat/completions",
        requestedModel: body.model || "auto",
        routedModel: selected.name,
        publicModelId,
        actualModelId: upstreamModelId,
        provider: selected.provider,
        upstreamChannel: "team-cache",
        upstreamProvider: "FlowAPI Cache",
        upstreamStatus: 200,
        latencyMs: 0,
        status: 200,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        cost: billing.sellPriceCny,
        sellPriceCny: billing.sellPriceCny,
        upstreamCostCny: 0,
        profitCny: billing.sellPriceCny,
        profitMargin: billing.sellPriceCny > 0 ? 100 : 0,
        billingMode: "team_cache",
        routeStrategy: "team_cache_hit",
        routeAttempts: 0,
        grantUsageCredit: true,
      }, reserve);

      await recordTeamUsageLog({
        requestId,
        userId: customerMatch.customer.id,
        teamId: requestedTeamId,
        apiKeyId: customerMatch.apiKey.id,
        provider: selected.provider,
        model: selected.modelId,
        modelType: modelProduct?.group || "",
        purpose: requestedPurpose,
        requestSummary: prompt,
        requestHash,
        clientIp: ip,
        clientName,
        cacheHit: true,
        cacheKey,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        officialCostCny: 0,
        actualCostCny: billing.sellPriceCny,
        savedCny: cachedTeamResponse.savedCny || 0,
        success: true,
        finalStatus: "cache_hit_billed",
      });
      await recordTeamMemberUsage({
        teamId: requestedTeamId,
        userId: customerMatch.customer.id,
        requestId,
        costCny: billing.sellPriceCny,
        tokens: usage.total_tokens || 0,
        requests: 1,
        success: true,
      });

      const cachePayload = {
        ...sanitizeOpenAiResponseForClient(cachedTeamResponse.response, { publicModelId, requestId }),
        token_router: {
          routed_model: selected.name,
          routed_model_id: selected.modelId,
          flowapi_route: "cache",
          service_provider: "FlowAPI",
          cache_hit: true,
          cache_saved_tokens: cachedTeamResponse.savedTokens || 0,
          cache_saved_cny: cachedTeamResponse.savedCny || 0,
          estimated_cost_cny: billing.sellPriceCny,
          balance_cny: customer?.balance,
          request_id: requestId,
          team_id: requestedTeamId || undefined,
        },
      };
      const cacheDelivery = await sendJsonAfterDelivery(res, 200, cachePayload);
      if (!cacheDelivery.delivered) {
        await issueDownstreamRefundIfNeeded({
          customerId: customerMatch.customer.id,
          requestId,
          amount: billing.sellPriceCny,
          reason: cacheDelivery.status === BILLING_FLOW_STATUS.CLIENT_ABORTED ? "team_cache_client_aborted" : "team_cache_downstream_failed",
        });
      }
      releaseConcurrency(concurrencyKey);
      return;
    } catch (error) {
      console.error("[flowapi] billable team cache settlement failed:", error);
      await finalizeWithRelayAudit({
        requestId,
        endpoint: "/v1/chat/completions",
        requestedModel: body.model || "auto",
        routedModel: selected.name,
        publicModelId,
        actualModelId: upstreamModelId,
        provider: selected.provider,
        upstreamChannel: "team-cache",
        upstreamProvider: "FlowAPI Cache",
        upstreamStatus: 500,
        latencyMs: 0,
        status: 500,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
        sellPriceCny: 0,
        upstreamCostCny: 0,
        profitCny: 0,
        profitMargin: 0,
        billingMode: "team_cache",
        routeStrategy: "team_cache_settlement_failed",
        routeAttempts: 0,
      }, reserve);
      releaseConcurrency(concurrencyKey);
      return sendApiError(res, 503, "TEAM_CACHE_SETTLEMENT_FAILED", "团队缓存结算失败，本次未扣费。", "请稍后重试；如果持续失败，请联系 FlowAPI 客服处理。", { request_id: requestId });
    }
  }

	  if (responseCacheEnabled) {
	    const cachedResponse = getCacheManager().get("responseCache", responseCacheKey);
	    if (cachedResponse?.data) {
	      const usage = cachedResponse.usage || normalizeSuccessUsage(cachedResponse.data, promptTokens);
	      const billing = buildBillingSnapshot(selected.modelId, usage, modelProduct, billingMultiplier);
      const customer = await finalizeWithRelayAudit({
        requestId,
        endpoint: "/v1/chat/completions",
        requestedModel: body.model || "auto",
        routedModel: selected.name,
        publicModelId,
        actualModelId: upstreamModelId,
        provider: selected.provider,
        upstreamChannel: "response-cache",
        upstreamProvider: "FlowAPI Response Cache",
        upstreamStatus: 200,
        latencyMs: Date.now() - requestStartedAt,
        firstTokenMs: 0,
        status: 200,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        cost: billing.sellPriceCny,
        sellPriceCny: billing.sellPriceCny,
        upstreamCostCny: 0,
        profitCny: billing.sellPriceCny,
        profitMargin: billing.sellPriceCny > 0 ? 100 : 0,
        billingMode: "response_cache",
        routeStrategy: "response_cache_hit",
        routeAttempts: 0,
        isStream: false,
	        grantUsageCredit: true,
	      }, reserve);
	      if (requestedTeamId) {
	        try {
	          await recordTeamUsageLog({
	            requestId,
	            userId: customerMatch.customer.id,
	            teamId: requestedTeamId,
	            apiKeyId: customerMatch.apiKey.id,
	            provider: "FlowAPI",
	            model: selected.modelId,
	            modelType: modelProduct?.group || "",
	            purpose: requestedPurpose,
	            requestSummary: prompt,
	            requestHash,
	            clientIp: ip,
	            clientName,
	            cacheHit: true,
	            cacheKey: responseCacheKey,
	            inputTokens: usage.prompt_tokens || 0,
	            outputTokens: usage.completion_tokens || 0,
	            totalTokens: usage.total_tokens || 0,
	            officialCostCny: 0,
	            actualCostCny: billing.sellPriceCny,
	            success: true,
	            finalStatus: "response_cache_hit_billed",
	          });
	          await recordTeamMemberUsage({
	            teamId: requestedTeamId,
	            userId: customerMatch.customer.id,
	            requestId,
	            costCny: billing.sellPriceCny,
	            tokens: usage.total_tokens || 0,
	            requests: 1,
	            success: true,
	          });
	        } catch (error) {
	          console.error("[flowapi] response cache team attribution failed:", error);
	        }
	      }
      const cachePayload = {
        ...sanitizeOpenAiResponseForClient(cachedResponse.data, { publicModelId, requestId }),
        token_router: {
          routed_model: selected.name,
          routed_model_id: selected.modelId,
          flowapi_route: "cache",
          service_provider: "FlowAPI",
          estimated_cost_cny: billing.sellPriceCny,
          balance_cny: customer?.balance,
          request_id: requestId,
          cache_hit: true,
        },
      };
      const cacheDelivery = await sendJsonAfterDelivery(res, 200, cachePayload);
      if (!cacheDelivery.delivered) {
        await issueDownstreamRefundIfNeeded({
          customerId: customerMatch.customer.id,
          requestId,
          amount: billing.sellPriceCny,
          reason: cacheDelivery.status === BILLING_FLOW_STATUS.CLIENT_ABORTED ? "response_cache_client_aborted" : "response_cache_downstream_failed",
        });
      }
      releaseConcurrency(concurrencyKey);
      return;
    }
  }

  try {
    if (upstreamBody.stream) {
      upstreamBody.stream_options = {
        include_usage: true,
        ...(upstreamBody.stream_options || {}),
      };
    }

    let lastUpstreamError = null;

    // Try upstreams in smart order: primary first, then fallback chain
    const teamTokenCandidates = requestedTeamId
      ? await selectTeamTokenCandidatesForRequest({
          teamId: requestedTeamId,
          userId: customerMatch.customer.id,
          apiKeyId: customerMatch.apiKey.id,
          model: selected.modelId,
          provider: selected.provider,
          purpose: requestedPurpose,
        })
      : [];
    if (requestedTeamId && !teamTokenCandidates.length) {
      await recordTeamUsageLog({
        requestId,
        userId: customerMatch.customer.id,
        teamId: requestedTeamId,
        apiKeyId: customerMatch.apiKey.id,
        provider: selected.provider,
        model: selected.modelId,
        purpose: requestedPurpose,
        requestSummary: prompt,
        requestHash,
        clientIp: ip,
        clientName,
        success: false,
        errorCode: "TEAM_TOKEN_POOL_EMPTY",
        errorMessage: "当前团队可用 Token 不足，请联系管理员。",
        finalStatus: BILLING_FLOW_STATUS.UPSTREAM_ERROR,
      });
      throw new Error("TEAM_TOKEN_POOL_EMPTY");
    }
    const teamTokenUpstreams = teamTokenCandidates.map((token) => {
      const teamTokenUrl = `${String(token.baseUrl || "").replace(/\/+$/, "")}${String(token.apiPath || "/v1/chat/completions").startsWith("/") ? token.apiPath : `/${token.apiPath}`}`;
      return {
        name: "team-token-pool",
        label: `团队 Token 池 / ${token.name}`,
        apiKey: token.secret,
        upstreamUrl: teamTokenUrl,
        tokenPoolId: token.id,
        tokenPoolName: token.name,
        tokenPoolTeamId: token.teamId || "",
        teamToken: token,
      };
    });
    for (const candidate of teamTokenUpstreams) {
      if (candidate.upstreamUrl) await assertSafeUpstreamUrl(candidate.upstreamUrl);
    }
    const orderedUpstreams = teamTokenUpstreams.length ? teamTokenUpstreams : orderUpstreamsForFlowApiKey(routeDecision, upstreams);
    orderedFallbackTotal = orderedUpstreams.length;
    orderedFallbackChain = summarizeFallbackChain(orderedUpstreams);
    if (codexDiagnostic) codexDiagnostic.fallback_chain = orderedFallbackChain;

    for (const candidate of orderedUpstreams) {
      routeAttemptCount += 1;
      selectedDebugCandidate = candidate;
      if (codexDiagnostic) {
        codexDiagnostic.selected_channel_id = candidate.id || "";
        codexDiagnostic.selected_channel = candidate.name || candidate.id || "";
        codexDiagnostic.selected_provider = candidate.label || candidate.provider || candidate.name || candidate.id || "";
        codexDiagnostic.fallback_attempt = summarizeFallbackAttempt(routeAttemptCount, orderedFallbackTotal);
      }
      const candidateRequestId = buildRoutedRequestId(requestId, candidate.name || candidate.id || candidate.label || "");
      if (candidate.upstreamUrl) await assertSafeUpstreamUrl(candidate.upstreamUrl);
      const marginCheck = assertCandidateMargin(candidate, {
        modelId: selected.modelId,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: estimatedCompletionTokens,
        },
        modelProduct,
        multiplier: billingMultiplier,
      });
      if (!marginCheck.ok) {
        await recordRouteAttempt({
          requestId: candidateRequestId,
          customerId: customerMatch.customer.id,
          apiKeyId: customerMatch.apiKey.id,
          publicModelId,
          actualModelId: candidate.actualModelId || upstreamModelId,
          upstreamChannelId: candidate.id || "",
          upstreamChannel: candidate.name || "",
          upstreamProvider: candidate.label || "",
          attemptIndex: routeAttemptCount,
          attemptOrder: routeAttemptCount,
          status: "skipped",
          statusCode: 0,
          ok: false,
          latencyMs: 0,
          errorCode: marginCheck.code || "CHANNEL_MARGIN_PROTECTED",
          errorMessage: "候选渠道成本缺失或低于 FlowAPI 毛利保护线，已跳过。",
        });
        lastUpstreamStatus = 0;
        lastUpstreamErrorCode = marginCheck.code || "CHANNEL_MARGIN_PROTECTED";
        lastUpstreamErrorMessage = "候选渠道成本缺失或低于 FlowAPI 毛利保护线，已跳过。";
        lastFallbackReason = lastUpstreamErrorCode;
        fallbackTrace.push(buildFallbackTraceEntry({
          candidate,
          attemptIndex: routeAttemptCount,
          status: 0,
          errorCode: lastUpstreamErrorCode,
          endpointType: preferResponsesUpstream ? "responses" : "chat",
          reason: lastFallbackReason,
        }));
        if (codexDiagnostic) {
          codexDiagnostic.fallback_reason = lastFallbackReason;
          codexDiagnostic.upstream_error_code = lastUpstreamErrorCode;
          codexDiagnostic.upstream_error_message = lastUpstreamErrorMessage;
        }
        lastUpstreamError = new Error("候选渠道成本缺失或低于 FlowAPI 毛利保护线");
        continue;
      }
      const authorizationToken = String(candidate.apiKey || "").trim()
        || (candidate.name === "new-api" ? getNewApiAuthorizationToken({ modelProduct }) : "");
      if (!authorizationToken) {
        await recordRouteAttempt({
          requestId: candidateRequestId,
          customerId: customerMatch.customer.id,
          apiKeyId: customerMatch.apiKey.id,
          publicModelId,
          actualModelId: upstreamModelId,
          upstreamChannelId: candidate.id || "",
          upstreamChannel: candidate.name || "",
          upstreamProvider: candidate.label || "",
          attemptIndex: routeAttemptCount,
          attemptOrder: routeAttemptCount,
          status: "failed",
          statusCode: 0,
          ok: false,
          latencyMs: 0,
          errorCode: "MODEL_SERVICE_TOKEN_MISSING",
          errorMessage: "服务端模型线路未配置 API Key",
        });
        lastUpstreamStatus = 0;
        lastUpstreamErrorCode = "MODEL_SERVICE_TOKEN_MISSING";
        lastUpstreamErrorMessage = "服务端模型线路未配置 API Key";
        lastFallbackReason = lastUpstreamErrorCode;
        fallbackTrace.push(buildFallbackTraceEntry({
          candidate,
          attemptIndex: routeAttemptCount,
          status: 0,
          errorCode: lastUpstreamErrorCode,
          endpointType: preferResponsesUpstream ? "responses" : "chat",
          reason: lastFallbackReason,
        }));
        if (codexDiagnostic) {
          codexDiagnostic.fallback_reason = lastFallbackReason;
          codexDiagnostic.upstream_error_code = lastUpstreamErrorCode;
          codexDiagnostic.upstream_error_message = lastUpstreamErrorMessage;
        }
        lastUpstreamError = new Error("服务端模型线路未配置 API Key");
        continue;
      }
      const headers = {
        Authorization: `Bearer ${authorizationToken}`,
        "Content-Type": "application/json",
      };
      const attemptModelId = mapModelForUpstream(candidate.name, candidate.actualModelId || upstreamModelId);
      const chatAttemptBody = attemptModelId === upstreamBody.model
        ? upstreamBody
        : { ...upstreamBody, model: attemptModelId };
      const responsesAttemptBody = preferResponsesUpstream && internalResponsesRequest
        ? normalizeResponsesRequestBody(internalResponsesRequest, attemptModelId)
        : null;
      const useResponsesEndpoint = Boolean(
        responsesAttemptBody
        && !candidate.teamToken
        && candidate.supportsResponsesApi !== false
        && candidate.responsesUrl
      );
      let responseCandidate = {
        ...candidate,
        upstreamUrl: useResponsesEndpoint ? candidate.responsesUrl : (candidate.chatCompletionsUrl || candidate.upstreamUrl),
        endpointType: useResponsesEndpoint ? "responses" : "chat",
      };
      selectedDebugCandidate = responseCandidate;
      let effectiveAttemptBody = useResponsesEndpoint && responsesAttemptBody ? responsesAttemptBody : chatAttemptBody;
      if (codexDiagnostic) {
        codexDiagnostic.route_attempts = routeAttemptCount;
        codexDiagnostic.selected_channel = candidate.name || candidate.id || "";
        codexDiagnostic.selected_provider = candidate.label || "";
        codexDiagnostic.selected_upstream_model = attemptModelId;
        codexDiagnostic.forwarded_shape = responseCandidate.endpointType === "responses"
          ? summarizeResponsesRequestShape(effectiveAttemptBody)
          : summarizeBodyShape(effectiveAttemptBody);
        codexDiagnostic.forwarded_has_tools = Array.isArray(effectiveAttemptBody.tools) && effectiveAttemptBody.tools.length > 0;
        codexDiagnostic.forwarded_tools_count = Array.isArray(effectiveAttemptBody.tools) ? effectiveAttemptBody.tools.length : 0;
        codexDiagnostic.forwarded_has_tool_choice = effectiveAttemptBody.tool_choice != null;
        codexDiagnostic.forwarded_has_parallel_tool_calls = effectiveAttemptBody.parallel_tool_calls != null;
      }

      if (candidate.name === "openrouter") {
        headers["HTTP-Referer"] = referer;
        headers["X-Title"] = title;
      }

      const attemptStart = Date.now();
      const controller = new AbortController();
      const configuredUpstreamTimeoutMs = Number(process.env.UPSTREAM_REQUEST_TIMEOUT_MS || (codexDiagnostic ? 600_000 : 60_000));
      const upstreamTimeoutMs = Number.isFinite(configuredUpstreamTimeoutMs) ? Math.max(10_000, configuredUpstreamTimeoutMs) : (codexDiagnostic ? 600_000 : 60_000);
      const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs);
      try {
        if (responseCandidate.upstreamUrl) await assertSafeUpstreamUrl(responseCandidate.upstreamUrl);
        let response = await fetch(responseCandidate.upstreamUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(effectiveAttemptBody),
          redirect: "manual",
          signal: controller.signal,
        });
        let latencyMs = Date.now() - attemptStart;

        // Read upstream error body for diagnostics (only when failed)
        let upstreamErrPayload = { code: "", message: "" };
        if (!response.ok) {
          upstreamErrPayload = await readUpstreamError(response);
          logModelServiceFailure({
            requestId: candidateRequestId,
            candidate: responseCandidate,
            attemptBody: effectiveAttemptBody,
            publicModelId,
            upstreamModel: attemptModelId,
            status: response.status,
            upstreamError: upstreamErrPayload,
            latencyMs,
            layer: "upstream_http_status",
          });
        }

        if (!response.ok && responseCandidate.endpointType === "responses" && shouldRetryResponsesAsChat(response.status, upstreamErrPayload) && candidate.chatCompletionsUrl) {
          responseCandidate = {
            ...candidate,
            upstreamUrl: candidate.chatCompletionsUrl,
            endpointType: "chat",
          };
          selectedDebugCandidate = responseCandidate;
          effectiveAttemptBody = chatAttemptBody;
          if (codexDiagnostic) {
            codexDiagnostic.forwarded_shape = summarizeBodyShape(effectiveAttemptBody);
            codexDiagnostic.forwarded_has_tools = Array.isArray(effectiveAttemptBody.tools) && effectiveAttemptBody.tools.length > 0;
            codexDiagnostic.forwarded_tools_count = Array.isArray(effectiveAttemptBody.tools) ? effectiveAttemptBody.tools.length : 0;
            codexDiagnostic.forwarded_has_tool_choice = effectiveAttemptBody.tool_choice != null;
            codexDiagnostic.forwarded_has_parallel_tool_calls = effectiveAttemptBody.parallel_tool_calls != null;
          }
          await assertSafeUpstreamUrl(responseCandidate.upstreamUrl);
          response = await fetch(responseCandidate.upstreamUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(effectiveAttemptBody),
            redirect: "manual",
            signal: controller.signal,
          });
          latencyMs = Date.now() - attemptStart;
          upstreamErrPayload = response.ok ? { code: "", message: "" } : await readUpstreamError(response);
          if (!response.ok) {
            logModelServiceFailure({
              requestId: candidateRequestId,
              candidate: responseCandidate,
              attemptBody: effectiveAttemptBody,
              publicModelId,
              upstreamModel: attemptModelId,
              status: response.status,
              upstreamError: upstreamErrPayload,
              latencyMs,
              layer: "upstream_http_status_after_responses_fallback",
            });
          }
        }

        if (codexDiagnostic) {
          codexDiagnostic.upstream_status = response.status;
          codexDiagnostic.upstream_content_type = response.headers.get("content-type") || "";
          codexDiagnostic.duration_ms = Date.now() - requestStartedAt;
        }

        await recordRouteAttempt({
          requestId: candidateRequestId,
          customerId: customerMatch.customer.id,
          apiKeyId: customerMatch.apiKey.id,
          publicModelId,
          actualModelId: upstreamModelId,
          upstreamChannelId: candidate.id || "",
          upstreamChannel: candidate.name || "",
          upstreamProvider: candidate.label || "",
          attemptIndex: routeAttemptCount,
          attemptOrder: routeAttemptCount,
          status: response.ok ? "success" : "failed",
          statusCode: response.status,
          ok: response.ok,
          latencyMs,
          errorCode: response.ok ? "" : (upstreamErrPayload.code || "MODEL_SERVICE_STATUS"),
          errorMessage: response.ok ? "" : (upstreamErrPayload.message || `模型服务返回 ${response.status}`),
        });

        if (!response.ok) {
          lastUpstreamStatus = response.status;
          lastUpstreamErrorCode = upstreamErrPayload.code || "MODEL_SERVICE_STATUS";
          lastUpstreamErrorMessage = upstreamErrPayload.message || `模型服务返回 ${response.status}`;
          lastFallbackReason = response.status === 413 ? "body_too_large" : lastUpstreamErrorCode;
          fallbackTrace.push(buildFallbackTraceEntry({
            candidate: responseCandidate,
            attemptIndex: routeAttemptCount,
            status: response.status,
            errorCode: lastUpstreamErrorCode,
            endpointType: responseCandidate.endpointType,
            reason: lastFallbackReason,
          }));
          if (codexDiagnostic) {
            codexDiagnostic.fallback_reason = lastFallbackReason;
            codexDiagnostic.upstream_error_code = lastUpstreamErrorCode;
            codexDiagnostic.upstream_error_message = lastUpstreamErrorMessage;
          }
        }

        if (response.ok) {
          requestId = candidateRequestId;
          upstream = responseCandidate;
          upstreamResponse = response;
          upstreamLatencyMs = latencyMs;
          selectedDebugCandidate = responseCandidate;
          lastUpstreamStatus = response.status;
          if (candidate.teamToken) teamToken = candidate.teamToken;
          break;
        }

        lastUpstreamError = new Error(`${candidate.label} 返回 ${response.status}`);
        const shouldTryNext = [401, 402, 403, 404, 408, 429, 500, 502, 503, 504].includes(response.status)
          || response.status >= 500
          || shouldRetryBadRequestViaFallback(response.status, upstreamErrPayload, effectiveAttemptBody);
        const shouldTryNextWithBodyTooLarge = shouldTryNext || response.status === 413;
        if (shouldTryNextWithBodyTooLarge) continue;

        requestId = candidateRequestId;
        upstream = responseCandidate;
        upstreamResponse = response;
        upstreamLatencyMs = latencyMs;
        if (candidate.teamToken) teamToken = candidate.teamToken;
        break;
      } catch (error) {
        lastUpstreamError = error;
        lastUpstreamStatus = 0;
        lastUpstreamErrorCode = error?.name === "AbortError" ? "timeout" : (error?.name || "connection_error");
        lastUpstreamErrorMessage = sanitizeSecretText(error?.message || "model service fetch failed");
        lastFallbackReason = lastUpstreamErrorCode;
        fallbackTrace.push(buildFallbackTraceEntry({
          candidate: responseCandidate,
          attemptIndex: routeAttemptCount,
          status: 0,
          errorCode: lastUpstreamErrorCode,
          endpointType: responseCandidate?.endpointType || (preferResponsesUpstream ? "responses" : "chat"),
          reason: lastFallbackReason,
        }));
        if (codexDiagnostic) {
          codexDiagnostic.upstream_status = 0;
          codexDiagnostic.duration_ms = Date.now() - requestStartedAt;
          codexDiagnostic.fallback_reason = lastFallbackReason;
          codexDiagnostic.upstream_error_code = lastUpstreamErrorCode;
          codexDiagnostic.upstream_error_message = lastUpstreamErrorMessage;
        }
        await recordRouteAttempt({
          requestId: candidateRequestId,
          customerId: customerMatch.customer.id,
          apiKeyId: customerMatch.apiKey.id,
          publicModelId,
          actualModelId: upstreamModelId,
          upstreamChannelId: candidate.id || "",
          upstreamChannel: candidate.name || "",
          upstreamProvider: candidate.label || "",
          attemptIndex: routeAttemptCount,
          attemptOrder: routeAttemptCount,
          status: "failed",
          statusCode: 0,
          ok: false,
          latencyMs: Date.now() - attemptStart,
          errorCode: lastUpstreamErrorCode,
          errorMessage: lastUpstreamErrorMessage,
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!upstreamResponse || !upstream) {
      throw lastUpstreamError || new Error("Upstream request failed");
    }

    const contentType = upstreamResponse.headers.get("content-type") || "";
    const upstreamEndpointType = upstream?.endpointType === "responses" ? "responses" : "chat";
    const isResponsesUpstream = upstreamEndpointType === "responses";
    res.setHeader("x-flowapi-upstream-endpoint", upstreamEndpointType);

    if (body.stream && contentType.includes("text/event-stream") && upstreamResponse.body) {
      applyCurrentFlowDebugHeaders({
        candidate: upstream,
        requestIdOverride: requestId,
        upstreamEndpoint: upstreamEndpointType,
        upstreamStatus: upstreamResponse.status,
      });
      res.status(upstreamResponse.status);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") res.flushHeaders();

	      const nodeStream = Readable.fromWeb(upstreamResponse.body);
	      const decoder = new TextDecoder();
	      let sseBuffer = "";
      let streamUsage = null;
      let streamSawDone = false;
      let streamCompletedDelivered = false;
      let streamFinalized = false;
      let streamResponseEnded = false;
      let concurrencyReleased = false;
      let firstTokenMs = 0;
      let streamTextForDiagnostic = "";

      const releaseOnce = () => {
        if (concurrencyReleased) return;
        concurrencyReleased = true;
        releaseConcurrency(concurrencyKey);
      };

	      const processSseLine = (line) => {
	        const trimmed = String(line || "").trim();
	        if (!trimmed.startsWith("data:")) return line;
	        const payload = trimmed.slice(5).trim();
	        if (!payload) return line;
	        if (payload === "[DONE]") {
	          streamSawDone = true;
	          streamCompletedDelivered = true;
	          return "data: [DONE]";
	        }
	        try {
	          const event = JSON.parse(payload);
	          const eventUsage = event?.usage || event?.response?.usage || null;
	          if (eventUsage) streamUsage = eventUsage;
	          noteCodexChatSseEvent(codexDiagnostic, event);
	          const choice = Array.isArray(event?.choices) ? event.choices[0] : null;
	          const responseOutput = Array.isArray(event?.response?.output) ? event.response.output : [];
	          const responseText = typeof event?.response?.output_text === "string"
	            ? event.response.output_text
	            : responseOutput
	              .map((item) => Array.isArray(item?.content)
	                ? item.content.map((part) => part?.text || part?.output_text || "").filter(Boolean).join("\n")
	                : "")
	              .filter(Boolean)
	              .join("\n");
	          const deltaText = choice?.delta?.content ?? choice?.message?.content ?? event?.delta?.text ?? responseText ?? "";
	          if (deltaText && streamTextForDiagnostic.length < 8000) {
	            streamTextForDiagnostic = `${streamTextForDiagnostic}${deltaText}`.slice(0, 8000);
	          }
	          const sanitized = isResponsesUpstream
	            ? sanitizeResponsesSseEventForClient(event, { publicModelId, requestId })
	            : sanitizeSseEventForClient(event, { publicModelId, requestId });
	          return `data: ${JSON.stringify(sanitized)}`;
	        } catch {
	          return isResponsesUpstream
	            ? line
	            : `data: ${JSON.stringify(buildSanitizedSsePlaceholder({ publicModelId, requestId }))}`;
	        }
	      };

	      const transformSseText = (text = "", { flush = false } = {}) => {
	        sseBuffer += text;
	        const lines = sseBuffer.split(/\r?\n/);
	        sseBuffer = flush ? "" : (lines.pop() || "");
	        const transformed = lines.map((line) => processSseLine(line)).join("\n");
	        return lines.length ? `${transformed}\n` : "";
	      };

	      const transformSseChunk = (chunk) => {
	        return transformSseText(decoder.decode(chunk, { stream: true }));
	      };

	      const finalizeStream = (statusCode = upstreamResponse.status, { upstreamEnded = false } = {}) => {
	        if (streamFinalized) return;
	        streamFinalized = true;
	        const totalLatencyMs = Date.now() - requestStartedAt;
	        const tail = decoder.decode();
	        const finalText = transformSseText(tail, { flush: true });
	        if (finalText && !res.writableEnded && !res.destroyed) res.write(finalText);
	        if (sseBuffer.trim()) processSseLine(sseBuffer);
        if (upstreamEnded && statusCode >= 200 && statusCode < 300 && !streamCompletedDelivered && !res.writableEnded && !res.destroyed) {
          res.write("data: [DONE]\n\n");
          streamSawDone = true;
          streamCompletedDelivered = true;
          if (typeof res.flush === "function") res.flush();
        }
        const usage = streamUsage ? {
          prompt_tokens: Number(streamUsage.prompt_tokens ?? streamUsage.input_tokens ?? 0),
          completion_tokens: Number(streamUsage.completion_tokens ?? streamUsage.output_tokens ?? 0),
          total_tokens: Number(streamUsage.total_tokens ?? (Number(streamUsage.prompt_tokens ?? streamUsage.input_tokens ?? 0) + Number(streamUsage.completion_tokens ?? streamUsage.output_tokens ?? 0))),
        } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        const streamCompleted = statusCode >= 200 && statusCode < 300 && streamCompletedDelivered && streamSawDone;
        const hasBillableUsage = Boolean(streamUsage) && usage.total_tokens > 0 && usage.completion_tokens > 0;
        const shouldBill = streamCompleted && hasBillableUsage;
        const recordedStatus = shouldBill ? upstreamResponse.status : (statusCode === 499 ? 499 : (statusCode >= 200 && statusCode < 300 ? 520 : statusCode));
        const streamFinalStatus = shouldBill
          ? BILLING_FLOW_STATUS.SUCCESS_COMPLETED
          : statusCode === 499
            ? BILLING_FLOW_STATUS.CLIENT_ABORTED
            : !streamCompleted
              ? BILLING_FLOW_STATUS.STREAM_INCOMPLETE
              : !streamUsage
                ? BILLING_FLOW_STATUS.USAGE_MISSING
                : BILLING_FLOW_STATUS.STREAM_FAILED;
        const streamErrorCode = shouldBill
          ? ""
          : statusCode === 499
            ? "CLIENT_ABORTED"
            : !streamCompleted
              ? "STREAM_INCOMPLETE"
              : !streamUsage
                ? "USAGE_MISSING"
                : "STREAM_FAILED";
        const billing = shouldBill
          ? buildBillingSnapshotForCandidate(selected.modelId, usage, modelProduct, billingMultiplier, upstream)
          : zeroBilling(modelProduct);
        finalizeCodexChatDiagnostic(codexDiagnostic, {
          request_id: requestId,
          upstream_status: upstreamResponse.status,
          upstream_content_type: upstreamResponse.headers.get("content-type") || "",
          selected_channel: upstream?.name || "",
          selected_provider: upstream?.label || "",
          route_attempts: routeAttemptCount,
          duration_ms: totalLatencyMs,
          text_looks_like_tool_json: Boolean(codexDiagnostic?.text_looks_like_tool_json || textLooksLikeToolJson(streamTextForDiagnostic)),
          stream_completed: streamCompleted,
          billing_status: shouldBill ? BILLING_FLOW_STATUS.SUCCESS_COMPLETED : BILLING_FLOW_STATUS.NOT_BILLED,
          delivery_status: streamFinalStatus,
        });
        finalizeWithRelayAudit({
          requestId,
          endpoint: "/v1/chat/completions",
          requestedModel: body.model || "auto",
          routedModel: selected.name,
          publicModelId,
          actualModelId: upstreamModelId,
          provider: selected.provider,
          upstreamChannel: upstream?.name || "",
          upstreamProvider: upstream?.label || "",
          upstreamStatus: upstreamResponse.status,
          latencyMs: totalLatencyMs,
          firstTokenMs,
          status: recordedStatus,
          promptTokens: shouldBill ? usage.prompt_tokens : 0,
          completionTokens: shouldBill ? usage.completion_tokens : 0,
          cost: billing.sellPriceCny,
          sellPriceCny: billing.sellPriceCny,
          upstreamCostCny: billing.upstreamCostCny,
          profitCny: billing.profitCny,
          profitMargin: billing.profitMargin,
          billingMode: billing.billingMode,
          routeStrategy: routeDecision.strategy || "",
          routeAttempts: routeAttemptCount,
          isStream: true,
          errorCode: streamErrorCode,
          errorMessage: shouldBill ? "" : "流式响应未完整交付或缺少完整用量，本次不按成功扣费",
          deliveryStatus: shouldBill ? BILLING_FLOW_STATUS.SUCCESS_COMPLETED : streamFinalStatus,
          billingStatus: shouldBill ? BILLING_FLOW_STATUS.SUCCESS_COMPLETED : BILLING_FLOW_STATUS.NOT_BILLED,
          billingFlowStatus: shouldBill ? BILLING_FLOW_STATUS.SUCCESS_COMPLETED : streamFinalStatus,
          grantUsageCredit: shouldBill,
        }, reserve).then(async () => {
          if (requestedTeamId) {
            await recordTeamUsageLog({
              requestId,
              userId: customerMatch.customer.id,
              teamId: requestedTeamId,
              apiKeyId: customerMatch.apiKey.id,
              tokenId: teamToken?.id || "",
              provider: teamToken?.provider || selected.provider,
              model: selected.modelId,
              modelType: modelProduct?.group || "",
              purpose: requestedPurpose,
              requestSummary: prompt,
              requestHash,
              clientIp: ip,
              clientName,
	              inputTokens: shouldBill ? usage.prompt_tokens : 0,
	              outputTokens: shouldBill ? usage.completion_tokens : 0,
	              totalTokens: shouldBill ? usage.total_tokens : 0,
	              officialCostCny: billing.upstreamCostCny,
	              actualCostCny: billing.sellPriceCny,
              durationMs: totalLatencyMs,
              firstTokenMs,
              upstreamRequestId: upstreamResponse.headers.get("x-request-id") || "",
              success: shouldBill,
              finalStatus: streamFinalStatus,
            });
            if (shouldBill) {
              await recordTeamMemberUsage({
                teamId: requestedTeamId,
                userId: customerMatch.customer.id,
                requestId,
                costCny: billing.sellPriceCny,
                tokens: usage.total_tokens || 0,
                requests: 1,
                success: true,
              });
            }
          }
          return null;
        }).catch((error) => console.error("[flowapi] stream record failed:", error))
          .finally(releaseOnce);
      };

      nodeStream.on("end", () => {
        finalizeStream(upstreamResponse.status, { upstreamEnded: true });
        streamResponseEnded = true;
        res.end();
      });

      nodeStream.on("error", (error) => {
        console.error("[flowapi] upstream stream error:", error);
        if (!res.writableEnded && !res.destroyed) {
          res.write(`data: ${JSON.stringify({
            error: {
              message: "当前响应传输中断，请稍后重试。",
              type: "stream_incomplete",
              code: "STREAM_INCOMPLETE",
            },
            request_id: requestId,
          })}\n\n`);
        }
        finalizeStream(503);
        if (!res.writableEnded && !res.destroyed) res.end();
      });

      res.on("close", () => {
        if (streamResponseEnded || streamFinalized) return;
        nodeStream.destroy(new Error("CLIENT_CONNECTION_CLOSED"));
        finalizeStream(499);
      });

	      nodeStream.on("data", (chunk) => {
	        if (!firstTokenMs) {
	          firstTokenMs = Date.now() - requestStartedAt;
	          updateRouteAttemptFirstToken({ requestId, attemptIndex: routeAttemptCount, firstTokenMs }).catch(() => {});
	        }
	        const safeChunk = transformSseChunk(chunk);
	        if (safeChunk && !res.writableEnded && !res.destroyed) res.write(safeChunk);
	        if (typeof res.flush === "function" && !res.writableEnded && !res.destroyed) res.flush();
	      });
      return;
    }

    const upstreamOk = upstreamResponse.ok;
    const upstreamText = await upstreamResponse.text();
    let data = {};
    try {
      data = upstreamText ? JSON.parse(upstreamText) : {};
    } catch (error) {
      if (upstreamOk) throw error;
      const parsedUpstreamError = parseUpstreamErrorPayload(upstreamText);
      data = {
        error: {
          type: parsedUpstreamError.code || "upstream_error",
          message: parsedUpstreamError.message || sanitizeSecretText(error?.message || "模型服务返回了无法解析的错误响应"),
        },
      };
    }
    const usage = upstreamOk ? normalizeSuccessUsage(data, promptTokens) : zeroUsage();
    const successfulBilling = upstreamOk
      ? buildBillingSnapshotForCandidate(selected.modelId, usage, modelProduct, billingMultiplier, upstream)
      : zeroBilling(modelProduct);
    const totalLatencyMs = Date.now() - requestStartedAt;
    const upstreamErrorMessage = sanitizeSecretText(typeof data.error === "string" ? data.error : data.error?.message || "");

    const responsePayload = upstreamOk
      ? isResponsesUpstream
        ? sanitizeResponsesPayloadForClient(data, { publicModelId, requestId })
        : {
            ...sanitizeOpenAiResponseForClient(data, { publicModelId, requestId }),
            token_router: {
              routed_model: selected.name,
              routed_model_id: selected.modelId,
              flowapi_route: "router",
              service_provider: "FlowAPI",
              first_token_ms: 0,
              latency_ms: totalLatencyMs,
              estimated_cost_cny: successfulBilling.sellPriceCny,
              balance_cny: reserve?.customer?.balance,
              request_id: requestId,
              team_id: requestedTeamId || undefined,
              cache_hit: false,
            },
          }
      : {
          code: "MODEL_SERVICE_ERROR",
          error: "模型服务返回错误",
          suggestion: getUpstreamSuggestion(upstreamResponse.status, isResponsesUpstream ? "responses" : "chat_completions"),
          docsUrl: "/help#error-codes",
          request_id: requestId,
        };

    applyCurrentFlowDebugHeaders({
      candidate: upstream,
      requestIdOverride: requestId,
      upstreamEndpoint: upstreamEndpointType,
      upstreamStatus: upstreamResponse.status,
      fallbackReason: !upstreamOk ? lastFallbackReason : lastFallbackReason,
    });
    const delivery = await sendJsonAfterDelivery(
      res,
      upstreamOk ? upstreamResponse.status : (upstreamResponse.status >= 400 ? upstreamResponse.status : 502),
      responsePayload
    );
    const shouldBill = upstreamOk && delivery.delivered;
    const finalUsage = shouldBill ? usage : zeroUsage();
    const billing = shouldBill ? successfulBilling : zeroBilling(modelProduct);
    const deliveryStatus = shouldBill
      ? BILLING_FLOW_STATUS.SUCCESS_COMPLETED
      : upstreamOk
        ? (delivery.status === BILLING_FLOW_STATUS.CLIENT_ABORTED ? BILLING_FLOW_STATUS.CLIENT_ABORTED : BILLING_FLOW_STATUS.UPSTREAM_COMPLETED_DOWNSTREAM_FAILED)
        : BILLING_FLOW_STATUS.UPSTREAM_ERROR;
    const billingStatus = shouldBill ? BILLING_FLOW_STATUS.SUCCESS_COMPLETED : BILLING_FLOW_STATUS.NOT_BILLED;
    const recordedStatus = shouldBill
      ? upstreamResponse.status
      : upstreamOk
        ? (delivery.status === BILLING_FLOW_STATUS.CLIENT_ABORTED ? 499 : 520)
        : (upstreamResponse.status >= 400 ? upstreamResponse.status : 502);

    if (codexDiagnostic) {
      const choices = Array.isArray(data?.choices) ? data.choices : [];
      const responseOutput = Array.isArray(data?.output) ? data.output : [];
      const hasChatToolCalls = choices.some((choice) => Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length > 0);
      const hasResponseFunctionCalls = responseOutput.some((item) => item?.type === "function_call");
      const responseText = typeof data?.output_text === "string"
        ? data.output_text
        : responseOutput
          .map((item) => Array.isArray(item?.content)
            ? item.content.map((part) => part?.text || part?.output_text || "").filter(Boolean).join("\n")
            : "")
          .filter(Boolean)
          .join("\n");
      codexDiagnostic.event_count += 1;
      codexDiagnostic.first_event_type = codexDiagnostic.first_event_type || (isResponsesUpstream ? "response.completed" : "chat.completion");
      codexDiagnostic.has_tool_call_event = codexDiagnostic.has_tool_call_event || hasChatToolCalls || hasResponseFunctionCalls;
      codexDiagnostic.has_function_call_event = codexDiagnostic.has_function_call_event || hasResponseFunctionCalls;
      codexDiagnostic.has_output_item = codexDiagnostic.has_output_item || responseOutput.length > 0;
      codexDiagnostic.text_looks_like_tool_json = codexDiagnostic.text_looks_like_tool_json || textLooksLikeToolJson(isResponsesUpstream ? responseText : extractChatResponseText(data));
      finalizeCodexChatDiagnostic(codexDiagnostic, {
        request_id: requestId,
        upstream_status: upstreamResponse.status,
        upstream_content_type: contentType,
        selected_channel: upstream?.name || "",
        selected_provider: upstream?.label || "",
        route_attempts: routeAttemptCount,
        duration_ms: totalLatencyMs,
        delivery_status: deliveryStatus,
        billing_status: billingStatus,
      });
    }

    try {
      await finalizeWithRelayAudit({
        requestId,
        endpoint: "/v1/chat/completions",
        requestedModel: body.model || "auto",
        routedModel: selected.name,
        publicModelId,
        actualModelId: upstreamModelId,
        provider: selected.provider,
        upstreamChannel: upstream?.name || "",
        upstreamProvider: upstream?.label || "",
        upstreamStatus: upstreamResponse.status,
        latencyMs: totalLatencyMs,
        firstTokenMs: 0,
        status: recordedStatus,
        promptTokens: finalUsage.prompt_tokens || 0,
        completionTokens: finalUsage.completion_tokens || 0,
        cost: billing.sellPriceCny,
        sellPriceCny: billing.sellPriceCny,
        upstreamCostCny: billing.upstreamCostCny,
        profitCny: billing.profitCny,
        profitMargin: billing.profitMargin,
        billingMode: billing.billingMode,
        routeStrategy: routeDecision.strategy || "",
        routeAttempts: routeAttemptCount,
        isStream: false,
        errorCode: shouldBill ? "" : (upstreamOk ? "DOWNSTREAM_DELIVERY_FAILED" : "MODEL_SERVICE_ERROR"),
        errorMessage: shouldBill ? "" : (upstreamOk ? "响应未完整返回，本次不按成功扣费" : upstreamErrorMessage),
        deliveryStatus,
        billingStatus,
        billingFlowStatus: deliveryStatus,
        grantUsageCredit: shouldBill,
      }, reserve);
      settlementFinalized = true;
    } catch (error) {
      settlementFinalized = true;
      console.error("[flowapi] non-stream settlement after delivery failed:", error);
    }

    if (requestedTeamId) {
      try {
        await recordTeamUsageLog({
          requestId,
          userId: customerMatch.customer.id,
          teamId: requestedTeamId,
          apiKeyId: customerMatch.apiKey.id,
          tokenId: teamToken?.id || "",
          provider: teamToken?.provider || selected.provider,
          model: selected.modelId,
          modelType: modelProduct?.group || "",
          purpose: requestedPurpose,
          requestSummary: prompt,
          requestHash,
          clientIp: ip,
          clientName,
          requestParams: { temperature: upstreamBody.temperature, max_tokens: upstreamBody.max_tokens },
          inputTokens: shouldBill ? usage.prompt_tokens || 0 : 0,
          outputTokens: shouldBill ? usage.completion_tokens || 0 : 0,
          totalTokens: shouldBill ? usage.total_tokens || 0 : 0,
          officialCostCny: billing.upstreamCostCny,
          actualCostCny: billing.sellPriceCny,
          success: shouldBill,
          durationMs: upstreamLatencyMs,
          upstreamRequestId: upstreamResponse.headers.get("x-request-id") || data.id || "",
          errorCode: shouldBill ? "" : (upstreamOk ? "DOWNSTREAM_DELIVERY_FAILED" : "MODEL_SERVICE_ERROR"),
          errorMessage: shouldBill ? "" : (upstreamOk ? "响应未完整返回，本次不按成功扣费" : upstreamErrorMessage),
          upstreamError: !upstreamOk,
          finalStatus: shouldBill ? BILLING_FLOW_STATUS.SUCCESS_COMPLETED : deliveryStatus,
        });
        if (shouldBill) {
          await recordTeamMemberUsage({
            teamId: requestedTeamId,
            userId: customerMatch.customer.id,
            requestId,
            costCny: billing.sellPriceCny,
            tokens: usage.total_tokens || 0,
            requests: 1,
            success: true,
          });
        }
      } catch (error) {
        console.error("[flowapi] team usage attribution failed:", error);
      }
    }

    if (responseCacheEnabled && shouldUseResponseCache(upstreamBody) && shouldBill) {
      getCacheManager().set("responseCache", responseCacheKey, {
        data: responsePayload,
        usage,
        createdAt: new Date().toISOString(),
      }, CACHE_TTLS.responseCache);
    }

    releaseConcurrency(concurrencyKey);
    return;
  } catch (error) {
    if (!lastUpstreamErrorCode) lastUpstreamErrorCode = error.message === "TEAM_TOKEN_POOL_EMPTY" ? "TEAM_TOKEN_POOL_EMPTY" : (error?.name === "AbortError" ? "timeout" : "MODEL_SERVICE_REQUEST_FAILED");
    if (!lastUpstreamErrorMessage) lastUpstreamErrorMessage = sanitizeSecretText(error.message || "model service error");
    if (!lastFallbackReason) lastFallbackReason = lastUpstreamErrorCode;
    finalizeCodexChatDiagnostic(codexDiagnostic, {
      request_id: requestId,
      duration_ms: Date.now() - requestStartedAt,
      route_attempts: routeAttemptCount,
      upstream_status: 503,
      fallback_chain: orderedFallbackChain,
      fallback_attempt: summarizeFallbackAttempt(routeAttemptCount, orderedFallbackTotal),
      fallback_reason: lastFallbackReason,
      upstream_error_code: lastUpstreamErrorCode,
      upstream_error_message: lastUpstreamErrorMessage,
      adapter_error: error.message === "TEAM_TOKEN_POOL_EMPTY" ? "team_token_pool_empty" : (error?.name === "AbortError" ? "timeout" : "model_service_request_failed"),
    });
    if (requestedTeamId) {
      await recordTeamUsageLog({
        requestId,
        userId: customerMatch.customer.id,
        teamId: requestedTeamId,
        apiKeyId: customerMatch.apiKey.id,
        provider: selected.provider,
        model: selected.modelId,
        purpose: requestedPurpose,
        requestSummary: prompt,
        requestHash,
        clientIp: ip,
        clientName,
        success: false,
        errorCode: error.message === "TEAM_TOKEN_POOL_EMPTY" ? "TEAM_TOKEN_POOL_EMPTY" : "MODEL_SERVICE_REQUEST_FAILED",
        errorMessage: sanitizeSecretText(error.message || "model service error"),
        upstreamError: error.message !== "TEAM_TOKEN_POOL_EMPTY",
        finalStatus: BILLING_FLOW_STATUS.UPSTREAM_ERROR,
      }).catch(() => {});
    }
    if (!settlementFinalized) {
      await finalizeWithRelayAudit({
        requestId,
        endpoint: "/v1/chat/completions",
        requestedModel: body.model || "auto",
        routedModel: selected.name,
        publicModelId,
        actualModelId: upstreamModelId,
        provider: selected.provider,
        upstreamChannel: "",
        upstreamProvider: "",
        upstreamStatus: 503,
        latencyMs: 0,
        status: 503,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
        sellPriceCny: 0,
        upstreamCostCny: 0,
        profitCny: 0,
        profitMargin: 0,
        billingMode: modelProduct?.pricing?.billingMode || "token_multiplier",
        routeStrategy: routeDecision.strategy || "failed",
        routeAttempts: routeAttemptCount,
        isStream: Boolean(body.stream),
        errorCode: error.message === "TEAM_TOKEN_POOL_EMPTY" ? "TEAM_TOKEN_POOL_EMPTY" : "MODEL_SERVICE_REQUEST_FAILED",
        errorMessage: sanitizeSecretText(error.message || "model service error"),
        deliveryStatus: BILLING_FLOW_STATUS.UPSTREAM_ERROR,
        billingStatus: BILLING_FLOW_STATUS.NOT_BILLED,
        billingFlowStatus: BILLING_FLOW_STATUS.UPSTREAM_ERROR,
      }, reserve);
    }

    logFinalRouteFailure({
      requestId,
      wireApi: wireApiMode,
      publicModelId,
      upstreamModel: upstreamModelId,
      customerId: customerMatch.customer.id,
      apiKeyId: customerMatch.apiKey.id,
      body,
      internalResponsesRequest,
      selectedCandidate: routeDecision?.upstream || routeDecision?.channel || null,
      lastCandidate: selectedDebugCandidate || upstream,
      fallbackChainText: orderedFallbackChain,
      routeAttemptCount,
      fallbackTrace,
      fallbackReason: lastFallbackReason,
      upstreamStatus: lastUpstreamStatus,
      upstreamErrorCode: lastUpstreamErrorCode,
      upstreamErrorMessage: lastUpstreamErrorMessage,
      durationMs: Date.now() - requestStartedAt,
    });
    applyCurrentFlowDebugHeaders({
      candidate: selectedDebugCandidate || upstream,
      requestIdOverride: requestId,
      upstreamEndpoint: (selectedDebugCandidate || upstream)?.endpointType || (preferResponsesUpstream ? "responses" : "chat"),
      upstreamStatus: lastUpstreamStatus,
      fallbackReason: lastFallbackReason,
    });
    releaseConcurrency(concurrencyKey);
    return sendApiError(
      res,
      error.message === "TEAM_TOKEN_POOL_EMPTY" ? 503 : 503,
      error.message === "TEAM_TOKEN_POOL_EMPTY" ? "TEAM_TOKEN_POOL_EMPTY" : "MODEL_SERVICE_REQUEST_FAILED",
      error.message === "TEAM_TOKEN_POOL_EMPTY" ? "当前团队可用 Token 不足，请联系管理员。" : "模型服务暂时不可用",
      error.message === "TEAM_TOKEN_POOL_EMPTY" ? "该团队没有匹配当前模型/用途的可用 Token，请管理员到团队 Token 池录入或启用 Token。" : "模型服务暂时无法连接，请稍后重试；如果持续失败，请切换其他模型或联系 FlowAPI 客服。",
      {
        request_id: requestId,
      });
  }
}

function makeRequestId(prefix = "req") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

function appendRouteSuffix(requestId = "", routeName = "") {
  const base = String(requestId || "").trim();
  if (!base) return base;
  if (/[ABCDX]$/.test(base)) return base;
  const name = String(routeName || "").toLowerCase();
  // A = sub2api (primary)
  if (name.includes("sub2api")) return `${base}A`;
  // B/C/D = new-api lines (first, second, third) — check specific names before generic new-api
  if (name.includes("new-api-3") || name.includes("newapi-3")) return `${base}D`;
  if (name.includes("new-api-2") || name.includes("newapi-2")) return `${base}C`;
  if (name.includes("new-api") || name.includes("newapi")) return `${base}B`;
  // X = openrouter (last resort)
  if (name.includes("openrouter")) return `${base}X`;
  return base;
}

function routeLineFromName(routeName = "") {
  const id = `probe_${String(routeName || "route").replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
  const suffix = appendRouteSuffix(id, routeName).slice(-1).toUpperCase();
  return /[ABCDX]/.test(suffix) ? suffix : "";
}

function safeUrlParts(value = "") {
  try {
    const url = new URL(String(value || ""));
    return { host: url.host, endpoint: url.pathname || "/" };
  } catch {
    return { host: "", endpoint: "" };
  }
}

function summarizeBodyShape(body = {}) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const roleCounts = messages.reduce((counts, message) => {
    const role = message?.role || "unknown";
    counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});
  const tools = Array.isArray(body?.tools) ? body.tools : [];
  const compaction = body?.__flowapi_compaction || {};
  return {
    fields: Object.keys(body || {}).sort(),
    endpointType: "chat_completions",
    hasMessages: messages.length > 0,
    messagesCount: messages.length,
    messageRoles: messages.map((m) => m?.role || "").slice(0, 12),
    roleCounts,
    assistantToolCallMessages: messages.filter((m) => Array.isArray(m?.tool_calls) && m.tool_calls.length).length,
    toolMessages: messages.filter((m) => m?.role === "tool").length,
    orphanToolMessages: messages.filter((m) => m?.role === "tool" && !m?.tool_call_id).length,
    messageChars: estimateRequestChars(messages),
    hasInput: body?.input != null,
    stream: Boolean(body?.stream),
    maxTokens: body?.max_tokens ?? null,
    hasTools: tools.length > 0 || Boolean(body?.tools),
    toolsCount: tools.length,
    toolsChars: estimateRequestChars(tools),
    compacted: Boolean(compaction.compacted),
    removedMessages: Number(compaction.removedMessages || 0),
    charsBeforeCompaction: Number(compaction.charsBefore || 0),
    charsAfterCompaction: Number(compaction.charsAfter || 0),
  };
}

function extractLeadingJsonObject(text = "") {
  const raw = String(text || "");
  const start = raw.search(/[\[{]/);
  if (start < 0) return "";
  const open = raw[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return raw.slice(start, index + 1);
    }
  }
  return "";
}

function parseUpstreamErrorPayload(text = "") {
  const safeText = sanitizeSecretText(String(text || "").slice(0, 4000));
  if (!safeText) return { code: "", message: "" };
  const candidates = [
    safeText,
    safeText.split(/\nevent:/i)[0]?.trim() || "",
    extractLeadingJsonObject(safeText),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const json = JSON.parse(candidate);
      const error = json?.error || json;
      return {
        code: String(error?.code || json?.code || error?.type || "").slice(0, 120),
        message: sanitizeSecretText(String(error?.message || json?.message || candidate).slice(0, 500)),
      };
    } catch {}
  }
  return { code: "", message: safeText.slice(0, 500) };
}

async function readUpstreamError(response) {
  if (!response || response.ok) return { code: "", message: "" };
  try {
    const text = await response.clone().text();
    return parseUpstreamErrorPayload(text);
  } catch (error) {
    return { code: "read_failed", message: sanitizeSecretText(error?.message || "读取模型服务错误失败") };
  }
}

function logModelServiceFailure({ requestId, candidate = {}, attemptBody = {}, publicModelId = "", upstreamModel = "", status = 0, upstreamError = {}, latencyMs = 0, error = null, layer = "model_service_request" } = {}) {
  const { host, endpoint } = safeUrlParts(candidate.upstreamUrl || "");
  const line = routeLineFromName(candidate.name || candidate.id || candidate.label || "");
  const requestShape = summarizeBodyShape(attemptBody);
  const payload = {
    event: "upstream_model_request_failed",
    request_id: requestId,
    requestId,
    route_code: line,
    route: line === "A" ? "primary" : line ? "fallback" : "unknown",
    line,
    provider: candidate.name || candidate.id || "",
    public_model_id: publicModelId || getPublicModelRequestId(attemptBody?.model || ""),
    upstream_model_id: upstreamModel,
    model: attemptBody?.model || "",
    upstreamModel,
    upstreamHost: host,
    endpoint,
    endpoint_type: endpoint.includes("/responses") ? "responses" : "chat_completions",
    upstream_status: Number(status || 0),
    status,
    upstream_error_code: upstreamError?.code || (error?.name || ""),
    upstreamErrorCode: upstreamError?.code || (error?.name || ""),
    sanitized_upstream_error: sanitizeSecretText(upstreamError?.message || error?.message || ""),
    upstreamErrorMessage: sanitizeSecretText(upstreamError?.message || error?.message || ""),
    stream: Boolean(attemptBody?.stream),
    latencyMs: Number(latencyMs || 0),
    request_shape: requestShape,
    bodyShape: requestShape,
    layer,
  };
  console.error("[flowapi-upstream-diagnostic]", JSON.stringify(payload));
}

function logFinalRouteFailure({
  requestId = "",
  wireApi = "chat",
  publicModelId = "",
  upstreamModel = "",
  customerId = "",
  apiKeyId = "",
  body = {},
  internalResponsesRequest = null,
  selectedCandidate = null,
  lastCandidate = null,
  orderedUpstreams = [],
  fallbackChainText = "",
  routeAttemptCount = 0,
  fallbackTrace = [],
  fallbackReason = "",
  upstreamStatus = 0,
  upstreamErrorCode = "",
  upstreamErrorMessage = "",
  durationMs = 0,
} = {}) {
  const candidate = lastCandidate || selectedCandidate || {};
  const payload = {
    event: "flowapi_route_failure",
    request_id: requestId,
    method: "POST",
    path: "/v1/chat/completions",
    wire_api: wireApi || "chat",
    model: publicModelId || body?.model || "",
    user_id: customerId || "",
    api_key_id: apiKeyId || "",
    stream: body?.stream === true,
    has_tools: Array.isArray(body?.tools) && body.tools.length > 0,
    has_previous_response_id: Boolean(body?.previous_response_id || internalResponsesRequest?.previous_response_id),
    selected_channel_id: candidate?.id || selectedCandidate?.id || "",
    selected_channel: candidate?.name || candidate?.id || selectedCandidate?.name || selectedCandidate?.id || "",
    upstream_provider: candidate?.name || candidate?.id || "",
    upstream_model: upstreamModel || body?.model || "",
    fallback_chain: fallbackChainText || summarizeFallbackChain(orderedUpstreams),
    fallback_attempt: summarizeFallbackAttempt(routeAttemptCount, orderedUpstreams.length),
    fallback_reason: safeHeaderValue(fallbackReason || upstreamErrorCode || "model_service_request_failed", 120),
    fallback_trace: fallbackTrace,
    upstream_status: Number(upstreamStatus || 0),
    upstream_error_code: safeHeaderValue(upstreamErrorCode || "", 120),
    upstream_error_message: sanitizeSecretText(upstreamErrorMessage || "").slice(0, 240),
    duration_ms: Number(durationMs || 0),
    body_size: estimateBodySize(body),
  };
  console.error("[flowapi-route-failure]", JSON.stringify(payload));
}

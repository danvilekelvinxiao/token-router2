import { requireAdmin } from "@/lib/admin-auth";
import { hasDatabase, query } from "@/lib/db";
import { getModelProductWithConfig, listModelProductsWithConfig } from "@/lib/model-products-server";
import { getPublicModelRequestId, normalizeModelLookup } from "@/lib/models";
import { listModelMappings, listProviders } from "@/lib/provider-store";
import { sanitizeSecretText } from "@/lib/safe-upstream-url";
import { getRouteCandidates, selectUpstream, STRATEGY } from "@/lib/smart-router";

const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_PROMPT = "Reply exactly with FLOWAPI_ROUTING_TEST_OK.";
const DEFAULT_STATUS_CHAIN = [429, 503, 200];
const DEFAULT_LIVE_API = "chat";
const FALLBACK_STATUS_CODES = new Set([401, 402, 403, 404, 408, 413, 429, 500, 502, 503, 504]);
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
const SIMULATION_SCENARIOS = {
  primary_429: [429, 200],
  primary_401: [401, 200],
  primary_403: [403, 200],
  primary_429_secondary_503: [429, 503, 200],
  primary_timeout: [408, 200],
  all_failed: [429, 503, 529],
};

function error(res, status, code, message, extra = {}) {
  return res.status(status).json({ ok: false, code, message, ...extra });
}

function normalizeModel(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return normalizeModelLookup(DEFAULT_MODEL);
  return normalizeModelLookup(raw) || getPublicModelRequestId(raw) || DEFAULT_MODEL;
}

function requestIdBase(value = "") {
  return String(value || "").trim().replace(/[ABCDX]$/i, "");
}

function routeLineFromName(routeName = "") {
  const name = String(routeName || "").toLowerCase();
  if (!name) return "";
  if (name.includes("sub2api")) return "A";
  if (name.includes("new-api-3") || name.includes("newapi-3")) return "D";
  if (name.includes("new-api-2") || name.includes("newapi-2")) return "C";
  if (name.includes("new-api") || name.includes("newapi")) return "B";
  if (name.includes("openrouter")) return "X";
  return "";
}

function safeUrlHost(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw).host || "";
  } catch {
    return "";
  }
}

function detectCandidateSource(candidate = {}) {
  if (!candidate || typeof candidate !== "object") return "unknown";
  if (candidate.source) return String(candidate.source);
  if (candidate.mappingId || candidate.providerId || candidate.raw?.mapping || candidate.raw?.provider) return "provider";
  if (
    candidate.raw?.public_model_id != null
    || candidate.raw?.actual_model_id != null
    || candidate.raw?.base_url != null
    || candidate.raw?.upstream_channel_id != null
  ) return "db";
  if (
    candidate.raw?.status != null
    || candidate.raw?.models != null
    || candidate.raw?.channelName != null
    || candidate.raw?.groupName != null
  ) return "admin";
  return "env";
}

function detectFallbackReason(status = 0) {
  const code = Number(status || 0);
  if (code === 401) return "auth_error";
  if (code === 402) return "payment_required";
  if (code === 403) return "permission_or_ban";
  if (code === 404) return "model_not_found";
  if (code === 408) return "timeout";
  if (code === 413) return "body_too_large";
  if (code === 429) return "rate_limited";
  if (code >= 500) return code === 529 ? "provider_overloaded" : "upstream_5xx";
  return code >= 400 ? "client_error" : (code >= 200 && code < 300 ? "success" : "unknown");
}

function shouldFallbackForStatus(status = 0) {
  const code = Number(status || 0);
  return FALLBACK_STATUS_CODES.has(code) || code >= 500;
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeStatusChain(input) {
  if (Array.isArray(input)) {
    const statuses = input.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
    return statuses.length ? statuses : DEFAULT_STATUS_CHAIN;
  }
  if (typeof input === "string") {
    const statuses = input.split(/[，,\s]+/).map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
    return statuses.length ? statuses : DEFAULT_STATUS_CHAIN;
  }
  return DEFAULT_STATUS_CHAIN;
}

function sanitizeCandidate(candidate = {}) {
  if (!candidate) return null;
  const routeCode = candidate.routeCode || routeLineFromName(candidate.name || candidate.id || candidate.label || candidate.channelName || "");
  return {
    id: candidate.id || "",
    providerId: candidate.providerId || "",
    mappingId: candidate.mappingId || "",
    routeCode,
    line: routeCode,
    source: detectCandidateSource(candidate),
    name: candidate.name || "",
    label: candidate.label || candidate.channelName || "模型服务",
    channelName: candidate.channelName || candidate.label || candidate.name || "模型服务",
    providerName: candidate.providerName || candidate.label || "Provider",
    providerKey: candidate.providerKey || "",
    publicModelId: candidate.publicModelId || "",
    requestModelId: getPublicModelRequestId(candidate.publicModelId || candidate.id || "") || "",
    actualModelId: candidate.actualModelId || "",
    priority: toFiniteNumber(candidate.priority, 0),
    qualityScore: toFiniteNumber(candidate.qualityScore, 0),
    routeStrategy: candidate.routeStrategy || "",
    isEnabled: candidate.isEnabled !== false,
    successRate: toFiniteNumber(candidate.successRate, 0),
    avgLatencyMs: toFiniteNumber(candidate.avgLatencyMs, 0),
    avgFirstTokenMs: toFiniteNumber(candidate.avgFirstTokenMs, 0),
    p95LatencyMs: toFiniteNumber(candidate.p95LatencyMs, 0),
    score: candidate.score == null ? null : toFiniteNumber(candidate.score, 0),
    scoreBreakdown: candidate.scoreBreakdown || null,
    estimatedUpstreamCost: candidate.estimatedUpstreamCost == null ? null : toFiniteNumber(candidate.estimatedUpstreamCost, 0),
    profitProtected: Boolean(candidate.profitProtected),
    baseUrlHost: safeUrlHost(candidate.baseUrl || candidate.upstreamUrl || candidate.chatCompletionsUrl || candidate.responsesUrl),
    endpointType: candidate.endpointType || "chat",
    supportsResponsesApi: candidate.supportsResponsesApi === true,
    supportsChatCompletionsApi: candidate.supportsChatCompletionsApi !== false,
    health: candidate.health ? {
      ok: Boolean(candidate.health.ok),
      status: candidate.health.status || "unknown",
      latency: Number.isFinite(candidate.health.latency) ? Number(candidate.health.latency) : null,
      statusCode: toFiniteNumber(candidate.health.statusCode, 0),
    } : null,
  };
}

function sanitizeDecision(decision = {}) {
  return {
    strategy: decision.strategy || "",
    reason: decision.reason || "",
    error: decision.error || "",
    upstream: sanitizeCandidate(decision.upstream),
    channel: sanitizeCandidate(decision.channel),
    fallbackChain: Array.isArray(decision.fallbackChain)
      ? decision.fallbackChain.map(sanitizeCandidate).filter(Boolean)
      : [],
    candidates: Array.isArray(decision.candidates)
      ? decision.candidates.map(sanitizeCandidate).filter(Boolean)
      : [],
  };
}

function sanitizeMapping(mapping = {}, providerMap = new Map()) {
  const provider = providerMap.get(mapping.upstreamProviderId);
  return {
    id: mapping.id,
    publicModelName: mapping.publicModelName,
    requestModelId: getPublicModelRequestId(mapping.publicModelName || "") || "",
    upstreamProviderId: mapping.upstreamProviderId,
    upstreamProviderName: provider?.name || mapping.upstreamProviderId,
    upstreamProviderType: provider?.type || "",
    upstreamModelName: mapping.upstreamModelName,
    enabled: mapping.enabled !== false,
    displayName: mapping.displayName || "",
    inputPricePer1M: mapping.inputPricePer1M,
    outputPricePer1M: mapping.outputPricePer1M,
    cachedInputPricePer1M: mapping.cachedInputPricePer1M,
    updatedAt: mapping.updatedAt,
  };
}

function sanitizeProvider(provider = {}) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    enabled: provider.enabled !== false,
    priority: toFiniteNumber(provider.priority, 0),
    weight: toFiniteNumber(provider.weight, 1),
    modelsCount: Array.isArray(provider.models) ? provider.models.length : 0,
    supportsResponsesApi: provider.supportsResponsesApi === true,
    supportsChatCompletionsApi: provider.supportsChatCompletionsApi !== false,
    lastHealthStatus: provider.lastHealthStatus || "unknown",
    lastHealthCheckedAt: provider.lastHealthCheckedAt || null,
    lastErrorMessage: sanitizeSecretText(String(provider.lastErrorMessage || "")).slice(0, 160),
  };
}

function sanitizeUsage(usage = {}) {
  if (!usage || typeof usage !== "object") return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  return {
    prompt_tokens: toFiniteNumber(usage.prompt_tokens ?? usage.input_tokens, 0),
    completion_tokens: toFiniteNumber(usage.completion_tokens ?? usage.output_tokens, 0),
    total_tokens: toFiniteNumber(usage.total_tokens, 0),
  };
}

function collectTextSegments(value, bucket = []) {
  if (value == null) return bucket;
  if (typeof value === "string") {
    if (value.trim()) bucket.push(value.trim());
    return bucket;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTextSegments(item, bucket));
    return bucket;
  }
  if (typeof value !== "object") return bucket;

  if (typeof value.output_text === "string" && value.output_text.trim()) bucket.push(value.output_text.trim());
  if (typeof value.text === "string" && value.text.trim()) bucket.push(value.text.trim());
  if (typeof value.content === "string" && value.content.trim()) bucket.push(value.content.trim());
  if (Array.isArray(value.content)) collectTextSegments(value.content, bucket);
  if (Array.isArray(value.output)) collectTextSegments(value.output, bucket);
  if (Array.isArray(value.contents)) collectTextSegments(value.contents, bucket);
  return bucket;
}

function extractAssistantText(payload = {}) {
  const segments = [];
  collectTextSegments(payload?.output_text, segments);
  collectTextSegments(payload?.output, segments);
  collectTextSegments(payload?.content, segments);

  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  choices.forEach((choice) => {
    collectTextSegments(choice?.message?.content, segments);
    collectTextSegments(choice?.delta?.content, segments);
    collectTextSegments(choice?.text, segments);
  });

  return sanitizeSecretText(Array.from(new Set(segments)).join("\n").trim());
}

function countToolCallsInPayload(payload = {}) {
  let total = 0;
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  choices.forEach((choice) => {
    total += Array.isArray(choice?.message?.tool_calls) ? choice.message.tool_calls.length : 0;
    total += Array.isArray(choice?.delta?.tool_calls) ? choice.delta.tool_calls.length : 0;
  });

  const output = Array.isArray(payload?.output) ? payload.output : [];
  output.forEach((item) => {
    if (["function_call", "tool_call", "tool_use"].includes(String(item?.type || ""))) total += 1;
    if (Array.isArray(item?.content)) {
      total += item.content.filter((part) => ["function_call", "tool_call", "tool_use"].includes(String(part?.type || ""))).length;
    }
  });

  return total;
}

function extractRequestIdFromPayload(payload = {}) {
  return String(payload?.token_router?.request_id || payload?.request_id || payload?.id || "").trim();
}

function summarizeResponseError(payload = {}, fallbackMessage = "") {
  const message = payload?.error?.message || payload?.message || payload?.error || fallbackMessage || "";
  const code = payload?.error?.code || payload?.code || payload?.error?.type || "";
  return {
    code: String(code || "").slice(0, 120),
    message: sanitizeSecretText(String(message || "")).slice(0, 220),
  };
}

function sanitizeAttempt(row = {}) {
  return {
    requestId: row.request_id || row.requestId || "",
    publicModelId: row.public_model_id || row.publicModelId || "",
    actualModelId: row.actual_model_id || row.actualModelId || "",
    upstreamChannelId: row.upstream_channel_id || row.upstreamChannelId || "",
    upstreamChannel: row.upstream_channel || row.upstreamChannel || "",
    upstreamProvider: row.upstream_provider || row.upstreamProvider || "",
    line: routeLineFromName(row.upstream_channel || row.upstreamChannel || row.upstream_channel_id || row.upstreamChannelId || ""),
    attemptIndex: toFiniteNumber(row.attempt_index ?? row.attemptIndex, 0),
    attemptOrder: toFiniteNumber(row.attempt_order ?? row.attemptOrder, 0),
    status: row.status || "",
    statusCode: toFiniteNumber(row.status_code ?? row.statusCode, 0),
    ok: Boolean(row.ok),
    firstTokenMs: toFiniteNumber(row.first_token_ms ?? row.firstTokenMs, 0),
    latencyMs: toFiniteNumber(row.latency_ms ?? row.latencyMs, 0),
    errorCode: String(row.error_code || row.errorCode || "").slice(0, 120),
    errorMessage: sanitizeSecretText(String(row.error_message || row.errorMessage || "")).slice(0, 180),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt || null,
  };
}

function sanitizeRelayAudit(row = null) {
  if (!row) return null;
  return {
    requestId: row.request_id || "",
    responseId: row.response_id || "",
    provider: row.provider || "",
    model: row.model || "",
    route: row.route || "",
    statusCode: toFiniteNumber(row.status_code, 0),
    success: Boolean(row.success),
    errorCode: String(row.error_code || "").slice(0, 120),
    errorMessage: sanitizeSecretText(String(row.error_message || "")).slice(0, 180),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

function sanitizeProviderLog(row = {}) {
  return {
    id: row.id || "",
    providerId: row.provider_id || row.providerId || "",
    publicModelName: row.public_model_name || row.publicModelName || "",
    upstreamModelName: row.upstream_model_name || row.upstreamModelName || "",
    requestId: row.request_id || row.requestId || "",
    status: row.status || "",
    httpStatus: toFiniteNumber(row.http_status ?? row.httpStatus, 0),
    errorCode: String(row.error_code || row.errorCode || "").slice(0, 120),
    errorMessage: sanitizeSecretText(String(row.error_message || row.errorMessage || "")).slice(0, 180),
    promptTokens: toFiniteNumber(row.prompt_tokens ?? row.promptTokens, 0),
    completionTokens: toFiniteNumber(row.completion_tokens ?? row.completionTokens, 0),
    cachedTokens: toFiniteNumber(row.cached_tokens ?? row.cachedTokens, 0),
    estimatedCost: toFiniteNumber(row.estimated_cost ?? row.estimatedCost, 0),
    latencyMs: toFiniteNumber(row.latency_ms ?? row.latencyMs, 0),
    firstTokenMs: toFiniteNumber(row.first_token_ms ?? row.firstTokenMs, 0),
    cacheHit: Boolean(row.cache_hit ?? row.cacheHit),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt || null,
  };
}

function sanitizeCall(row = {}) {
  return {
    id: row.id || "",
    requestId: row.request_id || row.requestId || "",
    endpoint: row.endpoint || "",
    requestedModel: row.requested_model || row.requestedModel || "",
    routedModel: row.routed_model || row.routedModel || "",
    publicModelId: row.public_model_id || row.publicModelId || "",
    actualModelId: row.actual_model_id || row.actualModelId || "",
    provider: row.provider || "",
    upstreamChannel: row.upstream_channel || row.upstreamChannel || "",
    upstreamProvider: row.upstream_provider || row.upstreamProvider || "",
    upstreamStatus: toFiniteNumber(row.upstream_status ?? row.upstreamStatus, 0),
    status: toFiniteNumber(row.status, 0),
    latencyMs: toFiniteNumber(row.latency_ms ?? row.latencyMs, 0),
    firstTokenMs: toFiniteNumber(row.first_token_ms ?? row.firstTokenMs, 0),
    inputTokens: toFiniteNumber(row.input_tokens ?? row.inputTokens, 0),
    outputTokens: toFiniteNumber(row.output_tokens ?? row.outputTokens, 0),
    totalTokens: toFiniteNumber(row.total_tokens ?? row.totalTokens, 0),
    routeAttempts: toFiniteNumber(row.route_attempts ?? row.routeAttempts, 0),
    userCharge: toFiniteNumber(row.user_charge ?? row.userCharge, 0),
    upstreamCostCny: toFiniteNumber(row.upstream_cost_cny ?? row.upstreamCostCny, 0),
    profitCny: toFiniteNumber(row.profit_cny ?? row.profitCny, 0),
    billingStatus: row.billing_status || row.billingStatus || "",
    deliveryStatus: row.delivery_status || row.deliveryStatus || "",
    errorCode: String(row.error_code || row.errorCode || "").slice(0, 120),
    errorMessage: sanitizeSecretText(String(row.error_message || row.errorMessage || "")).slice(0, 180),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt || null,
  };
}

function pickSelectedAttempt(attempts = []) {
  return attempts.find((item) => item.ok) || attempts[attempts.length - 1] || null;
}

function summarizeEvidence({ attempts = [], relayAudit = null, providerLogs = [], calls = [], debugHeaders = null } = {}) {
  const hasDebugHeaders = Boolean(debugHeaders && Object.values(debugHeaders).some(Boolean));
  const hasAnyEvidence = hasDebugHeaders || attempts.length > 0 || providerLogs.length > 0 || calls.length > 0 || Boolean(relayAudit);
  return {
    routeAttemptsCount: attempts.length,
    providerLogsCount: providerLogs.length,
    callsCount: calls.length,
    hasRelayAudit: Boolean(relayAudit),
    hasDebugHeaders,
    hasAnyEvidence,
    selectedAttemptFound: Boolean(pickSelectedAttempt(attempts)),
    hasCrossCandidateFallback: attempts.length > 1,
  };
}

function fallbackRulesSummary() {
  return {
    shouldFallbackStatusCodes: [401, 402, 403, 404, 408, 413, 429, "500+"],
    shouldRecordOnlyStatusCodes: [400],
    accountAbnormalStatusCodes: [401, 403],
    cooldownCandidateStatusCodes: [429, 503, 529, "timeout"],
    notes: {
      401: "账号无效/认证失败，应记录异常并 fallback",
      403: "权限/封禁，应记录异常并 fallback",
      404: "如果当前渠道不支持该模型，应 fallback",
      429: "限流，应 fallback",
      500: "上游异常，应 fallback",
      529: "provider overloaded，在当前代码里通过 status >= 500 进入 fallback",
      400: "参数错误，当前代码不会 fallback，而是直接返回错误；只有极少数工具/流式异常会在主路由内特判重试",
      timeout: "网络超时会记录 route_attempt，并继续尝试下一候选",
    },
    currentCodePath: {
      selection: "selectUpstream() -> routeDecision.fallbackChain",
      execution: "/api/v1/chat/completions upstream loop",
      evidence: "X-Flow-* debug headers + route_attempts + provider_request_logs + relay_request_audits + calls",
    },
  };
}

function getOriginFromRequest(req) {
  const proto = String(req.headers["x-forwarded-proto"] || (req.socket?.encrypted ? "https" : "http")).split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) throw new Error("无法确定当前站点 Host");
  return `${proto}://${host}`;
}

function safeResponseHeader(headers, name) {
  return sanitizeSecretText(String(headers?.get?.(name) || headers?.get?.(name.toLowerCase()) || "")).slice(0, 220);
}

function summarizeFlowDebugHeaders(headers) {
  if (!headers) return null;
  return {
    requestId: safeResponseHeader(headers, "X-Flow-Request-Id"),
    model: safeResponseHeader(headers, "X-Flow-Model"),
    wireApi: safeResponseHeader(headers, "X-Flow-Wire-Api"),
    selectedChannel: safeResponseHeader(headers, "X-Flow-Selected-Channel"),
    upstreamProvider: safeResponseHeader(headers, "X-Flow-Upstream-Provider"),
    upstreamModel: safeResponseHeader(headers, "X-Flow-Upstream-Model"),
    fallbackAttempt: safeResponseHeader(headers, "X-Flow-Fallback-Attempt"),
    fallbackChain: safeResponseHeader(headers, "X-Flow-Fallback-Chain"),
    fallbackReason: safeResponseHeader(headers, "X-Flow-Fallback-Reason"),
    upstreamStatus: safeResponseHeader(headers, "X-Flow-Upstream-Status"),
    upstreamEndpoint: safeResponseHeader(headers, "X-Flow-Upstream-Endpoint"),
  };
}

function extractStreamPreview(raw = "") {
  const previewParts = [];
  const lines = String(raw || "").split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data);
      const text = extractAssistantText(parsed);
      if (text) previewParts.push(text);
      continue;
    } catch {}
    if (!data.startsWith("{")) previewParts.push(data);
  }
  return sanitizeSecretText(previewParts.join("\n").trim()).slice(0, 220);
}

function countToolCallsInStream(raw = "") {
  let total = 0;
  const lines = String(raw || "").split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      total += countToolCallsInPayload(JSON.parse(data));
    } catch {}
  }
  return total;
}

function summarizeStreamError(raw = "", fallbackMessage = "") {
  const lines = String(raw || "").split(/\r?\n/).reverse();
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      return summarizeResponseError(JSON.parse(data), fallbackMessage);
    } catch {}
  }
  return { code: "", message: sanitizeSecretText(String(fallbackMessage || "")).slice(0, 220) };
}

async function loadAttemptsByRequestId(requestId = "") {
  if (!hasDatabase() || !requestId) return [];
  const exact = String(requestId || "").trim();
  const base = requestIdBase(exact);
  const result = await query(
    `SELECT request_id, public_model_id, actual_model_id, upstream_channel_id, upstream_channel, upstream_provider,
            attempt_index, attempt_order, status, status_code, ok, first_token_ms, latency_ms, error_code, error_message, created_at
       FROM route_attempts
      WHERE request_id = $1 OR request_id LIKE $2
      ORDER BY created_at ASC, attempt_order ASC, attempt_index ASC`,
    [exact, `${base}%`]
  );
  return (result?.rows || []).map(sanitizeAttempt);
}

async function loadRecentAttemptsForModel(model = "") {
  if (!hasDatabase() || !model) return [];
  const result = await query(
    `SELECT request_id, public_model_id, actual_model_id, upstream_channel_id, upstream_channel, upstream_provider,
            attempt_index, attempt_order, status, status_code, ok, first_token_ms, latency_ms, error_code, error_message, created_at
       FROM route_attempts
      WHERE public_model_id = $1
      ORDER BY created_at DESC, attempt_order ASC
      LIMIT 18`,
    [model]
  );
  return (result?.rows || []).map(sanitizeAttempt);
}

async function loadRelayAuditByRequestId(requestId = "") {
  if (!hasDatabase() || !requestId) return null;
  const exact = String(requestId || "").trim();
  const base = requestIdBase(exact);
  const result = await query(
    `SELECT request_id, response_id, provider, model, route, status_code, success, error_code, error_message, created_at
       FROM relay_request_audits
      WHERE request_id = $1 OR request_id LIKE $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [exact, `${base}%`]
  );
  return sanitizeRelayAudit(result?.rows?.[0] || null);
}

async function loadProviderLogsByRequestId(requestId = "") {
  if (!hasDatabase() || !requestId) return [];
  const exact = String(requestId || "").trim();
  const base = requestIdBase(exact);
  const result = await query(
    `SELECT id, provider_id, public_model_name, upstream_model_name, request_id, status, http_status,
            error_code, error_message, prompt_tokens, completion_tokens, cached_tokens, estimated_cost,
            latency_ms, first_token_ms, cache_hit, created_at
       FROM provider_request_logs
      WHERE request_id = $1 OR request_id LIKE $2
      ORDER BY created_at ASC
      LIMIT 40`,
    [exact, `${base}%`]
  );
  return (result?.rows || []).map(sanitizeProviderLog);
}

async function loadCallsByRequestId(requestId = "") {
  if (!hasDatabase() || !requestId) return [];
  const exact = String(requestId || "").trim();
  const base = requestIdBase(exact);
  const result = await query(
    `SELECT id, request_id, endpoint, requested_model, routed_model, public_model_id, actual_model_id,
            provider, upstream_channel, upstream_provider, upstream_status, latency_ms, first_token_ms,
            input_tokens, output_tokens, total_tokens, user_charge, upstream_cost_cny, profit_cny,
            route_attempts, status, billing_status, delivery_status, error_code, error_message, created_at
       FROM calls
      WHERE request_id = $1 OR request_id LIKE $2
      ORDER BY created_at DESC
      LIMIT 20`,
    [exact, `${base}%`]
  );
  return (result?.rows || []).map(sanitizeCall);
}

async function loadRecentCallsForModel(model = "") {
  if (!hasDatabase() || !model) return [];
  const result = await query(
    `SELECT id, request_id, endpoint, requested_model, routed_model, public_model_id, actual_model_id,
            provider, upstream_channel, upstream_provider, upstream_status, latency_ms, first_token_ms,
            input_tokens, output_tokens, total_tokens, user_charge, upstream_cost_cny, profit_cny,
            route_attempts, status, billing_status, delivery_status, error_code, error_message, created_at
       FROM calls
      WHERE public_model_id = $1
      ORDER BY created_at DESC
      LIMIT 12`,
    [model]
  );
  return (result?.rows || []).map(sanitizeCall);
}

async function safeResolve(load, fallback) {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

async function buildRequestLookup(requestId = "", { debugHeaders = null } = {}) {
  const exact = String(requestId || "").trim();
  if (!exact) return null;
  const [attempts, relayAudit, providerLogs, calls] = await Promise.all([
    safeResolve(() => loadAttemptsByRequestId(exact), []),
    safeResolve(() => loadRelayAuditByRequestId(exact), null),
    safeResolve(() => loadProviderLogsByRequestId(exact), []),
    safeResolve(() => loadCallsByRequestId(exact), []),
  ]);
  return {
    requestId: exact,
    selectedAttempt: pickSelectedAttempt(attempts),
    attempts,
    relayAudit,
    providerLogs,
    calls,
    evidenceSummary: summarizeEvidence({ attempts, relayAudit, providerLogs, calls, debugHeaders }),
  };
}

function sanitizeModelProduct(product = null) {
  if (!product) return null;
  return {
    id: product.id || "",
    publicModelId: product.publicModelId || product.id || "",
    requestModelId: product.requestModelId || getPublicModelRequestId(product.publicModelId || product.id || "") || "",
    actualModelId: product.actualModelId || "",
    displayName: product.displayName || product.publicModelId || product.id || "",
    provider: product.provider || "Provider",
    routeStrategy: product.routeStrategy || STRATEGY.AUTO,
    isAvailable: product.isAvailable !== false,
    group: product.group || "text",
    status: product.status || "",
    statusLabel: product.statusLabel || "",
    executionGroup: product.executionGroup || "",
    underlyingRoute: product.underlyingRoute || "",
  };
}

async function loadRoutingContext(inputModel = DEFAULT_MODEL) {
  const inputName = String(inputModel || "").trim() || DEFAULT_MODEL;
  const lookupModel = normalizeModel(inputName);
  const requestModelId = getPublicModelRequestId(lookupModel || inputName) || getPublicModelRequestId(inputName) || DEFAULT_MODEL;
  const modelProduct = await safeResolve(async () => {
    return await getModelProductWithConfig(lookupModel) || await getModelProductWithConfig(requestModelId);
  }, null);
  const productPublicModelId = modelProduct?.publicModelId || lookupModel;
  const actualModelId = modelProduct?.actualModelId || requestModelId;
  const providers = await safeResolve(() => listProviders(), []);
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));

  const mappingKeys = Array.from(new Set([requestModelId, productPublicModelId, lookupModel].filter(Boolean)));
  const mappingGroups = await Promise.all(
    mappingKeys.map((publicModelName) => safeResolve(() => listModelMappings({ publicModelName, includeDisabled: true }), []))
  );
  const mappings = Array.from(new Map(mappingGroups.flat().map((item) => [item.id, item])).values());

  const [candidates, decision, recentAttempts, recentCalls] = await Promise.all([
    safeResolve(() => getRouteCandidates({
      publicModelId: requestModelId,
      actualModelId,
      modelProduct,
      includeDisabled: true,
    }), []),
    safeResolve(() => selectUpstream({
      modelId: actualModelId,
      publicModelId: requestModelId,
      modelProduct,
      strategy: modelProduct?.routeStrategy || STRATEGY.AUTO,
      usageEstimate: { prompt_tokens: 256, completion_tokens: 96 },
      userChargeEstimate: 0,
    }), { fallbackChain: [], candidates: [], upstream: null, channel: null, strategy: modelProduct?.routeStrategy || STRATEGY.AUTO, error: "routing_context_unavailable" }),
    safeResolve(() => loadRecentAttemptsForModel(requestModelId), []),
    safeResolve(() => loadRecentCallsForModel(requestModelId), []),
  ]);

  return {
    inputName,
    lookupModel,
    requestedModel: requestModelId,
    targetModel: requestModelId,
    requestModelId,
    publicModelId: requestModelId,
    productPublicModelId,
    actualModelId,
    modelProduct,
    providers,
    providerMap,
    mappings,
    candidates,
    decision,
    recentAttempts,
    recentCalls,
  };
}

function buildSnapshot(context = {}) {
  const providersInUse = new Set((context.mappings || []).map((item) => item.upstreamProviderId).filter(Boolean));
  return {
    requestedModel: context.requestedModel,
    targetModel: context.targetModel,
    requestModelId: context.requestModelId,
    publicModelId: context.publicModelId,
    productPublicModelId: context.productPublicModelId,
    actualModelId: context.actualModelId,
    modelProduct: sanitizeModelProduct(context.modelProduct),
    lookupKeys: {
      inputName: context.inputName,
      lookupModel: context.lookupModel,
      requestModelId: context.requestModelId,
      productPublicModelId: context.productPublicModelId,
      actualModelId: context.actualModelId,
    },
    fallbackRules: fallbackRulesSummary(),
    mappings: (context.mappings || []).map((mapping) => sanitizeMapping(mapping, context.providerMap)),
    providers: (context.providers || [])
      .filter((provider) => providersInUse.has(provider.id))
      .map(sanitizeProvider),
    routePreview: sanitizeDecision(context.decision),
    routeCandidates: Array.isArray(context.candidates)
      ? context.candidates.map(sanitizeCandidate).filter(Boolean)
      : [],
    recentAttempts: context.recentAttempts || [],
    recentCalls: context.recentCalls || [],
  };
}

function buildSimulation(context = {}, input = {}) {
  const scenario = String(input.scenario || "").trim();
  const requestedStatuses = scenario && SIMULATION_SCENARIOS[scenario]
    ? SIMULATION_SCENARIOS[scenario]
    : normalizeStatusChain(input.statusChain || input.statuses);
  const fallbackChain = Array.isArray(context.decision?.fallbackChain) ? context.decision.fallbackChain : [];
  const attempts = fallbackChain.map((candidate, index) => {
    const statusCode = requestedStatuses[index] || (index === 0 ? 429 : (index === 1 ? 503 : 200));
    const shouldFallback = shouldFallbackForStatus(statusCode);
    return {
      attemptIndex: index,
      candidate: sanitizeCandidate(candidate),
      statusCode,
      ok: statusCode >= 200 && statusCode < 300,
      shouldFallback,
      fallbackReason: detectFallbackReason(statusCode),
      stopsHere: statusCode >= 200 && statusCode < 300 ? true : !shouldFallback,
    };
  });

  let winner = null;
  let stoppedAt = null;
  for (const attempt of attempts) {
    if (attempt.ok) {
      winner = attempt;
      stoppedAt = attempt.attemptIndex;
      break;
    }
    if (attempt.stopsHere) {
      stoppedAt = attempt.attemptIndex;
      break;
    }
  }
  if (stoppedAt == null && attempts.length) stoppedAt = attempts.length - 1;

  return {
    scenario: scenario || "custom",
    requestedStatuses,
    attempts,
    winner,
    fallbackDepth: winner ? winner.attemptIndex : Math.max(0, attempts.length - 1),
    fullyExhausted: !winner,
    stoppedAt,
  };
}

async function loadSupportedTargetModels() {
  const products = await listModelProductsWithConfig({ includeUnavailable: true }).catch(() => []);
  const preferred = ["gpt-5.5", "opus4.8", "opus4.7", "opus4.6"];
  const aliases = new Set(preferred);
  for (const product of products) {
    for (const alias of [product?.id, product?.publicModelId, product?.requestModelId, product?.displayName]) {
      const value = String(alias || "").trim();
      if (/^(gpt-5\.5|opus4\.8|opus4\.7|opus4\.6|claude-opus-4\.8|claude-opus-4\.7|claude-opus-4\.6)$/i.test(value)) aliases.add(value);
    }
  }
  return Array.from(aliases);
}

function buildChatProbeBody(context = {}, { prompt, maxTokens, stream, useTools }) {
  if (useTools) {
    return {
      model: context.requestModelId || context.publicModelId || context.targetModel,
      messages: [{ role: "user", content: "Call the function once with result=FLOWAPI_ROUTING_TEST_OK. Do not answer with plain text before calling the tool." }],
      max_tokens: maxTokens,
      temperature: 0,
      stream,
      tools: [{
        type: "function",
        function: {
          name: "flowapi_routing_probe",
          description: "Return the fixed routing probe marker.",
          parameters: {
            type: "object",
            properties: {
              result: { type: "string", description: "Must be FLOWAPI_ROUTING_TEST_OK" },
            },
            required: ["result"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: "auto",
    };
  }

  return {
    model: context.requestModelId || context.publicModelId || context.targetModel,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    temperature: 0,
    stream,
  };
}

function buildResponsesProbeBody(context = {}, { prompt, maxTokens, stream, useTools }) {
  if (useTools) {
    return {
      model: context.requestModelId || context.publicModelId || context.targetModel,
      input: "Call the function once with result=FLOWAPI_ROUTING_TEST_OK. Do not answer with plain text before calling the tool.",
      max_output_tokens: maxTokens,
      temperature: 0,
      stream,
      tools: [{
        type: "function",
        name: "flowapi_routing_probe",
        description: "Return the fixed routing probe marker.",
        parameters: {
          type: "object",
          properties: {
            result: { type: "string", description: "Must be FLOWAPI_ROUTING_TEST_OK" },
          },
          required: ["result"],
          additionalProperties: false,
        },
      }],
      tool_choice: "auto",
    };
  }

  return {
    model: context.requestModelId || context.publicModelId || context.targetModel,
    input: prompt,
    max_output_tokens: maxTokens,
    temperature: 0,
    stream,
  };
}

async function runLiveProbe(req, context = {}, body = {}) {
  const transientApiKey = String(body.apiKey || "").trim();
  if (!transientApiKey) {
    throw new Error("LIVE 模式需要临时提供低额度测试 Key；该 Key 只用于本次请求，不会保存。");
  }

  const apiVariant = String(body.api || body.endpoint || DEFAULT_LIVE_API).trim().toLowerCase() === "responses" ? "responses" : "chat";
  const stream = body.stream === true;
  const useTools = body.useTools === true || body.tools === true;
  const origin = getOriginFromRequest(req);
  const prompt = String(body.prompt || DEFAULT_PROMPT).trim().slice(0, 500) || DEFAULT_PROMPT;
  const maxTokens = Math.max(1, Math.min(Number(body.maxTokens || 24), 64));
  const response = await fetch(new URL(apiVariant === "responses" ? "/v1/responses" : "/v1/chat/completions", origin), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${transientApiKey}`,
      "Content-Type": "application/json",
      "X-Flow-Debug": "1",
    },
    body: JSON.stringify(
      apiVariant === "responses"
        ? buildResponsesProbeBody(context, { prompt, maxTokens, stream, useTools })
        : buildChatProbeBody(context, { prompt, maxTokens, stream, useTools })
    ),
    signal: AbortSignal.timeout(45000),
  });

  const debugHeaders = summarizeFlowDebugHeaders(response.headers);
  const responseContentType = String(response.headers.get("content-type") || "");
  let payload = {};
  let rawStream = "";

  if (stream) {
    rawStream = await response.text().catch(() => "");
  } else {
    payload = await response.json().catch(() => ({}));
  }

  const requestId = String(debugHeaders?.requestId || extractRequestIdFromPayload(payload) || "").trim();
  const requestLookup = requestId ? await buildRequestLookup(requestId, { debugHeaders }) : null;
  const responseText = stream ? extractStreamPreview(rawStream) : extractAssistantText(payload);
  const upstreamError = stream
    ? summarizeStreamError(rawStream, response.ok ? "" : `HTTP ${response.status}`)
    : summarizeResponseError(payload, response.ok ? "" : `HTTP ${response.status}`);
  const toolCallCount = stream ? countToolCallsInStream(rawStream) : countToolCallsInPayload(payload);
  const attempts = requestLookup?.attempts || [];
  const selectedAttempt = requestLookup?.selectedAttempt || pickSelectedAttempt(attempts);

  return {
    requestedApi: apiVariant,
    stream,
    usedTools: useTools,
    status: response.status,
    ok: response.ok,
    requestId,
    responseContentType,
    hasText: Boolean(responseText),
    textPreview: responseText.slice(0, 220),
    modelNotFound: /model[_\s-]*not[_\s-]*found/i.test(`${upstreamError.code} ${upstreamError.message} ${debugHeaders?.fallbackReason || ""}`),
    authError: [401, 403].includes(response.status),
    rateLimited: response.status === 429,
    sameCandidateResponsesToChatFallback: apiVariant === "responses" && debugHeaders?.upstreamEndpoint === "chat",
    crossCandidateFallback: attempts.length > 1,
    debugHeaders,
    tokenRouter: payload?.token_router ? {
      routedModel: payload.token_router.routed_model || "",
      routedModelId: payload.token_router.routed_model_id || "",
      flowapiRoute: payload.token_router.flowapi_route || "",
      requestId: payload.token_router.request_id || requestId,
      estimatedCostCny: payload.token_router.estimated_cost_cny ?? null,
    } : null,
    usage: sanitizeUsage(payload?.usage),
    upstreamError,
    toolCallCount,
    hasToolCall: toolCallCount > 0,
    fallbackCount: Math.max(0, attempts.length - 1),
    selectedAttempt,
    attempts,
    relayAudit: requestLookup?.relayAudit || null,
    providerLogs: requestLookup?.providerLogs || [],
    calls: requestLookup?.calls || [],
    evidenceSummary: requestLookup?.evidenceSummary || summarizeEvidence({ debugHeaders }),
  };
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const targetModel = normalizeModel(req.query.model || DEFAULT_MODEL);
      const requestId = String(req.query.requestId || "").trim();
      const [supportedTargets, context] = await Promise.all([
        loadSupportedTargetModels(),
        loadRoutingContext(targetModel),
      ]);
      const snapshot = buildSnapshot(context);
      const requestLookup = requestId ? await buildRequestLookup(requestId) : null;
      return res.status(200).json({
        ok: true,
        mode: "snapshot",
        supportedTargets,
        ...snapshot,
        requestLookup,
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const mode = String(body.mode || "preview").trim().toLowerCase();
      const targetModel = normalizeModel(body.model || DEFAULT_MODEL);
      const [supportedTargets, context] = await Promise.all([
        loadSupportedTargetModels(),
        loadRoutingContext(targetModel),
      ]);
      const snapshot = buildSnapshot(context);

      if (mode === "preview") {
        return res.status(200).json({ ok: true, mode, supportedTargets, ...snapshot });
      }

      if (mode === "simulate") {
        const simulation = buildSimulation(context, body);
        return res.status(200).json({ ok: true, mode, supportedTargets, ...snapshot, simulation });
      }

      if (mode === "lookup") {
        const requestId = String(body.requestId || "").trim();
        if (!requestId) return error(res, 400, "REQUEST_ID_REQUIRED", "lookup 模式需要 requestId");
        return res.status(200).json({
          ok: true,
          mode,
          supportedTargets,
          ...snapshot,
          requestLookup: await buildRequestLookup(requestId),
        });
      }

      if (mode === "live") {
        const live = await runLiveProbe(req, context, body);
        return res.status(200).json({ ok: true, mode, supportedTargets, ...snapshot, live });
      }

      return error(res, 400, "UNSUPPORTED_MODE", `不支持的模式：${mode}`);
    }

    res.setHeader("Allow", "GET, POST");
    return error(res, 405, "METHOD_NOT_ALLOWED", "请求方法不支持");
  } catch (err) {
    return error(res, 500, "MODEL_ROUTING_TEST_FAILED", sanitizeSecretText(err?.message || "模型路由测试失败").slice(0, 220));
  }
}

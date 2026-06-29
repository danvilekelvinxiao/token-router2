import { requireAdmin } from "@/lib/admin-auth";
import { hasDatabase, query } from "@/lib/db";
import { getModelProductWithConfig, listModelProductsWithConfig } from "@/lib/model-products-server";
import { listModelMappings, listProviders } from "@/lib/provider-store";
import { sanitizeSecretText } from "@/lib/safe-upstream-url";
import { getRouteCandidates, selectUpstream, STRATEGY } from "@/lib/smart-router";

const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_PROMPT = "Reply exactly with FLOWAPI_ROUTING_TEST_OK.";
const DEFAULT_STATUS_CHAIN = [429, 503, 200];
const FALLBACK_STATUS_CODES = new Set([401, 402, 403, 404, 408, 413, 429, 500, 502, 503, 504]);
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
  return String(value || "").trim() || DEFAULT_MODEL;
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
  return {
    id: candidate.id || "",
    providerId: candidate.providerId || "",
    mappingId: candidate.mappingId || "",
    line: routeLineFromName(candidate.name || candidate.id || candidate.label || candidate.channelName || ""),
    name: candidate.name || "",
    label: candidate.label || candidate.channelName || "FlowAPI 模型服务",
    channelName: candidate.channelName || candidate.label || candidate.name || "FlowAPI 模型服务",
    providerName: candidate.providerName || candidate.label || "FlowAPI",
    providerKey: candidate.providerKey || "",
    publicModelId: candidate.publicModelId || "",
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
    health: candidate.health ? {
      ok: Boolean(candidate.health.ok),
      status: candidate.health.status || "unknown",
      latency: Number.isFinite(candidate.health.latency) ? Number(candidate.health.latency) : null,
      statusCode: toFiniteNumber(candidate.health.statusCode, 0),
    } : null,
    supportsResponsesApi: candidate.supportsResponsesApi === true,
    supportsChatCompletionsApi: candidate.supportsChatCompletionsApi !== false,
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

function extractAssistantText(payload = {}) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const content = choices
    .map((choice) => choice?.message?.content ?? choice?.delta?.content ?? choice?.text ?? "")
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => {
      if (typeof value === "string") return value;
      if (value?.type === "text") return value.text || value.content || "";
      return value?.text || value?.content || "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
  return sanitizeSecretText(content);
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

function pickSelectedAttempt(attempts = []) {
  return attempts.find((item) => item.ok) || attempts[attempts.length - 1] || null;
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
      400: "参数错误，当前代码不会 fallback，而是直接返回错误",
      timeout: "网络超时会记录 route_attempt，并继续尝试下一候选",
    },
    currentCodePath: {
      selection: "selectUpstream() -> routeDecision.fallbackChain",
      execution: "/api/v1/chat/completions upstream loop",
      evidence: "route_attempts + provider_request_logs + relay_request_audits",
    },
  };
}

function getOriginFromRequest(req) {
  const proto = String(req.headers["x-forwarded-proto"] || (req.socket?.encrypted ? "https" : "http")).split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) throw new Error("无法确定当前站点 Host");
  return `${proto}://${host}`;
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

function sanitizeModelProduct(product = null) {
  if (!product) return null;
  return {
    id: product.id || "",
    publicModelId: product.publicModelId || product.id || "",
    actualModelId: product.actualModelId || "",
    displayName: product.displayName || product.publicModelId || product.id || "",
    provider: product.provider || "FlowAPI",
    routeStrategy: product.routeStrategy || STRATEGY.AUTO,
    isAvailable: product.isAvailable !== false,
    group: product.group || "text",
    status: product.status || "",
    statusLabel: product.statusLabel || "",
  };
}

async function loadRoutingContext(inputModel = DEFAULT_MODEL) {
  const targetModel = normalizeModel(inputModel);
  const modelProduct = await getModelProductWithConfig(targetModel);
  const publicModelId = modelProduct?.publicModelId || targetModel;
  const actualModelId = modelProduct?.actualModelId || targetModel;
  const providers = await listProviders();
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const mappings = await listModelMappings({ publicModelName: publicModelId, includeDisabled: true });
  const candidates = await getRouteCandidates({
    publicModelId,
    actualModelId,
    modelProduct,
    includeDisabled: true,
  });
  const decision = await selectUpstream({
    modelId: actualModelId,
    publicModelId,
    modelProduct,
    strategy: modelProduct?.routeStrategy || STRATEGY.AUTO,
    usageEstimate: { prompt_tokens: 256, completion_tokens: 96 },
    userChargeEstimate: 0,
  });
  const recentAttempts = await loadRecentAttemptsForModel(publicModelId);
  return {
    targetModel,
    publicModelId,
    actualModelId,
    modelProduct,
    providers,
    providerMap,
    mappings,
    candidates,
    decision,
    recentAttempts,
  };
}

function buildSnapshot(context = {}) {
  const providersInUse = new Set((context.mappings || []).map((item) => item.upstreamProviderId).filter(Boolean));
  return {
    targetModel: context.targetModel,
    publicModelId: context.publicModelId,
    actualModelId: context.actualModelId,
    modelProduct: sanitizeModelProduct(context.modelProduct),
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
    for (const alias of [product?.id, product?.publicModelId, product?.displayName]) {
      const value = String(alias || "").trim();
      if (/^(gpt-5\.5|opus4\.8|opus4\.7|opus4\.6)$/i.test(value)) aliases.add(value);
    }
  }
  return Array.from(aliases);
}

async function runLiveProbe(req, context = {}, body = {}) {
  const transientApiKey = String(body.apiKey || "").trim();
  if (!transientApiKey) {
    throw new Error("LIVE 模式需要临时提供低额度测试 Key；该 Key 只用于本次请求，不会保存。");
  }

  const origin = getOriginFromRequest(req);
  const prompt = String(body.prompt || DEFAULT_PROMPT).trim().slice(0, 500) || DEFAULT_PROMPT;
  const maxTokens = Math.max(1, Math.min(Number(body.maxTokens || 24), 64));
  const response = await fetch(new URL("/v1/chat/completions", origin), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${transientApiKey}`,
      "Content-Type": "application/json",
      "X-Flow-Debug": "1",
    },
    body: JSON.stringify({
      model: context.publicModelId || context.targetModel,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0,
      stream: false,
    }),
    signal: AbortSignal.timeout(45000),
  });

  const payload = await response.json().catch(() => ({}));
  const requestId = String(payload?.token_router?.request_id || payload?.request_id || payload?.id || "").trim();
  const attempts = requestId ? await loadAttemptsByRequestId(requestId) : [];
  const selectedAttempt = pickSelectedAttempt(attempts);
  const relayAudit = requestId ? await loadRelayAuditByRequestId(requestId) : null;
  const responseText = extractAssistantText(payload);
  const upstreamError = summarizeResponseError(payload, response.ok ? "" : `HTTP ${response.status}`);

  return {
    status: response.status,
    ok: response.ok,
    requestId,
    hasText: Boolean(responseText),
    textPreview: responseText.slice(0, 220),
    modelNotFound: /model[_\s-]*not[_\s-]*found/i.test(`${upstreamError.code} ${upstreamError.message}`),
    authError: [401, 403].includes(response.status),
    rateLimited: response.status === 429,
    tokenRouter: payload?.token_router ? {
      routedModel: payload.token_router.routed_model || "",
      routedModelId: payload.token_router.routed_model_id || "",
      flowapiRoute: payload.token_router.flowapi_route || "",
      requestId: payload.token_router.request_id || requestId,
      estimatedCostCny: payload.token_router.estimated_cost_cny ?? null,
    } : null,
    usage: sanitizeUsage(payload?.usage),
    upstreamError,
    fallbackCount: Math.max(0, attempts.length - 1),
    selectedAttempt,
    attempts,
    relayAudit,
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
      const requestLookup = requestId
        ? {
            requestId,
            attempts: await loadAttemptsByRequestId(requestId),
            relayAudit: await loadRelayAuditByRequestId(requestId),
          }
        : null;
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
          requestLookup: {
            requestId,
            attempts: await loadAttemptsByRequestId(requestId),
            relayAudit: await loadRelayAuditByRequestId(requestId),
          },
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

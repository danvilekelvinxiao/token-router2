import { estimateCnyCost, getActualModelId, getCatalogModel, normalizeModelLookup } from "@/lib/models";
import { getModelProductWithConfig } from "@/lib/model-products-server";
import { smartSelectModel } from "@/lib/smart-router";
import { beginApiRequestIdempotency, finalizeReservedCallByToken, findCustomerByToken, reserveBalanceByToken } from "@/lib/customer-store";
import { acquireConcurrency, getClientIp, graylistKey, isGraylisted, rateLimit, releaseConcurrency, securityLog } from "@/lib/security";
import { getUpstreamConfigs, getUpstreamSuggestion, sendApiError } from "@/lib/upstream";
import { selectUpstream, STRATEGY } from "@/lib/smart-router";
import { userCanUseMemberModel } from "@/lib/membership/store";
import { getContent } from "@/lib/content-cms";
import { hasDatabase, query } from "@/lib/db";
import { assertSafeUpstreamUrl, sanitizeSecretText } from "@/lib/safe-upstream-url";
import { validateTextModelProfitConfig } from "@/lib/model-profit-guard";
import { buildResponseCacheKey, CACHE_TTLS, getCacheManager, shouldUseResponseCache } from "@/lib/cache-manager";
import {
  buildRequestCacheKey,
  enforceTeamRateLimits,
  getCachedTeamResponse,
  getUserTeamIds,
  recordTeamUsageLog,
  saveCachedTeamResponse,
  selectTeamTokenForRequest,
} from "@/lib/team-token-pool";
import { enforceTeamMemberLimit, recordTeamMemberUsage } from "@/lib/team-management";
import { Readable } from "stream";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-api-key, idempotency-key, x-request-id");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function getClientToken(req) {
  const auth = req.headers.authorization || "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : String(req.headers["x-api-key"] || "").trim();
  while (token.toLowerCase().startsWith("bearer ")) {
    token = token.slice(7).trim();
  }
  return token.replace(/^["']|["']$/g, "");
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
  if (["system", "assistant", "user", "tool"].includes(role)) return role;
  if (role === "developer") return "system";
  return "user";
}

function normalizeChatMessages(body = {}) {
  const messages = [];
  const instructions = normalizeMessageContent(body.instructions || body.system);

  if (instructions) {
    messages.push({ role: "system", content: instructions });
  }

  if (Array.isArray(body.messages)) {
    for (const message of body.messages) {
      const content = normalizeMessageContent(message?.content);
      if (!content) continue;
      messages.push({
        role: normalizeChatRole(message?.role),
        content,
      });
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

  return messages;
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

  if (!normalized.stream) {
    delete normalized.stream_options;
  }

  return normalized;
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
  const prompt = Math.max(0, Number(usage.prompt_tokens || fallbackPromptTokens || 0));
  const completion = Math.max(0, Number(usage.completion_tokens || estimateCompletionTokensFromResponse(payload)));
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

function sanitizeOpenAiResponseForClient(payload = {}, { publicModelId = "", requestId = "" } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const sanitized = stripUpstreamFields(payload);
  sanitized.model = publicModelId || sanitized.model || "flowapi-model";
  if (requestId && !sanitized.id) sanitized.id = requestId;
  return sanitized;
}

function sanitizeSseEventForClient(event = {}, context = {}) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return event;
  return sanitizeOpenAiResponseForClient(event, context);
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

  const customerMatch = await findCustomerByToken(clientToken);

  if (!customerMatch) {
    const invalidLimit = rateLimit(`api-invalid-key:${ip}`, { limit: 12, windowMs: 10 * 60 * 1000 });
    securityLog("invalid_api_key", { ip, tokenPrefix: clientToken.slice(0, 8) });
    if (!invalidLimit.ok) {
      graylistKey(`api:${ip}`, 30 * 60 * 1000);
      return sendApiError(res, 429, "INVALID_API_KEY_LIMITED", "无效 API Key 尝试过多，请稍后再试", "请停止重试错误 API Key，回到 API 管理页面重新复制完整 API Key。");
    }
    return sendApiError(res, 401, "INVALID_API_KEY", "Invalid FlowAPI API Key", "请确认该 API Key 是在 FlowAPI API 管理页创建。其他平台的 Key 不能直接调用 FlowAPI。", {
      error: {
        message: "Invalid FlowAPI API Key",
        type: "invalid_api_key",
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

  const upstreams = getUpstreamConfigs({ includeReviewOnly: true });
  if (upstreams.length === 0) {
    releaseConcurrency(concurrencyKey);
    return sendApiError(res, 500, "UPSTREAM_NOT_CONFIGURED", "未配置模型服务", "FlowAPI 服务端暂未配置模型服务，请联系管理员处理。");
  }

  const body = parseRequestBody(req.body);
  const explicitTeamId = String(req.headers["x-flowapi-team-id"] || body.teamId || body.team_id || "").trim();
  const boundTeamId = String(customerMatch.apiKey.teamId || "").trim();
  const requestedTeamId = explicitTeamId || boundTeamId;
  const requestedPurpose = String(req.headers["x-flowapi-purpose"] || body.purpose || body.usagePurpose || customerMatch.apiKey.usagePurpose || "").trim();
  const clientName = String(req.headers["x-flowapi-client"] || req.headers["user-agent"] || "").slice(0, 160);
  const clientRequestId = normalizeClientRequestId(req.headers["idempotency-key"] || req.headers["x-request-id"] || body.request_id || body.requestId || "");
  const requestId = clientRequestId || makeRequestId("chat");
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
  if (requestedManualModel && !catalogModel && !configuredModelProduct) {
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
        name: configuredModelProduct.displayName,
        key: configuredModelProduct.id,
        provider: configuredModelProduct.provider || "FlowAPI",
        modelId: configuredModelProduct.publicModelId || configuredModelProduct.id,
        actualModelId: configuredModelProduct.actualModelId,
        inputPrice: 0,
        outputPrice: 0,
      })
    : smartSelectModel(prompt);

  // Check model product availability
  const modelProduct = configuredModelProduct || await getModelProductWithConfig(effectiveRequestedModel || selected.modelId);
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
  delete upstreamBody.teamId;
  delete upstreamBody.team_id;
  delete upstreamBody.purpose;
  delete upstreamBody.usagePurpose;

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

  if (requestedTeamId) {
    const limited = await enforceTeamRateLimits({
      teamId: requestedTeamId,
      apiKeyId: customerMatch.apiKey.id,
      model: selected.modelId,
      provider: selected.provider,
    });
    if (limited.limited) {
      await recordTeamUsageLog({
        requestId: makeRequestId("rate"),
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
        },
      });
    }
  }

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
    publicModelId: selected.modelId,
    modelProduct,
    strategy: modelProduct?.routeStrategy || STRATEGY.AUTO,
    usageEstimate: {
      prompt_tokens: promptTokens,
      completion_tokens: estimatedCompletionTokens,
    },
    userChargeEstimate: estimatedBilling.sellPriceCny,
  });
  if (routeDecision?.error === "profit_protected") {
    releaseConcurrency(concurrencyKey);
    return sendApiError(
      res,
      503,
      "MODEL_UPSTREAM_COST_TOO_HIGH",
      "该模型当前上游成本过高，暂时维护中，请稍后再试。",
      "FlowAPI 已阻止亏损线路，本次没有请求上游，也不会扣费。请稍后再试或切换其他模型。",
      { request_id: requestId }
    );
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
        errorMessage: teamQuota.message || "你已达到团队分配额度，请联系团队队长调整。",
        balanceInsufficient: true,
        finalStatus: "team_quota_exceeded",
      });
      releaseConcurrency(concurrencyKey);
      return sendApiError(
        res,
        429,
        teamQuota.code || "TEAM_MEMBER_QUOTA_EXCEEDED",
        teamQuota.message || "你已达到团队分配额度，请联系团队队长调整。",
        teamQuota.remaining !== undefined ? `当前剩余额度约为 ${teamQuota.remaining}，请联系队长调整。` : "请联系团队队长调整成员额度。",
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
        reserve.nextResetAt ? `下次重置时间：${reserve.nextResetAt}` : "请调整该 API Key 的额度限制后再调用。",
        { nextResetAt: reserve.nextResetAt || null }
      );
    }
    return sendApiError(res, 402, "INSUFFICIENT_BALANCE", reserve.error, "请进入 FlowAPI 充值页面补充余额，到账后再继续调用。");
  }

  const referer = getProxyReferer(req);
  const title = process.env.PROXY_TITLE || "FlowAPI";

  let routeAttemptCount = 0;
  let upstream = null;
  let upstreamResponse = null;
  let upstreamLatencyMs = 0;
  let teamToken = null;
  let settlementFinalized = false;

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
      const customer = await finalizeReservedCallByToken(clientToken, {
        requestId,
        endpoint: "/v1/chat/completions",
        requestedModel: body.model || "auto",
        routedModel: selected.name,
        publicModelId: selected.modelId,
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

      releaseConcurrency(concurrencyKey);
      return res.status(200).json({
        ...sanitizeOpenAiResponseForClient(cachedTeamResponse.response, { publicModelId: selected.modelId, requestId }),
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
      });
    } catch (error) {
      console.error("[flowapi] billable team cache settlement failed:", error);
      await finalizeReservedCallByToken(clientToken, {
        requestId,
        endpoint: "/v1/chat/completions",
        requestedModel: body.model || "auto",
        routedModel: selected.name,
        publicModelId: selected.modelId,
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
      const customer = await finalizeReservedCallByToken(clientToken, {
        requestId,
        endpoint: "/v1/chat/completions",
        requestedModel: body.model || "auto",
        routedModel: selected.name,
        publicModelId: selected.modelId,
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
	      releaseConcurrency(concurrencyKey);
	      return res.status(200).json({
	        ...sanitizeOpenAiResponseForClient(cachedResponse.data, { publicModelId: selected.modelId, requestId }),
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
      });
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
    if (requestedTeamId) {
      teamToken = await selectTeamTokenForRequest({
        teamId: requestedTeamId,
        userId: customerMatch.customer.id,
        apiKeyId: customerMatch.apiKey.id,
        model: selected.modelId,
        provider: selected.provider,
        purpose: requestedPurpose,
      });
      if (!teamToken) {
        await recordTeamUsageLog({
          requestId: makeRequestId("notok"),
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
          finalStatus: "failed",
        });
        throw new Error("TEAM_TOKEN_POOL_EMPTY");
      }
    }

    const teamTokenUrl = teamToken
      ? `${String(teamToken.baseUrl || "").replace(/\/+$/, "")}${String(teamToken.apiPath || "/v1/chat/completions").startsWith("/") ? teamToken.apiPath : `/${teamToken.apiPath}`}`
      : "";
    if (teamTokenUrl) await assertSafeUpstreamUrl(teamTokenUrl);
    const teamTokenUpstream = teamToken ? [{
      name: "team-token-pool",
      label: `团队 Token 池 / ${teamToken.name}`,
      apiKey: teamToken.secret,
      upstreamUrl: teamTokenUrl,
    }] : [];
    const orderedUpstreams = teamTokenUpstream.length ? teamTokenUpstream : orderUpstreamsForFlowApiKey(routeDecision, upstreams);

    for (const candidate of orderedUpstreams) {
      routeAttemptCount += 1;
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
          requestId,
          customerId: customerMatch.customer.id,
          apiKeyId: customerMatch.apiKey.id,
          publicModelId: selected.modelId,
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
        lastUpstreamError = new Error("候选渠道成本缺失或低于 FlowAPI 毛利保护线");
        continue;
      }
      const authorizationToken = candidate.name === "new-api"
        ? getNewApiAuthorizationToken({ modelProduct })
        : String(candidate.apiKey || "").trim();
      if (!authorizationToken) {
        await recordRouteAttempt({
          requestId,
          customerId: customerMatch.customer.id,
          apiKeyId: customerMatch.apiKey.id,
          publicModelId: selected.modelId,
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
          errorCode: "UPSTREAM_TOKEN_MISSING",
          errorMessage: "服务端模型线路未配置 API Key",
        });
        lastUpstreamError = new Error("服务端模型线路未配置 API Key");
        continue;
      }
      const headers = {
        Authorization: `Bearer ${authorizationToken}`,
        "Content-Type": "application/json",
      };
      const attemptModelId = mapModelForUpstream(candidate.name, candidate.actualModelId || upstreamModelId);
      const attemptBody = attemptModelId === upstreamBody.model
        ? upstreamBody
        : { ...upstreamBody, model: attemptModelId };

      if (candidate.name === "openrouter") {
        headers["HTTP-Referer"] = referer;
        headers["X-Title"] = title;
      }

      const attemptStart = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(process.env.UPSTREAM_REQUEST_TIMEOUT_MS || 60_000));
      try {
        const response = await fetch(candidate.upstreamUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(attemptBody),
          redirect: "manual",
          signal: controller.signal,
        });
        const latencyMs = Date.now() - attemptStart;
        await recordRouteAttempt({
          requestId,
          customerId: customerMatch.customer.id,
          apiKeyId: customerMatch.apiKey.id,
          publicModelId: selected.modelId,
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
          errorCode: response.ok ? "" : "UPSTREAM_STATUS",
          errorMessage: response.ok ? "" : `${candidate.label} 返回 ${response.status}`,
        });

        if (response.ok) {
          upstream = candidate;
          upstreamResponse = response;
          upstreamLatencyMs = latencyMs;
          break;
        }

        lastUpstreamError = new Error(`${candidate.label} 返回 ${response.status}`);
        const shouldTryNext = [401, 402, 403, 404, 408, 429, 500, 502, 503, 504].includes(response.status) || response.status >= 500;
        if (shouldTryNext) continue;

        upstream = candidate;
        upstreamResponse = response;
        upstreamLatencyMs = latencyMs;
        break;
      } catch (error) {
        lastUpstreamError = error;
        await recordRouteAttempt({
          requestId,
          customerId: customerMatch.customer.id,
          apiKeyId: customerMatch.apiKey.id,
          publicModelId: selected.modelId,
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
          errorCode: error?.name === "AbortError" ? "timeout" : (error?.name || "connection_error"),
          errorMessage: sanitizeSecretText(error?.message || "upstream fetch failed"),
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    if (!upstreamResponse || !upstream) {
      throw lastUpstreamError || new Error("Upstream request failed");
    }

    const contentType = upstreamResponse.headers.get("content-type") || "";

    if (body.stream && contentType.includes("text/event-stream") && upstreamResponse.body) {
      res.status(upstreamResponse.status);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") res.flushHeaders();

	      const nodeStream = Readable.fromWeb(upstreamResponse.body);
	      const decoder = new TextDecoder();
	      let sseBuffer = "";
      let outputTextLength = 0;
      let streamUsage = null;
      let streamFinalized = false;
      let streamResponseEnded = false;
      let concurrencyReleased = false;
      let firstTokenMs = 0;

      const releaseOnce = () => {
        if (concurrencyReleased) return;
        concurrencyReleased = true;
        releaseConcurrency(concurrencyKey);
      };

	      const processSseLine = (line) => {
	        const trimmed = String(line || "").trim();
	        if (!trimmed.startsWith("data:")) return line;
	        const payload = trimmed.slice(5).trim();
	        if (!payload || payload === "[DONE]") return line;
	        try {
	          const event = JSON.parse(payload);
	          if (event?.usage) streamUsage = event.usage;
          const delta = event?.choices?.[0]?.delta?.content
            || event?.choices?.[0]?.message?.content
            || event?.delta?.text
	            || event?.content?.[0]?.text
	            || "";
	          if (typeof delta === "string") outputTextLength += delta.length;
	          const sanitized = sanitizeSseEventForClient(event, { publicModelId: selected.modelId, requestId });
	          return `data: ${JSON.stringify(sanitized)}`;
	        } catch {
	          return `data: ${JSON.stringify(buildSanitizedSsePlaceholder({ publicModelId: selected.modelId, requestId }))}`;
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

	      const finalizeStream = (statusCode = upstreamResponse.status) => {
	        if (streamFinalized) return;
	        streamFinalized = true;
	        const totalLatencyMs = Date.now() - requestStartedAt;
	        const tail = decoder.decode();
	        const finalText = transformSseText(tail, { flush: true });
	        if (finalText && !res.writableEnded) res.write(finalText);
	        if (sseBuffer.trim()) processSseLine(sseBuffer);
        const estimatedCompletionFromText = Math.max(0, Math.ceil(outputTextLength / 4));
        const usage = {
          prompt_tokens: Number(streamUsage?.prompt_tokens || promptTokens),
          completion_tokens: Number(streamUsage?.completion_tokens || estimatedCompletionFromText),
          total_tokens: Number(streamUsage?.total_tokens || (Number(streamUsage?.prompt_tokens || promptTokens) + Number(streamUsage?.completion_tokens || estimatedCompletionFromText))),
        };
        const upstreamStartedSuccessfully = upstreamResponse.status >= 200 && upstreamResponse.status < 300;
        const shouldBill = usage.completion_tokens > 0
          && ((statusCode >= 200 && statusCode < 300) || (statusCode === 499 && upstreamStartedSuccessfully));
        const streamFinalStatus = shouldBill
          ? statusCode === 499 ? "stream_partial" : "stream_success"
          : "stream_failed";
        const billing = shouldBill
          ? buildBillingSnapshotForCandidate(selected.modelId, usage, modelProduct, billingMultiplier, upstream)
          : {
              sellPriceCny: 0,
              upstreamCostCny: 0,
              profitCny: 0,
              profitMargin: 0,
              billingMode: modelProduct?.pricing?.billingMode || "token_multiplier",
            };
        finalizeReservedCallByToken(clientToken, {
          requestId,
          endpoint: "/v1/chat/completions",
          requestedModel: body.model || "auto",
          routedModel: selected.name,
          publicModelId: selected.modelId,
          actualModelId: upstreamModelId,
          provider: selected.provider,
          upstreamChannel: upstream?.name || "",
          upstreamProvider: upstream?.label || "",
          upstreamStatus: upstreamResponse.status,
          latencyMs: totalLatencyMs,
          firstTokenMs,
          status: statusCode,
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
          errorCode: shouldBill ? "" : "STREAM_FAILED",
          errorMessage: shouldBill ? "" : "流式响应未完成或没有产生可计费内容",
          grantUsageCredit: true,
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
        finalizeStream(upstreamResponse.status);
        streamResponseEnded = true;
        res.end();
      });

      nodeStream.on("error", (error) => {
        console.error("[flowapi] upstream stream error:", error);
        finalizeStream(503);
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
	        if (safeChunk) res.write(safeChunk);
	        if (typeof res.flush === "function") res.flush();
	      });
      return;
    }

    const data = await upstreamResponse.json();
    const shouldBill = upstreamResponse.ok;
    const usage = shouldBill
      ? normalizeSuccessUsage(data, promptTokens)
      : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const billing = shouldBill
      ? buildBillingSnapshotForCandidate(selected.modelId, usage, modelProduct, billingMultiplier, upstream)
      : {
          sellPriceCny: 0,
          upstreamCostCny: 0,
          profitCny: 0,
          profitMargin: 0,
          billingMode: modelProduct?.pricing?.billingMode || "token_multiplier",
        };
    const totalLatencyMs = Date.now() - requestStartedAt;

    const customer = await finalizeReservedCallByToken(clientToken, {
      requestId,
      endpoint: "/v1/chat/completions",
      requestedModel: body.model || "auto",
      routedModel: selected.name,
      publicModelId: selected.modelId,
      actualModelId: upstreamModelId,
      provider: selected.provider,
      upstreamChannel: upstream?.name || "",
      upstreamProvider: upstream?.label || "",
      upstreamStatus: upstreamResponse.status,
      latencyMs: totalLatencyMs,
      firstTokenMs: 0,
      status: upstreamResponse.status,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      cost: billing.sellPriceCny,
      sellPriceCny: billing.sellPriceCny,
      upstreamCostCny: billing.upstreamCostCny,
      profitCny: billing.profitCny,
      profitMargin: billing.profitMargin,
      billingMode: billing.billingMode,
      routeStrategy: routeDecision.strategy || "",
      routeAttempts: routeAttemptCount,
      isStream: false,
      errorCode: shouldBill ? "" : "UPSTREAM_ERROR",
      errorMessage: shouldBill ? "" : sanitizeSecretText(typeof data.error === "string" ? data.error : data.error?.message || ""),
    }, reserve);
    settlementFinalized = true;

    releaseConcurrency(concurrencyKey);
    const responsePayload = {
      ...sanitizeOpenAiResponseForClient(data, { publicModelId: selected.modelId, requestId }),
      token_router: {
        routed_model: selected.name,
        routed_model_id: selected.modelId,
        flowapi_route: "router",
        service_provider: "FlowAPI",
        first_token_ms: 0,
        latency_ms: totalLatencyMs,
        estimated_cost_cny: billing.sellPriceCny,
        balance_cny: customer?.balance,
        request_id: requestId,
        team_id: requestedTeamId || undefined,
        cache_hit: false,
      },
    };

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
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          officialCostCny: billing.upstreamCostCny,
          actualCostCny: billing.sellPriceCny,
          success: shouldBill,
          durationMs: upstreamLatencyMs,
          upstreamRequestId: upstreamResponse.headers.get("x-request-id") || data.id || "",
          errorCode: shouldBill ? "" : "UPSTREAM_ERROR",
	          errorMessage: shouldBill ? "" : sanitizeSecretText(typeof data.error === "string" ? data.error : data.error?.message || ""),
          upstreamError: !shouldBill,
          finalStatus: shouldBill ? "success" : "failed",
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
        console.error("[flowapi] team usage log failed after settlement:", error);
      }
      if (shouldBill) {
        try {
          await saveCachedTeamResponse(teamRequestContext, responsePayload, {
            totalTokens: usage.total_tokens || 0,
            costCny: billing.sellPriceCny,
          });
        } catch (error) {
          console.error("[flowapi] team cache save failed after settlement:", error);
        }
      }
    }

    if (shouldBill && responseCacheEnabled) {
      getCacheManager().set("responseCache", responseCacheKey, {
        data: responsePayload,
        usage,
        createdAt: new Date().toISOString(),
      }, CACHE_TTLS.responseCache);
    }

    if (!shouldBill) {
      return res.status(upstreamResponse.status).json({
        ...responsePayload,
        code: "UPSTREAM_ERROR",
        error: "模型服务返回错误",
        serviceError: "",
        suggestion: getUpstreamSuggestion(upstreamResponse.status),
        docsUrl: "/help#error-codes",
      });
    }

    return res.status(upstreamResponse.status).json(responsePayload);
  } catch (error) {
    if (requestedTeamId) {
      await recordTeamUsageLog({
        requestId: makeRequestId("err"),
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
        errorCode: error.message === "TEAM_TOKEN_POOL_EMPTY" ? "TEAM_TOKEN_POOL_EMPTY" : "UPSTREAM_REQUEST_FAILED",
	        errorMessage: sanitizeSecretText(error.message || "upstream error"),
        upstreamError: error.message !== "TEAM_TOKEN_POOL_EMPTY",
        finalStatus: "failed",
      }).catch(() => {});
    }
    if (!settlementFinalized) {
      await finalizeReservedCallByToken(clientToken, {
        requestId,
        endpoint: "/v1/chat/completions",
        requestedModel: body.model || "auto",
        routedModel: selected.name,
        publicModelId: selected.modelId,
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
        errorCode: error.message === "TEAM_TOKEN_POOL_EMPTY" ? "TEAM_TOKEN_POOL_EMPTY" : "UPSTREAM_REQUEST_FAILED",
        errorMessage: sanitizeSecretText(error.message || "upstream error"),
      }, reserve);
    }

    releaseConcurrency(concurrencyKey);
    return sendApiError(
      res,
      error.message === "TEAM_TOKEN_POOL_EMPTY" ? 503 : 503,
      error.message === "TEAM_TOKEN_POOL_EMPTY" ? "TEAM_TOKEN_POOL_EMPTY" : "UPSTREAM_REQUEST_FAILED",
      error.message === "TEAM_TOKEN_POOL_EMPTY" ? "当前团队可用 Token 不足，请联系管理员。" : "模型服务暂时不可用",
      error.message === "TEAM_TOKEN_POOL_EMPTY" ? "该团队没有匹配当前模型/用途的可用 Token，请管理员到团队 Token 池录入或启用 Token。" : "模型服务暂时无法连接，请稍后重试；如果持续失败，请切换其他模型或联系 FlowAPI 客服。",
      {
	      serviceError: sanitizeSecretText(error.message || ""),
	    });
  }
}

function makeRequestId(prefix = "req") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

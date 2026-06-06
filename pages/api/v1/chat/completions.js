import { estimateCnyCost, getActualModelId, getCatalogModel, normalizeModelLookup } from "@/lib/models";
import { getModelProduct } from "@/lib/model-products";
import { smartSelectModel } from "@/lib/smart-router";
import { finalizeReservedCallByToken, findCustomerByToken, getTemporaryCreditBalance, reserveBalanceByToken } from "@/lib/customer-store";
import { acquireConcurrency, getClientIp, graylistKey, isGraylisted, rateLimit, releaseConcurrency, securityLog } from "@/lib/security";
import { getUpstreamConfigs, getUpstreamSuggestion, sendApiError } from "@/lib/upstream";
import { selectUpstream, STRATEGY } from "@/lib/smart-router";
import { isTokenWhitelisted, logPassthroughCall } from "@/lib/new-api/passthrough";
import { userCanUseMemberModel } from "@/lib/membership/store";
import { getContent } from "@/lib/content-cms";
import {
  buildRequestCacheKey,
  enforceTeamRateLimits,
  getCachedTeamResponse,
  recordTeamUsageLog,
  saveCachedTeamResponse,
  selectTeamTokenForRequest,
} from "@/lib/team-token-pool";
import { Readable } from "stream";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
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
  if (!Number.isFinite(requestedMaxTokens) || requestedMaxTokens <= 0) {
    normalized.max_tokens = 16;
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

function estimateReserveCost(modelId, body = {}, promptTokens = 1) {
  const maxTokens = Math.min(Number(body.max_tokens || 1024) || 1024, Number(process.env.MAX_COMPLETION_TOKENS || 4096));
  const estimated = estimateCnyCost(modelId, {
    prompt_tokens: promptTokens,
    completion_tokens: maxTokens,
  });
  const minimum = Number(process.env.MIN_API_RESERVE_CNY || 0.001);
  return Number(Math.max(minimum, estimated * 1.25).toFixed(6));
}

function getProxyReferer(req) {
  const configured = String(process.env.PROXY_HTTP_REFERER || "").trim();
  if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) return configured;
  const host = req.headers.host || "flowapi.fun";
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host.replace(/^api\./, "")}`;
}

function orderUpstreamsForFlowApiKey(routeDecision, upstreams) {
  const candidates = routeDecision.fallbackChain && routeDecision.fallbackChain.length > 0
    ? routeDecision.fallbackChain
    : upstreams;
  const routeOrdered = routeDecision.upstream
    ? [routeDecision.upstream, ...candidates.filter((u) => u.name !== (routeDecision.upstream?.name))]
    : candidates;
  const newApi = routeOrdered.find((upstream) => upstream.name === "new-api");

  if (!newApi) return routeOrdered;

  // FlowAPI 本地余额是唯一商业账本。外部用户的 FlowAPI API Key
  // 只能进入 New API 执行层，不能在 New API 失败后自动切到其他上游
  // 形成“本地已校验但上游绕路”的账务和权限风险。
  return [newApi];
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

function shouldUseServerNewApiToken(apiKey = {}) {
  const modelGroup = String(apiKey.modelGroup || "").trim().toLowerCase();
  const usagePurpose = String(apiKey.usagePurpose || "").trim().toLowerCase();
  const usageScope = String(apiKey.usageScope || "").trim().toLowerCase();

  return modelGroup === "all-models"
    || usagePurpose === "all-models-test"
    || usageScope === "monitoring";
}

function getNewApiAuthorizationToken({ apiKey, clientToken, modelProduct } = {}) {
  if (!shouldUseServerNewApiToken(apiKey)) return clientToken;

  const executionGroup = modelProduct?.executionGroup || modelProduct?.group || process.env.NEW_API_DEFAULT_GROUP || "default";
  return getNewApiGroupToken(executionGroup) || String(process.env.NEW_API_KEY || "").trim() || clientToken;
}

export default async function handler(req, res) {
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
    return sendApiError(res, 401, "MISSING_API_KEY", "缺少 API 密匙", "请在请求头加入 Authorization: Bearer 你的 API 密匙，API 密匙可在 FlowAPI 的 API 管理页面复制。");
  }

  const customerMatch = await findCustomerByToken(clientToken);

  if (!customerMatch) {
    // Admin whitelist: token not in FlowAPI local store but may be
    // whitelisted for direct New API passthrough (debug-only feature).
    const passthroughOk = await isTokenWhitelisted(clientToken);
    if (!passthroughOk) {
      const invalidLimit = rateLimit(`api-invalid-key:${ip}`, { limit: 12, windowMs: 10 * 60 * 1000 });
      securityLog("invalid_api_key", { ip, tokenPrefix: clientToken.slice(0, 8) });
      if (!invalidLimit.ok) {
        graylistKey(`api:${ip}`, 30 * 60 * 1000);
        return sendApiError(res, 429, "INVALID_API_KEY_LIMITED", "无效 API 密匙尝试过多，请稍后再试", "请停止重试错误密匙，回到 API 管理页面重新复制完整 API 密匙。");
      }
      return sendApiError(res, 401, "INVALID_API_KEY", "Invalid FlowAPI API Key", "请确认该 API 密匙是在 FlowAPI API 管理页创建，未知 New API Token 不允许直通。", {
        error: {
          message: "Invalid FlowAPI API Key",
          type: "invalid_api_key",
        },
      });
    }

    // Pass-through: whitelist token → direct to New API, no local balance check
    const body = req.body || {};
    const upstreams = getUpstreamConfigs();
    if (upstreams.length === 0) {
      return sendApiError(res, 500, "UPSTREAM_NOT_CONFIGURED", "未配置上游 API", "FlowAPI 服务端暂未配置上游通道。");
    }

    const startMs = Date.now();
    try {
      const upstreamRes = await fetch(upstreams[0].upstreamUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const text = await upstreamRes.text();
      let usage = {};
      try {
        const j = JSON.parse(text);
        usage = {
          inputTokens: j.usage?.prompt_tokens || 0,
          outputTokens: j.usage?.completion_tokens || 0,
          totalTokens: j.usage?.total_tokens || 0,
        };
      } catch {}

      const latency = Date.now() - startMs;
      logPassthroughCall({
        token: clientToken,
        model: body.model || "",
        status: upstreamRes.ok ? 1 : 0,
        ...usage,
        latencyMs: latency,
        errorMsg: upstreamRes.ok ? "" : text.slice(0, 500),
      }).catch(() => {});

      res.status(upstreamRes.status);
      res.setHeader("Content-Type", upstreamRes.headers.get("content-type") || "application/json");
      return res.send(text);
    } catch (e) {
      logPassthroughCall({
        token: clientToken,
        model: body.model || "",
        status: 0,
        latencyMs: Date.now() - startMs,
        errorMsg: e.message || "upstream error",
      }).catch(() => {});
      return sendApiError(res, 502, "UPSTREAM_ERROR", "上游服务异常", "New API 暂不可用，请稍后重试。");
    }
  }

  const keyLimit = rateLimit(`api:key:${customerMatch.apiKey.id}`, {
    limit: Number(process.env.API_KEY_RPM || 60),
    windowMs: 60 * 1000,
  });
  if (!keyLimit.ok) {
    securityLog("api_key_limited", { ip, customerId: customerMatch.customer.id, keyId: customerMatch.apiKey.id });
    return sendApiError(res, 429, "API_KEY_RATE_LIMITED", "该 API 密匙请求过快，请稍后再试", "请降低请求频率，或为不同业务创建不同 API 密匙分开使用。");
  }

  const concurrencyKey = `api:key:${customerMatch.apiKey.id}`;
  const maxConcurrency = Number(process.env.API_KEY_MAX_CONCURRENCY || 3);
  if (!acquireConcurrency(concurrencyKey, maxConcurrency)) {
    securityLog("api_key_concurrency_limited", { ip, customerId: customerMatch.customer.id, keyId: customerMatch.apiKey.id });
    return sendApiError(res, 429, "API_KEY_CONCURRENCY_LIMITED", "该 API 密匙并发请求过多，请稍后再试", "请减少同时发起的请求数量，或稍后重试。");
  }

  const availableBalance = Number(customerMatch.customer.balance || 0) + await getTemporaryCreditBalance(customerMatch.customer.id);
  if (availableBalance <= 0) {
    releaseConcurrency(concurrencyKey);
    return sendApiError(res, 402, "INSUFFICIENT_BALANCE", "人民币余额不足，请先充值", "请进入 FlowAPI 充值页面补充余额，到账后再继续调用。");
  }

  const upstreams = getUpstreamConfigs();
  if (upstreams.length === 0) {
    releaseConcurrency(concurrencyKey);
    return sendApiError(res, 500, "UPSTREAM_NOT_CONFIGURED", "未配置上游 API", "FlowAPI 服务端暂未配置上游通道，请联系管理员处理。");
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const requestedTeamId = String(req.headers["x-flowapi-team-id"] || body.teamId || body.team_id || customerMatch.apiKey.teamId || "").trim();
  const requestedPurpose = String(req.headers["x-flowapi-purpose"] || body.purpose || body.usagePurpose || customerMatch.apiKey.usagePurpose || "").trim();
  const clientName = String(req.headers["x-flowapi-client"] || req.headers["user-agent"] || "").slice(0, 160);
  const normalizedMessages = normalizeChatMessages(body);
  const prompt = getPromptFromMessages(normalizedMessages);
  const boundPublicModel = customerMatch.apiKey.publicModelId || "";
  const boundActualModel = customerMatch.apiKey.actualModelId || boundPublicModel;
  const requestedModel = body.model && body.model !== "auto" ? normalizeModelLookup(body.model) : "";
  const localePriceMultiplier = Math.max(1, Number(customerMatch.apiKey?.localePriceMultiplier || 1));
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
  if (requestedManualModel && !catalogModel) {
    releaseConcurrency(concurrencyKey);
    return sendApiError(
      res,
      400,
      "UNSUPPORTED_MODEL",
      "模型暂未接入 FlowAPI",
      "请在模型广场复制推荐的 Model ID，或使用 model: auto 让 FlowAPI 自动选择可用模型。"
    );
  }

  const selected = requestedManualModel ? catalogModel : smartSelectModel(prompt);
  const upstreamModelId = getActualModelId(selected);

  // Check model product availability
  const modelProduct = getModelProduct(effectiveRequestedModel || selected.modelId);
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
        "该模型上游暂未开放，请选择其他模型。",
        `${modelProduct.displayName} 当前状态为"${modelProduct.statusLabel || '即将开放'}"，上游暂未开放调用。请在模型广场选择状态为"可用"的模型。`
      );
    }
  }

  if (!upstreamModelId || String(upstreamModelId).trim() === "") {
    releaseConcurrency(concurrencyKey);
    return sendApiError(
      res,
      500,
      "MODEL_NOT_CONFIGURED",
      "模型路由未配置",
      "该模型的 actual_model_id 未设置，无法转发到上游。请联系管理员在后台配置。"
    );
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

  if (requestedTeamId) {
    const cached = await getCachedTeamResponse(teamRequestContext);
    if (cached?.response) {
      await recordTeamUsageLog({
        requestId: makeRequestId("cache"),
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
        totalTokens: cached.savedTokens || 0,
        savedCny: cached.savedCny || 0,
        success: true,
        finalStatus: "cache_hit",
      });
      releaseConcurrency(concurrencyKey);
      return res.status(200).json({
        ...cached.response,
        token_router: {
          ...(cached.response.token_router || {}),
          cache_hit: true,
          cache_key: cacheKey,
          cache_saved_tokens: cached.savedTokens || 0,
          cache_saved_cny: cached.savedCny || 0,
          team_id: requestedTeamId,
        },
      });
    }

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
  const reserveCost = Number((estimateReserveCost(selected.modelId, upstreamBody, promptTokens) * localePriceMultiplier).toFixed(6));
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

  try {
    if (upstreamBody.stream) {
      upstreamBody.stream_options = {
        include_usage: true,
        ...(upstreamBody.stream_options || {}),
      };
    }

    // Smart routing: determine best upstream strategy
    const routeDecision = await selectUpstream({
      modelId: upstreamModelId,
      strategy: STRATEGY.AUTO,
    });

    let upstream = null;
    let upstreamResponse = null;
    let lastUpstreamError = null;

    // Try upstreams in smart order: primary first, then fallback chain
    let teamToken = null;
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

    const teamTokenUpstream = teamToken ? [{
      name: "team-token-pool",
      label: `团队 Token 池 / ${teamToken.name}`,
      apiKey: teamToken.secret,
      upstreamUrl: `${String(teamToken.baseUrl || "").replace(/\/+$/, "")}${String(teamToken.apiPath || "/v1/chat/completions").startsWith("/") ? teamToken.apiPath : `/${teamToken.apiPath}`}`,
    }] : [];
    const orderedUpstreams = teamTokenUpstream.length ? teamTokenUpstream : orderUpstreamsForFlowApiKey(routeDecision, upstreams);

    for (const candidate of orderedUpstreams) {
      const headers = {
        Authorization: `Bearer ${candidate.name === "new-api" ? getNewApiAuthorizationToken({ apiKey: customerMatch.apiKey, clientToken, modelProduct }) : candidate.apiKey}`,
        "Content-Type": "application/json",
      };

      if (candidate.name === "openrouter") {
        headers["HTTP-Referer"] = referer;
        headers["X-Title"] = title;
      }

      try {
        const response = await fetch(candidate.upstreamUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(upstreamBody),
        });

        if (response.ok) {
          upstream = candidate;
          upstreamResponse = response;
          break;
        }

        lastUpstreamError = new Error(`${candidate.label} 返回 ${response.status}`);
        const shouldTryNext = [400, 401, 403, 404, 429].includes(response.status) || response.status >= 500;
        if (shouldTryNext) continue;

        upstream = candidate;
        upstreamResponse = response;
        break;
      } catch (error) {
        lastUpstreamError = error;
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

      const estimatedCost = estimateCnyCost(selected.modelId, {
        prompt_tokens: promptTokens,
        completion_tokens: 0,
      });
      const billedEstimatedCost = Number((estimatedCost * localePriceMultiplier).toFixed(6));
      const nodeStream = Readable.fromWeb(upstreamResponse.body);

      nodeStream.on("end", () => {
        finalizeReservedCallByToken(clientToken, {
          endpoint: "/v1/chat/completions",
          requestedModel: body.model || "auto",
          routedModel: selected.name,
          provider: selected.provider,
          status: upstreamResponse.status,
          promptTokens,
          completionTokens: 0,
          cost: billedEstimatedCost,
          grantUsageCredit: true,
        }, reserve).then(() => {
          if (requestedTeamId) {
            return recordTeamUsageLog({
              requestId: makeRequestId("stream"),
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
              inputTokens: promptTokens,
              outputTokens: 0,
              totalTokens: promptTokens,
              actualCostCny: billedEstimatedCost,
              success: true,
              finalStatus: "stream_success",
            });
          }
          return null;
        }).catch((error) => console.error("[flowapi] stream record failed:", error));
        releaseConcurrency(concurrencyKey);
      });

      nodeStream.on("error", (error) => {
        console.error("[flowapi] upstream stream error:", error);
        releaseConcurrency(concurrencyKey);
      });

      res.on("close", () => {
        releaseConcurrency(concurrencyKey);
      });

      nodeStream.pipe(res);
      return;
    }

    const data = await upstreamResponse.json();
    const baseCost = estimateCnyCost(selected.modelId, data.usage);
    const cost = Number((baseCost * localePriceMultiplier).toFixed(6));

    const customer = await finalizeReservedCallByToken(clientToken, {
      endpoint: "/v1/chat/completions",
      requestedModel: body.model || "auto",
      routedModel: selected.name,
      provider: selected.provider,
      status: upstreamResponse.status,
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      cost,
    }, reserve);

    releaseConcurrency(concurrencyKey);
    const responsePayload = {
      ...data,
      token_router: {
        routed_model: selected.name,
        routed_model_id: selected.modelId,
        upstream_model_id: upstreamModelId,
        upstream: upstream.label,
        estimated_cost_cny: cost,
        balance_cny: customer?.balance,
        team_id: requestedTeamId || undefined,
        token_pool_id: teamToken?.id || undefined,
        cache_hit: false,
      },
    };

    if (requestedTeamId) {
      await recordTeamUsageLog({
        requestId: makeRequestId("team"),
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
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        officialCostCny: baseCost,
        actualCostCny: cost,
        success: upstreamResponse.ok,
        durationMs: 0,
        upstreamRequestId: upstreamResponse.headers.get("x-request-id") || data.id || "",
        errorCode: upstreamResponse.ok ? "" : "UPSTREAM_ERROR",
        errorMessage: upstreamResponse.ok ? "" : (typeof data.error === "string" ? data.error : data.error?.message || ""),
        upstreamError: !upstreamResponse.ok,
        finalStatus: upstreamResponse.ok ? "success" : "failed",
      });
      if (upstreamResponse.ok) {
        await saveCachedTeamResponse(teamRequestContext, responsePayload, {
          totalTokens: data.usage?.total_tokens || 0,
          costCny: cost,
        });
      }
    }

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        ...responsePayload,
        code: "UPSTREAM_ERROR",
        error: "上游模型返回错误",
        upstreamError: typeof data.error === "string" ? data.error : data.error?.message || "",
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
        errorMessage: error.message || "upstream error",
        upstreamError: error.message !== "TEAM_TOKEN_POOL_EMPTY",
        finalStatus: "failed",
      }).catch(() => {});
    }
    await finalizeReservedCallByToken(clientToken, {
      endpoint: "/v1/chat/completions",
      requestedModel: body.model || "auto",
      routedModel: selected.name,
      provider: selected.provider,
      status: 503,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
    }, reserve);

    releaseConcurrency(concurrencyKey);
    return sendApiError(
      res,
      error.message === "TEAM_TOKEN_POOL_EMPTY" ? 503 : 503,
      error.message === "TEAM_TOKEN_POOL_EMPTY" ? "TEAM_TOKEN_POOL_EMPTY" : "UPSTREAM_REQUEST_FAILED",
      error.message === "TEAM_TOKEN_POOL_EMPTY" ? "当前团队可用 Token 不足，请联系管理员。" : "上游模型服务暂时不可用",
      error.message === "TEAM_TOKEN_POOL_EMPTY" ? "该团队没有匹配当前模型/用途的可用 Token，请管理员到团队 Token 池录入或启用 Token。" : "上游模型服务暂时无法连接，请稍后重试；如果持续失败，请切换其他模型或联系 FlowAPI 客服。",
      {
      upstreamError: error.message || "",
    });
  }
}

function makeRequestId(prefix = "req") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

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
  const promptTokens = estimatePromptTokens(upstreamBody.messages || []);
  const reserveCost = Number((estimateReserveCost(selected.modelId, upstreamBody, promptTokens) * localePriceMultiplier).toFixed(6));
  const reserve = await reserveBalanceByToken(clientToken, reserveCost);

  if (reserve.error) {
    releaseConcurrency(concurrencyKey);
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
    const orderedUpstreams = orderUpstreamsForFlowApiKey(routeDecision, upstreams);

    for (const candidate of orderedUpstreams) {
      const headers = {
        Authorization: `Bearer ${candidate.name === "new-api" ? clientToken : candidate.apiKey}`,
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
        }, reserve).catch((error) => console.error("[flowapi] stream record failed:", error));
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
      },
    };

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
    return sendApiError(res, 503, "UPSTREAM_REQUEST_FAILED", "上游模型服务暂时不可用", "上游模型服务暂时无法连接，请稍后重试；如果持续失败，请切换其他模型或联系 FlowAPI 客服。", {
      upstreamError: error.message || "",
    });
  }
}

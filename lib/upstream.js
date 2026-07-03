import { assertSafeUpstreamUrl } from "./safe-upstream-url";
import { resolveNewApiAdminAuth } from "./new-api/admin-auth.mjs";

export const API_ERROR_DOCS_URL = "/help#error-codes";

function normalizeUpstreamBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

export function getUpstreamConfig() {
  return getUpstreamConfigs()[0] || null;
}

export function getUpstreamConfigs({ includeReviewOnly = false } = {}) {
  const sub2ApiBase = normalizeUpstreamBaseUrl(process.env.SUB2API_BASE_URL || process.env.SUB2API_INTERNAL_URL || "");
  const sub2ApiKey = process.env.SUB2API_API_KEY || process.env.SUB2API_API_KEY_SECONDARY || "";
  const newApiBase = process.env.NEW_API_BASE_URL;
  const newApiKey =
    process.env.NEW_API_KEY ||
    process.env.NEW_API_KEY_ALL_MODELS ||
    process.env.NEW_API_ADMIN_TOKEN ||
    "";
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openRouterBase = normalizeUpstreamBaseUrl(process.env.OPENROUTER_API_BASE_URL || "https://openrouter.ai/api");
  const configs = [];

  function addOpenAICompatible({
    name,
    label,
    baseUrl,
    apiKey,
    healthPath = "/v1/models",
    chatPath = "/v1/chat/completions",
    healthAuth = true,
    includeAsDefaultCandidate = true,
    requiresAdminReview = false,
  }) {
    const cleanBase = normalizeUpstreamBaseUrl(baseUrl);
    const cleanKey = String(apiKey || "").trim();
    if (!cleanBase || !cleanKey) return;
    if (requiresAdminReview && !includeReviewOnly) return;
    configs.push({
      name,
      label,
      baseUrl: cleanBase,
      apiKey: cleanKey,
      upstreamUrl: `${cleanBase}${chatPath.startsWith("/") ? chatPath : `/${chatPath}`}`,
      modelsUrl: `${cleanBase}${healthPath.startsWith("/") ? healthPath : `/${healthPath}`}`,
      healthUrl: `${cleanBase}${healthPath.startsWith("/") ? healthPath : `/${healthPath}`}`,
      healthAuth,
      includeAsDefaultCandidate,
      requiresAdminReview,
    });
  }

  if (sub2ApiBase && sub2ApiKey) {
    configs.push({
      name: "sub2api",
      label: "Sub2api 中转",
      baseUrl: sub2ApiBase,
      apiKey: sub2ApiKey,
      upstreamUrl: `${sub2ApiBase}/v1/chat/completions`,
      modelsUrl: `${sub2ApiBase}/v1/models`,
      healthUrl: `${sub2ApiBase}/v1/models`,
      healthAuth: true,
    });
  }

  if (newApiBase && newApiKey) {
    const baseUrl = normalizeUpstreamBaseUrl(newApiBase);
    configs.push({
      name: "new-api",
      label: "New API",
      baseUrl,
      apiKey: newApiKey,
      upstreamUrl: `${baseUrl}/v1/chat/completions`,
      modelsUrl: `${baseUrl}/v1/models`,
      healthUrl: `${baseUrl}/v1/models`,
      healthAuth: true,
    });
  }

  addOpenAICompatible({
    name: "aheapi",
    label: "AHEAPI 高级通道",
    baseUrl: process.env.AHEAPI_API_BASE_URL,
    apiKey: process.env.AHEAPI_API_KEY,
  });

  addOpenAICompatible({
    name: "uniapi",
    label: "UniAPI 高级通道",
    baseUrl: process.env.UNIAPI_API_BASE_URL,
    apiKey: process.env.UNIAPI_API_KEY,
  });

  addOpenAICompatible({
    name: "aicards",
    label: "FlowAPI 备用通道",
    baseUrl: process.env.AICARDS_API_BASE_URL || process.env.AICARDS_BASE_URL,
    apiKey: process.env.AICARDS_API_KEY,
    includeAsDefaultCandidate: false,
    requiresAdminReview: true,
  });

  addOpenAICompatible({
    name: "official-openai",
    label: "OpenAI 官方兜底",
    baseUrl: process.env.OPENAI_API_BASE_URL || process.env.OFFICIAL_OPENAI_API_BASE_URL || "https://api.openai.com",
    apiKey: process.env.OPENAI_API_KEY || process.env.OFFICIAL_OPENAI_API_KEY,
  });

  if (openRouterKey) {
    configs.push({
      name: "openrouter",
      label: "备用聚合路由",
      baseUrl: openRouterBase,
      apiKey: openRouterKey,
      upstreamUrl: `${openRouterBase}/v1/chat/completions`,
      modelsUrl: `${openRouterBase}/v1/models`,
      healthUrl: `${openRouterBase}/v1/models`,
      healthAuth: true,
    });
  }

  addOpenAICompatible({
    name: "official-gemini",
    label: "Gemini 兼容通道",
    baseUrl: process.env.GEMINI_OPENAI_API_BASE_URL,
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  });

  addOpenAICompatible({
    name: "aliyun-bailian",
    label: "阿里云百炼",
    baseUrl: process.env.ALIYUN_BAILIAN_API_BASE_URL,
    apiKey: process.env.ALIYUN_BAILIAN_API_KEY,
  });

  return configs;
}

function normalizeBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function upstreamNameFromAdminConfig(upstream = {}) {
  const id = String(upstream.id || upstream.name || "").toLowerCase();
  const name = String(upstream.name || "").toLowerCase();
  const type = String(upstream.type || "").toLowerCase();
  const baseUrl = normalizeBaseUrl(upstream.baseUrl || "");
  const remark = String(upstream.remark || "").toLowerCase();
  const text = `${id} ${name} ${type} ${baseUrl} ${remark}`;
  if (text.includes("sub2api") || text.includes("sub2-api") || text.includes("sub2 api")) return "sub2api";
  if (baseUrl.includes("aicards.shop") || id.includes("aicards")) return "aicards";
  if (type.includes("new api") || type.includes("new-api") || id.includes("new-api") || id.includes("newapi")) return "new-api";
  if (baseUrl.includes("api.openai.com") || id.includes("openai") || id.includes("official-openai")) return "official-openai";
  if (baseUrl.includes("openrouter.ai") || id.includes("openrouter")) return "openrouter";
  if (id.includes("aheapi")) return "aheapi";
  if (id.includes("uniapi")) return "uniapi";
  return `admin-${String(upstream.id || upstream.name || "upstream").replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}`;
}

function adminUpstreamLabel(upstream = {}, name = "") {
  if (name === "sub2api") return "Sub2api 号池";
  if (name === "aicards") return "FlowAPI 备用通道";
  if (name === "new-api") return "FlowAPI 模型线路";
  if (name === "official-openai") return "OpenAI 官方兜底";
  if (name === "openrouter") return "备用聚合路由";
  return "FlowAPI 模型服务";
}

async function getAdminSavedUpstreamConfigs({ includeReviewOnly = false } = {}) {
  let upstreams = [];
  try {
    const { listUpstreams, getUpstream } = await import("./admin-commercial-config");
    upstreams = await listUpstreams();
    const configs = [];
    for (const item of upstreams) {
      if (item.enabled === false) continue;
      if (item.status === "disabled") continue;
      const baseUrl = normalizeBaseUrl(item.baseUrl || "");
      if (!baseUrl) continue;
      const isReviewOnly = /aicards\.shop/i.test(baseUrl) || /aicards|备用/i.test(`${item.name || ""} ${item.type || ""} ${item.remark || ""}`);
      if (isReviewOnly && !includeReviewOnly) continue;

      const detail = await getUpstream(item.id, { includeSecret: true }).catch(() => null);
      const apiKey = String(detail?.apiKey || "").trim();
      if (!apiKey) continue;

      const name = upstreamNameFromAdminConfig(detail || item);
      configs.push({
        name,
        label: adminUpstreamLabel(detail || item, name),
        baseUrl,
        apiKey,
        upstreamUrl: `${baseUrl}/v1/chat/completions`,
        modelsUrl: `${baseUrl}/v1/models`,
        healthUrl: `${baseUrl}/v1/models`,
        healthAuth: true,
        includeAsDefaultCandidate: !isReviewOnly,
        requiresAdminReview: isReviewOnly,
        adminConfigured: true,
        adminUpstreamId: item.id,
      });
    }

    return configs;
  } catch {
    return [];
  }
}

function mergeUpstreamConfigs(primary = [], secondary = []) {
  const merged = new Map();
  for (const item of [...secondary, ...primary]) {
    const key = `${normalizeBaseUrl(item.baseUrl)}:${item.name}`;
    if (!item.apiKey || !item.upstreamUrl) continue;
    if (!merged.has(key)) merged.set(key, item);
  }
  return Array.from(merged.values());
}

export async function getUpstreamConfigsAsync({ includeReviewOnly = false } = {}) {
  const envConfigs = getUpstreamConfigs({ includeReviewOnly });
  const newApiBase = normalizeUpstreamBaseUrl(process.env.NEW_API_BASE_URL || process.env.NEW_API_ADMIN_URL || "");
  if (newApiBase) {
    try {
      const adminAuth = await resolveNewApiAdminAuth();
      if (adminAuth.token) {
        envConfigs.push({
          name: "new-api",
          label: "New API",
          baseUrl: newApiBase,
          apiKey: adminAuth.token,
          upstreamUrl: `${newApiBase}/v1/chat/completions`,
          modelsUrl: `${newApiBase}/v1/models`,
          healthUrl: `${newApiBase}/v1/models`,
          healthAuth: true,
          adminConfigured: true,
        });
      }
    } catch {
      // Keep the runtime env-based New API config even if admin auth probing fails.
    }
  }
  const adminConfigs = await getAdminSavedUpstreamConfigs({ includeReviewOnly });
  return mergeUpstreamConfigs(adminConfigs, envConfigs);
}

export function apiErrorPayload(code, error, suggestion, extra = {}) {
  return {
    code,
    error,
    suggestion,
    docsUrl: API_ERROR_DOCS_URL,
    ...extra,
  };
}

export function sendApiError(res, status, code, error, suggestion, extra = {}) {
  return res.status(status).json(apiErrorPayload(code, error, suggestion, extra));
}

export function getUpstreamSuggestion(status) {
  if (status === 402) {
    return "上游渠道返回 402 Payment Required，表示当前模型绑定的上游账号或 API Key 余额不足。请检查当前渠道余额，或切换到其他有余额的渠道。";
  }
  if (status === 401 || status === 403) {
    return "模型通道暂时不可用，请稍后重试或联系 FlowAPI 客服；你的 FlowAPI API Key 不需要更换。";
  }
  if (status === 404) {
    return "模型路径不存在，请先确认模型名是否正确，或切换到帮助指南推荐模型重试。";
  }
  if (status === 429) {
    return "模型服务繁忙或限流，请稍后重试；如果持续出现，请切换其他模型。";
  }
  if (status >= 500) {
    return "模型服务暂时不可用，请稍后重试；紧急使用时建议切换其他模型。";
  }
  return "请求没有成功，请稍后重试。";
}

export async function checkUpstreamHealth({ timeoutMs = 5000 } = {}) {
  const upstreams = await getUpstreamConfigsAsync();
  if (upstreams.length === 0) {
    return {
      ok: false,
      status: "not_configured",
      message: "未配置模型服务",
      suggestion: "请先配置 NEW_API_BASE_URL + NEW_API_KEY，或配置 OPENROUTER_API_KEY。",
    };
  }

  const results = [];

  for (const upstream of upstreams) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const healthUrl = upstream.healthUrl || upstream.modelsUrl;

    try {
      const headers = { "Content-Type": "application/json" };
      if (upstream.healthAuth !== false && upstream.apiKey) {
        headers.Authorization = `Bearer ${upstream.apiKey}`;
      }

      await assertSafeUpstreamUrl(healthUrl);
      const response = await fetch(healthUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
        redirect: "manual",
      });

      results.push({
        ok: response.ok,
        status: response.ok ? "ok" : "error",
        upstream: upstream.label,
        upstreamUrl: healthUrl,
        apiKeyPreview: upstream.apiKey ? `${String(upstream.apiKey).slice(0, 4)}****${String(upstream.apiKey).slice(-4)}` : "",
        statusCode: response.status,
        message: response.ok ? "模型服务可连接" : `模型服务返回 ${response.status}`,
        suggestion: response.ok ? "模型服务通道正常。" : getUpstreamSuggestion(response.status),
        errorKind: response.status === 402 ? "UpstreamPaymentRequiredError" : "UpstreamError",
        paymentRequired: response.status === 402,
      });
    } catch (error) {
      results.push({
        ok: false,
        status: "error",
        upstream: upstream.label,
        upstreamUrl: healthUrl,
        apiKeyPreview: upstream.apiKey ? `${String(upstream.apiKey).slice(0, 4)}****${String(upstream.apiKey).slice(-4)}` : "",
        message: error.name === "AbortError" ? "模型服务检测超时" : "模型服务无法连接",
        suggestion: "请检查服务器网络、模型服务 Base URL、API Key 和证书配置。",
        errorKind: error.name === "AbortError" ? "TimeoutError" : "ConnectionError",
        paymentRequired: false,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  const primaryOk = results.find((item) => item.ok);
  return {
    ok: Boolean(primaryOk),
    status: primaryOk ? "ok" : "error",
    activeUpstream: primaryOk?.upstream || "",
    message: primaryOk ? `${primaryOk.upstream} 可用` : "所有模型服务都不可用",
    suggestion: primaryOk ? "至少一个模型服务通道正常，正式调用可继续使用。" : "请检查服务器网络、模型服务 Base URL、API Key 和证书配置。",
    upstreams: results,
  };
}

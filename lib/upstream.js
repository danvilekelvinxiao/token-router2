import { assertSafeUpstreamUrl } from "./safe-upstream-url";

export const API_ERROR_DOCS_URL = "/help#error-codes";

export function getUpstreamConfig() {
  return getUpstreamConfigs()[0] || null;
}

export function getUpstreamConfigs({ includeReviewOnly = false } = {}) {
  const newApiBase = process.env.NEW_API_BASE_URL || process.env.NEWAPI_BASE_URL || "";
  const newApiKey =
    process.env.NEW_API_KEY ||
    process.env.NEWAPI_API_KEY ||
    process.env.NEW_API_KEY_ALL_MODELS ||
    process.env.NEW_API_ADMIN_TOKEN ||
    "";
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openRouterBase = (process.env.OPENROUTER_API_BASE_URL || "https://openrouter.ai/api").replace(/\/+$/, "");
  const sub2apiBase = (
    process.env.SUB2API_API_BASE_URL ||
    process.env.SUB2API_BASE_URL ||
    process.env.SUB2API_INTERNAL_URL ||
    ""
  ).replace(/\/+$/, "");
  const sub2apiBackupBase = (
    process.env.AICARDS_API_BASE_URL ||
    process.env.AICARDS_BASE_URL ||
    ""
  ).replace(/\/+$/, "");
  const sub2apiApiKey = String(process.env.SUB2API_API_KEY || "").trim();
  const sub2apiBackupApiKey = String(process.env.AICARDS_API_KEY || "").trim();
  const sub2apiClaudeApiKey = String(
    process.env.SUB2API_CLAUDE_API_KEY ||
    process.env.AICARDS_API_KEY_CLAUDE ||
    process.env.AICARDS_CLAUDE_API_KEY ||
    process.env.SUB2API_API_KEY ||
    ""
  ).trim();
  const configs = [];

  function addOpenAICompatible({
    name,
    label,
    baseUrl,
    apiKey,
    healthPath = "/v1/models",
    chatPath = "/v1/chat/completions",
    responsesPath = "/v1/responses",
    healthAuth = true,
    includeAsDefaultCandidate = true,
    requiresAdminReview = false,
    supportsResponsesApi = false,
    supportsChatCompletionsApi = true,
  }) {
    const cleanBase = String(baseUrl || "").trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
    const cleanKey = String(apiKey || "").trim();
    if (!cleanBase || !cleanKey) return;
    if (requiresAdminReview && !includeReviewOnly) return;
    const chatCompletionsUrl = `${cleanBase}${chatPath.startsWith("/") ? chatPath : `/${chatPath}`}`;
    const responsesUrl = `${cleanBase}${responsesPath.startsWith("/") ? responsesPath : `/${responsesPath}`}`;
    configs.push({
      name,
      label,
      baseUrl: cleanBase,
      apiKey: cleanKey,
      upstreamUrl: chatCompletionsUrl,
      chatCompletionsUrl,
      responsesUrl,
      modelsUrl: `${cleanBase}${healthPath.startsWith("/") ? healthPath : `/${healthPath}`}`,
      healthUrl: `${cleanBase}${healthPath.startsWith("/") ? healthPath : `/${healthPath}`}`,
      healthAuth,
      includeAsDefaultCandidate,
      requiresAdminReview,
      supportsResponsesApi,
      supportsChatCompletionsApi,
    });
  }

  // Priority order: A=sub2api → B/C/D=new-api lines → X=openrouter (last resort)
  // sub2api MUST be first so it gets the lowest priority index (= highest routing priority)
  if (sub2apiBase && sub2apiApiKey) {
    configs.push({
      name: "sub2api",
      label: "FlowAPI 主线路",
      baseUrl: sub2apiBase,
      apiKey: sub2apiApiKey,
      upstreamUrl: `${sub2apiBase}/v1/chat/completions`,
      chatCompletionsUrl: `${sub2apiBase}/v1/chat/completions`,
      responsesUrl: `${sub2apiBase}/v1/responses`,
      modelsUrl: `${sub2apiBase}/v1/models`,
      healthUrl: `${sub2apiBase}/v1/models`,
      healthAuth: true,
      includeAsDefaultCandidate: true,
      requiresAdminReview: true,
      supportsResponsesApi: true,
      supportsChatCompletionsApi: true,
    });
  }

  if (sub2apiBackupBase && sub2apiBackupApiKey && sub2apiBackupBase !== sub2apiBase) {
    configs.push({
      name: "sub2api-backup",
      label: "FlowAPI 备线路",
      baseUrl: sub2apiBackupBase,
      apiKey: sub2apiBackupApiKey,
      upstreamUrl: `${sub2apiBackupBase}/v1/chat/completions`,
      chatCompletionsUrl: `${sub2apiBackupBase}/v1/chat/completions`,
      responsesUrl: `${sub2apiBackupBase}/v1/responses`,
      modelsUrl: `${sub2apiBackupBase}/v1/models`,
      healthUrl: `${sub2apiBackupBase}/v1/models`,
      healthAuth: true,
      includeAsDefaultCandidate: false,
      requiresAdminReview: true,
      supportsResponsesApi: true,
      supportsChatCompletionsApi: true,
    });
  }

  if (sub2apiBase && sub2apiClaudeApiKey) {
    configs.push({
      name: "sub2api-claude",
      label: "FlowAPI Claude 线路",
      baseUrl: sub2apiBase,
      apiKey: sub2apiClaudeApiKey,
      upstreamUrl: `${sub2apiBase}/v1/chat/completions`,
      chatCompletionsUrl: `${sub2apiBase}/v1/chat/completions`,
      responsesUrl: `${sub2apiBase}/v1/responses`,
      modelsUrl: `${sub2apiBase}/v1/models`,
      healthUrl: `${sub2apiBase}/v1/models`,
      healthAuth: true,
      includeAsDefaultCandidate: false,
      requiresAdminReview: true,
      supportsResponsesApi: true,
      supportsChatCompletionsApi: true,
    });
  }

  // new-api lines: B (primary), C (secondary), D (tertiary)
  if (newApiBase && newApiKey) {
    const baseUrl = newApiBase.replace(/\/+$/, "");
    configs.push({
      name: "new-api",
      label: "FlowAPI 模型线路",
      baseUrl,
      apiKey: newApiKey,
      upstreamUrl: `${baseUrl}/v1/chat/completions`,
      chatCompletionsUrl: `${baseUrl}/v1/chat/completions`,
      responsesUrl: `${baseUrl}/v1/responses`,
      modelsUrl: `${baseUrl}/v1/models`,
      healthUrl: `${baseUrl}/v1/models`,
      healthAuth: true,
      supportsResponsesApi: true,
      supportsChatCompletionsApi: true,
    });
  }

  // openrouter is ALWAYS last resort (X), never the default first route
  if (openRouterKey) {
    configs.push({
      name: "openrouter",
      label: "FlowAPI 兜底线路",
      baseUrl: openRouterBase,
      apiKey: openRouterKey,
      upstreamUrl: `${openRouterBase}/v1/chat/completions`,
      chatCompletionsUrl: `${openRouterBase}/v1/chat/completions`,
      responsesUrl: `${openRouterBase}/v1/responses`,
      modelsUrl: `${openRouterBase}/v1/models`,
      healthUrl: `${openRouterBase}/v1/models`,
      healthAuth: true,
      supportsResponsesApi: false,
      supportsChatCompletionsApi: true,
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
    name: "official-openai",
    label: "OpenAI 官方兜底",
    baseUrl: process.env.OPENAI_API_BASE_URL || process.env.OFFICIAL_OPENAI_API_BASE_URL || "https://api.openai.com",
    apiKey: process.env.OPENAI_API_KEY || process.env.OFFICIAL_OPENAI_API_KEY,
    supportsResponsesApi: true,
  });

  addOpenAICompatible({
    name: "official-deepseek",
    label: "DeepSeek 官方",
    baseUrl: process.env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY,
  });

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
  const type = String(upstream.type || "").toLowerCase();
  const baseUrl = normalizeBaseUrl(upstream.baseUrl || "");
  const rawText = `${upstream.name || ""} ${upstream.type || ""} ${upstream.remark || ""}`.toLowerCase();

  // aicards.shop is a backup/review line. Classify it before generic "sub2api"
  // text matching so an admin label like "sub2api backup" cannot steal A-line.
  if (baseUrl.includes("aicards.shop") || id.includes("aicards") || rawText.includes("aicards")) {
    if (id.includes("claude") || rawText.includes("claude")) return "sub2api-backup-claude";
    return "sub2api-backup";
  }

  if (baseUrl.includes("sub2api") || id.includes("sub2api") || rawText.includes("sub2api")) {
    if (id.includes("backup") || rawText.includes("backup") || rawText.includes("备用")) return "sub2api-backup";
    if (id.includes("claude") || rawText.includes("claude")) return "sub2api-claude";
    return "sub2api";
  }
  if (type.includes("new api") || type.includes("new-api") || id.includes("new-api") || id.includes("newapi")) return "new-api";
  if (baseUrl.includes("openrouter.ai") || id.includes("openrouter")) return "openrouter";
  if (id.includes("aheapi")) return "aheapi";
  if (id.includes("uniapi")) return "uniapi";
  return `admin-${String(upstream.id || upstream.name || "upstream").replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}`;
}

function adminUpstreamLabel(upstream = {}, name = "") {
  // All labels must be neutral — never expose upstream provider names to users
  if (name === "sub2api") return "FlowAPI 主线路";
  if (name === "sub2api-backup") return "FlowAPI 备线路";
  if (name === "sub2api-claude") return "FlowAPI Claude 线路";
  if (name === "sub2api-backup-claude") return "FlowAPI Claude 备线路";
  if (name === "new-api") return "FlowAPI 模型线路";
  if (name === "openrouter") return "FlowAPI 兜底线路";
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
        chatCompletionsUrl: `${baseUrl}/v1/chat/completions`,
        responsesUrl: `${baseUrl}/v1/responses`,
        modelsUrl: `${baseUrl}/v1/models`,
        healthUrl: `${baseUrl}/v1/models`,
        healthAuth: true,
        includeAsDefaultCandidate: !isReviewOnly,
        requiresAdminReview: isReviewOnly,
        adminConfigured: true,
        adminUpstreamId: item.id,
        supportsResponsesApi: Boolean(detail?.supportsResponsesApi ?? detail?.supports_responses_api ?? false),
        supportsChatCompletionsApi: detail?.supportsChatCompletionsApi ?? detail?.supports_chat_completions_api ?? true,
      });
    }

    return configs;
  } catch {
    return [];
  }
}

function mergeUpstreamConfigs(primary = [], secondary = []) {
  const merged = new Map();
  for (const item of [...primary, ...secondary]) {
    const key = `${normalizeBaseUrl(item.baseUrl)}:${item.name}`;
    if (!item.apiKey || !item.upstreamUrl) continue;
    if (!merged.has(key)) {
      merged.set(key, item);
      continue;
    }
    const existing = merged.get(key);
    // Env-configured runtime lines are authoritative for production routing.
    // Admin-saved lines can add fallbacks, but must not override env secrets/routes.
    if (existing.adminConfigured && !item.adminConfigured) merged.set(key, item);
  }
  return Array.from(merged.values());
}

export async function getUpstreamConfigsAsync({ includeReviewOnly = false } = {}) {
  const envConfigs = getUpstreamConfigs({ includeReviewOnly });
  const adminConfigs = await getAdminSavedUpstreamConfigs({ includeReviewOnly });
  let providerConfigs = [];
  try {
    const { listProviderUpstreamConfigs } = await import("./provider-store");
    providerConfigs = await listProviderUpstreamConfigs();
  } catch {
    providerConfigs = [];
  }
  return mergeUpstreamConfigs(envConfigs, [...adminConfigs, ...providerConfigs]);
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

export function getUpstreamSuggestion(status, endpointType = "chat_completions") {
  if (status === 401 || status === 403) {
    return "当前线路暂时不可用，请稍后重试或切换其他模型；你的 FlowAPI API Key 无需更换。";
  }
  if (status === 402) {
    return "当前线路额度不足，请稍后重试或联系管理员处理。";
  }
  if (status === 404) {
    return "请先确认模型名是否正确，或切换到帮助指南推荐模型重试。";
  }
  if (status === 429) {
    return "当前请求过于频繁，请稍后再试；如果持续出现，请切换其他模型。";
  }
  if (status >= 500) {
    return "当前模型服务繁忙，请稍后重试；紧急使用时建议切换其他模型。";
  }
  if (endpointType === "responses") {
    return "请求没有成功，请检查模型名、input 格式和 max_output_tokens 参数后重试。";
  }
  if (endpointType === "unknown") {
    return "请求没有成功，请检查模型名和请求参数后重试。";
  }
  return "请求没有成功，请检查模型名、messages 格式和 max_tokens 参数后重试。";
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

    try {
      const headers = { "Content-Type": "application/json" };
      if (upstream.healthAuth !== false && upstream.apiKey) {
        headers.Authorization = `Bearer ${upstream.apiKey}`;
      }

      const healthUrl = upstream.healthUrl || upstream.modelsUrl;
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
        statusCode: response.status,
        message: response.ok ? "模型服务可连接" : `模型服务返回 ${response.status}`,
        suggestion: response.ok ? "模型服务通道正常。" : getUpstreamSuggestion(response.status),
      });
    } catch (error) {
      results.push({
        ok: false,
        status: "error",
        upstream: upstream.label,
        message: error.name === "AbortError" ? "模型服务检测超时" : "模型服务无法连接",
        suggestion: "请检查服务器网络、模型服务 Base URL、API Key 和证书配置。",
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

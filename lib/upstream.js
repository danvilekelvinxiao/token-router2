import { assertSafeUpstreamUrl } from "./safe-upstream-url";
import { clearUpstreamFailure } from "./upstream-failure-state";
import { compareRouteCandidates, filterRouteCandidatesByPolicy, getRoutePolicyConfig } from "./route-policy";

export const API_ERROR_DOCS_URL = "/help#error-codes";

export function getUpstreamConfig() {
  return getUpstreamConfigs()[0] || null;
}

export function getUpstreamConfigs({ includeReviewOnly = false } = {}) {
  const newApiBase = process.env.NEW_API_BASE_URL;
  const newApiKey = String(
    process.env.NEW_API_KEY
    || process.env.NEW_API_KEY_ALL_MODELS
    || "",
  ).trim();
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openRouterBase = (process.env.OPENROUTER_API_BASE_URL || "https://openrouter.ai/api").replace(/\/+$/, "");
  const sub2ApiBase = (process.env.SUB2API_BASE_URL || process.env.SUB2API_INTERNAL_URL || "").replace(/\/+$/, "");
  const sub2ApiKey = String(process.env.SUB2API_API_KEY || process.env.SUB2API_KEY || "").trim();
  const aicardsBase = (process.env.AICARDS_API_BASE_URL || process.env.AICARDS_BASE_URL || "https://aicards.shop").replace(/\/+$/, "");
  const aicardsNonClaudeKey = String(
    process.env.AICARDS_API_KEY_NON_CLAUDE
    || process.env.AICARDS_API_KEY
    || process.env.AICARDS_DEFAULT_API_KEY
    || "",
  ).trim();
  const aicardsClaudeKey = String(
    process.env.AICARDS_API_KEY_CLAUDE
    || process.env.AICARDS_CLAUDE_API_KEY
    || "",
  ).trim();
  const configs = [];
  const tierPriority = {
    sub2api: 0,
    newApi: 1,
    aicards: 2,
    "aicards-claude": 2,
    aheapi: 2,
    backup: 2,
    uniapi: 3,
    "official-openai": 20,
    "official-deepseek": 21,
    "official-gemini": 22,
    "aliyun-bailian": 23,
    openrouter: 99,
  };

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
    family = "",
  }) {
    const cleanBase = String(baseUrl || "").trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
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
      family,
      priority: tierPriority[name] ?? 50,
    });
  }

  if (sub2ApiBase && sub2ApiKey) {
    const baseUrl = sub2ApiBase.replace(/\/+$/, "");
    configs.push({
      name: "sub2api",
      label: "Sub2API 自有号池",
      baseUrl,
      apiKey: sub2ApiKey,
      upstreamUrl: `${baseUrl}/v1/chat/completions`,
      modelsUrl: `${baseUrl}/v1/models`,
      healthUrl: `${baseUrl}/v1/chat/completions`,
      healthMethod: "POST",
      healthBody: {
        model: process.env.SUB2API_HEALTH_MODEL || "gpt-5.5",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      },
      healthAuth: true,
      priority: tierPriority.sub2api,
    });
  }

  if (newApiBase && newApiKey) {
    const baseUrl = newApiBase.replace(/\/+$/, "");
    configs.push({
      name: "new-api",
      label: "New API 正式实例",
      baseUrl,
      apiKey: newApiKey,
      upstreamUrl: `${baseUrl}/v1/chat/completions`,
      modelsUrl: `${baseUrl}/v1/models`,
      // Route selection should validate the runtime path that customers will actually use.
      // /api/status is admin-only on some deployments and would incorrectly mark a usable
      // runtime as unhealthy.
      healthUrl: `${baseUrl}/v1/models`,
      healthAuth: true,
      priority: tierPriority.newApi,
    });
  }

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
      priority: tierPriority.openrouter,
    });
  }

  addOpenAICompatible({
    name: "aheapi",
    label: "AHEAPI 高级通道",
    baseUrl: process.env.AHEAPI_API_BASE_URL,
    apiKey: process.env.AHEAPI_API_KEY,
    requiresAdminReview: false,
    includeAsDefaultCandidate: true,
    priority: tierPriority.aheapi,
  });

  addOpenAICompatible({
    name: "uniapi",
    label: "UniAPI 高级通道",
    baseUrl: process.env.UNIAPI_API_BASE_URL,
    apiKey: process.env.UNIAPI_API_KEY,
    requiresAdminReview: false,
    includeAsDefaultCandidate: true,
    priority: tierPriority.uniapi,
  });

  addOpenAICompatible({
    name: "aicards",
    label: "备用1",
    baseUrl: aicardsBase,
    apiKey: aicardsNonClaudeKey,
    includeAsDefaultCandidate: true,
    requiresAdminReview: false,
    priority: tierPriority.aicards,
    family: "non-claude",
  });

  addOpenAICompatible({
    name: "aicards-claude",
    label: "备用1 Claude",
    baseUrl: aicardsBase,
    apiKey: aicardsClaudeKey,
    includeAsDefaultCandidate: true,
    requiresAdminReview: false,
    priority: tierPriority.aicards,
    family: "claude",
  });

  addOpenAICompatible({
    name: "official-openai",
    label: "OpenAI 官方兜底",
    baseUrl: process.env.OPENAI_API_BASE_URL || process.env.OFFICIAL_OPENAI_API_BASE_URL || "https://api.openai.com",
    apiKey: process.env.OPENAI_API_KEY || process.env.OFFICIAL_OPENAI_API_KEY,
    includeAsDefaultCandidate: true,
    requiresAdminReview: false,
    priority: tierPriority["official-openai"],
  });

  addOpenAICompatible({
    name: "official-deepseek",
    label: "DeepSeek 官方",
    baseUrl: process.env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY,
    includeAsDefaultCandidate: true,
    requiresAdminReview: false,
    priority: tierPriority["official-deepseek"],
  });

  addOpenAICompatible({
    name: "official-gemini",
    label: "Gemini 兼容通道",
    baseUrl: process.env.GEMINI_OPENAI_API_BASE_URL,
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    includeAsDefaultCandidate: true,
    requiresAdminReview: false,
    priority: tierPriority["official-gemini"],
  });

  addOpenAICompatible({
    name: "aliyun-bailian",
    label: "阿里云百炼",
    baseUrl: process.env.ALIYUN_BAILIAN_API_BASE_URL,
    apiKey: process.env.ALIYUN_BAILIAN_API_KEY,
    includeAsDefaultCandidate: true,
    requiresAdminReview: false,
    priority: tierPriority["aliyun-bailian"],
  });

  return configs
    .filter((item) => item?.apiKey && item?.upstreamUrl)
    .sort((a, b) => {
      const pa = Number(a.priority ?? 50);
      const pb = Number(b.priority ?? 50);
      if (pa !== pb) return pa - pb;
      return String(a.label || a.name || "").localeCompare(String(b.label || b.name || ""), "zh-CN");
    });
}

function normalizeBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function upstreamNameFromAdminConfig(upstream = {}) {
  const id = String(upstream.id || upstream.name || "").toLowerCase();
  const type = String(upstream.type || "").toLowerCase();
  const baseUrl = normalizeBaseUrl(upstream.baseUrl || "");
  if (baseUrl.includes("aicards.shop") || id.includes("aicards")) return "aicards";
  if (id.includes("sub2api") || type.includes("sub2api") || baseUrl.includes("sub2api")) return "sub2api";
  if (type.includes("new api") || type.includes("new-api") || id.includes("new-api") || id.includes("newapi")) return "new-api";
  if (baseUrl.includes("uniapi.io") || id.includes("uniapi")) return "uniapi";
  if (baseUrl.includes("openrouter.ai") || id.includes("openrouter")) return "openrouter";
  if (id.includes("aheapi")) return "aheapi";
  return `admin-${String(upstream.id || upstream.name || "upstream").replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}`;
}

function adminUpstreamPriority(upstream = {}, name = "") {
  const haystack = [
    upstream.id,
    upstream.name,
    upstream.type,
    upstream.remark,
    upstream.baseUrl,
    name,
  ].filter(Boolean).join(" ").toLowerCase();

  if (haystack.includes("sub2api")) return 0;
  if (haystack.includes("new api") || haystack.includes("new-api") || haystack.includes("newapi")) return 1;
  if (haystack.includes("uniapi") || haystack.includes("uni api") || haystack.includes("uni-api")) return 3;
  if (haystack.includes("openrouter") || haystack.includes("bridge")) return 99;
  return 2;
}

function adminUpstreamLabel(upstream = {}, name = "") {
  if (name === "sub2api") return "Sub2API 自有号池";
  if (name === "new-api") return "New API 正式实例";
  if (name === "aicards" || name === "aheapi" || name === "backup") return "其他商业中转站";
  if (name === "uniapi") return "UniAPI";
  if (name === "openrouter") return "OpenRouter 备用";
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
      const priority = adminUpstreamPriority(detail || item, name);
      const isNewApi = name === "new-api";
      configs.push({
        name,
        label: adminUpstreamLabel(detail || item, name),
        baseUrl,
        apiKey,
        upstreamUrl: `${baseUrl}/v1/chat/completions`,
        modelsUrl: `${baseUrl}/v1/models`,
        healthUrl: isNewApi ? `${baseUrl}/api/status` : `${baseUrl}/v1/models`,
        healthAuth: true,
        includeAsDefaultCandidate: true,
        requiresAdminReview: false,
        adminConfigured: true,
        adminUpstreamId: item.id,
        priority,
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
    if (!existing.adminConfigured && item.adminConfigured) merged.set(key, item);
  }
  return Array.from(merged.values());
}

export async function getUpstreamConfigsAsync({ includeReviewOnly = false } = {}) {
  const envConfigs = getUpstreamConfigs({ includeReviewOnly });
  const adminConfigs = await getAdminSavedUpstreamConfigs({ includeReviewOnly });
  const routePolicy = await getRoutePolicyConfig().catch(() => null);
  const merged = mergeUpstreamConfigs(adminConfigs, envConfigs);
  const filtered = filterRouteCandidatesByPolicy(merged, routePolicy || undefined);
  return filtered.sort((a, b) => compareRouteCandidates(a, b, routePolicy || undefined));
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

  async function probeUpstreamHealth(upstream) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = { "Content-Type": "application/json" };
      if (upstream.healthAuth !== false && upstream.apiKey) {
        headers.Authorization = `Bearer ${upstream.apiKey}`;
        if (upstream.name === "new-api" || upstream.name === "sub2api") {
          headers["New-Api-User"] = "1";
        }
      }

      const candidates = [];
      const primaryHealthUrl = upstream.healthUrl || upstream.modelsUrl;
      if (primaryHealthUrl) {
        candidates.push({
          url: primaryHealthUrl,
          method: String(upstream.healthMethod || "GET").toUpperCase(),
          body: String(upstream.healthMethod || "GET").toUpperCase() === "POST" && upstream.healthBody
            ? JSON.stringify(upstream.healthBody)
            : undefined,
          label: "health",
        });
      }
      if (upstream.modelsUrl && upstream.modelsUrl !== primaryHealthUrl) {
        candidates.push({
          url: upstream.modelsUrl,
          method: "GET",
          body: undefined,
          label: "models",
        });
      }

      let lastResponse = null;
      let lastError = null;
      for (const candidate of candidates) {
        await assertSafeUpstreamUrl(candidate.url);
        try {
          const response = await fetch(candidate.url, {
            method: candidate.method,
            headers,
            body: candidate.body,
            signal: controller.signal,
            redirect: "manual",
          });
          lastResponse = { response, candidate };
          if (response.ok) {
            return {
              ok: true,
              status: "ok",
              upstream: upstream.label,
              statusCode: response.status,
              message: "模型服务可连接",
              suggestion: "模型服务通道正常。",
              upstreamKey: upstream.name || upstream.label || upstream.baseUrl,
              upstream,
            };
          }
        } catch (error) {
          lastError = error;
        }
      }

      const response = lastResponse?.response || null;
      const statusCode = response?.status || 0;
      return {
        ok: false,
        status: "error",
        upstream: upstream.label,
        statusCode,
        message: statusCode ? `模型服务返回 ${statusCode}` : (lastError?.name === "AbortError" ? "模型服务检测超时" : "模型服务无法连接"),
        suggestion: statusCode ? getUpstreamSuggestion(statusCode) : "请检查服务器网络、模型服务 Base URL、API Key 和证书配置。",
        upstreamKey: upstream.name || upstream.label || upstream.baseUrl,
        upstream,
      };
    } catch (error) {
      return {
        ok: false,
        status: "error",
        upstream: upstream.label,
        message: error.name === "AbortError" ? "模型服务检测超时" : "模型服务无法连接",
        suggestion: "请检查服务器网络、模型服务 Base URL、API Key 和证书配置。",
        upstreamKey: upstream.name || upstream.label || upstream.baseUrl,
        upstream,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  const results = await Promise.all(upstreams.map((upstream) => probeUpstreamHealth(upstream)));
  const unhealthy = new Set();
  for (const entry of results) {
    if (entry.ok) {
      clearUpstreamFailure(entry.upstream);
    } else {
      unhealthy.add(entry.upstreamKey);
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
    unhealthy: Array.from(unhealthy),
  };
}

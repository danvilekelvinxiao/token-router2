import { assertSafeUpstreamUrl } from "./safe-upstream-url";

export const API_ERROR_DOCS_URL = "/help#error-codes";

export function getUpstreamConfig() {
  return getUpstreamConfigs()[0] || null;
}

export function getUpstreamConfigs() {
  const newApiBase = process.env.NEW_API_BASE_URL;
  const newApiKey = process.env.NEW_API_KEY || process.env.NEW_API_ADMIN_TOKEN;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openRouterBase = (process.env.OPENROUTER_API_BASE_URL || "https://openrouter.ai/api").replace(/\/+$/, "");
  const configs = [];

  function addOpenAICompatible({ name, label, baseUrl, apiKey, healthPath = "/v1/models", chatPath = "/v1/chat/completions", healthAuth = true }) {
    const cleanBase = String(baseUrl || "").trim().replace(/\/+$/, "");
    const cleanKey = String(apiKey || "").trim();
    if (!cleanBase || !cleanKey) return;
    configs.push({
      name,
      label,
      baseUrl: cleanBase,
      apiKey: cleanKey,
      upstreamUrl: `${cleanBase}${chatPath.startsWith("/") ? chatPath : `/${chatPath}`}`,
      modelsUrl: `${cleanBase}${healthPath.startsWith("/") ? healthPath : `/${healthPath}`}`,
      healthUrl: `${cleanBase}${healthPath.startsWith("/") ? healthPath : `/${healthPath}`}`,
      healthAuth,
    });
  }

  if (newApiBase) {
    const baseUrl = newApiBase.replace(/\/+$/, "");
    configs.push({
      name: "new-api",
      label: "New API",
      baseUrl,
      apiKey: newApiKey,
      upstreamUrl: `${baseUrl}/v1/chat/completions`,
      modelsUrl: `${baseUrl}/v1/models`,
      healthUrl: `${baseUrl}/api/status`,
      healthAuth: false,
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
  const upstreams = getUpstreamConfigs();
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

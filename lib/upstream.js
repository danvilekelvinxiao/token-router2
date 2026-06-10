export const API_ERROR_DOCS_URL = "/help#error-codes";

export function getUpstreamConfig() {
  return getUpstreamConfigs()[0] || null;
}

export function getUpstreamConfigs() {
  const newApiBase = process.env.NEW_API_BASE_URL;
  const newApiKey = process.env.NEW_API_KEY || process.env.NEW_API_ADMIN_TOKEN;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const sub2apiBase = process.env.SUB2API_BASE_URL;
  const sub2apiKey = process.env.SUB2API_API_KEY;
  const configs = [];

  if (sub2apiBase && sub2apiKey) {
    const baseUrl = sub2apiBase.replace(/\/+$/, "");
    configs.push({
      name: "sub2api",
      label: "Sub2API",
      baseUrl,
      apiKey: sub2apiKey,
      upstreamUrl: `${baseUrl}/v1/chat/completions`,
      modelsUrl: `${baseUrl}/v1/models`,
      healthUrl: `${baseUrl}/v1/models`,
      healthAuth: true,
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
      baseUrl: "https://openrouter.ai/api",
      apiKey: openRouterKey,
      upstreamUrl: "https://openrouter.ai/api/v1/chat/completions",
      modelsUrl: "https://openrouter.ai/api/v1/models",
      healthUrl: "https://openrouter.ai/api/v1/models",
      healthAuth: true,
    });
  }

  return configs;
}

// ==================== 合规上游渠道池 ====================

// 上游渠道注册表：AHEAPI(1) > UniAPI(2) > OpenRouter(3) > Official(10)
// API Key 只存服务端环境变量，从不暴露给用户
const CHANNEL_REGISTRY = [
  {
    name: "AHEAPI",
    priority: 1,
    baseUrl: () => process.env.AHEAPI_BASE_URL,
    apiKey: () => process.env.AHEAPI_API_KEY,
  },
  {
    name: "UniAPI",
    priority: 2,
    baseUrl: () => process.env.UNIAPI_BASE_URL,
    apiKey: () => process.env.UNIAPI_API_KEY,
  },
  {
    name: "OpenRouter",
    priority: 3,
    baseUrl: () => "https://openrouter.ai/api/v1",
    apiKey: () => process.env.OPENROUTER_API_KEY,
  },
  {
    name: "Official-OpenAI",
    priority: 10,
    baseUrl: () => "https://api.openai.com/v1",
    apiKey: () => process.env.OPENAI_API_KEY,
  },
  {
    name: "Official-Anthropic",
    priority: 10,
    baseUrl: () => "https://api.anthropic.com/v1",
    apiKey: () => process.env.ANTHROPIC_API_KEY,
  },
  {
    name: "Official-Google",
    priority: 10,
    baseUrl: () => "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: () => process.env.GOOGLE_API_KEY,
  },
  {
    name: "Official-DeepSeek",
    priority: 10,
    baseUrl: () => "https://api.deepseek.com/v1",
    apiKey: () => process.env.DEEPSEEK_API_KEY,
  },
];

export function getChannel(name) {
  const def = CHANNEL_REGISTRY.find((c) => c.name === name);
  if (!def) return null;
  const apiKey = def.apiKey();
  const baseUrl = def.baseUrl();
  if (!apiKey || !baseUrl) return null;
  return { name: def.name, baseUrl, apiKey };
}

const PROFIT_MARGIN = Number(process.env.PROFIT_MARGIN_FACTOR || 1.2);

// 从上游链中选出满足利润保护的第一个可用渠道
// upstreamChain: Array<{ channel: string, actualModel: string, upstreamCostCny: number }>
// userPriceCny: 用户本次调用的预估费用
export function selectChannelFromChain(upstreamChain, userPriceCny) {
  for (const candidate of upstreamChain) {
    const ch = getChannel(candidate.channel);
    if (!ch) continue;
    const cost = Number(candidate.upstreamCostCny || 0);
    if (cost * PROFIT_MARGIN > userPriceCny) continue;
    return { ...ch, actualModel: candidate.actualModel, upstreamCostCny: cost };
  }
  return null;
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
    return "上游服务鉴权失败，请联系 FlowAPI 客服处理；你的 FlowAPI API 密匙不需要更换。";
  }
  if (status === 404) {
    return "上游接口地址或模型路径不存在，请先确认模型名是否正确，或切换到帮助指南推荐模型重试。";
  }
  if (status === 429) {
    return "上游服务繁忙或限流，请稍后重试；如果持续出现，请切换其他模型。";
  }
  if (status >= 500) {
    return "上游模型服务暂时不可用，请稍后重试；紧急使用时建议切换其他模型。";
  }
  return "请求没有成功，请检查模型名、messages 格式和 max_tokens 参数后重试。";
}

export async function checkUpstreamHealth({ timeoutMs = 5000 } = {}) {
  const upstreams = getUpstreamConfigs();
  if (upstreams.length === 0) {
    return {
      ok: false,
      status: "not_configured",
      message: "未配置上游 API",
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

      const response = await fetch(upstream.healthUrl || upstream.modelsUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      results.push({
        ok: response.ok,
        status: response.ok ? "ok" : "error",
        upstream: upstream.label,
        statusCode: response.status,
        message: response.ok ? "上游 API 可连接" : `上游 API 返回 ${response.status}`,
        suggestion: response.ok ? "上游通道正常。" : getUpstreamSuggestion(response.status),
      });
    } catch (error) {
      results.push({
        ok: false,
        status: "error",
        upstream: upstream.label,
        message: error.name === "AbortError" ? "上游 API 检测超时" : "上游 API 无法连接",
        suggestion: "请检查服务器网络、上游 Base URL、API 密匙和证书配置。",
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
    message: primaryOk ? `${primaryOk.upstream} 可用` : "所有上游 API 都不可用",
    suggestion: primaryOk ? "至少一个上游通道正常，正式调用可继续使用。" : "请检查服务器网络、上游 Base URL、API 密匙和证书配置。",
    upstreams: results,
  };
}

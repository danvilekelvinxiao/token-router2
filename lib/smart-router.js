import { MODEL_CATALOG, selectModelForPrompt, estimateCnyCost } from "./models";
import { listChannels, listRoutingRules, getRoutePolicyConfig } from "./admin-store";
import { getUpstreamConfigsAsync } from "./upstream";
import { hasDatabase, query } from "./db";
import { CACHE_TTLS, getCacheManager, hashCacheKey, invalidateRouteCaches } from "./cache-manager";
import { listModelProductsWithConfig } from "./model-products-server";
import { assertSafeUpstreamUrl } from "./safe-upstream-url";
import { dedupeUpstreamCandidates, normalizeUpstreamIdentity } from "./upstream-route-utils.mjs";

// ==================== Strategy Types ====================

export const STRATEGY = {
  WEIGHTED: "按权重分配",
  LOWEST_COST: "最低成本优先",
  LOWEST_LATENCY: "最低延迟优先",
  FAILOVER: "失败自动切换",
  AUTO: "智能自动选择",
  COST_FIRST: "cost_first",
  LATENCY_FIRST: "latency_first",
  QUALITY_FIRST: "quality_first",
  STABILITY_FIRST: "stability_first",
  BALANCED: "balanced",
};

export const ROUTE_STRATEGY_WEIGHTS = {
  cost_first: { cost: 0.62, latency: 0.18, availability: 0.12, quality: 0.08 },
  latency_first: { cost: 0.22, latency: 0.52, availability: 0.16, quality: 0.10 },
  quality_first: { cost: 0.18, latency: 0.20, availability: 0.17, quality: 0.45 },
  stability_first: { cost: 0.20, latency: 0.20, availability: 0.48, quality: 0.12 },
  balanced: { cost: 0.45, latency: 0.30, availability: 0.15, quality: 0.10 },
};

// ==================== Health Cache ====================

const healthCache = new Map();

export async function getUpstreamHealth(upstream, { ttlMs = CACHE_TTLS.upstreamHealth } = {}) {
  const cacheKey = upstream.name || upstream.upstreamUrl;
  const cached = healthCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ttlMs) return cached.data;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const headers = { "Content-Type": "application/json" };
    if (upstream.healthAuth !== false && upstream.apiKey) {
      headers.Authorization = `Bearer ${upstream.apiKey}`;
    }

    const healthUrl = upstream.healthUrl || upstream.modelsUrl;
    await assertSafeUpstreamUrl(healthUrl);
    const start = Date.now();
    const response = await fetch(healthUrl, {
      method: "GET", headers, signal: controller.signal,
    });
    const latency = Date.now() - start;

    const data = {
      ok: response.ok,
      status: response.ok ? "healthy" : "error",
      latency,
      statusCode: response.status,
    };

    healthCache.set(cacheKey, { ts: Date.now(), data });
    return data;
  } catch {
    const data = { ok: false, status: "unreachable", latency: Infinity, statusCode: 0 };
    healthCache.set(cacheKey, { ts: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export function clearHealthCache() {
  healthCache.clear();
}

// ==================== Task Detection ====================

const TASK_PATTERNS = [
  { task: "coding", label: "编程开发", keywords: ["代码", "编程", "bug", "函数", "算法", "实现", "写一个", "帮我写", "debug", "function", "code", "python", "javascript", "react", "vue", "api", "接口", "数据库", "sql", "重构", "优化这段代码"] },
  { task: "writing", label: "文案写作", keywords: ["写一篇", "文案", "文章", "小红书", "抖音", "公众号", "标题", "种草", "口播", "脚本", "改写", "润色", "总结一下", "翻译", "邮件", "通知", "报告"] },
  { task: "analysis", label: "分析推理", keywords: ["分析", "方案", "战略", "评估", "对比", "优劣", "优缺点", "建议", "报告", "研究", "调研", "规划", "计划", "策略"] },
  { task: "chat", label: "对话闲聊", keywords: ["你好", "怎么样", "什么是", "解释", "为什么", "如何", "教我", "介绍一下", "推荐", "聊聊"] },
  { task: "math", label: "数学计算", keywords: ["计算", "公式", "数学", "求解", "方程", "推导", "证明", "概率", "统计"] },
];

function detectTaskType(prompt) {
  const text = prompt.toLowerCase();
  const scores = TASK_PATTERNS.map((t) => {
    let score = 0;
    for (const kw of t.keywords) {
      if (text.includes(kw.toLowerCase())) score += 1;
    }
    return { ...t, score };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores[0].score > 0 ? scores[0] : { task: "general", label: "通用", score: 0 };
}

// ==================== Enhanced Model Selection ====================

const TASK_MODEL_PREFERENCE = {
  coding: ["deepseek-reasoner", "gpt4o-mini", "deepseek-chat"],
  writing: ["deepseek-chat", "qwen", "gpt4o-mini"],
  analysis: ["gpt4o-mini", "claude-haiku", "deepseek-reasoner"],
  chat: ["deepseek-chat", "qwen", "gpt4o-mini"],
  math: ["deepseek-reasoner", "gpt4o-mini", "claude-haiku"],
  general: ["deepseek-chat", "qwen", "gpt4o-mini"],
};

export function smartSelectModel(prompt = "", { preferLowCost = false, taskHint = null } = {}) {
  if (!prompt || prompt.length < 2) return MODEL_CATALOG[0];

  const text = prompt.toLowerCase();
  const task = taskHint || detectTaskType(prompt);

  // Token budget estimation
  const estimatedTokens = Math.ceil(text.length / 2);

  const ranked = MODEL_CATALOG.map((model) => {
    // Keyword match score
    const keywordScore = model.routeKeywords.reduce((score, kw) => {
      return text.includes(kw.toLowerCase()) ? score + 8 : score;
    }, 0);

    // Task preference score
    const taskPref = TASK_MODEL_PREFERENCE[task.task] || TASK_MODEL_PREFERENCE.general;
    const taskRank = taskPref.indexOf(model.key);
    const taskScore = taskRank >= 0 ? (taskPref.length - taskRank) * 5 : 0;

    // Cost efficiency score (higher for cheaper models)
    const costPer1K = (model.inputPrice + model.outputPrice) * 7.2 / 1000;
    const costScore = preferLowCost ? Math.max(0, 20 - costPer1K * 100) : 5;

    // Quality score normalized
    const qualityScore = model.quality / 5;

    // For small prompts, prefer cheaper models
    const smallPromptBonus = estimatedTokens < 500 ? 10 : 0;

    const totalScore = keywordScore + taskScore + costScore + qualityScore + smallPromptBonus;

    return {
      ...model,
      keywordScore,
      taskScore,
      costScore,
      qualityScore,
      totalScore: Math.round(totalScore),
      detectedTask: task.label,
    };
  });

  ranked.sort((a, b) => b.totalScore - a.totalScore);

  // If there's a clear task-relevant model, prefer it
  const keywordMatch = ranked.find((m) => m.keywordScore > 0);
  if (keywordMatch) return keywordMatch;

  return ranked[0];
}

// ==================== Smart Routing Engine ====================

export async function loadRoutingConfig() {
  const rules = await listRoutingRules();
  return {
    rules: rules.filter((r) => r.enabled),
    strategiesAvailable: Object.values(STRATEGY),
  };
}

function clampScore(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, number));
}

function normalizeRouteStrategy(strategy = STRATEGY.AUTO) {
  const raw = String(strategy || "").trim();
  if (raw === STRATEGY.LOWEST_COST || raw === "最低成本优先") return "cost_first";
  if (raw === STRATEGY.LOWEST_LATENCY || raw === "最低延迟优先") return "latency_first";
  if (raw === STRATEGY.FAILOVER || raw === "失败自动切换") return "stability_first";
  if (raw === "quality_first") return "quality_first";
  if (raw === "stability_first") return "stability_first";
  if (raw === "cost_first") return "cost_first";
  if (raw === "latency_first") return "latency_first";
  return "balanced";
}

function modelMatchesChannel(channel = {}, modelId = "") {
  const normalized = String(modelId || "").toLowerCase();
  const models = Array.isArray(channel.models) ? channel.models : String(channel.models || "").split(",");
  if (!models.filter(Boolean).length) return true;
  return models.some((model) => {
    const item = String(model || "").toLowerCase().trim();
    return item && (normalized.includes(item) || item.includes(normalized));
  });
}

function normalizeBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

function upstreamForChannel(channel = {}, upstreams = []) {
  const baseUrl = normalizeBaseUrl(channel.baseUrl || channel.base_url);
  const provider = String(channel.provider || channel.provider_name || channel.name || "").toLowerCase();
  const name = String(channel.name || channel.channelName || channel.channel_name || "").toLowerCase();
  return upstreams.find((upstream) => {
    const upstreamBase = normalizeBaseUrl(upstream.baseUrl);
    return (
      (baseUrl && upstreamBase && baseUrl === upstreamBase) ||
      provider.includes(upstream.name) ||
      upstream.name.includes(provider) ||
      name.includes(upstream.name) ||
      String(upstream.label || "").toLowerCase().includes(name)
    );
  }) || null;
}

function normalizeChannelCandidate(channel = {}, upstream = null, modelProduct = null) {
  const pricing = modelProduct?.pricing || {};
  const channelName = channel.channel_name || channel.channelName || channel.name || upstream?.name || "upstream";
  const providerName = channel.provider_name || channel.provider || upstream?.label || channelName;
  const baseUrl = normalizeBaseUrl(channel.base_url || channel.baseUrl || upstream?.baseUrl);
  const apiPath = String(channel.apiPath || channel.path || "/v1/chat/completions");
  const upstreamUrl = upstream?.upstreamUrl || (baseUrl ? `${baseUrl}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}` : "");
  return {
    id: channel.id || upstream?.name || channelName,
    name: upstream?.name || channel.name || channelName,
    providerName,
    channelName,
    groupName: channel.group_name || channel.group || channel.groupName || "",
    upstreamName: upstream?.name || channel.name || channelName,
    label: upstream?.label || channelName,
    baseUrl,
    upstreamUrl,
    modelsUrl: upstream?.modelsUrl || (baseUrl ? `${baseUrl}/v1/models` : ""),
    healthUrl: upstream?.healthUrl || (baseUrl ? `${baseUrl}/v1/models` : ""),
    healthAuth: upstream?.healthAuth,
    apiKey: upstream?.apiKey || channel.apiKey || "",
    actualModelId: channel.actual_model_id || channel.actualModelId || modelProduct?.actualModelId || "",
    publicModelId: channel.public_model_id || channel.publicModelId || modelProduct?.publicModelId || modelProduct?.id || "",
    inputCostPerMillion: Number(channel.input_cost_per_million ?? channel.costInput ?? pricing.inputCostPerMTokens ?? 0),
    outputCostPerMillion: Number(channel.output_cost_per_million ?? channel.costOutput ?? pricing.outputCostPerMTokens ?? 0),
    currency: channel.currency || "CNY",
    priority: Number(channel.priority ?? 10),
    qualityScore: clampScore(channel.quality_score ?? channel.qualityScore ?? 80, 80),
    routeStrategy: normalizeRouteStrategy(channel.route_strategy || channel.routeStrategy || "balanced"),
    isEnabled: channel.is_enabled !== false && channel.enabled !== false && channel.status !== "disabled",
    successRate: Number(channel.success_rate ?? channel.successRate ?? 0),
    avgLatencyMs: Number(channel.avg_latency_ms ?? channel.avgLatencyMs ?? 0),
    avgFirstTokenMs: Number(channel.avg_first_token_ms ?? channel.avgFirstTokenMs ?? 0),
    p95LatencyMs: Number(channel.p95_latency_ms ?? channel.p95LatencyMs ?? 0),
    raw: channel,
  };
}

function hydrateCandidateSecrets(candidate = {}, upstreams = []) {
  const upstream = upstreamForChannel(candidate, upstreams);
  if (!upstream) return { ...candidate, apiKey: "" };
  return {
    ...candidate,
    name: upstream.name || candidate.name,
    upstreamName: upstream.name || candidate.upstreamName,
    label: upstream.label || candidate.label,
    apiKey: upstream.apiKey || candidate.apiKey || "",
    upstreamUrl: candidate.upstreamUrl || upstream.upstreamUrl,
    modelsUrl: candidate.modelsUrl || upstream.modelsUrl,
    healthUrl: candidate.healthUrl || upstream.healthUrl,
    healthAuth: upstream.healthAuth ?? candidate.healthAuth,
  };
}

async function loadDatabaseChannels({ publicModelId = "", actualModelId = "", includeDisabled = false } = {}) {
  if (!hasDatabase()) return [];
  try {
    const result = await query(
      `SELECT * FROM upstream_channels
       WHERE ($3::boolean = true OR is_enabled = true)
         AND (
           public_model_id = $1
           OR actual_model_id = $2
           OR public_model_id = ''
           OR actual_model_id = ''
         )
       ORDER BY priority ASC, updated_at DESC
       LIMIT 80`,
      [publicModelId || "", actualModelId || "", Boolean(includeDisabled)]
    );
    return result?.rows || [];
  } catch {
    return [];
  }
}

async function loadRouteMetrics({ publicModelId = "", actualModelId = "" } = {}) {
  if (!hasDatabase()) return new Map();
  try {
    const result = await query(
      `SELECT
         COALESCE(NULLIF(upstream_channel, ''), NULLIF(upstream_provider, ''), 'unknown') AS channel_key,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status >= 200 AND status < 300) AS success,
         COALESCE(AVG(NULLIF(latency_ms, 0)), 0) AS avg_latency_ms,
         COALESCE(AVG(NULLIF(first_token_ms, 0)), 0) AS avg_first_token_ms,
         COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY NULLIF(latency_ms, 0)), 0) AS p95_latency_ms
       FROM calls
       WHERE created_at >= NOW() - INTERVAL '7 days'
         AND ($1 = '' OR public_model_id = $1 OR actual_model_id = $2)
       GROUP BY 1`,
      [publicModelId || "", actualModelId || ""]
    );
    return new Map((result?.rows || []).map((row) => [
      String(row.channel_key || "").toLowerCase(),
      {
        total: Number(row.total || 0),
        success: Number(row.success || 0),
        successRate: Number(row.total || 0) > 0 ? Number(row.success || 0) / Number(row.total || 1) : 0,
        avgLatencyMs: Number(row.avg_latency_ms || 0),
        avgFirstTokenMs: Number(row.avg_first_token_ms || 0),
        p95LatencyMs: Number(row.p95_latency_ms || 0),
      },
    ]));
  } catch {
    return new Map();
  }
}

function estimateCandidateUpstreamCost(candidate, usageEstimate = {}) {
  const inputTokens = Math.max(0, Number(usageEstimate.prompt_tokens || usageEstimate.inputTokens || 0));
  const outputTokens = Math.max(0, Number(usageEstimate.completion_tokens || usageEstimate.outputTokens || 0));
  return Number((((inputTokens / 1_000_000) * Math.max(0, candidate.inputCostPerMillion)) + ((outputTokens / 1_000_000) * Math.max(0, candidate.outputCostPerMillion))).toFixed(6));
}

function estimateProductUserCharge(modelProduct = {}, usageEstimate = {}) {
  const pricing = modelProduct?.pricing || {};
  const inputPrice = Number(pricing.inputSellPricePerMTokens ?? modelProduct.inputPricePerM ?? modelProduct.flowapiInputPricePerM ?? 0);
  const outputPrice = Number(pricing.outputSellPricePerMTokens ?? modelProduct.outputPricePerM ?? modelProduct.flowapiOutputPricePerM ?? 0);
  const inputTokens = Math.max(0, Number(usageEstimate.prompt_tokens || usageEstimate.inputTokens || 0));
  const outputTokens = Math.max(0, Number(usageEstimate.completion_tokens || usageEstimate.outputTokens || 0));
  if (!Number.isFinite(inputPrice + outputPrice) || inputPrice + outputPrice <= 0) return 0;
  return Number((((inputTokens / 1_000_000) * inputPrice) + ((outputTokens / 1_000_000) * outputPrice)).toFixed(6));
}

function upstreamTierName(candidate = {}) {
  const name = String(candidate.name || candidate.upstreamName || candidate.channelName || candidate.providerName || "").toLowerCase();
  const label = String(candidate.label || "").toLowerCase();
  const text = `${name} ${label}`;
  if (text.includes("sub2api") || text.includes("default")) return "sub2api";
  if (text.includes("new-api") || text.includes("newapi")) return "newApi";
  if (text.includes("openrouter")) return "openrouter";
  if (text.includes("openai official") || text.includes("official-openai") || text.includes("api.openai.com")) return "openai";
  if (text.includes("aicards") || text.includes("backup") || (text.includes("备用") && !text.includes("openrouter"))) return "backup";
  if (text.includes("uniapi")) return "uniapi";
  return "backup";
}

function orderCandidatesByRoutePolicy(candidates = [], fallbackOrder = []) {
  const order = Array.isArray(fallbackOrder) && fallbackOrder.length ? fallbackOrder : ["sub2api", "newApi", "backup", "openai", "uniapi", "openrouter"];
  const orderIndex = new Map(order.map((tier, index) => [tier, index]));
  return [...candidates].sort((a, b) => {
    const tierA = upstreamTierName(a);
    const tierB = upstreamTierName(b);
    const rankA = orderIndex.has(tierA) ? orderIndex.get(tierA) : order.length;
    const rankB = orderIndex.has(tierB) ? orderIndex.get(tierB) : order.length;
    return rankA - rankB || b.score - a.score || a.priority - b.priority;
  });
}

function scoreCandidates(candidates = [], healthMap = new Map(), { strategy = "balanced", usageEstimate = {} } = {}) {
  const maxCost = Math.max(0.000001, ...candidates.map((candidate) => estimateCandidateUpstreamCost(candidate, usageEstimate)));
  const maxLatency = Math.max(1, ...candidates.map((candidate) => {
    const health = healthMap.get(candidate.id) || {};
    return Number(candidate.avgFirstTokenMs || candidate.avgLatencyMs || health.latency || 2500);
  }));
  const weights = ROUTE_STRATEGY_WEIGHTS[normalizeRouteStrategy(strategy)] || ROUTE_STRATEGY_WEIGHTS.balanced;

  return candidates.map((candidate) => {
    const health = healthMap.get(candidate.id) || {};
    const upstreamCost = estimateCandidateUpstreamCost(candidate, usageEstimate);
    const observedLatency = Number(candidate.avgFirstTokenMs || candidate.avgLatencyMs || health.latency || 2500);
    const observedSuccessRate = Number(candidate.successRate || (health.ok ? 0.98 : 0.1));
    const costScore = clampScore(100 - (upstreamCost / maxCost) * 100 + 20, upstreamCost > 0 ? 50 : 70);
    const latencyScore = clampScore(100 - (observedLatency / maxLatency) * 100 + 20, 50);
    const availabilityScore = clampScore(observedSuccessRate * 100, health.ok ? 90 : 30);
    const qualityScore = clampScore(candidate.qualityScore, 80);
    const score = (
      weights.cost * costScore +
      weights.latency * latencyScore +
      weights.availability * availabilityScore +
      weights.quality * qualityScore
    ) - Math.max(0, candidate.priority - 1) * 0.5;

    return {
      ...candidate,
      score: Number(score.toFixed(3)),
      scoreBreakdown: {
        costScore: Number(costScore.toFixed(2)),
        latencyScore: Number(latencyScore.toFixed(2)),
        availabilityScore: Number(availabilityScore.toFixed(2)),
        qualityScore: Number(qualityScore.toFixed(2)),
        weights,
      },
      estimatedUpstreamCost: upstreamCost,
      health,
    };
  }).sort((a, b) => {
    return b.score - a.score || a.priority - b.priority;
  });
}

function sanitizeRoutePreviewCandidate(candidate = {}) {
  if (!candidate) return null;
  return {
    id: candidate.id || "",
    name: candidate.name || "",
    label: candidate.label || candidate.channelName || "FlowAPI 模型服务",
    channelName: candidate.channelName || candidate.label || "FlowAPI 模型服务",
    providerName: candidate.providerName || "FlowAPI",
    publicModelId: candidate.publicModelId || "",
    actualModelId: candidate.actualModelId ? "configured" : "",
    priority: candidate.priority,
    qualityScore: candidate.qualityScore,
    routeStrategy: candidate.routeStrategy,
    isEnabled: candidate.isEnabled,
    successRate: candidate.successRate,
    avgLatencyMs: candidate.avgLatencyMs,
    avgFirstTokenMs: candidate.avgFirstTokenMs,
    p95LatencyMs: candidate.p95LatencyMs,
    score: candidate.score,
    scoreBreakdown: candidate.scoreBreakdown,
    estimatedUpstreamCost: candidate.estimatedUpstreamCost,
    health: candidate.health ? {
      ok: candidate.health.ok,
      status: candidate.health.status,
      latency: candidate.health.latency,
      statusCode: candidate.health.statusCode,
    } : undefined,
  };
}

function sanitizeRoutePreviewDecision(decision = {}) {
  return {
    ...decision,
    upstream: sanitizeRoutePreviewCandidate(decision.upstream),
    channel: sanitizeRoutePreviewCandidate(decision.channel),
    fallbackChain: Array.isArray(decision.fallbackChain)
      ? decision.fallbackChain.map(sanitizeRoutePreviewCandidate).filter(Boolean)
      : [],
    candidates: Array.isArray(decision.candidates)
      ? decision.candidates.map(sanitizeRoutePreviewCandidate).filter(Boolean)
      : undefined,
  };
}

export async function getRouteCandidates({
  publicModelId = "",
  actualModelId = "",
  modelProduct = null,
  includeDisabled = false,
} = {}) {
  const cache = getCacheManager();
  const cacheKey = `${publicModelId || "any"}:${actualModelId || "any"}:${includeDisabled ? "all" : "enabled"}`;
  const cached = cache.get("routeCandidates", cacheKey);
  const upstreams = await getUpstreamConfigsAsync({ includeReviewOnly: true });
  if (cached) return cached.map((candidate) => hydrateCandidateSecrets(candidate, upstreams));
  const dbChannels = await loadDatabaseChannels({ publicModelId, actualModelId, includeDisabled });
  const dbCandidates = dbChannels.map((channel) => normalizeChannelCandidate(channel, upstreamForChannel(channel, upstreams), modelProduct));

  let adminChannels = [];
  try { adminChannels = await listChannels(); } catch { adminChannels = []; }
  const adminCandidates = adminChannels
    .filter((channel) => includeDisabled || channel.status === "active")
    .filter((channel) => modelMatchesChannel(channel, publicModelId || actualModelId))
    .map((channel) => normalizeChannelCandidate(channel, upstreamForChannel(channel, upstreams), modelProduct));

  const upstreamCandidates = upstreams
    .filter((upstream) => upstream.includeAsDefaultCandidate !== false)
    .map((upstream, index) => normalizeChannelCandidate({
      id: upstream.name,
      name: upstream.label || upstream.name,
      provider: upstream.name,
      priority: index + 10,
    }, upstream, modelProduct));

  const deduped = new Map();
  [...dbCandidates, ...adminCandidates, ...upstreamCandidates].forEach((candidate) => {
    if (!candidate.upstreamUrl) return;
    if (!includeDisabled && !candidate.isEnabled) return;
    const key = normalizeUpstreamIdentity(candidate);
    if (!deduped.has(key)) deduped.set(key, candidate);
  });

  const candidates = Array.from(deduped.values());
  cache.set("routeCandidates", cacheKey, candidates, CACHE_TTLS.routeCandidates);
  return candidates.map((candidate) => hydrateCandidateSecrets(candidate, upstreams));
}

export async function selectUpstream({
  modelId,
  strategy = STRATEGY.AUTO,
  preferredChannelId = null,
  publicModelId = "",
  modelProduct = null,
  usageEstimate = {},
  userChargeEstimate = 0,
} = {}) {
  const upstreams = await getUpstreamConfigsAsync({ includeReviewOnly: true });
  if (upstreams.length === 0) return { upstream: null, reason: "no_upstreams" };
  const routePolicy = await getRoutePolicyConfig().catch(() => null);
  const effectivePublicModelId = publicModelId || modelProduct?.publicModelId || modelId || "";
  const effectiveActualModelId = modelProduct?.actualModelId || modelId || "";
  const activeStrategy = normalizeRouteStrategy(modelProduct?.routeStrategy || modelProduct?.route_strategy || strategy);
  const decisionCacheKey = hashCacheKey(JSON.stringify({
    modelId,
    effectivePublicModelId,
    effectiveActualModelId,
    activeStrategy,
    usageEstimate,
    userChargeEstimate: Number(userChargeEstimate || 0).toFixed(6),
    preferredChannelId,
  }));
  const routeDecisionCacheKey = `${effectivePublicModelId || "any"}:${decisionCacheKey}`;
  const cache = getCacheManager();
  const cachedDecision = cache.get("routeDecision", routeDecisionCacheKey);
  if (cachedDecision) {
    const rehydratedCandidates = (cachedDecision.candidates || []).map((candidate) => hydrateCandidateSecrets(candidate, upstreams));
    const rehydratedFallback = (cachedDecision.fallbackChain || []).map((candidate) => hydrateCandidateSecrets(candidate, upstreams));
    const selected = cachedDecision.upstream
      ? hydrateCandidateSecrets(cachedDecision.upstream, upstreams)
      : rehydratedFallback[0] || rehydratedCandidates[0] || null;
    return {
      ...cachedDecision,
      upstream: selected,
      channel: selected,
      candidates: rehydratedCandidates,
      fallbackChain: rehydratedFallback.length ? rehydratedFallback : rehydratedCandidates,
    };
  }

  const candidates = await getRouteCandidates({
    publicModelId: effectivePublicModelId,
    actualModelId: effectiveActualModelId,
    modelProduct,
  });

  if (preferredChannelId) {
    const preferred = candidates.find((c) => c.id === preferredChannelId);
    if (preferred) {
      const fallbackChain = dedupeUpstreamCandidates([preferred, ...candidates.filter((candidate) => candidate.id !== preferred.id)]);
      const decision = {
        upstream: preferred,
        channel: preferred,
        strategy: "preferred_channel",
        reason: `使用指定渠道: ${preferred.channelName}`,
        candidates,
        fallbackChain,
      };
      cache.set("routeDecision", routeDecisionCacheKey, decision, CACHE_TTLS.routeDecision);
      return decision;
    }
  }

  if (!candidates.length) {
    const defaultUpstreams = upstreams.filter((upstream) => upstream.includeAsDefaultCandidate !== false);
    return {
      upstream: defaultUpstreams[0] || null,
      strategy: activeStrategy,
      reason: "未找到已启用候选渠道，使用默认上游",
      candidates: [],
      fallbackChain: defaultUpstreams,
    };
  }

  const healthPairs = await Promise.all(candidates.map(async (candidate) => [candidate.id, await getUpstreamHealth(candidate).catch(() => ({ ok: false, latency: Infinity }))]));
  const healthMap = new Map(healthPairs);
  const metrics = await loadRouteMetrics({ publicModelId: effectivePublicModelId, actualModelId: effectiveActualModelId });
  const withMetrics = candidates.map((candidate) => {
    const metric = metrics.get(String(candidate.upstreamName || candidate.channelName || "").toLowerCase())
      || metrics.get(String(candidate.channelName || "").toLowerCase())
      || metrics.get(String(candidate.providerName || "").toLowerCase())
      || {};
    return {
      ...candidate,
      successRate: metric.successRate || candidate.successRate,
      avgLatencyMs: metric.avgLatencyMs || candidate.avgLatencyMs,
      avgFirstTokenMs: metric.avgFirstTokenMs || candidate.avgFirstTokenMs,
      p95LatencyMs: metric.p95LatencyMs || candidate.p95LatencyMs,
    };
  });

  const scored = scoreCandidates(withMetrics, healthMap, {
    strategy: activeStrategy,
    usageEstimate,
  });
  const ordered = orderCandidatesByRoutePolicy(scored, routePolicy?.fallbackOrder || []);

  const decision = {
    upstream: ordered[0],
    channel: ordered[0],
    strategy: activeStrategy,
    reason: `智能选择 ${ordered[0].channelName}：综合评分 ${ordered[0].score}`,
    candidates: ordered,
    fallbackChain: dedupeUpstreamCandidates(ordered),
  };
  cache.set("routeDecision", routeDecisionCacheKey, decision, CACHE_TTLS.routeDecision);
  return decision;
}

export async function listRouteMatrix() {
  const cache = getCacheManager();
  const cached = cache.get("adminStats", "route-matrix");
  if (cached) return cached;
  const products = await listModelProductsWithConfig({ includeUnavailable: true }).catch(() => []);
  const rows = await Promise.all(products
    .filter((product) => product.publicModelId || product.id)
    .map(async (product) => {
      try {
        const candidates = await getRouteCandidates({
          publicModelId: product.publicModelId || product.id,
          actualModelId: product.actualModelId || product.publicModelId || product.id,
          modelProduct: product,
          includeDisabled: true,
        });
        const scoredDecision = await selectUpstream({
          modelId: product.actualModelId || product.publicModelId || product.id,
          publicModelId: product.publicModelId || product.id,
          modelProduct: product,
          strategy: product.routeStrategy || "balanced",
          usageEstimate: { prompt_tokens: 1000, completion_tokens: 1000 },
          userChargeEstimate: estimateProductUserCharge(product, { prompt_tokens: 1000, completion_tokens: 1000 }),
        });
        return {
          publicModelId: product.publicModelId || product.id,
          displayName: product.displayName || product.publicModelId || product.id,
          actualModelId: product.actualModelId || "",
          provider: product.provider || "FlowAPI",
          routeStrategy: normalizeRouteStrategy(product.routeStrategy || "balanced"),
          selectedChannel: scoredDecision.channel?.channelName || "",
          selectedReason: scoredDecision.reason || "",
          candidates: (scoredDecision.candidates?.length ? scoredDecision.candidates : candidates).map((candidate) => ({
            id: candidate.id,
            providerName: candidate.providerName,
            channelName: candidate.channelName,
            groupName: candidate.groupName,
            inputCostPerMillion: candidate.inputCostPerMillion,
            outputCostPerMillion: candidate.outputCostPerMillion,
            priority: candidate.priority,
            qualityScore: candidate.qualityScore,
            routeStrategy: candidate.routeStrategy,
            isEnabled: candidate.isEnabled,
            successRate: candidate.successRate,
            avgLatencyMs: candidate.avgLatencyMs,
            avgFirstTokenMs: candidate.avgFirstTokenMs,
            p95LatencyMs: candidate.p95LatencyMs,
            score: candidate.score || 0,
            scoreBreakdown: candidate.scoreBreakdown || null,
            estimatedUpstreamCost: candidate.estimatedUpstreamCost || 0,
          })),
        };
      } catch (error) {
        return {
          publicModelId: product.publicModelId || product.id,
          displayName: product.displayName || product.publicModelId || product.id,
          actualModelId: product.actualModelId || "",
          provider: product.provider || "FlowAPI",
          routeStrategy: normalizeRouteStrategy(product.routeStrategy || "balanced"),
          selectedChannel: "",
          selectedReason: error?.message || "路由矩阵生成失败",
          candidates: [],
          error: true,
        };
      }
    }));
  cache.set("adminStats", "route-matrix", rows, CACHE_TTLS.adminStats);
  return rows;
}

export async function updateRouteChannel(id, updates = {}) {
  if (!id || !hasDatabase()) return null;
  const allowed = {
    isEnabled: "is_enabled",
    priority: "priority",
    qualityScore: "quality_score",
    routeStrategy: "route_strategy",
  };
  const sets = [];
  const values = [id];
  Object.entries(allowed).forEach(([inputKey, column]) => {
    if (updates[inputKey] === undefined) return;
    values.push(inputKey === "isEnabled" ? Boolean(updates[inputKey]) : updates[inputKey]);
    sets.push(`${column} = $${values.length}`);
  });
  if (!sets.length) return null;
  values.push(new Date());
  const result = await query(
    `UPDATE upstream_channels SET ${sets.join(", ")}, updated_at = $${values.length} WHERE id = $1 RETURNING *`,
    values
  );
  invalidateRouteCaches();
  return result?.rows?.[0] || null;
}

// ==================== Route Decision ====================

export async function makeRoutingDecision({
  prompt = "",
  modelId = null,
  strategy = STRATEGY.AUTO,
  preferLowCost = false,
} = {}) {
  const routingConfig = await loadRoutingConfig();

  // Step 1: Select model
  let selectedModel;
  if (modelId && modelId !== "auto") {
    selectedModel = MODEL_CATALOG.find((m) => m.modelId === modelId);
    if (!selectedModel) {
      return { error: "unsupported_model", modelId };
    }
  } else {
    selectedModel = smartSelectModel(prompt, { preferLowCost });
  }

  // Find admin rule for this path
  const matchingRule = routingConfig.rules.find(
    (r) => r.path === "/v1/chat/completions" || r.path === "/v1/*"
  );

  const activeStrategy = matchingRule?.strategy || strategy;

  // Step 2: Select upstream
  const upstreamDecision = sanitizeRoutePreviewDecision(await selectUpstream({
    modelId: selectedModel.modelId,
    strategy: activeStrategy,
  }));

  // Step 3: Build response
  const detectedTask = prompt ? smartSelectModel(prompt, { preferLowCost }).detectedTask : "manual";

  return {
    model: selectedModel,
    upstream: upstreamDecision.upstream,
    channel: upstreamDecision.channel || null,
    strategy: upstreamDecision.strategy,
    reason: upstreamDecision.reason,
    candidateModels: prompt
      ? MODEL_CATALOG.map((m) => {
          const result = smartSelectModel(prompt, { preferLowCost });
          return {
            key: m.key,
            name: m.name,
            modelId: m.modelId,
            estimatedCost: estimateCnyCost(m.modelId, { prompt_tokens: Math.ceil(prompt.length / 4), completion_tokens: 1024 }),
          };
        }).sort((a, b) => a.estimatedCost - b.estimatedCost)
      : [],
    fallbackChain: upstreamDecision.fallbackChain || [],
    detectedTask,
    adminRule: matchingRule || null,
  };
}

// ==================== API for route preview/testing ====================

export async function simulateRoute(prompt, modelId) {
  const start = Date.now();
  const decision = await makeRoutingDecision({ prompt, modelId, strategy: STRATEGY.AUTO });
  const elapsed = Date.now() - start;

  return {
    ...decision,
    simulationMs: elapsed,
    healthSummary: Array.isArray(decision.fallbackChain)
      ? decision.fallbackChain.map((u) => ({
        label: u.label,
        name: u.name,
      }))
      : [],
  };
}

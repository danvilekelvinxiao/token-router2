import { MODEL_CATALOG, selectModelForPrompt, estimateCnyCost } from "./models";
import { listChannels, listRoutingRules } from "./admin-store";
import { getUpstreamConfigs } from "./upstream";

// ==================== Strategy Types ====================

export const STRATEGY = {
  WEIGHTED: "按权重分配",
  LOWEST_COST: "最低成本优先",
  LOWEST_LATENCY: "最低延迟优先",
  FAILOVER: "失败自动切换",
  AUTO: "智能自动选择",
};

// ==================== Health Cache ====================

const healthCache = new Map();

export async function getUpstreamHealth(upstream, { ttlMs = 30000 } = {}) {
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

    const start = Date.now();
    const response = await fetch(upstream.healthUrl || upstream.modelsUrl, {
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

export async function selectUpstream({
  modelId,
  strategy = STRATEGY.AUTO,
  preferredChannelId = null,
} = {}) {
  const upstreams = getUpstreamConfigs();
  if (upstreams.length === 0) return { upstream: null, reason: "no_upstreams" };

  // Get admin channels for additional routing data
  let channels = [];
  try { channels = await listChannels(); } catch { channels = []; }
  const activeChannels = channels.filter((c) => c.status === "active");

  // If preferred channel specified, try to match
  if (preferredChannelId) {
    const preferred = activeChannels.find((c) => c.id === preferredChannelId);
    if (preferred) {
      return {
        upstream: upstreams[0],
        channel: preferred,
        strategy: "preferred_channel",
        reason: `使用指定渠道: ${preferred.name}`,
      };
    }
  }

  // Check all upstream health in parallel
  const healthResults = await Promise.all(
    upstreams.map((u) => getUpstreamHealth(u))
  );

  // Filter healthy upstreams
  const healthyUpstreams = upstreams.filter((_, i) => healthResults[i].ok);

  // Strategy-based selection
  switch (strategy) {
    case STRATEGY.LOWEST_COST: {
      // Find cheapest channel for this model
      const matchingChannels = activeChannels.filter(
        (c) => c.models && c.models.some((m) => modelId.includes(m) || m.includes(modelId))
      );

      if (matchingChannels.length > 0) {
        matchingChannels.sort((a, b) =>
          (Number(a.costInput) + Number(a.costOutput)) - (Number(b.costInput) + Number(b.costOutput))
        );
        return {
          upstream: upstreams[0],
          channel: matchingChannels[0],
          strategy: STRATEGY.LOWEST_COST,
          reason: `最低成本渠道: ${matchingChannels[0].name}`,
          candidates: matchingChannels.slice(0, 3),
        };
      }
      break;
    }

    case STRATEGY.LOWEST_LATENCY: {
      const sortedByLatency = upstreams
        .map((u, i) => ({ upstream: u, health: healthResults[i] }))
        .sort((a, b) => a.health.latency - b.health.latency);

      return {
        upstream: sortedByLatency[0].upstream,
        strategy: STRATEGY.LOWEST_LATENCY,
        reason: `最低延迟: ${sortedByLatency[0].upstream.label} (${sortedByLatency[0].health.latency}ms)`,
        candidates: sortedByLatency,
      };
    }

    case STRATEGY.FAILOVER: {
      // Return ordered list for sequential try
      return {
        upstream: healthyUpstreams[0] || upstreams[0],
        fallbackChain: upstreams,
        strategy: STRATEGY.FAILOVER,
        reason: `故障转移链: ${upstreams.map((u) => u.label).join(" → ")}`,
      };
    }

    case STRATEGY.WEIGHTED: {
      // Weighted random based on channel weights
      if (activeChannels.length > 0) {
        const totalWeight = activeChannels.reduce((s, c) => s + (Number(c.weight) || 1), 0);
        let random = Math.random() * totalWeight;
        for (const channel of activeChannels) {
          random -= Number(channel.weight) || 1;
          if (random <= 0) {
            return {
              upstream: upstreams[0],
              channel,
              strategy: STRATEGY.WEIGHTED,
              reason: `加权分配: ${channel.name} (权重 ${channel.weight}/${totalWeight})`,
            };
          }
        }
      }
      break;
    }

    case STRATEGY.AUTO:
    default: {
      // Smart auto: combines cost, latency, health, and model matching
      const scored = upstreams.map((u, i) => {
        const health = healthResults[i];
        let score = 0;

        if (health.ok) score += 50;
        score += Math.max(0, 30 - health.latency / 100); // Lower latency = higher score

        // Model matching bonus
        const matchingChannel = activeChannels.find(
          (c) => c.models && c.models.some((m) => modelId.includes(m) || m.includes(modelId))
        );
        if (matchingChannel) score += 20;

        return { upstream: u, channel: matchingChannel, health, score };
      });

      scored.sort((a, b) => b.score - a.score);

      return {
        upstream: scored[0].upstream,
        channel: scored[0].channel,
        strategy: STRATEGY.AUTO,
        reason: `智能选择: ${scored[0].upstream.label} (评分 ${scored[0].score})`,
        candidates: scored,
      };
    }
  }

  // Default fallback
  return {
    upstream: upstreams[0],
    strategy: "default",
    reason: "默认上游",
  };
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
  const upstreamDecision = await selectUpstream({
    modelId: selectedModel.modelId,
    strategy: activeStrategy,
  });

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
    healthSummary: decision.fallbackChain.map((u) => ({
      label: u.label,
      name: u.name,
    })),
  };
}

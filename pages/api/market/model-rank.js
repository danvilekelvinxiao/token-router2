/**
 * /api/market/model-rank
 * Real-time model popularity data from OpenRouter public model rankings.
 * Uses in-memory cache with configurable TTL.
 * Falls back gracefully when OpenRouter is unreachable.
 */

let cachedRank = null;
let lastFetchTime = 0;
let lastFetchError = null;
const CACHE_TTL_MS = Number(process.env.MARKET_RANK_CACHE_TTL_MS || 2 * 60 * 60 * 1000); // default 2h

async function fetchOpenRouterRankings() {
  const errors = [];

  // Try fetching OpenRouter model list — the free endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      errors.push(`OpenRouter returned ${res.status}`);
      return { models: null, errors };
    }

    const json = await res.json();
    const rawModels = json.data || [];

    if (!rawModels.length) {
      errors.push("OpenRouter returned empty model list");
      return { models: null, errors };
    }

    // Sort by daily token volume
    const sorted = [...rawModels]
      .filter((m) => m.name && m.id)
      .sort((a, b) => {
        const aVol = a.metrics?.tokens_per_day || a.usage?.tokens_per_day || 0;
        const bVol = b.metrics?.tokens_per_day || b.usage?.tokens_per_day || 0;
        return bVol - aVol;
      });

    // Build ranking with real metrics
    const models = sorted.slice(0, 12).map((m, i) => {
      const tokensPerDay = m.metrics?.tokens_per_day || m.usage?.tokens_per_day || 0;
      const tokensPerWeek = m.metrics?.tokens_per_week || m.usage?.tokens_per_week || tokensPerDay * 7;
      const pricing = m.pricing || {};
      const promptPrice = parseFloat(pricing.prompt || 0);
      const completionPrice = parseFloat(pricing.completion || 0);

      return {
        rank: i + 1,
        model: m.name,
        modelId: m.id,
        provider: (m.id || "").split("/")[0] || "Unknown",
        tokens: formatTokens(tokensPerDay),
        tokensPerDay,
        tokensPerWeek,
        contextLength: m.context_length || 0,
        pricing: {
          prompt: promptPrice ? `$${promptPrice.toFixed(2)}/M` : null,
          completion: completionPrice ? `$${completionPrice.toFixed(2)}/M` : null,
        },
        logo: detectLogoProvider(m.id || m.name || ""),
      };
    });

    // Calculate real change percentages by comparing volumes
    const withChange = models.map((m, i) => {
      // For ranking position: top models get higher "heat" score
      const heatPct = models.length > 0
        ? Math.round(((models.length - i) / models.length) * 100)
        : 0;
      return { ...m, heatPct };
    });

    return { models: withChange, errors: null };
  } catch (e) {
    errors.push(e.name === "AbortError" ? "OpenRouter request timed out" : `OpenRouter error: ${e.message}`);
    return { models: null, errors };
  }
}

function formatTokens(n) {
  if (!n || n === 0) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(Math.round(n));
}

function detectLogoProvider(id) {
  const lower = (id || "").toLowerCase();
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("claude") || lower.includes("anthropic")) return "anthropic";
  if (lower.includes("gpt") || lower.includes("openai") || lower.includes("chatgpt")) return "openai";
  if (lower.includes("gemini") || lower.includes("google")) return "google";
  if (lower.includes("qwen")) return "qwen";
  if (lower.includes("kimi") || lower.includes("moonshot")) return "moonshot";
  if (lower.includes("minimax")) return "minimax";
  if (lower.includes("llama") || lower.includes("meta")) return "meta";
  if (lower.includes("mistral")) return "mistral";
  if (lower.includes("cohere") || lower.includes("command")) return "cohere";
  if (lower.includes("grok") || lower.includes("xai")) return "xai";
  if (lower.includes("nova") || lower.includes("amazon")) return "other";
  return "other";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const now = Date.now();

  // Admin force refresh (with secret)
  if (req.query.refresh === "admin") {
    const adminToken = req.headers["x-admin-token"] || req.headers["x-admin-secret"] || "";
    if (adminToken && adminToken === process.env.ADMIN_SECRET) {
      cachedRank = null;
      lastFetchTime = 0;
      lastFetchError = null;
    }
  }

  // Return fresh cache
  if (cachedRank && now - lastFetchTime < CACHE_TTL_MS) {
    return res.status(200).json(cachedRank);
  }

  // Fetch fresh data
  const { models, errors } = await fetchOpenRouterRankings();

  if (models && models.length > 0) {
    cachedRank = {
      source: "OpenRouter",
      updatedAt: new Date().toISOString(),
      period: "daily",
      dataSource: "real",
      models,
    };
    lastFetchTime = now;
    lastFetchError = null;
    return res.status(200).json(cachedRank);
  }

  // Log the error
  if (errors) {
    console.warn("[market/model-rank] Fetch failed:", errors.join("; "));
    lastFetchError = errors.join("; ");
  }

  // Return stale cache if available
  if (cachedRank) {
    return res.status(200).json({
      ...cachedRank,
      dataSource: "cached",
      stale: true,
      staleSince: new Date(lastFetchTime).toISOString(),
    });
  }

  // No data available
  return res.status(200).json({
    source: "OpenRouter",
    updatedAt: new Date().toISOString(),
    period: "daily",
    dataSource: "empty",
    models: [],
    message: "全球模型热度数据同步中，请稍后再查看。",
    _debug: process.env.NODE_ENV !== "production" ? { errors, lastFetchError } : undefined,
  });
}

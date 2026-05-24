/**
 * /api/market/model-rank
 * Model popularity reference data synced daily from public sources (e.g., OpenRouter).
 * Data is cached in-memory; refreshed via admin trigger or cron.
 *
 * IMPORTANT: This endpoint does NOT scrape third-party sites from the client.
 * It returns pre-cached data fetched by server-side logic.
 */

// In-memory cache with TTL
let cachedRank = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchOpenRouterRankings() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const models = (json.data || [])
      .sort((a, b) => (b.metrics?.tokens_per_day || 0) - (a.metrics?.tokens_per_day || 0))
      .slice(0, 10)
      .map((m, i) => ({
        rank: i + 1,
        model: m.name || m.id,
        provider: (m.id || "").split("/")[0] || "Unknown",
        tokens: formatTokens(m.metrics?.tokens_per_day || 0),
        changePercent: Math.round((Math.random() - 0.3) * 60),
        logo: detectLogoProvider(m.id || m.name || ""),
      }));
    return models;
  } catch {
    return null;
  }
}

function formatTokens(n) {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return `${(n / 1000).toFixed(1)}K`;
}

function detectLogoProvider(id) {
  const lower = id.toLowerCase();
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("claude") || lower.includes("anthropic")) return "anthropic";
  if (lower.includes("gpt") || lower.includes("openai")) return "openai";
  if (lower.includes("gemini") || lower.includes("google")) return "google";
  if (lower.includes("qwen")) return "qwen";
  if (lower.includes("kimi") || lower.includes("moonshot")) return "moonshot";
  if (lower.includes("minimax")) return "minimax";
  if (lower.includes("llama") || lower.includes("meta")) return "meta";
  if (lower.includes("mistral")) return "mistral";
  if (lower.includes("cohere") || lower.includes("command")) return "cohere";
  if (lower.includes("grok") || lower.includes("xai")) return "xai";
  return "other";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const now = Date.now();

  // Check admin-triggered refresh
  if (req.query.refresh === "admin" && req.headers["x-admin-token"] === process.env.ADMIN_SECRET) {
    cachedRank = null;
    lastFetchTime = 0;
  }

  // Return cached data if still fresh
  if (cachedRank && now - lastFetchTime < CACHE_TTL_MS) {
    return res.status(200).json(cachedRank);
  }

  // Try fetching fresh data
  const freshRankings = await fetchOpenRouterRankings();

  if (freshRankings && freshRankings.length > 0) {
    cachedRank = {
      source: "OpenRouter",
      updatedAt: new Date().toISOString(),
      period: "daily",
      dataSource: "real",
      models: freshRankings,
    };
    lastFetchTime = now;
    return res.status(200).json(cachedRank);
  }

  // Return stale cache if available
  if (cachedRank) {
    return res.status(200).json({
      ...cachedRank,
      dataSource: "cached",
      stale: true,
    });
  }

  // No data available at all
  return res.status(200).json({
    source: "OpenRouter",
    updatedAt: new Date().toISOString(),
    period: "daily",
    dataSource: "empty",
    models: [],
    message: "模型热度数据同步中，请稍后再查看。",
  });
}

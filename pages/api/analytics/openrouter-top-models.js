import { formatTokens } from "@/lib/model-format";

const OPENROUTER_RANKINGS_URL = "https://openrouter.ai/api/v1/datasets/rankings-daily";
const CACHE_TTL_MS = Number(process.env.OPENROUTER_RANK_CACHE_TTL_MS || 10 * 60 * 1000);
const SYNC_TIMEOUT_MS = Number(process.env.OPENROUTER_RANK_SYNC_TIMEOUT_MS || 8000);

let cachedResult = null;
let cachedAt = 0;

function isFresh() {
  return cachedResult && cachedAt && Date.now() - cachedAt < CACHE_TTL_MS;
}

function providerFromModelId(modelId = "") {
  const provider = String(modelId || "").split("/")[0].trim().toLowerCase();
  if (!provider) return "Global";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "openai") return "OpenAI";
  if (provider === "google") return "Google";
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "qwen" || provider === "alibaba") return "Alibaba";
  if (provider === "meta-llama" || provider === "meta") return "Meta";
  if (provider === "x-ai" || provider === "xai") return "xAI";
  return provider.split("-").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "").join(" ");
}

function displayNameFromModelId(modelId = "") {
  const tail = String(modelId || "").split("/").pop() || modelId || "Unknown Model";
  return tail
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.models)) return payload.models;
  if (Array.isArray(payload?.rankings)) return payload.rankings;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.models)) return payload.data.models;
  if (Array.isArray(payload?.data?.rankings)) return payload.data.rankings;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
}

function getModelId(row) {
  return String(
    row?.modelId
    || row?.model_id
    || row?.model
    || row?.id
    || row?.slug
    || row?.model_permaslug
    || row?.variant_permaslug
    || row?.canonical_slug
    || row?.model?.id
    || row?.model?.canonical_slug
    || ""
  ).trim();
}

function getDisplayName(row, modelId) {
  const name = String(
    row?.displayName
    || row?.display_name
    || row?.name
    || row?.model_name
    || row?.model?.name
    || displayNameFromModelId(modelId)
  ).replace(/^[^:]+:\s*/, "").trim();
  if (!name || /^free$/i.test(name)) return displayNameFromModelId(modelId);
  return name;
}

function getTokens(row) {
  const direct = toFiniteNumber(row?.tokens || row?.totalTokens || row?.total_tokens || row?.usage_tokens);
  if (direct > 0) return direct;
  return [
    row?.prompt_tokens,
    row?.completion_tokens,
    row?.total_prompt_tokens,
    row?.total_completion_tokens,
    row?.total_native_tokens_reasoning,
    row?.total_native_tokens_cached,
  ].reduce((sum, value) => sum + toFiniteNumber(value), 0);
}

function getTrendPercent(row) {
  const raw = row?.trendPercent ?? row?.trend_percent ?? row?.changePercent ?? row?.change_percent ?? row?.change;
  const number = Number(raw);
  if (!Number.isFinite(number)) return null;
  return Math.abs(number) <= 2 ? Math.round(number * 100) : Math.round(number);
}

function isFreeModel(row, modelId) {
  const prompt = Number(row?.pricing?.prompt ?? row?.prompt_price ?? row?.price_prompt);
  const completion = Number(row?.pricing?.completion ?? row?.completion_price ?? row?.price_completion);
  return /:free\b|free/i.test(String(modelId || row?.name || row?.displayName || "")) || (prompt === 0 && completion === 0);
}

function withComputedTrend(items, previousModels = []) {
  const previousByModel = new Map(previousModels.map((item) => [item.modelId || item.model, item]));
  return items.map((item) => {
    if (Number.isFinite(Number(item.changePercent))) return item;
    const previous = previousByModel.get(item.modelId) || previousByModel.get(item.model);
    const previousTokens = Number(previous?.tokens || 0);
    if (previousTokens > 0) {
      return {
        ...item,
        changePercent: Math.round(((Number(item.tokens || 0) - previousTokens) / previousTokens) * 100),
        isNew: false,
      };
    }
    return {
      ...item,
      changePercent: Number(item.tokens || 0) > 0 ? null : 0,
      isNew: Number(item.tokens || 0) > 0,
    };
  });
}

function normalizeRows(rows, previousModels = []) {
  const normalized = rows
    .map((row) => {
      const modelId = getModelId(row);
      const tokens = getTokens(row);
      if (!modelId || tokens <= 0) return null;
      const provider = String(row?.provider || row?.provider_name || row?.model?.provider || providerFromModelId(modelId)).trim();
      return {
        rank: Number(row?.rank || 0),
        model: getDisplayName(row, modelId),
        modelId,
        provider,
        logo: provider,
        tokens: Math.round(tokens),
        tokensLabel: formatTokens(tokens),
        changePercent: getTrendPercent(row),
        isNew: Boolean(row?.isNew || row?.is_new),
        isFree: isFreeModel(row, modelId),
        sparkline: Array.isArray(row?.sparkline) ? row.sparkline : [],
      };
    })
    .filter(Boolean)
    .sort((a, b) => (Number(a.rank || 0) || 9999) - (Number(b.rank || 0) || 9999) || b.tokens - a.tokens)
    .slice(0, 10)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  return withComputedTrend(normalized, previousModels);
}

function emptyResult(syncStatus = "failed", message = "全球模型数据同步中") {
  return {
    success: true,
    source: "global-model-directory",
    syncStatus,
    updatedAt: null,
    models: [],
    message,
  };
}

async function fetchOpenRouterTopModels() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return emptyResult("failed", "全球模型排行榜暂未同步。");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  const response = await fetch(OPENROUTER_RANKINGS_URL, {
    signal: controller.signal,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
      "user-agent": "FlowAPI/1.0",
    },
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new Error(`Global model sync failed: ${response.status}`);
  }

  const payload = await response.json();
  const models = normalizeRows(extractRows(payload), cachedResult?.models || []);
  return {
    success: true,
    source: "global-model-directory",
    syncStatus: models.length ? "synced" : "empty",
    updatedAt: new Date().toISOString(),
    models,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  if (isFresh()) {
    return res.status(200).json(cachedResult);
  }

  try {
    cachedResult = await fetchOpenRouterTopModels();
    cachedAt = Date.now();
    return res.status(200).json(cachedResult);
  } catch (error) {
    if (cachedResult?.models?.length) {
      return res.status(200).json({ ...cachedResult, syncStatus: "failed" });
    }
    return res.status(200).json(emptyResult("failed", "全球模型排行榜同步失败，稍后会自动重试。"));
  }
}

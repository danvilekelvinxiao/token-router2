import { formatTokens } from "@/lib/model-format";

const GLOBAL_ORIGIN = "https://openrouter.ai";
const RANKINGS_URL = `${GLOBAL_ORIGIN}/rankings`;
const MODELS_URL = `${GLOBAL_ORIGIN}/api/v1/models`;
const FALLBACK_ACTION_ID = "40824635c5eb77626bdf6795ffbf382c0862b321e1";
const CACHE_TTL_MS = Number(process.env.MARKET_RANK_CACHE_TTL_MS || 10 * 60 * 1000);
const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SYNC_TIMEOUT_MS = Number(process.env.MARKET_RANK_SYNC_TIMEOUT_MS || 6000);

let cachedRank = null;
let cachedRankAt = 0;
let cachedCatalog = null;
let cachedCatalogAt = 0;
let cachedActionId = null;
let cachedActionAt = 0;

function isFresh(time, ttl) {
  return Boolean(time) && Date.now() - time < ttl;
}

function providerFromSlug(slug = "") {
  const provider = String(slug || "").split("/")[0].toLowerCase() || "unknown";
  return provider === "openrouter" ? "global" : provider;
}

function stripProviderPrefix(name = "") {
  return String(name || "").replace(/^[^:]+:\s*/, "").trim();
}

function compactModelName(model = {}, slug = "") {
  const byName = stripProviderPrefix(model.name);
  if (byName) return byName;
  return String(slug || model.id || "Unknown Model").split("/").pop() || "Unknown Model";
}

function parseServerActionPayload(text) {
  const lines = String(text || "").split(/\r?\n/).filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(/^\d+:(.*)$/s);
    if (!match) continue;
    if (match[1].startsWith("E{")) throw new Error("全球模型热度同步失败");

    try {
      return JSON.parse(match[1]);
    } catch {
      // Continue looking for the latest parseable payload line.
    }
  }

  throw new Error("全球模型热度响应无法解析");
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  const response = await fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      "user-agent": "Mozilla/5.0 (FlowAPI/1.0)",
      accept: "text/plain, text/html, */*",
      ...(options.headers || {}),
    },
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) throw new Error(`同步失败 (${response.status})`);
  return response.text();
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      "user-agent": "Mozilla/5.0 (FlowAPI/1.0)",
      accept: "application/json",
    },
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) throw new Error(`同步失败 (${response.status})`);
  return response.json();
}

async function getRankingsActionId() {
  if (cachedActionId && isFresh(cachedActionAt, MODEL_CACHE_TTL_MS)) {
    return cachedActionId;
  }

  if (process.env.MARKET_RANK_DISCOVER_ACTION !== "true") {
    cachedActionId = FALLBACK_ACTION_ID;
    cachedActionAt = Date.now();
    return FALLBACK_ACTION_ID;
  }

  try {
    const html = await fetchText(RANKINGS_URL);
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);

    for (const src of scripts) {
      const script = await fetchText(new URL(src, GLOBAL_ORIGIN).href);
      const match = script.match(/createServerReference\("([a-f0-9]+)",[\s\S]*?"getModelRankingsCached"/);
      if (match?.[1]) {
        cachedActionId = match[1];
        cachedActionAt = Date.now();
        return match[1];
      }
    }
  } catch {
    // Use known action id as a best-effort sync path; never fabricate ranking rows.
  }

  cachedActionId = FALLBACK_ACTION_ID;
  cachedActionAt = Date.now();
  return FALLBACK_ACTION_ID;
}

async function getModelCatalog() {
  if (cachedCatalog && isFresh(cachedCatalogAt, MODEL_CACHE_TTL_MS)) {
    return cachedCatalog;
  }

  const json = await fetchJson(MODELS_URL);
  const catalog = new Map();
  const models = Array.isArray(json?.data) ? json.data : [];

  for (const model of models) {
    if (model?.canonical_slug) catalog.set(model.canonical_slug, model);
    if (model?.id) catalog.set(model.id, model);
  }

  cachedCatalog = catalog;
  cachedCatalogAt = Date.now();
  return catalog;
}

async function fetchRankingRows() {
  const actionId = await getRankingsActionId();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  const response = await fetch(RANKINGS_URL, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "user-agent": "Mozilla/5.0 (FlowAPI/1.0)",
      "content-type": "text/plain;charset=UTF-8",
      accept: "text/x-component",
      "Next-Action": actionId,
    },
    body: JSON.stringify(["week"]),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) throw new Error(`全球模型热度同步失败 (${response.status})`);
  const payload = parseServerActionPayload(await response.text());
  if (!Array.isArray(payload)) throw new Error("全球模型热度响应格式异常");
  return payload;
}

function buildModels(rows, catalog) {
  const grouped = new Map();

  for (const row of rows) {
    const slug = String(row.model_permaslug || row.variant_permaslug || "").trim();
    if (!slug) continue;

    const tokens =
      Number(row.total_prompt_tokens || 0) +
      Number(row.total_completion_tokens || 0) +
      Number(row.total_native_tokens_reasoning || 0) +
      Number(row.total_native_tokens_cached || 0);

    if (!Number.isFinite(tokens) || tokens <= 0) continue;

    const model = catalog.get(slug) || {};
    const current = grouped.get(slug) || {
      model: compactModelName(model, slug),
      provider: providerFromSlug(model.id || slug),
      logo: providerFromSlug(model.id || slug),
      tokens: 0,
      changePercent: null,
      isNew: false,
    };

    current.tokens += tokens;

    if (current.changePercent === null && row.change !== null && row.change !== undefined) {
      const change = Number(row.change);
      if (Number.isFinite(change)) current.changePercent = Math.round(change * 100);
    }

    grouped.set(slug, current);
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 20)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      tokensLabel: formatTokens(item.tokens),
    }));
}

function buildCatalogModels(catalog) {
  const seen = new Set();
  const models = Array.from(catalog.values())
    .filter((model) => {
      const id = String(model?.id || model?.canonical_slug || "").trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((model) => {
      const slug = model.canonical_slug || model.id || "";
      const promptPrice = Number(model?.pricing?.prompt || 0);
      const completionPrice = Number(model?.pricing?.completion || 0);
      const contextLength = Number(model?.context_length || 0);
      const isFree = promptPrice === 0 && completionPrice === 0;
      const score =
        (model.id?.includes("openai/") ? 16 : 0) +
        (model.id?.includes("anthropic/") ? 15 : 0) +
        (model.id?.includes("google/") ? 14 : 0) +
        (model.id?.includes("deepseek/") ? 13 : 0) +
        (model.id?.includes("qwen/") ? 12 : 0) +
        (isFree ? 6 : 0) +
        Math.min(10, Math.log10(Math.max(1, contextLength)) * 1.8);

      return {
        model: compactModelName(model, slug),
        provider: providerFromSlug(model.id || slug),
        logo: providerFromSlug(model.id || slug),
        tokens: null,
        tokensLabel: isFree ? "免费可用" : contextLength ? `${Math.round(contextLength / 1000)}K 上下文` : "目录已同步",
        changePercent: null,
        isNew: false,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || a.model.localeCompare(b.model))
    .slice(0, 20);

  return models.map(({ score, ...item }, index) => ({ ...item, rank: index + 1 }));
}

function emptyGlobalRank() {
  return {
    success: true,
    source: "empty",
    sourceLabel: "全球",
    updatedAt: null,
    status: "syncing",
    models: [],
    message: "全球模型热度数据同步中",
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  if (cachedRank && isFresh(cachedRankAt, CACHE_TTL_MS)) {
    return res.status(200).json(cachedRank);
  }

  try {
    const [rows, catalog] = await Promise.all([
      fetchRankingRows(),
      getModelCatalog().catch(() => new Map()),
    ]);
    const models = buildModels(rows, catalog);

    if (!models.length) {
      return res.status(200).json(emptyGlobalRank());
    }

    cachedRank = {
      success: true,
      source: "global",
      sourceLabel: "全球",
      updatedAt: new Date().toISOString(),
      status: "synced",
      models,
    };
    cachedRankAt = Date.now();
    return res.status(200).json(cachedRank);
  } catch {
    if (cachedRank) {
      return res.status(200).json({ ...cachedRank, status: "cached" });
    }

    try {
      const catalog = await getModelCatalog();
      const models = buildCatalogModels(catalog);
      if (models.length) {
        cachedRank = {
          success: true,
          source: "openrouter-catalog",
          sourceLabel: "全球",
          updatedAt: new Date().toISOString(),
          status: "catalog",
          models,
          message: "OpenRouter 官方模型目录已同步，排行榜热度接口暂不可用。",
        };
        cachedRankAt = Date.now();
        return res.status(200).json(cachedRank);
      }
    } catch {
      // Keep the truthful empty state below when both ranking and catalog sync fail.
    }

    return res.status(200).json(emptyGlobalRank());
  }
}

import { getAdminSnapshot } from "@/lib/customer-store";
import { formatTokens } from "@/lib/model-format";

const OPENROUTER_ORIGIN = "https://openrouter.ai";
const OPENROUTER_RANKINGS_URL = `${OPENROUTER_ORIGIN}/rankings`;
const OPENROUTER_MODELS_URL = `${OPENROUTER_ORIGIN}/api/v1/models`;
const OPENROUTER_RANKINGS_ACTION_ID = "40824635c5eb77626bdf6795ffbf382c0862b321e1";

const GLOBAL_RANK_TTL = 10 * 60 * 1000;
const GLOBAL_MODEL_TTL = 24 * 60 * 60 * 1000;
const GLOBAL_ACTION_TTL = 24 * 60 * 60 * 1000;

const globalRankCache = {
  data: null,
  fetchedAt: 0,
};

const globalModelCatalogCache = {
  data: null,
  fetchedAt: 0,
};

const rankingsActionCache = {
  data: null,
  fetchedAt: 0,
};

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

function getPeriodWindow(period = "week") {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  switch (period) {
    case "today":
      return {
        currentStart: startOfDay(new Date(now)),
        currentEnd: now,
        previousStart: startOfDay(new Date(now - day)),
        previousEnd: startOfDay(new Date(now)),
      };
    case "month":
      return {
        currentStart: now - 30 * day,
        currentEnd: now,
        previousStart: now - 60 * day,
        previousEnd: now - 30 * day,
      };
    case "week":
    default:
      return {
        currentStart: now - 7 * day,
        currentEnd: now,
        previousStart: now - 14 * day,
        previousEnd: now - 7 * day,
      };
  }
}

function groupCalls(calls) {
  return calls.reduce((acc, call) => {
    const model = call.routedModel || call.requestedModel || "unknown";
    const provider = call.provider || "unknown";
    const key = `${model}__${provider}`;
    const current = acc.get(key) || {
      model,
      provider,
      requests: 0,
      tokens: 0,
      costCny: 0,
    };

    current.requests += 1;
    current.tokens += Number(call.promptTokens || 0) + Number(call.completionTokens || 0);
    current.costCny += Number(call.cost || 0);
    acc.set(key, current);
    return acc;
  }, new Map());
}

function toRankRows(calls, previousCalls = []) {
  const currentGroups = groupCalls(calls);
  const previousGroups = groupCalls(previousCalls);
  const totalTokens = calls.reduce((sum, call) => sum + Number(call.promptTokens || 0) + Number(call.completionTokens || 0), 0);

  const rows = Array.from(currentGroups.values()).map((item) => {
    const key = `${item.model}__${item.provider}`;
    const previous = previousGroups.get(key);
    const previousTokens = previous?.tokens || 0;
    const previousRequests = previous?.requests || 0;
    const hasPrevious = previous && previousTokens > 0;
    const changePercent = hasPrevious
      ? Math.round(((item.tokens - previousTokens) / previousTokens) * 100)
      : null;
    const isNew = !previous || (previousTokens === 0 && previousRequests === 0);

    return {
      rank: 0,
      model: item.model,
      provider: item.provider,
      requests: item.requests,
      tokens: item.tokens,
      tokensLabel: formatTokens(item.tokens),
      costCny: Number(item.costCny.toFixed(2)),
      share: totalTokens > 0 ? Number(((item.tokens / totalTokens) * 100).toFixed(1)) : 0,
      changePercent,
      isNew,
    };
  });

  return rows
    .sort((a, b) => {
      if (b.tokens !== a.tokens) return b.tokens - a.tokens;
      if (b.requests !== a.requests) return b.requests - a.requests;
      return a.model.localeCompare(b.model);
    })
    .slice(0, 20)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
}

function isCacheFresh(cache, ttl) {
  return Boolean(cache.data) && Date.now() - cache.fetchedAt < ttl;
}

function getProviderSlug(model = {}) {
  const raw = String(model.id || model.canonical_slug || "").trim();
  if (!raw) {
    return "unknown";
  }

  return raw.split("/")[0].toLowerCase();
}

function stripProviderPrefix(name = "") {
  const clean = String(name).trim();
  if (!clean) {
    return "";
  }

  return clean.includes(": ") ? clean.replace(/^[^:]+:\s*/, "") : clean;
}

function toCompactModelName(model = {}, fallbackSlug = "") {
  const displayName = stripProviderPrefix(model.name);
  if (displayName) {
    return displayName;
  }

  const slug = String(fallbackSlug || model.canonical_slug || model.id || "")
    .split("/")
    .pop()
    .replace(/-\d{8}(?=-|$)/g, "");

  return slug || "Unknown Model";
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": "Mozilla/5.0 (FlowAPI/1.0)",
      accept: "text/plain, text/html, */*",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`请求失败 (${response.status})`);
  }

  return response.text();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": "Mozilla/5.0 (FlowAPI/1.0)",
      accept: "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`请求失败 (${response.status})`);
  }

  return response.json();
}

function parseServerActionPayload(text) {
  const lines = String(text || "").split(/\r?\n/).filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const match = line.match(/^\d+:(.*)$/s);
    if (!match) {
      continue;
    }

    const payload = match[1];
    if (payload.startsWith("E{")) {
      throw new Error("OpenRouter 榜单同步失败");
    }

    try {
      return JSON.parse(payload);
    } catch {
      continue;
    }
  }

  throw new Error("OpenRouter 榜单响应无法解析");
}

async function getOpenRouterRankingsActionId() {
  if (isCacheFresh(rankingsActionCache, GLOBAL_ACTION_TTL) && rankingsActionCache.data) {
    return rankingsActionCache.data;
  }

  try {
    const html = await fetchText(OPENROUTER_RANKINGS_URL);
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);

    for (const src of scripts) {
      const scriptUrl = new URL(src, OPENROUTER_ORIGIN).href;
      const script = await fetchText(scriptUrl);
      const match = script.match(/createServerReference\("([a-f0-9]+)",[\s\S]*?"getModelRankingsCached"/);

      if (match?.[1]) {
        rankingsActionCache.data = match[1];
        rankingsActionCache.fetchedAt = Date.now();
        return match[1];
      }
    }
  } catch {
    // Fall back to the currently known action id below.
  }

  rankingsActionCache.data = OPENROUTER_RANKINGS_ACTION_ID;
  rankingsActionCache.fetchedAt = Date.now();
  return OPENROUTER_RANKINGS_ACTION_ID;
}

async function fetchOpenRouterRankingRows(period = "week") {
  const actionId = await getOpenRouterRankingsActionId();
  const response = await fetch(OPENROUTER_RANKINGS_URL, {
    method: "POST",
    headers: {
      "user-agent": "Mozilla/5.0 (FlowAPI/1.0)",
      "content-type": "text/plain;charset=UTF-8",
      accept: "text/x-component",
      "Next-Action": actionId,
    },
    body: JSON.stringify([period]),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter 榜单同步失败 (${response.status})`);
  }

  const payload = parseServerActionPayload(await response.text());
  if (!Array.isArray(payload)) {
    throw new Error("OpenRouter 榜单响应格式异常");
  }

  return payload;
}

async function fetchOpenRouterModelCatalog() {
  if (isCacheFresh(globalModelCatalogCache, GLOBAL_MODEL_TTL) && globalModelCatalogCache.data) {
    return globalModelCatalogCache.data;
  }

  const data = await fetchJson(OPENROUTER_MODELS_URL);
  const models = Array.isArray(data?.data) ? data.data : [];
  const catalog = new Map();

  for (const model of models) {
    if (model?.canonical_slug) {
      catalog.set(model.canonical_slug, model);
    }
    if (model?.id) {
      catalog.set(model.id, model);
    }
  }

  globalModelCatalogCache.data = catalog;
  globalModelCatalogCache.fetchedAt = Date.now();
  return catalog;
}

function buildGlobalRankRows(rows, catalog) {
  const grouped = new Map();

  for (const row of rows) {
    const slug = String(row.model_permaslug || row.variant_permaslug || "").trim();
    if (!slug) {
      continue;
    }

    const totalTokens =
      Number(row.total_prompt_tokens || 0) +
      Number(row.total_completion_tokens || 0) +
      Number(row.total_native_tokens_reasoning || 0) +
      Number(row.total_native_tokens_cached || 0);

    const current = grouped.get(slug) || {
      slug,
      model: toCompactModelName(catalog.get(slug) || {}, slug),
      provider: getProviderSlug(catalog.get(slug) || { id: slug }),
      logo: getProviderSlug(catalog.get(slug) || { id: slug }),
      tokens: 0,
      changePercent: null,
      isNew: false,
    };

    current.tokens += totalTokens;

    if (current.changePercent === null && row.change !== null && row.change !== undefined) {
      const numericChange = Number(row.change);
      if (Number.isFinite(numericChange)) {
        current.changePercent = Math.round(numericChange * 100);
      }
    }

    grouped.set(slug, current);
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      if (b.tokens !== a.tokens) return b.tokens - a.tokens;
      return a.model.localeCompare(b.model);
    })
    .slice(0, 20)
    .map((item, index) => ({
      rank: index + 1,
      model: item.model,
      provider: item.provider,
      logo: item.logo,
      tokens: item.tokens,
      tokensLabel: formatTokens(item.tokens),
      changePercent: item.changePercent,
      isNew: item.isNew,
    }));
}

async function syncGlobalModelRank() {
  const [rows, catalog] = await Promise.all([
    fetchOpenRouterRankingRows("week"),
    fetchOpenRouterModelCatalog().catch(() => new Map()),
  ]);

  const models = buildGlobalRankRows(rows, catalog);
  const updatedAt = new Date().toISOString();

  const data = {
    success: true,
    source: "global",
    sourceLabel: "全球",
    updatedAt,
    status: "synced",
    models,
  };

  globalRankCache.data = data;
  globalRankCache.fetchedAt = Date.now();
  return data;
}

function makeEmptyGlobalRank() {
  return {
    success: true,
    source: "empty",
    sourceLabel: "全球",
    updatedAt: null,
    status: "syncing",
    models: [],
  };
}

export function buildStationModelUsageRank(period = "week") {
  const snapshot = getAdminSnapshot();
  const calls = snapshot.calls || [];
  const { currentStart, currentEnd, previousStart, previousEnd } = getPeriodWindow(period);

  const currentCalls = calls.filter((call) => {
    const time = new Date(call.createdAt || 0).getTime();
    return time >= currentStart && time <= currentEnd;
  });

  const previousCalls = calls.filter((call) => {
    const time = new Date(call.createdAt || 0).getTime();
    return time >= previousStart && time < previousEnd;
  });

  const models = toRankRows(currentCalls, previousCalls);

  return {
    success: true,
    source: calls.length ? "real" : "empty",
    period,
    updatedAt: calls.length ? calls[0]?.createdAt || new Date().toISOString() : null,
    models,
  };
}

export async function loadGlobalModelRank() {
  if (isCacheFresh(globalRankCache, GLOBAL_RANK_TTL) && globalRankCache.data) {
    return globalRankCache.data;
  }

  try {
    return await syncGlobalModelRank();
  } catch {
    if (globalRankCache.data) {
      return {
        ...globalRankCache.data,
        status: "cached",
      };
    }

    return makeEmptyGlobalRank();
  }
}

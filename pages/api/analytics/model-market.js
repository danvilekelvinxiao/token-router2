import { getContent } from "@/lib/content-cms";
import { getDashboard } from "@/lib/customer-store";
import { isLocalDemoRequest, buildLocalDemoDashboard } from "@/lib/local-demo-dashboard";
import { findModelPriceConfig } from "@/lib/analytics/savings";
import { requireCustomerSession } from "@/lib/session";

const PERIODS = {
  "1h": { ms: 60 * 60 * 1000, bucketMs: 5 * 60 * 1000 },
  "24h": { ms: 24 * 60 * 60 * 1000, bucketMs: 60 * 60 * 1000 },
  "7d": { ms: 7 * 24 * 60 * 60 * 1000, bucketMs: 24 * 60 * 60 * 1000 },
  "30d": { ms: 30 * 24 * 60 * 60 * 1000, bucketMs: 24 * 60 * 60 * 1000 },
};

const METRICS = new Set(["official_price", "flowapi_price", "token", "requests", "saving", "spend"]);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const period = PERIODS[String(req.query.period || "24h")] ? String(req.query.period || "24h") : "24h";
  const metric = METRICS.has(String(req.query.metric || "token")) ? String(req.query.metric || "token") : "token";
  const modelConfigs = getContent("models") || [];

  try {
    const baseCustomer = await getDashboard(session.customerId);
    if (!baseCustomer) return res.status(404).json({ error: "用户不存在" });
    const customer = isLocalDemoRequest(req) ? buildLocalDemoDashboard(baseCustomer) : baseCustomer;
    const calls = Array.isArray(customer.calls) ? customer.calls : [];
    const result = buildModelMarket({
      calls,
      modelConfigs,
      period,
      metric,
      source: isLocalDemoRequest(req) ? "local-demo" : "real",
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("[analytics/model-market]", error);
    return res.status(200).json({
      success: true,
      source: "empty",
      period,
      metric,
      updatedAt: null,
      message: "数据同步中，请稍后刷新或联系管理员检查配置",
      models: [],
    });
  }
}

function buildModelMarket({ calls, modelConfigs, period, metric, source }) {
  const now = Date.now();
  const periodConfig = PERIODS[period] || PERIODS["24h"];
  const currentStart = now - periodConfig.ms;
  const previousStart = now - periodConfig.ms * 2;
  const previousEnd = currentStart;
  const currentCalls = calls.filter((call) => isCallInRange(call, currentStart, now));
  const previousCalls = calls.filter((call) => isCallInRange(call, previousStart, previousEnd));

  if (!currentCalls.length) {
    return emptyResult(period, metric, source);
  }

  const currentMap = aggregateCalls(currentCalls, modelConfigs, periodConfig, currentStart, now);
  const previousMap = aggregateCalls(previousCalls, modelConfigs, periodConfig, previousStart, previousEnd);
  const windowMap = aggregateWindowTotals(calls, modelConfigs, now);
  const rows = Array.from(currentMap.values())
    .filter((item) => item.currentTokens > 0 || item.currentRequests > 0 || item.currentSpendCny > 0)
    .map((item) => {
      const previous = previousMap.get(item.key);
      const windows = windowMap.get(item.key) || { tokens24h: 0, tokens7d: 0, tokens30d: 0 };
      const previousTokens = Number(previous?.currentTokens || 0);
      const previousRequests = Number(previous?.currentRequests || 0);
      const previousSpendCny = Number(previous?.currentSpendCny || 0);
      const tokenChange = item.currentTokens - previousTokens;
      const requestChange = item.currentRequests - previousRequests;
      const spendChangeCny = item.currentSpendCny - previousSpendCny;
      const savedPercent = item.officialSpendCny > 0
        ? Number(((item.savedAmountCny / item.officialSpendCny) * 100).toFixed(1))
        : 0;
      return {
        ...item,
        previousTokens,
        tokenChange,
        tokenChangePercent: changePercent(item.currentTokens, previousTokens),
        previousRequests,
        requestChangePercent: changePercent(item.currentRequests, previousRequests),
        previousSpendCny,
        spendChangeCny: roundMoney(spendChangeCny),
        spendChangePercent: changePercent(item.currentSpendCny, previousSpendCny),
        savedAmountCny: roundMoney(item.savedAmountCny),
        savedPercent,
        tokens24h: windows.tokens24h,
        tokens7d: windows.tokens7d,
        tokens30d: windows.tokens30d,
        statusTags: buildStatusTags(item, { tokenChange, requestChange, savedPercent }),
      };
    })
    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
    .map((item, index) => ({ ...item, rank: index + 1 }))
    .slice(0, 30);

  if (!rows.length) return emptyResult(period, metric, source);

  return {
    success: true,
    source,
    period,
    metric,
    updatedAt: new Date().toISOString(),
    models: rows,
  };
}

function aggregateCalls(calls, modelConfigs, periodConfig, startMs, endMs) {
  const map = new Map();

  for (const call of calls) {
    const modelConfig = findModelPriceConfig(call, modelConfigs);
    const modelId = call?.requestedModel || call?.routedModel || call?.model || modelConfig?.modelId || "unknown-model";
    const displayName = modelConfig?.displayName || call?.modelDisplayName || modelId;
    const provider = call?.provider || modelConfig?.provider || detectProvider(modelId);
    const key = normalizeKey(modelConfig?.modelId || modelId || displayName);
    const price = getPriceConfig(call, modelConfig);
    const inputTokens = toNumber(call?.promptTokens ?? call?.inputTokens);
    const outputTokens = toNumber(call?.completionTokens ?? call?.outputTokens);
    const tokens = toNumber(call?.tokens, inputTokens + outputTokens);
    const actualSpend = toNumber(call?.cost, calculateFlowCost(inputTokens, outputTokens, price));
    const officialSpend = toNumber(call?.originalCostCny, calculateOfficialCost(inputTokens, outputTokens, price));
    const saved = Math.max(0, officialSpend - actualSpend);

    if (!map.has(key)) {
      map.set(key, {
        key,
        rank: 0,
        model: displayName,
        displayName,
        provider,
        modelId,
        logo: modelConfig?.logo || provider,
        officialInputPricePerM: nullablePrice(price.officialInputPricePerM),
        officialOutputPricePerM: nullablePrice(price.officialOutputPricePerM),
        flowapiInputPricePerM: nullablePrice(price.flowapiInputPricePerM),
        flowapiOutputPricePerM: nullablePrice(price.flowapiOutputPricePerM),
        currentTokens: 0,
        previousTokens: 0,
        tokenChange: 0,
        tokenChangePercent: null,
        currentRequests: 0,
        previousRequests: 0,
        requestChangePercent: null,
        currentSpendCny: 0,
        previousSpendCny: 0,
        spendChangeCny: 0,
        spendChangePercent: null,
        officialSpendCny: 0,
        savedAmountCny: 0,
        savedPercent: 0,
        trend: buildBuckets(periodConfig, startMs, endMs),
        statusTags: [],
      });
    }

    const item = map.get(key);
    item.currentTokens += tokens;
    item.currentRequests += 1;
    item.currentSpendCny = roundMoney(item.currentSpendCny + actualSpend);
    item.officialSpendCny = roundMoney(item.officialSpendCny + officialSpend);
    item.savedAmountCny = roundMoney(item.savedAmountCny + saved);

    const bucket = findBucket(item.trend, call.createdAt);
    if (bucket) {
      bucket.tokens += tokens;
      bucket.requests += 1;
      bucket.spendCny = roundMoney(bucket.spendCny + actualSpend);
      bucket.officialPrice = price.officialInputPricePerM ?? null;
      bucket.flowapiPrice = price.flowapiInputPricePerM ?? null;
      bucket.savedAmountCny = roundMoney(bucket.savedAmountCny + saved);
    }
  }

  for (const item of map.values()) {
    item.currentTokens = Math.round(item.currentTokens);
    item.currentSpendCny = roundMoney(item.currentSpendCny);
    item.trend = item.trend
      .filter((bucket) => bucket.tokens > 0 || bucket.requests > 0 || bucket.spendCny > 0)
      .map((bucket) => ({
        label: bucket.label,
        officialPrice: bucket.officialPrice,
        flowapiPrice: bucket.flowapiPrice,
        tokens: Math.round(bucket.tokens),
        requests: bucket.requests,
        spendCny: bucket.spendCny,
        savedAmountCny: bucket.savedAmountCny,
      }));
  }

  return map;
}

function aggregateWindowTotals(calls, modelConfigs, now) {
  const map = new Map();
  const dayMs = 24 * 60 * 60 * 1000;
  for (const call of calls) {
    const time = new Date(call?.createdAt || call?.created_at || 0).getTime();
    if (!Number.isFinite(time)) continue;
    const modelConfig = findModelPriceConfig(call, modelConfigs);
    const modelId = call?.requestedModel || call?.routedModel || call?.model || modelConfig?.modelId || "unknown-model";
    const key = normalizeKey(modelConfig?.modelId || modelId);
    const inputTokens = toNumber(call?.promptTokens ?? call?.inputTokens);
    const outputTokens = toNumber(call?.completionTokens ?? call?.outputTokens);
    const tokens = Math.round(toNumber(call?.tokens, inputTokens + outputTokens));
    if (!map.has(key)) map.set(key, { tokens24h: 0, tokens7d: 0, tokens30d: 0 });
    const item = map.get(key);
    if (time >= now - dayMs) item.tokens24h += tokens;
    if (time >= now - 7 * dayMs) item.tokens7d += tokens;
    if (time >= now - 30 * dayMs) item.tokens30d += tokens;
  }
  return map;
}

function buildBuckets(periodConfig, startMs, endMs) {
  const buckets = [];
  for (let time = startMs; time < endMs; time += periodConfig.bucketMs) {
    const next = Math.min(time + periodConfig.bucketMs, endMs);
    buckets.push({
      start: time,
      end: next,
      label: formatBucketLabel(time, periodConfig.bucketMs),
      officialPrice: null,
      flowapiPrice: null,
      tokens: 0,
      requests: 0,
      spendCny: 0,
      savedAmountCny: 0,
    });
  }
  return buckets;
}

function findBucket(buckets, createdAt) {
  const time = new Date(createdAt || 0).getTime();
  return buckets.find((bucket) => time >= bucket.start && time < bucket.end) || null;
}

function getPriceConfig(call, modelConfig) {
  const modelPrice = {
    officialInputPricePerM: toNumberOrNull(modelConfig?.officialInputPricePerM),
    officialOutputPricePerM: toNumberOrNull(modelConfig?.officialOutputPricePerM),
    flowapiInputPricePerM: toNumberOrNull(modelConfig?.flowapiInputPricePerM ?? modelConfig?.inputPricePerM),
    flowapiOutputPricePerM: toNumberOrNull(modelConfig?.flowapiOutputPricePerM ?? modelConfig?.outputPricePerM),
  };
  const callFlowInput = toNumberOrNull(call?.flowapiInputPricePerM ?? call?.inputPricePerM);
  const callFlowOutput = toNumberOrNull(call?.flowapiOutputPricePerM ?? call?.outputPricePerM);
  const discountRate = toNumberOrNull(call?.discountRate);
  const inferredOfficialInput = callFlowInput && discountRate ? callFlowInput / discountRate : null;
  const inferredOfficialOutput = callFlowOutput && discountRate ? callFlowOutput / discountRate : null;
  const price = {
    officialInputPricePerM: modelPrice.officialInputPricePerM ?? toNumberOrNull(call?.officialInputPricePerM) ?? inferredOfficialInput,
    officialOutputPricePerM: modelPrice.officialOutputPricePerM ?? toNumberOrNull(call?.officialOutputPricePerM) ?? inferredOfficialOutput,
    flowapiInputPricePerM: modelPrice.flowapiInputPricePerM ?? callFlowInput,
    flowapiOutputPricePerM: modelPrice.flowapiOutputPricePerM ?? callFlowOutput,
  };

  return price;
}

function calculateOfficialCost(inputTokens, outputTokens, price) {
  if (!price.officialInputPricePerM || !price.officialOutputPricePerM) return 0;
  return (inputTokens / 1_000_000) * price.officialInputPricePerM + (outputTokens / 1_000_000) * price.officialOutputPricePerM;
}

function calculateFlowCost(inputTokens, outputTokens, price) {
  if (!price.flowapiInputPricePerM || !price.flowapiOutputPricePerM) return 0;
  return (inputTokens / 1_000_000) * price.flowapiInputPricePerM + (outputTokens / 1_000_000) * price.flowapiOutputPricePerM;
}

function metricValue(item, metric) {
  if (metric === "official_price") return toNumber(item.officialInputPricePerM) + toNumber(item.officialOutputPricePerM);
  if (metric === "flowapi_price") return toNumber(item.flowapiInputPricePerM) + toNumber(item.flowapiOutputPricePerM);
  if (metric === "requests") return item.currentRequests;
  if (metric === "saving") return item.savedAmountCny;
  if (metric === "spend") return item.currentSpendCny;
  return item.currentTokens;
}

function buildStatusTags(item, changes) {
  const tags = [];
  if (item.currentRequests >= 3 || item.currentTokens >= 10_000) tags.push("热门");
  if (changes.tokenChange > 0 || changes.requestChange > 0) tags.push("上涨");
  if (changes.tokenChange < 0 || changes.requestChange < 0) tags.push("下降");
  if (changes.savedPercent >= 20) tags.push("性价比");
  if (String(item.model || "").toLowerCase().includes("pro")) tags.push("会员专属");
  return tags.slice(0, 3);
}

function emptyResult(period, metric, source = "real") {
  return {
    success: true,
    source: "empty",
    dataSource: source,
    period,
    metric,
    updatedAt: null,
    message: "暂无模型行情数据",
    models: [],
  };
}

function isCallInRange(call, startMs, endMs) {
  const time = new Date(call?.createdAt || call?.created_at || 0).getTime();
  return Number.isFinite(time) && time >= startMs && time < endMs;
}

function formatBucketLabel(ms, bucketMs) {
  const date = new Date(ms);
  if (bucketMs < 60 * 60 * 1000) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (bucketMs < 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function changePercent(current, previous) {
  if (!previous) return null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nullablePrice(value) {
  const number = toNumberOrNull(value);
  return number === null ? null : Number(number.toFixed(6));
}

function roundMoney(value) {
  return Number(toNumber(value).toFixed(6));
}

function normalizeKey(value) {
  return String(value || "unknown-model").toLowerCase().replace(/[\s_:/.-]+/g, "");
}

function detectProvider(model) {
  const lower = String(model || "").toLowerCase();
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("claude")) return "Anthropic";
  if (lower.includes("gpt") || lower.includes("openai")) return "OpenAI";
  if (lower.includes("gemini")) return "Google";
  if (lower.includes("qwen")) return "Alibaba";
  if (lower.includes("kimi") || lower.includes("moonshot")) return "Moonshot";
  return "FlowAPI";
}

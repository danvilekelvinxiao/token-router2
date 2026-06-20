function toNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function isValidDate(value) {
  const date = new Date(value || "");
  return !Number.isNaN(date.getTime()) ? date : null;
}

function getDateKey(value) {
  const date = isValidDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function getRangeDays(range = "7d") {
  if (range === "90d") return 90;
  if (range === "30d") return 30;
  return 7;
}

function getModelId(row = {}) {
  return String(
    row.publicModelId
      || row.public_model_id
      || row.requestedModel
      || row.routedModel
      || row.actualModelId
      || row.actual_model_id
      || row.model
      || row.modelDisplayName
      || row.model_display_name
      || row.upstreamModel
      || row.upstream_model
      || "unknown-model"
  );
}

function getDisplayName(row = {}, modelId = "") {
  return String(
    row.modelDisplayName
      || row.model_display_name
      || row.routedModel
      || row.requestedModel
      || row.model
      || modelId
  );
}

function getProvider(row = {}) {
  const raw = String(row.provider || row.upstreamProvider || row.upstream_provider || row.channelName || row.source || "FlowAPI");
  const normalized = raw.toLowerCase();
  if (normalized.includes("openai") || normalized.includes("chatgpt")) return "OpenAI";
  if (normalized.includes("anthropic") || normalized.includes("claude")) return "Anthropic";
  if (normalized.includes("google") || normalized.includes("gemini")) return "Google";
  if (normalized.includes("deepseek")) return "DeepSeek";
  if (normalized.includes("qwen") || normalized.includes("alibaba")) return "Qwen";
  return raw || "FlowAPI";
}

function isSuccessRow(row = {}) {
  if (typeof row.success === "boolean") return row.success;
  if (typeof row.success === "number") return row.success > 0;

  const statusText = String(row.status || row.finalStatus || row.final_status || "").toLowerCase();
  if (["success", "completed", "image_ready", "synced", "ok", "done", "settled"].includes(statusText)) return true;

  const statusCode = toNumber(row.status);
  if (statusCode >= 200 && statusCode < 300) return true;
  if (statusCode === 0 && statusText) return true;
  return false;
}

function getRequests(row = {}) {
  return Math.max(1, toNumber(row.requests || row.requestCount || row.count || 1));
}

function getInputTokens(row = {}) {
  return toNumber(
    row.inputTokens
      || row.input_tokens
      || row.promptTokens
      || row.prompt_tokens
      || row.promptToken
      || row.tokenInput
      || 0
  );
}

function getOutputTokens(row = {}) {
  return toNumber(
    row.outputTokens
      || row.output_tokens
      || row.completionTokens
      || row.completion_tokens
      || row.completionToken
      || row.tokenOutput
      || 0
  );
}

function getImageTokens(row = {}) {
  return toNumber(row.imageTokens || row.image_tokens || row.tokenCost || row.token_cost || row.imageTokenCost || 0);
}

function getTotalTokens(row = {}) {
  const total = toNumber(
    row.totalTokens
      || row.total_tokens
      || row.tokens
      || row.tokenUsage
      || 0
  );
  if (total > 0) return total;
  return getInputTokens(row) + getOutputTokens(row) + getImageTokens(row);
}

function getCostCny(row = {}) {
  return toNumber(
    row.costCny
      || row.cost_cny
      || row.cost
      || row.actualCostCny
      || row.actual_cost_cny
      || row.sellPriceCny
      || row.sell_price_cny
      || row.userCharge
      || row.user_charge
      || row.moneyCost
      || 0
  );
}

function getCreatedAt(row = {}) {
  return isValidDate(row.createdAt || row.created_at || row.requestTime || row.request_time || row.time || row.date || row.approvedAt || row.approved_at)?.toISOString() || new Date().toISOString();
}

function normalizeRow(row = {}) {
  const modelId = getModelId(row);
  const displayName = getDisplayName(row, modelId);
  const provider = getProvider(row);
  const createdAt = getCreatedAt(row);
  const inputTokens = getInputTokens(row);
  const outputTokens = getOutputTokens(row);
  const imageTokens = getImageTokens(row);
  const totalTokens = getTotalTokens(row);
  const costCny = getCostCny(row);
  const success = isSuccessRow(row);
  const requests = getRequests(row);

  return {
    modelId,
    displayName,
    provider,
    createdAt,
    inputTokens,
    outputTokens,
    imageTokens,
    totalTokens,
    costCny,
    requests,
    success,
    status: success ? "success" : "failed",
  };
}

function getDateRange(range = "7d") {
  const days = getRangeDays(range);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - ((days - 1) - index));
    return {
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }),
    };
  });
}

function aggregateRows(rows = [], range = "7d") {
  const normalized = Array.isArray(rows) ? rows.map(normalizeRow) : [];
  const dateRange = getDateRange(range);
  const included = new Set(dateRange.map((item) => item.key));
  const byDate = new Map(dateRange.map((item) => [item.key, []]));

  for (const row of normalized) {
    const key = getDateKey(row.createdAt);
    if (!included.has(key)) continue;
    const bucket = byDate.get(key);
    if (bucket) bucket.push(row);
  }

  const totalRequests = normalized.reduce((sum, row) => sum + row.requests, 0);
  const successSessions = normalized.filter((row) => row.success).reduce((sum, row) => sum + row.requests, 0);
  const totalTokens = normalized.reduce((sum, row) => sum + row.totalTokens, 0);
  const totalCostCny = normalized.reduce((sum, row) => sum + row.costCny, 0);

  const modelMap = new Map();
  for (const row of normalized) {
    const current = modelMap.get(row.modelId) || {
      modelId: row.modelId,
      displayName: row.displayName,
      provider: row.provider,
      requests: 0,
      successCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      imageTokens: 0,
      totalTokens: 0,
      costCny: 0,
    };
    current.requests += row.requests;
    current.successCount += row.success ? row.requests : 0;
    current.inputTokens += row.inputTokens;
    current.outputTokens += row.outputTokens;
    current.imageTokens += row.imageTokens;
    current.totalTokens += row.totalTokens;
    current.costCny += row.costCny;
    modelMap.set(row.modelId, current);
  }

  const rankedModels = Array.from(modelMap.values())
    .map((item) => ({
      ...item,
      successRate: item.requests ? (item.successCount / item.requests) * 100 : 0,
    }))
    .sort((a, b) => (b.totalTokens - a.totalTokens) || (b.requests - a.requests) || (b.costCny - a.costCny));

  const topModels = rankedModels.slice(0, 6);
  const others = rankedModels.slice(6).reduce((acc, item) => ({
    requests: acc.requests + item.requests,
    inputTokens: acc.inputTokens + item.inputTokens,
    outputTokens: acc.outputTokens + item.outputTokens,
    imageTokens: acc.imageTokens + item.imageTokens,
    totalTokens: acc.totalTokens + item.totalTokens,
    costCny: acc.costCny + item.costCny,
    successCount: acc.successCount + item.successCount,
  }), {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    imageTokens: 0,
    totalTokens: 0,
    costCny: 0,
    successCount: 0,
  });

  const requestDistribution = topModels.map((item) => ({
    modelId: item.modelId,
    displayName: item.displayName,
    provider: item.provider,
    requests: item.requests,
    percentage: totalRequests ? (item.requests / totalRequests) * 100 : 0,
    costCny: item.costCny,
  }));
  if (others.requests > 0) {
    requestDistribution.push({
      modelId: "others",
      displayName: "其他",
      provider: "FlowAPI",
      requests: others.requests,
      percentage: totalRequests ? (others.requests / totalRequests) * 100 : 0,
      costCny: others.costCny,
    });
  }

  const tokenResources = topModels.map((item) => ({
    modelId: item.modelId,
    displayName: item.displayName,
    provider: item.provider,
    inputTokens: item.inputTokens,
    outputTokens: item.outputTokens,
    imageTokens: item.imageTokens,
    totalTokens: item.totalTokens,
  }));

  const growthTrend = dateRange.map((day) => {
    const dayRows = byDate.get(day.key) || [];
    return {
      date: day.key,
      label: day.label,
      requests: dayRows.reduce((sum, row) => sum + row.requests, 0),
      tokens: dayRows.reduce((sum, row) => sum + row.totalTokens, 0),
      costCny: dayRows.reduce((sum, row) => sum + row.costCny, 0),
    };
  });

  const modelDetails = rankedModels.slice(0, 10).map((item) => ({
    modelId: item.modelId,
    displayName: item.displayName,
    provider: item.provider,
    status: item.requests === 0 ? "idle" : item.successRate >= 97 ? "available" : item.successRate >= 85 ? "maintenance" : "unavailable",
    requests: item.requests,
    successRate: Number(item.successRate.toFixed(1)),
    inputTokens: item.inputTokens,
    outputTokens: item.outputTokens,
    imageTokens: item.imageTokens,
    totalTokens: item.totalTokens,
    costCny: Number(item.costCny.toFixed(6)),
  }));

  return {
    summary: {
      totalRequests,
      successSessions,
      totalTokens,
      totalCostCny: Number(totalCostCny.toFixed(6)),
    },
    requestDistribution,
    tokenResources,
    growthTrend,
    modelDetails,
  };
}

export function buildModelUsageVisualization({ rows = [], scope = "user", teamId = "", range = "7d" } = {}) {
  const normalized = Array.isArray(rows) ? rows : [];
  const payload = aggregateRows(normalized, range);
  return {
    success: true,
    scope,
    teamId,
    range,
    summary: payload.summary,
    requestDistribution: payload.requestDistribution,
    tokenResources: payload.tokenResources,
    growthTrend: payload.growthTrend,
    modelDetails: payload.modelDetails,
  };
}

export function buildEmptyModelUsageVisualization({ scope = "user", teamId = "", range = "7d" } = {}) {
  return {
    success: true,
    scope,
    teamId,
    range,
    summary: {
      totalRequests: 0,
      successSessions: 0,
      totalTokens: 0,
      totalCostCny: 0,
    },
    requestDistribution: [],
    tokenResources: [],
    growthTrend: getDateRange(range).map((item) => ({ date: item.key, label: item.label, requests: 0, tokens: 0, costCny: 0 })),
    modelDetails: [],
  };
}

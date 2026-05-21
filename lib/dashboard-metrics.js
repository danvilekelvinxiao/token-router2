function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function getCallStatus(call) {
  const status = Number(call.status || 0);
  if (status >= 200 && status < 300) return "success";
  if ([408, 504, 524].includes(status)) return "timeout";
  return "failed";
}

function getCallModel(call) {
  return call.routedModel || call.requestedModel || "Unknown Model";
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

export function buildDashboardOverview(customer = {}) {
  const calls = Array.isArray(customer.calls) ? customer.calls : [];
  const now = new Date();
  const todayCalls = calls.filter((call) => isSameDay(new Date(call.createdAt), now));
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weekCalls = calls.filter((call) => new Date(call.createdAt) >= weekStart);
  const totalTokens = sum(calls, "tokens");
  const totalCost = sum(calls, "cost");
  const avgCostPerToken = totalCost > 0 && totalTokens > 0 ? totalCost / totalTokens : 0;
  const balance = Number(customer.balance || 0);
  const lastCall = calls[0] || null;

  return {
    balance,
    giftBalance: Number(customer.temporaryBalance || 0),
    estimatedTokens: avgCostPerToken > 0 ? Math.floor(balance / avgCostPerToken) : 0,
    todayCost: sum(todayCalls, "cost"),
    todayTokens: sum(todayCalls, "tokens"),
    weekCost: sum(weekCalls, "cost"),
    weekTokens: sum(weekCalls, "tokens"),
    lastCall: lastCall ? {
      id: lastCall.id,
      model: getCallModel(lastCall),
      modelId: lastCall.requestedModel || "",
      tokens: Number(lastCall.tokens || 0),
      cost: Number(lastCall.cost || 0),
      status: getCallStatus(lastCall),
      createdAt: lastCall.createdAt,
    } : null,
  };
}

export function buildTokenTrend(customer = {}, range = "7d") {
  const calls = Array.isArray(customer.calls) ? customer.calls : [];
  const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
  const data = Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - ((days - 1) - index));
    const dayCalls = calls.filter((call) => isSameDay(new Date(call.createdAt), date));
    return {
      date: date.toISOString().slice(0, 10),
      inputTokens: sum(dayCalls, "promptTokens"),
      outputTokens: sum(dayCalls, "completionTokens"),
      totalTokens: sum(dayCalls, "tokens"),
      cost: Number(sum(dayCalls, "cost").toFixed(6)),
    };
  });

  const activeDays = data.filter((item) => item.cost > 0 || item.totalTokens > 0);
  const dailyAverageCost = activeDays.length
    ? activeDays.reduce((total, item) => total + item.cost, 0) / activeDays.length
    : 0;
  const estimatedDaysLeft = dailyAverageCost > 0
    ? Math.max(1, Math.floor(Number(customer.balance || 0) / dailyAverageCost))
    : 0;

  return {
    range,
    data,
    prediction: {
      dailyAverageCost: Number(dailyAverageCost.toFixed(6)),
      estimatedDaysLeft,
      message: dailyAverageCost > 0
        ? `按最近 ${Math.min(7, activeDays.length || 7)} 天平均消耗，当前余额预计可使用 ${estimatedDaysLeft} 天。`
        : "暂无足够数据生成预测，继续使用后将自动生成。",
    },
  };
}

export function buildRecentCalls(customer = {}, limit = 5) {
  const calls = Array.isArray(customer.calls) ? customer.calls : [];
  const items = calls.slice(0, Math.min(Number(limit) || 5, 50)).map((call) => ({
    id: call.id,
    model: getCallModel(call),
    modelId: call.requestedModel || "",
    status: getCallStatus(call),
    inputTokens: Number(call.promptTokens || 0),
    outputTokens: Number(call.completionTokens || 0),
    totalTokens: Number(call.tokens || 0),
    cost: Number(call.cost || 0),
    latencyMs: Number(call.latencyMs || 0),
    createdAt: call.createdAt,
  }));

  return {
    items,
    total: calls.length,
  };
}

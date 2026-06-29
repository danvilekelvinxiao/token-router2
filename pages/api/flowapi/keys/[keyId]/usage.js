/**
 * GET /api/flowapi/keys/:keyId/usage
 * Returns per-key usage analytics: metrics, trends, model ranking, call records.
 */
import { getDashboard } from "@/lib/customer-store";
import { requireCustomerSession } from "@/lib/session";

function maskToken(token = "") {
  if (token.length <= 14) return token;
  return `${token.slice(0, 8)}${"*".repeat(token.length - 14)}${token.slice(-6)}`;
}

function normalizeCall(call = {}) {
  const inputTokens = Number(call.promptTokens || call.inputTokens || 0);
  const outputTokens = Number(call.completionTokens || call.outputTokens || 0);
  const totalTokens = Number(call.tokens || call.totalTokens || inputTokens + outputTokens || 0);
  const statusCode = Number(call.status || 0);
  return {
    id: call.requestId || call.id,
    requestId: call.requestId || "",
    callId: call.callId || call.id,
    createdAt: call.createdAt,
    model: call.publicModelId || call.requestedModel || call.routedModel || call.model || "unknown",
    provider: "FlowAPI",
    inputTokens,
    outputTokens,
    totalTokens,
    costCny: Number(call.cost || call.costCny || 0),
    status: (call.billingStatus || call.deliveryStatus || "") === "success_completed" || (statusCode >= 200 && statusCode < 300 && !call.errorCode) ? "success" : statusCode ? "failed" : "unknown",
    billingStatus: call.billingStatus || "",
    deliveryStatus: call.deliveryStatus || "",
    requestIp: call.requestIp || "",
    deductionBreakdown: Array.isArray(call.deductionBreakdown) ? call.deductionBreakdown : [],
  };
}

function buildTrend(calls = []) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.now() - (6 - index) * 86400000).toISOString().slice(0, 10);
    return { date, inputTokens: 0, outputTokens: 0, totalTokens: 0, spendCny: 0 };
  });
  const byDate = new Map(days.map((item) => [item.date, item]));
  calls.forEach((call) => {
    const date = String(call.createdAt || "").slice(0, 10);
    const item = byDate.get(date);
    if (!item) return;
    item.inputTokens += call.inputTokens;
    item.outputTokens += call.outputTokens;
    item.totalTokens += call.totalTokens;
    item.spendCny = Number((item.spendCny + call.costCny).toFixed(6));
  });
  return days;
}

function buildModelRanking(calls = []) {
  const map = new Map();
  calls.forEach((call) => {
    const key = call.model || "unknown";
    const current = map.get(key) || { model: key, provider: "FlowAPI", requests: 0, tokens: 0, spendCny: 0 };
    current.requests += 1;
    current.tokens += call.totalTokens;
    current.spendCny = Number((current.spendCny + call.costCny).toFixed(6));
    map.set(key, current);
  });
  const totalTokens = calls.reduce((sum, call) => sum + call.totalTokens, 0);
  return [...map.values()]
    .sort((a, b) => b.tokens - a.tokens)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      share: totalTokens > 0 ? Number(((item.tokens / totalTokens) * 100).toFixed(1)) : 0,
    }));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { keyId } = req.query || {};
  if (!keyId) return res.status(400).json({ error: "缺少 keyId" });

  try {
    const session = requireCustomerSession(req, res);
    if (!session) return;
    const customer = await getDashboard(session.customerId);
    const apiKeys = customer?.apiKeys || [];
    const key = apiKeys.find((k) => k.id === keyId);
    if (!key) {
      return res.status(200).json({
        success: true,
        source: "empty",
        message: "该 API Key 已删除，无法查看使用数据。",
        key: null,
      });
    }

    const calls = (customer?.calls || [])
      .filter((call) => call.apiKeyId === key.id)
      .map(normalizeCall)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (!calls.length) {
      return res.status(200).json({
        success: true,
        source: "empty",
        message: "暂无真实调用记录",
        key: {
          id: key.id,
          name: key.label || "默认 API Key",
          maskedKey: maskToken(key.token),
          status: key.disabledAt ? "disabled" : (key.expiresAt && new Date(key.expiresAt) < new Date() ? "expired" : "active"),
          group: key.modelGroup || "default",
          createdAt: key.createdAt || new Date().toISOString(),
          lastUsedAt: key.lastUsedAt || null,
          expiresAt: key.expiresAt || null,
          modelDisplayName: key.modelDisplayName || "",
          publicModelId: key.publicModelId || "",
        },
        summary: null,
        periodUsage: null,
        limits: null,
        trends: [],
        modelRanking: [],
        recentCalls: [],
      });
    }

    const totalRequests = calls.length;
    const successCount = calls.filter((call) => call.status === "success").length;
    const totalTokens = calls.reduce((sum, call) => sum + call.totalTokens, 0);
    const totalSpend = calls.reduce((sum, call) => sum + call.costCny, 0);
    const todayKey = new Date().toISOString().slice(0, 10);
    const startOfWeek = Date.now() - 6 * 86400000;
    const startOfMonth = Date.now() - 29 * 86400000;
    const inRange = (call, start) => new Date(call.createdAt || 0).getTime() >= start;
    const summarize = (items) => ({
      spendCny: Number(items.reduce((sum, call) => sum + call.costCny, 0).toFixed(6)),
      tokens: items.reduce((sum, call) => sum + call.totalTokens, 0),
      requests: items.length,
    });

    return res.status(200).json({
      success: true,
      source: "real",
      key: {
        id: key.id,
        name: key.label || "默认 API Key",
        maskedKey: maskToken(key.token),
        status: key.disabledAt ? "disabled" : (key.expiresAt && new Date(key.expiresAt) < new Date() ? "expired" : "active"),
        group: key.modelGroup || "default",
        createdAt: key.createdAt || new Date().toISOString(),
        lastUsedAt: key.lastUsedAt || calls[0]?.createdAt || null,
        expiresAt: key.expiresAt || null,
        modelDisplayName: key.modelDisplayName || "",
        publicModelId: key.publicModelId || "",
      },
      summary: {
        totalSpendCny: Number(totalSpend.toFixed(6)),
        totalTokens,
        totalRequests,
        successRate: Number(((successCount / totalRequests) * 100).toFixed(1)),
        avgLatencyMs: null,
      },
      periodUsage: {
        today: summarize(calls.filter((call) => String(call.createdAt || "").slice(0, 10) === todayKey)),
        week: summarize(calls.filter((call) => inRange(call, startOfWeek))),
        month: summarize(calls.filter((call) => inRange(call, startOfMonth))),
      },
      limits: {
        remainingBalanceCny: Number(customer?.balance || 0),
        totalQuotaCny: null,
        dailyRequestLimit: null,
        dailyTokenLimit: null,
        rpm: null,
        tpm: null,
        allowedModels: key.publicModelId ? [key.publicModelId] : [],
      },
      trends: buildTrend(calls),
      modelRanking: buildModelRanking(calls),
      recentCalls: calls.slice(0, 20),
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

import { getDashboard, listCustomerCalls } from "@/lib/customer-store";
import { hasDatabase, query } from "@/lib/db";
import { requireCustomerSession } from "@/lib/session";
import { getUserWallet, listWalletTransactions } from "@/lib/wallet/ledger";
import { normalizeWalletTransaction, summarizeCalls } from "@/lib/billing/audit";

function normalizeLimit(value, fallback = 50, max = 200) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.floor(number)));
}

function normalizeCallRow(row = {}) {
  if (!row) return null;
  return {
    id: row.id || "",
    customerId: row.customer_id || row.customerId || "",
    apiKeyId: row.api_key_id || row.apiKeyId || "",
    requestId: row.request_id || row.requestId || "",
    endpoint: row.endpoint || "",
    requestedModel: row.requested_model || row.requestedModel || "",
    routedModel: row.routed_model || row.routedModel || "",
    publicModelId: row.public_model_id || row.publicModelId || "",
    actualModelId: row.actual_model_id || row.actualModelId || "",
    provider: row.provider || "",
    upstreamChannel: row.upstream_channel || row.upstreamChannel || "",
    upstreamProvider: row.upstream_provider || row.upstreamProvider || "",
    upstreamStatus: Number(row.upstream_status || row.upstreamStatus || 0),
    latencyMs: Number(row.latency_ms || row.latencyMs || 0),
    firstTokenMs: Number(row.first_token_ms || row.firstTokenMs || 0),
    status: Number(row.status || 0),
    promptTokens: Number(row.prompt_tokens || row.promptTokens || 0),
    completionTokens: Number(row.completion_tokens || row.completionTokens || 0),
    totalTokens: Number(row.total_tokens || row.totalTokens || row.tokens || 0),
    tokens: Number(row.tokens || row.total_tokens || 0),
    cost: Number(row.cost || 0),
    userCharge: Number(row.user_charge || row.userCharge || row.cost || 0),
    sellPriceCny: Number(row.sell_price_cny || row.sellPriceCny || row.cost || 0),
    upstreamCostCny: Number(row.upstream_cost_cny || row.upstreamCostCny || 0),
    profitCny: Number(row.profit_cny || row.profitCny || 0),
    profitMargin: Number(row.profit_margin || row.profitMargin || 0),
    billingMode: row.billing_mode || row.billingMode || "",
    routeStrategy: row.route_strategy || row.routeStrategy || "",
    routeAttempts: Number(row.route_attempts || row.routeAttempts || 0),
    isStream: Boolean(row.is_stream || row.isStream),
    errorCode: row.error_code || row.errorCode || "",
    errorMessage: row.error_message || row.errorMessage || "",
    createdAt: row.created_at || row.createdAt || "",
  };
}

async function listCallsByRequestId(customerId, requestId, limit) {
  if (!requestId) return [];
  if (!hasDatabase()) {
    return (await listCustomerCalls(customerId, { limit: 1000 }))
      .filter((call) => call.requestId === requestId)
      .slice(0, limit);
  }
  const result = await query(
    `SELECT *
     FROM calls
     WHERE customer_id = $1 AND request_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [customerId, requestId, limit]
  ).catch(() => null);
  return (result?.rows || []).map(normalizeCallRow).filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const requestId = String(req.query.requestId || req.query.request_id || "").trim();
  if (!requestId) return res.status(400).json({ error: "缺少 requestId" });

  const limit = normalizeLimit(req.query.limit, 50, 200);
  const [customer, wallet, calls, transactions] = await Promise.all([
    getDashboard(session.customerId),
    getUserWallet(session.customerId),
    listCallsByRequestId(session.customerId, requestId, limit),
    listWalletTransactions(session.customerId, { limit: 200 }),
  ]);

  if (!customer) return res.status(404).json({ error: "用户不存在" });

  const requestTransactions = transactions
    .map(normalizeWalletTransaction)
    .filter((item) => item && (item.requestId === requestId || item.relatedCallId === requestId || item.relatedOrderId === requestId));

  const summary = summarizeCalls(calls);
  const latestCall = calls[0] || null;

  return res.status(200).json({
    ok: true,
    success: true,
    userId: session.customerId,
    requestId,
    updatedAt: new Date().toISOString(),
    wallet: wallet || null,
    summary,
    call: latestCall,
    calls,
    transactions: requestTransactions,
  });
}

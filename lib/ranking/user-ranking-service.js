import { hasDatabase, query } from "@/lib/db";
import { getDashboard } from "@/lib/customer-store";

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeRow(row = {}) {
  return {
    id: row.id,
    name: row.name || "",
    email: row.email || "",
    company: row.company || "",
    balanceCny: toNumber(row.balance || 0),
    totalSpendCny: toNumber(row.total_spend_cny || row.total_spend || 0),
    totalRequests: toNumber(row.total_requests || 0),
    totalTokens: toNumber(row.total_tokens || 0),
    successRequests: toNumber(row.success_requests || 0),
    activeDays: toNumber(row.active_days || 0),
    lastCallAt: row.last_call_at ? new Date(row.last_call_at).toISOString() : null,
    usdTokenBalance: toNumber(row.usd_token_balance || 0),
    usdTokenTotalObtained: toNumber(row.usd_token_total_obtained || 0),
    usdTokenTotalUsed: toNumber(row.usd_token_total_used || 0),
    usdTokenBonusTotal: toNumber(row.usd_token_bonus_total || 0),
    usdTokenReferralTotal: toNumber(row.usd_token_referral_total || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

function rankWithin(rows, comparator, currentId) {
  const ranked = [...rows].sort(comparator);
  const index = ranked.findIndex((row) => row.id === currentId);
  if (index < 0) return null;
  return { rank: index + 1, total: ranked.length, current: ranked[index] };
}

function buildPercentile(rankInfo) {
  if (!rankInfo || !rankInfo.total) return null;
  return Math.max(1, Math.ceil((rankInfo.rank / rankInfo.total) * 100));
}

function buildBeatsPercent(rankInfo) {
  if (!rankInfo || !rankInfo.total) return null;
  return Math.max(0, Math.round(((rankInfo.total - rankInfo.rank) / rankInfo.total) * 100));
}

async function fetchDatabaseRows() {
  const result = await query(`
    WITH call_stats AS (
      SELECT
        customer_id,
        COUNT(*)::int AS total_requests,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COALESCE(SUM(COALESCE(sell_price_cny, cost, 0)), 0) AS total_spend_cny,
        COUNT(*) FILTER (WHERE status >= 200 AND status < 300)::int AS success_requests,
        COUNT(DISTINCT DATE(created_at AT TIME ZONE 'Asia/Shanghai'))::int AS active_days,
        MAX(created_at) AS last_call_at
      FROM calls
      GROUP BY customer_id
    ),
    wallet_stats AS (
      SELECT
        user_id AS customer_id,
        COALESCE(usd_token_balance, 0) AS usd_token_balance,
        COALESCE(usd_token_total_obtained, 0) AS usd_token_total_obtained,
        COALESCE(usd_token_total_used, 0) AS usd_token_total_used,
        COALESCE(usd_token_bonus_total, 0) AS usd_token_bonus_total,
        COALESCE(usd_token_referral_total, 0) AS usd_token_referral_total
      FROM user_wallets
    )
    SELECT
      c.id,
      c.name,
      c.email,
      c.company,
      c.balance,
      c.total_spend,
      c.created_at,
      COALESCE(cs.total_requests, 0) AS total_requests,
      COALESCE(cs.total_tokens, 0) AS total_tokens,
      COALESCE(cs.total_spend_cny, 0) AS total_spend_cny,
      COALESCE(cs.success_requests, 0) AS success_requests,
      COALESCE(cs.active_days, 0) AS active_days,
      cs.last_call_at,
      COALESCE(ws.usd_token_balance, 0) AS usd_token_balance,
      COALESCE(ws.usd_token_total_obtained, 0) AS usd_token_total_obtained,
      COALESCE(ws.usd_token_total_used, 0) AS usd_token_total_used,
      COALESCE(ws.usd_token_bonus_total, 0) AS usd_token_bonus_total,
      COALESCE(ws.usd_token_referral_total, 0) AS usd_token_referral_total
    FROM customers c
    LEFT JOIN call_stats cs ON cs.customer_id = c.id
    LEFT JOIN wallet_stats ws ON ws.customer_id = c.id
    WHERE c.status IS DISTINCT FROM 'deleted'
    ORDER BY COALESCE(cs.total_spend_cny, 0) DESC, COALESCE(cs.total_tokens, 0) DESC, c.created_at ASC
  `);
  return (result?.rows || []).map(normalizeRow);
}

function buildRankingFromRows(rows, customerId) {
  if (!rows.length) return null;
  const current = rows.find((row) => row.id === customerId);
  if (!current) return null;

  const spendRank = rankWithin(rows, (a, b) => (
    (b.totalSpendCny - a.totalSpendCny)
    || (b.totalTokens - a.totalTokens)
    || (b.totalRequests - a.totalRequests)
    || new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  ), customerId);

  const tokenRank = rankWithin(rows, (a, b) => (
    (b.totalTokens - a.totalTokens)
    || (b.totalSpendCny - a.totalSpendCny)
    || (b.totalRequests - a.totalRequests)
    || new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  ), customerId);

  return {
    source: "db",
    ok: true,
    totalUsers: rows.length,
    totalSpendCny: Number(current.totalSpendCny.toFixed(6)),
    totalTokens: Math.round(current.totalTokens),
    totalRequests: Math.round(current.totalRequests),
    successRequests: Math.round(current.successRequests),
    activeDays: Math.round(current.activeDays),
    lastCallAt: current.lastCallAt,
    wallet: {
      balanceCny: Number(current.balanceCny.toFixed(6)),
      usdTokenBalance: Number(current.usdTokenBalance.toFixed(6)),
      usdTokenTotalObtained: Number(current.usdTokenTotalObtained.toFixed(6)),
      usdTokenTotalUsed: Number(current.usdTokenTotalUsed.toFixed(6)),
      usdTokenBonusTotal: Number(current.usdTokenBonusTotal.toFixed(6)),
      usdTokenReferralTotal: Number(current.usdTokenReferralTotal.toFixed(6)),
    },
    spendRank: spendRank?.rank || null,
    tokenRank: tokenRank?.rank || null,
    spendPercentileTop: buildPercentile(spendRank),
    tokenPercentileTop: buildPercentile(tokenRank),
    spendBeatsUsersPercent: buildBeatsPercent(spendRank),
    tokenBeatsUsersPercent: buildBeatsPercent(tokenRank),
    rankUpdatedAt: new Date().toISOString(),
  };
}

function buildMemoryFallback(customer = null) {
  if (!customer) return null;
  const calls = Array.isArray(customer.calls) ? customer.calls : [];
  const totalSpendCny = calls.reduce((sum, call) => sum + toNumber(call.cost || 0), 0);
  const totalTokens = calls.reduce((sum, call) => sum + toNumber(call.tokens || 0), 0);
  const totalRequests = calls.length;
  const wallet = customer.availableBalance != null ? customer.availableBalance : customer.balance;
  const spendPercentileTop = totalSpendCny > 0 ? Math.max(1, totalSpendCny >= 300 ? 8 : totalSpendCny >= 100 ? 18 : totalSpendCny >= 1 ? 36 : 88) : null;
  const tokenPercentileTop = totalTokens > 0 ? Math.max(1, totalTokens >= 1000000 ? 1 : totalTokens >= 300000 ? 9 : totalTokens >= 1 ? 28 : 92) : null;

  return {
    source: "memory",
    ok: true,
    totalUsers: null,
    totalSpendCny: Number(totalSpendCny.toFixed(6)),
    totalTokens: Math.round(totalTokens),
    totalRequests,
    successRequests: calls.filter((call) => Number(call.status || 0) >= 200 && Number(call.status || 0) < 300).length,
    activeDays: new Set(calls.map((call) => String(call.createdAt || "").slice(0, 10)).filter(Boolean)).size,
    lastCallAt: calls[0]?.createdAt || null,
    wallet: {
      balanceCny: Number(toNumber(wallet).toFixed(6)),
      usdTokenBalance: 0,
      usdTokenTotalObtained: 0,
      usdTokenTotalUsed: 0,
      usdTokenBonusTotal: 0,
      usdTokenReferralTotal: 0,
    },
    spendRank: totalSpendCny > 0 ? 1 : null,
    tokenRank: totalTokens > 0 ? 1 : null,
    spendPercentileTop,
    tokenPercentileTop,
    spendBeatsUsersPercent: spendPercentileTop ? Math.max(1, 100 - spendPercentileTop) : null,
    tokenBeatsUsersPercent: tokenPercentileTop ? Math.max(1, 100 - tokenPercentileTop) : null,
    rankUpdatedAt: new Date().toISOString(),
  };
}

export async function getUserAssetRanking(customerId = "") {
  const cleanCustomerId = String(customerId || "").trim();
  if (!cleanCustomerId) return null;

  if (!hasDatabase()) {
    const customer = await getDashboard(cleanCustomerId);
    return buildMemoryFallback(customer);
  }

  const [customerResult, rows] = await Promise.all([
    query("SELECT id, status FROM customers WHERE id = $1 LIMIT 1", [cleanCustomerId]),
    fetchDatabaseRows(),
  ]);

  if (!customerResult?.rows?.[0]) return null;
  return buildRankingFromRows(rows, cleanCustomerId);
}

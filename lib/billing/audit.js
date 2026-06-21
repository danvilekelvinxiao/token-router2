function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function normalizeWalletTransaction(row = {}) {
  if (!row) return null;
  return {
    id: row.id || "",
    userId: row.userId || row.user_id || "",
    workspaceId: row.workspaceId || row.workspace_id || "",
    requestId: row.requestId || row.request_id || "",
    transactionType: row.transactionType || row.transaction_type || row.type || "",
    tokenAmount: toNumber(row.tokenAmount ?? row.token_amount),
    moneyAmount: toNumber(row.moneyAmount ?? row.money_amount),
    balanceBefore: toNumber(row.balanceBefore ?? row.balance_before),
    balanceAfter: toNumber(row.balanceAfter ?? row.balance_after),
    relatedLogId: row.relatedLogId || row.related_log_id || "",
    type: row.type || row.transactionType || "",
    currency: row.currency || "USD_TOKEN",
    amount: toNumber(row.amount),
    exchangeRate: toNumber(row.exchangeRate ?? row.exchange_rate),
    relatedUserId: row.relatedUserId || row.related_user_id || "",
    relatedOrderId: row.relatedOrderId || row.related_order_id || "",
    relatedCallId: row.relatedCallId || row.related_call_id || "",
    description: row.description || "",
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
  };
}

export function summarizeCalls(calls = []) {
  return calls.reduce((acc, call) => {
    const status = Number(call?.status || 0);
    acc.total += 1;
    acc.totalTokens += toNumber(call?.totalTokens ?? call?.tokens ?? call?.promptTokens + call?.completionTokens);
    acc.totalCost += toNumber(call?.cost ?? call?.userCharge ?? call?.sellPriceCny);
    if (status >= 200 && status < 300) {
      acc.success += 1;
    } else {
      acc.failure += 1;
    }
    if (status === 408 || status === 504) acc.timeout += 1;
    if (status === 429) acc.rateLimited += 1;
    return acc;
  }, {
    total: 0,
    success: 0,
    failure: 0,
    timeout: 0,
    rateLimited: 0,
    totalTokens: 0,
    totalCost: 0,
  });
}

import { getPool, hasDatabase, query } from "@/lib/db";

export const USD_TOKEN_PER_CNY = 5;

const memory = globalThis.__FLOWAPI_WALLET_LEDGER__ || {
  wallets: [],
  transactions: [],
};

globalThis.__FLOWAPI_WALLET_LEDGER__ = memory;

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function queryRunner(dbClient = null) {
  return dbClient ? dbClient.query.bind(dbClient) : query;
}

async function withWalletLock(userId, dbClient, handler) {
  if (!hasDatabase()) {
    return handler(null, await fetchWallet(userId));
  }

  const manageConnection = !dbClient;
  const client = dbClient || await getPool()?.connect?.();
  if (!client) {
    return handler(null, await fetchWallet(userId));
  }

  if (manageConnection) {
    await client.query("BEGIN");
  }

  try {
    await client.query(
      `INSERT INTO user_wallets (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const beforeResult = await client.query(
      "SELECT * FROM user_wallets WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    const before = rowToWallet(beforeResult.rows[0]);
    const result = await handler(client, before);
    if (manageConnection) {
      await client.query("COMMIT");
    }
    return result;
  } catch (error) {
    if (manageConnection) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }
    throw error;
  } finally {
    if (manageConnection) {
      client.release();
    }
  }
}

function rowToWallet(row = {}) {
  if (!row) return null;
  return {
    userId: row.user_id || row.userId || "",
    cnyRechargeTotal: toNumber(row.cny_recharge_total || row.cnyRechargeTotal),
    cnyPaidTotal: toNumber(row.cny_paid_total || row.cnyPaidTotal),
    cnyRefundTotal: toNumber(row.cny_refund_total || row.cnyRefundTotal),
    usdTokenBalance: toNumber(row.usd_token_balance || row.usdTokenBalance),
    usdTokenTotalObtained: toNumber(row.usd_token_total_obtained || row.usdTokenTotalObtained),
    usdTokenTotalUsed: toNumber(row.usd_token_total_used || row.usdTokenTotalUsed),
    usdTokenBonusTotal: toNumber(row.usd_token_bonus_total || row.usdTokenBonusTotal),
    usdTokenReferralTotal: toNumber(row.usd_token_referral_total || row.usdTokenReferralTotal),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt || nowIso(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : row.updatedAt || nowIso(),
  };
}

function cloneMemoryWallet(userId) {
  let wallet = memory.wallets.find((item) => item.userId === userId);
  if (!wallet) {
    wallet = {
      userId,
      cnyRechargeTotal: 0,
      cnyPaidTotal: 0,
      cnyRefundTotal: 0,
      usdTokenBalance: 0,
      usdTokenTotalObtained: 0,
      usdTokenTotalUsed: 0,
      usdTokenBonusTotal: 0,
      usdTokenReferralTotal: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    memory.wallets.push(wallet);
  }
  return wallet;
}

async function ensureWalletRow(userId, dbClient = null) {
  if (!userId) return null;
  if (!hasDatabase()) return cloneMemoryWallet(userId);
  const runQuery = queryRunner(dbClient);

  await runQuery(
    `INSERT INTO user_wallets (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  const result = await runQuery("SELECT * FROM user_wallets WHERE user_id = $1 LIMIT 1", [userId]);
  return rowToWallet(result.rows[0]);
}

async function persistWallet(userId, patch = {}, dbClient = null) {
  if (!userId) return null;
  if (!hasDatabase()) {
    const wallet = cloneMemoryWallet(userId);
    Object.assign(wallet, patch, { updatedAt: nowIso() });
    return rowToWallet(wallet);
  }
  const runQuery = queryRunner(dbClient);

  const columns = [];
  const values = [userId];
  const add = (column, value) => {
    values.push(value);
    columns.push(`${column} = $${values.length}`);
  };
  if (patch.cnyRechargeTotal != null) add("cny_recharge_total", patch.cnyRechargeTotal);
  if (patch.cnyPaidTotal != null) add("cny_paid_total", patch.cnyPaidTotal);
  if (patch.cnyRefundTotal != null) add("cny_refund_total", patch.cnyRefundTotal);
  if (patch.usdTokenBalance != null) add("usd_token_balance", patch.usdTokenBalance);
  if (patch.usdTokenTotalObtained != null) add("usd_token_total_obtained", patch.usdTokenTotalObtained);
  if (patch.usdTokenTotalUsed != null) add("usd_token_total_used", patch.usdTokenTotalUsed);
  if (patch.usdTokenBonusTotal != null) add("usd_token_bonus_total", patch.usdTokenBonusTotal);
  if (patch.usdTokenReferralTotal != null) add("usd_token_referral_total", patch.usdTokenReferralTotal);
  if (!columns.length) return ensureWalletRow(userId, dbClient);
  const result = await runQuery(
    `UPDATE user_wallets SET ${columns.join(", ")}, updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    values
  );
  return rowToWallet(result.rows[0]);
}

async function fetchWallet(userId, dbClient = null) {
  if (!userId) return null;
  if (!hasDatabase()) return rowToWallet(cloneMemoryWallet(userId));
  const runQuery = queryRunner(dbClient);
  const result = await runQuery("SELECT * FROM user_wallets WHERE user_id = $1 LIMIT 1", [userId]);
  if (result.rows[0]) return rowToWallet(result.rows[0]);
  return ensureWalletRow(userId, dbClient);
}

async function recordWalletTransaction(entry = {}, dbClient = null) {
  const payload = {
    id: makeId("wtx"),
    userId: String(entry.userId || "").trim(),
    workspaceId: String(entry.workspaceId || "").trim(),
    requestId: String(entry.requestId || "").trim(),
    transactionType: String(entry.transactionType || entry.type || "").trim(),
    tokenAmount: toNumber(entry.tokenAmount || entry.amountToken || 0),
    moneyAmount: toNumber(entry.moneyAmount || entry.amountCny || 0),
    balanceBefore: toNumber(entry.balanceBefore || 0),
    balanceAfter: toNumber(entry.balanceAfter || 0),
    relatedLogId: String(entry.relatedLogId || entry.relatedCallId || entry.relatedOrderId || "").trim(),
    type: String(entry.type || entry.transactionType || "").trim(),
    currency: String(entry.currency || "USD_TOKEN").trim() || "USD_TOKEN",
    amount: toNumber(entry.amount || entry.tokenAmount || entry.moneyAmount || 0),
    exchangeRate: toNumber(entry.exchangeRate || 0),
    relatedUserId: String(entry.relatedUserId || "").trim(),
    relatedOrderId: String(entry.relatedOrderId || "").trim(),
    relatedCallId: String(entry.relatedCallId || "").trim(),
    description: String(entry.description || "").trim(),
    createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : nowIso(),
  };

  if (!payload.userId) return null;

  if (!hasDatabase()) {
    memory.transactions.unshift(payload);
    memory.transactions = memory.transactions.slice(0, 5000);
    return payload;
  }
  const runQuery = queryRunner(dbClient);

  await runQuery(
    `INSERT INTO wallet_transactions (
      id, user_id, workspace_id, request_id, transaction_type,
      token_amount, money_amount, balance_before, balance_after,
      related_log_id, type, currency, amount, exchange_rate,
      related_user_id, related_order_id, related_call_id, description, created_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12, $13, $14,
      $15, $16, $17, $18, NOW()
    )`,
    [
      payload.id,
      payload.userId,
      payload.workspaceId || null,
      payload.requestId,
      payload.transactionType,
      payload.tokenAmount,
      payload.moneyAmount,
      payload.balanceBefore,
      payload.balanceAfter,
      payload.relatedLogId,
      payload.type,
      payload.currency,
      payload.amount,
      payload.exchangeRate,
      payload.relatedUserId || null,
      payload.relatedOrderId || null,
      payload.relatedCallId || null,
      payload.description,
    ]
  );
  return payload;
}

export async function recordUsagePackageDeduction({
  userId,
  tokenAmount,
  balanceBefore = 0,
  balanceAfter = 0,
  relatedCallId = "",
  relatedOrderId = "",
  description = "",
  workspaceId = "",
} = {}) {
  const amount = toNumber(tokenAmount);
  if (!userId || amount <= 0) return null;

  return recordWalletTransaction({
    userId,
    workspaceId,
    type: "usage_package_deduct",
    transactionType: "usage_package_deduct",
    currency: "USD_TOKEN",
    amount,
    tokenAmount: amount,
    balanceBefore: toNumber(balanceBefore),
    balanceAfter: toNumber(balanceAfter),
    relatedCallId,
    relatedOrderId,
    description: description || `套餐额度扣费 ${amount.toFixed(2)} Token`,
  });
}

export async function recordTemporaryCreditDeduction({
  userId,
  cnyAmount,
  tokenAmount,
  balanceBefore = 0,
  balanceAfter = 0,
  relatedCallId = "",
  relatedOrderId = "",
  description = "",
  workspaceId = "",
} = {}) {
  const amountCny = toNumber(cnyAmount);
  const amountToken = toNumber(tokenAmount);
  if (!userId || (amountCny <= 0 && amountToken <= 0)) return null;

  return recordWalletTransaction({
    userId,
    workspaceId,
    type: "usage_temporary_credit_deduct",
    transactionType: "usage_temporary_credit_deduct",
    currency: "CNY",
    amount: amountCny || amountToken / USD_TOKEN_PER_CNY,
    moneyAmount: amountCny || amountToken / USD_TOKEN_PER_CNY,
    tokenAmount: amountToken || amountCny * USD_TOKEN_PER_CNY,
    balanceBefore: toNumber(balanceBefore),
    balanceAfter: toNumber(balanceAfter),
    relatedCallId,
    relatedOrderId,
    description: description || `临时额度抵扣 ${Number(amountCny || amountToken / USD_TOKEN_PER_CNY).toFixed(2)} CNY`,
  });
}

export async function getUserWallet(userId) {
  return fetchWallet(userId);
}

export async function hasWalletTransaction({
  userId,
  relatedOrderId = "",
  transactionType = "",
  type = "",
} = {}, dbClient = null) {
  if (!userId) return false;
  if (!hasDatabase()) {
    return memory.transactions.some((entry) => (
      entry.userId === userId
      && (!relatedOrderId || entry.relatedOrderId === relatedOrderId)
      && (!transactionType || entry.transactionType === transactionType)
      && (!type || entry.type === type)
    ));
  }
  const runQuery = queryRunner(dbClient);
  const result = await runQuery(
    `SELECT 1
     FROM wallet_transactions
     WHERE user_id = $1
       AND ($2::text = '' OR related_order_id = $2)
       AND ($3::text = '' OR transaction_type = $3)
       AND ($4::text = '' OR type = $4)
     LIMIT 1`,
    [userId, relatedOrderId, transactionType, type]
  );
  return Boolean(result.rows[0]);
}

export async function creditRechargeWallet({
  userId,
  cnyAmount,
  relatedOrderId = "",
  description = "",
  workspaceId = "",
  mirrorLegacyBalance = true,
  dbClient = null,
} = {}) {
  const amount = toNumber(cnyAmount);
  if (!userId || amount <= 0) return null;

  const run = async (client, before) => {
    const updated = await persistWallet(userId, {
      cnyRechargeTotal: toNumber(before?.cnyRechargeTotal) + amount,
      cnyPaidTotal: toNumber(before?.cnyPaidTotal) + amount,
      usdTokenBalance: toNumber(before?.usdTokenBalance) + amount * USD_TOKEN_PER_CNY,
      usdTokenTotalObtained: toNumber(before?.usdTokenTotalObtained) + amount * USD_TOKEN_PER_CNY,
    }, client);

    await recordWalletTransaction({
      userId,
      workspaceId,
      type: "cny_recharge",
      transactionType: "cny_recharge",
      currency: "CNY",
      amount,
      moneyAmount: amount,
      balanceBefore: toNumber(before?.cnyPaidTotal),
      balanceAfter: toNumber(updated?.cnyPaidTotal),
      exchangeRate: USD_TOKEN_PER_CNY,
      relatedOrderId,
      description: description || `人民币充值 ¥${amount.toFixed(2)}`,
    }, client);
    await recordWalletTransaction({
      userId,
      workspaceId,
      type: "exchange_to_usd_token",
      transactionType: "exchange_to_usd_token",
      currency: "USD_TOKEN",
      amount: amount * USD_TOKEN_PER_CNY,
      tokenAmount: amount * USD_TOKEN_PER_CNY,
      balanceBefore: toNumber(before?.usdTokenBalance),
      balanceAfter: toNumber(updated?.usdTokenBalance),
      exchangeRate: USD_TOKEN_PER_CNY,
      relatedOrderId,
      description: description || `充值 ¥${amount.toFixed(2)}，兑换 ${Number(amount * USD_TOKEN_PER_CNY).toFixed(2)} Token`,
    }, client);

    return {
      before,
      wallet: updated,
      creditedTokenAmount: amount * USD_TOKEN_PER_CNY,
      legacyBalanceMirror: mirrorLegacyBalance ? amount : 0,
    };
  };

  if (!hasDatabase()) {
    return run(null, await fetchWallet(userId, dbClient));
  }

  return withWalletLock(userId, dbClient, run);
}

export async function grantWalletTokenBonus({
  userId,
  tokenAmount,
  type = "admin_adjustment",
  description = "",
  relatedUserId = "",
  relatedOrderId = "",
  relatedCallId = "",
  workspaceId = "",
  dbClient = null,
} = {}) {
  const amount = toNumber(tokenAmount);
  if (!userId || amount <= 0) return null;

  const run = async (client, before) => {
    const updated = await persistWallet(userId, {
      usdTokenBalance: toNumber(before?.usdTokenBalance) + amount,
      usdTokenTotalObtained: toNumber(before?.usdTokenTotalObtained) + amount,
      usdTokenBonusTotal: toNumber(before?.usdTokenBonusTotal) + (type === "referral_bonus_inviter" || type === "referral_bonus_invitee" ? amount : 0),
      usdTokenReferralTotal: toNumber(before?.usdTokenReferralTotal) + (type === "referral_bonus_inviter" || type === "referral_bonus_invitee" ? amount : 0),
    }, client);

    await recordWalletTransaction({
      userId,
      workspaceId,
      type,
      transactionType: type,
      currency: "USD_TOKEN",
      amount,
      tokenAmount: amount,
      balanceBefore: toNumber(before?.usdTokenBalance),
      balanceAfter: toNumber(updated?.usdTokenBalance),
      exchangeRate: 0,
      relatedUserId,
      relatedOrderId,
      relatedCallId,
      description: description || `Token 资金入账 ${amount.toFixed(2)}`,
    }, client);

    return { before, wallet: updated };
  };

  if (!hasDatabase()) {
    return run(null, await fetchWallet(userId));
  }

  return withWalletLock(userId, dbClient, run);
}

export async function deductWalletTokens({
  userId,
  tokenAmount,
  relatedCallId = "",
  relatedOrderId = "",
  description = "",
  workspaceId = "",
  dbClient = null,
} = {}) {
  const amount = toNumber(tokenAmount);
  if (!userId || amount <= 0) return { ok: true, deducted: 0, wallet: await fetchWallet(userId) };
  const run = async (client, before) => {
    if (toNumber(before?.usdTokenBalance) < amount) {
      return {
        ok: false,
        error: "USD Token 钱包余额不足",
        wallet: before,
      };
    }

    const updated = await persistWallet(userId, {
      usdTokenBalance: toNumber(before?.usdTokenBalance) - amount,
      usdTokenTotalUsed: toNumber(before?.usdTokenTotalUsed) + amount,
    }, client);

    await recordWalletTransaction({
      userId,
      workspaceId,
      type: "usage_wallet_deduct",
      transactionType: "usage_wallet_deduct",
      currency: "USD_TOKEN",
      amount,
      tokenAmount: amount,
      balanceBefore: toNumber(before?.usdTokenBalance),
      balanceAfter: toNumber(updated?.usdTokenBalance),
      relatedCallId,
      relatedOrderId,
      description: description || `模型调用扣费 ${amount.toFixed(2)} Token`,
    }, client);

    return { ok: true, deducted: amount, wallet: updated, before };
  };

  if (!hasDatabase()) {
    const before = await fetchWallet(userId);
    if (toNumber(before?.usdTokenBalance) < amount) {
      return {
        ok: false,
        error: "USD Token 钱包余额不足",
        wallet: before,
      };
    }
    return run(null, before);
  }

  return withWalletLock(userId, dbClient, run);
}

export async function refundWalletTokens({
  userId,
  tokenAmount,
  relatedCallId = "",
  relatedOrderId = "",
  description = "",
  workspaceId = "",
  dbClient = null,
} = {}) {
  const amount = toNumber(tokenAmount);
  if (!userId || amount <= 0) return { ok: true, refunded: 0, wallet: await fetchWallet(userId) };
  const run = async (client, before) => {
    const updated = await persistWallet(userId, {
      usdTokenBalance: toNumber(before?.usdTokenBalance) + amount,
      usdTokenTotalUsed: Math.max(0, toNumber(before?.usdTokenTotalUsed) - amount),
    }, client);

    await recordWalletTransaction({
      userId,
      workspaceId,
      type: "usage_wallet_refund",
      transactionType: "usage_wallet_refund",
      currency: "USD_TOKEN",
      amount,
      tokenAmount: amount,
      balanceBefore: toNumber(before?.usdTokenBalance),
      balanceAfter: toNumber(updated?.usdTokenBalance),
      relatedCallId,
      relatedOrderId,
      description: description || `模型调用退款 ${amount.toFixed(2)} Token`,
    }, client);

    return { ok: true, refunded: amount, wallet: updated, before };
  };

  if (!hasDatabase()) {
    return run(null, await fetchWallet(userId));
  }

  return withWalletLock(userId, dbClient, run);
}

export async function refundRechargeCny({
  userId,
  cnyAmount,
  relatedOrderId = "",
  description = "",
  workspaceId = "",
} = {}) {
  const amount = toNumber(cnyAmount);
  if (!userId || amount <= 0) return { ok: true, refunded: 0, wallet: await fetchWallet(userId) };
  const before = await fetchWallet(userId);
  const updated = await persistWallet(userId, {
    cnyRefundTotal: toNumber(before?.cnyRefundTotal) + amount,
  });

  await recordWalletTransaction({
    userId,
    workspaceId,
    type: "cny_refund",
    transactionType: "cny_refund",
    currency: "CNY",
    amount,
    moneyAmount: amount,
    balanceBefore: toNumber(before?.cnyPaidTotal),
    balanceAfter: toNumber(updated?.cnyPaidTotal),
    exchangeRate: USD_TOKEN_PER_CNY,
    relatedOrderId,
    description: description || `人民币退款 ¥${amount.toFixed(2)}`,
  });

  return { ok: true, refunded: amount, wallet: updated, before };
}

export async function addWalletReferralBonus({
  userId,
  tokenAmount,
  relatedUserId = "",
  relatedOrderId = "",
  description = "",
  type = "referral_bonus_inviter",
  workspaceId = "",
  dbClient = null,
} = {}) {
  const amount = toNumber(tokenAmount);
  if (!userId || amount <= 0) return { ok: true, bonus: 0, wallet: await fetchWallet(userId) };

  const before = await fetchWallet(userId);
  const updated = await persistWallet(userId, {
    usdTokenBalance: toNumber(before?.usdTokenBalance) + amount,
    usdTokenTotalObtained: toNumber(before?.usdTokenTotalObtained) + amount,
    usdTokenBonusTotal: toNumber(before?.usdTokenBonusTotal) + amount,
    usdTokenReferralTotal: toNumber(before?.usdTokenReferralTotal) + amount,
  });

  await recordWalletTransaction({
    userId,
    workspaceId,
    type,
    transactionType: type,
    currency: "USD_TOKEN",
    amount,
    tokenAmount: amount,
    balanceBefore: toNumber(before?.usdTokenBalance),
    balanceAfter: toNumber(updated?.usdTokenBalance),
    relatedUserId,
    relatedOrderId,
    description: description || `邀请奖励 ${amount.toFixed(2)} Token`,
  });

  return { ok: true, bonus: amount, wallet: updated, before };
}

export async function listWalletTransactions(userId, { limit = 50 } = {}) {
  if (!userId) return [];
  if (!hasDatabase()) {
    return memory.transactions.filter((item) => item.userId === userId).slice(0, limit);
  }
  const result = await query(
    `SELECT * FROM wallet_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, Number(limit) || 50]
  );
  return result.rows;
}

export async function auditWalletConsistency({ userId = "", limit = 200 } = {}) {
  if (!hasDatabase()) {
    const wallets = userId ? memory.wallets.filter((item) => item.userId === userId) : memory.wallets;
    return wallets.map((wallet) => ({
      userId: wallet.userId,
      wallet,
      ok: true,
    }));
  }

  const params = [];
  const where = userId ? `WHERE user_id = $1` : "";
  if (userId) params.push(userId);
  params.push(Number(limit) || 200);
  const walletRows = await query(
    `SELECT * FROM user_wallets ${where} ORDER BY updated_at DESC LIMIT $${params.length}`,
    params
  );
  return walletRows.rows.map((row) => ({
    userId: row.user_id,
    wallet: rowToWallet(row),
    ok: true,
  }));
}

import crypto from "crypto";
import { hasDatabase, query } from "@/lib/db";
import { getPool } from "@/lib/db";
import { formatApiMoney, formatApiMoneyPrecise, formatRechargeRate, formatRmb, parseDecimalAmount, roundDecimal } from "./money";
import { formatWalletSourceLine, isExpirableWalletSource, resolveWalletSource } from "./source";

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundApi(value) {
  return Number(roundDecimal(value, 6));
}

function roundRmb(value) {
  return Number(roundDecimal(value, 2));
}

function rowToWallet(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    apiBalance: Number(row.api_balance || 0),
    frozenApiBalance: Number(row.frozen_api_balance || 0),
    totalRechargedRmb: Number(row.total_recharged_rmb || 0),
    totalGrantedApi: Number(row.total_granted_api || 0),
    totalConsumedApi: Number(row.total_consumed_api || 0),
    status: row.status || "active",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

function rowToWalletConfig(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    description: row.description || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

function rowToRechargeOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderNo: row.order_no,
    userId: row.user_id,
    amountRmb: Number(row.amount_rmb || 0),
    amountApi: Number(row.amount_api || 0),
    exchangeRate: Number(row.exchange_rate || 5),
    status: row.status || "pending",
    paymentMethod: row.payment_method || "manual",
    paymentProof: row.payment_proof || "",
    remark: row.remark || "",
    rejectReason: row.reject_reason || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    reviewedBy: row.reviewed_by || "",
  };
}

function rowToTransaction(row) {
  if (!row) return null;
  const metadata = row.metadata && typeof row.metadata === "string" ? JSON.parse(row.metadata || "{}") : (row.metadata || {});
  return {
    id: row.id,
    userId: row.user_id,
    walletId: row.wallet_id,
    type: row.type,
    sourceType: row.source_type || "",
    sourceLabel: row.source_label || "",
    sourceDetail: row.source_detail || "",
    operatorType: row.operator_type || "",
    operatorId: row.operator_id || "",
    operatorName: row.operator_name || "",
    amountApi: Number(row.amount_api || 0),
    balanceBeforeApi: Number(row.balance_before_api || 0),
    balanceAfterApi: Number(row.balance_after_api || 0),
    relatedOrderId: row.related_order_id || "",
    relatedRequestId: row.related_request_id || "",
    modelName: row.model_name || "",
    description: row.description || "",
    relatedPackageId: row.related_package_id || "",
    relatedMembershipId: row.related_membership_id || "",
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    isExpirable: Boolean(row.is_expirable),
    metadata,
    amountApiDisplay: formatApiMoneyPrecise(row.amount_api, 6),
    balanceBeforeApiDisplay: formatApiMoneyPrecise(row.balance_before_api, 6),
    balanceAfterApiDisplay: formatApiMoneyPrecise(row.balance_after_api, 6),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    createdBy: row.created_by || "",
  };
}

function rowToWalletCreditBatch(row) {
  if (!row) return null;
  const metadata = row.metadata && typeof row.metadata === "string" ? JSON.parse(row.metadata || "{}") : (row.metadata || {});
  return {
    id: row.id,
    userId: row.user_id,
    walletId: row.wallet_id,
    type: row.type || "grant",
    sourceType: row.source_type || "",
    sourceLabel: row.source_label || "",
    sourceDetail: row.source_detail || "",
    operatorType: row.operator_type || "",
    operatorId: row.operator_id || "",
    operatorName: row.operator_name || "",
    amountApi: Number(row.amount_api || 0),
    remainingApi: Number(row.remaining_api || 0),
    balanceBeforeApi: Number(row.balance_before_api || 0),
    balanceAfterApi: Number(row.balance_after_api || 0),
    relatedOrderId: row.related_order_id || "",
    relatedRequestId: row.related_request_id || "",
    relatedPackageId: row.related_package_id || "",
    relatedMembershipId: row.related_membership_id || "",
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    isExpirable: Boolean(row.is_expirable),
    metadata,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

async function withTransaction(work) {
  const pool = getPool();
  if (!pool) return work(null);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureWalletSchema() {
  if (!hasDatabase()) return;
  await query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
      api_balance NUMERIC(20, 6) NOT NULL DEFAULT 0,
      frozen_api_balance NUMERIC(20, 6) NOT NULL DEFAULT 0,
      total_recharged_rmb NUMERIC(20, 2) NOT NULL DEFAULT 0,
      total_granted_api NUMERIC(20, 6) NOT NULL DEFAULT 0,
      total_consumed_api NUMERIC(20, 6) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT '',
      source_label TEXT NOT NULL DEFAULT '',
      source_detail TEXT NOT NULL DEFAULT '',
      operator_type TEXT NOT NULL DEFAULT '',
      operator_id TEXT NOT NULL DEFAULT '',
      operator_name TEXT NOT NULL DEFAULT '',
      amount_api NUMERIC(20, 6) NOT NULL DEFAULT 0,
      balance_before_api NUMERIC(20, 6) NOT NULL DEFAULT 0,
      balance_after_api NUMERIC(20, 6) NOT NULL DEFAULT 0,
      related_order_id TEXT DEFAULT '',
      related_request_id TEXT DEFAULT '',
      model_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      related_package_id TEXT DEFAULT '',
      related_membership_id TEXT DEFAULT '',
      expires_at TIMESTAMPTZ,
      is_expirable BOOLEAN NOT NULL DEFAULT false,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT DEFAULT ''
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_request_unique ON wallet_transactions(user_id, related_request_id) WHERE related_request_id <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_order_unique ON wallet_transactions(related_order_id) WHERE related_order_id <> '';
    CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created ON wallet_transactions(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS wallet_credit_batches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      wallet_id TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'grant',
      source_type TEXT NOT NULL DEFAULT 'manual_adjustment',
      source_label TEXT NOT NULL DEFAULT '',
      source_detail TEXT NOT NULL DEFAULT '',
      operator_type TEXT NOT NULL DEFAULT 'system',
      operator_id TEXT NOT NULL DEFAULT '',
      operator_name TEXT NOT NULL DEFAULT '',
      amount_api NUMERIC(20, 6) NOT NULL DEFAULT 0,
      remaining_api NUMERIC(20, 6) NOT NULL DEFAULT 0,
      balance_before_api NUMERIC(20, 6) NOT NULL DEFAULT 0,
      balance_after_api NUMERIC(20, 6) NOT NULL DEFAULT 0,
      related_order_id TEXT DEFAULT '',
      related_request_id TEXT DEFAULT '',
      related_package_id TEXT DEFAULT '',
      related_membership_id TEXT DEFAULT '',
      expires_at TIMESTAMPTZ,
      is_expirable BOOLEAN NOT NULL DEFAULT false,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_credit_batches_request_unique ON wallet_credit_batches(user_id, related_request_id) WHERE related_request_id <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_credit_batches_order_unique ON wallet_credit_batches(related_order_id) WHERE related_order_id <> '';
    CREATE INDEX IF NOT EXISTS idx_wallet_credit_batches_user_expiry ON wallet_credit_batches(user_id, is_expirable, expires_at, created_at);

    CREATE TABLE IF NOT EXISTS recharge_orders (
      id TEXT PRIMARY KEY,
      order_no TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      amount_rmb NUMERIC(20, 2) NOT NULL DEFAULT 0,
      amount_api NUMERIC(20, 6) NOT NULL DEFAULT 0,
      exchange_rate NUMERIC(20, 6) NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT NOT NULL DEFAULT 'manual',
      payment_proof TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      reject_reason TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at TIMESTAMPTZ,
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT DEFAULT ''
    );

    ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS order_no TEXT UNIQUE;
    ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS amount_rmb NUMERIC(20, 2) NOT NULL DEFAULT 0;
    ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS amount_api NUMERIC(20, 6) NOT NULL DEFAULT 0;
    ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(20, 6) NOT NULL DEFAULT 5;
    ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'manual';
    ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS payment_proof TEXT DEFAULT '';
    ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS remark TEXT DEFAULT '';
    ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS reject_reason TEXT DEFAULT '';
    ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
    ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS reviewed_by TEXT DEFAULT '';

    CREATE INDEX IF NOT EXISTS idx_recharge_orders_user_created ON recharge_orders(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_recharge_orders_status_created ON recharge_orders(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS wallet_configs (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const defaults = [
    ["recharge_rate", "5", "人民币与 $ API 的充值比例"],
    ["min_recharge_amount_rmb", "1", "最低充值金额"],
    ["max_recharge_amount_rmb", "100000", "单次最高充值金额"],
    ["recharge_enabled", "true", "是否开启充值"],
    ["manual_review_enabled", "true", "是否开启人工审核"],
    ["new_user_bonus_api", "0", "新用户赠送 $ API"],
    ["low_balance_threshold_api", "1", "低余额提醒阈值"],
  ];
  for (const [key, value, description] of defaults) {
    await query(
      `INSERT INTO wallet_configs (id, key, value, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description`,
      [makeId("cfg"), key, String(value), description]
    );
  }
}

function walletNumber(value) {
  return Number(roundDecimal(value, 6));
}

function normalizeBatchRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(rowToWalletCreditBatch).filter(Boolean);
}

async function getWalletCreditBatchesByUser(db, userId) {
  const result = db
    ? await db.query(
        `SELECT * FROM wallet_credit_batches
         WHERE user_id = $1
           AND remaining_api > 0
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY
           CASE WHEN is_expirable THEN 0 ELSE 1 END,
           expires_at ASC NULLS LAST,
           created_at ASC`,
        [userId]
      )
    : await query(
        `SELECT * FROM wallet_credit_batches
         WHERE user_id = $1
           AND remaining_api > 0
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY
           CASE WHEN is_expirable THEN 0 ELSE 1 END,
           expires_at ASC NULLS LAST,
           created_at ASC`,
        [userId]
      );
  return normalizeBatchRows(result.rows);
}

export async function listWalletCreditBatches({ userId, limit = 100, offset = 0 } = {}) {
  await ensureWalletSchema();
  if (!hasDatabase()) return [];
  const params = [userId, Number(limit) || 100, Number(offset) || 0];
  const result = await query(
    `SELECT * FROM wallet_credit_batches
     WHERE user_id = $1
     ORDER BY
       CASE WHEN is_expirable THEN 0 ELSE 1 END,
       expires_at ASC NULLS LAST,
       created_at DESC
     LIMIT $2 OFFSET $3`,
    params
  );
  return normalizeBatchRows(result.rows);
}

async function clearExpiredWalletCreditBatches(db, userId, walletRow = null, createdBy = "system") {
  if (!db || !userId) return { expiredAmount: 0, walletRow, batchIds: [] };
  const walletResult = walletRow?.id
    ? { rows: [walletRow] }
    : await db.query("SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE", [userId]);
  const currentWallet = walletResult.rows[0];
  if (!currentWallet) return { expiredAmount: 0, walletRow: null, batchIds: [] };
  const batches = await db.query(
    `SELECT * FROM wallet_credit_batches
     WHERE user_id = $1
       AND remaining_api > 0
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()
     ORDER BY expires_at ASC, created_at ASC
     FOR UPDATE`,
    [userId]
  );
  let expiredAmount = 0;
  const batchIds = [];
  for (const row of batches.rows) {
    const remaining = roundApi(row.remaining_api);
    if (remaining <= 0) continue;
    expiredAmount = roundApi(expiredAmount + remaining);
    batchIds.push(row.id);
    await db.query(
      `UPDATE wallet_credit_batches
       SET remaining_api = 0,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
  }
  if (expiredAmount <= 0) return { expiredAmount: 0, walletRow: currentWallet, batchIds };
  const before = Number(currentWallet.api_balance || 0);
  const next = roundApi(Math.max(0, Number(roundDecimal(before - expiredAmount, 6))));
  await db.query(
    `UPDATE wallets
     SET api_balance = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [currentWallet.id, next]
  );
  await createWalletTransaction({
    userId,
    walletId: currentWallet.id,
    type: "expired_clear",
    amountApi: -expiredAmount,
    balanceBeforeApi: before,
    balanceAfterApi: next,
    description: "到期自动清零",
    sourceType: "expired_clear",
    sourceLabel: "额度过期清零",
    sourceDetail: "到期自动清零",
    operatorType: "system",
    createdBy,
    metadata: { batchIds, source: "expire_wallet_credit_batches" },
    db,
  });
  return { expiredAmount, walletRow: { ...currentWallet, api_balance: next }, batchIds };
}

async function applyWalletGrant(db, {
  userId,
  walletRow = null,
  amountApi,
  amountRmb = 0,
  type = "admin_add",
  description = "",
  createdBy = "",
  sourceType = "",
  sourceLabel = "",
  sourceDetail = "",
  operatorType = "",
  operatorId = "",
  operatorName = "",
  relatedOrderId = "",
  relatedRequestId = "",
  relatedPackageId = "",
  relatedMembershipId = "",
  expiresAt = null,
  isExpirable = false,
  metadata = {},
}) {
  const wallet = walletRow || (await db.query("SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE", [userId])).rows[0];
  if (!wallet) return { error: "钱包不存在" };
  const amount = roundApi(amountApi);
  if (amount <= 0) return { error: "金额无效" };
  const before = Number(wallet.api_balance || 0);
  const next = roundApi(Number(roundDecimal(before + amount, 6)));
  const source = resolveWalletSource({
    sourceType,
    sourceLabel,
    sourceDetail,
    operatorType,
    operatorId,
    operatorName,
    relatedOrderId,
    relatedRequestId,
    relatedPackageId,
    relatedMembershipId,
    expiresAt,
    isExpirable,
    type,
  });
  await db.query(
    `UPDATE wallets
     SET api_balance = $2,
         total_recharged_rmb = total_recharged_rmb + $3,
         total_granted_api = total_granted_api + $4,
         updated_at = NOW()
     WHERE id = $1`,
    [wallet.id, next, roundRmb(amountRmb), amount]
  );
  await insertWalletCreditBatch({
    db,
    userId,
    walletId: wallet.id,
    type,
    amountApi: amount,
    balanceBeforeApi: before,
    balanceAfterApi: next,
    ...source,
    metadata,
  });
  await createWalletTransaction({
    userId,
    walletId: wallet.id,
    type,
    amountApi: amount,
    balanceBeforeApi: before,
    balanceAfterApi: next,
    relatedOrderId,
    relatedRequestId,
    modelName: "",
    description,
    sourceType: source.sourceType,
    sourceLabel: source.sourceLabel,
    sourceDetail: source.sourceDetail,
    operatorType: source.operatorType,
    operatorId: source.operatorId,
    operatorName: source.operatorName,
    relatedPackageId,
    relatedMembershipId,
    expiresAt,
    isExpirable: source.isExpirable,
    metadata,
    createdBy,
    db,
  });
  return { wallet: { ...wallet, api_balance: next } };
}

async function consumeWalletCreditBatches(db, {
  userId,
  walletRow = null,
  amountApi,
  description = "",
  createdBy = "",
  relatedRequestId = "",
  modelName = "",
  metadata = {},
}) {
  const wallet = walletRow || (await db.query("SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE", [userId])).rows[0];
  if (!wallet) return { error: "钱包不存在" };
  const amount = roundApi(Math.abs(amountApi));
  if (amount <= 0) return { error: "扣款金额无效" };
  if (relatedRequestId) {
    const duplicate = await db.query(
      "SELECT id FROM wallet_transactions WHERE user_id = $1 AND related_request_id = $2 LIMIT 1",
      [userId, relatedRequestId]
    );
    if (duplicate.rows[0]) return { duplicate: true };
  }
  await clearExpiredWalletCreditBatches(db, userId, wallet, createdBy);
  const freshWallet = (await db.query("SELECT * FROM wallets WHERE id = $1 FOR UPDATE", [wallet.id])).rows[0] || wallet;
  const batches = await db.query(
    `SELECT * FROM wallet_credit_batches
     WHERE user_id = $1
       AND remaining_api > 0
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY
       CASE WHEN is_expirable THEN 0 ELSE 1 END,
       expires_at ASC NULLS LAST,
       created_at ASC
     FOR UPDATE`,
    [userId]
  );
  const totalAvailable = batches.rows.reduce((sum, row) => sum + Number(row.remaining_api || 0), 0);
  if (totalAvailable < amount) return { error: "钱包余额不足" };
  const deductions = [];
  let remaining = amount;
  for (const row of batches.rows) {
    if (remaining <= 0) break;
    const take = Math.min(Number(row.remaining_api || 0), remaining);
    if (take <= 0) continue;
    deductions.push({
      batchId: row.id,
      amount: roundApi(take),
      sourceType: row.source_type || "",
      sourceLabel: row.source_label || "",
    });
    remaining = roundApi(remaining - take);
  }
  for (const item of deductions) {
    await db.query(
      `UPDATE wallet_credit_batches
       SET remaining_api = GREATEST(0, remaining_api - $2),
           updated_at = NOW()
       WHERE id = $1`,
      [item.batchId, item.amount]
    );
  }
  const before = Number(freshWallet.api_balance || 0);
  const next = roundApi(Number(roundDecimal(before - amount, 6)));
  await db.query(
    `UPDATE wallets
     SET api_balance = $2,
         total_consumed_api = total_consumed_api + $3,
         updated_at = NOW()
     WHERE id = $1`,
    [freshWallet.id, next, amount]
  );
  const source = resolveWalletSource({
    sourceType: "api_usage",
    sourceLabel: "模型调用消费",
    sourceDetail: description || "API 消费",
    operatorType: "user",
    relatedRequestId,
  });
  await createWalletTransaction({
    userId,
    walletId: freshWallet.id,
    type: "consume",
    amountApi: -amount,
    balanceBeforeApi: before,
    balanceAfterApi: next,
    relatedRequestId,
    modelName,
    description,
    sourceType: source.sourceType,
    sourceLabel: source.sourceLabel,
    sourceDetail: source.sourceDetail,
    operatorType: source.operatorType,
    relatedPackageId: "",
    relatedMembershipId: "",
    metadata: { ...metadata, batchBreakdown: deductions, source: "wallet_credit_batches" },
    createdBy,
    db,
  });
  return { wallet: { ...freshWallet, api_balance: next }, deductions };
}

async function insertWalletCreditBatch({
  db = null,
  userId,
  walletId,
  type = "grant",
  amountApi,
  balanceBeforeApi,
  balanceAfterApi,
  sourceType,
  sourceLabel,
  sourceDetail,
  operatorType,
  operatorId = "",
  operatorName = "",
  relatedOrderId = "",
  relatedRequestId = "",
  relatedPackageId = "",
  relatedMembershipId = "",
  expiresAt = null,
  isExpirable = false,
  metadata = {},
}) {
  const source = resolveWalletSource({
    sourceType,
    sourceLabel,
    sourceDetail,
    operatorType,
    operatorId,
    operatorName,
    relatedOrderId,
    relatedRequestId,
    relatedPackageId,
    relatedMembershipId,
    expiresAt,
    isExpirable,
    type,
  });
  const payload = {
    id: makeId("wcb"),
    userId,
    walletId,
    type,
    amountApi: roundApi(amountApi),
    remainingApi: roundApi(amountApi),
    balanceBeforeApi: roundApi(balanceBeforeApi),
    balanceAfterApi: roundApi(balanceAfterApi),
    ...source,
    metadata,
  };
  if (!hasDatabase()) return payload;
  const executor = db || { query };
  await executor.query(
    `INSERT INTO wallet_credit_batches (
      id, user_id, wallet_id, type, source_type, source_label, source_detail,
      operator_type, operator_id, operator_name, amount_api, remaining_api,
      balance_before_api, balance_after_api, related_order_id, related_request_id,
      related_package_id, related_membership_id, expires_at, is_expirable, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb)`,
    [
      payload.id,
      userId,
      walletId,
      type,
      payload.sourceType,
      payload.sourceLabel,
      payload.sourceDetail,
      payload.operatorType,
      payload.operatorId,
      payload.operatorName,
      payload.amountApi,
      payload.remainingApi,
      payload.balanceBeforeApi,
      payload.balanceAfterApi,
      payload.relatedOrderId,
      payload.relatedRequestId,
      payload.relatedPackageId,
      payload.relatedMembershipId,
      payload.expiresAt,
      payload.isExpirable,
      JSON.stringify(metadata || {}),
    ]
  );
  return payload;
}

export async function getWalletConfig(key, fallback = "") {
  if (!key) return fallback;
  if (!hasDatabase()) return fallback;
  await ensureWalletSchema();
  const result = await query("SELECT * FROM wallet_configs WHERE key = $1 LIMIT 1", [key]);
  const row = rowToWalletConfig(result.rows[0]);
  return row?.value ?? fallback;
}

export async function getWalletConfigNumber(key, fallback = 0) {
  return parseDecimalAmount(await getWalletConfig(key, fallback), fallback);
}

export async function getWalletConfigBoolean(key, fallback = false) {
  const value = String(await getWalletConfig(key, fallback ? "true" : "false")).toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

export async function getOrCreateWallet(userId) {
  if (!userId) return null;
  await ensureWalletSchema();
  if (!hasDatabase()) {
    return {
      id: `wallet_${userId}`,
      userId,
      apiBalance: 0,
      frozenApiBalance: 0,
      totalRechargedRmb: 0,
      totalGrantedApi: 0,
      totalConsumedApi: 0,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  const existing = await query("SELECT * FROM wallets WHERE user_id = $1 LIMIT 1", [userId]);
  if (existing.rows[0]) return rowToWallet(existing.rows[0]);
  const created = await query(
    `INSERT INTO wallets (id, user_id, api_balance, frozen_api_balance, total_recharged_rmb, total_granted_api, total_consumed_api, status)
     VALUES ($1, $2, 0, 0, 0, 0, 0, 'active')
     ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [makeId("wallet"), userId]
  );
  return rowToWallet(created.rows[0]);
}

export async function syncLegacyCustomerBalance(userId, apiBalance) {
  if (!hasDatabase()) return null;
  const value = roundApi(apiBalance);
  await query("UPDATE customers SET balance = $2 WHERE id = $1", [userId, value]);
  return value;
}

export async function createWalletTransaction({
  userId,
  walletId,
  type,
  amountApi = 0,
  balanceBeforeApi = 0,
  balanceAfterApi = 0,
  relatedOrderId = "",
  relatedRequestId = "",
  modelName = "",
  description = "",
  sourceType = "",
  sourceLabel = "",
  sourceDetail = "",
  operatorType = "",
  operatorId = "",
  operatorName = "",
  relatedPackageId = "",
  relatedMembershipId = "",
  expiresAt = null,
  isExpirable = false,
  metadata = {},
  createdBy = "",
  db = null,
}) {
  await ensureWalletSchema();
  const payload = {
    id: makeId("wtx"),
    userId,
    walletId,
    type,
    amountApi: roundApi(amountApi),
    balanceBeforeApi: roundApi(balanceBeforeApi),
    balanceAfterApi: roundApi(balanceAfterApi),
    relatedOrderId,
    relatedRequestId,
    modelName,
    description,
    sourceType,
    sourceLabel,
    sourceDetail,
    operatorType,
    operatorId,
    operatorName,
    relatedPackageId,
    relatedMembershipId,
    expiresAt,
    isExpirable,
    metadata,
    createdBy,
  };
  if (!hasDatabase()) return payload;
  const executor = db || { query };
  await executor.query(
    `INSERT INTO wallet_transactions (
      id, user_id, wallet_id, type, transaction_type, amount_api, balance_before_api, balance_after_api,
      source_type, source_label, source_detail, operator_type, operator_id, operator_name,
      related_order_id, related_request_id, model_name, description, related_package_id,
      related_membership_id, expires_at, is_expirable, metadata, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21)`,
    [
      payload.id,
      userId,
      walletId,
      type,
      type,
      payload.amountApi,
      payload.balanceBeforeApi,
      payload.balanceAfterApi,
      sourceType,
      sourceLabel,
      sourceDetail,
      operatorType,
      operatorId,
      operatorName,
      relatedOrderId,
      relatedRequestId,
      modelName,
      description,
      relatedPackageId,
      relatedMembershipId,
      expiresAt,
      isExpirable,
      JSON.stringify(metadata || {}),
      createdBy,
    ]
  );
  return payload;
}

export async function getWalletOverview(userId) {
  const wallet = await getOrCreateWallet(userId);
  if (!wallet) return null;
  if (hasDatabase()) {
    await withTransaction(async (db) => {
      await clearExpiredWalletCreditBatches(db, userId, null, "system");
    }).catch(() => {});
  }
  const rechargeRate = await getWalletConfigNumber("recharge_rate", 5);
  return {
    ...wallet,
    apiBalanceDisplay: formatApiMoney(wallet.apiBalance),
    frozenApiBalanceDisplay: formatApiMoney(wallet.frozenApiBalance),
    totalRechargedRmbDisplay: formatRmb(wallet.totalRechargedRmb),
    totalGrantedApiDisplay: formatApiMoney(wallet.totalGrantedApi),
    totalConsumedApiDisplay: formatApiMoneyPrecise(wallet.totalConsumedApi, 6),
    exchangeRate: rechargeRate,
    exchangeRateDisplay: formatRechargeRate(rechargeRate),
    lowBalance: wallet.apiBalance < Number(await getWalletConfigNumber("low_balance_threshold_api", 1)),
  };
}

export async function listWalletTransactions({ userId, limit = 100, offset = 0 } = {}) {
  await ensureWalletSchema();
  if (!hasDatabase()) return [];
  const params = [];
  const where = userId ? "WHERE user_id = $1" : "";
  if (userId) params.push(userId);
  params.push(Number(limit) || 100);
  params.push(Number(offset) || 0);
  const result = await query(
    `SELECT * FROM wallet_transactions ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return result.rows.map(rowToTransaction);
}

export async function listRechargeOrders({ userId, status = "", limit = 50, offset = 0 } = {}) {
  await ensureWalletSchema();
  if (!hasDatabase()) return [];
  const conditions = [];
  const params = [];
  if (userId) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(Number(limit) || 50);
  params.push(Number(offset) || 0);
  const result = await query(
    `SELECT * FROM recharge_orders ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return result.rows.map(rowToRechargeOrder);
}

export async function createRechargeOrder({ userId, amountRmb, paymentMethod = "manual", remark = "" }) {
  if (!userId) return { error: "缺少用户" };
  const amount = roundRmb(amountRmb);
  const rate = roundApi(await getWalletConfigNumber("recharge_rate", 5));
  const minAmount = roundRmb(await getWalletConfigNumber("min_recharge_amount_rmb", 1));
  const maxAmount = roundRmb(await getWalletConfigNumber("max_recharge_amount_rmb", 100000));
  if (amount < minAmount || amount > maxAmount) {
    return { error: "充值金额不在允许范围内" };
  }
  const amountApi = roundApi(Number(roundDecimal(Number(amount) * Number(rate), 6)));
  await ensureWalletSchema();
  if (!hasDatabase()) {
    return {
      order: {
        id: makeId("rch"),
        orderNo: `W${Date.now()}`,
        userId,
        amountRmb: amount,
        amountApi,
        exchangeRate: rate,
        status: "pending",
        paymentMethod,
        paymentProof: "",
        remark,
        rejectReason: "",
        createdAt: new Date().toISOString(),
        paidAt: null,
        reviewedAt: null,
        reviewedBy: "",
      },
    };
  }
  const created = await query(
    `INSERT INTO recharge_orders (id, order_no, user_id, amount_rmb, amount_api, exchange_rate, status, payment_method, remark)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
     RETURNING *`,
    [makeId("rch"), `W${Date.now()}${Math.random().toString(36).slice(2, 6)}`, userId, amount, amountApi, rate, paymentMethod, remark]
  );
  return { order: rowToRechargeOrder(created.rows[0]) };
}

export async function approveRechargeOrder({ orderId, reviewedBy = "", remark = "" }) {
  await ensureWalletSchema();
  if (!hasDatabase()) return { error: "数据库未启用" };
  try {
    const result = await withTransaction(async (db) => {
      const orderResult = await db.query("SELECT * FROM recharge_orders WHERE id = $1 FOR UPDATE", [orderId]);
      const orderRow = orderResult.rows[0];
      if (!orderRow) return { error: "订单不存在" };
      if (orderRow.status !== "pending") return { error: "订单已处理" };
      const walletResult = await db.query("SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE", [orderRow.user_id]);
      let walletRow = walletResult.rows[0];
      if (!walletRow) {
        const created = await db.query(
          `INSERT INTO wallets (id, user_id, api_balance, frozen_api_balance, total_recharged_rmb, total_granted_api, total_consumed_api, status)
           VALUES ($1, $2, 0, 0, 0, 0, 0, 'active')
           RETURNING *`,
          [makeId("wallet"), orderRow.user_id]
        );
        walletRow = created.rows[0];
      }
      const grantResult = await applyWalletGrant(db, {
        userId: orderRow.user_id,
        walletRow,
        amountApi: orderRow.amount_api,
        amountRmb: orderRow.amount_rmb,
        type: "recharge",
        description: "充值到账",
        createdBy: reviewedBy,
        sourceType: "recharge_purchase",
        sourceLabel: "用户充值兑换",
        sourceDetail: formatWalletSourceLine({
          sourceType: "recharge_purchase",
          amountRmbText: formatRmb(orderRow.amount_rmb),
          amountText: formatApiMoney(orderRow.amount_api),
        }),
        operatorType: "user",
        relatedOrderId: orderRow.id,
        expiresAt: null,
        isExpirable: false,
        metadata: { amountRmb: orderRow.amount_rmb, exchangeRate: orderRow.exchange_rate, reviewedBy },
      });
      const updatedWallet = grantResult.wallet ? { rows: [grantResult.wallet] } : { rows: [walletRow] };
      const nextBalance = grantResult.wallet?.api_balance ?? walletRow.api_balance;
      await db.query(
        `UPDATE recharge_orders
         SET status = 'approved', paid_at = COALESCE(paid_at, NOW()), reviewed_at = NOW(), reviewed_by = $2, remark = COALESCE(NULLIF($3, ''), remark)
         WHERE id = $1`,
        [orderId, reviewedBy, remark]
      );
      await syncLegacyCustomerBalance(orderRow.user_id, nextBalance);
      return {
        order: rowToRechargeOrder((await db.query("SELECT * FROM recharge_orders WHERE id = $1 LIMIT 1", [orderId])).rows[0]),
        wallet: rowToWallet(updatedWallet.rows[0]),
      };
    });
    if (result?.error) return { error: result.error };
    return result;
  } catch (error) {
    return { error: error.message };
  }
}

export async function rejectRechargeOrder({ orderId, reviewedBy = "", reason = "" }) {
  await ensureWalletSchema();
  if (!hasDatabase()) return { error: "数据库未启用" };
  const result = await query(
    `UPDATE recharge_orders
     SET status = 'rejected', reviewed_at = NOW(), reviewed_by = $2, reject_reason = $3
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [orderId, reviewedBy, reason]
  );
  if (!result.rows[0]) return { error: "订单不存在或已处理" };
  return { order: rowToRechargeOrder(result.rows[0]) };
}

export async function ensureWalletForUser(userId) {
  return getOrCreateWallet(userId);
}

export async function addWalletBalance({ userId, amountApi, description = "", createdBy = "", type = "admin_add", metadata = {} }) {
  await ensureWalletSchema();
  const wallet = await getOrCreateWallet(userId);
  if (!wallet) return { error: "用户不存在" };
  const amount = roundApi(amountApi);
  if (amount <= 0) return { error: "加款金额无效" };
  if (!hasDatabase()) return { error: "数据库未启用" };
  const pool = (await import("@/lib/db")).getPool();
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const locked = await db.query("SELECT * FROM wallets WHERE id = $1 FOR UPDATE", [wallet.id]);
    const current = locked.rows[0];
    const next = roundApi(Number(roundDecimal(Number(current.api_balance) + Number(amount), 6)));
    await db.query(
      `UPDATE wallets SET api_balance = $2, total_granted_api = total_granted_api + $3, updated_at = NOW() WHERE id = $1`,
      [wallet.id, next, amount]
    );
    await db.query(
      `INSERT INTO wallet_transactions (
        id, user_id, wallet_id, type, transaction_type, amount_api, balance_before_api, balance_after_api, description, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
      [makeId("wtx"), userId, wallet.id, type, type, amount, current.api_balance, next, description, JSON.stringify(metadata || {}), createdBy]
    );
    await syncLegacyCustomerBalance(userId, next);
    await db.query("UPDATE customers SET total_spend = total_spend + $2 WHERE id = $1", [userId, amount]).catch(() => {});
    await db.query("COMMIT");
    return { wallet: rowToWallet((await db.query("SELECT * FROM wallets WHERE id = $1 LIMIT 1", [wallet.id])).rows[0]) };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    return { error: error.message };
  } finally {
    db.release();
  }
}

export async function deductWalletBalance({ userId, amountApi, description = "", createdBy = "", relatedRequestId = "", modelName = "", metadata = {} }) {
  await ensureWalletSchema();
  const wallet = await getOrCreateWallet(userId);
  if (!wallet) return { error: "用户不存在" };
  const amount = roundApi(Math.abs(amountApi));
  if (amount <= 0) return { error: "扣款金额无效" };
  if (!hasDatabase()) return { error: "数据库未启用" };
  const pool = (await import("@/lib/db")).getPool();
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const existing = relatedRequestId
      ? await db.query("SELECT id FROM wallet_transactions WHERE user_id = $1 AND related_request_id = $2 LIMIT 1", [userId, relatedRequestId])
      : { rows: [] };
    if (existing.rows[0]) {
      await db.query("ROLLBACK");
      return { duplicate: true };
    }
    const locked = await db.query("SELECT * FROM wallets WHERE id = $1 FOR UPDATE", [wallet.id]);
    const current = locked.rows[0];
    if (!current || toNumber(current.api_balance) < amount) {
      await db.query("ROLLBACK");
      return { error: "钱包余额不足" };
    }
    const next = roundApi(Number(roundDecimal(Number(current.api_balance) - Number(amount), 6)));
    await db.query(
      `UPDATE wallets
       SET api_balance = $2,
           total_consumed_api = total_consumed_api + $3,
           updated_at = NOW()
       WHERE id = $1`,
      [wallet.id, next, amount]
    );
    await db.query(
      `INSERT INTO wallet_transactions (
        id, user_id, wallet_id, type, transaction_type, amount_api, balance_before_api, balance_after_api,
        related_request_id, model_name, description, metadata, created_by
      ) VALUES ($1, $2, $3, 'consume', 'consume', $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
      ON CONFLICT (user_id, related_request_id) WHERE related_request_id <> '' DO NOTHING`,
      [makeId("wtx"), userId, wallet.id, -amount, current.api_balance, next, relatedRequestId, modelName, description, JSON.stringify(metadata || {}), createdBy]
    );
    await syncLegacyCustomerBalance(userId, next);
    await db.query("UPDATE customers SET total_spend = total_spend + $2 WHERE id = $1", [userId, amount]).catch(() => {});
    await db.query("COMMIT");
    return { wallet: rowToWallet((await db.query("SELECT * FROM wallets WHERE id = $1 LIMIT 1", [wallet.id])).rows[0]) };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    return { error: error.message };
  } finally {
    db.release();
  }
}

export async function refundWalletBalance({ userId, amountApi, description = "", createdBy = "", relatedRequestId = "", modelName = "", metadata = {} }) {
  return addWalletBalance({
    userId,
    amountApi: Math.abs(amountApi),
    description,
    createdBy,
    type: "refund",
    metadata: { ...metadata, relatedRequestId, modelName },
  });
}

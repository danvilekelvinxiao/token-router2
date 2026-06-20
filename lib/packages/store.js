import { hasDatabase, query } from "@/lib/db";

const memoryStore = () => {
  if (!globalThis.__FLOWAPI_PACKAGE_STORE__) {
    globalThis.__FLOWAPI_PACKAGE_STORE__ = {
      packageOrders: [],
      userPackages: [],
    };
  }
  return globalThis.__FLOWAPI_PACKAGE_STORE__;
};

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(dateLike, days) {
  const date = new Date(dateLike || Date.now());
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
}

function tokenWanToNumber(value) {
  const parsed = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 10000) : 0;
}

function queryRunner(dbClient = null) {
  return dbClient ? dbClient.query.bind(dbClient) : query;
}

export function extractPackagePayload(input = {}) {
  const purchaseType = String(input.purchaseType || "").trim();
  const packageId = String(input.packageId || "").trim();
  const packageName = String(input.packageName || "").trim();
  const quotaText = String(input.quotaText || "").trim();
  const validDays = Number(input.validDays || 0);
  if (!purchaseType || purchaseType === "balance_recharge" || !packageId) return null;
  const totalMatch = quotaText.match(/(?:月共|周共|共)\s*([\d.]+)\s*万/) || quotaText.match(/([\d.]+)\s*万/);
  const dailyMatch = quotaText.match(/每日\s*([\d.]+)\s*万/);
  return {
    purchaseType,
    packageId,
    packageName: packageName || packageId,
    quotaText,
    quotaTokens: tokenWanToNumber(totalMatch?.[1]),
    dailyQuotaTokens: tokenWanToNumber(dailyMatch?.[1]),
    validDays: Number.isFinite(validDays) && validDays > 0 ? Math.round(validDays) : 0,
  };
}

export function parsePackageRef(paymentRef = "") {
  const text = String(paymentRef || "");
  if (!text.includes("购买类型") && !text.includes("套餐ID")) return null;
  const lineValue = (label) => {
    const line = text.split(/\n+/).find((item) => item.trim().startsWith(`${label}：`));
    return line ? line.split("：").slice(1).join("：").trim() : "";
  };
  return extractPackagePayload({
    purchaseType: lineValue("购买类型"),
    packageId: lineValue("套餐ID"),
    packageName: lineValue("套餐名称"),
    quotaText: lineValue("额度").replace(/\s*Token$/i, ""),
    validDays: Number(lineValue("有效期").replace(/\s*天$/, "")),
  });
}

function rowToPackageOrder(row = {}) {
  if (!row) return null;
  return {
    id: row.id,
    rechargeOrderId: row.recharge_order_id || row.rechargeOrderId || "",
    userId: row.user_id || row.userId || "",
    purchaseType: row.purchase_type || row.purchaseType || "package",
    packageId: row.package_id || row.packageId || "",
    packageName: row.package_name || row.packageName || "",
    quotaText: row.quota_text || row.quotaText || "",
    quotaTokens: Number(row.quota_tokens || row.quotaTokens || 0),
    dailyQuotaTokens: Number(row.daily_quota_tokens || row.dailyQuotaTokens || 0),
    validDays: Number(row.valid_days || row.validDays || 0),
    amountCny: Number(row.amount_cny || row.amountCny || 0),
    paymentMethod: row.payment_method || row.paymentMethod || "",
    status: row.status || "pending",
    source: row.source || "recharge",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt || nowIso(),
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : row.paidAt || null,
    activatedAt: row.activated_at ? new Date(row.activated_at).toISOString() : row.activatedAt || null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : row.expiresAt || null,
    metadata: row.metadata_json || row.metadata || {},
  };
}

function rowToUserPackage(row = {}) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId || "",
    packageOrderId: row.package_order_id || row.packageOrderId || "",
    packageId: row.package_id || row.packageId || "",
    packageName: row.package_name || row.packageName || "",
    purchaseType: row.purchase_type || row.purchaseType || "package",
    quotaText: row.quota_text || row.quotaText || "",
    quotaTokens: Number(row.quota_tokens || row.quotaTokens || 0),
    remainingTokens: Number(row.remaining_tokens || row.remainingTokens || 0),
    dailyQuotaTokens: Number(row.daily_quota_tokens || row.dailyQuotaTokens || 0),
    validDays: Number(row.valid_days || row.validDays || 0),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : row.startedAt || nowIso(),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : row.expiresAt || null,
    status: row.status || "active",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt || nowIso(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : row.updatedAt || nowIso(),
    metadata: row.metadata_json || row.metadata || {},
  };
}

export async function createPackageOrderForRecharge({ order, packagePayload, metadata = {} } = {}) {
  const payload = packagePayload || parsePackageRef(order?.paymentRef);
  if (!order?.id || !payload) return null;
  const entry = {
    id: makeId("pkg_order"),
    rechargeOrderId: order.id,
    userId: order.customerId,
    purchaseType: payload.purchaseType,
    packageId: payload.packageId,
    packageName: payload.packageName,
    quotaText: payload.quotaText,
    quotaTokens: payload.quotaTokens,
    dailyQuotaTokens: payload.dailyQuotaTokens,
    validDays: payload.validDays,
    amountCny: Number(order.amount || 0),
    paymentMethod: order.paymentMethod || "",
    status: "pending",
    source: "recharge",
    metadata,
    createdAt: nowIso(),
  };

  if (!hasDatabase()) {
    const store = memoryStore();
    const existing = store.packageOrders.find((item) => item.rechargeOrderId === entry.rechargeOrderId);
    if (existing) return rowToPackageOrder(existing);
    store.packageOrders.unshift(entry);
    return rowToPackageOrder(entry);
  }

  const result = await query(
    `INSERT INTO package_orders (
      id, recharge_order_id, user_id, purchase_type, package_id, package_name,
      quota_text, quota_tokens, daily_quota_tokens, valid_days, amount_cny,
      payment_method, status, source, metadata_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending','recharge',$13::jsonb)
    ON CONFLICT (recharge_order_id) DO UPDATE SET
      purchase_type = EXCLUDED.purchase_type,
      package_id = EXCLUDED.package_id,
      package_name = EXCLUDED.package_name,
      quota_text = EXCLUDED.quota_text,
      quota_tokens = EXCLUDED.quota_tokens,
      daily_quota_tokens = EXCLUDED.daily_quota_tokens,
      valid_days = EXCLUDED.valid_days,
      amount_cny = EXCLUDED.amount_cny,
      payment_method = EXCLUDED.payment_method,
      metadata_json = EXCLUDED.metadata_json
    RETURNING *`,
    [
      entry.id,
      entry.rechargeOrderId,
      entry.userId,
      entry.purchaseType,
      entry.packageId,
      entry.packageName,
      entry.quotaText,
      entry.quotaTokens,
      entry.dailyQuotaTokens,
      entry.validDays,
      entry.amountCny,
      entry.paymentMethod,
      JSON.stringify(entry.metadata),
    ]
  );
  return rowToPackageOrder(result.rows[0]);
}

export async function getPackageOrderByRechargeOrderId(rechargeOrderId, dbClient = null) {
  if (!rechargeOrderId) return null;
  if (!hasDatabase()) {
    const found = memoryStore().packageOrders.find((item) => item.rechargeOrderId === rechargeOrderId);
    return found ? rowToPackageOrder(found) : null;
  }
  const result = await queryRunner(dbClient)("SELECT * FROM package_orders WHERE recharge_order_id = $1 LIMIT 1", [rechargeOrderId]);
  return result.rows[0] ? rowToPackageOrder(result.rows[0]) : null;
}

export async function activatePackageOrderForRecharge({ order, paidAt = new Date().toISOString(), approvedBy = "", dbClient = null } = {}) {
  const packageOrder = await getPackageOrderByRechargeOrderId(order?.id, dbClient);
  if (!packageOrder) return null;
  if (packageOrder.status === "activated") return packageOrder;
  const startedAt = paidAt || new Date().toISOString();
  const expiresAt = packageOrder.validDays > 0 ? addDays(startedAt, packageOrder.validDays) : null;
  const userPackage = {
    id: makeId("user_pkg"),
    userId: packageOrder.userId,
    packageOrderId: packageOrder.id,
    packageId: packageOrder.packageId,
    packageName: packageOrder.packageName,
    purchaseType: packageOrder.purchaseType,
    quotaText: packageOrder.quotaText,
    quotaTokens: packageOrder.quotaTokens,
    remainingTokens: packageOrder.quotaTokens,
    dailyQuotaTokens: packageOrder.dailyQuotaTokens,
    validDays: packageOrder.validDays,
    startedAt,
    expiresAt,
    status: "active",
    metadata: { approvedBy },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  if (!hasDatabase()) {
    const store = memoryStore();
    const target = store.packageOrders.find((item) => item.id === packageOrder.id);
    if (target) {
      target.status = "activated";
      target.paidAt = paidAt;
      target.activatedAt = nowIso();
      target.expiresAt = expiresAt;
    }
    store.userPackages.unshift(userPackage);
    return rowToPackageOrder(target || packageOrder);
  }
  const runQuery = queryRunner(dbClient);

  const activatedOrder = await runQuery(
    `UPDATE package_orders
     SET status = 'activated', paid_at = COALESCE(paid_at, $2::timestamptz), activated_at = NOW(), expires_at = $3::timestamptz
     WHERE id = $1 AND status <> 'activated'
     RETURNING *`,
    [packageOrder.id, paidAt, expiresAt]
  );
  if (!activatedOrder.rows[0]) return packageOrder;

  await runQuery(
    `INSERT INTO user_packages (
      id, user_id, package_order_id, package_id, package_name, purchase_type,
      quota_text, quota_tokens, remaining_tokens, daily_quota_tokens, valid_days,
      started_at, expires_at, status, metadata_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz,$13::timestamptz,'active',$14::jsonb)
    ON CONFLICT DO NOTHING`,
    [
      userPackage.id,
      userPackage.userId,
      userPackage.packageOrderId,
      userPackage.packageId,
      userPackage.packageName,
      userPackage.purchaseType,
      userPackage.quotaText,
      userPackage.quotaTokens,
      userPackage.remainingTokens,
      userPackage.dailyQuotaTokens,
      userPackage.validDays,
      userPackage.startedAt,
      userPackage.expiresAt,
      JSON.stringify(userPackage.metadata),
    ]
  );
  return rowToPackageOrder(activatedOrder.rows[0]);
}

export async function listUserPackages(userId, { includeExpired = false } = {}) {
  if (!userId) return [];
  if (!hasDatabase()) {
    return memoryStore().userPackages
      .filter((item) => item.userId === userId)
      .filter((item) => includeExpired || item.status === "active")
      .map(rowToUserPackage);
  }
  const result = await query(
    `SELECT * FROM user_packages
     WHERE user_id = $1
       ${includeExpired ? "" : "AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())"}
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  );
  return result.rows.map(rowToUserPackage);
}

export async function getActivePackageTokenBalance(userId) {
  if (!userId) return 0;
  const packages = await listUserPackages(userId);
  return packages.reduce((sum, item) => sum + Math.max(0, Number(item.remainingTokens || 0)), 0);
}

export async function reserveUserPackageTokens(userId, tokenCount = 0) {
  const requested = Math.max(0, Math.floor(Number(tokenCount || 0)));
  if (!userId || requested <= 0) return { reservedTokens: 0, reservations: [] };

  if (!hasDatabase()) {
    const store = memoryStore();
    const active = store.userPackages
      .filter((item) => item.userId === userId && item.status === "active")
      .filter((item) => !item.expiresAt || new Date(item.expiresAt) > new Date())
      .filter((item) => Number(item.remainingTokens || 0) > 0)
      .sort((a, b) => new Date(a.expiresAt || "2999-12-31").getTime() - new Date(b.expiresAt || "2999-12-31").getTime());
    let remaining = requested;
    const reservations = [];
    for (const item of active) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Math.floor(Number(item.remainingTokens || 0)));
      if (take <= 0) continue;
      item.remainingTokens = Math.max(0, Math.floor(Number(item.remainingTokens || 0)) - take);
      item.updatedAt = nowIso();
      reservations.push({ packageId: item.id, tokens: take });
      remaining -= take;
    }
    return {
      reservedTokens: reservations.reduce((sum, item) => sum + item.tokens, 0),
      reservations,
    };
  }

  const result = await query(
    `SELECT id, remaining_tokens
     FROM user_packages
     WHERE user_id = $1
       AND status = 'active'
       AND remaining_tokens > 0
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY expires_at ASC NULLS LAST, created_at ASC
     LIMIT 20`,
    [userId]
  );

  let remaining = requested;
  const reservations = [];
  for (const row of result.rows) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Math.floor(Number(row.remaining_tokens || 0)));
    if (take <= 0) continue;
    const updated = await query(
      `UPDATE user_packages
       SET remaining_tokens = GREATEST(0, remaining_tokens - $2),
           updated_at = NOW()
       WHERE id = $1
         AND remaining_tokens >= $2
         AND status = 'active'
       RETURNING id`,
      [row.id, take]
    );
    if (!updated.rows[0]) continue;
    reservations.push({ packageId: row.id, tokens: take });
    remaining -= take;
  }

  return {
    reservedTokens: reservations.reduce((sum, item) => sum + item.tokens, 0),
    reservations,
  };
}

export async function refundUserPackageTokens(reservations = [], refundTokens = null) {
  const items = Array.isArray(reservations) ? reservations.filter((item) => item?.packageId && Number(item.tokens || 0) > 0) : [];
  if (!items.length) return 0;
  let remainingRefund = refundTokens == null
    ? items.reduce((sum, item) => sum + Number(item.tokens || 0), 0)
    : Math.max(0, Math.floor(Number(refundTokens || 0)));
  if (remainingRefund <= 0) return 0;

  let refunded = 0;
  for (const item of [...items].reverse()) {
    if (remainingRefund <= 0) break;
    const amount = Math.min(remainingRefund, Math.floor(Number(item.tokens || 0)));
    if (amount <= 0) continue;
    if (!hasDatabase()) {
      const target = memoryStore().userPackages.find((pkg) => pkg.id === item.packageId);
      if (target) {
        target.remainingTokens = Math.floor(Number(target.remainingTokens || 0)) + amount;
        target.updatedAt = nowIso();
      }
    } else {
      await query(
        `UPDATE user_packages
         SET remaining_tokens = remaining_tokens + $2,
             updated_at = NOW()
         WHERE id = $1`,
        [item.packageId, amount]
      );
    }
    refunded += amount;
    remainingRefund -= amount;
  }

  return refunded;
}

export async function grantUserPackage({ userId, packageId, packageName = "", purchaseType = "activation_code", quotaText = "", quotaTokens = 0, dailyQuotaTokens = 0, validDays = 30, source = "manual", metadata = {} } = {}) {
  if (!userId || !packageId) return null;
  const startedAt = nowIso();
  const expiresAt = Number(validDays || 0) > 0 ? addDays(startedAt, validDays) : null;
  const entry = {
    id: makeId("user_pkg"),
    userId,
    packageOrderId: "",
    packageId,
    packageName: packageName || packageId,
    purchaseType,
    quotaText,
    quotaTokens: Number(quotaTokens || 0),
    remainingTokens: Number(quotaTokens || 0),
    dailyQuotaTokens: Number(dailyQuotaTokens || 0),
    validDays: Number(validDays || 0),
    startedAt,
    expiresAt,
    status: "active",
    metadata: { source, ...metadata },
    createdAt: startedAt,
    updatedAt: startedAt,
  };

  if (!hasDatabase()) {
    memoryStore().userPackages.unshift(entry);
    return rowToUserPackage(entry);
  }

  const result = await query(
    `INSERT INTO user_packages (
      id, user_id, package_order_id, package_id, package_name, purchase_type,
      quota_text, quota_tokens, remaining_tokens, daily_quota_tokens, valid_days,
      started_at, expires_at, status, metadata_json
    ) VALUES ($1,$2,'',$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12::timestamptz,'active',$13::jsonb)
    RETURNING *`,
    [
      entry.id,
      entry.userId,
      entry.packageId,
      entry.packageName,
      entry.purchaseType,
      entry.quotaText,
      entry.quotaTokens,
      entry.remainingTokens,
      entry.dailyQuotaTokens,
      entry.validDays,
      entry.startedAt,
      entry.expiresAt,
      JSON.stringify(entry.metadata),
    ]
  );
  return rowToUserPackage(result.rows[0]);
}

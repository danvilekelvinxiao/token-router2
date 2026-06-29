import { ensureSchema, getPool, hasDatabase, query } from "@/lib/db";

/**
 * Redeem Code System.
 * Uses Postgres when DATABASE_URL/POSTGRES_URL is configured, and falls back to
 * an in-memory store for local demos without database credentials.
 */

const store = globalThis.__REDEEM_CODES_STORE__ || {
  codes: [],
  batches: [],
  records: [],
  balanceLogs: [],
};

globalThis.__REDEEM_CODES_STORE__ = store;

/* ---------- helpers ---------- */

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `FLOW-${new Date().getFullYear()}-${seg()}-${seg()}`;
}

function now() {
  return new Date().toISOString();
}

function isExpired(expiredAt) {
  if (!expiredAt) return false;
  return new Date(expiredAt) < new Date();
}

function normalizeStatus(status, enabled = true) {
  if (enabled === false || status === "disabled") return "disabled";
  if (status === "redeemed" || status === "used") return "used";
  if (status === "active" || !status) return "unused";
  return status;
}

function rowToRedeemCode(row = {}) {
  if (!row) return null;
  const type = normalizeCodeType(row.type || "balance");
  const amountCny = Number(row.amount_cny ?? row.amount ?? 0);
  const tokenAmount = Number(row.token_amount || 0);
  const usedCount = Number(row.used_count || 0);
  const maxRedemptions = Math.max(1, Number(row.max_redemptions || 1));
  return {
    id: row.id,
    code: row.code,
    name: row.name || row.note || row.code,
    type,
    // Legacy DB/API field name amountCny stores FlowAPI wallet credit ($ API), not real RMB.
    amountCny,
    amountApi: amountCny,
    tokenAmount,
    packageId: row.package_id || "",
    serviceId: row.service_id || "",
    priceCny: Number(row.price_cny || amountCny || 0),
    status: normalizeStatus(row.status, row.enabled),
    enabled: row.enabled !== false,
    maxRedemptions,
    usedCount,
    batchId: row.batch_id || "",
    source: row.source || "taobao",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : now(),
    expiredAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    usedAt: row.redeemed_at ? new Date(row.redeemed_at).toISOString() : null,
    usedByUserId: row.redeemed_by || "",
    usedByUserName: row.user_name || "",
    note: row.note || "",
  };
}

function rowToRedeemRecord(row = {}) {
  return {
    id: row.id,
    codeId: row.code_id,
    code: row.code,
    userId: row.user_id,
    userName: row.user_name || row.user_id,
    type: row.type || "balance",
    // Legacy DB/API field name amountCny stores FlowAPI wallet credit ($ API), not real RMB.
    amountCny: Number(row.redeemed_amount_cny || 0),
    amountApi: Number(row.redeemed_amount_cny || 0),
    tokenAmount: Number(row.redeemed_token_amount || 0),
    packageId: row.redeemed_package_id || "",
    redeemedAt: row.created_at ? new Date(row.created_at).toISOString() : now(),
    ip: row.ip || "unknown",
    source: row.source || "",
  };
}

const VALID_CODE_TYPES = new Set(["balance", "token", "package"]);

function normalizeCodeType(type = "balance") {
  if (type === "amount") return "balance";
  if (type === "tokens") return "token";
  if (type === "service") return "package";
  return VALID_CODE_TYPES.has(type) ? type : "balance";
}

export function validateRedeemCodePayload(params = {}) {
  const type = normalizeCodeType(params.type);
  const amountCny = Number(params.amountCny ?? params.redeemAmount ?? params.amount ?? 0);
  const tokenAmount = Number(params.tokenAmount ?? params.quotaTokens ?? params.tokenQuota ?? 0);
  const packageId = String(params.packageId || params.serviceId || "").trim();

  if (type === "balance" && (!Number.isFinite(amountCny) || amountCny <= 0)) {
    return { ok: false, error: "账户余额激活码请输入 $ API 到账金额。" };
  }
  if (type === "token" && (!Number.isFinite(tokenAmount) || tokenAmount <= 0)) {
    return { ok: false, error: "Token 激活码请输入 Token 额度。" };
  }
  if (type === "package" && !packageId) {
    return { ok: false, error: "套餐激活码请选择套餐服务。" };
  }
  return {
    ok: true,
    value: {
      type,
      amountCny: type === "balance" ? amountCny : 0,
      tokenAmount: type === "token" ? tokenAmount : 0,
      packageId: type === "package" ? packageId : "",
      serviceId: String(params.serviceId || "").trim(),
    },
  };
}

/* ---------- rate limiter ---------- */

const rateLimiters = {};

function checkRateLimit(key, maxAttempts, windowMs) {
  const entry = rateLimiters[key] || { attempts: 0, resetAt: Date.now() + windowMs };
  if (Date.now() > entry.resetAt) {
    entry.attempts = 0;
    entry.resetAt = Date.now() + windowMs;
  }
  entry.attempts++;
  rateLimiters[key] = entry;
  return entry.attempts <= maxAttempts;
}

/* ---------- code CRUD ---------- */

export async function createRedeemCode(params) {
  const validation = validateRedeemCodePayload(params);
  if (!validation.ok) throw new Error(validation.error);
  const { type, amountCny, tokenAmount, packageId, serviceId } = validation.value;
  const { name, priceCny = 0, source = "taobao", batchId = "", note = "", remark = "", expiredAt = null, expiresAt = null, maxRedemptionsPerCode = 1, enabled = true } = params;
  const defaultName = type === "balance"
    ? `淘宝 $ API ${amountCny || priceCny} 充值码`
    : type === "token"
      ? `${tokenAmount} Token 激活码`
      : `${packageId} 套餐激活码`;
  const code = generateCode();
  const entry = {
    id: makeId("rc"),
    code,
    name: name || defaultName,
    type,
    amountCny,
    tokenAmount,
    packageId,
    serviceId,
    priceCny: Number(priceCny) || 0,
    status: enabled === false ? "disabled" : "unused",
    enabled: enabled !== false,
    maxRedemptions: Math.max(1, Number(maxRedemptionsPerCode || params.maxRedemptions || 1)),
    usedCount: 0,
    batchId: batchId || "",
    source: source || "taobao",
    createdAt: now(),
    expiredAt: expiredAt || expiresAt || null,
    usedAt: null,
    usedByUserId: null,
    usedByUserName: null,
    note: note || remark || "",
  };
  if (hasDatabase()) {
    const result = await query(
      `INSERT INTO activation_codes
        (id, code, batch_id, name, type, amount, amount_cny, token_amount, package_id, service_id, max_redemptions, used_count, expires_at, enabled, status, price_cny, source, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, 0, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        entry.id,
        entry.code,
        entry.batchId,
        entry.name,
        entry.type,
        entry.amountCny,
        entry.tokenAmount,
        entry.packageId,
        entry.serviceId,
        entry.maxRedemptions,
        entry.expiredAt,
        entry.enabled,
        entry.status,
        entry.priceCny,
        entry.source,
        entry.note,
        String(params.createdBy || "admin"),
      ]
    );
    return rowToRedeemCode(result.rows[0]);
  }
  store.codes.push(entry);
  return entry;
}

export async function batchCreateCodes(params) {
  const validation = validateRedeemCodePayload(params);
  if (!validation.ok) throw new Error(validation.error);
  const { type, amountCny, tokenAmount, packageId, serviceId } = validation.value;
  const { name, priceCny = 0, source = "taobao", quantity, note = "", remark = "", expiredAt = null, expiresAt = null, maxRedemptionsPerCode = 1, enabled = true } = params;
  const batchId = makeId("batch");
  const batch = {
    id: batchId,
    name: name || `批次 ${new Date().toLocaleDateString("zh-CN")}`,
    quantity: Number(quantity) || 0,
    type,
    amountCny,
    tokenAmount,
    packageId,
    serviceId,
    priceCny: Number(priceCny) || 0,
    source,
    createdBy: "admin",
    createdAt: now(),
    expiredAt: expiredAt || expiresAt || null,
    note: note || remark || "",
    codes: [],
  };

  for (let i = 0; i < (Number(quantity) || 0); i++) {
    const entry = await createRedeemCode({ name, type, amountCny, tokenAmount, packageId, serviceId, priceCny: Number(priceCny) || 0, source, batchId, note: note || remark || "", expiredAt: expiredAt || expiresAt, maxRedemptionsPerCode, enabled, createdBy: params.createdBy || "admin" });
    batch.codes.push(entry.code);
  }

  if (!hasDatabase()) store.batches.push(batch);
  return { batch, codes: batch.codes };
}

export async function listRedeemCodes(filters = {}) {
  if (hasDatabase()) {
    const where = [];
    const params = [];
    if (filters.status && filters.status !== "all") {
      if (filters.status === "unused") {
        where.push("(status = 'unused' OR status = 'active')");
      } else {
        params.push(filters.status);
        where.push(`status = $${params.length}`);
      }
    }
    if (filters.source && filters.source !== "all") {
      params.push(filters.source);
      where.push(`source = $${params.length}`);
    }
    if (filters.batchId) {
      params.push(filters.batchId);
      where.push(`batch_id = $${params.length}`);
    }
    if (filters.type) {
      params.push(filters.type);
      where.push(`type = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${String(filters.search).toLowerCase()}%`);
      where.push(`(LOWER(code) LIKE $${params.length} OR LOWER(name) LIKE $${params.length})`);
    }
    const result = await query(
      `SELECT * FROM activation_codes
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT 1000`,
      params
    );
    return result.rows.map(rowToRedeemCode);
  }
  let codes = [...store.codes];
  if (filters.status && filters.status !== "all") codes = codes.filter((c) => c.status === filters.status);
  if (filters.source && filters.source !== "all") codes = codes.filter((c) => c.source === filters.source);
  if (filters.batchId) codes = codes.filter((c) => c.batchId === filters.batchId);
  if (filters.type) codes = codes.filter((c) => c.type === filters.type);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    codes = codes.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }
  codes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return codes;
}

export async function getRedeemCodeById(id) {
  if (hasDatabase()) {
    const result = await query("SELECT * FROM activation_codes WHERE id = $1 LIMIT 1", [id]);
    return rowToRedeemCode(result.rows[0]);
  }
  return store.codes.find((c) => c.id === id) || null;
}

export async function getRedeemCodeByCode(code) {
  if (hasDatabase()) {
    const result = await query("SELECT * FROM activation_codes WHERE UPPER(code) = UPPER($1) LIMIT 1", [String(code || "").trim()]);
    return rowToRedeemCode(result.rows[0]);
  }
  return store.codes.find((c) => c.code === code.toUpperCase().trim()) || null;
}

export async function disableRedeemCode(id) {
  if (hasDatabase()) {
    const entry = await getRedeemCodeById(id);
    if (!entry) throw new Error("激活码不存在");
    if (entry.status === "used") throw new Error("已使用的激活码不能禁用");
    const result = await query(
      "UPDATE activation_codes SET status = 'disabled', enabled = false, updated_at = NOW() WHERE id = $1 RETURNING *",
      [id]
    );
    return rowToRedeemCode(result.rows[0]);
  }
  const entry = store.codes.find((c) => c.id === id);
  if (!entry) throw new Error("激活码不存在");
  if (entry.status === "used") throw new Error("已使用的激活码不能禁用");
  entry.status = "disabled";
  return entry;
}

export async function deleteRedeemCode(id) {
  if (hasDatabase()) {
    const entry = await getRedeemCodeById(id);
    if (!entry) throw new Error("激活码不存在");
    if (entry.status === "used" || Number(entry.usedCount || 0) > 0) throw new Error("已使用的激活码不能删除");
    await query("DELETE FROM activation_codes WHERE id = $1", [id]);
    return { success: true };
  }
  const entry = store.codes.find((c) => c.id === id);
  if (!entry) throw new Error("激活码不存在");
  if (entry.status === "used") throw new Error("已使用的激活码不能删除");
  store.codes = store.codes.filter((c) => c.id !== id);
  return { success: true };
}

/* ---------- batch ---------- */

export async function listBatches() {
  if (hasDatabase()) {
    const result = await query(
      `SELECT
         batch_id,
         MAX(name) AS name,
         COUNT(*)::int AS quantity,
         MAX(type) AS type,
         MAX(amount_cny) AS amount_cny,
         MAX(token_amount) AS token_amount,
         MAX(package_id) AS package_id,
         MAX(service_id) AS service_id,
         MAX(price_cny) AS price_cny,
         MAX(source) AS source,
         MIN(created_at) AS created_at,
         MAX(expires_at) AS expires_at,
         MAX(note) AS note,
         ARRAY_AGG(code ORDER BY created_at ASC) AS codes
       FROM activation_codes
       WHERE batch_id <> ''
       GROUP BY batch_id
       ORDER BY MIN(created_at) DESC
       LIMIT 500`
    );
    return result.rows.map((row) => ({
      id: row.batch_id,
      name: row.name || `批次 ${row.batch_id}`,
      quantity: Number(row.quantity || 0),
      type: row.type || "balance",
      amountCny: Number(row.amount_cny || 0),
      amountApi: Number(row.amount_cny || 0),
      tokenAmount: Number(row.token_amount || 0),
      packageId: row.package_id || "",
      serviceId: row.service_id || "",
      priceCny: Number(row.price_cny || 0),
      source: row.source || "taobao",
      createdBy: "admin",
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : now(),
      expiredAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      note: row.note || "",
      codes: row.codes || [],
    }));
  }
  return [...store.batches].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getBatchById(id) {
  if (hasDatabase()) {
    const batches = await listBatches();
    return batches.find((batch) => batch.id === id) || null;
  }
  return store.batches.find((b) => b.id === id) || null;
}

/* ---------- redeem ---------- */

export async function redeemCode(code, user, ip) {
  // Rate limit per user
  if (!checkRateLimit(`redeem_user:${user.id}`, 5, 10 * 60 * 1000)) {
    return { success: false, error: "兑换尝试次数过多，请 10 分钟后再试。" };
  }
  // Rate limit per IP
  if (!checkRateLimit(`redeem_ip:${ip}`, 10, 30 * 60 * 1000)) {
    return { success: false, error: "该 IP 兑换尝试次数过多，请 30 分钟后再试。" };
  }

  if (hasDatabase()) {
    await ensureSchema();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query("SELECT * FROM activation_codes WHERE UPPER(code) = UPPER($1) LIMIT 1 FOR UPDATE", [String(code || "").trim()]);
      const entry = rowToRedeemCode(current.rows[0]);
      if (!entry) {
        await client.query("ROLLBACK");
        return { success: false, error: "激活码不存在，请检查是否输入正确。" };
      }
      const maxRedemptions = Math.max(1, Number(entry.maxRedemptions || 1));
      const currentUsedCount = Number(entry.usedCount || 0);
      if (entry.status === "used" || currentUsedCount >= maxRedemptions) {
        await client.query("ROLLBACK");
        return { success: false, error: "该激活码已被使用，无法重复兑换。" };
      }
      if (entry.status === "disabled") {
        await client.query("ROLLBACK");
        return { success: false, error: "该激活码已被禁用，请联系 FlowAPI 客服。" };
      }
      if (isExpired(entry.expiredAt)) {
        await client.query("ROLLBACK");
        return { success: false, error: "该激活码已过期，请联系商家处理。" };
      }

      const usedCount = currentUsedCount + 1;
      const nextStatus = usedCount >= maxRedemptions ? "used" : "unused";
      const userName = user.name || user.email || "未知用户";
      await client.query(
        `UPDATE activation_codes
         SET used_count = $2,
             status = $3,
             redeemed_by = $4,
             redeemed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [entry.id, usedCount, nextStatus, user.id]
      );

      const amountCny = entry.type === "balance" ? Number(entry.amountCny || 0) : 0;
      const record = {
        id: makeId("rcd"),
        codeId: entry.id,
        code: entry.code,
        userId: user.id,
        userName,
        type: entry.type,
        amountCny,
        amountApi: amountCny,
        tokenAmount: entry.type === "token" ? Number(entry.tokenAmount || 0) : 0,
        packageId: entry.type === "package" ? entry.packageId || "" : "",
        redeemedAt: now(),
        ip: ip || "unknown",
        source: entry.source,
      };
      await client.query(
        `INSERT INTO activation_code_redemptions
          (id, code_id, code, user_id, user_name, redeemed_amount_cny, redeemed_token_amount, redeemed_package_id, type, source, ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          record.id,
          record.codeId,
          record.code,
          record.userId,
          record.userName,
          record.amountCny,
          record.tokenAmount,
          record.packageId,
          record.type,
          record.source,
          record.ip,
        ]
      );
      await client.query("COMMIT");
      return {
        success: true,
        message: "兑换成功",
        amountCny,
        amountApi: amountCny,
        tokenAmount: record.tokenAmount,
        packageId: record.packageId,
        serviceId: entry.serviceId || "",
        newBalanceCny: Number(user.balance || 0) + amountCny,
        newBalanceApi: Number(user.balance || 0) + amountCny,
        record,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => null);
      return { success: false, error: error.message || "激活码兑换失败，请稍后重试。" };
    } finally {
      client.release();
    }
  }

  const entry = await getRedeemCodeByCode(code);
  if (!entry) return { success: false, error: "激活码不存在，请检查是否输入正确。" };
  const maxRedemptions = Math.max(1, Number(entry.maxRedemptions || 1));
  const currentUsedCount = Number(entry.usedCount || 0);
  if (entry.status === "used" || currentUsedCount >= maxRedemptions) return { success: false, error: "该激活码已被使用，无法重复兑换。" };
  if (entry.status === "disabled") return { success: false, error: "该激活码已被禁用，请联系 FlowAPI 客服。" };
  if (isExpired(entry.expiredAt)) return { success: false, error: "该激活码已过期，请联系商家处理。" };

  // Mark as used
  entry.usedCount = currentUsedCount + 1;
  entry.status = entry.usedCount >= maxRedemptions ? "used" : "unused";
  entry.usedAt = now();
  entry.usedByUserId = user.id;
  entry.usedByUserName = user.name || user.email || "未知用户";

  // Create redemption record
  const record = {
    id: makeId("rcd"),
    codeId: entry.id,
    code: entry.code,
    userId: user.id,
    userName: entry.usedByUserName,
    type: entry.type,
    amountCny: entry.amountCny,
    amountApi: entry.amountCny,
    tokenAmount: entry.tokenAmount,
    packageId: entry.packageId || "",
    serviceId: entry.serviceId || "",
    redeemedAt: now(),
    ip: ip || "unknown",
    source: entry.source,
  };
  store.records.push(record);

  // Create balance transaction log
  const beforeBalance = Number(user.balance || 0);
  const amountCny = entry.type === "balance" ? entry.amountCny : 0;
  const afterBalance = beforeBalance + amountCny;
  const balanceLog = {
    id: makeId("btxn"),
    userId: user.id,
    type: "redeem_code",
    amountCny,
    beforeBalanceCny: beforeBalance,
    afterBalanceCny: afterBalance,
    relatedId: entry.id,
    note: `使用淘宝激活码兑换 ${entry.code}`,
    createdAt: now(),
  };
  store.balanceLogs.push(balanceLog);

  return {
    success: true,
    message: "兑换成功",
    amountCny,
    amountApi: amountCny,
    tokenAmount: entry.tokenAmount,
    packageId: entry.packageId || "",
    serviceId: entry.serviceId || "",
    newBalanceCny: afterBalance,
    newBalanceApi: afterBalance,
    record,
  };
}

/* ---------- records ---------- */

export async function listRedeemRecords(filters = {}) {
  if (hasDatabase()) {
    const where = [];
    const params = [];
    if (filters.source && filters.source !== "all") {
      params.push(filters.source);
      where.push(`source = $${params.length}`);
    }
    if (filters.userId) {
      params.push(filters.userId);
      where.push(`user_id = $${params.length}`);
    }
    if (filters.codeId) {
      params.push(filters.codeId);
      where.push(`code_id = $${params.length}`);
    }
    const result = await query(
      `SELECT * FROM activation_code_redemptions
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT 1000`,
      params
    );
    return result.rows.map(rowToRedeemRecord);
  }
  let records = [...store.records];
  if (filters.source && filters.source !== "all") records = records.filter((r) => r.source === filters.source);
  if (filters.userId) records = records.filter((r) => r.userId === filters.userId);
  if (filters.codeId) records = records.filter((r) => r.codeId === filters.codeId);
  records.sort((a, b) => new Date(b.redeemedAt) - new Date(a.redeemedAt));
  return records;
}

/* ---------- balance logs ---------- */

export async function listBalanceLogs(filters = {}) {
  let logs = [...store.balanceLogs];
  if (filters.userId) logs = logs.filter((l) => l.userId === filters.userId);
  if (filters.type) logs = logs.filter((l) => l.type === filters.type);
  logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return logs;
}

/* ---------- mock seed data ---------- */

export function seedMockData() {
  if (hasDatabase()) return;
  if (store.codes.length > 0) return; // Already seeded

  const demo100 = {
    id: makeId("rc"),
    code: generateCode(),
    name: "淘宝 $100 充值码",
    type: "balance",
    amountCny: 100,
    tokenAmount: 0,
    packageId: "",
    serviceId: "",
    priceCny: 100,
    status: "unused",
    enabled: true,
    maxRedemptions: 1,
    usedCount: 0,
    batchId: "",
    source: "taobao",
    createdAt: now(),
    expiredAt: "2026-12-31T23:59:59.999Z",
    usedAt: null,
    usedByUserId: null,
    usedByUserName: null,
    note: "演示数据",
  };
  store.codes.push(
    demo100,
    { ...demo100, id: makeId("rc"), code: generateCode(), name: "淘宝 $50 充值码", amountCny: 50, priceCny: 50 },
    { ...demo100, id: makeId("rc"), code: generateCode(), name: "淘宝 $200 充值码", amountCny: 200, priceCny: 200 }
  );

  // Mark one as used
  const usedEntry = { ...demo100, id: makeId("rc"), code: generateCode(), name: "活动赠送 $20 体验码", amountCny: 20, priceCny: 0, source: "promo", note: "已使用演示" };
  store.codes.push(usedEntry);
  usedEntry.status = "used";
  usedEntry.usedCount = 1;
  usedEntry.usedAt = "2026-05-21T21:30:00.000Z";
  usedEntry.usedByUserId = "cus_admin";
  usedEntry.usedByUserName = "Test";

  store.codes.push({ ...demo100, id: makeId("rc"), code: generateCode(), name: "客户补偿 $500 码", amountCny: 500, priceCny: 0, source: "gift", note: "补偿发放", expiredAt: "2026-08-31T23:59:59.999Z" });

  // Seed a batch
  const batchId = makeId("batch");
  const batch = { id: batchId, name: "淘宝 $100 激活码 2026-05 批次", quantity: 5, type: "balance", amountCny: 100, tokenAmount: 0, priceCny: 100, source: "taobao", createdBy: "admin", createdAt: now(), expiredAt: "2026-07-31T23:59:59.999Z", note: "演示批次", codes: [] };
  for (let i = 0; i < 5; i++) {
    const entry = { ...demo100, id: makeId("rc"), code: generateCode(), name: batch.name, batchId, expiredAt: batch.expiredAt, note: batch.note };
    store.codes.push(entry);
    batch.codes.push(entry.code);
  }
  store.batches.push(batch);

  // Seed a redemption record
  store.records.push({
    id: makeId("rcd"),
    codeId: usedEntry.id,
    code: usedEntry.code,
    userId: "cus_admin",
    userName: "Test",
    type: "balance",
    amountCny: 20,
    tokenAmount: 0,
    redeemedAt: "2026-05-21T21:30:00.000Z",
    ip: "127.0.0.1",
    source: "promo",
  });
}

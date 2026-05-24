/**
 * Redeem Code System — in-memory store.
 * Tracks activation codes, batches, redemption records, and balance transactions.
 * Mirrors the globalThis pattern used in customer-store.js.
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

export function createRedeemCode(params) {
  const { name, type = "balance", amountCny = 0, tokenAmount = 0, priceCny = 0, source = "taobao", batchId = "", note = "", expiredAt = null } = params;
  const code = generateCode();
  const entry = {
    id: makeId("rc"),
    code,
    name: name || `淘宝 ¥${amountCny || priceCny} 充值码`,
    type,
    amountCny: Number(amountCny) || 0,
    tokenAmount: Number(tokenAmount) || 0,
    priceCny: Number(priceCny) || 0,
    status: "unused",
    batchId: batchId || "",
    source: source || "taobao",
    createdAt: now(),
    expiredAt: expiredAt || null,
    usedAt: null,
    usedByUserId: null,
    usedByUserName: null,
    note: note || "",
  };
  store.codes.push(entry);
  return entry;
}

export function batchCreateCodes(params) {
  const { name, type = "balance", amountCny = 0, tokenAmount = 0, priceCny = 0, source = "taobao", quantity, note = "", expiredAt = null } = params;
  const batchId = makeId("batch");
  const batch = {
    id: batchId,
    name: name || `批次 ${new Date().toLocaleDateString("zh-CN")}`,
    quantity: Number(quantity) || 0,
    type,
    amountCny: Number(amountCny) || 0,
    tokenAmount: Number(tokenAmount) || 0,
    priceCny: Number(priceCny) || 0,
    source,
    createdBy: "admin",
    createdAt: now(),
    expiredAt: expiredAt || null,
    note: note || "",
    codes: [],
  };

  for (let i = 0; i < (Number(quantity) || 0); i++) {
    const entry = createRedeemCode({ name, type, amountCny: Number(amountCny) || 0, tokenAmount: Number(tokenAmount) || 0, priceCny: Number(priceCny) || 0, source, batchId, note: note || "", expiredAt });
    batch.codes.push(entry.code);
  }

  store.batches.push(batch);
  return { batch, codes: batch.codes };
}

export function listRedeemCodes(filters = {}) {
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

export function getRedeemCodeById(id) {
  return store.codes.find((c) => c.id === id) || null;
}

export function getRedeemCodeByCode(code) {
  return store.codes.find((c) => c.code === code.toUpperCase().trim()) || null;
}

export function disableRedeemCode(id) {
  const entry = store.codes.find((c) => c.id === id);
  if (!entry) throw new Error("激活码不存在");
  if (entry.status === "used") throw new Error("已使用的激活码不能禁用");
  entry.status = "disabled";
  return entry;
}

export function deleteRedeemCode(id) {
  const entry = store.codes.find((c) => c.id === id);
  if (!entry) throw new Error("激活码不存在");
  if (entry.status === "used") throw new Error("已使用的激活码不能删除");
  store.codes = store.codes.filter((c) => c.id !== id);
  return { success: true };
}

/* ---------- batch ---------- */

export function listBatches() {
  return [...store.batches].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getBatchById(id) {
  return store.batches.find((b) => b.id === id) || null;
}

/* ---------- redeem ---------- */

export function redeemCode(code, user, ip) {
  // Rate limit per user
  if (!checkRateLimit(`redeem_user:${user.id}`, 5, 10 * 60 * 1000)) {
    return { success: false, error: "兑换尝试次数过多，请 10 分钟后再试。" };
  }
  // Rate limit per IP
  if (!checkRateLimit(`redeem_ip:${ip}`, 10, 30 * 60 * 1000)) {
    return { success: false, error: "该 IP 兑换尝试次数过多，请 30 分钟后再试。" };
  }

  const entry = getRedeemCodeByCode(code);
  if (!entry) return { success: false, error: "激活码不存在，请检查是否输入正确。" };
  if (entry.status === "used") return { success: false, error: "该激活码已被使用，无法重复兑换。" };
  if (entry.status === "disabled") return { success: false, error: "该激活码已被禁用，请联系 FlowAPI 客服。" };
  if (isExpired(entry.expiredAt)) return { success: false, error: "该激活码已过期，请联系商家处理。" };

  // Mark as used
  entry.status = "used";
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
    tokenAmount: entry.tokenAmount,
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
    tokenAmount: entry.tokenAmount,
    newBalanceCny: afterBalance,
    record,
  };
}

/* ---------- records ---------- */

export function listRedeemRecords(filters = {}) {
  let records = [...store.records];
  if (filters.source && filters.source !== "all") records = records.filter((r) => r.source === filters.source);
  if (filters.userId) records = records.filter((r) => r.userId === filters.userId);
  if (filters.codeId) records = records.filter((r) => r.codeId === filters.codeId);
  records.sort((a, b) => new Date(b.redeemedAt) - new Date(a.redeemedAt));
  return records;
}

/* ---------- balance logs ---------- */

export function listBalanceLogs(filters = {}) {
  let logs = [...store.balanceLogs];
  if (filters.userId) logs = logs.filter((l) => l.userId === filters.userId);
  if (filters.type) logs = logs.filter((l) => l.type === filters.type);
  logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return logs;
}

/* ---------- mock seed data ---------- */

export function seedMockData() {
  if (store.codes.length > 0) return; // Already seeded

  createRedeemCode({ name: "淘宝 ¥100 充值码", type: "balance", amountCny: 100, priceCny: 100, source: "taobao", note: "演示数据", expiredAt: "2026-12-31T23:59:59.999Z" });
  createRedeemCode({ name: "淘宝 ¥50 充值码", type: "balance", amountCny: 50, priceCny: 50, source: "taobao", note: "演示数据", expiredAt: "2026-12-31T23:59:59.999Z" });
  createRedeemCode({ name: "淘宝 ¥200 充值码", type: "balance", amountCny: 200, priceCny: 200, source: "taobao", note: "演示数据", expiredAt: "2026-12-31T23:59:59.999Z" });

  // Mark one as used
  const usedEntry = createRedeemCode({ name: "活动赠送 ¥20 体验码", type: "balance", amountCny: 20, priceCny: 0, source: "promo", note: "已使用演示" });
  usedEntry.status = "used";
  usedEntry.usedAt = "2026-05-21T21:30:00.000Z";
  usedEntry.usedByUserId = "cus_admin";
  usedEntry.usedByUserName = "Test";

  createRedeemCode({ name: "客户补偿 ¥500 码", type: "balance", amountCny: 500, priceCny: 0, source: "gift", note: "补偿发放", expiredAt: "2026-08-31T23:59:59.999Z" });

  // Seed a batch
  batchCreateCodes({ name: "淘宝 ¥100 激活码 2026-05 批次", type: "balance", amountCny: 100, priceCny: 100, source: "taobao", quantity: 5, note: "演示批次", expiredAt: "2026-07-31T23:59:59.999Z" });

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

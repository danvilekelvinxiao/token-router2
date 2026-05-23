import crypto from "crypto";
import { hasDatabase, query } from "./db";
import { createNewApiToken, disableNewApiToken, enableNewApiToken } from "./new-api/client";
import { hashPassword, verifyPassword } from "./passwords";
import { getModelProduct } from "./model-products";

const initialKey = process.env.PROXY_ACCESS_TOKEN || "sk-default";
const VERIFY_SECRET = process.env.VERIFY_SECRET || "flowapi-verify-secret-2024";
const DEFAULT_INVITE_CODES = ["FLOWAPI"];
const FREE_TRIAL_CREDIT = Number(process.env.FREE_TRIAL_CREDIT || 5);
const INVITER_BONUS_CREDIT = Number(process.env.INVITER_BONUS_CREDIT || 20);
const INVITEE_BONUS_CREDIT = Number(process.env.INVITEE_BONUS_CREDIT || 0);
const DAILY_LOGIN_CREDIT = Number(process.env.DAILY_LOGIN_CREDIT || 0.5);
const DAILY_USAGE_CREDIT = Number(process.env.DAILY_USAGE_CREDIT || 1.5);

const store = globalThis.__TOKEN_ROUTER_CUSTOMERS__ || {
  customers: [
    {
      id: "cus_admin",
      name: "xiaoyijie",
      phone: "",
      company: "FlowAPI",
      email: "xiaoyijie@flowapi.fun",
      passwordHash: "xiaoyijie2",
      role: "admin",
      usedInviteCode: "",
      invitedBy: null,
      myInviteCode: "0001",
      balance: 9999,
      totalSpend: 0,
      emailVerified: true,
      createdAt: new Date().toISOString(),
    },
  ],
  apiKeys: [
    {
      id: "key_admin",
      customerId: "cus_admin",
      token: "sk-" + Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
      label: "管理员 API 密匙",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    },
  ],
  calls: [],
  verificationCodes: [],
  temporaryCredits: [],
};

globalThis.__TOKEN_ROUTER_CUSTOMERS__ = store;
if (!store.temporaryCredits) store.temporaryCredits = [];

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function makeToken() {
  const hex = Array.from({ length: 48 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return `sk-${hex}`;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function randomInviteCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function getChinaDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getChinaDayExpiry(dayKey = getChinaDayKey()) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
}

function isTemporaryCreditActive(credit) {
  return Number(credit.remaining || 0) > 0 && new Date(credit.expiresAt || credit.expires_at) > new Date();
}

function generateInviteCode() {
  let code;
  do {
    code = randomInviteCode();
  } while (store.customers.some((c) => c.myInviteCode === code));
  return code;
}

function getInviteCodes() {
  const raw = process.env.FLOWAPI_INVITE_CODES || process.env.INVITE_CODES || "";
  return (raw ? raw.split(",") : DEFAULT_INVITE_CODES)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

function isInviteCodeRequired() {
  return process.env.FLOWAPI_INVITE_REQUIRED === "true" || process.env.INVITE_CODE_REQUIRED === "true";
}

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64").toString();
}

function signToken(payload) {
  const json = JSON.stringify(payload);
  const b64 = base64url(Buffer.from(json));
  const sig = crypto.createHmac("sha256", VERIFY_SECRET).update(b64).digest("base64");
  return `${b64}.${base64url(Buffer.from(sig, "base64"))}`;
}

function unsignToken(token) {
  try {
    const [b64, sig] = token.split(".");
    const expectedSig = crypto.createHmac("sha256", VERIFY_SECRET).update(b64).digest("base64");
    const expected = base64url(Buffer.from(expectedSig, "base64"));
    if (sig !== expected) return null;
    return JSON.parse(fromBase64url(b64));
  } catch {
    return null;
  }
}

function hashVerificationCode(email, code, purpose = "register") {
  return crypto
    .createHmac("sha256", VERIFY_SECRET)
    .update(`${normalizeEmail(email)}:${purpose}:${String(code)}`)
    .digest("hex");
}

function rowToCustomer(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    phone: row.phone || "",
    company: row.company || "",
    email: row.email || "",
    passwordHash: row.password_hash,
    role: row.role || "user",
    usedInviteCode: row.used_invite_code || "",
    invitedBy: row.invited_by || null,
    myInviteCode: row.my_invite_code || "",
    balance: Number(row.balance || 0),
    totalSpend: Number(row.total_spend || 0),
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

function rowToApiKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    token: row.token,
    label: row.label,
    newApiId: row.new_api_token_id || "",
    newApiSyncStatus: row.new_api_sync_status || "",
    newApiSyncedAt: row.new_api_synced_at ? new Date(row.new_api_synced_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    disabledAt: row.disabled_at ? new Date(row.disabled_at).toISOString() : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    modelProductId: row.model_product_id || "",
    publicModelId: row.public_model_id || "",
    actualModelId: row.actual_model_id || "",
    modelDisplayName: row.model_display_name || "",
    modelGroup: row.model_group || "",
    allowedModels: String(row.allowed_models || "").split(",").map((item) => item.trim()).filter(Boolean),
    priceMultiplier: Number(row.price_multiplier || 1),
  };
}

function rowToCall(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    apiKeyId: row.api_key_id,
    customer: row.customer,
    endpoint: row.endpoint,
    requestedModel: row.requested_model,
    routedModel: row.routed_model,
    provider: row.provider,
    status: Number(row.status || 0),
    promptTokens: Number(row.prompt_tokens || 0),
    completionTokens: Number(row.completion_tokens || 0),
    tokens: Number(row.tokens || 0),
    cost: Number(row.cost || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

function rowToRechargeOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    outTradeNo: row.out_trade_no || row.id,
    amount: Number(row.amount || 0),
    currency: row.currency || "CNY",
    paymentMethod: row.payment_method || "wechat",
    paymentRef: row.payment_ref || "",
    providerTradeNo: row.provider_trade_no || "",
    gatewayPayload: row.gateway_payload || "",
    status: row.status || "pending",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    approvedBy: row.approved_by || "",
    customerEmail: row.email || "",
    customerName: row.name || "",
  };
}

function rowToActivityLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id || "",
    email: row.email || "",
    action: row.action || "",
    category: row.category || "general",
    detail: row.detail || "",
    amount: row.amount ? Number(row.amount) : null,
    ip: row.ip || "",
    userAgent: row.user_agent || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

export async function logActivity({ customerId = "", email = "", action, category = "general", detail = "", amount = null, ip = "", userAgent = "" }) {
  if (!action) return;

  if (!hasDatabase()) {
    if (!store.activityLogs) store.activityLogs = [];
    store.activityLogs.unshift({
      id: makeId("log"),
      customerId,
      email,
      action,
      category,
      detail,
      amount: amount != null ? Number(Number(amount).toFixed(2)) : null,
      ip,
      userAgent,
      createdAt: new Date().toISOString(),
    });
    if (store.activityLogs.length > 5000) store.activityLogs.length = 5000;
    return;
  }

  await query(
    `INSERT INTO activity_logs (id, customer_id, email, action, category, detail, amount, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      makeId("log"),
      customerId || "",
      email || "",
      action,
      category,
      String(detail || "").slice(0, 2000),
      amount != null ? Number(Number(amount).toFixed(2)) : null,
      String(ip || "").slice(0, 64),
      String(userAgent || "").slice(0, 512),
    ]
  );
}

export async function listActivityLogs({ customerId = "", category = "", action = "", limit = 200, offset = 0 } = {}) {
  if (!hasDatabase()) {
    let logs = store.activityLogs || [];
    if (customerId) logs = logs.filter((l) => l.customerId === customerId);
    if (category) logs = logs.filter((l) => l.category === category);
    if (action) logs = logs.filter((l) => l.action === action);
    return { logs: logs.slice(offset, offset + limit), total: logs.length };
  }

  const conditions = [];
  const params = [];
  if (customerId) { params.push(customerId); conditions.push(`customer_id = $${params.length}`); }
  if (category) { params.push(category); conditions.push(`category = $${params.length}`); }
  if (action) { params.push(action); conditions.push(`action = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countResult = await query(`SELECT COUNT(*) as cnt FROM activity_logs ${where}`, params);

  params.push(Number(limit) || 200);
  const limitIdx = params.length;
  params.push(Number(offset) || 0);
  const offsetIdx = params.length;

  const result = await query(
    `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return {
    logs: result.rows.map(rowToActivityLog),
    total: parseInt(countResult.rows[0]?.cnt || "0", 10),
  };
}

function getInviteCount(customerId) {
  if (!hasDatabase()) {
    return store.customers.filter((c) => c.invitedBy === customerId && c.emailVerified).length;
  }
  return 0; // db version set below
}

export async function getTemporaryCreditBalance(customerId) {
  if (!customerId) return 0;
  if (!hasDatabase()) {
    return Number(store.temporaryCredits
      .filter((credit) => credit.customerId === customerId && isTemporaryCreditActive(credit))
      .reduce((total, credit) => total + Number(credit.remaining || 0), 0)
      .toFixed(6));
  }

  const result = await query(
    `SELECT COALESCE(SUM(remaining), 0) AS balance
     FROM temporary_credits
     WHERE customer_id = $1
       AND remaining > 0
       AND expires_at > NOW()`,
    [customerId]
  );
  return Number(result.rows[0]?.balance || 0);
}

async function grantTemporaryCredit(customerId, { amount, reason, detail }) {
  const value = Number(amount || 0);
  if (!customerId || value <= 0) return { granted: false, balance: await getTemporaryCreditBalance(customerId) };

  const grantDay = getChinaDayKey();
  const expiresAt = getChinaDayExpiry(grantDay);

  if (!hasDatabase()) {
    const exists = store.temporaryCredits.some((credit) =>
      credit.customerId === customerId && credit.reason === reason && credit.grantDay === grantDay
    );
    if (exists) return { granted: false, balance: await getTemporaryCreditBalance(customerId) };
    const credit = {
      id: makeId("tmp_credit"),
      customerId,
      reason,
      grantDay,
      amount: value,
      remaining: value,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    };
    store.temporaryCredits.push(credit);
    const customer = store.customers.find((item) => item.id === customerId);
    await logActivity({
      customerId,
      email: customer?.email || "",
      action: "temporary_credit_granted",
      category: "billing",
      detail: `${detail || reason}，有效期至今日 24:00，优先抵扣 API 调用`,
      amount: value,
    });
    return { granted: true, balance: await getTemporaryCreditBalance(customerId) };
  }

  const inserted = await query(
    `INSERT INTO temporary_credits (id, customer_id, reason, grant_day, amount, remaining, expires_at)
     VALUES ($1, $2, $3, $4, $5, $5, $6)
     ON CONFLICT (customer_id, reason, grant_day) DO NOTHING
     RETURNING *`,
    [makeId("tmp_credit"), customerId, reason, grantDay, value, expiresAt.toISOString()]
  );

  if (inserted.rows[0]) {
    const customerResult = await query("SELECT email FROM customers WHERE id = $1 LIMIT 1", [customerId]);
    await logActivity({
      customerId,
      email: customerResult.rows[0]?.email || "",
      action: "temporary_credit_granted",
      category: "billing",
      detail: `${detail || reason}，有效期至今日 24:00，优先抵扣 API 调用`,
      amount: value,
    });
  }

  return { granted: Boolean(inserted.rows[0]), balance: await getTemporaryCreditBalance(customerId) };
}

export async function grantDailyLoginCredit(customerId) {
  return grantTemporaryCredit(customerId, {
    amount: DAILY_LOGIN_CREDIT,
    reason: "daily_login",
    detail: "每日登录体验金",
  });
}

export async function grantDailyUsageCredit(customerId) {
  return grantTemporaryCredit(customerId, {
    amount: DAILY_USAGE_CREDIT,
    reason: "real_token_usage",
    detail: "真实 Token 调用体验金",
  });
}

async function consumeTemporaryCredits(customerId, amount) {
  const target = Number(amount || 0);
  if (!customerId || target <= 0) return 0;

  if (!hasDatabase()) {
    let remainingToConsume = target;
    let consumed = 0;
    const credits = store.temporaryCredits
      .filter((credit) => credit.customerId === customerId && isTemporaryCreditActive(credit))
      .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
    for (const credit of credits) {
      if (remainingToConsume <= 0) break;
      const take = Math.min(Number(credit.remaining || 0), remainingToConsume);
      credit.remaining = Number((Number(credit.remaining || 0) - take).toFixed(6));
      remainingToConsume = Number((remainingToConsume - take).toFixed(6));
      consumed = Number((consumed + take).toFixed(6));
    }
    return consumed;
  }

  let remainingToConsume = target;
  let consumed = 0;
  const credits = await query(
    `SELECT id, remaining
     FROM temporary_credits
     WHERE customer_id = $1
       AND remaining > 0
       AND expires_at > NOW()
     ORDER BY expires_at ASC, created_at ASC`,
    [customerId]
  );
  for (const credit of credits.rows) {
    if (remainingToConsume <= 0) break;
    const take = Math.min(Number(credit.remaining || 0), remainingToConsume);
    await query(
      "UPDATE temporary_credits SET remaining = GREATEST(0, remaining - $2) WHERE id = $1",
      [credit.id, take]
    );
    remainingToConsume = Number((remainingToConsume - take).toFixed(6));
    consumed = Number((consumed + take).toFixed(6));
  }
  return consumed;
}

async function refundTemporaryCredit(customerId, amount) {
  const value = Number(amount || 0);
  if (!customerId || value <= 0) return 0;
  const grantDay = getChinaDayKey();
  const expiresAt = getChinaDayExpiry(grantDay);

  if (!hasDatabase()) {
    store.temporaryCredits.push({
      id: makeId("tmp_refund"),
      customerId,
      reason: "temporary_credit_refund",
      grantDay,
      amount: value,
      remaining: value,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    });
    return value;
  }

  await query(
    `INSERT INTO temporary_credits (id, customer_id, reason, grant_day, amount, remaining, expires_at)
     VALUES ($1, $2, $3, $4, $5, $5, $6)`,
    [makeId("tmp_refund"), customerId, `temporary_credit_refund_${Date.now()}`, grantDay, value, expiresAt.toISOString()]
  );
  return value;
}

async function publicCustomer(customer) {
  if (!customer) return null;
  let inviteCount = 0;
  const temporaryBalance = await getTemporaryCreditBalance(customer.id);
  const paidBalance = Number(customer.balance || 0);
  const availableBalance = Number((paidBalance + temporaryBalance).toFixed(6));

  if (!hasDatabase()) {
    inviteCount = getInviteCount(customer.id);
    return {
      ...customer,
      passwordHash: undefined,
      paidBalance,
      temporaryBalance,
      availableBalance,
      balance: availableBalance,
      inviteCount,
      apiKeys: store.apiKeys.filter((key) => key.customerId === customer.id && !key.deletedAt),
      calls: store.calls.filter((call) => call.customerId === customer.id),
    };
  }

  const [keysResult, callsResult, inviteResult] = await Promise.all([
    query("SELECT * FROM api_keys WHERE customer_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC", [customer.id]),
    query("SELECT * FROM calls WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 200", [customer.id]),
    query("SELECT COUNT(*) as cnt FROM customers WHERE invited_by = $1 AND email_verified = true", [customer.id]),
  ]);

  return {
    ...customer,
    passwordHash: undefined,
    paidBalance,
    temporaryBalance,
    availableBalance,
    balance: availableBalance,
    inviteCount: parseInt(inviteResult.rows[0]?.cnt || "0", 10),
    apiKeys: keysResult.rows.map(rowToApiKey),
    calls: callsResult.rows.map(rowToCall),
  };
}

async function validateInviteCode(inviteCode = "") {
  const cleanCode = inviteCode.trim().toUpperCase();
  if (!cleanCode) {
    return isInviteCodeRequired() ? { error: "请输入邀请码" } : { inviteCode: "", inviterId: null };
  }

  if (getInviteCodes().includes(cleanCode)) {
    return { inviteCode: cleanCode, inviterId: null };
  }

  if (!hasDatabase()) {
    const inviter = store.customers.find((c) => c.myInviteCode === cleanCode && c.emailVerified);
    return inviter ? { inviteCode: cleanCode, inviterId: inviter.id } : { error: "邀请码无效" };
  }

  const result = await query(
    "SELECT id FROM customers WHERE my_invite_code = $1 AND email_verified = true LIMIT 1",
    [cleanCode]
  );
  const inviter = result.rows[0];
  return inviter ? { inviteCode: cleanCode, inviterId: inviter.id } : { error: "邀请码无效" };
}

export async function createVerificationCode(email, purpose = "register") {
  const cleanEmail = normalizeEmail(email);
  const code = generateCode();

  if (hasDatabase()) {
    await query(
      `UPDATE verification_codes
       SET consumed_at = NOW()
       WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL`,
      [cleanEmail, purpose]
    );
    await query(
      `INSERT INTO verification_codes (id, email, purpose, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
      [makeId("vc"), cleanEmail, purpose, hashVerificationCode(cleanEmail, code, purpose)]
    );
    return code;
  }

  store.verificationCodes = store.verificationCodes.filter(
    (v) => !(v.email === cleanEmail && v.purpose === purpose)
  );
  store.verificationCodes.push({
    email: cleanEmail,
    code,
    purpose,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return code;
}

export async function verifyCode(email, code, purpose = "register") {
  const cleanEmail = normalizeEmail(email);

  if (hasDatabase()) {
    const result = await query(
      `UPDATE verification_codes
       SET consumed_at = NOW()
       WHERE id = (
         SELECT id
         FROM verification_codes
         WHERE email = $1
           AND purpose = $2
           AND code_hash = $3
           AND consumed_at IS NULL
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1
       )
       RETURNING id`,
      [cleanEmail, purpose, hashVerificationCode(cleanEmail, code, purpose)]
    );
    return Boolean(result.rows[0]);
  }

  const found = store.verificationCodes.find(
    (v) => v.email === cleanEmail && v.code === code && v.purpose === purpose
  );
  if (!found) return false;
  if (Date.now() > found.expiresAt) {
    store.verificationCodes = store.verificationCodes.filter((v) => v !== found);
    return false;
  }
  store.verificationCodes = store.verificationCodes.filter((v) => v !== found);
  return true;
}

export function createVerifyToken(email, purpose = "register") {
  return signToken({ email: normalizeEmail(email), purpose, exp: Date.now() + 10 * 60 * 1000 });
}

export function checkVerifyToken(token, email, purpose = "register") {
  const payload = unsignToken(token);
  if (!payload) return false;
  if (payload.email !== normalizeEmail(email)) return false;
  if (payload.purpose !== purpose) return false;
  if (Date.now() > payload.exp) return false;
  return true;
}

export async function registerCustomer({ email, password, inviteCode = "" }) {
  const cleanEmail = normalizeEmail(email);
  const passwordHash = password ? await hashPassword(password) : "";
  const inviteResult = await validateInviteCode(inviteCode);
  if (inviteResult.error) return { error: inviteResult.error };

  if (!hasDatabase()) {
    const existing = store.customers.find((item) => item.email === cleanEmail && item.emailVerified);
    if (existing) return { error: "该邮箱已注册" };

    let customer = store.customers.find((item) => item.email === cleanEmail && !item.emailVerified);
    if (customer) {
      if (passwordHash) customer.passwordHash = passwordHash;
      customer.usedInviteCode = inviteResult.inviteCode || customer.usedInviteCode || "";
      if (inviteResult.inviterId) customer.invitedBy = inviteResult.inviterId;
    } else {
      customer = {
        id: makeId("cus"),
        name: cleanEmail.split("@")[0],
        phone: "",
        company: cleanEmail.split("@")[0],
        email: cleanEmail,
        passwordHash,
        usedInviteCode: inviteResult.inviteCode,
        invitedBy: inviteResult.inviterId || null,
        myInviteCode: "",
        balance: 0,
        totalSpend: 0,
        emailVerified: false,
        createdAt: new Date().toISOString(),
      };
      store.customers.push(customer);
    }
    return { customer: await publicCustomer(customer), inviterId: inviteResult.inviterId };
  }

  const existing = await query("SELECT * FROM customers WHERE email = $1 AND email_verified = true LIMIT 1", [cleanEmail]);
  if (existing.rows[0]) return { error: "该邮箱已注册" };

  const pending = await query("SELECT * FROM customers WHERE email = $1 AND email_verified = false LIMIT 1", [cleanEmail]);
  let customer = rowToCustomer(pending.rows[0]);

  if (customer) {
    await query(
      "UPDATE customers SET password_hash = COALESCE($2, password_hash), used_invite_code = $3, invited_by = $4 WHERE id = $1",
      [customer.id, passwordHash || null, inviteResult.inviteCode || "", inviteResult.inviterId || null]
    );
    customer = {
      ...customer,
      passwordHash: passwordHash || customer.passwordHash,
      usedInviteCode: inviteResult.inviteCode || "",
      invitedBy: inviteResult.inviterId || null,
    };
  } else {
    const id = makeId("cus");
    const inserted = await query(
      `INSERT INTO customers
        (id, name, phone, company, email, password_hash, used_invite_code, invited_by, my_invite_code, balance, total_spend, email_verified)
       VALUES ($1, $2, '', $2, $3, $4, $5, $6, NULL, 0, 0, false)
       RETURNING *`,
      [id, cleanEmail.split("@")[0], cleanEmail, passwordHash, inviteResult.inviteCode || "", inviteResult.inviterId || null]
    );
    customer = rowToCustomer(inserted.rows[0]);
  }

  return { customer: await publicCustomer(customer), inviterId: inviteResult.inviterId };
}

export async function loginCustomer({ email, password }) {
  const cleanEmail = normalizeEmail(email);

  if (!hasDatabase()) {
    const customer = store.customers.find((item) => item.email === cleanEmail);
    if (!customer) return null;
    const verification = await verifyPassword(password, customer.passwordHash);
    if (!verification.ok) return null;
    if (verification.needsRehash) customer.passwordHash = await hashPassword(password);
    if (!customer.emailVerified) return { needsVerification: true };
    await grantDailyLoginCredit(customer.id);
    return publicCustomer(customer);
  }

  const result = await query("SELECT * FROM customers WHERE email = $1 LIMIT 1", [cleanEmail]);
  const customer = rowToCustomer(result.rows[0]);
  if (!customer) return null;
  const verification = await verifyPassword(password, customer.passwordHash);
  if (!verification.ok) return null;
  if (verification.needsRehash) {
    const upgradedHash = await hashPassword(password);
    await query("UPDATE customers SET password_hash = $2 WHERE id = $1", [customer.id, upgradedHash]);
    customer.passwordHash = upgradedHash;
  }
  if (!customer.emailVerified) return { needsVerification: true };
  await grantDailyLoginCredit(customer.id);
  return publicCustomer(customer);
}

export async function verifyCustomerEmail(email) {
  const cleanEmail = normalizeEmail(email);

  if (!hasDatabase()) {
    const customer = store.customers.find((item) => item.email === cleanEmail);
    if (!customer) return false;
    const wasUnverified = !customer.emailVerified;
    customer.emailVerified = true;
    if (wasUnverified) {
      if (!customer.myInviteCode) customer.myInviteCode = generateInviteCode();
      customer.balance = Number((customer.balance + FREE_TRIAL_CREDIT).toFixed(4));
      if (customer.invitedBy) {
        const inviter = store.customers.find((c) => c.id === customer.invitedBy);
        if (inviter && inviter.emailVerified && INVITER_BONUS_CREDIT > 0) {
          inviter.balance = Number((inviter.balance + INVITER_BONUS_CREDIT).toFixed(4));
          customer.balance = Number((customer.balance + INVITEE_BONUS_CREDIT).toFixed(4));
        }
      }
    }
    return publicCustomer(customer);
  }

  const currentResult = await query("SELECT * FROM customers WHERE email = $1 LIMIT 1", [cleanEmail]);
  const customer = rowToCustomer(currentResult.rows[0]);
  if (!customer) return false;
  const wasUnverified = !customer.emailVerified;

  if (wasUnverified) {
    const inviteCode = customer.myInviteCode || generateInviteCode();
    const bonus = FREE_TRIAL_CREDIT + (customer.invitedBy ? INVITEE_BONUS_CREDIT : 0);
    const updated = await query(
      `UPDATE customers
       SET email_verified = true,
           my_invite_code = $2,
           balance = balance + $3
       WHERE id = $1
       RETURNING *`,
      [customer.id, inviteCode, bonus]
    );

    if (customer.invitedBy && INVITER_BONUS_CREDIT > 0) {
      await query("UPDATE customers SET balance = balance + $2 WHERE id = $1 AND email_verified = true", [customer.invitedBy, INVITER_BONUS_CREDIT]);
    }

    return publicCustomer(rowToCustomer(updated.rows[0]));
  }

  return publicCustomer(customer);
}

export async function completeEmailRegistration({ email, password, inviteCode = "" }) {
  const cleanEmail = normalizeEmail(email);

  if (!hasDatabase()) {
    let customer = store.customers.find((item) => item.email === cleanEmail);
    if (!customer) {
      if (!password) return { error: "注册会话已过期 请重新填写邮箱和密码" };
      const regResult = await registerCustomer({ email: cleanEmail, password, inviteCode });
      if (regResult.error) return regResult;
      customer = store.customers.find((item) => item.email === cleanEmail);
    } else if (!customer.emailVerified && password) {
      const regResult = await registerCustomer({ email: cleanEmail, password, inviteCode });
      if (regResult.error) return regResult;
    }
    const verifiedCustomer = await verifyCustomerEmail(cleanEmail);
    return verifiedCustomer ? { customer: verifiedCustomer } : { error: "账号不存在 请重新注册" };
  }

  const existing = await query("SELECT * FROM customers WHERE email = $1 LIMIT 1", [cleanEmail]);
  if (!existing.rows[0]) {
    if (!password) return { error: "注册会话已过期 请重新填写邮箱和密码" };
    const regResult = await registerCustomer({ email: cleanEmail, password, inviteCode });
    if (regResult.error) return regResult;
  } else if (!existing.rows[0].email_verified && password) {
    const regResult = await registerCustomer({ email: cleanEmail, password, inviteCode });
    if (regResult.error) return regResult;
  }

  const verifiedCustomer = await verifyCustomerEmail(cleanEmail);
  return verifiedCustomer ? { customer: verifiedCustomer } : { error: "账号不存在 请重新注册" };
}

export async function resetPassword({ email, code, newPassword, verifyToken }) {
  const cleanEmail = normalizeEmail(email);
  const passwordHash = await hashPassword(newPassword);
  if (verifyToken) {
    if (!checkVerifyToken(verifyToken, cleanEmail, "reset")) return { error: "验证码无效或已过期" };
    if (!(await verifyCode(cleanEmail, code, "reset"))) return { error: "验证码无效或已过期" };
  } else if (!(await verifyCode(cleanEmail, code, "reset"))) {
    return { error: "验证码无效或已过期" };
  }

  if (!hasDatabase()) {
    const customer = store.customers.find((item) => item.email === cleanEmail && item.emailVerified);
    if (!customer) return { error: "账号不存在" };
    customer.passwordHash = passwordHash;
    return { success: true };
  }

  const result = await query(
    "UPDATE customers SET password_hash = $2 WHERE email = $1 AND email_verified = true RETURNING id",
    [cleanEmail, passwordHash]
  );
  if (!result.rows[0]) return { error: "账号不存在" };
  return { success: true };
}

export async function getCustomer(customerId = "cus_demo") {
  if (!hasDatabase()) {
    const customer = store.customers.find((item) => item.id === customerId);
    if (!customer && customerId !== "cus_demo") return null;
    if (customer) await grantDailyLoginCredit(customer.id);
    return publicCustomer(customer || store.customers[0]);
  }

  const result = await query("SELECT * FROM customers WHERE id = $1 LIMIT 1", [customerId]);
  const customer = rowToCustomer(result.rows[0]);
  if (!customer && customerId !== "cus_demo") return null;
  if (!customer) return null;
  await grantDailyLoginCredit(customer.id);
  return publicCustomer(customer);
}

export async function regenerateInviteCode(customerId) {
  if (!hasDatabase()) {
    const customer = store.customers.find((item) => item.id === customerId);
    if (!customer) return null;
    customer.myInviteCode = generateInviteCode();
    return publicCustomer(customer);
  }

  let newCode;
  let existing;
  do {
    newCode = randomInviteCode();
    const check = await query("SELECT id FROM customers WHERE my_invite_code = $1 LIMIT 1", [newCode]);
    existing = check.rows;
  } while (existing.length > 0);
  const result = await query(
    "UPDATE customers SET my_invite_code = $2 WHERE id = $1 RETURNING *",
    [customerId, newCode]
  );
  return publicCustomer(rowToCustomer(result.rows[0]));
}

export async function updateProfile(customerId, { name, company }) {
  if (!hasDatabase()) {
    const customer = store.customers.find((item) => item.id === customerId);
    if (!customer) return null;
    if (name !== undefined) customer.name = name;
    if (company !== undefined) customer.company = company;
    return publicCustomer(customer);
  }

  const result = await query(
    "UPDATE customers SET name = COALESCE($2, name), company = COALESCE($3, company) WHERE id = $1 RETURNING *",
    [customerId, name ?? null, company ?? null]
  );
  return publicCustomer(rowToCustomer(result.rows[0]));
}

export async function createApiKey(customerId, label = "API 密匙", expiresAt = null, modelProductInput = null) {
  const modelProduct = typeof modelProductInput === "string"
    ? getModelProduct(modelProductInput)
    : modelProductInput;

  if (!modelProduct) {
    const error = new Error("请先选择要使用的模型，再创建 API 密钥。");
    error.type = "model_required";
    throw error;
  }

  if (!modelProduct.isAvailable) {
    const error = new Error("该模型暂未开放，请选择其他模型或联系客服。");
    error.type = "model_coming_soon";
    throw error;
  }

  const publicModelId = modelProduct.publicModelId;
  const actualModelId = modelProduct.actualModelId || publicModelId;
  const allowedModels = modelProduct.allowedModels?.length ? modelProduct.allowedModels : [actualModelId];
  const modelLabel = modelProduct.displayName || publicModelId;
  let newApiToken;
  try {
    newApiToken = await createNewApiToken({
      name: `${label || "API 密匙"} · ${modelLabel}`.slice(0, 50),
      group: process.env.NEW_API_EXECUTION_GROUP || process.env.NEW_API_DEFAULT_GROUP || "default",
      models: allowedModels,
    });
  } catch (error) {
    const message = error?.message || "New API API Key 创建失败";
    throw new Error(`API 密钥创建失败，请稍后重试或联系管理员。${message ? `（${message}）` : ""}`);
  }

  // New API returns keys without sk- prefix; wrap them uniformly
  const newApiRawKey = String(newApiToken?.key || "").trim();
  const userToken = newApiRawKey.startsWith("sk-") ? newApiRawKey : `sk-${newApiRawKey}`;

  const key = {
    id: makeId("key"),
    customerId,
    token: userToken,
    label,
    newApiId: newApiToken.id,
    newApiSyncStatus: "synced",
    newApiSyncedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    expiresAt: expiresAt || null,
    disabledAt: null,
    modelProductId: modelProduct.id,
    publicModelId,
    actualModelId,
    modelDisplayName: modelLabel,
    modelGroup: modelProduct.group || "",
    allowedModels,
    priceMultiplier: Number(modelProduct.priceMultiplier || 1),
  };

  if (!hasDatabase()) {
    store.apiKeys.push(key);
    logActivity({ customerId, action: "create_key", category: "api_key", detail: `创建 API 密匙: ${label}` });
    return key;
  }

  const result = await query(
    `INSERT INTO api_keys
      (id, customer_id, token, new_api_token_id, new_api_sync_status, new_api_synced_at, label, expires_at,
       model_product_id, public_model_id, actual_model_id, model_display_name, model_group, allowed_models, price_multiplier)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      key.id,
      customerId,
      key.token,
      key.newApiId,
      key.newApiSyncStatus,
      label,
      key.expiresAt,
      key.modelProductId,
      key.publicModelId,
      key.actualModelId,
      key.modelDisplayName,
      key.modelGroup,
      key.allowedModels.join(","),
      key.priceMultiplier,
    ]
  );
  logActivity({ customerId, action: "create_key", category: "api_key", detail: `创建 ${modelLabel} API 密匙: ${label}` });
  return rowToApiKey(result.rows[0]);
}

export async function updateApiKey(customerId, keyId, updates = {}) {
  if (!customerId || !keyId) return null;

  if (!hasDatabase()) {
    const key = store.apiKeys.find((item) => item.id === keyId && item.customerId === customerId);
    if (!key) return null;
    if (updates.label !== undefined) key.label = String(updates.label || "API 密匙").slice(0, 80);
    if (updates.expiresAt !== undefined) key.expiresAt = updates.expiresAt || null;
    if (updates.disabled !== undefined) key.disabledAt = updates.disabled ? new Date().toISOString() : null;
    if (key.newApiId && updates.disabled !== undefined) {
      if (updates.disabled) await disableNewApiToken(key.newApiId).catch(() => null);
      else await enableNewApiToken(key.newApiId).catch(() => null);
    }
    return publicCustomer(store.customers.find((item) => item.id === customerId));
  }

  const result = await query(
    `UPDATE api_keys
     SET label = COALESCE($3, label),
         expires_at = CASE WHEN $6::boolean THEN $4 ELSE expires_at END,
         disabled_at = CASE
           WHEN $5::boolean IS NULL THEN disabled_at
           WHEN $5::boolean = true THEN COALESCE(disabled_at, NOW())
           ELSE NULL
         END
     WHERE id = $1 AND customer_id = $2
     RETURNING *`,
    [
      keyId,
      customerId,
      updates.label === undefined ? null : String(updates.label || "API 密匙").slice(0, 80),
      updates.expiresAt === undefined ? null : updates.expiresAt || null,
      updates.disabled === undefined ? null : Boolean(updates.disabled),
      updates.expiresAt !== undefined,
    ]
  );
  if (!result.rows[0]) return null;
  const updatedKey = rowToApiKey(result.rows[0]);
  if (updatedKey?.newApiId && updates.disabled !== undefined) {
    if (updates.disabled) await disableNewApiToken(updatedKey.newApiId).catch(() => null);
    else await enableNewApiToken(updatedKey.newApiId).catch(() => null);
  }
  return getCustomer(customerId);
}

export async function deleteApiKey(customerId, keyId) {
  if (!customerId || !keyId) return null;

  if (!hasDatabase()) {
    const key = store.apiKeys.find((item) => item.id === keyId && item.customerId === customerId && !item.deletedAt);
    if (!key) return null;
    key.deletedAt = new Date().toISOString();
    key.disabledAt = key.disabledAt || key.deletedAt;
    if (key.newApiId) await disableNewApiToken(key.newApiId).catch(() => null);
    return publicCustomer(store.customers.find((item) => item.id === customerId));
  }

  const result = await query(
    `UPDATE api_keys
     SET deleted_at = NOW(), disabled_at = COALESCE(disabled_at, NOW())
     WHERE id = $1 AND customer_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [keyId, customerId]
  );
  if (!result.rows[0]) return null;
  const deletedKey = rowToApiKey(result.rows[0]);
  if (deletedKey?.newApiId) await disableNewApiToken(deletedKey.newApiId).catch(() => null);
  return getCustomer(customerId);
}

export async function findCustomerByToken(token) {
  if (!hasDatabase()) {
    const apiKey = store.apiKeys.find((key) => key.token === token);
    if (!apiKey) return null;
    if (apiKey.deletedAt) return null;
    if (apiKey.disabledAt) return null;
    // check expiry
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) return null;
    const customer = store.customers.find((item) => item.id === apiKey.customerId);
    return customer ? { apiKey, customer } : null;
  }

  const result = await query(
    `SELECT
       k.id AS key_id, k.customer_id, k.token, k.label, k.created_at AS key_created_at, k.last_used_at,
       k.expires_at, k.disabled_at, k.deleted_at, k.new_api_token_id, k.new_api_sync_status, k.new_api_synced_at,
       c.*
     FROM api_keys k
     JOIN customers c ON c.id = k.customer_id
     WHERE k.token = $1
       AND k.disabled_at IS NULL
       AND k.deleted_at IS NULL
       AND (k.expires_at IS NULL OR k.expires_at > NOW())
     LIMIT 1`,
    [token]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    apiKey: {
      id: row.key_id,
      customerId: row.customer_id,
      token: row.token,
      label: row.label,
      newApiId: row.new_api_token_id || "",
      newApiSyncStatus: row.new_api_sync_status || "",
      newApiSyncedAt: row.new_api_synced_at ? new Date(row.new_api_synced_at).toISOString() : null,
      createdAt: row.key_created_at ? new Date(row.key_created_at).toISOString() : new Date().toISOString(),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      disabledAt: row.disabled_at ? new Date(row.disabled_at).toISOString() : null,
    },
    customer: rowToCustomer(row),
  };
}

export async function rechargeCustomer(customerId, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return getCustomer(customerId);
  }

  if (!hasDatabase()) {
    const customer = store.customers.find((item) => item.id === customerId);
    if (!customer) return null;
    customer.balance = Number((customer.balance + value).toFixed(4));
    return publicCustomer(customer);
  }

  const result = await query(
    "UPDATE customers SET balance = balance + $2 WHERE id = $1 RETURNING *",
    [customerId, value]
  );
  return publicCustomer(rowToCustomer(result.rows[0]));
}

export async function createRechargeOrder({ customerId, amount, paymentMethod = "wechat", paymentRef = "" }) {
  const value = Number(amount);
  if (!customerId || !Number.isFinite(value) || value <= 0) {
    return { error: "充值金额无效" };
  }

  const id = makeId("rch");
  const outTradeNo = `flow_${id}`;

  if (!hasDatabase()) {
    if (!store.rechargeOrders) store.rechargeOrders = [];
    const order = {
      id,
      customerId,
      outTradeNo,
      amount: Number(value.toFixed(2)),
      currency: "CNY",
      paymentMethod,
      paymentRef,
      providerTradeNo: "",
      gatewayPayload: "",
      status: "pending",
      createdAt: new Date().toISOString(),
      paidAt: null,
      approvedAt: null,
      approvedBy: "",
    };
    store.rechargeOrders.unshift(order);
    return { order };
  }

  const result = await query(
    `INSERT INTO recharge_orders (id, customer_id, out_trade_no, amount, currency, payment_method, payment_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, customerId, outTradeNo, Number(value.toFixed(2)), "CNY", paymentMethod, String(paymentRef || "").slice(0, 800)]
  );

  return { order: rowToRechargeOrder(result.rows[0]) };
}

export async function getRechargeOrderById(orderId) {
  if (!orderId) return null;

  if (!hasDatabase()) {
    return rowToRechargeOrder((store.rechargeOrders || []).find((order) => order.id === orderId));
  }

  const result = await query(
    `SELECT r.*, c.email, c.name
     FROM recharge_orders r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.id = $1
     LIMIT 1`,
    [orderId]
  );
  return rowToRechargeOrder(result.rows[0]);
}

export async function getRechargeOrderByOutTradeNo(outTradeNo) {
  if (!outTradeNo) return null;

  if (!hasDatabase()) {
    return rowToRechargeOrder((store.rechargeOrders || []).find((order) => order.outTradeNo === outTradeNo));
  }

  const result = await query(
    `SELECT r.*, c.email, c.name
     FROM recharge_orders r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.out_trade_no = $1
     LIMIT 1`,
    [outTradeNo]
  );
  return rowToRechargeOrder(result.rows[0]);
}

export async function listRechargeOrders({ customerId, status = "", limit = 80 } = {}) {
  if (!hasDatabase()) {
    const orders = (store.rechargeOrders || [])
      .filter((order) => !customerId || order.customerId === customerId)
      .filter((order) => !status || order.status === status)
      .slice(0, limit);
    return orders;
  }

  const conditions = [];
  const params = [];

  if (customerId) {
    params.push(customerId);
    conditions.push(`r.customer_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }

  params.push(Number(limit) || 80);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT r.*, c.email, c.name
     FROM recharge_orders r
     JOIN customers c ON c.id = r.customer_id
     ${where}
     ORDER BY r.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows.map(rowToRechargeOrder);
}

export async function approveRechargeOrder({ orderId, approvedBy = "admin" }) {
  if (!orderId) return { error: "缺少订单号" };

  if (!hasDatabase()) {
    const order = (store.rechargeOrders || []).find((item) => item.id === orderId);
    if (!order) return { error: "订单不存在" };
    if (order.status !== "pending") return { error: "订单已处理" };
    const customer = store.customers.find((item) => item.id === order.customerId);
    if (!customer) return { error: "用户不存在" };
    customer.balance = Number((customer.balance + Number(order.amount)).toFixed(4));
    order.status = "approved";
    order.approvedAt = new Date().toISOString();
    order.approvedBy = approvedBy;
    logActivity({
      customerId: order.customerId,
      action: "recharge_approved",
      category: "payment",
      detail: `充值到账: ${order.paymentMethod} ¥${Number(order.amount).toFixed(2)}`,
      amount: order.amount,
    });
    return { order, customer: await publicCustomer(customer) };
  }

  const result = await query(
    `WITH changed_order AS (
       UPDATE recharge_orders
       SET status = 'approved', approved_at = NOW(), approved_by = $2
       WHERE id = $1 AND status = 'pending'
       RETURNING *
     ),
     updated_customer AS (
       UPDATE customers c
       SET balance = c.balance + changed_order.amount
       FROM changed_order
       WHERE c.id = changed_order.customer_id
       RETURNING c.*
     )
     SELECT row_to_json(changed_order) AS order, row_to_json(updated_customer) AS customer
     FROM changed_order, updated_customer`,
    [orderId, approvedBy]
  );
  if (!result.rows[0]) return { error: "订单不存在或已处理" };

  const approvedOrder = rowToRechargeOrder(result.rows[0].order);
  logActivity({
    customerId: approvedOrder.customerId,
    action: "recharge_approved",
    category: "payment",
    detail: `充值到账: ${approvedOrder.paymentMethod} ¥${Number(approvedOrder.amount).toFixed(2)}`,
    amount: approvedOrder.amount,
  });

  return {
    order: approvedOrder,
    customer: await publicCustomer(rowToCustomer(result.rows[0].customer)),
  };
}

function generateActivationCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
    if (i % 4 === 3 && i < 11) code += "-";
  }
  return `FLOW-${code}`;
}

export async function createActivationCode({ amount, createdBy = "admin", note = "", count = 1 }) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return { error: "金额无效" };
  const num = Math.min(Number(count) || 1, 100);

  if (!hasDatabase()) {
    if (!store.activationCodes) store.activationCodes = [];
    const codes = [];
    for (let i = 0; i < num; i++) {
      let code;
      do {
        code = generateActivationCode();
      } while (store.activationCodes.some((c) => c.code === code));
      const entry = {
        id: makeId("act"),
        code,
        amount: Number(value.toFixed(2)),
        status: "active",
        note,
        createdBy,
        redeemedBy: null,
        redeemedAt: null,
        createdAt: new Date().toISOString(),
      };
      store.activationCodes.push(entry);
      codes.push(entry);
    }
    return { codes };
  }

  const codes = [];
  for (let i = 0; i < num; i++) {
    let code;
    let existing;
    do {
      code = generateActivationCode();
      const check = await query("SELECT id FROM activation_codes WHERE code = $1 LIMIT 1", [code]);
      existing = check.rows;
    } while (existing.length > 0);
    const result = await query(
      `INSERT INTO activation_codes (id, code, amount, status, note, created_by)
       VALUES ($1, $2, $3, 'active', $4, $5)
       RETURNING *`,
      [makeId("act"), code, Number(value.toFixed(2)), note, createdBy]
    );
    codes.push(rowToActivationCode(result.rows[0]));
  }
  return { codes };
}

export async function redeemActivationCode(code, customerId) {
  if (!code || !customerId) return { error: "缺少参数" };
  const cleanCode = String(code).trim().toUpperCase();

  if (!hasDatabase()) {
    if (!store.activationCodes) store.activationCodes = [];
    const entry = store.activationCodes.find((c) => c.code === cleanCode);
    if (!entry) return { error: "激活码无效" };
    if (entry.status !== "active") return { error: "激活码已被使用" };
    const customer = store.customers.find((c) => c.id === customerId);
    if (!customer) return { error: "用户不存在" };
    customer.balance = Number((customer.balance + entry.amount).toFixed(4));
    entry.status = "redeemed";
    entry.redeemedBy = customerId;
    entry.redeemedAt = new Date().toISOString();
    return {
      success: true,
      amount: entry.amount,
      customer: await publicCustomer(customer),
    };
  }

  const result = await query(
    `WITH target AS (
       SELECT * FROM activation_codes WHERE code = $1 AND status = 'active' LIMIT 1
     ),
     redeemed AS (
       UPDATE activation_codes
       SET status = 'redeemed', redeemed_by = $2, redeemed_at = NOW()
       FROM target
       WHERE activation_codes.id = target.id
       RETURNING activation_codes.*
     ),
     updated AS (
       UPDATE customers
       SET balance = balance + (SELECT amount FROM redeemed)
       WHERE id = $2
       RETURNING *
     )
     SELECT row_to_json(redeemed) AS code, row_to_json(updated) AS customer
     FROM redeemed, updated`,
    [cleanCode, customerId]
  );
  if (!result.rows[0]) return { error: "激活码无效或已被使用" };
  return {
    success: true,
    amount: result.rows[0].code.amount,
    customer: await publicCustomer(rowToCustomer(result.rows[0].customer)),
  };
}

export async function listActivationCodes({ status = "", limit = 200 } = {}) {
  if (!hasDatabase()) {
    return (store.activationCodes || [])
      .filter((c) => !status || c.status === status)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  const params = [];
  const where = status ? `WHERE status = $1` : "";
  if (status) params.push(status);
  params.push(Number(limit) || 200);
  const result = await query(
    `SELECT * FROM activation_codes ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return result.rows.map(rowToActivationCode);
}

function rowToActivationCode(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    amount: Number(row.amount || 0),
    status: row.status || "active",
    note: row.note || "",
    createdBy: row.created_by || "",
    redeemedBy: row.redeemed_by || null,
    redeemedAt: row.redeemed_at ? new Date(row.redeemed_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

export async function markRechargeOrderPaid({
  outTradeNo,
  providerTradeNo = "",
  amount,
  rawPayload = "",
  approvedBy = "gateway",
  paidAt = new Date().toISOString(),
}) {
  if (!outTradeNo) return { error: "缺少商户订单号" };

  const paidAmount = Number(amount);
  if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
    return { error: "支付金额无效" };
  }

  if (!hasDatabase()) {
    const order = (store.rechargeOrders || []).find((item) => item.outTradeNo === outTradeNo);
    if (!order) return { error: "订单不存在" };
    if (order.status === "approved") {
      return { order: rowToRechargeOrder(order), customer: await getCustomer(order.customerId) };
    }
    if (Number(order.amount).toFixed(2) !== paidAmount.toFixed(2)) {
      return { error: "回调金额与订单金额不一致" };
    }
    order.providerTradeNo = providerTradeNo;
    order.gatewayPayload = rawPayload;
    order.paidAt = paidAt;
    return approveRechargeOrder({ orderId: order.id, approvedBy });
  }

  const result = await query(
    `WITH target_order AS (
       SELECT * FROM recharge_orders WHERE out_trade_no = $1 LIMIT 1
     ),
     changed_order AS (
       UPDATE recharge_orders r
       SET provider_trade_no = COALESCE(NULLIF($2, ''), r.provider_trade_no),
           gateway_payload = COALESCE(NULLIF($3, ''), r.gateway_payload),
           paid_at = COALESCE($4::timestamptz, NOW()),
           status = CASE WHEN r.status = 'pending' THEN 'approved' ELSE r.status END,
           approved_at = CASE WHEN r.status = 'pending' THEN COALESCE($4::timestamptz, NOW()) ELSE r.approved_at END,
           approved_by = CASE WHEN r.status = 'pending' THEN $5 ELSE r.approved_by END
       FROM target_order t
       WHERE r.id = t.id
         AND t.amount = $6::numeric(14, 2)
       RETURNING r.*, (SELECT t.status FROM target_order t) AS previous_status
     ),
     updated_customer AS (
       UPDATE customers c
       SET balance = c.balance + CASE WHEN changed_order.previous_status = 'pending' THEN changed_order.amount ELSE 0 END
       FROM changed_order
       WHERE c.id = changed_order.customer_id
       RETURNING c.*
     )
     SELECT row_to_json(changed_order) AS order, row_to_json(updated_customer) AS customer
     FROM changed_order, updated_customer`,
    [outTradeNo, providerTradeNo, rawPayload, paidAt, approvedBy, paidAmount.toFixed(2)]
  );
  if (!result.rows[0]) return { error: "订单不存在、金额不匹配或已失效" };

  return {
    order: rowToRechargeOrder(result.rows[0].order),
    customer: await publicCustomer(rowToCustomer(result.rows[0].customer)),
  };
}

export async function recordCallByToken(token, record) {
  const match = await findCustomerByToken(token);
  if (!match) return null;

  const cost = Number(record.cost || 0);
  const promptTokens = Number(record.promptTokens || 0);
  const completionTokens = Number(record.completionTokens || 0);
  const tokens = Number(record.tokens || promptTokens + completionTokens || 0);

  if (!hasDatabase()) {
    match.apiKey.lastUsedAt = new Date().toISOString();
    match.customer.balance = Math.max(0, Number((match.customer.balance - cost).toFixed(6)));
    match.customer.totalSpend = Number((match.customer.totalSpend + cost).toFixed(6));
    store.calls.unshift({
      id: makeId("call"),
      customerId: match.customer.id,
      apiKeyId: match.apiKey.id,
      customer: match.customer.company,
      createdAt: new Date().toISOString(),
      ...record,
      tokens,
    });
    store.calls = store.calls.slice(0, 200);
    logActivity({
      customerId: match.customer.id,
      email: match.customer.email,
      action: "api_call",
      category: "api",
      detail: `${record.requestedModel || "unknown"} → ${record.routedModel || "unknown"} | ${tokens} tokens`,
      amount: cost,
    });
    return publicCustomer(match.customer);
  }

  await query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", [match.apiKey.id]);
  const updatedCustomer = await query(
    "UPDATE customers SET balance = GREATEST(0, balance - $2), total_spend = total_spend + $2 WHERE id = $1 RETURNING *",
    [match.customer.id, cost]
  );
  await query(
    `INSERT INTO calls
      (id, customer_id, api_key_id, customer, endpoint, requested_model, routed_model, provider, status, prompt_tokens, completion_tokens, tokens, cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      makeId("call"),
      match.customer.id,
      match.apiKey.id,
      match.customer.company || match.customer.email,
      record.endpoint || "",
      record.requestedModel || "",
      record.routedModel || "",
      record.provider || "",
      Number(record.status || 0),
      promptTokens,
      completionTokens,
      tokens,
      cost,
    ]
  );

  logActivity({
    customerId: match.customer.id,
    email: match.customer.email,
    action: "api_call",
    category: "api",
    detail: `${record.requestedModel || "unknown"} → ${record.routedModel || "unknown"} | ${tokens} tokens`,
    amount: cost,
  });

  return publicCustomer(rowToCustomer(updatedCustomer.rows[0]));
}

export async function reserveBalanceByToken(token, reserveCost) {
  const match = await findCustomerByToken(token);
  if (!match) return { error: "API 密匙无效" };

  const cost = Math.max(0, Number(reserveCost || 0));
  if (cost <= 0) return { ...match, reservedCost: 0 };
  const temporaryBalance = await getTemporaryCreditBalance(match.customer.id);
  const availableBalance = Number((Number(match.customer.balance || 0) + temporaryBalance).toFixed(6));
  if (availableBalance < cost) return { error: "人民币余额不足，请先充值" };
  const temporaryUsed = await consumeTemporaryCredits(match.customer.id, cost);
  const paidCost = Number((cost - temporaryUsed).toFixed(6));

  if (!hasDatabase()) {
    match.customer.balance = Number((match.customer.balance - paidCost).toFixed(6));
    match.customer.totalSpend = Number((match.customer.totalSpend + cost).toFixed(6));
    match.apiKey.lastUsedAt = new Date().toISOString();
    return { ...match, reservedCost: cost, reservedTemporaryCost: temporaryUsed, reservedPaidCost: paidCost };
  }

  await query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", [match.apiKey.id]);
  const result = await query(
    `UPDATE customers
     SET balance = balance - $2,
         total_spend = total_spend + $3
     WHERE id = $1 AND balance >= $2
     RETURNING *`,
    [match.customer.id, paidCost, cost]
  );

  if (!result.rows[0]) return { error: "人民币余额不足，请先充值" };
  return { apiKey: match.apiKey, customer: rowToCustomer(result.rows[0]), reservedCost: cost, reservedTemporaryCost: temporaryUsed, reservedPaidCost: paidCost };
}

export async function finalizeReservedCallByToken(token, record, reservation = 0) {
  const match = await findCustomerByToken(token);
  if (!match) return null;

  const actualCost = Math.max(0, Number(record.cost || 0));
  const reserved = Math.max(0, Number(typeof reservation === "object" ? reservation.reservedCost : reservation || 0));
  const reservedTemporaryCost = Math.max(0, Number(typeof reservation === "object" ? reservation.reservedTemporaryCost : 0));
  const delta = Number((actualCost - reserved).toFixed(6));
  const promptTokens = Number(record.promptTokens || 0);
  const completionTokens = Number(record.completionTokens || 0);
  const tokens = Number(record.tokens || promptTokens + completionTokens || 0);
  const shouldGrantUsageCredit = Number(record.status || 0) >= 200
    && Number(record.status || 0) < 300
    && (completionTokens > 0 || record.grantUsageCredit === true);

  if (!hasDatabase()) {
    if (delta < 0) {
      const refund = Math.abs(delta);
      const temporaryRefund = Math.min(refund, reservedTemporaryCost);
      if (temporaryRefund > 0) await refundTemporaryCredit(match.customer.id, temporaryRefund);
      const paidRefund = Number((refund - temporaryRefund).toFixed(6));
      if (paidRefund > 0) match.customer.balance = Number((match.customer.balance + paidRefund).toFixed(6));
      match.customer.totalSpend = Math.max(0, Number((match.customer.totalSpend - refund).toFixed(6)));
    } else if (delta > 0) {
      const extraTemporaryUsed = await consumeTemporaryCredits(match.customer.id, delta);
      const paidDelta = Number((delta - extraTemporaryUsed).toFixed(6));
      match.customer.balance = Math.max(0, Number((match.customer.balance - paidDelta).toFixed(6)));
      match.customer.totalSpend = Number((match.customer.totalSpend + delta).toFixed(6));
    }
    store.calls.unshift({
      id: makeId("call"),
      customerId: match.customer.id,
      apiKeyId: match.apiKey.id,
      customer: match.customer.company,
      createdAt: new Date().toISOString(),
      ...record,
      cost: actualCost,
      tokens,
    });
    store.calls = store.calls.slice(0, 200);
    if (shouldGrantUsageCredit) await grantDailyUsageCredit(match.customer.id);
    return publicCustomer(match.customer);
  }

  let updatedCustomer;
  if (delta < 0) {
    const refund = Math.abs(delta);
    const temporaryRefund = Math.min(refund, reservedTemporaryCost);
    if (temporaryRefund > 0) await refundTemporaryCredit(match.customer.id, temporaryRefund);
    const paidRefund = Number((refund - temporaryRefund).toFixed(6));
    updatedCustomer = await query(
      `UPDATE customers
       SET balance = balance + $2,
           total_spend = GREATEST(0, total_spend - $3)
       WHERE id = $1
       RETURNING *`,
      [match.customer.id, paidRefund, refund]
    );
  } else if (delta > 0) {
    const extraTemporaryUsed = await consumeTemporaryCredits(match.customer.id, delta);
    const paidDelta = Number((delta - extraTemporaryUsed).toFixed(6));
    updatedCustomer = await query(
      `UPDATE customers
       SET balance = GREATEST(0, balance - $2),
           total_spend = total_spend + $3
       WHERE id = $1
       RETURNING *`,
      [match.customer.id, paidDelta, delta]
    );
  } else {
    updatedCustomer = await query("SELECT * FROM customers WHERE id = $1", [match.customer.id]);
  }

  await query(
    `INSERT INTO calls
      (id, customer_id, api_key_id, customer, endpoint, requested_model, routed_model, provider, status, prompt_tokens, completion_tokens, tokens, cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      makeId("call"),
      match.customer.id,
      match.apiKey.id,
      match.customer.company || match.customer.email,
      record.endpoint || "",
      record.requestedModel || "",
      record.routedModel || "",
      record.provider || "",
      Number(record.status || 0),
      promptTokens,
      completionTokens,
      tokens,
      actualCost,
    ]
  );

  if (shouldGrantUsageCredit) await grantDailyUsageCredit(match.customer.id);
  return publicCustomer(rowToCustomer(updatedCustomer.rows[0]));
}

export async function getDashboard(customerId = "cus_demo") {
  return getCustomer(customerId);
}

// ==================== Admin functions ====================

export async function listCustomers() {
  if (hasDatabase()) {
    const r = await query("SELECT * FROM customers ORDER BY created_at DESC");
    if (r) return r.rows.map((row) => {
      const customer = rowToCustomer(row);
      return { ...customer, passwordHash: undefined };
    });
  }
  const store = memoryStore();
  return store.customers.map((c) => {
    const keys = store.apiKeys.filter((k) => k.customerId === c.id);
    const userCalls = store.calls.filter((call) => call.customerId === c.id);
    const today = new Date().toISOString().slice(0, 10);
    const todayCalls = userCalls.filter((call) => (call.createdAt || "").slice(0, 10) === today);
    return {
      ...c,
      passwordHash: undefined,
      keyCount: keys.length,
      todayReqs: todayCalls.length,
      todayTokens: todayCalls.reduce((s, call) => s + (call.tokens || 0), 0),
      todaySpend: todayCalls.reduce((s, call) => s + (call.cost || 0), 0),
    };
  });
}

export async function updateCustomer(id, updates) {
  const allowed = ["name", "email", "phone", "company", "balance", "status", "level"];
  const filtered = {};
  for (const k of allowed) if (updates[k] !== undefined) filtered[k] = updates[k];

  if (hasDatabase()) {
    const sets = Object.keys(filtered).map((k, i) => `${k} = $${i + 2}`).join(", ");
    const values = Object.values(filtered);
    const r = await query(`UPDATE customers SET ${sets} WHERE id = $1 RETURNING *`, [id, ...values]);
    if (r && r.rows.length > 0) return rowToCustomer(r.rows[0]);
  }

  const store = memoryStore();
  const idx = store.customers.findIndex((c) => c.id === id);
  if (idx >= 0) {
    store.customers[idx] = { ...store.customers[idx], ...filtered };
    return store.customers[idx];
  }
  return null;
}

export async function disableApiKey(keyId) {
  let newApiId = "";
  if (hasDatabase()) {
    const result = await query("UPDATE api_keys SET disabled_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *", [keyId]);
    newApiId = rowToApiKey(result.rows[0])?.newApiId || "";
  }
  const store = memoryStore();
  const key = store.apiKeys.find((k) => k.id === keyId);
  if (key) {
    key.disabledAt = new Date().toISOString();
    newApiId = newApiId || key.newApiId || "";
  }
  if (newApiId) await disableNewApiToken(newApiId).catch(() => null);
  return { ok: true };
}

export async function enableApiKey(keyId) {
  let newApiId = "";
  if (hasDatabase()) {
    const result = await query("UPDATE api_keys SET disabled_at = NULL WHERE id = $1 AND deleted_at IS NULL RETURNING *", [keyId]);
    newApiId = rowToApiKey(result.rows[0])?.newApiId || "";
  }
  const store = memoryStore();
  const key = store.apiKeys.find((k) => k.id === keyId);
  if (key) {
    key.disabledAt = null;
    newApiId = newApiId || key.newApiId || "";
  }
  if (newApiId) await enableNewApiToken(newApiId).catch(() => null);
  return { ok: true };
}

export async function listCallRecords({ customer, model, channel, status, limit = 200, offset = 0 } = {}) {
  if (hasDatabase()) {
    const conditions = [];
    const params = [];
    let i = 1;
    if (customer) { conditions.push(`customer ILIKE $${i}`); params.push(`%${customer}%`); i++; }
    if (model) { conditions.push(`routed_model ILIKE $${i}`); params.push(`%${model}%`); i++; }
    if (channel) { conditions.push(`provider ILIKE $${i}`); params.push(`%${channel}%`); i++; }
    if (status === "success") { conditions.push("status = 200"); }
    if (status === "error") { conditions.push("status != 200"); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const r = await query(
      `SELECT * FROM calls ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    );
    const countR = await query(`SELECT COUNT(*) as total FROM calls ${where}`, params);
    return {
      logs: r ? r.rows.map((row) => ({
        id: row.id,
        time: row.created_at ? new Date(row.created_at).toISOString().replace("T", " ").slice(0, 19) : "",
        user: row.customer || "",
        model: row.routed_model || "",
        channel: row.provider || "",
        inputTokens: row.prompt_tokens || 0,
        outputTokens: row.completion_tokens || 0,
        cost: Number(row.cost || 0),
        latency: 0,
        statusCode: row.status || 0,
        status: row.status === 200 ? "success" : "error",
      })) : [],
      total: countR ? Number(countR.rows[0].total) : 0,
    };
  }
  const store = memoryStore();
  let logs = store.calls.map((call) => ({
    id: call.id,
    time: (call.createdAt || "").slice(0, 19),
    user: call.customerId || "",
    model: call.routedModel || "",
    channel: call.provider || "",
    inputTokens: call.promptTokens || 0,
    outputTokens: call.completionTokens || 0,
    cost: call.cost || 0,
    latency: 0,
    statusCode: call.status || 200,
    status: (call.status || 200) === 200 ? "success" : "error",
  }));
  if (customer) logs = logs.filter((l) => l.user.includes(customer));
  if (model) logs = logs.filter((l) => l.model.includes(model));
  if (channel) logs = logs.filter((l) => l.channel.includes(channel));
  if (status === "success") logs = logs.filter((l) => l.status === "success");
  if (status === "error") logs = logs.filter((l) => l.status !== "success");
  return { logs: logs.slice(offset, offset + limit), total: logs.length };
}

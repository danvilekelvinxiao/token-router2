import crypto from "crypto";
import { hasDatabase, query, getPool } from "./db";
import { createNewApiToken, disableNewApiToken, enableNewApiToken } from "./new-api/client";
import { hashPassword, verifyPassword } from "./passwords";
import { getModelProduct } from "./model-products";
import { validateTextModelProfitConfig } from "./model-profit-guard";
import { getApiGroup, modelSupportedByGroup } from "./api-groups";
import { recordRelayRequestAudit } from "./relay-audit-store";
import { buildFallbackDeductionBreakdown } from "./billing/deduction-priority";
import {
  activatePackageOrderForRecharge,
  createPackageOrderForRecharge,
  extractPackagePayload,
  getActivePackageTokenBalance,
  getPackageOrderByRechargeOrderId,
  refundUserPackageTokens,
  reserveUserPackageTokens,
} from "./packages/store";
import {
  CACHE_TTLS,
  getCacheManager,
  hashCacheKey,
  invalidateApiKeyCache,
  invalidateBillingCaches,
  invalidateCustomerCache,
} from "./cache-manager";
import {
  DEFAULT_RECHARGE_RATE,
  calculateRechargeCreditApi,
  decimalAdd,
  decimalCompare,
  decimalMin,
  decimalMultiplyRatio,
  decimalSubtract,
  toApiMoneyString,
  toNumber,
  toRmbMoneyString,
} from "./wallet/money";

const initialKey = process.env.PROXY_ACCESS_TOKEN || "sk-default";
const VERIFY_SECRET = process.env.VERIFY_SECRET || "flowapi-verify-secret-2024";
const DEFAULT_INVITE_CODES = ["FLOWAPI"];
const FREE_TRIAL_CREDIT = Number(process.env.FREE_TRIAL_CREDIT || 5);
const INVITER_BONUS_CREDIT = Number(process.env.INVITER_BONUS_CREDIT || 20);
const INVITEE_BONUS_CREDIT = Number(process.env.INVITEE_BONUS_CREDIT || 0);
const DAILY_LOGIN_CREDIT = Number(process.env.DAILY_LOGIN_CREDIT || 0.5);
const DAILY_USAGE_CREDIT = Number(process.env.DAILY_USAGE_CREDIT || 1.5);
const LOCAL_DEV_ADMIN_EMAIL = "xiaoyijie@flowapi.fun";
const LOCAL_DEV_ADMIN_PASSWORD = "xiaoyijie";
const SEED_ADMIN_PASSWORD = process.env.FLOWAPI_SEED_ADMIN_PASSWORD || LOCAL_DEV_ADMIN_PASSWORD;
const DEFAULT_PRICING_VERSION = process.env.FLOWAPI_PRICING_VERSION || "2026-06-16.v1";
const DEFAULT_BILLING_SOURCE = process.env.FLOWAPI_BILLING_SOURCE || "platform_pricing_table";

async function withDatabaseTransaction(work) {
  const pool = getPool();
  if (!pool) return work(null);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function isLocalDevAdminPassword({ email = "", password = "" }) {
  return process.env.NODE_ENV !== "production"
    && normalizeEmail(email) === LOCAL_DEV_ADMIN_EMAIL
    && String(password) === LOCAL_DEV_ADMIN_PASSWORD;
}

const store = globalThis.__TOKEN_ROUTER_CUSTOMERS__ || {};
if (!Array.isArray(store.customers)) {
  store.customers = [
    {
      id: "cus_admin",
      name: "xiaoyijie",
      phone: "",
      company: "FlowAPI",
      email: "xiaoyijie@flowapi.fun",
      passwordHash: SEED_ADMIN_PASSWORD,
      role: "admin",
      usedInviteCode: "",
      invitedBy: null,
      myInviteCode: "0001",
      balance: 9999,
      totalSpend: 0,
      emailVerified: true,
      createdAt: new Date().toISOString(),
    },
  ];
}
if (!Array.isArray(store.apiKeys)) {
  store.apiKeys = [
    {
      id: "key_admin",
      customerId: "cus_admin",
      token: "sk-" + Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
      label: "管理员 API Key",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      limitEnabled: false,
      limitType: "none",
      limitUnit: "cny",
      limitAmount: 0,
      resetIntervalValue: 0,
      resetIntervalUnit: "hour",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      currentPeriodUsedCny: 0,
      currentPeriodUsedTokens: 0,
      totalUsedCny: 0,
      totalUsedTokens: 0,
      lastLimitResetAt: null,
      nextLimitResetAt: null,
      limitStatus: "active",
    },
  ];
}
if (!Array.isArray(store.calls)) store.calls = [];
if (!Array.isArray(store.verificationCodes)) store.verificationCodes = [];
if (!Array.isArray(store.temporaryCredits)) store.temporaryCredits = [];
if (!Array.isArray(store.walletLedgerEntries)) store.walletLedgerEntries = [];

globalThis.__TOKEN_ROUTER_CUSTOMERS__ = store;
if (!store.temporaryCredits) store.temporaryCredits = [];
if (!store.relayRequestAudits) store.relayRequestAudits = [];

function memoryStore() {
  return store;
}

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

const API_KEY_LIMIT_TYPES = new Set(["none", "total", "daily", "weekly", "monthly", "custom"]);
const API_KEY_LIMIT_UNITS = new Set(["cny", "token"]);
const API_KEY_RESET_UNITS = new Set(["minute", "hour", "day"]);
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

function numberOrZero(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function clampApiMoney(value = 0) {
  const normalized = toApiMoneyString(value);
  return decimalCompare(normalized, "0") < 0 ? toApiMoneyString(0) : normalized;
}

function buildRelayAuditSnapshot({
  match = null,
  record = {},
  reservation = {},
  balanceBefore = 0,
  balanceAfter = 0,
  actualCost = 0,
  promptTokens = 0,
  completionTokens = 0,
  tokens = 0,
} = {}) {
  const reserved = Math.max(0, Number(typeof reservation === "object" ? reservation.reservedCost : reservation || 0));
  const billingDiff = Number((Number(actualCost || 0) - reserved).toFixed(6));
  const billingConsistent = Math.abs(billingDiff) < 0.000001;
  const statusCode = Number(record.status ?? 0);
  const success = record.success !== undefined ? Boolean(record.success) : statusCode >= 200 && statusCode < 300;
  const responseId = String(record.responseId || record.upstreamRequestId || record.requestId || "").trim();
  const upstreamRequestId = String(record.upstreamRequestId || responseId || "").trim();

  return {
    requestId: String(record.requestId || "").trim(),
    upstreamRequestId,
    responseId,
    provider: String(record.provider || "").trim(),
    model: String(record.actualModelId || record.publicModelId || record.requestedModel || record.model || "").trim(),
    apiKeyFingerprint: String(record.apiKeyFingerprint || "").trim(),
    customerId: String(match?.customer?.id || record.customerId || "").trim(),
    route: String(record.endpoint || record.route || record.routeStrategy || "").trim(),
    inputTokens: Math.max(0, Math.floor(Number(record.inputTokens ?? promptTokens ?? 0))),
    outputTokens: Math.max(0, Math.floor(Number(record.outputTokens ?? completionTokens ?? 0))),
    cacheCreationInputTokens: Math.max(0, Math.floor(Number(record.cacheCreationInputTokens || 0))),
    cacheReadInputTokens: Math.max(0, Math.floor(Number(record.cacheReadInputTokens || 0))),
    usageRaw: record.usageRaw || record.usage || {},
    promptHash: String(record.promptHash || "").trim(),
    balanceBefore: Number(balanceBefore || 0),
    balanceAfter: Number(balanceAfter || 0),
    cost: Number(actualCost || 0),
    currency: String(record.currency || "$ API").trim() || "$ API",
    pricingVersion: String(record.pricingVersion || DEFAULT_PRICING_VERSION).trim() || DEFAULT_PRICING_VERSION,
    billingSource: String(record.billingSource || DEFAULT_BILLING_SOURCE).trim() || DEFAULT_BILLING_SOURCE,
    billingConsistent,
    billingDiff,
    billingAlert: String(record.billingAlert || (!billingConsistent ? "billing_diff_detected" : "")).trim(),
    billingFlowStatus: String(record.billingFlowStatus || record.billing_flow_status || record.billingStatus || record.deliveryStatus || "").trim(),
    userMessageChars: Math.max(0, Math.floor(Number(record.userMessageChars || 0))),
    userMessageCount: Math.max(0, Math.floor(Number(record.userMessageCount || 0))),
    serverSystemChars: Math.max(0, Math.floor(Number(record.serverSystemChars || 0))),
    toolSchemaChars: Math.max(0, Math.floor(Number(record.toolSchemaChars || 0))),
    messagesBeforeEnrich: Math.max(0, Math.floor(Number(record.messagesBeforeEnrich || 0))),
    messagesAfterEnrich: Math.max(0, Math.floor(Number(record.messagesAfterEnrich || 0))),
    enrichmentSources: Array.isArray(record.enrichmentSources) ? record.enrichmentSources : [],
    tokenAnomalyFlag: Boolean(record.tokenAnomalyFlag || record.tokenAnomaly || false),
    compensationStatus: String(record.compensationStatus || (billingConsistent ? "none" : "pending")).trim() || "none",
    compensationAmount: Number(record.compensationAmount || 0),
    statusCode,
    success,
    errorCode: String(record.errorCode || "").trim(),
    errorMessage: String(record.errorMessage || "").trim(),
    createdAt: record.createdAt || new Date().toISOString(),
    completedAt: record.completedAt || new Date().toISOString(),
    latencyMs: Number(record.latencyMs || 0),
  };
}

function roundUsage(value, digits = 6) {
  return Number(numberOrZero(value).toFixed(digits));
}

function dateToIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function chinaDateParts(date = new Date()) {
  const shifted = new Date(date.getTime() + CHINA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay(),
  };
}

function chinaMidnightUtcMs(year, month, date) {
  return Date.UTC(year, month, date) - CHINA_OFFSET_MS;
}

function computeApiKeyLimitWindow(type, custom = {}, now = new Date(), existingStart = null) {
  const parts = chinaDateParts(now);
  if (type === "daily") {
    const startMs = chinaMidnightUtcMs(parts.year, parts.month, parts.date);
    return { start: new Date(startMs), end: new Date(startMs + 24 * 60 * 60 * 1000) };
  }
  if (type === "weekly") {
    const mondayOffset = (parts.day + 6) % 7;
    const startMs = chinaMidnightUtcMs(parts.year, parts.month, parts.date - mondayOffset);
    return { start: new Date(startMs), end: new Date(startMs + 7 * 24 * 60 * 60 * 1000) };
  }
  if (type === "monthly") {
    const startMs = chinaMidnightUtcMs(parts.year, parts.month, 1);
    const endMs = chinaMidnightUtcMs(parts.year, parts.month + 1, 1);
    return { start: new Date(startMs), end: new Date(endMs) };
  }
  if (type === "custom") {
    const value = Math.max(1, Number(custom.value || 1));
    const unit = API_KEY_RESET_UNITS.has(custom.unit) ? custom.unit : "hour";
    const intervalMs = unit === "minute"
      ? value * 60 * 1000
      : unit === "day"
        ? value * 24 * 60 * 60 * 1000
        : value * 60 * 60 * 1000;
    const start = existingStart ? new Date(existingStart) : now;
    return { start, end: new Date(start.getTime() + intervalMs) };
  }
  return { start: null, end: null };
}

function normalizeApiKeyLimitInput(input = {}) {
  const rawType = String(input.limitType || input.type || (input.enabled ? "daily" : "none")).trim();
  const limitType = API_KEY_LIMIT_TYPES.has(rawType) ? rawType : "none";
  const enabled = limitType !== "none" && input.enabled !== false;
  const limitUnit = API_KEY_LIMIT_UNITS.has(String(input.limitUnit || input.unit || "cny"))
    ? String(input.limitUnit || input.unit || "cny")
    : "cny";
  const limitAmount = Math.max(0, numberOrZero(input.limitAmount ?? input.amount));
  let resetIntervalValue = Math.max(0, Math.floor(numberOrZero(input.resetIntervalValue ?? input.intervalValue)));
  let resetIntervalUnit = API_KEY_RESET_UNITS.has(String(input.resetIntervalUnit || input.intervalUnit || "hour"))
    ? String(input.resetIntervalUnit || input.intervalUnit || "hour")
    : "hour";

  if (!enabled) {
    return {
      limitEnabled: false,
      limitType: "none",
      limitUnit,
      limitAmount: 0,
      resetIntervalValue: 0,
      resetIntervalUnit,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      lastLimitResetAt: null,
      nextLimitResetAt: null,
      limitStatus: "active",
    };
  }

  if (limitAmount <= 0) {
    const error = new Error("请填写大于 0 的限制上限");
    error.code = "INVALID_API_KEY_LIMIT";
    throw error;
  }

  if (limitType === "custom") {
    if (resetIntervalValue <= 0) {
      const error = new Error("请填写大于 0 的重置周期");
      error.code = "INVALID_API_KEY_LIMIT";
      throw error;
    }
    if (resetIntervalUnit === "minute" && resetIntervalValue < 60) {
      const error = new Error("自定义周期按分钟设置时，最小为 60 分钟");
      error.code = "INVALID_API_KEY_LIMIT";
      throw error;
    }
    const days = resetIntervalUnit === "day"
      ? resetIntervalValue
      : resetIntervalUnit === "hour"
        ? resetIntervalValue / 24
        : resetIntervalValue / 1440;
    if (days > 365) {
      const error = new Error("自定义周期最长不能超过 365 天");
      error.code = "INVALID_API_KEY_LIMIT";
      throw error;
    }
  } else {
    resetIntervalValue = 0;
    resetIntervalUnit = "hour";
  }

  const window = computeApiKeyLimitWindow(limitType, { value: resetIntervalValue, unit: resetIntervalUnit });
  return {
    limitEnabled: true,
    limitType,
    limitUnit,
    limitAmount,
    resetIntervalValue,
    resetIntervalUnit,
    currentPeriodStart: dateToIso(window.start),
    currentPeriodEnd: dateToIso(window.end),
    lastLimitResetAt: null,
    nextLimitResetAt: dateToIso(window.end),
    limitStatus: "active",
  };
}

function getApiKeyLimitFields(source = {}) {
  const limitEnabled = Boolean(source.limitEnabled ?? source.limit_enabled);
  const limitType = String(source.limitType ?? source.limit_type ?? "none");
  const limitUnit = String(source.limitUnit ?? source.limit_unit ?? "cny");
  const limitAmount = numberOrZero(source.limitAmount ?? source.limit_amount);
  const currentPeriodUsedCny = numberOrZero(source.currentPeriodUsedCny ?? source.current_period_used_cny);
  const currentPeriodUsedTokens = numberOrZero(source.currentPeriodUsedTokens ?? source.current_period_used_tokens);
  const totalUsedCny = numberOrZero(source.totalUsedCny ?? source.total_used_cny);
  const totalUsedTokens = numberOrZero(source.totalUsedTokens ?? source.total_used_tokens);
  return {
    limitEnabled,
    limitType,
    limitUnit,
    limitAmount,
    resetIntervalValue: Number(source.resetIntervalValue ?? source.reset_interval_value ?? 0),
    resetIntervalUnit: String(source.resetIntervalUnit ?? source.reset_interval_unit ?? "hour"),
    currentPeriodStart: dateToIso(source.currentPeriodStart ?? source.current_period_start),
    currentPeriodEnd: dateToIso(source.currentPeriodEnd ?? source.current_period_end),
    currentPeriodUsedCny,
    currentPeriodUsedTokens,
    totalUsedCny,
    totalUsedTokens,
    lastLimitResetAt: dateToIso(source.lastLimitResetAt ?? source.last_limit_reset_at),
    nextLimitResetAt: dateToIso(source.nextLimitResetAt ?? source.next_limit_reset_at),
    limitStatus: String(source.limitStatus ?? source.limit_status ?? "active"),
  };
}

function buildApiKeyLimitSummary(source = {}) {
  const fields = getApiKeyLimitFields(source);
  const active = fields.limitEnabled && fields.limitType !== "none" && fields.limitAmount > 0;
  const used = fields.limitType === "total"
    ? (fields.limitUnit === "token" ? fields.totalUsedTokens : fields.totalUsedCny)
    : (fields.limitUnit === "token" ? fields.currentPeriodUsedTokens : fields.currentPeriodUsedCny);
  const percent = active ? Math.min(100, Math.round((used / fields.limitAmount) * 100)) : 0;
  return {
    enabled: active,
    type: active ? fields.limitType : "none",
    unit: fields.limitUnit,
    amount: active ? fields.limitAmount : 0,
    used: roundUsage(used, fields.limitUnit === "token" ? 0 : 6),
    currentPeriodUsedCny: fields.currentPeriodUsedCny,
    currentPeriodUsedTokens: fields.currentPeriodUsedTokens,
    totalUsedCny: fields.totalUsedCny,
    totalUsedTokens: fields.totalUsedTokens,
    resetIntervalValue: fields.resetIntervalValue,
    resetIntervalUnit: fields.resetIntervalUnit,
    currentPeriodStart: fields.currentPeriodStart,
    currentPeriodEnd: fields.currentPeriodEnd,
    nextResetAt: fields.nextLimitResetAt,
    status: active && used >= fields.limitAmount ? "exceeded" : fields.limitStatus || "active",
    percent,
  };
}

async function refreshApiKeyLimitIfNeeded(apiKey) {
  if (!apiKey?.id) return apiKey;
  const fields = getApiKeyLimitFields(apiKey);
  if (!fields.limitEnabled || !["daily", "weekly", "monthly", "custom"].includes(fields.limitType)) return apiKey;
  const end = fields.currentPeriodEnd ? new Date(fields.currentPeriodEnd) : null;
  const now = new Date();
  if (end && now < end) return apiKey;

  const window = computeApiKeyLimitWindow(
    fields.limitType,
    { value: fields.resetIntervalValue, unit: fields.resetIntervalUnit },
    now,
    fields.limitType === "custom" ? now : null
  );
  const patch = {
    currentPeriodStart: dateToIso(window.start),
    currentPeriodEnd: dateToIso(window.end),
    currentPeriodUsedCny: 0,
    currentPeriodUsedTokens: 0,
    lastLimitResetAt: now.toISOString(),
    nextLimitResetAt: dateToIso(window.end),
    limitStatus: "active",
  };

  if (!hasDatabase()) {
    Object.assign(apiKey, patch);
    return apiKey;
  }

  await query(
    `UPDATE api_keys
     SET current_period_start = $2,
         current_period_end = $3,
         current_period_used_cny = 0,
         current_period_used_tokens = 0,
         last_limit_reset_at = NOW(),
         next_limit_reset_at = $3,
         limit_status = 'active'
     WHERE id = $1`,
    [apiKey.id, patch.currentPeriodStart, patch.currentPeriodEnd]
  );
  return { ...apiKey, ...patch };
}

function buildApiKeyQuotaExceeded(apiKey, usage = {}) {
  const fields = getApiKeyLimitFields(apiKey);
  const isTokenLimit = fields.limitUnit === "token";
  const limitDisplay = isTokenLimit ? `${fields.limitAmount} Token 额度` : `$ API ${fields.limitAmount} 余额限制`;
  const limitLabel = isTokenLimit ? "Token 额度" : "余额";
  const used = fields.limitType === "total"
    ? (isTokenLimit ? fields.totalUsedTokens : fields.totalUsedCny)
    : (isTokenLimit ? fields.currentPeriodUsedTokens : fields.currentPeriodUsedCny);
  const add = isTokenLimit ? numberOrZero(usage.tokens) : numberOrZero(usage.costCny);
  const code = fields.limitType === "total" ? "API_KEY_TOTAL_QUOTA_EXCEEDED" : "API_KEY_QUOTA_EXCEEDED";
  const nextResetAt = fields.limitType === "total" ? null : fields.nextLimitResetAt;
  return {
    ok: false,
    status: 429,
    code,
    error: fields.limitType === "total"
      ? `该 API Key 已达到总${limitLabel}限制（${limitDisplay}），请调整限制后再调用。`
      : `该 API Key 已达到本周期${limitLabel}限制（${limitDisplay}），请等待重置或调整限制后再调用。`,
    nextResetAt,
    usage: roundUsage(used + add, isTokenLimit ? 0 : 6),
    limitAmount: fields.limitAmount,
    limitUnit: fields.limitUnit,
  };
}

async function checkApiKeyLimitObject(apiKey, usage = {}) {
  const refreshed = await refreshApiKeyLimitIfNeeded(apiKey);
  const fields = getApiKeyLimitFields(refreshed);
  if (!fields.limitEnabled || fields.limitType === "none" || fields.limitAmount <= 0) {
    return { ok: true, apiKey: refreshed };
  }
  const used = fields.limitType === "total"
    ? (fields.limitUnit === "token" ? fields.totalUsedTokens : fields.totalUsedCny)
    : (fields.limitUnit === "token" ? fields.currentPeriodUsedTokens : fields.currentPeriodUsedCny);
  const add = fields.limitUnit === "token" ? numberOrZero(usage.tokens) : numberOrZero(usage.costCny);
  if (used >= fields.limitAmount || (add > 0 && used + add > fields.limitAmount)) {
    if (!hasDatabase()) refreshed.limitStatus = "exceeded";
    else await query("UPDATE api_keys SET limit_status = 'exceeded' WHERE id = $1", [refreshed.id]);
    return buildApiKeyQuotaExceeded(refreshed, usage);
  }
  return { ok: true, apiKey: refreshed };
}

export async function checkApiKeyLimitById(apiKeyId, usage = {}) {
  if (!apiKeyId) return { ok: true };
  if (!hasDatabase()) {
    const key = store.apiKeys.find((item) => item.id === apiKeyId && !item.deletedAt);
    return key ? checkApiKeyLimitObject(key, usage) : { ok: true };
  }
  const result = await query("SELECT * FROM api_keys WHERE id = $1 AND deleted_at IS NULL LIMIT 1", [apiKeyId]);
  if (!result.rows[0]) return { ok: true };
  return checkApiKeyLimitObject(rowToApiKey(result.rows[0]), usage);
}

export async function recordApiKeyLimitUsage(apiKeyId, { costCny = 0, tokens = 0 } = {}) {
  if (!apiKeyId) return null;
  const money = Math.max(0, roundUsage(costCny));
  const tokenCount = Math.max(0, Math.round(numberOrZero(tokens)));
  if (money <= 0 && tokenCount <= 0) return null;

  if (!hasDatabase()) {
    const key = store.apiKeys.find((item) => item.id === apiKeyId && !item.deletedAt);
    if (!key) return null;
    await refreshApiKeyLimitIfNeeded(key);
    key.currentPeriodUsedCny = roundUsage(numberOrZero(key.currentPeriodUsedCny) + money);
    key.currentPeriodUsedTokens = Math.round(numberOrZero(key.currentPeriodUsedTokens) + tokenCount);
    key.totalUsedCny = roundUsage(numberOrZero(key.totalUsedCny) + money);
    key.totalUsedTokens = Math.round(numberOrZero(key.totalUsedTokens) + tokenCount);
    const summary = buildApiKeyLimitSummary(key);
    key.limitStatus = summary.status;
    return summary;
  }

  await query(
    `UPDATE api_keys
     SET current_period_used_cny = current_period_used_cny + $2,
         current_period_used_tokens = current_period_used_tokens + $3,
         total_used_cny = total_used_cny + $2,
         total_used_tokens = total_used_tokens + $3,
         limit_status = CASE
           WHEN limit_enabled = true
            AND limit_type <> 'none'
            AND limit_amount > 0
            AND (
              (limit_unit = 'cny' AND (
                CASE WHEN limit_type = 'total' THEN total_used_cny + $2 ELSE current_period_used_cny + $2 END
              ) >= limit_amount)
              OR
              (limit_unit = 'token' AND (
                CASE WHEN limit_type = 'total' THEN total_used_tokens + $3 ELSE current_period_used_tokens + $3 END
              ) >= limit_amount)
            )
           THEN 'exceeded'
           ELSE 'active'
         END
     WHERE id = $1`,
    [apiKeyId, money, tokenCount]
  );
  return checkApiKeyLimitById(apiKeyId);
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
    status: row.status || "active",
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    deletedBy: row.deleted_by || "",
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
  const base = {
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
    teamId: row.team_id || "",
    usagePurpose: row.usage_purpose || "",
    usageScope: row.usage_scope || "",
    allowedModels: String(row.allowed_models || "").split(",").map((item) => item.trim()).filter(Boolean),
    priceMultiplier: Number(row.price_multiplier || 1),
    localePriceMultiplier: Number(row.locale_price_multiplier || 1),
  };
  const limitFields = getApiKeyLimitFields(row);
  return {
    ...base,
    ...limitFields,
    quotaLimit: buildApiKeyLimitSummary(limitFields),
  };
}

function rowToCall(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    apiKeyId: row.api_key_id,
    requestId: row.request_id || "",
    customer: row.customer,
    endpoint: row.endpoint,
    requestedModel: row.requested_model,
    routedModel: row.routed_model,
    publicModelId: row.public_model_id || "",
    actualModelId: row.actual_model_id || "",
    provider: row.provider,
    upstreamChannel: row.upstream_channel || "",
    upstreamProvider: row.upstream_provider || "",
    upstreamStatus: Number(row.upstream_status || 0),
    latencyMs: Number(row.latency_ms || 0),
    firstTokenMs: Number(row.first_token_ms || 0),
    status: Number(row.status || 0),
    promptTokens: Number(row.prompt_tokens || 0),
    completionTokens: Number(row.completion_tokens || 0),
    tokens: Number(row.tokens || row.total_tokens || 0),
    inputTokens: Number(row.input_tokens || row.prompt_tokens || 0),
    outputTokens: Number(row.output_tokens || row.completion_tokens || 0),
    totalTokens: Number(row.total_tokens || row.tokens || 0),
    cost: Number(row.cost || 0),
    sellPriceCny: Number(row.sell_price_cny || row.user_charge || row.cost || 0),
    userCharge: Number(row.user_charge || row.sell_price_cny || row.cost || 0),
    upstreamCostCny: Number(row.upstream_cost_cny || row.upstream_cost || 0),
    upstreamCost: Number(row.upstream_cost || row.upstream_cost_cny || 0),
    profitCny: Number(row.profit_cny || row.profit || 0),
    profit: Number(row.profit || row.profit_cny || 0),
    profitMargin: Number(row.profit_margin || 0),
    billingMode: row.billing_mode || "token_multiplier",
    routeStrategy: row.route_strategy || "",
    routeAttempts: Number(row.route_attempts || 0),
    isStream: Boolean(row.is_stream),
    errorCode: row.error_code || "",
    errorMessage: row.error_message || "",
    deliveryStatus: row.delivery_status || "",
    billingStatus: row.billing_status || "",
    relatedRequestId: row.related_request_id || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

function publicApiKeyDto(key = {}) {
  const token = String(key.token || "");
  const maskedToken = token
    ? `${token.slice(0, 8)}...${token.slice(-4)}`
    : "";
  const publicModelId = key.publicModelId || "";
  const publicAllowedModels = [
    publicModelId,
  ]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
  const limitFields = {
    quotaLimitCny: key.quotaLimitCny,
    quotaLimitTokens: key.quotaLimitTokens,
    quotaLimitRequests: key.quotaLimitRequests,
    quotaPeriod: key.quotaPeriod,
    quotaUsedCny: key.quotaUsedCny,
    quotaUsedTokens: key.quotaUsedTokens,
    quotaUsedRequests: key.quotaUsedRequests,
    quotaResetAt: key.quotaResetAt,
    quotaLimit: key.quotaLimit,
  };
  return {
    id: key.id,
    customerId: key.customerId,
    token: maskedToken,
    maskedToken,
    label: key.label,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    disabledAt: key.disabledAt,
    deletedAt: key.deletedAt,
    modelProductId: publicModelId,
    publicModelId,
    modelDisplayName: key.modelDisplayName || publicModelId || "",
    modelGroup: key.modelGroup || "",
    teamId: key.teamId || "",
    usagePurpose: key.usagePurpose || "",
    usageScope: key.usageScope || "",
    allowedModels: publicAllowedModels,
    priceMultiplier: Number(key.priceMultiplier || 1),
    localePriceMultiplier: Number(key.localePriceMultiplier || 1),
    ...limitFields,
  };
}

function publicCallDto(call = {}) {
  const publicModelId = call.publicModelId || call.requestedModel || call.routedModel || "";
  const safeError = call.status >= 400
    ? (call.errorCode || "FLOWAPI_REQUEST_FAILED")
    : "";
  return {
    id: call.requestId || call.id,
    callId: call.id,
    customerId: call.customerId,
    apiKeyId: call.apiKeyId,
    requestId: call.requestId,
    endpoint: call.endpoint,
    requestedModel: call.requestedModel || publicModelId,
    routedModel: call.publicModelId || call.routedModel || publicModelId,
    publicModelId,
    upstreamStatus: call.status >= 400 ? call.status : 200,
    latencyMs: Number(call.latencyMs || 0),
    firstTokenMs: Number(call.firstTokenMs || 0),
    status: Number(call.status || 0),
    promptTokens: Number(call.promptTokens || 0),
    completionTokens: Number(call.completionTokens || 0),
    tokens: Number(call.tokens || call.totalTokens || 0),
    inputTokens: Number(call.inputTokens || call.promptTokens || 0),
    outputTokens: Number(call.outputTokens || call.completionTokens || 0),
    totalTokens: Number(call.totalTokens || call.tokens || 0),
    cost: Number(call.cost || call.sellPriceCny || call.userCharge || 0),
    sellPriceCny: Number(call.sellPriceCny || call.userCharge || call.cost || 0),
    userCharge: Number(call.userCharge || call.sellPriceCny || call.cost || 0),
    billingMode: call.billingMode || "token_multiplier",
    deliveryStatus: call.deliveryStatus || "",
    billingStatus: call.billingStatus || "",
    relatedRequestId: call.relatedRequestId || "",
    isStream: Boolean(call.isStream),
    errorCode: safeError,
    errorMessage: safeError ? "FlowAPI 请求未完成，请使用 request_id 联系客服排查。" : "",
    createdAt: call.createdAt,
  };
}

function rowToRechargeOrder(row) {
  if (!row) return null;
  const outTradeNo = row.out_trade_no || row.outTradeNo || row.id;
  const rate = row.recharge_rate ?? row.rechargeRate ?? DEFAULT_RECHARGE_RATE;
  const legacyAmount = Number(row.amount || 0);
  const paymentAmountRmb = row.payment_amount_rmb !== undefined && row.payment_amount_rmb !== null
    ? Number(row.payment_amount_rmb || 0)
    : row.paymentAmountRmb !== undefined && row.paymentAmountRmb !== null
      ? Number(row.paymentAmountRmb || 0)
      : legacyAmount;
  const creditedAmountApi = row.credited_amount_api !== undefined && row.credited_amount_api !== null
    ? Number(row.credited_amount_api || 0)
    : row.creditedAmountApi !== undefined && row.creditedAmountApi !== null
      ? Number(row.creditedAmountApi || 0)
      : row.amountApi !== undefined && row.amountApi !== null
        ? Number(row.amountApi || 0)
        : legacyAmount;
  return {
    id: row.id,
    customerId: row.customer_id || row.customerId,
    outTradeNo,
    transactionNo: outTradeNo,
    amount: legacyAmount,
    amountApi: creditedAmountApi,
    creditedAmountApi,
    paymentAmountRmb,
    rechargeRate: Number(rate || DEFAULT_RECHARGE_RATE),
    rechargeRateText: `¥1 = $ API ${Number(rate || DEFAULT_RECHARGE_RATE).toLocaleString("zh-CN", { maximumFractionDigits: 6 })}`,
    currency: row.currency || "$ API",
    paymentCurrency: row.payment_currency || row.paymentCurrency || "CNY",
    creditCurrency: row.credit_currency || row.creditCurrency || "$ API",
    paymentMethod: row.payment_method || row.paymentMethod || "wechat",
    paymentRef: row.payment_ref || row.paymentRef || "",
    providerTradeNo: row.provider_trade_no || row.providerTradeNo || "",
    gatewayPayload: row.gateway_payload || row.gatewayPayload || "",
    status: row.status || "pending",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt || new Date().toISOString(),
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : row.paidAt || null,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : row.approvedAt || null,
    approvedBy: row.approved_by || row.approvedBy || "",
    customerEmail: row.email || "",
    customerName: row.name || "",
  };
}

function rowToWalletLedgerEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    type: row.type || "adjustment",
    amountApi: Number(row.amount_api || 0),
    balanceBeforeApi: Number(row.balance_before_api || 0),
    balanceAfterApi: Number(row.balance_after_api || 0),
    currency: row.currency || "$ API",
    sourceType: row.source_type || "",
    sourceId: row.source_id || "",
    modelName: row.model_name || "",
    requestId: row.request_id || "",
    adminId: row.admin_id || "",
    remark: row.remark || "",
    idempotencyKey: row.idempotency_key || "",
    metadata: row.metadata || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

async function recordWalletLedgerEntry({
  customerId = "",
  type = "adjustment",
  amountApi = 0,
  balanceBeforeApi = 0,
  balanceAfterApi = 0,
  sourceType = "",
  sourceId = "",
  modelName = "",
  requestId = "",
  adminId = "",
  remark = "",
  idempotencyKey = "",
  metadata = {},
} = {}) {
  const cleanCustomerId = String(customerId || "").trim();
  const key = String(idempotencyKey || `${type}:${cleanCustomerId}:${sourceType}:${sourceId}:${requestId}`).slice(0, 240);
  if (!cleanCustomerId || !key) return null;
  const entry = {
    id: makeId("wle"),
    customerId: cleanCustomerId,
    type,
    amountApi: toNumber(toApiMoneyString(amountApi)),
    balanceBeforeApi: toNumber(toApiMoneyString(balanceBeforeApi)),
    balanceAfterApi: toNumber(toApiMoneyString(balanceAfterApi)),
    currency: "$ API",
    sourceType,
    sourceId,
    modelName,
    requestId,
    adminId,
    remark,
    idempotencyKey: key,
    metadata,
    createdAt: new Date().toISOString(),
  };
  if (!hasDatabase()) {
    if (store.walletLedgerEntries.some((item) => item.idempotencyKey === key)) return null;
    store.walletLedgerEntries.unshift(entry);
    if (store.walletLedgerEntries.length > 5000) store.walletLedgerEntries.length = 5000;
    return entry;
  }
  const result = await query(
    `INSERT INTO wallet_ledger_entries
      (id, customer_id, type, amount_api, balance_before_api, balance_after_api, currency,
       source_type, source_id, model_name, request_id, admin_id, remark, idempotency_key, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, '$ API', $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      entry.id,
      cleanCustomerId,
      type,
      toApiMoneyString(amountApi),
      toApiMoneyString(balanceBeforeApi),
      toApiMoneyString(balanceAfterApi),
      String(sourceType || "").slice(0, 80),
      String(sourceId || "").slice(0, 180),
      String(modelName || "").slice(0, 255),
      String(requestId || "").slice(0, 180),
      String(adminId || "").slice(0, 180),
      String(remark || "").slice(0, 1200),
      key,
      JSON.stringify(metadata || {}),
    ]
  );
  return rowToWalletLedgerEntry(result.rows[0]);
}

export async function listWalletLedgerEntries({ customerId = "", limit = 100 } = {}) {
  if (!customerId) return [];
  if (!hasDatabase()) {
    return (store.walletLedgerEntries || [])
      .filter((entry) => entry.customerId === customerId)
      .slice(0, Number(limit) || 100);
  }
  const result = await query(
    `SELECT * FROM wallet_ledger_entries WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [customerId, Number(limit) || 100]
  );
  return result.rows.map(rowToWalletLedgerEntry);
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
    sourceType: row.source_type || "HISTORICAL",
    sourceName: row.source_name || "历史记录",
    description: row.description || row.detail || "",
    expireAt: row.expire_at ? new Date(row.expire_at).toISOString() : null,
    isTemporary: Boolean(row.is_temporary),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

const BALANCE_SOURCE_LABELS = {
  REGISTER_BONUS: "注册赠送",
  DAILY_LOGIN_BONUS: "每日登录奖励",
  VIP_DAILY_BONUS: "会员每日奖励",
  PACKAGE_DAILY_BONUS: "套餐每日赠送",
  ADMIN_RECHARGE: "后台管理员充值",
  ADMIN_DEDUCT: "后台管理员扣减",
  USER_RECHARGE: "用户充值",
  API_CONSUME: "API 调用消费",
  REFUND: "退款返还",
  refund_credit: "响应未完整返回自动退回",
  EXPIRE: "临时余额过期",
  SYSTEM_COMPENSATION: "系统补偿",
  ACTIVITY_BONUS: "活动赠送",
  HISTORICAL: "历史记录",
};

function inferActivitySourceType(action = "", detail = "") {
  const text = `${action} ${detail}`.toLowerCase();
  if (text.includes("register") || text.includes("注册")) return "REGISTER_BONUS";
  if (text.includes("daily_login") || text.includes("每日登录") || text.includes("login_credit")) return "DAILY_LOGIN_BONUS";
  if (text.includes("membership") || text.includes("会员")) return "VIP_DAILY_BONUS";
  if (text.includes("package") || text.includes("套餐")) return "PACKAGE_DAILY_BONUS";
  if (text.includes("admin") && (text.includes("deduct") || text.includes("扣"))) return "ADMIN_DEDUCT";
  if (text.includes("admin")) return "ADMIN_RECHARGE";
  if (text.includes("recharge") || text.includes("充值") || text.includes("payment")) return "USER_RECHARGE";
  if (text.includes("billing") || text.includes("consume") || text.includes("调用") || text.includes("扣费")) return "API_CONSUME";
  if (text.includes("refund") || text.includes("退款")) return "REFUND";
  if (text.includes("expire") || text.includes("过期")) return "EXPIRE";
  if (text.includes("compensation") || text.includes("补偿")) return "SYSTEM_COMPENSATION";
  if (text.includes("bonus") || text.includes("赠送") || text.includes("activity")) return "ACTIVITY_BONUS";
  return "HISTORICAL";
}

export async function logActivity({ customerId = "", email = "", action, category = "general", detail = "", amount = null, ip = "", userAgent = "", sourceType = "", sourceName = "", description = "", expireAt = null, isTemporary = false }) {
  if (!action) return;
  const resolvedSourceType = sourceType || inferActivitySourceType(action, detail);
  const resolvedSourceName = sourceName || BALANCE_SOURCE_LABELS[resolvedSourceType] || "历史记录";
  const resolvedDescription = description || detail || `${resolvedSourceName}${amount != null ? `：${Number(amount) >= 0 ? "增加" : "扣除"} $ API ${toApiMoneyString(Math.abs(Number(amount)))}` : ""}`;

  if (!hasDatabase()) {
    if (!store.activityLogs) store.activityLogs = [];
    store.activityLogs.unshift({
      id: makeId("log"),
      customerId,
      email,
      action,
      category,
      detail,
      amount: amount != null ? Number(toApiMoneyString(amount)) : null,
      ip,
      userAgent,
      sourceType: resolvedSourceType,
      sourceName: resolvedSourceName,
      description: resolvedDescription,
      expireAt: expireAt ? new Date(expireAt).toISOString() : null,
      isTemporary: Boolean(isTemporary),
      createdAt: new Date().toISOString(),
    });
    if (store.activityLogs.length > 5000) store.activityLogs.length = 5000;
    return;
  }

  await query(
    `INSERT INTO activity_logs (id, customer_id, email, action, category, detail, amount, ip, user_agent, source_type, source_name, description, expire_at, is_temporary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      makeId("log"),
      customerId || "",
      email || "",
      action,
      category,
      String(detail || "").slice(0, 2000),
      amount != null ? Number(toApiMoneyString(amount)) : null,
      String(ip || "").slice(0, 64),
      String(userAgent || "").slice(0, 512),
      resolvedSourceType,
      resolvedSourceName,
      String(resolvedDescription || "").slice(0, 2000),
      expireAt ? new Date(expireAt).toISOString() : null,
      Boolean(isTemporary),
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

async function expireTemporaryCredits(customerId) {
  if (!customerId) return;
  if (!hasDatabase()) {
    const expired = (store.temporaryCredits || []).filter((credit) =>
      credit.customerId === customerId
      && Number(credit.remaining || 0) > 0
      && credit.expiresAt
      && new Date(credit.expiresAt) <= new Date()
    );
    for (const credit of expired) {
      const expiredAmount = Number(credit.remaining || 0);
      credit.remaining = 0;
      await logActivity({
        customerId,
        action: "temporary_credit_expired",
        category: "billing",
        detail: `${credit.sourceName || credit.reason || "临时余额"}未使用余额过期：$ API ${toApiMoneyString(expiredAmount)}`,
        amount: -expiredAmount,
        sourceType: "EXPIRE",
        sourceName: "临时余额过期",
        description: `${credit.sourceName || credit.reason || "临时余额"}未使用余额过期：$ API ${toApiMoneyString(expiredAmount)}`,
        expireAt: credit.expiresAt,
        isTemporary: true,
      });
    }
    return;
  }

  const expired = await query(
    `SELECT id, customer_id, reason, remaining, expires_at, source_name
     FROM temporary_credits
     WHERE customer_id = $1
       AND remaining > 0
       AND expires_at <= NOW()
     ORDER BY expires_at ASC, created_at ASC`,
    [customerId]
  );
  for (const credit of expired.rows) {
    const expiredAmount = Number(credit.remaining || 0);
    if (expiredAmount <= 0) continue;
    await query("UPDATE temporary_credits SET remaining = 0 WHERE id = $1", [credit.id]);
    const customerResult = await query("SELECT email FROM customers WHERE id = $1 LIMIT 1", [customerId]);
    const label = credit.source_name || credit.reason || "临时余额";
    await logActivity({
      customerId,
      email: customerResult.rows[0]?.email || "",
      action: "temporary_credit_expired",
      category: "billing",
      detail: `${label}未使用余额过期：$ API ${toApiMoneyString(expiredAmount)}`,
      amount: -expiredAmount,
      sourceType: "EXPIRE",
      sourceName: "临时余额过期",
      description: `${label}未使用余额过期：$ API ${toApiMoneyString(expiredAmount)}`,
      expireAt: credit.expires_at,
      isTemporary: true,
    });
  }
}

export async function getTemporaryCreditBalance(customerId) {
  if (!customerId) return 0;
  await expireTemporaryCredits(customerId);
  if (!hasDatabase()) {
    const balance = store.temporaryCredits
      .filter((credit) => credit.customerId === customerId && isTemporaryCreditActive(credit))
      .reduce((total, credit) => decimalAdd(total, clampApiMoney(credit.remaining || 0)), "0");
    return toNumber(toApiMoneyString(balance));
  }

  const result = await query(
    `SELECT COALESCE(SUM(remaining), 0) AS balance
     FROM temporary_credits
     WHERE customer_id = $1
       AND remaining > 0
       AND expires_at > NOW()`,
    [customerId]
  );
  return toNumber(toApiMoneyString(result.rows[0]?.balance || 0));
}

export async function grantTemporaryCredit(customerId, { amount, reason, detail, sourceType = "" }) {
  const value = Number(amount || 0);
  const resolvedSourceType = sourceType || inferActivitySourceType(reason, detail);
  const resolvedSourceName = BALANCE_SOURCE_LABELS[resolvedSourceType] || "活动赠送";
  const resolvedDescription = `${resolvedSourceName}：赠送 $${value.toFixed(2)} API，当天有效，未使用部分将在今日结束后过期。`;
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
      sourceType: resolvedSourceType,
      sourceName: resolvedSourceName,
      description: resolvedDescription,
      isTemporary: true,
      createdAt: new Date().toISOString(),
    };
    store.temporaryCredits.push(credit);
    const customer = store.customers.find((item) => item.id === customerId);
    await logActivity({
      customerId,
      email: customer?.email || "",
      action: "temporary_credit_granted",
      category: "billing",
      detail: resolvedDescription,
      amount: value,
      sourceType: resolvedSourceType,
      sourceName: resolvedSourceName,
      description: resolvedDescription,
      expireAt: expiresAt,
      isTemporary: true,
    });
    return { granted: true, balance: await getTemporaryCreditBalance(customerId) };
  }

  const inserted = await query(
    `INSERT INTO temporary_credits (id, customer_id, reason, grant_day, amount, remaining, expires_at, source_type, source_name, description, is_temporary)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, true)
     ON CONFLICT (customer_id, reason, grant_day) DO NOTHING
     RETURNING *`,
    [makeId("tmp_credit"), customerId, reason, grantDay, value, expiresAt.toISOString(), resolvedSourceType, resolvedSourceName, resolvedDescription]
  );

  if (inserted.rows[0]) {
    const customerResult = await query("SELECT email FROM customers WHERE id = $1 LIMIT 1", [customerId]);
    await logActivity({
      customerId,
      email: customerResult.rows[0]?.email || "",
      action: "temporary_credit_granted",
      category: "billing",
      detail: resolvedDescription,
      amount: value,
      sourceType: resolvedSourceType,
      sourceName: resolvedSourceName,
      description: resolvedDescription,
      expireAt: expiresAt,
      isTemporary: true,
    });
  }

  return { granted: Boolean(inserted.rows[0]), balance: await getTemporaryCreditBalance(customerId) };
}

export async function grantDailyLoginCredit(customerId) {
  return grantTemporaryCredit(customerId, {
    amount: DAILY_LOGIN_CREDIT,
    reason: "daily_login",
    detail: "每日登录奖励",
    sourceType: "DAILY_LOGIN_BONUS",
  });
}

export async function grantDailyUsageCredit(customerId) {
  return grantTemporaryCredit(customerId, {
    amount: DAILY_USAGE_CREDIT,
    reason: "real_token_usage",
    detail: "API 调用活跃奖励",
    sourceType: "ACTIVITY_BONUS",
  });
}

async function consumeTemporaryCredits(customerId, amount) {
  const target = clampApiMoney(amount);
  if (!customerId || decimalCompare(target, "0") <= 0) return toApiMoneyString(0);

  if (!hasDatabase()) {
    let remainingToConsume = target;
    let consumed = toApiMoneyString(0);
    const credits = store.temporaryCredits
      .filter((credit) => credit.customerId === customerId && isTemporaryCreditActive(credit))
      .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
    for (const credit of credits) {
      if (decimalCompare(remainingToConsume, "0") <= 0) break;
      const currentRemaining = clampApiMoney(credit.remaining || 0);
      const take = decimalMin(currentRemaining, remainingToConsume);
      credit.remaining = toNumber(decimalSubtract(currentRemaining, take));
      remainingToConsume = clampApiMoney(decimalSubtract(remainingToConsume, take));
      consumed = clampApiMoney(decimalAdd(consumed, take));
    }
    return consumed;
  }

  let remainingToConsume = target;
  let consumed = toApiMoneyString(0);
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
    if (decimalCompare(remainingToConsume, "0") <= 0) break;
    const currentRemaining = clampApiMoney(credit.remaining || 0);
    const take = decimalMin(currentRemaining, remainingToConsume);
    await query(
      "UPDATE temporary_credits SET remaining = remaining - $2 WHERE id = $1",
      [credit.id, take]
    );
    remainingToConsume = clampApiMoney(decimalSubtract(remainingToConsume, take));
    consumed = clampApiMoney(decimalAdd(consumed, take));
  }
  return consumed;
}

async function refundTemporaryCredit(customerId, amount) {
  const value = clampApiMoney(amount);
  if (!customerId || decimalCompare(value, "0") <= 0) return toApiMoneyString(0);
  const grantDay = getChinaDayKey();
  const expiresAt = getChinaDayExpiry(grantDay);

  if (!hasDatabase()) {
    store.temporaryCredits.push({
      id: makeId("tmp_refund"),
      customerId,
      reason: "temporary_credit_refund",
      grantDay,
      amount: toNumber(value),
      remaining: toNumber(value),
      expiresAt: expiresAt.toISOString(),
      sourceType: "REFUND",
      sourceName: "退款返还",
      description: `退款返还：增加 $ API ${toApiMoneyString(value)}，当天有效`,
      isTemporary: true,
      createdAt: new Date().toISOString(),
    });
    return value;
  }

  await query(
    `INSERT INTO temporary_credits (id, customer_id, reason, grant_day, amount, remaining, expires_at, source_type, source_name, description, is_temporary)
     VALUES ($1, $2, $3, $4, $5, $5, $6, 'REFUND', '退款返还', $7, true)`,
    [makeId("tmp_refund"), customerId, `temporary_credit_refund_${Date.now()}`, grantDay, value, expiresAt.toISOString(), `退款返还：增加 $ API ${toApiMoneyString(value)}，当天有效`]
  );
  return value;
}

export async function issueRefundCreditForRequest({ customerId = "", requestId = "", callId = "", amount = 0, reason = "incomplete_delivery" } = {}) {
  const value = Number(amount || 0);
  const cleanRequestId = String(requestId || "").trim();
  const cleanCallId = String(callId || "").trim();
  if (!customerId || value <= 0 || (!cleanRequestId && !cleanCallId)) {
    return { ok: false, reason: "invalid_refund_credit_input" };
  }
  const grantDay = getChinaDayKey();
  const expiresAt = getChinaDayExpiry(grantDay);
  const refundReason = `refund_credit_${cleanRequestId || cleanCallId}_${reason}`.slice(0, 180);
  const description = `响应未完整返回，已自动退回本次消耗金额。关联请求：${cleanRequestId || cleanCallId}`;

  if (!hasDatabase()) {
    store.temporaryCredits.push({
      id: makeId("tmp_refund"),
      customerId,
      reason: refundReason,
      grantDay,
      amount: value,
      remaining: value,
      expiresAt: expiresAt.toISOString(),
      sourceType: "refund_credit",
      sourceName: "响应未完整返回自动退回",
      description,
      isTemporary: true,
      createdAt: new Date().toISOString(),
    });
    await logActivity({
      customerId,
      action: "refund_credit",
      category: "billing",
      detail: description,
      amount: value,
      sourceType: "refund_credit",
      sourceName: "响应未完整返回自动退回",
      description,
      expireAt: expiresAt,
      isTemporary: true,
    });
    const customer = store.customers.find((item) => item.id === customerId);
    await recordWalletLedgerEntry({
      customerId,
      type: "refund",
      amountApi: value,
      balanceBeforeApi: customer?.balance || 0,
      balanceAfterApi: customer?.balance || 0,
      sourceType: "api_refund",
      sourceId: cleanRequestId || cleanCallId,
      requestId: cleanRequestId,
      remark: description,
      idempotencyKey: `refund:${customerId}:${cleanRequestId || cleanCallId}:${reason}`,
      metadata: { isTemporaryCredit: true, expiresAt: expiresAt.toISOString() },
    });
    return { ok: true, amount: value, requestId: cleanRequestId, callId: cleanCallId };
  }

  const inserted = await query(
    `INSERT INTO temporary_credits (id, customer_id, reason, grant_day, amount, remaining, expires_at, source_type, source_name, description, is_temporary)
     VALUES ($1, $2, $3, $4, $5, $5, $6, 'refund_credit', '响应未完整返回自动退回', $7, true)
     ON CONFLICT (customer_id, reason, grant_day) DO NOTHING
     RETURNING id`,
    [makeId("tmp_refund"), customerId, refundReason, grantDay, value, expiresAt.toISOString(), description]
  );
  if (!inserted.rows[0]) {
    return { ok: true, duplicate: true, amount: value, requestId: cleanRequestId, callId: cleanCallId };
  }
  const customerResult = await query("SELECT email FROM customers WHERE id = $1 LIMIT 1", [customerId]);
  await logActivity({
    customerId,
    email: customerResult.rows[0]?.email || "",
    action: "refund_credit",
    category: "billing",
    detail: description,
    amount: value,
    sourceType: "refund_credit",
    sourceName: "响应未完整返回自动退回",
    description,
    expireAt: expiresAt,
    isTemporary: true,
  });
  const balanceResult = await query("SELECT balance FROM customers WHERE id = $1 LIMIT 1", [customerId]);
  await recordWalletLedgerEntry({
    customerId,
    type: "refund",
    amountApi: value,
    balanceBeforeApi: balanceResult.rows[0]?.balance || 0,
    balanceAfterApi: balanceResult.rows[0]?.balance || 0,
    sourceType: "api_refund",
    sourceId: cleanRequestId || cleanCallId,
    requestId: cleanRequestId,
    remark: description,
    idempotencyKey: `refund:${customerId}:${cleanRequestId || cleanCallId}:${reason}`,
    metadata: { isTemporaryCredit: true, expiresAt: expiresAt.toISOString() },
  });
  await query(
    `UPDATE calls
     SET billing_status = 'billing_refunded',
         delivery_status = COALESCE(NULLIF(delivery_status, ''), 'upstream_completed_downstream_failed'),
         related_request_id = COALESCE(NULLIF(related_request_id, ''), $1)
     WHERE ($1 <> '' AND request_id = $1) OR ($2 <> '' AND id = $2)`,
    [cleanRequestId, cleanCallId]
  );
  if (cleanRequestId) {
    await query(
      `UPDATE relay_request_audits
       SET compensation_status = 'applied',
           compensation_amount = $2,
           billing_flow_status = 'billing_refunded'
       WHERE request_id = $1`,
      [cleanRequestId, value]
    ).catch(() => null);
  }
  invalidateBillingCaches(customerId);
  return { ok: true, amount: value, requestId: cleanRequestId, callId: cleanCallId };
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
	      apiKeys: store.apiKeys
	        .filter((key) => key.customerId === customer.id && !key.deletedAt)
	        .map((key) => publicApiKeyDto({ ...key, quotaLimit: buildApiKeyLimitSummary(key) })),
	      calls: store.calls.filter((call) => call.customerId === customer.id).map(publicCallDto),
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
	    apiKeys: keysResult.rows.map(rowToApiKey).map(publicApiKeyDto),
	    calls: callsResult.rows.map(rowToCall).map(publicCallDto),
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
    if (!verification.ok) {
      if (!isLocalDevAdminPassword({ email: cleanEmail, password })) return null;
      customer.passwordHash = await hashPassword(password);
    }
    if (verification.needsRehash) customer.passwordHash = await hashPassword(password);
    if (customer.status === "deleted") return null;
    if (!customer.emailVerified) return { needsVerification: true };
    await grantDailyLoginCredit(customer.id);
    return publicCustomer(customer);
  }

  const result = await query("SELECT * FROM customers WHERE email = $1 LIMIT 1", [cleanEmail]);
  const customer = rowToCustomer(result.rows[0]);
  if (!customer) return null;
  if (customer.status === "deleted") return null;
  const verification = await verifyPassword(password, customer.passwordHash);
  if (!verification.ok) {
    if (!isLocalDevAdminPassword({ email: cleanEmail, password })) return null;
    const localDevHash = await hashPassword(password);
    await query("UPDATE customers SET password_hash = $2 WHERE id = $1", [customer.id, localDevHash]);
    customer.passwordHash = localDevHash;
  }
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
    const updated = await withDatabaseTransaction(async (client) => {
      const result = await client.query(
        `UPDATE customers
         SET email_verified = true,
             my_invite_code = $2,
             balance = balance + $3
         WHERE id = $1
         RETURNING *`,
        [customer.id, inviteCode, bonus]
      );

      if (result.rows[0] && customer.invitedBy && INVITER_BONUS_CREDIT > 0) {
        await client.query(
          "UPDATE customers SET balance = balance + $2 WHERE id = $1 AND email_verified = true",
          [customer.invitedBy, INVITER_BONUS_CREDIT]
        );
      }

      return result.rows[0] || null;
    });

    if (!updated) return false;

    if (customer.usedInviteCode) {
      import("@/lib/referrals/store")
        .then(({ bindReferral }) => bindReferral({ referredUserId: customer.id, inviteCode: customer.usedInviteCode, source: "register" }))
        .catch(() => {});
    }

    return publicCustomer(rowToCustomer(updated));
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

export async function createApiKey(customerId, label = "API Key", expiresAt = null, modelProductInput = null, options = {}) {
  const modelProduct = typeof modelProductInput === "string"
    ? getModelProduct(modelProductInput)
    : modelProductInput;

  if (!modelProduct) {
    const error = new Error("请先选择要使用的模型，再创建 API Key。");
    error.type = "model_required";
    throw error;
  }

  if (!modelProduct.isAvailable) {
    const error = new Error("该模型暂未开放，请选择其他模型。");
    error.type = "model_coming_soon";
    throw error;
  }

  if (!modelProduct.actualModelId || String(modelProduct.actualModelId).trim() === "") {
    const error = new Error("该模型服务尚未配置完成，请等待管理员配置后再创建 Key。");
    error.type = "model_not_configured";
    throw error;
  }

  const publicModelId = modelProduct.publicModelId;
  const actualModelId = modelProduct.actualModelId || publicModelId;
  const allowedModels = modelProduct.allowedModels?.length ? modelProduct.allowedModels : [actualModelId];
  const upstreamAllowedModels = modelProduct.upstreamModels?.length ? modelProduct.upstreamModels : [actualModelId];
  const modelLabel = modelProduct.displayName || publicModelId;
  const limitConfig = normalizeApiKeyLimitInput(options.limit || options.quotaLimit || {});
  const selectedGroup = await getApiGroup(options.groupId || options.modelGroup || options.group);
  if (!selectedGroup || !selectedGroup.available) {
    const error = new Error("所选分组暂不可用，请选择其他分组。");
    error.type = "group_unavailable";
    throw error;
  }
  if (!modelSupportedByGroup(selectedGroup, modelProduct)) {
    const error = new Error("所选分组不支持当前模型，请更换分组或模型。");
    error.type = "group_model_not_supported";
    throw error;
  }
  const pricingGuard = validateTextModelProfitConfig(modelProduct, {
    multiplier: Number(selectedGroup.billingMultiplier || modelProduct.priceMultiplier || 1) * Math.max(1, Number(options.localePriceMultiplier || 1)),
  });
  if (!pricingGuard.ok) {
    const error = new Error(pricingGuard.userMessage || "该模型价格尚未通过毛利审核，请先选择其他模型。");
    error.code = pricingGuard.code;
    error.type = "model_profit_guard";
    throw error;
  }
  const shouldSyncNewApiToken = process.env.FLOWAPI_SYNC_NEW_API_TOKEN_ON_CREATE === "true";
  let newApiToken = null;
  let newApiSyncStatus = shouldSyncNewApiToken ? "pending" : "not_required";
  if (shouldSyncNewApiToken) {
    try {
      newApiToken = await createNewApiToken({
        name: `${label || "API Key"} · ${modelLabel}`.slice(0, 50),
        group: selectedGroup.newApiGroup || modelProduct.executionGroup || process.env.NEW_API_EXECUTION_GROUP || process.env.NEW_API_DEFAULT_GROUP || "default",
        models: upstreamAllowedModels,
      });
      newApiSyncStatus = "synced";
    } catch (error) {
      console.error("[customer-store:createApiKey] New API token sync failed; creating FlowAPI local key first:", error?.message || error);
      newApiSyncStatus = "pending";
    }
  }

  const flowApiToken = makeToken();

  const key = {
    id: makeId("key"),
    customerId,
    token: flowApiToken,
    label,
    newApiId: newApiToken?.id || "",
    newApiSyncStatus,
    newApiSyncedAt: newApiSyncStatus === "synced" ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    expiresAt: expiresAt || null,
    disabledAt: null,
    modelProductId: modelProduct.id,
    publicModelId,
    actualModelId,
    modelDisplayName: modelLabel,
    modelGroup: selectedGroup.id || modelProduct.group || "",
    allowedModels,
    priceMultiplier: Number(selectedGroup.billingMultiplier || modelProduct.priceMultiplier || 1),
    localePriceMultiplier: Math.max(1, Number(options.localePriceMultiplier || 1)),
    ...limitConfig,
    currentPeriodUsedCny: 0,
    currentPeriodUsedTokens: 0,
    totalUsedCny: 0,
    totalUsedTokens: 0,
    teamId: options.teamId || options.team_id || "",
    usagePurpose: options.usagePurpose || options.usage_purpose || "",
    usageScope: options.usageScope || options.usage_scope || "",
  };

  if (!hasDatabase()) {
    store.apiKeys.push(key);
    logActivity({ customerId, action: "create_key", category: "api_key", detail: `创建 API Key: ${label}` });
    invalidateCustomerCache(customerId);
    return key;
  }

  const result = await query(
    `INSERT INTO api_keys
      (id, customer_id, token, new_api_token_id, new_api_sync_status, new_api_synced_at, label, expires_at,
       model_product_id, public_model_id, actual_model_id, model_display_name, model_group, allowed_models, price_multiplier, locale_price_multiplier,
       limit_enabled, limit_type, limit_unit, limit_amount, reset_interval_value, reset_interval_unit,
       current_period_start, current_period_end, current_period_used_cny, current_period_used_tokens,
       total_used_cny, total_used_tokens, last_limit_reset_at, next_limit_reset_at, limit_status,
       team_id, usage_purpose, usage_scope)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'synced' THEN NOW() ELSE NULL END, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
       $16, $17, $18, $19, $20, $21, $22, $23, 0, 0, 0, 0, $24, $25, $26, $27, $28, $29)
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
      key.localePriceMultiplier,
      key.limitEnabled,
      key.limitType,
      key.limitUnit,
      key.limitAmount,
      key.resetIntervalValue,
      key.resetIntervalUnit,
      key.currentPeriodStart,
      key.currentPeriodEnd,
      key.lastLimitResetAt,
      key.nextLimitResetAt,
      key.limitStatus,
      key.teamId,
      key.usagePurpose,
      key.usageScope,
    ]
  );
  logActivity({ customerId, action: "create_key", category: "api_key", detail: `创建 ${modelLabel} API Key: ${label}` });
  const created = rowToApiKey(result.rows[0]);
  invalidateCustomerCache(customerId);
  invalidateApiKeyCache(created.token);
  return created;
}

export async function updateApiKey(customerId, keyId, updates = {}) {
  if (!customerId || !keyId) return null;

  if (!hasDatabase()) {
    const key = store.apiKeys.find((item) => item.id === keyId && item.customerId === customerId);
    if (!key) return null;
    if (updates.label !== undefined) key.label = String(updates.label || "API Key").slice(0, 80);
    if (updates.expiresAt !== undefined) key.expiresAt = updates.expiresAt || null;
    if (updates.disabled !== undefined) key.disabledAt = updates.disabled ? new Date().toISOString() : null;
    if (updates.teamId !== undefined) key.teamId = updates.teamId || "";
    if (updates.usagePurpose !== undefined) key.usagePurpose = updates.usagePurpose || "";
    if (updates.usageScope !== undefined) key.usageScope = updates.usageScope || "";
    if (updates.limit !== undefined || updates.quotaLimit !== undefined) {
      Object.assign(key, normalizeApiKeyLimitInput(updates.limit ?? updates.quotaLimit), {
        currentPeriodUsedCny: 0,
        currentPeriodUsedTokens: 0,
      });
    }
    if (key.newApiId && updates.disabled !== undefined) {
      if (updates.disabled) await disableNewApiToken(key.newApiId).catch(() => null);
      else await enableNewApiToken(key.newApiId).catch(() => null);
    }
    invalidateApiKeyCache(key.token);
    invalidateCustomerCache(customerId);
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
         END,
         team_id = COALESCE($7, team_id),
         usage_purpose = COALESCE($8, usage_purpose),
         usage_scope = COALESCE($9, usage_scope)
     WHERE id = $1 AND customer_id = $2
     RETURNING *`,
    [
      keyId,
      customerId,
      updates.label === undefined ? null : String(updates.label || "API Key").slice(0, 80),
      updates.expiresAt === undefined ? null : updates.expiresAt || null,
      updates.disabled === undefined ? null : Boolean(updates.disabled),
      updates.expiresAt !== undefined,
      updates.teamId === undefined ? null : updates.teamId || "",
      updates.usagePurpose === undefined ? null : updates.usagePurpose || "",
      updates.usageScope === undefined ? null : updates.usageScope || "",
    ]
  );
  if (!result.rows[0]) return null;
  const updatedKey = rowToApiKey(result.rows[0]);
  if (updates.limit !== undefined || updates.quotaLimit !== undefined) {
    const limitConfig = normalizeApiKeyLimitInput(updates.limit ?? updates.quotaLimit);
    await query(
      `UPDATE api_keys
       SET limit_enabled = $2,
           limit_type = $3,
           limit_unit = $4,
           limit_amount = $5,
           reset_interval_value = $6,
           reset_interval_unit = $7,
           current_period_start = $8,
           current_period_end = $9,
           current_period_used_cny = 0,
           current_period_used_tokens = 0,
           last_limit_reset_at = $10,
           next_limit_reset_at = $11,
           limit_status = $12
       WHERE id = $1 AND customer_id = $13`,
      [
        keyId,
        limitConfig.limitEnabled,
        limitConfig.limitType,
        limitConfig.limitUnit,
        limitConfig.limitAmount,
        limitConfig.resetIntervalValue,
        limitConfig.resetIntervalUnit,
        limitConfig.currentPeriodStart,
        limitConfig.currentPeriodEnd,
        limitConfig.lastLimitResetAt,
        limitConfig.nextLimitResetAt,
        limitConfig.limitStatus,
        customerId,
      ]
    );
    logActivity({ customerId, action: "update_key_limit", category: "api_key", detail: `调整 API Key 调用限制: ${updatedKey.label || keyId}` });
  }
  if (updatedKey?.newApiId && updates.disabled !== undefined) {
    if (updates.disabled) await disableNewApiToken(updatedKey.newApiId).catch(() => null);
    else await enableNewApiToken(updatedKey.newApiId).catch(() => null);
  }
  invalidateApiKeyCache(updatedKey.token);
  invalidateCustomerCache(customerId);
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
    invalidateApiKeyCache(key.token);
    invalidateCustomerCache(customerId);
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
  invalidateApiKeyCache(deletedKey.token);
  invalidateCustomerCache(customerId);
  return getCustomer(customerId);
}

export async function findCustomerByToken(token) {
  const cleanToken = String(token || "").trim();
  if (!hasDatabase()) {
    const apiKey = store.apiKeys.find((key) => key.token === cleanToken);
    if (!apiKey) return null;
    if (apiKey.deletedAt) return null;
    if (apiKey.disabledAt) return null;
    // check expiry
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) return null;
    await refreshApiKeyLimitIfNeeded(apiKey);
    const customer = store.customers.find((item) => item.id === apiKey.customerId);
    return customer ? { apiKey, customer } : null;
  }

  const cache = getCacheManager();
  const cacheKey = hashCacheKey(cleanToken);
  const cached = cache.get("apiKeyLookup", cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT
       k.id AS key_id, k.customer_id, k.token, k.label, k.created_at AS key_created_at, k.last_used_at,
       k.expires_at, k.disabled_at, k.deleted_at, k.new_api_token_id, k.new_api_sync_status, k.new_api_synced_at,
    k.model_product_id, k.public_model_id, k.actual_model_id, k.model_display_name, k.model_group,
       k.allowed_models, k.price_multiplier, k.locale_price_multiplier, k.team_id, k.usage_purpose, k.usage_scope,
       k.limit_enabled, k.limit_type, k.limit_unit, k.limit_amount, k.reset_interval_value, k.reset_interval_unit,
       k.current_period_start, k.current_period_end, k.current_period_used_cny, k.current_period_used_tokens,
       k.total_used_cny, k.total_used_tokens, k.last_limit_reset_at, k.next_limit_reset_at, k.limit_status,
       c.*
     FROM api_keys k
     JOIN customers c ON c.id = k.customer_id
     WHERE k.token = $1
       AND k.disabled_at IS NULL
       AND k.deleted_at IS NULL
       AND (k.expires_at IS NULL OR k.expires_at > NOW())
    LIMIT 1`,
    [cleanToken]
  );
  const row = result.rows[0];
  if (!row) return null;
  const apiKey = await refreshApiKeyLimitIfNeeded({
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
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    modelProductId: row.model_product_id || "",
    publicModelId: row.public_model_id || "",
    actualModelId: row.actual_model_id || "",
    modelDisplayName: row.model_display_name || "",
    modelGroup: row.model_group || "",
    teamId: row.team_id || "",
    usagePurpose: row.usage_purpose || "",
    usageScope: row.usage_scope || "",
    allowedModels: String(row.allowed_models || "").split(",").map((item) => item.trim()).filter(Boolean),
    priceMultiplier: Number(row.price_multiplier || 1),
    localePriceMultiplier: Number(row.locale_price_multiplier || 1),
    ...getApiKeyLimitFields(row),
  });
  const match = {
    apiKey: { ...apiKey, token: "", quotaLimit: buildApiKeyLimitSummary(apiKey) },
    customer: rowToCustomer(row),
  };
  cache.set("apiKeyLookup", cacheKey, match, CACHE_TTLS.apiKeyLookup);
  return match;
}

export async function rechargeCustomer(customerId, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return getCustomer(customerId);
  }

  if (!hasDatabase()) {
    const customer = store.customers.find((item) => item.id === customerId);
    if (!customer) return null;
    const balanceBeforeApi = toApiMoneyString(customer.balance || 0);
    customer.balance = toNumber(decimalAdd(balanceBeforeApi, value));
    await recordWalletLedgerEntry({
      customerId,
      type: "admin_add",
      amountApi: value,
      balanceBeforeApi,
      balanceAfterApi: customer.balance,
      sourceType: "manual_recharge",
      sourceId: customerId,
      remark: `后台加款：$ API ${Number(value).toFixed(2)}`,
      idempotencyKey: `manual_recharge:${customerId}:${Date.now()}`,
    });
    return publicCustomer(customer);
  }

  const before = await query("SELECT balance FROM customers WHERE id = $1 LIMIT 1", [customerId]);
  const balanceBeforeApi = toApiMoneyString(before.rows[0]?.balance || 0);
  const result = await query(
    "UPDATE customers SET balance = balance + $2 WHERE id = $1 RETURNING *",
    [customerId, toApiMoneyString(value)]
  );
  const customer = rowToCustomer(result.rows[0]);
  await recordWalletLedgerEntry({
    customerId,
    type: "admin_add",
    amountApi: value,
    balanceBeforeApi,
    balanceAfterApi: customer?.balance || 0,
    sourceType: "manual_recharge",
    sourceId: customerId,
    remark: `后台加款：$ API ${Number(value).toFixed(2)}`,
    idempotencyKey: `manual_recharge:${customerId}:${Date.now()}`,
  });
  return publicCustomer(customer);
}

export async function createRechargeOrder({ customerId, amount, paymentMethod = "wechat", paymentRef = "", purchaseType = "balance_recharge", packageId = "", packageName = "", quotaText = "", validDays = null }) {
  const paymentAmountRmb = toRmbMoneyString(amount);
  if (!customerId || decimalCompare(paymentAmountRmb, "0", 2) <= 0) {
    return { error: "充值金额无效" };
  }

  const packagePayload = extractPackagePayload({ purchaseType, packageId, packageName, quotaText, validDays });
  const isPackageOrder = Boolean(packagePayload);
  const creditedAmountApi = isPackageOrder ? "0.000000" : calculateRechargeCreditApi(paymentAmountRmb, DEFAULT_RECHARGE_RATE);
  const legacyAmount = isPackageOrder ? paymentAmountRmb : creditedAmountApi;
  const id = makeId("rch");
  const outTradeNo = `flow_${id}`;

  if (!hasDatabase()) {
    if (!store.rechargeOrders) store.rechargeOrders = [];
    const order = {
      id,
      customerId,
      outTradeNo,
      amount: toNumber(legacyAmount),
      amountApi: toNumber(creditedAmountApi),
      creditedAmountApi: toNumber(creditedAmountApi),
      paymentAmountRmb: toNumber(paymentAmountRmb),
      rechargeRate: toNumber(DEFAULT_RECHARGE_RATE),
      rechargeRateText: `¥1 = $ API ${DEFAULT_RECHARGE_RATE}`,
      currency: "$ API",
      paymentCurrency: "CNY",
      creditCurrency: "$ API",
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
    await createPackageOrderForRecharge({
      order,
      packagePayload,
      metadata: { paymentRef, paymentAmountRmb, creditedAmountApi, rechargeRate: DEFAULT_RECHARGE_RATE },
    });
    return { order };
  }

  const result = await query(
    `INSERT INTO recharge_orders (
       id, customer_id, out_trade_no, amount, currency, payment_method, payment_ref,
       payment_amount_rmb, credited_amount_api, recharge_rate, payment_currency, credit_currency
     )
     VALUES ($1, $2, $3, $4, '$ API', $5, $6, $7, $8, $9, 'CNY', '$ API')
     RETURNING *`,
    [
      id,
      customerId,
      outTradeNo,
      legacyAmount,
      paymentMethod,
      String(paymentRef || "").slice(0, 800),
      paymentAmountRmb,
      creditedAmountApi,
      DEFAULT_RECHARGE_RATE,
    ]
  );

  const order = rowToRechargeOrder(result.rows[0]);
  await createPackageOrderForRecharge({
    order,
    packagePayload,
    metadata: { paymentRef, paymentAmountRmb, creditedAmountApi, rechargeRate: DEFAULT_RECHARGE_RATE },
  });
  return { order };
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

export async function updateRechargeOrderManualProof({
  orderId,
  customerId,
  paymentRef = "",
  providerTradeNo = "",
  gatewayPayload = "",
}) {
  if (!orderId) return { error: "缺少订单号" };

  if (!hasDatabase()) {
    const order = (store.rechargeOrders || []).find((item) => item.id === orderId);
    if (!order) return { error: "订单不存在" };
    if (customerId && order.customerId !== customerId) return { error: "无权操作其他用户订单" };
    if (order.status === "approved") return { order: rowToRechargeOrder(order) };
    order.paymentRef = String(paymentRef || "").slice(0, 800) || order.paymentRef;
    order.providerTradeNo = String(providerTradeNo || "").slice(0, 160) || order.providerTradeNo;
    order.gatewayPayload = String(gatewayPayload || "").slice(0, 5000) || order.gatewayPayload;
    return { order: rowToRechargeOrder(order) };
  }

  const params = [orderId];
  const checks = ["id = $1"];
  if (customerId) {
    params.push(customerId);
    checks.push(`customer_id = $${params.length}`);
  }
  params.push(String(paymentRef || "").slice(0, 800));
  params.push(String(providerTradeNo || "").slice(0, 160));
  params.push(String(gatewayPayload || "").slice(0, 5000));

  const result = await query(
    `UPDATE recharge_orders
     SET payment_ref = COALESCE(NULLIF($${params.length - 2}, ''), payment_ref),
         provider_trade_no = COALESCE(NULLIF($${params.length - 1}, ''), provider_trade_no),
         gateway_payload = COALESCE(NULLIF($${params.length}, ''), gateway_payload)
     WHERE ${checks.join(" AND ")}
     RETURNING *`,
    params
  );
  if (!result.rows[0]) return { error: "订单不存在或无权限" };
  return { order: rowToRechargeOrder(result.rows[0]) };
}

export async function updateRechargeOrderGatewayPayload({
  orderId,
  customerId,
  providerTradeNo = "",
  gatewayPayload = "",
}) {
  if (!orderId) return { error: "缺少订单号" };

  if (!hasDatabase()) {
    const order = (store.rechargeOrders || []).find((item) => item.id === orderId);
    if (!order) return { error: "订单不存在" };
    if (customerId && order.customerId !== customerId) return { error: "无权操作其他用户订单" };
    order.providerTradeNo = String(providerTradeNo || "").slice(0, 160) || order.providerTradeNo;
    order.gatewayPayload = String(gatewayPayload || "").slice(0, 5000) || order.gatewayPayload;
    return { order: rowToRechargeOrder(order) };
  }

  const params = [orderId];
  const checks = ["id = $1"];
  if (customerId) {
    params.push(customerId);
    checks.push(`customer_id = $${params.length}`);
  }
  params.push(String(providerTradeNo || "").slice(0, 160));
  params.push(String(gatewayPayload || "").slice(0, 5000));

  const result = await query(
    `UPDATE recharge_orders
     SET provider_trade_no = COALESCE(NULLIF($${params.length - 1}, ''), provider_trade_no),
         gateway_payload = COALESCE(NULLIF($${params.length}, ''), gateway_payload)
     WHERE ${checks.join(" AND ")}
     RETURNING *`,
    params
  );
  if (!result.rows[0]) return { error: "订单不存在或无权限" };
  return { order: rowToRechargeOrder(result.rows[0]) };
}

export async function approveRechargeOrder({ orderId, approvedBy = "admin" }) {
  if (!orderId) return { error: "缺少订单号" };

  if (!hasDatabase()) {
    const order = (store.rechargeOrders || []).find((item) => item.id === orderId);
    if (!order) return { error: "订单不存在" };
    if (order.status !== "pending") return { error: "订单已处理" };
    const customer = store.customers.find((item) => item.id === order.customerId);
    if (!customer) return { error: "用户不存在" };
    const packageOrder = await getPackageOrderByRechargeOrderId(order.id);
    const creditAmountApi = toApiMoneyString(order.creditedAmountApi ?? order.amountApi ?? order.amount ?? 0);
    const balanceBeforeApi = toApiMoneyString(customer.balance || 0);
    if (!packageOrder) {
      customer.balance = toNumber(decimalAdd(balanceBeforeApi, creditAmountApi));
    }
    order.status = "approved";
    order.approvedAt = new Date().toISOString();
    order.approvedBy = approvedBy;
    if (packageOrder) {
      await activatePackageOrderForRecharge({ order, paidAt: order.approvedAt, approvedBy });
    } else {
      await recordWalletLedgerEntry({
        customerId: order.customerId,
        type: "recharge",
        amountApi: creditAmountApi,
        balanceBeforeApi,
        balanceAfterApi: customer.balance,
        sourceType: "recharge_order",
        sourceId: order.id,
        adminId: approvedBy,
        remark: `充值到账：¥${Number(order.paymentAmountRmb ?? order.amount).toFixed(2)} → $ API ${Number(creditAmountApi).toFixed(2)}`,
        idempotencyKey: `recharge:${order.id}:credit`,
      });
    }
    logActivity({
      customerId: order.customerId,
      action: packageOrder ? "package_activated" : "recharge_approved",
      category: "payment",
      detail: packageOrder ? `套餐已开通: ${packageOrder.packageName || packageOrder.packageId} · ¥${Number(order.paymentAmountRmb ?? order.amount).toFixed(2)}` : `充值到账: ${order.paymentMethod} ¥${Number(order.paymentAmountRmb ?? order.amount).toFixed(2)} → $ API ${Number(creditAmountApi).toFixed(2)}`,
      amount: packageOrder ? order.amount : creditAmountApi,
    });
    import("@/lib/referrals/store")
      .then(({ handlePaidReferralOrder }) => handlePaidReferralOrder({ orderId: order.id, userId: order.customerId, paidAmountCny: order.amount }))
      .catch(() => {});
    import("@/lib/titles/recalculate-user-titles")
      .then(({ markUserTitlesDirty }) => markUserTitlesDirty(order.customerId, "recharge_approved"))
      .catch(() => {});
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
       SET balance = c.balance + CASE
         WHEN EXISTS (SELECT 1 FROM package_orders po WHERE po.recharge_order_id = changed_order.id) THEN 0
         ELSE COALESCE(changed_order.credited_amount_api, changed_order.amount)
       END
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
  const packageOrder = await activatePackageOrderForRecharge({ order: approvedOrder, paidAt: approvedOrder.approvedAt, approvedBy });
  const updatedCustomerForLedger = rowToCustomer(result.rows[0].customer);
  const approvedCreditApi = toApiMoneyString(approvedOrder.creditedAmountApi || approvedOrder.amountApi || approvedOrder.amount || 0);
  if (!packageOrder) {
    await recordWalletLedgerEntry({
      customerId: approvedOrder.customerId,
      type: "recharge",
      amountApi: approvedCreditApi,
      balanceBeforeApi: decimalSubtract(updatedCustomerForLedger.balance || 0, approvedCreditApi),
      balanceAfterApi: updatedCustomerForLedger.balance || 0,
      sourceType: "recharge_order",
      sourceId: approvedOrder.id,
      adminId: approvedBy,
      remark: `充值到账：¥${Number(approvedOrder.paymentAmountRmb || 0).toFixed(2)} → $ API ${Number(approvedCreditApi).toFixed(2)}`,
      idempotencyKey: `recharge:${approvedOrder.id}:credit`,
    });
  }
  logActivity({
    customerId: approvedOrder.customerId,
    action: packageOrder ? "package_activated" : "recharge_approved",
    category: "payment",
    detail: packageOrder ? `套餐已开通: ${packageOrder.packageName || packageOrder.packageId} · ¥${Number(approvedOrder.paymentAmountRmb || approvedOrder.amount).toFixed(2)}` : `充值到账: ${approvedOrder.paymentMethod} ¥${Number(approvedOrder.paymentAmountRmb || 0).toFixed(2)} → $ API ${Number(approvedCreditApi).toFixed(2)}`,
    amount: packageOrder ? approvedOrder.paymentAmountRmb : approvedCreditApi,
  });
  import("@/lib/referrals/store")
    .then(({ handlePaidReferralOrder }) => handlePaidReferralOrder({ orderId: approvedOrder.id, userId: approvedOrder.customerId, paidAmountCny: approvedOrder.paymentAmountRmb || approvedOrder.amount }))
    .catch(() => {});
  import("@/lib/titles/recalculate-user-titles")
    .then(({ markUserTitlesDirty }) => markUserTitlesDirty(approvedOrder.customerId, "recharge_approved"))
    .catch(() => {});

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

  const paidAmountRmb = toRmbMoneyString(amount);
  if (decimalCompare(paidAmountRmb, "0", 2) <= 0) {
    return { error: "支付金额无效" };
  }

  if (!hasDatabase()) {
    const order = (store.rechargeOrders || []).find((item) => item.outTradeNo === outTradeNo);
    if (!order) return { error: "订单不存在" };
    if (order.status === "approved") {
      return { order: rowToRechargeOrder(order), customer: await getCustomer(order.customerId) };
    }
    if (decimalCompare(toRmbMoneyString(order.paymentAmountRmb ?? order.amount), paidAmountRmb, 2) !== 0) {
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
         AND COALESCE(t.payment_amount_rmb, t.amount) = $6::numeric(14, 2)
       RETURNING r.*, (SELECT t.status FROM target_order t) AS previous_status
     ),
     updated_customer AS (
       UPDATE customers c
       SET balance = c.balance + CASE
         WHEN changed_order.previous_status = 'pending'
          AND NOT EXISTS (SELECT 1 FROM package_orders po WHERE po.recharge_order_id = changed_order.id)
         THEN COALESCE(changed_order.credited_amount_api, changed_order.amount)
         ELSE 0
       END
       FROM changed_order
       WHERE c.id = changed_order.customer_id
       RETURNING c.*
     )
     SELECT row_to_json(changed_order) AS order, row_to_json(updated_customer) AS customer
     FROM changed_order, updated_customer`,
    [outTradeNo, providerTradeNo, rawPayload, paidAt, approvedBy, paidAmountRmb]
  );
  if (!result.rows[0]) return { error: "订单不存在、金额不匹配或已失效" };

  const paidOrder = rowToRechargeOrder(result.rows[0].order);
  const paidPackageOrder = await activatePackageOrderForRecharge({ order: paidOrder, paidAt: paidOrder.paidAt || paidOrder.approvedAt, approvedBy });
  const paidCustomer = rowToCustomer(result.rows[0].customer);
  const previousStatus = result.rows[0].order?.previous_status || "";
  const paidCreditApi = toApiMoneyString(paidOrder.creditedAmountApi || paidOrder.amountApi || paidOrder.amount || 0);
  if (!paidPackageOrder && previousStatus === "pending") {
    await recordWalletLedgerEntry({
      customerId: paidOrder.customerId,
      type: "recharge",
      amountApi: paidCreditApi,
      balanceBeforeApi: decimalSubtract(paidCustomer.balance || 0, paidCreditApi),
      balanceAfterApi: paidCustomer.balance || 0,
      sourceType: "recharge_order",
      sourceId: paidOrder.id,
      adminId: approvedBy,
      remark: `充值到账：¥${Number(paidOrder.paymentAmountRmb || 0).toFixed(2)} → $ API ${Number(paidCreditApi).toFixed(2)}`,
      idempotencyKey: `recharge:${paidOrder.id}:credit`,
    });
  }
  import("@/lib/referrals/store")
    .then(({ handlePaidReferralOrder }) => handlePaidReferralOrder({ orderId: paidOrder.id, userId: paidOrder.customerId, paidAmountCny: paidOrder.paymentAmountRmb || paidOrder.amount }))
    .catch(() => {});
  import("@/lib/titles/recalculate-user-titles")
    .then(({ markUserTitlesDirty }) => markUserTitlesDirty(paidOrder.customerId, "recharge_paid"))
    .catch(() => {});

  return {
    order: paidOrder,
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
	    match.customer.balance = Number(Math.max(0, match.customer.balance - cost).toFixed(6));
	    match.customer.totalSpend = Number((match.customer.totalSpend + cost).toFixed(6));
    await recordApiKeyLimitUsage(match.apiKey.id, { costCny: cost, tokens });
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
    import("@/lib/titles/recalculate-user-titles")
      .then(({ markUserTitlesDirty }) => markUserTitlesDirty(match.customer.id, "api_call"))
      .catch(() => {});
    return publicCustomer(match.customer);
  }

	  await query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", [match.apiKey.id]);
	  const updatedCustomer = await query(
	    "UPDATE customers SET balance = GREATEST(0, balance - $2), total_spend = total_spend + $2 WHERE id = $1 RETURNING *",
	    [match.customer.id, cost]
	  );
  await query(
    `INSERT INTO calls
      (id, customer_id, api_key_id, request_id, customer, endpoint, requested_model,
       routed_model, public_model_id, actual_model_id, provider, upstream_channel,
       upstream_provider, upstream_status, latency_ms, first_token_ms, status, prompt_tokens,
       completion_tokens, tokens, input_tokens, output_tokens, total_tokens, cost,
       sell_price_cny, user_charge, upstream_cost_cny, upstream_cost, profit_cny, profit,
       profit_margin, billing_mode, route_strategy, route_attempts, is_stream, error_code, error_message, source_type, source_name, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
       $29, $30, $31, $32, $33, $34, $35, $36, $37, 'API_CONSUME', 'API 调用消费', $38)`,
    [
      makeId("call"),
      match.customer.id,
      match.apiKey.id,
      record.requestId || "",
      match.customer.company || match.customer.email,
      record.endpoint || "",
      record.requestedModel || "",
      record.routedModel || "",
      record.publicModelId || "",
      record.actualModelId || "",
      record.provider || "",
      record.upstreamChannel || "",
      record.upstreamProvider || "",
      Number(record.upstreamStatus || 0),
      Number(record.latencyMs || 0),
      Number(record.firstTokenMs || record.first_token_ms || 0),
      Number(record.status || 0),
      promptTokens,
      completionTokens,
      tokens,
      Number(record.inputTokens || promptTokens || 0),
      Number(record.outputTokens || completionTokens || 0),
      Number(record.totalTokens || tokens || 0),
      cost,
      Number(record.sellPriceCny ?? cost ?? 0),
      Number(record.userCharge ?? record.sellPriceCny ?? cost ?? 0),
      Number(record.upstreamCostCny || 0),
      Number(record.upstreamCost ?? (record.upstreamCostCny || 0)),
      Number(record.profitCny || 0),
      Number(record.profit ?? (record.profitCny || 0)),
      Number(record.profitMargin || 0),
      record.billingMode || "token_multiplier",
      record.routeStrategy || "",
      Number(record.routeAttempts || 0),
      Boolean(record.isStream || record.is_stream),
      record.errorCode || record.error_code || "",
      String(record.errorMessage || record.error_message || "").slice(0, 500),
      `API 调用消费：模型 ${record.requestedModel || record.publicModelId || record.routedModel || "unknown"}，API Key ${match.apiKey.label || "未命名密钥"}，请求 ${record.requestId || requestId || ""}，消耗 $${Number(record.sellPriceCny ?? record.userCharge ?? actualCost ?? 0).toFixed(6)} API`,
    ]
  );
  if (cost > 0 || tokens > 0) {
    await recordApiKeyLimitUsage(match.apiKey.id, { costCny: cost, tokens });
  }

  logActivity({
    customerId: match.customer.id,
    email: match.customer.email,
    action: "api_call",
    category: "api",
    detail: `${record.requestedModel || "unknown"} → ${record.routedModel || "unknown"} | ${tokens} tokens`,
    amount: cost,
  });
  import("@/lib/titles/recalculate-user-titles")
    .then(({ markUserTitlesDirty }) => markUserTitlesDirty(match.customer.id, "api_call"))
    .catch(() => {});

  return publicCustomer(rowToCustomer(updatedCustomer.rows[0]));
}

export async function reserveBalanceByToken(token, reserveCost, quotaEstimate = {}) {
  const match = await findCustomerByToken(token);
  if (!match) return { error: "API Key 无效" };
  const customerStatus = String(match.customer?.status || "active").toLowerCase();
  if (!["", "active"].includes(customerStatus)) {
    const balanceApi = clampApiMoney(decimalAdd(match.customer?.balance || 0, await getTemporaryCreditBalance(match.customer.id)));
    return {
      error: "钱包状态异常，暂时无法发起 API 调用",
      code: "WALLET_FROZEN",
      apiBalance: balanceApi,
      apiBalanceDisplay: `$ API ${Number(balanceApi || 0).toFixed(2)}`,
    };
  }

  const costApi = clampApiMoney(reserveCost);
  const estimatedTokens = Math.max(0, Math.floor(Number(quotaEstimate.tokens || 0)));
  const quotaCheck = await checkApiKeyLimitObject(match.apiKey, {
    costCny: toNumber(costApi),
    tokens: estimatedTokens,
  });
  if (!quotaCheck.ok) return { error: quotaCheck.error, quotaExceeded: true, ...quotaCheck };
  if (decimalCompare(costApi, "0") <= 0 && estimatedTokens <= 0) {
    return { ...match, reservedCost: toApiMoneyString(0), reservedPackageTokens: 0, packageReservations: [] };
  }

  const packageReservation = await reserveUserPackageTokens(match.customer.id, estimatedTokens);
  const reservedPackageTokens = Math.max(0, Math.floor(Number(packageReservation.reservedTokens || 0)));
  const uncoveredTokens = Math.max(0, estimatedTokens - reservedPackageTokens);
  const cashReserveCost = estimatedTokens > 0
    ? clampApiMoney(decimalMultiplyRatio(costApi, uncoveredTokens, estimatedTokens))
    : costApi;
  const temporaryBalanceApi = clampApiMoney(await getTemporaryCreditBalance(match.customer.id));
  const paidBalanceApi = clampApiMoney(match.customer.balance || 0);
  const availableBalanceApi = clampApiMoney(decimalAdd(paidBalanceApi, temporaryBalanceApi));
  if (decimalCompare(availableBalanceApi, cashReserveCost) < 0) {
    await refundUserPackageTokens(packageReservation.reservations);
    return {
      error: "钱包余额不足，请充值后继续使用",
      code: "INSUFFICIENT_BALANCE",
      apiBalance: availableBalanceApi,
      apiBalanceDisplay: `$ API ${Number(availableBalanceApi || 0).toFixed(2)}`,
      requiredApi: cashReserveCost,
      requiredApiDisplay: `$ API ${Number(cashReserveCost || 0).toFixed(2)}`,
    };
  }
  const temporaryUsed = await consumeTemporaryCredits(match.customer.id, cashReserveCost);
  const paidCost = clampApiMoney(decimalSubtract(cashReserveCost, temporaryUsed));

  if (!hasDatabase()) {
    match.customer.balance = toNumber(decimalSubtract(match.customer.balance || 0, paidCost));
    match.customer.totalSpend = toNumber(decimalAdd(match.customer.totalSpend || 0, costApi));
    match.apiKey.lastUsedAt = new Date().toISOString();
    invalidateApiKeyCache(token);
    invalidateBillingCaches(match.customer.id);
    return {
      ...match,
      reservedCost: costApi,
      reservedTemporaryCost: temporaryUsed,
      reservedPaidCost: paidCost,
      reservedPackageTokens,
      packageReservations: packageReservation.reservations,
    };
  }

  await query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", [match.apiKey.id]);
  const result = await query(
    `UPDATE customers
     SET balance = balance - $2,
         total_spend = total_spend + $3
     WHERE id = $1 AND balance >= $2
     RETURNING *`,
    [match.customer.id, paidCost, costApi]
  );

  if (!result.rows[0]) {
    await refundUserPackageTokens(packageReservation.reservations);
    if (decimalCompare(temporaryUsed, "0") > 0) await refundTemporaryCredit(match.customer.id, temporaryUsed);
    return {
      error: "钱包余额不足，请充值后继续使用",
      code: "INSUFFICIENT_BALANCE",
      apiBalance: availableBalanceApi,
      apiBalanceDisplay: `$ API ${Number(availableBalanceApi || 0).toFixed(2)}`,
      requiredApi: cashReserveCost,
      requiredApiDisplay: `$ API ${Number(cashReserveCost || 0).toFixed(2)}`,
    };
  }
  invalidateApiKeyCache(token);
  invalidateBillingCaches(match.customer.id);
  return {
    apiKey: match.apiKey,
    customer: rowToCustomer(result.rows[0]),
    reservedCost: costApi,
    reservedTemporaryCost: temporaryUsed,
    reservedPaidCost: paidCost,
    reservedPackageTokens,
    packageReservations: packageReservation.reservations,
  };
}

export async function beginApiRequestIdempotency(customerId = "", requestId = "") {
  const cleanCustomerId = String(customerId || "").trim();
  const cleanRequestId = String(requestId || "").trim();
  if (!cleanCustomerId || !cleanRequestId) return { ok: true, duplicate: false };
  const key = `${cleanCustomerId}:${cleanRequestId}`;

  if (!hasDatabase()) {
    if (!globalThis.__FLOWAPI_API_REQUEST_IDEMPOTENCY__) {
      globalThis.__FLOWAPI_API_REQUEST_IDEMPOTENCY__ = new Set();
    }
    if (globalThis.__FLOWAPI_API_REQUEST_IDEMPOTENCY__.has(key)) {
      return { ok: false, duplicate: true };
    }
    globalThis.__FLOWAPI_API_REQUEST_IDEMPOTENCY__.add(key);
    return { ok: true, duplicate: false };
  }

  const result = await query(
    `INSERT INTO api_request_idempotency (id, customer_id, request_id, status)
     VALUES ($1, $2, $3, 'started')
     ON CONFLICT (customer_id, request_id) DO NOTHING
     RETURNING id`,
    [makeId("idem"), cleanCustomerId, cleanRequestId]
  );
  return { ok: Boolean(result.rows[0]), duplicate: !result.rows[0] };
}

export async function finalizeReservedCallByToken(token, record, reservation = 0) {
  const match = await findCustomerByToken(token);
  if (!match) return null;

  const requestId = String(record?.requestId || "").trim();
  const finalizeKey = requestId ? `${match.customer.id}:${requestId}` : "";
  if (requestId) {
    if (!hasDatabase()) {
      const existing = store.calls.find((call) => call.customerId === match.customer.id && call.requestId === requestId);
      if (existing) return publicCustomer(match.customer);
    } else {
      const existing = await query(
        "SELECT id FROM calls WHERE customer_id = $1 AND request_id = $2 LIMIT 1",
        [match.customer.id, requestId]
      );
      if (existing.rows[0]) return publicCustomer(match.customer);
    }
  }

  if (finalizeKey) {
    if (!globalThis.__FLOWAPI_FINALIZING_REQUEST_IDS__) {
      globalThis.__FLOWAPI_FINALIZING_REQUEST_IDS__ = new Set();
    }
    if (globalThis.__FLOWAPI_FINALIZING_REQUEST_IDS__.has(finalizeKey)) {
      return publicCustomer(match.customer);
    }
    globalThis.__FLOWAPI_FINALIZING_REQUEST_IDS__.add(finalizeKey);
  }

  let dbFinalizationLocked = false;
  let finalizationCompleted = false;
  if (finalizeKey && hasDatabase()) {
    const lock = await query(
      `INSERT INTO call_finalizations (settlement_key, customer_id, request_id, status, billing_status, delivery_confirmed_at, error_reason)
       VALUES ($1, $2, $3, 'processing', $4, CASE WHEN $5 THEN NOW() ELSE NULL END, $6)
       ON CONFLICT (settlement_key) DO NOTHING
       RETURNING settlement_key`,
      [
        finalizeKey,
        match.customer.id,
        requestId,
        String(record.billingStatus || record.billing_status || "processing"),
        String(record.deliveryStatus || record.delivery_status || "") === "success_completed",
        String(record.errorMessage || record.error_message || "").slice(0, 500),
      ]
    );
    if (!lock.rows[0]) {
      globalThis.__FLOWAPI_FINALIZING_REQUEST_IDS__?.delete(finalizeKey);
      return publicCustomer(match.customer);
    }
    dbFinalizationLocked = true;
  }

  try {
  const actualCost = clampApiMoney(record.cost || 0);
  const actualCostNumber = toNumber(actualCost);
  const balanceBefore = clampApiMoney(match.customer.balance || 0);
  const reserved = clampApiMoney(typeof reservation === "object" ? reservation.reservedCost : reservation || 0);
  const reservedTemporaryCost = clampApiMoney(typeof reservation === "object" ? reservation.reservedTemporaryCost : 0);
  const inferredReservedPaidCost = decimalSubtract(reserved, reservedTemporaryCost);
  const reservedPaidCost = clampApiMoney(
    typeof reservation === "object"
      ? (reservation.reservedPaidCost ?? (decimalCompare(inferredReservedPaidCost, "0") < 0 ? 0 : inferredReservedPaidCost))
      : reservation || 0
  );
  const reservedPackageTokens = Math.max(0, Math.floor(Number(typeof reservation === "object" ? reservation.reservedPackageTokens : 0)));
  const packageReservations = Array.isArray(reservation?.packageReservations) ? reservation.packageReservations : [];
  const promptTokens = Number(record.promptTokens || 0);
  const completionTokens = Number(record.completionTokens || 0);
  const tokens = Number(record.tokens || promptTokens + completionTokens || 0);
  const packageTokensUsed = Math.min(tokens, reservedPackageTokens);
  const packageTokenRefund = Math.max(0, reservedPackageTokens - packageTokensUsed);
  const cashActualCost = tokens > 0
    ? clampApiMoney(decimalMultiplyRatio(actualCost, Math.max(0, tokens - packageTokensUsed), tokens))
    : reservedPackageTokens > 0 ? toApiMoneyString(0) : actualCost;
  const cashReserved = clampApiMoney(decimalAdd(reservedTemporaryCost, reservedPaidCost));
  const cashDelta = toApiMoneyString(decimalSubtract(cashActualCost, cashReserved));
  const spendDelta = toApiMoneyString(decimalSubtract(actualCost, reserved));
  const shouldGrantUsageCredit = Number(record.status || 0) >= 200
    && Number(record.status || 0) < 300
    && (completionTokens > 0 || record.grantUsageCredit === true);
  const spendRefund = decimalCompare(spendDelta, "0") < 0 ? clampApiMoney(decimalSubtract("0", spendDelta)) : toApiMoneyString(0);
  const spendExtra = decimalCompare(spendDelta, "0") > 0 ? clampApiMoney(spendDelta) : toApiMoneyString(0);

  let packageTokenRefundApplied = false;
  const refundPackageTokensOnce = async () => {
    if (packageTokenRefund <= 0 || packageTokenRefundApplied) return 0;
    packageTokenRefundApplied = true;
    return refundUserPackageTokens(packageReservations, packageTokenRefund);
  };

  await refundPackageTokensOnce();

  let temporaryRefund = toApiMoneyString(0);
  let paidRefund = toApiMoneyString(0);
  if (decimalCompare(cashDelta, "0") < 0) {
    const refund = clampApiMoney(decimalSubtract("0", cashDelta));
    temporaryRefund = decimalMin(refund, reservedTemporaryCost);
    if (decimalCompare(temporaryRefund, "0") > 0) {
      await refundTemporaryCredit(match.customer.id, temporaryRefund);
    }
    paidRefund = clampApiMoney(decimalSubtract(refund, temporaryRefund));
  }

  let extraTemporaryUsed = toApiMoneyString(0);
  let paidDeltaRequested = toApiMoneyString(0);
  if (decimalCompare(cashDelta, "0") > 0) {
    extraTemporaryUsed = await consumeTemporaryCredits(match.customer.id, cashDelta);
    paidDeltaRequested = clampApiMoney(decimalSubtract(cashDelta, extraTemporaryUsed));
  }

  let paidDeltaApplied = toApiMoneyString(0);
  let paidDeltaShortfall = toApiMoneyString(0);
  let balanceAfter = balanceBefore;
  let updatedCustomer = null;

  if (!hasDatabase()) {
    paidDeltaApplied = decimalMin(balanceBefore, paidDeltaRequested);
    paidDeltaShortfall = clampApiMoney(decimalSubtract(paidDeltaRequested, paidDeltaApplied));

    balanceAfter = clampApiMoney(decimalAdd(balanceAfter, paidRefund));
    balanceAfter = clampApiMoney(decimalSubtract(balanceAfter, paidDeltaApplied));
    match.customer.balance = toNumber(balanceAfter);

    let totalSpendAfter = clampApiMoney(match.customer.totalSpend || 0);
    totalSpendAfter = clampApiMoney(decimalSubtract(totalSpendAfter, spendRefund));
    totalSpendAfter = clampApiMoney(decimalAdd(totalSpendAfter, spendExtra));
    match.customer.totalSpend = toNumber(totalSpendAfter);
  } else {
    if (decimalCompare(paidDeltaRequested, "0") > 0) {
      const currentCustomer = await query("SELECT * FROM customers WHERE id = $1 LIMIT 1", [match.customer.id]);
      paidDeltaApplied = decimalMin(rowToCustomer(currentCustomer.rows[0])?.balance || 0, paidDeltaRequested);
      paidDeltaShortfall = clampApiMoney(decimalSubtract(paidDeltaRequested, paidDeltaApplied));
    }

    const applyCustomerDelta = async ({ balanceDelta, spendDelta: nextSpendDelta, requireBalance = "0" }) => {
      if (decimalCompare(requireBalance, "0") > 0) {
        return query(
          `UPDATE customers
           SET balance = balance + $2,
               total_spend = GREATEST(0, total_spend + $3)
           WHERE id = $1 AND balance >= $4
           RETURNING *`,
          [match.customer.id, balanceDelta, nextSpendDelta, requireBalance]
        );
      }
      return query(
        `UPDATE customers
         SET balance = balance + $2,
             total_spend = GREATEST(0, total_spend + $3)
         WHERE id = $1
         RETURNING *`,
        [match.customer.id, balanceDelta, nextSpendDelta]
      );
    };

    let balanceDelta = toApiMoneyString(decimalSubtract(paidRefund, paidDeltaApplied));
    const spendDeltaForCustomer = toApiMoneyString(decimalSubtract(spendExtra, spendRefund));
    let result = await applyCustomerDelta({
      balanceDelta,
      spendDelta: spendDeltaForCustomer,
      requireBalance: paidDeltaApplied,
    });

    if (!result.rows[0] && decimalCompare(paidDeltaApplied, "0") > 0) {
      paidDeltaShortfall = clampApiMoney(decimalAdd(paidDeltaShortfall, paidDeltaApplied));
      paidDeltaApplied = toApiMoneyString(0);
      balanceDelta = toApiMoneyString(decimalSubtract(paidRefund, paidDeltaApplied));
      result = await applyCustomerDelta({
        balanceDelta,
        spendDelta: spendDeltaForCustomer,
        requireBalance: toApiMoneyString(0),
      });
    }

    updatedCustomer = result;
    balanceAfter = clampApiMoney(rowToCustomer(updatedCustomer.rows[0])?.balance || 0);
  }

  const temporaryConsumedApi = clampApiMoney(decimalSubtract(decimalAdd(reservedTemporaryCost, extraTemporaryUsed), temporaryRefund));
  const walletConsumedPaidApi = clampApiMoney(decimalSubtract(decimalAdd(reservedPaidCost, paidDeltaApplied), paidRefund));
  const ledgerBalanceBeforeApi = clampApiMoney(decimalAdd(balanceBefore, reservedPaidCost));
  const resolvedDeliveryStatus = String(
    record.deliveryStatus
    || record.delivery_status
    || (Number(record.status || 0) >= 200 && Number(record.status || 0) < 300 ? "success_completed" : "")
  ).slice(0, 80);
  const defaultBillingStatus = decimalCompare(actualCost, "0") > 0 ? "success_completed" : "not_billed";
  const resolvedBillingStatus = decimalCompare(paidDeltaShortfall, "0") > 0
    ? "wallet_shortfall"
    : String(record.billingStatus || record.billing_status || defaultBillingStatus).slice(0, 80);
  const resolvedBillingAlert = decimalCompare(paidDeltaShortfall, "0") > 0
    ? "wallet_shortfall_after_finalize"
    : String(record.billingAlert || "").trim();
  const relayAuditRecord = {
    ...record,
    billingStatus: resolvedBillingStatus,
    billing_status: resolvedBillingStatus,
    billingAlert: resolvedBillingAlert,
    deliveryStatus: resolvedDeliveryStatus,
    delivery_status: resolvedDeliveryStatus,
  };

  if (actualCostNumber > 0 || tokens > 0) {
    await recordWalletLedgerEntry({
      customerId: match.customer.id,
      type: "consume",
      amountApi: decimalSubtract("0", walletConsumedPaidApi),
      balanceBeforeApi: ledgerBalanceBeforeApi,
      balanceAfterApi: balanceAfter,
      sourceType: "api_call",
      sourceId: requestId || record.requestId || "",
      modelName: record.requestedModel || record.publicModelId || record.routedModel || "",
      requestId,
      remark: `API 消费：模型 ${record.requestedModel || record.publicModelId || record.routedModel || "unknown"}，请求 ${requestId || ""}`,
      idempotencyKey: `consume:${match.customer.id}:${requestId || finalizeKey || makeId("no_req")}`,
      metadata: {
        tokens,
        actualCost,
        cashActualCost,
        reserved,
        temporaryConsumedApi,
        walletConsumedPaidApi,
        shortfallApi: paidDeltaShortfall,
      },
    });
  }

  const deductionBreakdown = Array.isArray(record.deductionBreakdown) && record.deductionBreakdown.length
    ? record.deductionBreakdown
    : packageTokensUsed > 0
      ? [
          { walletType: "package_quota", walletName: "套餐额度", tokensDeducted: packageTokensUsed },
          ...(decimalCompare(temporaryConsumedApi, "0") > 0 ? [{ walletType: "member_bonus", walletName: "赠送余额", amountCnyDeducted: toNumber(temporaryConsumedApi) }] : []),
          ...(decimalCompare(walletConsumedPaidApi, "0") > 0 ? [{ walletType: "balance_credit", walletName: "充值余额", amountCnyDeducted: toNumber(walletConsumedPaidApi) }] : []),
        ]
      : decimalCompare(temporaryConsumedApi, "0") > 0
      ? [
          { walletType: "member_bonus", walletName: "赠送余额", amountCnyDeducted: toNumber(temporaryConsumedApi) },
          ...(decimalCompare(walletConsumedPaidApi, "0") > 0 ? [{ walletType: "balance_credit", walletName: "充值余额", amountCnyDeducted: toNumber(walletConsumedPaidApi) }] : []),
        ]
      : buildFallbackDeductionBreakdown({ costCny: actualCostNumber || toNumber(walletConsumedPaidApi), tokens, walletType: "balance_credit" });

  if (!hasDatabase()) {
    store.calls.unshift({
      id: makeId("call"),
      customerId: match.customer.id,
      apiKeyId: match.apiKey.id,
      customer: match.customer.company,
      createdAt: new Date().toISOString(),
      ...record,
      requestId,
      cost: actualCostNumber,
      tokens,
      billingStatus: resolvedBillingStatus,
      billing_status: resolvedBillingStatus,
      billingAlert: resolvedBillingAlert,
      deliveryStatus: resolvedDeliveryStatus,
      delivery_status: resolvedDeliveryStatus,
      deductionBreakdown,
    });
    store.calls = store.calls.slice(0, 200);
    if (actualCostNumber > 0 || tokens > 0) {
      await recordApiKeyLimitUsage(match.apiKey.id, { costCny: actualCostNumber, tokens });
    }
    if (shouldGrantUsageCredit) await grantDailyUsageCredit(match.customer.id);
    await recordRelayRequestAudit(buildRelayAuditSnapshot({
      match,
      record: relayAuditRecord,
      reservation,
      balanceBefore: toNumber(ledgerBalanceBeforeApi),
      balanceAfter: toNumber(balanceAfter),
      actualCost: actualCostNumber,
      promptTokens,
      completionTokens,
      tokens,
    })).catch((error) => {
      console.error("[flowapi] record relay audit failed:", error);
    });
    import("@/lib/titles/recalculate-user-titles")
      .then(({ markUserTitlesDirty }) => markUserTitlesDirty(match.customer.id, "api_call_finalized"))
      .catch(() => {});
    finalizationCompleted = true;
    invalidateApiKeyCache(token);
    invalidateBillingCaches(match.customer.id);
    return publicCustomer(match.customer);
  }

  await query(
    `INSERT INTO calls
      (id, customer_id, api_key_id, request_id, customer, endpoint, requested_model,
       routed_model, public_model_id, actual_model_id, provider, upstream_channel,
       upstream_provider, upstream_status, latency_ms, first_token_ms, status, prompt_tokens,
       completion_tokens, tokens, input_tokens, output_tokens, total_tokens, cost,
       sell_price_cny, user_charge, upstream_cost_cny, upstream_cost, profit_cny, profit,
       profit_margin, billing_mode, route_strategy, route_attempts, is_stream, error_code, error_message,
       delivery_status, billing_status, related_request_id, source_type, source_name, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
       $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, 'API_CONSUME', 'API 调用消费', $41)`,
    [
      makeId("call"),
      match.customer.id,
      match.apiKey.id,
      requestId,
      match.customer.company || match.customer.email,
      record.endpoint || "",
      record.requestedModel || "",
      record.routedModel || "",
      record.publicModelId || "",
      record.actualModelId || "",
      record.provider || "",
      record.upstreamChannel || "",
      record.upstreamProvider || "",
      Number(record.upstreamStatus || 0),
      Number(record.latencyMs || 0),
      Number(record.firstTokenMs || record.first_token_ms || 0),
      Number(record.status || 0),
      promptTokens,
      completionTokens,
      tokens,
      Number(record.inputTokens || promptTokens || 0),
      Number(record.outputTokens || completionTokens || 0),
      Number(record.totalTokens || tokens || 0),
      actualCostNumber,
      Number(record.sellPriceCny ?? actualCostNumber ?? 0),
      Number(record.userCharge ?? record.sellPriceCny ?? actualCostNumber ?? 0),
      Number(record.upstreamCostCny || 0),
      Number(record.upstreamCost ?? (record.upstreamCostCny || 0)),
      Number(record.profitCny || 0),
      Number(record.profit ?? (record.profitCny || 0)),
      Number(record.profitMargin || 0),
      record.billingMode || "token_multiplier",
      record.routeStrategy || "",
      Number(record.routeAttempts || 0),
      Boolean(record.isStream || record.is_stream),
      record.errorCode || record.error_code || "",
      String(record.errorMessage || record.error_message || "").slice(0, 500),
      resolvedDeliveryStatus,
      resolvedBillingStatus,
      String(record.relatedRequestId || record.related_request_id || record.requestId || requestId || "").slice(0, 160),
      `API 调用消费：模型 ${record.requestedModel || record.publicModelId || record.routedModel || "unknown"}，API Key ${match.apiKey.label || "未命名密钥"}，请求 ${record.requestId || requestId || ""}，消耗 $ API ${Number(actualCostNumber || 0).toFixed(6)}`,
    ]
  );
  if (actualCostNumber > 0 || tokens > 0) {
    await recordApiKeyLimitUsage(match.apiKey.id, { costCny: actualCostNumber, tokens });
  }

  if (shouldGrantUsageCredit) await grantDailyUsageCredit(match.customer.id);
  await recordRelayRequestAudit(buildRelayAuditSnapshot({
    match,
    record: relayAuditRecord,
    reservation,
    balanceBefore: toNumber(ledgerBalanceBeforeApi),
    balanceAfter: toNumber(balanceAfter),
    actualCost: actualCostNumber,
    promptTokens,
    completionTokens,
    tokens,
  })).catch((error) => {
    console.error("[flowapi] record relay audit failed:", error);
  });
  import("@/lib/titles/recalculate-user-titles")
    .then(({ markUserTitlesDirty }) => markUserTitlesDirty(match.customer.id, "api_call_finalized"))
    .catch(() => {});
  if (dbFinalizationLocked) {
    await query(
      `UPDATE call_finalizations
       SET status = 'finalized',
           billing_status = $2,
           delivery_confirmed_at = COALESCE(delivery_confirmed_at, CASE WHEN $3 THEN NOW() ELSE NULL END),
           settled_at = NOW(),
           error_reason = COALESCE(NULLIF($4, ''), error_reason),
           updated_at = NOW()
       WHERE settlement_key = $1`,
      [
        finalizeKey,
        resolvedBillingStatus,
        resolvedDeliveryStatus === "success_completed",
        String(record.errorMessage || record.error_message || "").slice(0, 500),
      ]
    );
  }
  finalizationCompleted = true;
  invalidateApiKeyCache(token);
  invalidateBillingCaches(match.customer.id);
  return publicCustomer(rowToCustomer(updatedCustomer.rows[0]));
  } finally {
    if (dbFinalizationLocked && !finalizationCompleted) {
      await query("DELETE FROM call_finalizations WHERE settlement_key = $1", [finalizeKey]).catch(() => {});
    }
    if (finalizeKey) {
      globalThis.__FLOWAPI_FINALIZING_REQUEST_IDS__?.delete(finalizeKey);
    }
  }
}

export async function getDashboard(customerId = "cus_demo") {
  return getCustomer(customerId);
}

// ==================== Admin functions ====================

export async function listCustomers() {
  if (hasDatabase()) {
    const r = await query("SELECT * FROM customers ORDER BY created_at DESC");
    if (r) return Promise.all(r.rows.map(async (row) => {
      const customer = rowToCustomer(row);
      const [keysResult, callsResult] = await Promise.all([
        query("SELECT * FROM api_keys WHERE customer_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC", [customer.id]),
        query(
          `SELECT
             COUNT(*) FILTER (WHERE created_at >= date_trunc('day', NOW())) AS today_reqs,
             COALESCE(SUM(tokens) FILTER (WHERE created_at >= date_trunc('day', NOW())), 0) AS today_tokens,
             COALESCE(SUM(cost) FILTER (WHERE created_at >= date_trunc('day', NOW())), 0) AS today_spend
           FROM calls WHERE customer_id = $1`,
          [customer.id]
        ),
      ]);
      const callSummary = callsResult.rows[0] || {};
      const apiKeys = keysResult.rows.map(rowToApiKey);
      return {
        ...customer,
        passwordHash: undefined,
        apiKeys,
        keyCount: apiKeys.length,
        todayReqs: Number(callSummary.today_reqs || 0),
        todayTokens: Number(callSummary.today_tokens || 0),
        todaySpend: Number(callSummary.today_spend || 0),
      };
    }));
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
      apiKeys: keys.map((key) => ({ ...key, quotaLimit: buildApiKeyLimitSummary(key) })),
    };
  });
}

export async function updateApiKeyLimitForAdmin(keyId, limit = {}) {
  if (!keyId) return null;
  if (!hasDatabase()) {
    const key = store.apiKeys.find((item) => item.id === keyId && !item.deletedAt);
    if (!key) return null;
    Object.assign(key, normalizeApiKeyLimitInput(limit), {
      currentPeriodUsedCny: 0,
      currentPeriodUsedTokens: 0,
    });
    return { ...key, quotaLimit: buildApiKeyLimitSummary(key) };
  }
  const current = await query("SELECT * FROM api_keys WHERE id = $1 AND deleted_at IS NULL LIMIT 1", [keyId]);
  if (!current.rows[0]) return null;
  const limitConfig = normalizeApiKeyLimitInput(limit);
  const result = await query(
    `UPDATE api_keys
     SET limit_enabled = $2,
         limit_type = $3,
         limit_unit = $4,
         limit_amount = $5,
         reset_interval_value = $6,
         reset_interval_unit = $7,
         current_period_start = $8,
         current_period_end = $9,
         current_period_used_cny = 0,
         current_period_used_tokens = 0,
         last_limit_reset_at = $10,
         next_limit_reset_at = $11,
         limit_status = $12
     WHERE id = $1
     RETURNING *`,
    [
      keyId,
      limitConfig.limitEnabled,
      limitConfig.limitType,
      limitConfig.limitUnit,
      limitConfig.limitAmount,
      limitConfig.resetIntervalValue,
      limitConfig.resetIntervalUnit,
      limitConfig.currentPeriodStart,
      limitConfig.currentPeriodEnd,
      limitConfig.lastLimitResetAt,
      limitConfig.nextLimitResetAt,
      limitConfig.limitStatus,
    ]
  );
  return rowToApiKey(result.rows[0]);
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

function isProtectedAdminCustomer(customer = {}) {
  const email = normalizeEmail(customer.email || "");
  return customer.id === "cus_admin" || customer.role === "admin" || email === LOCAL_DEV_ADMIN_EMAIL;
}

export async function softDeleteCustomer(id, adminId = "") {
  const customerId = String(id || "").trim();
  if (!customerId) {
    const error = new Error("用户 ID 无效");
    error.code = "INVALID_USER_ID";
    throw error;
  }
  if (customerId === String(adminId || "")) {
    const error = new Error("不能删除当前管理员自己");
    error.code = "DELETE_SELF_FORBIDDEN";
    throw error;
  }

  if (hasDatabase()) {
    await query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'");
    await query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ");
    await query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_by TEXT DEFAULT ''");
    const current = await query("SELECT * FROM customers WHERE id = $1 LIMIT 1", [customerId]);
    const customer = rowToCustomer(current.rows[0]);
    if (!customer) {
      const error = new Error("用户不存在");
      error.code = "USER_NOT_FOUND";
      throw error;
    }
    if (isProtectedAdminCustomer(customer)) {
      const error = new Error("不能删除超级管理员账号");
      error.code = "DELETE_ADMIN_FORBIDDEN";
      throw error;
    }

    const keys = await query("SELECT id, new_api_token_id FROM api_keys WHERE customer_id = $1 AND deleted_at IS NULL", [customerId]);
    await query(
      `UPDATE api_keys
       SET disabled_at = COALESCE(disabled_at, NOW())
       WHERE customer_id = $1 AND deleted_at IS NULL`,
      [customerId]
    );
    const updated = await query(
      `UPDATE customers
       SET status = 'deleted',
           deleted_at = COALESCE(deleted_at, NOW()),
           deleted_by = $2
       WHERE id = $1
       RETURNING *`,
      [customerId, String(adminId || "admin")]
    );
    await Promise.all((keys.rows || [])
      .map((key) => key.new_api_token_id)
      .filter(Boolean)
      .map((newApiId) => disableNewApiToken(newApiId).catch(() => null)));
    await query(
      `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, detail_json)
       VALUES ($1, $2, 'soft_delete_user', 'customer', $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [makeId("audit"), String(adminId || "admin"), customerId, JSON.stringify({ disabledApiKeys: keys.rows.length })]
    ).catch(() => null);
    return { customer: rowToCustomer(updated.rows[0]), disabledApiKeys: keys.rows.length };
  }

  const store = memoryStore();
  const customer = store.customers.find((item) => item.id === customerId);
  if (!customer) {
    const error = new Error("用户不存在");
    error.code = "USER_NOT_FOUND";
    throw error;
  }
  if (isProtectedAdminCustomer(customer)) {
    const error = new Error("不能删除超级管理员账号");
    error.code = "DELETE_ADMIN_FORBIDDEN";
    throw error;
  }
  customer.status = "deleted";
  customer.deletedAt = new Date().toISOString();
  customer.deletedBy = String(adminId || "admin");
  let disabledApiKeys = 0;
  for (const key of store.apiKeys.filter((item) => item.customerId === customerId && !item.deletedAt)) {
    if (!key.disabledAt) disabledApiKeys += 1;
    key.disabledAt = key.disabledAt || new Date().toISOString();
    if (key.newApiId) await disableNewApiToken(key.newApiId).catch(() => null);
  }
  return { customer, disabledApiKeys };
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

function summarizeProfitCalls(calls = []) {
  const totalRequests = calls.length;
  const successRequests = calls.filter((call) => Number(call.status || 0) >= 200 && Number(call.status || 0) < 300).length;
  const billableSuccessCalls = calls.filter((call) => (
    Number(call.status || 0) >= 200
    && Number(call.status || 0) < 300
    && Number(call.sellPriceCny ?? call.cost ?? 0) > 0
  ));
  const costMissingRequests = billableSuccessCalls.filter((call) => Number(call.upstreamCostCny || 0) <= 0).length;
  const costCoveredRequests = Math.max(0, billableSuccessCalls.length - costMissingRequests);
  const totalTokens = calls.reduce((sum, call) => sum + Number(call.tokens || 0), 0);
  const revenueCny = calls.reduce((sum, call) => sum + Number(call.sellPriceCny ?? call.cost ?? 0), 0);
  const upstreamCostCny = calls.reduce((sum, call) => sum + Number(call.upstreamCostCny || 0), 0);
  const profitCny = calls.reduce((sum, call) => {
    const profit = call.profitCny ?? (Number(call.sellPriceCny ?? call.cost ?? 0) - Number(call.upstreamCostCny || 0));
    return sum + Number(profit || 0);
  }, 0);
  const lossRequests = calls.filter((call) => {
    const profit = call.profitCny ?? (Number(call.sellPriceCny ?? call.cost ?? 0) - Number(call.upstreamCostCny || 0));
    return Number(profit || 0) < 0;
  }).length;
  return {
    totalRequests,
    successRequests,
    totalTokens,
    revenueCny: Number(revenueCny.toFixed(6)),
    upstreamCostCny: Number(upstreamCostCny.toFixed(6)),
    profitCny: Number(profitCny.toFixed(6)),
    profitMargin: revenueCny > 0 ? Number(((profitCny / revenueCny) * 100).toFixed(4)) : 0,
    lossRequests,
    costMissingRequests,
    costCoverageRate: billableSuccessCalls.length > 0 ? Number(((costCoveredRequests / billableSuccessCalls.length) * 100).toFixed(4)) : 100,
  };
}

export async function getProfitOverview({ days = 7 } = {}) {
  const safeDays = Math.max(1, Math.min(90, Number(days || 7)));
  if (hasDatabase()) {
    const [summaryR, todayR, modelR, lossR] = await Promise.all([
      query(
        `SELECT
           COUNT(*)::int AS total_requests,
           COUNT(*) FILTER (WHERE status >= 200 AND status < 300)::int AS success_requests,
           COALESCE(SUM(tokens),0) AS total_tokens,
           COALESCE(SUM(COALESCE(sell_price_cny, cost, 0)),0) AS revenue_cny,
           COALESCE(SUM(COALESCE(upstream_cost_cny,0)),0) AS upstream_cost_cny,
           COALESCE(SUM(COALESCE(profit_cny, COALESCE(sell_price_cny, cost, 0) - COALESCE(upstream_cost_cny,0))),0) AS profit_cny,
           COUNT(*) FILTER (WHERE COALESCE(profit_cny, COALESCE(sell_price_cny, cost, 0) - COALESCE(upstream_cost_cny,0)) < 0)::int AS loss_requests,
           COUNT(*) FILTER (
             WHERE status >= 200 AND status < 300
               AND COALESCE(sell_price_cny, cost, 0) > 0
               AND COALESCE(upstream_cost_cny, 0) <= 0
           )::int AS cost_missing_requests,
           COUNT(*) FILTER (
             WHERE status >= 200 AND status < 300
               AND COALESCE(sell_price_cny, cost, 0) > 0
               AND COALESCE(upstream_cost_cny, 0) > 0
           )::int AS cost_covered_requests
         FROM calls
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')`,
        [safeDays]
      ),
      query(
        `SELECT
           COUNT(*)::int AS total_requests,
           COALESCE(SUM(COALESCE(sell_price_cny, cost, 0)),0) AS revenue_cny,
           COALESCE(SUM(COALESCE(upstream_cost_cny,0)),0) AS upstream_cost_cny,
           COALESCE(SUM(COALESCE(profit_cny, COALESCE(sell_price_cny, cost, 0) - COALESCE(upstream_cost_cny,0))),0) AS profit_cny,
           COUNT(*) FILTER (
             WHERE status >= 200 AND status < 300
               AND COALESCE(sell_price_cny, cost, 0) > 0
               AND COALESCE(upstream_cost_cny, 0) <= 0
           )::int AS cost_missing_requests
         FROM calls
         WHERE created_at >= date_trunc('day', NOW())`,
        []
      ),
      query(
        `SELECT
           COALESCE(NULLIF(public_model_id,''), NULLIF(routed_model,''), NULLIF(requested_model,''), 'unknown') AS model,
           COUNT(*)::int AS requests,
           COALESCE(SUM(tokens),0) AS tokens,
           COALESCE(SUM(COALESCE(sell_price_cny, cost, 0)),0) AS revenue_cny,
           COALESCE(SUM(COALESCE(upstream_cost_cny,0)),0) AS upstream_cost_cny,
           COALESCE(SUM(COALESCE(profit_cny, COALESCE(sell_price_cny, cost, 0) - COALESCE(upstream_cost_cny,0))),0) AS profit_cny,
           COUNT(*) FILTER (
             WHERE status >= 200 AND status < 300
               AND COALESCE(sell_price_cny, cost, 0) > 0
               AND COALESCE(upstream_cost_cny, 0) <= 0
           )::int AS cost_missing_requests
         FROM calls
         WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
         GROUP BY 1
         ORDER BY profit_cny DESC, revenue_cny DESC
         LIMIT 10`,
        [safeDays]
      ),
      query(
        `SELECT id, request_id, customer, public_model_id, routed_model, upstream_channel,
                COALESCE(sell_price_cny, cost, 0) AS revenue_cny,
                COALESCE(upstream_cost_cny, 0) AS upstream_cost_cny,
                COALESCE(profit_cny, COALESCE(sell_price_cny, cost, 0) - COALESCE(upstream_cost_cny,0)) AS profit_cny,
                status, created_at
         FROM calls
         WHERE COALESCE(profit_cny, COALESCE(sell_price_cny, cost, 0) - COALESCE(upstream_cost_cny,0)) < 0
           AND created_at >= NOW() - ($1::int * INTERVAL '1 day')
         ORDER BY created_at DESC
         LIMIT 20`,
        [safeDays]
      ),
    ]);
    const summary = summaryR.rows[0] || {};
    const revenue = Number(summary.revenue_cny || 0);
    const profit = Number(summary.profit_cny || 0);
    const costMissingRequests = Number(summary.cost_missing_requests || 0);
    const costCoveredRequests = Number(summary.cost_covered_requests || 0);
    const costCheckedRequests = costMissingRequests + costCoveredRequests;
    const warnings = [
      costMissingRequests > 0
        ? `有 ${costMissingRequests} 个成功扣费请求没有上游成本，毛利暂时不可信，请先补齐模型成本价。`
        : "",
      revenue > 0
        ? "销售额包含套餐额度消耗价值，不等同于当天现金到账；现金到账请结合充值订单查看。"
        : "",
    ].filter(Boolean);
    return {
      days: safeDays,
      warnings,
      summary: {
        totalRequests: Number(summary.total_requests || 0),
        successRequests: Number(summary.success_requests || 0),
        totalTokens: Number(summary.total_tokens || 0),
        revenueCny: Number(revenue.toFixed(6)),
        upstreamCostCny: Number(summary.upstream_cost_cny || 0),
        profitCny: Number(profit.toFixed(6)),
        profitMargin: revenue > 0 ? Number(((profit / revenue) * 100).toFixed(4)) : 0,
        lossRequests: Number(summary.loss_requests || 0),
        costMissingRequests,
        costCoverageRate: costCheckedRequests > 0 ? Number(((costCoveredRequests / costCheckedRequests) * 100).toFixed(4)) : 100,
      },
      today: {
        totalRequests: Number(todayR.rows[0]?.total_requests || 0),
        revenueCny: Number(todayR.rows[0]?.revenue_cny || 0),
        upstreamCostCny: Number(todayR.rows[0]?.upstream_cost_cny || 0),
        profitCny: Number(todayR.rows[0]?.profit_cny || 0),
        costMissingRequests: Number(todayR.rows[0]?.cost_missing_requests || 0),
      },
      models: modelR.rows.map((row) => {
        const rowRevenue = Number(row.revenue_cny || 0);
        const rowProfit = Number(row.profit_cny || 0);
        return {
          model: row.model || "unknown",
          requests: Number(row.requests || 0),
          tokens: Number(row.tokens || 0),
          revenueCny: Number(rowRevenue.toFixed(6)),
          upstreamCostCny: Number(row.upstream_cost_cny || 0),
          profitCny: Number(rowProfit.toFixed(6)),
          profitMargin: rowRevenue > 0 ? Number(((rowProfit / rowRevenue) * 100).toFixed(4)) : 0,
          costMissingRequests: Number(row.cost_missing_requests || 0),
        };
      }),
      losses: lossR.rows.map((row) => ({
        id: row.id,
        requestId: row.request_id || "",
        customer: row.customer || "",
        model: row.public_model_id || row.routed_model || "unknown",
        upstreamChannel: row.upstream_channel || "",
        revenueCny: Number(row.revenue_cny || 0),
        upstreamCostCny: Number(row.upstream_cost_cny || 0),
        profitCny: Number(row.profit_cny || 0),
        status: Number(row.status || 0),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
      })),
    };
  }

  const cutoff = Date.now() - safeDays * 86400000;
  const calls = store.calls.filter((call) => new Date(call.createdAt || 0).getTime() >= cutoff);
  const todayKey = new Date().toISOString().slice(0, 10);
  const modelMap = new Map();
  calls.forEach((call) => {
    const key = call.publicModelId || call.routedModel || call.requestedModel || "unknown";
    const current = modelMap.get(key) || [];
    current.push(call);
    modelMap.set(key, current);
  });
  const fallbackSummary = summarizeProfitCalls(calls);
  return {
    days: safeDays,
    warnings: [
      fallbackSummary.costMissingRequests > 0
        ? `有 ${fallbackSummary.costMissingRequests} 个成功扣费请求没有上游成本，毛利暂时不可信，请先补齐模型成本价。`
        : "",
      fallbackSummary.revenueCny > 0
        ? "销售额包含套餐额度消耗价值，不等同于当天现金到账；现金到账请结合充值订单查看。"
        : "",
    ].filter(Boolean),
    summary: fallbackSummary,
    today: summarizeProfitCalls(calls.filter((call) => String(call.createdAt || "").slice(0, 10) === todayKey)),
    models: [...modelMap.entries()]
      .map(([model, modelCalls]) => ({ model, ...summarizeProfitCalls(modelCalls) }))
      .sort((a, b) => b.profitCny - a.profitCny)
      .slice(0, 10),
    losses: calls
      .filter((call) => Number(call.profitCny ?? (Number(call.sellPriceCny ?? call.cost ?? 0) - Number(call.upstreamCostCny || 0))) < 0)
      .slice(0, 20)
      .map((call) => ({
        id: call.id,
        requestId: call.requestId || "",
        customer: call.customer || call.customerId || "",
        model: call.publicModelId || call.routedModel || "unknown",
        upstreamChannel: call.upstreamChannel || "",
        revenueCny: Number(call.sellPriceCny ?? call.cost ?? 0),
        upstreamCostCny: Number(call.upstreamCostCny || 0),
        profitCny: Number(call.profitCny ?? (Number(call.sellPriceCny ?? call.cost ?? 0) - Number(call.upstreamCostCny || 0))),
        status: Number(call.status || 0),
        createdAt: call.createdAt || "",
      })),
  };
}

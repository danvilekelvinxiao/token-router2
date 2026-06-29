import crypto from "crypto";
import { hasDatabase, query } from "@/lib/db";
import { listChannels } from "@/lib/admin-store";
import { listTeamUsageLogs, listTokenPool, listTokenPoolCheckLogs, runTokenPoolCheck } from "@/lib/team-token-pool";
import { sanitizeSecretText } from "@/lib/safe-upstream-url";

const CACHE_KEY = "default";
const DEFAULT_CACHE_TTL_MS = 60_000;
const STATUS_ORDER = ["available", "busy", "rate_limited", "cooldown", "expired", "disabled", "error", "unknown"];
const CHANNEL_STATUS_ORDER = ["healthy", "degraded", "down", "maintenance", "unknown"];

let memoryCache = null;
let poolStatusSchemaReady = false;

function nowIso() {
  return new Date().toISOString();
}

function ttlMs() {
  const configured = Number(process.env.POOL_STATUS_CACHE_TTL_MS || process.env.SUB2API_POOL_STATUS_CACHE_TTL_MS || DEFAULT_CACHE_TTL_MS);
  return Number.isFinite(configured) ? Math.max(15_000, configured) : DEFAULT_CACHE_TTL_MS;
}

function stableHash(value = "", length = 10) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, length);
}

function ref(prefix, id = "") {
  return `${prefix}_${stableHash(id || prefix)}`;
}

function maskText(value = "", { prefix = 4, suffix = 4 } = {}) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.includes("@")) {
    const [name, domain] = text.split("@");
    return `${name.slice(0, 2)}***@${domain ? `${domain.slice(0, 2)}***` : "***"}`;
  }
  if (/^1\d{10}$/.test(text)) return `${text.slice(0, 3)}****${text.slice(-4)}`;
  if (text.length <= prefix + suffix + 3) return `${text.slice(0, Math.min(2, text.length))}***`;
  return `${text.slice(0, prefix)}***${text.slice(-suffix)}`;
}

function redactMessage(value = "") {
  return sanitizeSecretText(String(value || ""))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => maskText(email))
    .replace(/\b1\d{10}\b/g, (phone) => maskText(phone))
    .slice(0, 260);
}

function safeOrigin(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return text.replace(/[?#].*$/, "").slice(0, 120);
  }
}

function normalizeAccountStatus(token = {}) {
  const status = String(token.runtimeStatus?.status || token.status || "unknown").toLowerCase();
  if (!token.enabled || status === "disabled") return "disabled";
  if (status === "normal" || status === "expiring") return "available";
  if (status === "low_quota") return "busy";
  if (status === "rate_limited") return "rate_limited";
  if (status === "checking") return "cooldown";
  if (status === "expired") return "expired";
  if (status === "error") return "error";
  return "unknown";
}

function normalizeChannelStatus(channel = {}) {
  const raw = String(channel.status || channel.lastHealthStatus || channel.health || "").toLowerCase();
  const enabled = channel.enabled !== false && channel.isEnabled !== false && raw !== "disabled";
  if (!enabled) return "maintenance";
  if (["active", "ok", "healthy", "normal", "success"].includes(raw)) return "healthy";
  if (["degraded", "warning", "warn", "rate_limited"].includes(raw)) return "degraded";
  if (["down", "error", "failed", "fail", "abnormal"].includes(raw)) return "down";
  return "unknown";
}

function categorizeError({ code = "", message = "", status = 0 } = {}) {
  const value = `${code} ${message}`.toLowerCase();
  const httpStatus = Number(status || 0);
  if (httpStatus === 401 || httpStatus === 403 || /auth|unauthori[sz]ed|permission|invalid[_ -]?key|forbidden/.test(value)) return "auth_error";
  if (httpStatus === 429 || /rate[_ -]?limit|too many|限流/.test(value)) return "rate_limit";
  if (httpStatus === 402 || /quota|insufficient|balance|额度不足|余额不足/.test(value)) return "quota_exhausted";
  if (httpStatus === 408 || /timeout|超时/.test(value)) return "timeout";
  if (/network|econn|socket|dns|tls|fetch failed|网络/.test(value)) return "network_error";
  if (/invalid response|parse|json|格式/.test(value)) return "invalid_response";
  if (/disabled|manual|维护|禁用/.test(value)) return "manual_disabled";
  if (httpStatus >= 500) return "upstream_error";
  return value || httpStatus ? "unknown" : "";
}

function summarizeCounts(items = [], key = "status", order = STATUS_ORDER) {
  const counts = Object.fromEntries(order.map((status) => [status, 0]));
  for (const item of items) {
    const status = item?.[key] || "unknown";
    counts[status] = (counts[status] || 0) + 1;
  }
  return { total: items.length, ...counts };
}

function deriveOverallStatus({ accountSummary, channelSummary, windows }) {
  const hasAccounts = Number(accountSummary?.total || 0) > 0;
  const hasChannels = Number(channelSummary?.total || 0) > 0;
  const activeAccounts = Number(accountSummary?.available || 0) + Number(accountSummary?.busy || 0);
  const healthyChannels = Number(channelSummary?.healthy || 0) + Number(channelSummary?.degraded || 0);
  const recentErrorRate = Number(windows?.["15m"]?.errorRate || 0);

  if ((hasAccounts && activeAccounts === 0) || (hasChannels && healthyChannels === 0)) return "down";
  if (recentErrorRate >= 0.5 || Number(accountSummary?.error || 0) > 0 || Number(channelSummary?.down || 0) > 0) return "degraded";
  if (!hasAccounts && !hasChannels) return "unknown";
  if (recentErrorRate >= 0.15 || Number(accountSummary?.rate_limited || 0) > 0 || Number(accountSummary?.busy || 0) > 0) return "degraded";
  return "healthy";
}

async function ensurePoolStatusSchema() {
  if (!hasDatabase() || poolStatusSchemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS pool_status_cache (
      cache_key TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pool_status_cache_expires ON pool_status_cache(expires_at);
  `);
  poolStatusSchemaReady = true;
}

function stripForPublic(snapshot = {}) {
  const publicChannels = (snapshot.channels || []).map((channel) => ({
    ref: channel.ref,
    name: channel.publicName || channel.name || "FlowAPI 渠道",
    provider: channel.provider || "FlowAPI",
    status: channel.status,
    statusLabel: channel.statusLabel,
    supportedModels: channel.supportedModels || [],
    successRate: channel.successRate,
    avgLatencyMs: channel.avgLatencyMs,
    lastCheckedAt: channel.lastCheckedAt,
  }));
  return {
    success: true,
    visibility: "public",
    status: snapshot.status,
    statusLabel: snapshot.statusLabel,
    generatedAt: snapshot.generatedAt,
    cache: snapshot.cache,
    summary: snapshot.summary,
    windows: snapshot.windows,
    channels: publicChannels,
    notices: snapshot.notices,
  };
}

function statusLabel(status) {
  return {
    healthy: "整体正常",
    degraded: "部分波动",
    down: "当前异常",
    maintenance: "维护中",
    unknown: "待确认",
  }[status] || "待确认";
}

function accountStatusLabel(status) {
  return {
    available: "可用",
    busy: "繁忙/低余量",
    rate_limited: "被限流",
    cooldown: "冷却/检测中",
    expired: "已过期",
    disabled: "已禁用",
    error: "异常",
    unknown: "未知",
  }[status] || "未知";
}

function channelStatusLabel(status) {
  return {
    healthy: "健康",
    degraded: "波动",
    down: "不可用",
    maintenance: "维护/禁用",
    unknown: "待确认",
  }[status] || "待确认";
}

function toAccount(token = {}, latestLog = null) {
  const status = normalizeAccountStatus(token);
  const sourceId = token.id || token.tokenPreview || token.name || "pool";
  const errorCategory = categorizeError({ message: token.lastError || latestLog?.lastErrorMessage || "" });
  return {
    ref: ref("acct", sourceId),
    idPreview: maskText(sourceId, { prefix: 5, suffix: 4 }),
    name: token.name ? redactMessage(token.name).slice(0, 80) : "FlowAPI 账号池节点",
    provider: token.provider || "FlowAPI",
    modelType: token.modelType || "",
    teamRef: token.teamId ? ref("team", token.teamId) : "",
    status,
    statusLabel: accountStatusLabel(status),
    riskLevel: latestLog?.riskLevel || token.runtimeStatus?.severity || "info",
    quotaTotal: Number(token.quotaTotal || 0),
    quotaRemaining: Number(token.quotaRemaining || 0),
    quotaPercent: Number(token.quotaTotal || 0) > 0 ? Math.max(0, Math.min(100, Math.round((Number(token.quotaRemaining || 0) / Number(token.quotaTotal || 1)) * 100))) : null,
    allowedModels: Array.isArray(token.allowedModels) ? token.allowedModels.slice(0, 20) : [],
    tokenPreview: token.tokenPreview || "",
    lastUsedAt: token.lastUsedAt || "",
    lastCheckedAt: latestLog?.checkedAt || token.updatedAt || "",
    avgLatencyMs: Number(token.avgLatencyMs || latestLog?.avgLatencyMs || 0),
    successRate: Number(token.successRate ?? latestLog?.successRate ?? 1),
    errorCategory,
    lastError: redactMessage(token.lastError || latestLog?.lastErrorMessage || ""),
    suggestion: redactMessage(latestLog?.suggestion || token.runtimeStatus?.label || ""),
  };
}

function normalizeChannelRecord(channel = {}) {
  const id = channel.id || channel.channelId || channel.name || channel.provider || channel.baseUrl || "channel";
  const models = Array.isArray(channel.models) ? channel.models : Array.isArray(channel.supportedModels) ? channel.supportedModels : String(channel.models || "").split(",").map((item) => item.trim()).filter(Boolean);
  const status = normalizeChannelStatus(channel);
  return {
    ref: ref("ch", id),
    idPreview: maskText(String(id), { prefix: 5, suffix: 4 }),
    name: redactMessage(channel.name || channel.channelName || channel.providerName || channel.label || "FlowAPI 渠道").slice(0, 80),
    publicName: channel.publicName || channel.provider || channel.providerName || "FlowAPI 渠道",
    provider: channel.provider || channel.providerName || channel.type || "FlowAPI",
    type: channel.type || "",
    baseUrl: safeOrigin(channel.baseUrl || channel.base_url || ""),
    status,
    statusLabel: channelStatusLabel(status),
    weight: Number(channel.weight || 0),
    priority: Number(channel.priority || 0),
    supportedModels: models.slice(0, 30),
    successRate: Number(channel.successRate || channel.success_rate || (status === "healthy" ? 1 : 0)),
    avgLatencyMs: Number(channel.avgLatencyMs || channel.avg_latency_ms || 0),
    lastCheckedAt: channel.lastHealthCheckedAt || channel.last_health_checked_at || channel.lastHealthCheckAt || channel.last_health_check_at || "",
    lastError: redactMessage(channel.lastError || channel.last_error || channel.lastErrorMessage || channel.last_error_message || ""),
  };
}

async function loadDbChannels() {
  if (!hasDatabase()) return [];
  const channels = [];
  try {
    const upstream = await query(`SELECT * FROM upstream_channels ORDER BY priority DESC, updated_at DESC LIMIT 200`);
    for (const row of upstream?.rows || []) {
      channels.push(normalizeChannelRecord({
        id: row.id,
        providerName: row.provider_name,
        channelName: row.channel_name,
        baseUrl: row.base_url,
        models: [row.public_model_id, row.actual_model_id].filter(Boolean),
        status: row.is_enabled ? (Number(row.success_rate || 0) >= 0.8 || !row.last_error ? "healthy" : "degraded") : "disabled",
        priority: row.priority,
        success_rate: Number(row.success_rate || 0),
        avg_latency_ms: Number(row.avg_latency_ms || 0),
        last_health_check_at: row.last_health_check_at,
        last_error: row.last_error,
      }));
    }
  } catch {}
  try {
    const providers = await query(`SELECT * FROM providers ORDER BY priority DESC, updated_at DESC LIMIT 200`);
    for (const row of providers?.rows || []) {
      channels.push(normalizeChannelRecord({
        id: row.id,
        name: row.name,
        provider: row.type,
        baseUrl: row.base_url,
        models: row.models,
        enabled: row.enabled,
        status: row.enabled ? row.last_health_status || "unknown" : "disabled",
        priority: row.priority,
        avgLatencyMs: 0,
        lastHealthCheckedAt: row.last_health_checked_at,
        lastErrorMessage: row.last_error_message,
      }));
    }
  } catch {}
  return channels;
}

async function loadConfiguredChannels() {
  const configured = [];
  try {
    configured.push(...(await listChannels()).map(normalizeChannelRecord));
  } catch {}
  configured.push(...(await loadDbChannels()));
  const seen = new Set();
  return configured.filter((channel) => {
    const key = `${channel.ref}:${channel.name}:${channel.baseUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadLatestCheckLogs() {
  const logs = await listTokenPoolCheckLogs({ limit: 500 }).catch(() => []);
  const map = new Map();
  for (const log of logs) {
    if (!map.has(log.tokenPoolId)) map.set(log.tokenPoolId, log);
  }
  return { logs, latestByToken: map };
}

async function loadWindows() {
  const empty = { total: 0, success: 0, failed: 0, errorRate: 0, avgLatencyMs: 0, errors: {} };
  const windows = { "5m": { ...empty }, "15m": { ...empty }, "1h": { ...empty } };
  if (!hasDatabase()) return windows;

  const minuteMap = { "5m": 5, "15m": 15, "1h": 60 };
  for (const [key, minutes] of Object.entries(minuteMap)) {
    try {
      const result = await query(
        `WITH recent AS (
           SELECT
             CASE WHEN (status >= 200 AND status < 400 AND COALESCE(error_code, '') = '') THEN true ELSE false END AS ok,
             COALESCE(error_code, '') AS error_code,
             COALESCE(error_message, '') AS error_message,
             COALESCE(upstream_status, status, 0) AS http_status,
             latency_ms
           FROM calls
           WHERE created_at >= NOW() - ($1::text::interval)
         )
         SELECT
           COUNT(*)::int AS total,
           COALESCE(SUM(CASE WHEN ok THEN 1 ELSE 0 END), 0)::int AS success,
           COALESCE(SUM(CASE WHEN ok THEN 0 ELSE 1 END), 0)::int AS failed,
           COALESCE(AVG(NULLIF(latency_ms, 0)), 0)::int AS avg_latency_ms,
           jsonb_object_agg(category, count) FILTER (WHERE category <> '') AS errors
         FROM (
           SELECT *,
             CASE
               WHEN ok THEN ''
               WHEN http_status IN (401,403) OR error_code ~* 'auth|permission|forbidden' THEN 'auth_error'
               WHEN http_status = 429 OR error_code ~* 'rate' OR error_message ~* 'rate|限流' THEN 'rate_limit'
               WHEN http_status = 402 OR error_code ~* 'quota|balance|insufficient' OR error_message ~* '额度不足|余额不足|quota|balance' THEN 'quota_exhausted'
               WHEN http_status = 408 OR error_code ~* 'timeout' OR error_message ~* 'timeout|超时' THEN 'timeout'
               WHEN http_status >= 500 THEN 'upstream_error'
               ELSE 'unknown'
             END AS category
           FROM recent
         ) categorized
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS count
         ) c ON true`,
        [`${minutes} minutes`],
      );
      const row = result?.rows?.[0] || {};
      const total = Number(row.total || 0);
      const failed = Number(row.failed || 0);
      windows[key] = {
        total,
        success: Number(row.success || 0),
        failed,
        errorRate: total ? Number((failed / total).toFixed(4)) : 0,
        avgLatencyMs: Number(row.avg_latency_ms || 0),
        errors: row.errors || {},
      };
    } catch {
      windows[key] = { ...empty };
    }
  }
  return windows;
}

async function loadRecentEvents(checkLogs = []) {
  const events = [];
  for (const log of checkLogs.slice(0, 80)) {
    events.push({
      id: ref("evt", log.id || `${log.tokenPoolId}:${log.checkedAt}`),
      type: "account_check",
      level: log.riskLevel === "critical" ? "critical" : log.riskLevel === "warning" ? "warning" : "info",
      status: log.status,
      accountRef: log.tokenPoolId ? ref("acct", log.tokenPoolId) : "",
      errorCategory: categorizeError({ code: log.lastErrorCode, message: log.lastErrorMessage }),
      message: redactMessage(log.suggestion || log.status || "账号池巡检完成"),
      createdAt: log.checkedAt || "",
    });
  }

  const usageLogs = await listTeamUsageLogs({ limit: 80, includeInternal: true }).catch(() => []);
  for (const log of usageLogs.filter((item) => item.success === false || item.errorCode).slice(0, 80)) {
    events.push({
      id: ref("evt", log.id || log.requestId),
      type: "request_error",
      level: "warning",
      status: log.finalStatus || "failed",
      requestRef: log.requestId ? maskText(log.requestId, { prefix: 8, suffix: 4 }) : "",
      accountRef: log.tokenId ? ref("acct", log.tokenId) : "",
      model: log.model || "",
      provider: log.provider || "FlowAPI",
      errorCategory: categorizeError({ code: log.errorCode, message: log.errorMessage }),
      message: redactMessage(log.errorMessage || log.errorCode || "请求未完成"),
      createdAt: log.createdAt || "",
    });
  }

  if (hasDatabase()) {
    try {
      const result = await query(
        `SELECT id, alert_type, level, title, content, token_pool_id, model, status, suggestion, created_at
         FROM alert_events
         ORDER BY created_at DESC
         LIMIT 80`,
      );
      for (const row of result?.rows || []) {
        events.push({
          id: ref("evt", row.id),
          type: "alert",
          level: row.level || "warning",
          status: row.status || "open",
          accountRef: row.token_pool_id ? ref("acct", row.token_pool_id) : "",
          model: row.model || "",
          errorCategory: categorizeError({ code: row.alert_type, message: row.content }),
          message: redactMessage(row.suggestion || row.content || row.title || "系统告警"),
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
        });
      }
    } catch {}
  }

  return events
    .filter((event) => event.createdAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 120);
}

async function readPersistentCache() {
  if (!hasDatabase()) return null;
  await ensurePoolStatusSchema();
  const result = await query("SELECT data, generated_at, expires_at FROM pool_status_cache WHERE cache_key = $1 LIMIT 1", [CACHE_KEY]);
  const row = result?.rows?.[0];
  if (!row) return null;
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt <= Date.now()) return null;
  return { ...row.data, cache: { ...(row.data?.cache || {}), source: "database", generatedAt: row.generated_at ? new Date(row.generated_at).toISOString() : row.data?.generatedAt || "", expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : "" } };
}

async function writePersistentCache(snapshot) {
  if (!hasDatabase()) return;
  await ensurePoolStatusSchema();
  const expiresAt = new Date(Date.now() + ttlMs()).toISOString();
  await query(
    `INSERT INTO pool_status_cache (cache_key, data, generated_at, expires_at)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (cache_key) DO UPDATE SET data = EXCLUDED.data, generated_at = NOW(), expires_at = EXCLUDED.expires_at`,
    [CACHE_KEY, JSON.stringify(snapshot), expiresAt],
  );
}

async function buildSnapshot() {
  const generatedAt = nowIso();
  const [{ latestByToken, logs }, tokens, channels, windows] = await Promise.all([
    loadLatestCheckLogs(),
    listTokenPool().catch(() => []),
    loadConfiguredChannels(),
    loadWindows(),
  ]);

  const accounts = tokens.map((token) => toAccount(token, latestByToken.get(token.id)));
  const accountSummary = summarizeCounts(accounts, "status", STATUS_ORDER);
  const channelSummary = summarizeCounts(channels, "status", CHANNEL_STATUS_ORDER);
  const events = await loadRecentEvents(logs);
  const status = deriveOverallStatus({ accountSummary, channelSummary, windows });
  const summary = {
    status,
    statusLabel: statusLabel(status),
    accounts: accountSummary,
    channels: channelSummary,
    availableAccounts: Number(accountSummary.available || 0),
    activeChannels: Number(channelSummary.healthy || 0) + Number(channelSummary.degraded || 0),
    recentEvents: events.length,
  };

  return {
    success: true,
    visibility: "admin",
    status,
    statusLabel: statusLabel(status),
    generatedAt,
    cache: {
      source: "live-build",
      ttlMs: ttlMs(),
      expiresAt: new Date(Date.now() + ttlMs()).toISOString(),
    },
    summary,
    windows,
    accounts,
    channels,
    events,
    notices: buildNotices({ accountSummary, channelSummary, windows }),
  };
}

function buildNotices({ accountSummary, channelSummary, windows }) {
  const notices = [];
  if (!accountSummary.total && !channelSummary.total) notices.push("暂未读取到账号池或渠道配置，请在后台完成账号池/渠道配置后刷新巡检。");
  if (accountSummary.rate_limited > 0) notices.push(`检测到 ${accountSummary.rate_limited} 个账号被限流，系统会优先使用其它可用账号。`);
  if (accountSummary.expired > 0) notices.push(`检测到 ${accountSummary.expired} 个账号已过期，请在后台替换。`);
  if (channelSummary.down > 0) notices.push(`检测到 ${channelSummary.down} 条渠道不可用，请检查上游或备用线路。`);
  if (Number(windows?.["15m"]?.errorRate || 0) >= 0.15) notices.push(`最近 15 分钟错误率为 ${(Number(windows["15m"].errorRate) * 100).toFixed(1)}%，建议查看后台事件。`);
  return notices;
}

export async function getPoolStatusSnapshot({ visibility = "admin", forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && memoryCache?.expiresAtMs > now) {
    const snapshot = { ...memoryCache.data, cache: { ...(memoryCache.data.cache || {}), source: "memory" } };
    return visibility === "public" ? stripForPublic(snapshot) : snapshot;
  }

  if (!forceRefresh) {
    const persisted = await readPersistentCache().catch(() => null);
    if (persisted) {
      memoryCache = { data: persisted, expiresAtMs: now + ttlMs() };
      return visibility === "public" ? stripForPublic(persisted) : persisted;
    }
  }

  const snapshot = await buildSnapshot();
  memoryCache = { data: snapshot, expiresAtMs: now + ttlMs() };
  await writePersistentCache(snapshot).catch(() => {});
  return visibility === "public" ? stripForPublic(snapshot) : snapshot;
}

export async function refreshPoolStatus({ runChecks = false, adminId = "" } = {}) {
  if (runChecks) {
    await runTokenPoolCheck({ adminId }).catch(() => []);
  }
  return getPoolStatusSnapshot({ visibility: "admin", forceRefresh: true });
}

export async function getPoolStatusHealth() {
  const snapshot = await getPoolStatusSnapshot({ visibility: "admin" });
  const generated = snapshot.generatedAt ? new Date(snapshot.generatedAt).getTime() : 0;
  const ageMs = generated ? Date.now() - generated : null;
  return {
    success: true,
    ok: snapshot.status === "healthy" || snapshot.status === "degraded",
    status: snapshot.status,
    statusLabel: snapshot.statusLabel,
    generatedAt: snapshot.generatedAt,
    ageMs,
    cache: snapshot.cache,
    summary: snapshot.summary,
    dataSources: {
      database: hasDatabase(),
      tokenPool: true,
      configuredChannels: true,
      requestLogs: hasDatabase(),
      scheduledRefreshEndpoint: "/api/admin/pool-status/health",
      cronSecretRequired: true,
    },
  };
}

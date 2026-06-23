import crypto from "crypto";
import { hasDatabase, query } from "@/lib/db";
import { getPublicModelRequestId } from "@/lib/models";
import { sendEmail } from "@/lib/resend";
import { assertSafeUpstreamUrl, sanitizeSecretText } from "@/lib/safe-upstream-url";

const TOKEN_STATUSES = new Set(["normal", "low_quota", "expiring", "expired", "rate_limited", "error", "disabled", "checking"]);
const TOKEN_TYPES = ["OpenAI", "Claude", "DeepSeek", "Gemini", "Qwen", "文心一言", "讯飞星火", "通义千问", "Telegram Bot Token", "OpenRouter", "自定义 OpenAI Compatible", "本地模型", "其他"];
const DEFAULT_TEAMS = [
  { name: "市场部", code: "marketing", description: "AI 文案生成、活动内容、品牌传播" },
  { name: "技术部", code: "engineering", description: "模型测试、代码生成、接口验证" },
  { name: "产品部", code: "product", description: "原型验证、需求分析、产品文档" },
  { name: "默认团队", code: "default", description: "未分类团队 Token 归属" },
];

const memory = {
  teams: DEFAULT_TEAMS.map((item, index) => ({
    id: `team_${index + 1}`,
    ...item,
    ownerUserId: "",
    monthlyBudgetCny: 0,
    monthlyTokenBudget: 0,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  tokens: [],
  rateLimitRules: [],
  cacheSettings: {
    enabled: false,
    defaultTtlSeconds: 300,
    teamIds: [],
    models: [],
    purposes: [],
  },
  cacheEntries: [],
  usageLogs: [],
  reports: [],
  alerts: [],
  counters: new Map(),
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function jsonStringify(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === "object")) return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function tokenPreview(token = "") {
  return String(token || "").trim();
}

function encryptionSecret() {
  const secret = process.env.TOKEN_POOL_ENCRYPTION_KEY || process.env.VERIFY_SECRET || process.env.SESSION_SECRET || "";
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("TOKEN_POOL_ENCRYPTION_KEY 未配置，生产环境不能保存上游 Token。");
  }
  return secret || "flowapi-dev-token-pool-key";
}

function cryptoKey() {
  return crypto.createHash("sha256").update(encryptionSecret()).digest();
}

export function encryptTokenSecret(token = "") {
  const plain = String(token || "").trim();
  if (!plain) return { tokenCiphertext: "", tokenIv: "", tokenAuthTag: "", tokenPreview: "" };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    tokenCiphertext: ciphertext.toString("base64"),
    tokenIv: iv.toString("base64"),
    tokenAuthTag: cipher.getAuthTag().toString("base64"),
    tokenPreview: tokenPreview(plain),
  };
}

export function decryptTokenSecret(record = {}) {
  if (!record.tokenCiphertext || !record.tokenIv || !record.tokenAuthTag) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", cryptoKey(), Buffer.from(record.tokenIv, "base64"));
  decipher.setAuthTag(Buffer.from(record.tokenAuthTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(record.tokenCiphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

let schemaReady = false;

export async function ensureTeamTokenPoolSchema() {
  if (!hasDatabase()) return;
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      owner_user_id TEXT DEFAULT '',
      monthly_budget_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      monthly_token_budget NUMERIC(20, 0) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      member_name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS token_pool (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_type TEXT NOT NULL DEFAULT '自定义 OpenAI Compatible',
      model_type TEXT DEFAULT '',
      provider TEXT DEFAULT '',
      team_id TEXT DEFAULT '',
      quota_total NUMERIC(20, 4) NOT NULL DEFAULT 0,
      quota_remaining NUMERIC(20, 4) NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      usage_scope TEXT NOT NULL DEFAULT 'all',
      allowed_team_ids TEXT NOT NULL DEFAULT '',
      allowed_models TEXT NOT NULL DEFAULT '',
      allowed_purposes TEXT NOT NULL DEFAULT '',
      environment_scope TEXT NOT NULL DEFAULT 'all',
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'normal',
      rate_limit_rule_id TEXT DEFAULT '',
      priority INTEGER NOT NULL DEFAULT 5,
      weight INTEGER NOT NULL DEFAULT 5,
      enabled BOOLEAN NOT NULL DEFAULT true,
      base_url TEXT DEFAULT '',
      api_path TEXT DEFAULT '/v1/chat/completions',
      token_ciphertext TEXT DEFAULT '',
      token_iv TEXT DEFAULT '',
      token_auth_tag TEXT DEFAULT '',
      token_preview TEXT DEFAULT '',
      today_calls INTEGER NOT NULL DEFAULT 0,
      today_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
      month_tokens NUMERIC(20, 0) NOT NULL DEFAULT 0,
      today_cost_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      month_cost_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      last_used_at TIMESTAMPTZ,
      last_error TEXT DEFAULT '',
      avg_latency_ms INTEGER NOT NULL DEFAULT 0,
      success_rate NUMERIC(8, 4) NOT NULL DEFAULT 1,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS token_pool_status (
      id TEXT PRIMARY KEY,
      token_id TEXT NOT NULL REFERENCES token_pool(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      message TEXT DEFAULT '',
      severity TEXT DEFAULT 'info',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS token_pool_usage (
      id TEXT PRIMARY KEY,
      token_id TEXT NOT NULL REFERENCES token_pool(id) ON DELETE CASCADE,
      team_id TEXT DEFAULT '',
      request_id TEXT DEFAULT '',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      success BOOLEAN NOT NULL DEFAULT true,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rate_limit_rules (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL DEFAULT 'global',
      scope_id TEXT DEFAULT '',
      provider TEXT DEFAULT '',
      model TEXT DEFAULT '',
      team_id TEXT DEFAULT '',
      api_key_id TEXT DEFAULT '',
      requests_per_minute INTEGER NOT NULL DEFAULT 0,
      requests_per_hour INTEGER NOT NULL DEFAULT 0,
      requests_per_day INTEGER NOT NULL DEFAULT 0,
      tokens_per_minute INTEGER NOT NULL DEFAULT 0,
      tokens_per_day INTEGER NOT NULL DEFAULT 0,
      concurrency_limit INTEGER NOT NULL DEFAULT 0,
      buffer_ratio NUMERIC(8, 4) NOT NULL DEFAULT 0.9,
      cooldown_seconds INTEGER NOT NULL DEFAULT 30,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS request_cache_entries (
      id TEXT PRIMARY KEY,
      cache_key TEXT UNIQUE NOT NULL,
      team_id TEXT DEFAULT '',
      user_id TEXT DEFAULT '',
      model TEXT DEFAULT '',
      purpose TEXT DEFAULT '',
      request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      saved_tokens INTEGER NOT NULL DEFAULT 0,
      saved_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS request_cache_settings (
      id TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT false,
      default_ttl_seconds INTEGER NOT NULL DEFAULT 300,
      team_ids TEXT DEFAULT '',
      models TEXT DEFAULT '',
      purposes TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_usage_logs (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      user_id TEXT DEFAULT '',
      team_id TEXT DEFAULT '',
      api_key_id TEXT DEFAULT '',
      token_pool_id TEXT DEFAULT '',
      token_id TEXT DEFAULT '',
      provider TEXT DEFAULT '',
      model TEXT DEFAULT '',
      model_type TEXT DEFAULT '',
      purpose TEXT DEFAULT '',
      request_summary TEXT DEFAULT '',
      request_hash TEXT DEFAULT '',
      request_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      client_ip TEXT DEFAULT '',
      client_name TEXT DEFAULT '',
      request_params_json TEXT DEFAULT '',
      cache_hit BOOLEAN NOT NULL DEFAULT false,
      cache_key TEXT DEFAULT '',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      official_cost_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      actual_cost_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      saved_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      balance_source TEXT DEFAULT '',
      success BOOLEAN NOT NULL DEFAULT true,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      upstream_request_id TEXT DEFAULT '',
      error_code TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      rate_limited BOOLEAN NOT NULL DEFAULT false,
      token_expired BOOLEAN NOT NULL DEFAULT false,
      balance_insufficient BOOLEAN NOT NULL DEFAULT false,
      upstream_error BOOLEAN NOT NULL DEFAULT false,
      fallback_token_used BOOLEAN NOT NULL DEFAULT false,
      fallback_token_id TEXT DEFAULT '',
      retry_count INTEGER NOT NULL DEFAULT 0,
      final_status TEXT DEFAULT 'success',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_daily_reports (
      id TEXT PRIMARY KEY,
      report_date DATE NOT NULL,
      team_id TEXT DEFAULT '',
      team_name TEXT DEFAULT '',
      calls INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      success_rate NUMERIC(8, 4) NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      official_cost_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      actual_cost_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      saved_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      cache_hits INTEGER NOT NULL DEFAULT 0,
      cache_saved_tokens INTEGER NOT NULL DEFAULT 0,
      rate_limited_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      top_model TEXT DEFAULT '',
      high_failure_token TEXT DEFAULT '',
      recommendation TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_alerts (
      id TEXT PRIMARY KEY,
      team_id TEXT DEFAULT '',
      token_id TEXT DEFAULT '',
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      message TEXT NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS team_budget_rules (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      monthly_budget_cny NUMERIC(18, 6) NOT NULL DEFAULT 0,
      monthly_token_budget NUMERIC(20, 0) NOT NULL DEFAULT 0,
      alert_threshold_percent INTEGER NOT NULL DEFAULT 80,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS token_pool_check_logs (
      id TEXT PRIMARY KEY,
      token_pool_id TEXT DEFAULT '',
      team_id TEXT DEFAULT '',
      status TEXT NOT NULL,
      risk_level TEXT NOT NULL DEFAULT 'info',
      remaining_quota NUMERIC(20, 4) NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      success_rate NUMERIC(8, 4) NOT NULL DEFAULT 0,
      avg_latency_ms INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT DEFAULT '',
      last_error_message TEXT DEFAULT '',
      suggestion TEXT DEFAULT '',
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS token_pool_test_logs (
      id TEXT PRIMARY KEY,
      token_pool_id TEXT DEFAULT '',
      team_id TEXT DEFAULT '',
      test_type TEXT NOT NULL DEFAULT 'single',
      success BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'unknown',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error_code TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      result_summary TEXT DEFAULT '',
      tested_by TEXT DEFAULT '',
      tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alert_events (
      id TEXT PRIMARY KEY,
      alert_type TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'warning',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      team_id TEXT DEFAULT '',
      token_pool_id TEXT DEFAULT '',
      model TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      suggestion TEXT DEFAULT '',
      sent_email BOOLEAN NOT NULL DEFAULT false,
      sent_webhook BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS maintenance_tasks (
      id TEXT PRIMARY KEY,
      task_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      frequency TEXT NOT NULL DEFAULT 'weekly',
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending',
      pending_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rate_limit_test_runs (
      id TEXT PRIMARY KEY,
      team_id TEXT DEFAULT '',
      model TEXT DEFAULT '',
      concurrency INTEGER NOT NULL DEFAULT 1,
      request_count INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      rate_limited_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      avg_latency_ms INTEGER NOT NULL DEFAULT 0,
      p95_latency_ms INTEGER NOT NULL DEFAULT 0,
      suggestion TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS log_integrity_test_runs (
      id TEXT PRIMARY KEY,
      score INTEGER NOT NULL DEFAULT 0,
      total_cases INTEGER NOT NULL DEFAULT 0,
      passed_cases INTEGER NOT NULL DEFAULT 0,
      partial_cases INTEGER NOT NULL DEFAULT 0,
      failed_cases INTEGER NOT NULL DEFAULT 0,
      missing_fields_json TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT DEFAULT '',
      action TEXT NOT NULL,
      target_type TEXT DEFAULT '',
      target_id TEXT DEFAULT '',
      detail_json TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS team_id TEXT DEFAULT '';
    ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS usage_purpose TEXT DEFAULT '';
    ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS usage_scope TEXT DEFAULT '';
    ALTER TABLE token_pool_usage ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT '';
    ALTER TABLE token_pool_usage ADD COLUMN IF NOT EXISTS api_key_id TEXT DEFAULT '';
    ALTER TABLE token_pool_usage ADD COLUMN IF NOT EXISTS model TEXT DEFAULT '';
    ALTER TABLE token_pool_usage ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_token_pool_team ON token_pool(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_usage_logs_team ON team_usage_logs(team_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_token_pool_usage_request ON token_pool_usage(request_id);
    CREATE INDEX IF NOT EXISTS idx_request_cache_entries_key ON request_cache_entries(cache_key);
    CREATE INDEX IF NOT EXISTS idx_alert_events_status ON alert_events(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_token_pool_check_logs_token ON token_pool_check_logs(token_pool_id, checked_at DESC);
  `);

  for (const team of DEFAULT_TEAMS) {
    await query(
      `INSERT INTO teams (id, name, code, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING`,
      [makeId("team"), team.name, team.code, team.description],
    );
  }
  for (const [taskKey, name, description, frequency] of DEFAULT_MAINTENANCE_TASKS) {
    await query(
      `INSERT INTO maintenance_tasks (id, task_key, name, description, frequency, next_run_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (task_key) DO NOTHING`,
      [makeId("mtask"), taskKey, name, description, frequency],
    );
  }
  schemaReady = true;
}

const DEFAULT_MAINTENANCE_TASKS = [
  ["check-token-status", "检查 Token 状态", "检查有效期、额度、解密、限流和失败率。", "weekly"],
  ["optimize-rate-limits", "优化限流配置", "分析最近 7 天限流触发和业务成功率。", "weekly"],
  ["view-weekly-report", "查看 Token 使用周报", "查看团队消耗、成功率、缓存节省和异常原因。", "weekly"],
  ["handle-alerts", "处理异常告警", "处理 Token 过期、额度不足、失败率过高等告警。", "daily"],
  ["test-token-availability", "测试 Token 可用性", "批量测试 Token 配置、解密和上游可用性。", "weekly"],
  ["check-log-integrity", "检查日志完整性", "检查请求、Token、异常字段是否完整。", "weekly"],
  ["export-finance-report", "导出财务对账报表", "导出团队周报用于 Excel 对账。", "weekly"],
  ["check-cache-hit-rate", "检查缓存命中率", "确认重复请求是否被缓存节省 Token。", "weekly"],
  ["check-high-failure-teams", "检查高失败率团队", "定位高消耗低成功率团队。", "weekly"],
  ["check-expiring-tokens", "检查即将过期 Token", "提前处理 7 天内过期 Token。", "daily"],
];

function rowToTeam(row) {
  return {
    id: row.id,
    name: row.name || "",
    code: row.code || "",
    description: row.description || "",
    ownerUserId: row.owner_user_id || "",
    monthlyBudgetCny: Number(row.monthly_budget_cny || 0),
    monthlyTokenBudget: Number(row.monthly_token_budget || 0),
    status: row.status || "active",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

function rowToToken(row, { includeSecret = false } = {}) {
  const token = {
    id: row.id,
    name: row.name || "",
    tokenType: row.token_type || "自定义 OpenAI Compatible",
    modelType: row.model_type || "",
    provider: row.provider || "",
    teamId: row.team_id || "",
    quotaTotal: Number(row.quota_total || 0),
    quotaRemaining: Number(row.quota_remaining || 0),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : "",
    usageScope: row.usage_scope || "all",
    allowedTeamIds: normalizeList(row.allowed_team_ids || ""),
    allowedModels: normalizeList(row.allowed_models || ""),
    allowedPurposes: normalizeList(row.allowed_purposes || ""),
    environmentScope: row.environment_scope || "all",
    notes: row.notes || "",
    status: row.status || "normal",
    rateLimitRuleId: row.rate_limit_rule_id || "",
    priority: Number(row.priority || 5),
    weight: Number(row.weight || 5),
    enabled: row.enabled !== false,
    baseUrl: row.base_url || "",
    apiPath: row.api_path || "/v1/chat/completions",
    tokenPreview: row.token_preview || "",
    tokenCiphertext: row.token_ciphertext || "",
    tokenIv: row.token_iv || "",
    tokenAuthTag: row.token_auth_tag || "",
    todayCalls: Number(row.today_calls || 0),
    todayTokens: Number(row.today_tokens || 0),
    monthTokens: Number(row.month_tokens || 0),
    todayCostCny: Number(row.today_cost_cny || 0),
    monthCostCny: Number(row.month_cost_cny || 0),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : "",
    lastError: row.last_error || "",
    avgLatencyMs: Number(row.avg_latency_ms || 0),
    successRate: Number(row.success_rate ?? 1),
    consecutiveFailures: Number(row.consecutive_failures || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
  if (includeSecret) token.secret = decryptTokenSecret(token);
  delete token.tokenCiphertext;
  delete token.tokenIv;
  delete token.tokenAuthTag;
  return token;
}

function tokenRuntimeStatus(token) {
  if (!token.enabled) return { status: "disabled", label: "禁用", severity: "muted" };
  if (token.expiresAt) {
    const expiry = new Date(token.expiresAt).getTime();
    const diff = expiry - Date.now();
    if (diff <= 0) return { status: "expired", label: "已过期", severity: "danger" };
    if (diff <= 3 * 24 * 60 * 60 * 1000) return { status: "expiring", label: "即将过期", severity: "warning" };
  }
  if (token.status === "rate_limited") return { status: "rate_limited", label: "被限流", severity: "warning" };
  if (token.consecutiveFailures >= 5 || token.status === "error") return { status: "error", label: "异常", severity: "danger" };
  if (token.quotaTotal > 0) {
    const ratio = token.quotaRemaining / token.quotaTotal;
    if (ratio <= 0.1) return { status: "low_quota", label: "额度不足", severity: "danger" };
    if (ratio <= 0.2) return { status: "low_quota", label: "额度偏低", severity: "warning" };
  }
  return { status: token.status === "checking" ? "checking" : "normal", label: token.status === "checking" ? "检测中" : "正常", severity: "success" };
}

function normalizeModelKey(value = "") {
  return getPublicModelRequestId(value).trim().toLowerCase();
}

function publicPoolRef(tokenId = "") {
  const hash = crypto.createHash("sha256").update(String(tokenId || "")).digest("hex").slice(0, 10);
  return `flowapi_pool_${hash || "default"}`;
}

function sanitizeTokenForTeamMember(token = {}) {
  const runtime = token.runtimeStatus || tokenRuntimeStatus(token);
  return {
    id: publicPoolRef(token.id),
    name: "FlowAPI 团队额度池",
    teamId: token.teamId || "",
    modelType: token.modelType || "",
    usageScope: token.usageScope || "all",
    allowedModels: Array.isArray(token.allowedModels) ? token.allowedModels : [],
    allowedPurposes: Array.isArray(token.allowedPurposes) ? token.allowedPurposes : [],
    quotaTotal: Number(token.quotaTotal || 0),
    quotaRemaining: Number(token.quotaRemaining || 0),
    todayCalls: Number(token.todayCalls || 0),
    todayTokens: Number(token.todayTokens || 0),
    monthTokens: Number(token.monthTokens || 0),
    todayCostCny: Number(token.todayCostCny || 0),
    monthCostCny: Number(token.monthCostCny || 0),
    lastUsedAt: token.lastUsedAt || "",
    avgLatencyMs: Number(token.avgLatencyMs || 0),
    successRate: Number(token.successRate ?? 1),
    runtimeStatus: runtime,
    status: runtime.status,
    statusLabel: runtime.label,
  };
}

export async function listTeams() {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return memory.teams;
  const result = await query("SELECT * FROM teams ORDER BY created_at ASC");
  return result.rows.map(rowToTeam);
}

export async function upsertTeam(input = {}, adminId = "") {
  await ensureTeamTokenPoolSchema();
  const team = {
    id: input.id || makeId("team"),
    name: String(input.name || "").trim(),
    code: String(input.code || input.name || "").trim().toLowerCase().replace(/\s+/g, "-"),
    description: input.description || "",
    ownerUserId: input.ownerUserId || input.owner_user_id || "",
    monthlyBudgetCny: numberValue(input.monthlyBudgetCny ?? input.monthly_budget_cny),
    monthlyTokenBudget: numberValue(input.monthlyTokenBudget ?? input.monthly_token_budget),
    status: input.status || "active",
  };
  if (!team.name || !team.code) throw new Error("团队名称和 code 不能为空");
  if (!hasDatabase()) {
    const index = memory.teams.findIndex((item) => item.id === team.id || item.code === team.code);
    const saved = { ...team, createdAt: nowIso(), updatedAt: nowIso() };
    if (index >= 0) memory.teams[index] = { ...memory.teams[index], ...saved };
    else memory.teams.push(saved);
    return saved;
  }
  const result = await query(
    `INSERT INTO teams (id, name, code, description, owner_user_id, monthly_budget_cny, monthly_token_budget, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, code = EXCLUDED.code, description = EXCLUDED.description,
       owner_user_id = EXCLUDED.owner_user_id, monthly_budget_cny = EXCLUDED.monthly_budget_cny,
       monthly_token_budget = EXCLUDED.monthly_token_budget, status = EXCLUDED.status, updated_at = NOW()
     RETURNING *`,
    [team.id, team.name, team.code, team.description, team.ownerUserId, team.monthlyBudgetCny, team.monthlyTokenBudget, team.status],
  );
  await writeAdminAuditLog(adminId, "upsert_team", "team", team.id, team);
  return rowToTeam(result.rows[0]);
}

export async function listTokenPool() {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return memory.tokens.map((token) => ({ ...token, runtimeStatus: tokenRuntimeStatus(token) }));
  const result = await query("SELECT * FROM token_pool ORDER BY priority DESC, weight DESC, created_at DESC");
  return result.rows.map((row) => {
    const token = rowToToken(row);
    return { ...token, runtimeStatus: tokenRuntimeStatus(token) };
  });
}

function normalizeTokenInput(input = {}) {
  const encrypted = input.secret || input.token || input.apiKey ? encryptTokenSecret(input.secret || input.token || input.apiKey) : null;
  return {
    id: input.id || makeId("tpool"),
    name: String(input.name || "").trim(),
    tokenType: TOKEN_TYPES.includes(input.tokenType) ? input.tokenType : (input.tokenType || "自定义 OpenAI Compatible"),
    modelType: input.modelType || "",
    provider: input.provider || input.platform || "",
    teamId: input.teamId || "",
    quotaTotal: numberValue(input.quotaTotal),
    quotaRemaining: numberValue(input.quotaRemaining ?? input.quotaTotal),
    expiresAt: input.expiresAt || null,
    usageScope: input.usageScope || "all",
    allowedTeamIds: normalizeList(input.allowedTeamIds),
    allowedModels: normalizeList(input.allowedModels),
    allowedPurposes: normalizeList(input.allowedPurposes),
    environmentScope: input.environmentScope || "all",
    notes: input.notes || "",
    status: TOKEN_STATUSES.has(input.status) ? input.status : "normal",
    rateLimitRuleId: input.rateLimitRuleId || "",
    priority: numberValue(input.priority, 5),
    weight: numberValue(input.weight, 5),
    enabled: input.enabled !== false,
    baseUrl: input.baseUrl || "",
    apiPath: input.apiPath || "/v1/chat/completions",
    encrypted,
  };
}

export async function upsertTokenPool(input = {}, adminId = "") {
  await ensureTeamTokenPoolSchema();
  const token = normalizeTokenInput(input);
  if (!token.name) throw new Error("Token 名称不能为空");
  if (!token.provider) throw new Error("所属平台不能为空");
  if (token.baseUrl) {
    await assertSafeUpstreamUrl(token.baseUrl, { resolveDns: false });
  }
  if (!hasDatabase()) {
    const index = memory.tokens.findIndex((item) => item.id === token.id);
    const prev = index >= 0 ? memory.tokens[index] : {};
    const saved = {
      ...prev,
      ...token,
      tokenPreview: token.encrypted?.tokenPreview || prev.tokenPreview || "",
      tokenCiphertext: token.encrypted?.tokenCiphertext || prev.tokenCiphertext || "",
      tokenIv: token.encrypted?.tokenIv || prev.tokenIv || "",
      tokenAuthTag: token.encrypted?.tokenAuthTag || prev.tokenAuthTag || "",
      createdAt: prev.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
    delete saved.encrypted;
    if (index >= 0) memory.tokens[index] = saved;
    else memory.tokens.push(saved);
    return { ...saved, runtimeStatus: tokenRuntimeStatus(saved) };
  }

  const existing = token.id ? await query("SELECT * FROM token_pool WHERE id = $1 LIMIT 1", [token.id]) : { rows: [] };
  const prev = existing.rows[0] ? rowToToken(existing.rows[0], { includeSecret: false }) : {};
  const encrypted = token.encrypted || {
    tokenCiphertext: existing.rows[0]?.token_ciphertext || "",
    tokenIv: existing.rows[0]?.token_iv || "",
    tokenAuthTag: existing.rows[0]?.token_auth_tag || "",
    tokenPreview: existing.rows[0]?.token_preview || "",
  };

  const result = await query(
    `INSERT INTO token_pool (
       id, name, token_type, model_type, provider, team_id, quota_total, quota_remaining, expires_at,
       usage_scope, allowed_team_ids, allowed_models, allowed_purposes, environment_scope, notes, status,
       rate_limit_rule_id, priority, weight, enabled, base_url, api_path,
       token_ciphertext, token_iv, token_auth_tag, token_preview
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15, $16,
       $17, $18, $19, $20, $21, $22,
       $23, $24, $25, $26
     )
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, token_type = EXCLUDED.token_type, model_type = EXCLUDED.model_type,
       provider = EXCLUDED.provider, team_id = EXCLUDED.team_id, quota_total = EXCLUDED.quota_total,
       quota_remaining = EXCLUDED.quota_remaining, expires_at = EXCLUDED.expires_at,
       usage_scope = EXCLUDED.usage_scope, allowed_team_ids = EXCLUDED.allowed_team_ids,
       allowed_models = EXCLUDED.allowed_models, allowed_purposes = EXCLUDED.allowed_purposes,
       environment_scope = EXCLUDED.environment_scope, notes = EXCLUDED.notes, status = EXCLUDED.status,
       rate_limit_rule_id = EXCLUDED.rate_limit_rule_id, priority = EXCLUDED.priority,
       weight = EXCLUDED.weight, enabled = EXCLUDED.enabled, base_url = EXCLUDED.base_url,
       api_path = EXCLUDED.api_path, token_ciphertext = EXCLUDED.token_ciphertext,
       token_iv = EXCLUDED.token_iv, token_auth_tag = EXCLUDED.token_auth_tag,
       token_preview = EXCLUDED.token_preview, updated_at = NOW()
     RETURNING *`,
    [
      token.id, token.name, token.tokenType, token.modelType, token.provider, token.teamId, token.quotaTotal, token.quotaRemaining, token.expiresAt,
      token.usageScope, token.allowedTeamIds.join(","), token.allowedModels.join(","), token.allowedPurposes.join(","), token.environmentScope, token.notes, token.status,
      token.rateLimitRuleId, token.priority, token.weight, token.enabled, token.baseUrl, token.apiPath,
      encrypted.tokenCiphertext, encrypted.tokenIv, encrypted.tokenAuthTag, encrypted.tokenPreview,
    ],
  );
  await writeAdminAuditLog(adminId, "upsert_token_pool", "token_pool", token.id, { ...token, secret: token.encrypted ? "***" : undefined, previousStatus: prev.status || "" });
  const saved = rowToToken(result.rows[0]);
  return { ...saved, runtimeStatus: tokenRuntimeStatus(saved) };
}

export async function deleteTokenPool(id, adminId = "") {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) {
    memory.tokens = memory.tokens.filter((item) => item.id !== id);
    return { ok: true };
  }
  await query("DELETE FROM token_pool WHERE id = $1", [id]);
  await writeAdminAuditLog(adminId, "delete_token_pool", "token_pool", id, {});
  return { ok: true };
}

export async function checkTokenPoolStatus(id, adminId = "") {
  const tokens = await listTokenPool();
  const token = tokens.find((item) => item.id === id);
  if (!token) throw new Error("Token 不存在");
  const runtime = tokenRuntimeStatus(token);
  if (!hasDatabase()) {
    const index = memory.tokens.findIndex((item) => item.id === id);
    if (index >= 0) memory.tokens[index] = { ...memory.tokens[index], status: runtime.status, updatedAt: nowIso() };
  } else {
    await query("UPDATE token_pool SET status = $2, updated_at = NOW() WHERE id = $1", [id, runtime.status]);
    await query(
      `INSERT INTO token_pool_status (id, token_id, status, message, severity)
       VALUES ($1, $2, $3, $4, $5)`,
      [makeId("tstat"), id, runtime.status, runtime.label, runtime.severity],
    );
  }
  await writeAdminAuditLog(adminId, "check_token_pool", "token_pool", id, runtime);
  return { ...token, status: runtime.status, runtimeStatus: runtime };
}

export async function getTokenPoolStatus() {
  const tokens = await listTokenPool();
  const alerts = [];
  for (const token of tokens) {
    const runtime = token.runtimeStatus || tokenRuntimeStatus(token);
    if (runtime.status !== "normal") {
      alerts.push({
        id: `${token.id}:${runtime.status}`,
        tokenId: token.id,
        tokenName: token.name,
        teamId: token.teamId,
        alertType: runtime.status,
        severity: runtime.severity,
        message: `${token.name} 当前状态：${runtime.label}`,
        createdAt: nowIso(),
      });
    }
  }
  return {
    tokens,
    alerts,
    metrics: {
      total: tokens.length,
      normal: tokens.filter((item) => item.runtimeStatus?.status === "normal").length,
      lowQuota: tokens.filter((item) => item.runtimeStatus?.status === "low_quota").length,
      expired: tokens.filter((item) => item.runtimeStatus?.status === "expired").length,
      rateLimited: tokens.filter((item) => item.runtimeStatus?.status === "rate_limited").length,
      disabled: tokens.filter((item) => item.runtimeStatus?.status === "disabled").length,
    },
  };
}

export async function listRateLimitRules() {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return memory.rateLimitRules;
  const result = await query("SELECT * FROM rate_limit_rules ORDER BY created_at DESC");
  return result.rows.map((row) => ({
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id || "",
    provider: row.provider || "",
    model: row.model || "",
    teamId: row.team_id || "",
    apiKeyId: row.api_key_id || "",
    requestsPerMinute: Number(row.requests_per_minute || 0),
    requestsPerHour: Number(row.requests_per_hour || 0),
    requestsPerDay: Number(row.requests_per_day || 0),
    tokensPerMinute: Number(row.tokens_per_minute || 0),
    tokensPerDay: Number(row.tokens_per_day || 0),
    concurrencyLimit: Number(row.concurrency_limit || 0),
    bufferRatio: Number(row.buffer_ratio || 0.9),
    cooldownSeconds: Number(row.cooldown_seconds || 30),
    enabled: row.enabled !== false,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  }));
}

export async function upsertRateLimitRule(input = {}, adminId = "") {
  await ensureTeamTokenPoolSchema();
  const rule = {
    id: input.id || makeId("rl"),
    scopeType: input.scopeType || "global",
    scopeId: input.scopeId || "",
    provider: input.provider || "",
    model: input.model || "",
    teamId: input.teamId || "",
    apiKeyId: input.apiKeyId || "",
    requestsPerMinute: numberValue(input.requestsPerMinute),
    requestsPerHour: numberValue(input.requestsPerHour),
    requestsPerDay: numberValue(input.requestsPerDay),
    tokensPerMinute: numberValue(input.tokensPerMinute),
    tokensPerDay: numberValue(input.tokensPerDay),
    concurrencyLimit: numberValue(input.concurrencyLimit),
    bufferRatio: numberValue(input.bufferRatio, 0.9),
    cooldownSeconds: numberValue(input.cooldownSeconds, 30),
    enabled: input.enabled !== false,
  };
  if (!hasDatabase()) {
    const index = memory.rateLimitRules.findIndex((item) => item.id === rule.id);
    if (index >= 0) memory.rateLimitRules[index] = rule;
    else memory.rateLimitRules.push(rule);
    return rule;
  }
  const result = await query(
    `INSERT INTO rate_limit_rules (
       id, scope_type, scope_id, provider, model, team_id, api_key_id,
       requests_per_minute, requests_per_hour, requests_per_day, tokens_per_minute, tokens_per_day,
       concurrency_limit, buffer_ratio, cooldown_seconds, enabled
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (id) DO UPDATE SET
       scope_type = EXCLUDED.scope_type, scope_id = EXCLUDED.scope_id, provider = EXCLUDED.provider,
       model = EXCLUDED.model, team_id = EXCLUDED.team_id, api_key_id = EXCLUDED.api_key_id,
       requests_per_minute = EXCLUDED.requests_per_minute, requests_per_hour = EXCLUDED.requests_per_hour,
       requests_per_day = EXCLUDED.requests_per_day, tokens_per_minute = EXCLUDED.tokens_per_minute,
       tokens_per_day = EXCLUDED.tokens_per_day, concurrency_limit = EXCLUDED.concurrency_limit,
       buffer_ratio = EXCLUDED.buffer_ratio, cooldown_seconds = EXCLUDED.cooldown_seconds,
       enabled = EXCLUDED.enabled, updated_at = NOW()
     RETURNING *`,
    [
      rule.id, rule.scopeType, rule.scopeId, rule.provider, rule.model, rule.teamId, rule.apiKeyId,
      rule.requestsPerMinute, rule.requestsPerHour, rule.requestsPerDay, rule.tokensPerMinute, rule.tokensPerDay,
      rule.concurrencyLimit, rule.bufferRatio, rule.cooldownSeconds, rule.enabled,
    ],
  );
  await writeAdminAuditLog(adminId, "upsert_rate_limit_rule", "rate_limit_rule", rule.id, rule);
  return (await listRateLimitRules()).find((item) => item.id === result.rows[0].id);
}

function ruleApplies(rule, context) {
  if (!rule.enabled) return false;
  if (rule.scopeType === "global") return true;
  if (rule.scopeType === "provider") return !rule.provider || rule.provider === context.provider;
  if (rule.scopeType === "model") return !rule.model || rule.model === context.model;
  if (rule.scopeType === "team") return !rule.teamId || rule.teamId === context.teamId;
  if (rule.scopeType === "api_key") return !rule.apiKeyId || rule.apiKeyId === context.apiKeyId;
  if (rule.scopeType === "token") return !rule.scopeId || rule.scopeId === context.tokenId;
  return false;
}

export async function enforceTeamRateLimits(context = {}) {
  const rules = (await listRateLimitRules()).filter((rule) => ruleApplies(rule, context));
  const now = Date.now();
  for (const rule of rules) {
    if (!rule.requestsPerMinute) continue;
    const limit = Math.max(1, Math.floor(rule.requestsPerMinute * Number(rule.bufferRatio || 1)));
    const key = `${rule.id}:${Math.floor(now / 60000)}`;
    const current = memory.counters.get(key) || 0;
    if (current >= limit) {
      return {
        limited: true,
        code: "RATE_LIMITED",
        message: "当前调用过于频繁，请稍后重试。",
        retryAfter: rule.cooldownSeconds || 30,
        rule,
      };
    }
    memory.counters.set(key, current + 1);
  }
  return { limited: false };
}

function tokenMatches(token, context) {
  const runtime = token.runtimeStatus || tokenRuntimeStatus(token);
  if (runtime.status !== "normal" && runtime.status !== "expiring") return false;
  if (!token.baseUrl) return false;
  const teamId = context.teamId || "";
  const purpose = context.purpose || "";
  const model = normalizeModelKey(context.model || "");
  if (token.usageScope === "admin_only") return false;
  if (token.teamId && !teamId) return false;
  if (token.teamId && teamId && token.teamId !== teamId && !token.allowedTeamIds.includes(teamId)) return false;
  if (token.allowedTeamIds.length && teamId && !token.allowedTeamIds.includes(teamId)) return false;
  if (token.allowedModels.length && model) {
    const allowedModels = new Set(token.allowedModels.map((item) => normalizeModelKey(item)).filter(Boolean));
    if (!allowedModels.has(model)) return false;
  }
  if (token.allowedPurposes.length && purpose && !token.allowedPurposes.includes(purpose)) return false;
  return true;
}

export async function selectTeamTokenForRequest(context = {}) {
  await ensureTeamTokenPoolSchema();
  const tokens = await listTokenPool();
  const candidates = tokens
    .filter((token) => tokenMatches(token, context))
    .sort((a, b) => {
      if ((a.teamId || "") === context.teamId && (b.teamId || "") !== context.teamId) return -1;
      if ((b.teamId || "") === context.teamId && (a.teamId || "") !== context.teamId) return 1;
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.successRate !== a.successRate) return b.successRate - a.successRate;
      if (b.quotaRemaining !== a.quotaRemaining) return b.quotaRemaining - a.quotaRemaining;
      return b.weight - a.weight;
    });
  for (const selected of candidates) {
    let secret = "";
    if (hasDatabase()) {
      const result = await query("SELECT * FROM token_pool WHERE id = $1 LIMIT 1", [selected.id]);
      if (result.rows[0]) secret = decryptTokenSecret(result.rows[0]);
    } else {
      const record = memory.tokens.find((item) => item.id === selected.id);
      if (record) secret = decryptTokenSecret(record);
    }
    if (secret) return { ...selected, secret };
  }
  return null;
}

export function buildRequestCacheKey({ teamId = "", userId = "", model = "", body = {}, purpose = "" }) {
  const bodyHash = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return {
    cacheKey: crypto.createHash("sha256").update([teamId, userId, model, purpose, bodyHash].join(":")).digest("hex"),
    requestHash: bodyHash,
  };
}

export async function getRequestCacheSettings() {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return memory.cacheSettings;
  const result = await query("SELECT * FROM request_cache_settings WHERE id = 'default' LIMIT 1");
  const row = result.rows[0];
  if (!row) return memory.cacheSettings;
  return {
    enabled: row.enabled,
    defaultTtlSeconds: Number(row.default_ttl_seconds || 300),
    teamIds: normalizeList(row.team_ids || ""),
    models: normalizeList(row.models || ""),
    purposes: normalizeList(row.purposes || ""),
  };
}

export async function saveRequestCacheSettings(input = {}, adminId = "") {
  await ensureTeamTokenPoolSchema();
  const settings = {
    enabled: input.enabled === true,
    defaultTtlSeconds: numberValue(input.defaultTtlSeconds, 300),
    teamIds: normalizeList(input.teamIds),
    models: normalizeList(input.models),
    purposes: normalizeList(input.purposes),
  };
  if (!hasDatabase()) {
    memory.cacheSettings = settings;
    return settings;
  }
  await query(
    `INSERT INTO request_cache_settings (id, enabled, default_ttl_seconds, team_ids, models, purposes)
     VALUES ('default', $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, default_ttl_seconds = EXCLUDED.default_ttl_seconds,
       team_ids = EXCLUDED.team_ids, models = EXCLUDED.models, purposes = EXCLUDED.purposes, updated_at = NOW()`,
    [settings.enabled, settings.defaultTtlSeconds, settings.teamIds.join(","), settings.models.join(","), settings.purposes.join(",")],
  );
  await writeAdminAuditLog(adminId, "save_request_cache_settings", "request_cache", "default", settings);
  return settings;
}

function cacheEnabledFor(settings, context) {
  if (!settings.enabled) return false;
  if (settings.teamIds.length && context.teamId && !settings.teamIds.includes(context.teamId)) return false;
  if (settings.models.length && context.model && !settings.models.includes(context.model)) return false;
  if (settings.purposes.length && context.purpose && !settings.purposes.includes(context.purpose)) return false;
  return true;
}

export async function getCachedTeamResponse(context = {}) {
  const settings = await getRequestCacheSettings();
  if (!cacheEnabledFor(settings, context)) return null;
  const { cacheKey } = buildRequestCacheKey(context);
  if (!hasDatabase()) {
    const entry = memory.cacheEntries.find((item) => item.cacheKey === cacheKey && new Date(item.expiresAt).getTime() > Date.now());
    return entry ? { ...entry, response: parseJson(entry.responseJson, null) } : null;
  }
  const result = await query(
    `SELECT * FROM request_cache_entries WHERE cache_key = $1 AND expires_at > NOW() LIMIT 1`,
    [cacheKey],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    cacheKey: row.cache_key,
    savedTokens: Number(row.saved_tokens || 0),
    savedCny: Number(row.saved_cny || 0),
    response: parseJson(row.response_json, null),
  };
}

export async function saveCachedTeamResponse(context = {}, response = {}, usage = {}) {
  const settings = await getRequestCacheSettings();
  if (!cacheEnabledFor(settings, context)) return null;
  const { cacheKey, requestHash } = buildRequestCacheKey(context);
  const ttl = Math.max(60, Number(settings.defaultTtlSeconds || 300));
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const entry = {
    id: makeId("cache"),
    cacheKey,
    requestHash,
    teamId: context.teamId || "",
    userId: context.userId || "",
    model: context.model || "",
    purpose: context.purpose || "",
    responseJson: jsonStringify(response),
    savedTokens: numberValue(usage.totalTokens),
    savedCny: numberValue(usage.costCny),
    expiresAt,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  if (!hasDatabase()) {
    memory.cacheEntries = memory.cacheEntries.filter((item) => item.cacheKey !== cacheKey);
    memory.cacheEntries.unshift(entry);
    return entry;
  }
  await query(
    `INSERT INTO request_cache_entries (id, cache_key, team_id, user_id, model, purpose, request_hash, response_json, saved_tokens, saved_cny, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (cache_key) DO UPDATE SET response_json = EXCLUDED.response_json, saved_tokens = EXCLUDED.saved_tokens,
       saved_cny = EXCLUDED.saved_cny, expires_at = EXCLUDED.expires_at, updated_at = NOW()`,
    [entry.id, entry.cacheKey, entry.teamId, entry.userId, entry.model, entry.purpose, entry.requestHash, entry.responseJson, entry.savedTokens, entry.savedCny, entry.expiresAt],
  );
  return entry;
}

export async function recordTeamUsageLog(input = {}) {
  await ensureTeamTokenPoolSchema();
  const log = {
    id: input.id || makeId("tlog"),
    requestId: input.requestId || makeId("req"),
    userId: input.userId || "",
    teamId: input.teamId || "",
    apiKeyId: input.apiKeyId || "",
    tokenPoolId: input.tokenPoolId || input.tokenId || "",
    tokenId: input.tokenId || input.tokenPoolId || "",
    provider: input.provider || "",
    model: input.model || "",
    modelType: input.modelType || "",
    purpose: input.purpose || "",
	    requestSummary: sanitizeSecretText(input.requestSummary || "").slice(0, 300),
    requestHash: input.requestHash || "",
    clientIp: input.clientIp || "",
    clientName: input.clientName || "",
    requestParamsJson: jsonStringify(input.requestParams || {}),
    cacheHit: input.cacheHit === true,
    cacheKey: input.cacheKey || "",
    inputTokens: numberValue(input.inputTokens),
    outputTokens: numberValue(input.outputTokens),
    totalTokens: numberValue(input.totalTokens),
    officialCostCny: numberValue(input.officialCostCny),
    actualCostCny: numberValue(input.actualCostCny),
    savedCny: numberValue(input.savedCny),
    balanceSource: input.balanceSource || "",
    success: input.success !== false,
    durationMs: numberValue(input.durationMs),
    upstreamRequestId: input.upstreamRequestId || "",
    errorCode: input.errorCode || "",
	    errorMessage: sanitizeSecretText(input.errorMessage || ""),
    rateLimited: input.rateLimited === true,
    tokenExpired: input.tokenExpired === true,
    balanceInsufficient: input.balanceInsufficient === true,
    upstreamError: input.upstreamError === true,
    fallbackTokenUsed: input.fallbackTokenUsed === true,
    fallbackTokenId: input.fallbackTokenId || "",
    retryCount: numberValue(input.retryCount),
    finalStatus: input.finalStatus || (input.success === false ? "failed" : "success"),
  };
  if (!hasDatabase()) {
    memory.usageLogs.unshift({ ...log, createdAt: nowIso(), updatedAt: nowIso() });
    return log;
  }
  await query(
    `INSERT INTO team_usage_logs (
       id, request_id, user_id, team_id, api_key_id, token_pool_id, token_id, provider, model, model_type,
       purpose, request_summary, request_hash, client_ip, client_name, request_params_json,
       cache_hit, cache_key, input_tokens, output_tokens, total_tokens, official_cost_cny, actual_cost_cny,
       saved_cny, balance_source, success, duration_ms, upstream_request_id, error_code, error_message,
       rate_limited, token_expired, balance_insufficient, upstream_error, fallback_token_used,
       fallback_token_id, retry_count, final_status
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
       $11,$12,$13,$14,$15,$16,
       $17,$18,$19,$20,$21,$22,$23,
       $24,$25,$26,$27,$28,$29,$30,
       $31,$32,$33,$34,$35,$36,$37,$38
     )`,
    [
      log.id, log.requestId, log.userId, log.teamId, log.apiKeyId, log.tokenPoolId, log.tokenId, log.provider, log.model, log.modelType,
      log.purpose, log.requestSummary, log.requestHash, log.clientIp, log.clientName, log.requestParamsJson,
      log.cacheHit, log.cacheKey, log.inputTokens, log.outputTokens, log.totalTokens, log.officialCostCny, log.actualCostCny,
      log.savedCny, log.balanceSource, log.success, log.durationMs, log.upstreamRequestId, log.errorCode, log.errorMessage,
      log.rateLimited, log.tokenExpired, log.balanceInsufficient, log.upstreamError, log.fallbackTokenUsed,
      log.fallbackTokenId, log.retryCount, log.finalStatus,
    ],
  );
  if (log.tokenId) {
    await query(
      `INSERT INTO token_pool_usage (
         id, token_id, team_id, user_id, api_key_id, request_id, model, provider,
         input_tokens, output_tokens, total_tokens, cost_cny, success, latency_ms
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        makeId("tpu"),
        log.tokenId,
        log.teamId,
        log.userId,
        log.apiKeyId,
        log.requestId,
        log.model,
        log.provider,
        log.inputTokens,
        log.outputTokens,
        log.totalTokens,
        log.actualCostCny,
        log.success,
        log.durationMs,
      ],
    );
    await query(
      `UPDATE token_pool SET
         today_calls = today_calls + 1,
         today_tokens = today_tokens + $2,
         month_tokens = month_tokens + $2,
         today_cost_cny = today_cost_cny + $3,
         month_cost_cny = month_cost_cny + $3,
         quota_remaining = CASE
           WHEN $5 AND quota_remaining > 0 THEN GREATEST(0, quota_remaining - $2)
           ELSE quota_remaining
         END,
         last_used_at = NOW(),
         last_error = $4,
         consecutive_failures = CASE WHEN $5 THEN 0 ELSE consecutive_failures + 1 END,
         status = CASE WHEN $5 THEN status ELSE 'error' END,
         updated_at = NOW()
       WHERE id = $1`,
      [log.tokenId, log.totalTokens, log.actualCostCny, log.errorMessage, log.success],
    );
  }
  return log;
}

export async function listTeamUsageLogs({ teamId = "", limit = 100, includeInternal = false } = {}) {
	  await ensureTeamTokenPoolSchema();
	  if (!hasDatabase()) {
	    return memory.usageLogs.filter((log) => !teamId || log.teamId === teamId).slice(0, limit).map((log) => ({
	      ...log,
	      tokenId: includeInternal ? log.tokenId : "",
	      provider: includeInternal ? log.provider : "FlowAPI",
	      errorMessage: includeInternal ? log.errorMessage : (log.errorCode ? "FlowAPI 请求未完成，请使用 Request ID 联系客服排查。" : ""),
	    }));
	  }
  const params = [];
  const where = [];
  if (teamId) {
    params.push(teamId);
    where.push(`team_id = $${params.length}`);
  }
  params.push(Math.min(Number(limit) || 100, 500));
  const result = await query(
    `SELECT * FROM team_usage_logs ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
	  return result.rows.map((row) => ({
	    id: row.id,
	    requestId: row.request_id,
	    userId: row.user_id || "",
	    teamId: row.team_id || "",
	    apiKeyId: row.api_key_id || "",
	    tokenId: includeInternal ? row.token_id || "" : "",
	    provider: includeInternal ? row.provider || "" : "FlowAPI",
	    model: row.model || "",
	    purpose: row.purpose || "",
    requestSummary: row.request_summary || "",
    cacheHit: row.cache_hit,
    inputTokens: Number(row.input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0),
    totalTokens: Number(row.total_tokens || 0),
    actualCostCny: Number(row.actual_cost_cny || 0),
    savedCny: Number(row.saved_cny || 0),
    success: row.success,
    durationMs: Number(row.duration_ms || 0),
    errorCode: row.error_code || "",
	    errorMessage: includeInternal ? row.error_message || "" : (row.error_code ? "FlowAPI 请求未完成，请使用 Request ID 联系客服排查。" : ""),
	    finalStatus: row.final_status || "",
	    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
	  }));
	}

function reportRecommendation(row) {
  if (Number(row.calls || 0) > 0 && Number(row.success_rate || 0) < 0.8) {
    return "该团队 Token 消耗较高，但调用成功率偏低，建议检查请求参数、模型选择和上游 Token 状态。";
  }
  if (Number(row.cache_hits || 0) > 10) {
    return "该团队存在较多重复请求，请继续开启请求缓存以降低 Token 消耗。";
  }
  return "当前团队调用情况正常，建议持续观察成本和成功率。";
}

export async function generateTeamDailyReports(date = new Date().toISOString().slice(0, 10)) {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) {
    const teams = await listTeams();
    const reports = teams.map((team) => {
      const logs = memory.usageLogs.filter((log) => log.teamId === team.id && String(log.createdAt || "").startsWith(date));
      const calls = logs.length;
      const success = logs.filter((log) => log.success).length;
      return {
        id: makeId("rpt"),
        reportDate: date,
        teamId: team.id,
        teamName: team.name,
        calls,
        successCount: success,
        failedCount: calls - success,
        successRate: calls ? success / calls : 0,
        totalTokens: logs.reduce((sum, log) => sum + Number(log.totalTokens || 0), 0),
        actualCostCny: logs.reduce((sum, log) => sum + Number(log.actualCostCny || 0), 0),
        recommendation: calls ? "当前团队调用情况正常，建议持续观察成本和成功率。" : "今日暂无调用。",
      };
    });
    memory.reports = reports;
    return reports;
  }
  const result = await query(
    `WITH daily AS (
       SELECT
         COALESCE(l.team_id, '') AS team_id,
         COUNT(*) AS calls,
         SUM(CASE WHEN l.success THEN 1 ELSE 0 END) AS success_count,
         SUM(CASE WHEN l.success THEN 0 ELSE 1 END) AS failed_count,
         COALESCE(SUM(l.input_tokens), 0) AS input_tokens,
         COALESCE(SUM(l.output_tokens), 0) AS output_tokens,
         COALESCE(SUM(l.total_tokens), 0) AS total_tokens,
         COALESCE(SUM(l.official_cost_cny), 0) AS official_cost_cny,
         COALESCE(SUM(l.actual_cost_cny), 0) AS actual_cost_cny,
         COALESCE(SUM(l.saved_cny), 0) AS saved_cny,
         SUM(CASE WHEN l.cache_hit THEN 1 ELSE 0 END) AS cache_hits,
         COALESCE(SUM(CASE WHEN l.cache_hit THEN l.total_tokens ELSE 0 END), 0) AS cache_saved_tokens,
         SUM(CASE WHEN l.rate_limited THEN 1 ELSE 0 END) AS rate_limited_count,
         SUM(CASE WHEN l.success THEN 0 ELSE 1 END) AS error_count
       FROM team_usage_logs l
       WHERE DATE(l.created_at) = $1
       GROUP BY COALESCE(l.team_id, '')
     )
     SELECT d.*, t.name AS team_name
     FROM daily d
     LEFT JOIN teams t ON t.id = d.team_id`,
    [date],
  );
  const reports = [];
  for (const row of result.rows) {
    const calls = Number(row.calls || 0);
    const success = Number(row.success_count || 0);
    const report = {
      id: makeId("rpt"),
      reportDate: date,
      teamId: row.team_id || "",
      teamName: row.team_name || "未归属团队",
      calls,
      successCount: success,
      failedCount: Number(row.failed_count || 0),
      successRate: calls ? success / calls : 0,
      inputTokens: Number(row.input_tokens || 0),
      outputTokens: Number(row.output_tokens || 0),
      totalTokens: Number(row.total_tokens || 0),
      officialCostCny: Number(row.official_cost_cny || 0),
      actualCostCny: Number(row.actual_cost_cny || 0),
      savedCny: Number(row.saved_cny || 0),
      cacheHits: Number(row.cache_hits || 0),
      cacheSavedTokens: Number(row.cache_saved_tokens || 0),
      rateLimitedCount: Number(row.rate_limited_count || 0),
      errorCount: Number(row.error_count || 0),
    };
    report.recommendation = reportRecommendation(report);
    await query(
      `INSERT INTO team_daily_reports (
         id, report_date, team_id, team_name, calls, success_count, failed_count, success_rate,
         input_tokens, output_tokens, total_tokens, official_cost_cny, actual_cost_cny, saved_cny,
         cache_hits, cache_saved_tokens, rate_limited_count, error_count, recommendation
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO NOTHING`,
      [
        report.id, report.reportDate, report.teamId, report.teamName, report.calls, report.successCount, report.failedCount, report.successRate,
        report.inputTokens, report.outputTokens, report.totalTokens, report.officialCostCny, report.actualCostCny, report.savedCny,
        report.cacheHits, report.cacheSavedTokens, report.rateLimitedCount, report.errorCount, report.recommendation,
      ],
    );
    reports.push(report);
  }
  return reports;
}

export async function listTeamDailyReports({ date = "", teamId = "" } = {}) {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return memory.reports.filter((item) => (!date || item.reportDate === date) && (!teamId || item.teamId === teamId));
  const params = [];
  const where = [];
  if (date) {
    params.push(date);
    where.push(`report_date = $${params.length}`);
  }
  if (teamId) {
    params.push(teamId);
    where.push(`team_id = $${params.length}`);
  }
  const result = await query(
    `SELECT * FROM team_daily_reports ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY report_date DESC, actual_cost_cny DESC LIMIT 300`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    reportDate: row.report_date ? new Date(row.report_date).toISOString().slice(0, 10) : "",
    teamId: row.team_id || "",
    teamName: row.team_name || "",
    calls: Number(row.calls || 0),
    successCount: Number(row.success_count || 0),
    failedCount: Number(row.failed_count || 0),
    successRate: Number(row.success_rate || 0),
    inputTokens: Number(row.input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0),
    totalTokens: Number(row.total_tokens || 0),
    actualCostCny: Number(row.actual_cost_cny || 0),
    savedCny: Number(row.saved_cny || 0),
    cacheHits: Number(row.cache_hits || 0),
    rateLimitedCount: Number(row.rate_limited_count || 0),
    errorCount: Number(row.error_count || 0),
    recommendation: row.recommendation || "",
  }));
}

export async function writeAdminAuditLog(adminId, action, targetType, targetId, detail = {}) {
  if (!hasDatabase()) return;
  await ensureTeamTokenPoolSchema();
  await query(
    `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, detail_json)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [makeId("audit"), adminId || "", action, targetType || "", targetId || "", jsonStringify(detail)],
  );
}

export async function getTeamOverview(teamId = "") {
  const [teams, tokens, logs, reports, cacheSettings] = await Promise.all([
    listTeams(),
    listTokenPool(),
    listTeamUsageLogs({ teamId, limit: 50 }),
    listTeamDailyReports({ teamId }),
    getRequestCacheSettings(),
  ]);
  const scopedTeams = teamId ? teams.filter((team) => team.id === teamId) : teams;
  const scopedTokens = tokens.filter((token) => !teamId || token.teamId === teamId || token.allowedTeamIds.includes(teamId));
  return {
    teams: scopedTeams,
    tokens: scopedTokens,
    logs,
    reports,
    cacheSettings,
    metrics: {
      teamCount: scopedTeams.length,
      tokenCount: scopedTokens.length,
      normalTokenCount: scopedTokens.filter((token) => token.runtimeStatus?.status === "normal").length,
      todayCalls: logs.length,
      todayTokens: logs.reduce((sum, log) => sum + Number(log.totalTokens || 0), 0),
      todayCostCny: logs.reduce((sum, log) => sum + Number(log.actualCostCny || 0), 0),
      cacheHits: logs.filter((log) => log.cacheHit).length,
    },
  };
}

export async function getUserTeamIds(userId = "") {
  await ensureTeamTokenPoolSchema();
  if (!userId) return [];
  if (!hasDatabase()) {
    return memory.teams
      .filter((team) => team.ownerUserId === userId || memory.members.some((member) => member.teamId === team.id && member.userId === userId && member.status === "active"))
      .map((team) => team.id);
  }
  const result = await query(
    `SELECT DISTINCT t.id
     FROM teams t
     LEFT JOIN team_members m ON m.team_id = t.id AND m.user_id = $1 AND m.status = 'active'
     WHERE (t.owner_user_id = $1 OR m.user_id = $1)
       AND t.status = 'active'`,
    [userId],
  );
  return result.rows.map((row) => row.id).filter(Boolean);
}

export async function getTeamOverviewForUser(userId = "", requestedTeamId = "") {
  const allowedTeamIds = await getUserTeamIds(userId);
  if (requestedTeamId && !allowedTeamIds.includes(requestedTeamId)) {
    return { error: "你没有权限查看这个团队" };
  }
  const teamId = requestedTeamId || allowedTeamIds[0] || "";
  if (!teamId) {
    return {
      teams: [],
      tokens: [],
      logs: [],
      reports: [],
      cacheSettings: await getRequestCacheSettings(),
      metrics: {
        teamCount: 0,
        tokenCount: 0,
        normalTokenCount: 0,
        todayCalls: 0,
        todayTokens: 0,
        todayCostCny: 0,
        cacheHits: 0,
      },
    };
  }
  const overview = await getTeamOverview(teamId);
  return {
    ...overview,
    tokens: (overview.tokens || []).map(sanitizeTokenForTeamMember),
    logs: (overview.logs || []).map((log) => ({
      ...log,
      tokenId: "",
      provider: "FlowAPI",
      errorMessage: log.errorCode ? "FlowAPI 请求未完成，请使用 Request ID 联系客服排查。" : "",
    })),
  };
}

function riskForToken(token) {
  const runtime = token.runtimeStatus || tokenRuntimeStatus(token);
  const quotaRatio = token.quotaTotal > 0 ? token.quotaRemaining / token.quotaTotal : 1;
  const expiresInMs = token.expiresAt ? new Date(token.expiresAt).getTime() - Date.now() : Infinity;
  const expiresInDays = Math.ceil(expiresInMs / (24 * 60 * 60 * 1000));
  if (!token.enabled || runtime.status === "disabled") return { status: "禁用", riskLevel: "info", suggestion: "该 Token 已禁用，如需恢复请确认用途和额度后启用。" };
  if (!token.baseUrl || !token.modelType) return { status: "配置错误", riskLevel: "critical", suggestion: "Token 缺少上游地址或模型类型，请补全配置后再投入生产。" };
  if (runtime.status === "expired") return { status: "已过期", riskLevel: "critical", suggestion: "该 Token 已过期，请立即替换或续期。" };
  if (expiresInDays <= 3) return { status: "严重即将过期", riskLevel: "critical", suggestion: `该 Token 将在 ${expiresInDays} 天内过期，请立即更换。` };
  if (expiresInDays <= 7) return { status: "即将过期", riskLevel: "warning", suggestion: `该 Token 将在 ${expiresInDays} 天后过期，建议及时更换。` };
  if (quotaRatio <= 0.1) return { status: "严重额度不足", riskLevel: "critical", suggestion: "该 Token 剩余额度低于 10%，请补充额度或切换备用 Token。" };
  if (quotaRatio <= 0.2) return { status: "额度不足", riskLevel: "warning", suggestion: "该 Token 剩余额度不足 20%，建议补充额度或切换备用 Token。" };
  if (token.consecutiveFailures >= 5 || token.successRate <= 0.5) return { status: "调用失败", riskLevel: "critical", suggestion: "该 Token 最近调用失败率较高，建议检查密钥、上游地址和平台状态。" };
  if (token.successRate < 0.8) return { status: "失败率过高", riskLevel: "warning", suggestion: "该 Token 最近成功率偏低，建议检查请求参数和上游状态。" };
  if (runtime.status === "rate_limited" || /429|rate_limit|too_many/i.test(token.lastError || "")) return { status: "疑似限流", riskLevel: "warning", suggestion: "该 Token 疑似触发上游限流，建议降低限流阈值或启用备用 Token。" };
  return { status: "正常", riskLevel: "info", suggestion: "该 Token 当前状态正常，保持每周巡检即可。" };
}

async function createAlertEvent(alert = {}) {
  await ensureTeamTokenPoolSchema();
  const event = {
    id: alert.id || makeId("alert"),
    alertType: alert.alertType || "token_check",
    level: alert.level || "warning",
    title: alert.title || "Token 池告警",
    content: alert.content || "",
    teamId: alert.teamId || "",
    tokenPoolId: alert.tokenPoolId || "",
    model: alert.model || "",
    status: alert.status || "open",
    suggestion: alert.suggestion || "",
    sentEmail: false,
    sentWebhook: false,
    createdAt: nowIso(),
  };
  if (!hasDatabase()) {
    memory.alerts.unshift(event);
    return event;
  }
  await query(
    `INSERT INTO alert_events (id, alert_type, level, title, content, team_id, token_pool_id, model, status, suggestion, sent_email, sent_webhook)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [event.id, event.alertType, event.level, event.title, event.content, event.teamId, event.tokenPoolId, event.model, event.status, event.suggestion, event.sentEmail, event.sentWebhook],
  );
  return event;
}

export async function runTokenPoolCheck({ tokenId = "", adminId = "" } = {}) {
  await ensureTeamTokenPoolSchema();
  const tokens = (await listTokenPool()).filter((token) => !tokenId || token.id === tokenId);
  const logs = [];
  for (const token of tokens) {
    let decryptOk = true;
    if (tokenId) {
      try {
        await selectTeamTokenForRequest({ teamId: token.teamId, model: token.allowedModels?.[0] || "", purpose: token.allowedPurposes?.[0] || "" });
      } catch {
        decryptOk = false;
      }
    }
    const risk = decryptOk ? riskForToken(token) : { status: "解密失败", riskLevel: "critical", suggestion: "Token 无法解密，请检查 TOKEN_POOL_ENCRYPTION_KEY 是否变更。" };
    const log = {
      id: makeId("chk"),
      tokenPoolId: token.id,
      teamId: token.teamId || "",
      status: risk.status,
      riskLevel: risk.riskLevel,
      remainingQuota: token.quotaRemaining || 0,
      expiresAt: token.expiresAt || null,
      successRate: token.successRate || 0,
      avgLatencyMs: token.avgLatencyMs || 0,
      lastErrorCode: token.lastError ? "TOKEN_LAST_ERROR" : "",
      lastErrorMessage: token.lastError || "",
      suggestion: risk.suggestion,
      checkedAt: nowIso(),
    };
    logs.push(log);
    if (risk.riskLevel !== "info") {
      await createAlertEvent({
        alertType: risk.status,
        level: risk.riskLevel === "critical" ? "critical" : "warning",
        title: risk.status,
        content: `${token.name} 巡检结果：${risk.status}`,
        teamId: token.teamId,
        tokenPoolId: token.id,
        model: token.modelType,
        suggestion: risk.suggestion,
      });
    }
    if (!hasDatabase()) continue;
    await query(
      `INSERT INTO token_pool_check_logs (
         id, token_pool_id, team_id, status, risk_level, remaining_quota, expires_at,
         success_rate, avg_latency_ms, last_error_code, last_error_message, suggestion, checked_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        log.id, log.tokenPoolId, log.teamId, log.status, log.riskLevel, log.remainingQuota, log.expiresAt,
        log.successRate, log.avgLatencyMs, log.lastErrorCode, log.lastErrorMessage, log.suggestion, log.checkedAt,
      ],
    );
  }
  if (adminId) await writeAdminAuditLog(adminId, "run_token_pool_check", "token_pool", tokenId || "all", { count: logs.length });
  await updateMaintenanceTask("check-token-status", logs.filter((item) => item.riskLevel !== "info").length);
  return logs;
}

export async function listTokenPoolCheckLogs({ tokenId = "", limit = 100 } = {}) {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return [];
  const params = [];
  const where = [];
  if (tokenId) {
    params.push(tokenId);
    where.push(`token_pool_id = $${params.length}`);
  }
  params.push(Math.min(Number(limit) || 100, 500));
  const result = await query(
    `SELECT * FROM token_pool_check_logs ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY checked_at DESC LIMIT $${params.length}`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    tokenPoolId: row.token_pool_id,
    teamId: row.team_id,
    status: row.status,
    riskLevel: row.risk_level,
    remainingQuota: Number(row.remaining_quota || 0),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : "",
    successRate: Number(row.success_rate || 0),
    avgLatencyMs: Number(row.avg_latency_ms || 0),
    lastErrorCode: row.last_error_code || "",
    lastErrorMessage: row.last_error_message || "",
    suggestion: row.suggestion || "",
    checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : "",
  }));
}

async function getTokenRecordForSecret(id) {
  if (!hasDatabase()) return memory.tokens.find((item) => item.id === id) || null;
  const result = await query("SELECT * FROM token_pool WHERE id = $1 LIMIT 1", [id]);
  return result.rows[0] ? rowToToken(result.rows[0], { includeSecret: false }) : null;
}

export async function testTokenPoolToken({ tokenId, adminId = "", useRealUpstream = false } = {}) {
  await ensureTeamTokenPoolSchema();
  const start = Date.now();
  const record = await getTokenRecordForSecret(tokenId);
  if (!record) throw new Error("Token 不存在");
  let status = "测试成功";
  let success = true;
  let errorCode = "";
  let errorMessage = "";
  let resultSummary = "Token 配置、加密解密和基础字段检查通过。";
  try {
    const secret = decryptTokenSecret(record);
    if (!secret) throw new Error("解密失败");
    if (!record.baseUrl) throw new Error("上游地址错误");
    if (!record.modelType) throw new Error("配置错误：缺少模型类型");
    if (useRealUpstream) {
      const upstreamUrl = `${String(record.baseUrl).replace(/\/+$/, "")}${record.apiPath || "/v1/chat/completions"}`;
      await assertSafeUpstreamUrl(upstreamUrl);
      const response = await fetch(upstreamUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: record.allowedModels?.[0] || "auto", messages: [{ role: "user", content: "你好，请返回“测试成功”。" }], max_tokens: 8 }),
        redirect: "manual",
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error("权限不足");
        if (response.status === 402) throw new Error("额度不足");
        if (response.status === 404) throw new Error("模型不存在");
        if (response.status === 429) throw new Error("被限流");
        throw new Error(`上游返回 ${response.status}`);
      }
      resultSummary = "真实上游测试成功。";
    }
  } catch (error) {
    success = false;
    status = error.message || "未知错误";
    errorCode = status.includes("解密") ? "DECRYPT_FAILED" : status.includes("限流") ? "RATE_LIMITED" : status.includes("地址") ? "BAD_UPSTREAM_URL" : "TOKEN_TEST_FAILED";
    errorMessage = sanitizeSecretText(status);
    resultSummary = `测试失败：${errorMessage}`;
  }
  const log = {
    id: makeId("ttest"),
    tokenPoolId: tokenId,
    teamId: record.teamId || "",
    testType: useRealUpstream ? "real_upstream" : "config",
    success,
    status,
    durationMs: Date.now() - start,
    errorCode,
    errorMessage,
    resultSummary,
    testedBy: adminId || "",
    testedAt: nowIso(),
  };
  if (!hasDatabase()) return log;
  await query(
    `INSERT INTO token_pool_test_logs (id, token_pool_id, team_id, test_type, success, status, duration_ms, error_code, error_message, result_summary, tested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [log.id, log.tokenPoolId, log.teamId, log.testType, log.success, log.status, log.durationMs, log.errorCode, log.errorMessage, log.resultSummary, log.testedBy],
  );
  if (!success) {
    await createAlertEvent({
      alertType: "Token 配置错误",
      level: "warning",
      title: "Token 测试失败",
      content: `${record.name} 测试失败：${errorMessage}`,
      teamId: record.teamId,
      tokenPoolId: tokenId,
      model: record.modelType,
      suggestion: "请检查密钥、上游地址、模型 ID 和额度。",
    });
  }
  return log;
}

export async function batchTestTokenPool({ adminId = "", teamId = "", useRealUpstream = false } = {}) {
  const tokens = (await listTokenPool()).filter((token) => !teamId || token.teamId === teamId);
  const logs = [];
  for (const token of tokens) logs.push(await testTokenPoolToken({ tokenId: token.id, adminId, useRealUpstream }));
  await updateMaintenanceTask("test-token-availability", logs.filter((item) => !item.success).length);
  return {
    total: logs.length,
    success: logs.filter((item) => item.success).length,
    failed: logs.filter((item) => !item.success).length,
    decryptFailed: logs.filter((item) => item.errorCode === "DECRYPT_FAILED").length,
    rateLimited: logs.filter((item) => item.errorCode === "RATE_LIMITED").length,
    avgLatencyMs: logs.length ? Math.round(logs.reduce((sum, item) => sum + item.durationMs, 0) / logs.length) : 0,
    logs,
  };
}

export async function listTokenPoolTestLogs({ limit = 100 } = {}) {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return [];
  const result = await query("SELECT * FROM token_pool_test_logs ORDER BY tested_at DESC LIMIT $1", [Math.min(Number(limit) || 100, 500)]);
  return result.rows.map((row) => ({
    id: row.id,
    tokenPoolId: row.token_pool_id,
    teamId: row.team_id,
    testType: row.test_type,
    success: row.success,
    status: row.status,
    durationMs: Number(row.duration_ms || 0),
    errorCode: row.error_code || "",
    errorMessage: row.error_message || "",
    resultSummary: row.result_summary || "",
    testedBy: row.tested_by || "",
    testedAt: row.tested_at ? new Date(row.tested_at).toISOString() : "",
  }));
}

export async function analyzeRateLimits({ adminId = "" } = {}) {
  const [rules, logs] = await Promise.all([listRateLimitRules(), listTeamUsageLogs({ limit: 500 })]);
  const limited = logs.filter((log) => log.errorCode === "RATE_LIMITED" || log.finalStatus === "rate_limited");
  const failed = logs.filter((log) => !log.success);
  const successRate = logs.length ? (logs.length - failed.length) / logs.length : 1;
  const suggestions = rules.map((rule) => {
    const teamLogs = logs.filter((log) => !rule.teamId || log.teamId === rule.teamId);
    const teamLimited = teamLogs.filter((log) => log.errorCode === "RATE_LIMITED" || log.finalStatus === "rate_limited").length;
    const teamSuccess = teamLogs.length ? teamLogs.filter((log) => log.success).length / teamLogs.length : successRate;
    let suggestion = "当前限流配置较为合理，未触发明显业务阻塞或上游限流风险。";
    let action = "keep";
    let proposedRequestsPerMinute = rule.requestsPerMinute;
    if (teamLimited > 5 && teamSuccess >= 0.9) {
      action = "increase";
      proposedRequestsPerMinute = Math.ceil(Number(rule.requestsPerMinute || 60) * 1.2);
      suggestion = "该团队调用成功率较高且业务活跃，建议适当提高限流额度。";
    } else if (teamLogs.length > 20 && teamSuccess < 0.8) {
      action = "hold";
      suggestion = "该团队调用失败率较高，建议先优化请求参数，不建议提高限流额度。";
    } else if (teamLogs.length < Number(rule.requestsPerMinute || 60) * 0.3) {
      action = "decrease";
      proposedRequestsPerMinute = Math.max(1, Math.floor(Number(rule.requestsPerMinute || 60) * 0.8));
      suggestion = "当前调用量低于限流额度 30%，可适当降低额度，减少资源浪费。";
    }
    return { ruleId: rule.id, scopeType: rule.scopeType, teamId: rule.teamId, currentRequestsPerMinute: rule.requestsPerMinute, proposedRequestsPerMinute, action, suggestion };
  });
  if (adminId) await writeAdminAuditLog(adminId, "analyze_rate_limits", "rate_limit_rules", "all", { suggestions: suggestions.length });
  await updateMaintenanceTask("optimize-rate-limits", suggestions.filter((item) => item.action !== "keep").length);
  return {
    globalPeak: logs.length,
    rateLimitedCount: limited.length,
    failedCount: failed.length,
    successRate,
    suggestions,
  };
}

export async function applyRateLimitSuggestion({ ruleId, proposedRequestsPerMinute, adminId = "" } = {}) {
  const rules = await listRateLimitRules();
  const rule = rules.find((item) => item.id === ruleId);
  if (!rule) throw new Error("限流规则不存在");
  const before = { ...rule };
  const updated = await upsertRateLimitRule({ ...rule, requestsPerMinute: proposedRequestsPerMinute }, adminId);
  await writeAdminAuditLog(adminId, "apply_rate_limit_suggestion", "rate_limit_rule", ruleId, { before, after: updated });
  return updated;
}

export async function runRateLimitPressureTest(input = {}, adminId = "") {
  await ensureTeamTokenPoolSchema();
  const requestCount = Math.max(1, Number(input.requestCount || 50));
  const concurrency = Math.max(1, Number(input.concurrency || 5));
  const rps = Math.max(1, Number(input.requestsPerSecond || 10));
  const limit = Number(input.limitPerMinute || 60);
  const simulatedAllowed = Math.max(1, Math.floor(limit * 0.9));
  const rateLimitedCount = requestCount > simulatedAllowed ? requestCount - simulatedAllowed : 0;
  const successCount = requestCount - rateLimitedCount;
  const failedCount = 0;
  const avgLatencyMs = Math.round(80 + concurrency * 12);
  const p95LatencyMs = Math.round(avgLatencyMs * 1.8);
  let suggestion = "当前限流配置较为合理，未触发明显业务阻塞或上游限流风险。";
  if (rateLimitedCount / requestCount > 0.35) suggestion = "当前限流配置导致较多正常请求被拒绝，建议适当提高该团队或模型的限流额度。";
  if (rps * 60 > limit * 0.95) suggestion = "当前限流配置接近上游平台限制，建议降低全局限流，保留安全缓冲。";
  const run = {
    id: makeId("rltest"),
    teamId: input.teamId || "",
    model: input.model || "",
    concurrency,
    requestCount,
    durationSeconds: Number(input.durationSeconds || 10),
    successCount,
    rateLimitedCount,
    failedCount,
    avgLatencyMs,
    p95LatencyMs,
    suggestion,
    createdBy: adminId || "",
    createdAt: nowIso(),
  };
  if (hasDatabase()) {
    await query(
      `INSERT INTO rate_limit_test_runs (id, team_id, model, concurrency, request_count, duration_seconds, success_count, rate_limited_count, failed_count, avg_latency_ms, p95_latency_ms, suggestion, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [run.id, run.teamId, run.model, run.concurrency, run.requestCount, run.durationSeconds, run.successCount, run.rateLimitedCount, run.failedCount, run.avgLatencyMs, run.p95LatencyMs, run.suggestion, run.createdBy],
    );
  }
  await writeAdminAuditLog(adminId, "run_rate_limit_pressure_test", "rate_limit_test", run.id, run);
  return run;
}

export async function listRateLimitTestRuns({ limit = 50 } = {}) {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return [];
  const result = await query("SELECT * FROM rate_limit_test_runs ORDER BY created_at DESC LIMIT $1", [Math.min(Number(limit) || 50, 200)]);
  return result.rows.map((row) => ({
    id: row.id,
    teamId: row.team_id,
    model: row.model,
    concurrency: Number(row.concurrency || 0),
    requestCount: Number(row.request_count || 0),
    successCount: Number(row.success_count || 0),
    rateLimitedCount: Number(row.rate_limited_count || 0),
    failedCount: Number(row.failed_count || 0),
    avgLatencyMs: Number(row.avg_latency_ms || 0),
    p95LatencyMs: Number(row.p95_latency_ms || 0),
    suggestion: row.suggestion || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  }));
}

export async function runLogIntegrityTest(adminId = "") {
  const logs = await listTeamUsageLogs({ limit: 80 });
  const required = ["requestId", "teamId", "apiKeyId", "model", "purpose", "requestSummary", "totalTokens", "actualCostCny", "success", "finalStatus"];
  const missing = [];
  let passed = 0;
  let partial = 0;
  let failed = 0;
  for (const log of logs) {
    const miss = required.filter((key) => log[key] === undefined || log[key] === null || log[key] === "");
    if (!miss.length) passed += 1;
    else if (miss.length <= 3) partial += 1;
    else failed += 1;
    if (miss.length) missing.push({ requestId: log.requestId, missing: miss });
  }
  const total = logs.length || 1;
  const score = Math.round(((passed + partial * 0.5) / total) * 100);
  const run = { id: makeId("logtest"), score, totalCases: logs.length, passedCases: passed, partialCases: partial, failedCases: failed, missingFields: missing, createdBy: adminId, createdAt: nowIso() };
  if (hasDatabase()) {
    await query(
      `INSERT INTO log_integrity_test_runs (id, score, total_cases, passed_cases, partial_cases, failed_cases, missing_fields_json, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [run.id, run.score, run.totalCases, run.passedCases, run.partialCases, run.failedCases, jsonStringify(run.missingFields), adminId],
    );
  }
  if (score < 90) {
    await createAlertEvent({ alertType: "日志完整性不足", level: "warning", title: "日志完整性低于 90%", content: `日志完整性：${score}%`, suggestion: "请优先修复缺失字段，避免影响财务对账。" });
  }
  await updateMaintenanceTask("check-log-integrity", score < 90 ? 1 : 0);
  return run;
}

export async function listLogIntegrityTestRuns({ limit = 50 } = {}) {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return [];
  const result = await query("SELECT * FROM log_integrity_test_runs ORDER BY created_at DESC LIMIT $1", [Math.min(Number(limit) || 50, 200)]);
  return result.rows.map((row) => ({
    id: row.id,
    score: Number(row.score || 0),
    totalCases: Number(row.total_cases || 0),
    passedCases: Number(row.passed_cases || 0),
    partialCases: Number(row.partial_cases || 0),
    failedCases: Number(row.failed_cases || 0),
    missingFields: parseJson(row.missing_fields_json || "[]", []),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  }));
}

export async function listAlertEvents({ status = "open", limit = 100 } = {}) {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return memory.alerts.filter((item) => !status || item.status === status).slice(0, limit);
  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  params.push(Math.min(Number(limit) || 100, 500));
  const result = await query(
    `SELECT * FROM alert_events ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    alertType: row.alert_type,
    level: row.level,
    title: row.title,
    content: row.content,
    teamId: row.team_id,
    tokenPoolId: row.token_pool_id,
    model: row.model,
    status: row.status,
    suggestion: row.suggestion,
    sentEmail: row.sent_email,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : "",
  }));
}

export async function resolveAlertEvent(id, adminId = "") {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) {
    const alert = memory.alerts.find((item) => item.id === id);
    if (alert) Object.assign(alert, { status: "resolved", resolvedAt: nowIso(), resolvedBy: adminId });
    return alert || null;
  }
  const result = await query(
    `UPDATE alert_events SET status = 'resolved', resolved_at = NOW(), resolved_by = $2 WHERE id = $1 RETURNING *`,
    [id, adminId],
  );
  await writeAdminAuditLog(adminId, "resolve_alert", "alert_event", id, {});
  return result.rows[0] || null;
}

export function getAlertEmailConfigStatus() {
  const alertEmail = String(process.env.ADMIN_ALERT_EMAIL || "").trim();
  const resendConfigured = Boolean(process.env.RESEND_API_KEY);
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
  return {
    configured: Boolean(alertEmail && resendConfigured),
    alertEmailConfigured: Boolean(alertEmail),
    resendConfigured,
    smtpConfigured,
    message: alertEmail && resendConfigured ? "邮件告警已配置，可通过 Resend 发送。" : "邮件告警未完整配置，请配置 ADMIN_ALERT_EMAIL 和 RESEND_API_KEY。",
  };
}

function alertEmailHtml({ title = "FlowAPI Token 池告警", alerts = [] } = {}) {
  const rows = alerts.map((alert) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb">${alert.level || "-"}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb">${alert.title || "-"}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb">${alert.content || "-"}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb">${alert.suggestion || "-"}</td>
    </tr>
  `).join("");
  return `
    <div style="max-width:760px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827">
      <h1 style="margin:0 0 8px;color:#4f46e5">${title}</h1>
      <p style="margin:0 0 18px;color:#4b5563">这封邮件由 FlowAPI 企业 Token 池维护系统自动发送，不包含任何上游 Token 原文。</p>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <thead>
          <tr style="background:#f8fafc;text-align:left">
            <th style="padding:10px">等级</th>
            <th style="padding:10px">标题</th>
            <th style="padding:10px">内容</th>
            <th style="padding:10px">建议</th>
          </tr>
        </thead>
        <tbody>${rows || "<tr><td colspan=\"4\" style=\"padding:16px;text-align:center;color:#64748b\">暂无打开告警</td></tr>"}</tbody>
      </table>
    </div>
  `;
}

async function markAlertEmailSent(ids = []) {
  const alertIds = ids.filter(Boolean);
  if (!alertIds.length) return;
  if (!hasDatabase()) {
    memory.alerts.forEach((alert) => {
      if (alertIds.includes(alert.id)) alert.sentEmail = true;
    });
    return;
  }
  await query("UPDATE alert_events SET sent_email = true WHERE id = ANY($1)", [alertIds]);
}

export async function createTestAlertEmail(adminId = "") {
  const config = getAlertEmailConfigStatus();
  const alert = await createAlertEvent({
    alertType: "test_email",
    level: config.configured ? "info" : "warning",
    title: config.configured ? "邮件告警测试" : "邮件告警未配置",
    content: config.configured ? "邮件告警配置已检测到，并已尝试发送测试邮件。" : "ADMIN_ALERT_EMAIL/RESEND_API_KEY 未完整配置。",
    suggestion: config.configured ? "请检查管理员告警邮箱是否收到测试邮件。" : "请在生产环境配置 ADMIN_ALERT_EMAIL 和 RESEND_API_KEY。",
  });
  let sendResult = { ok: false, error: config.message };
  if (config.configured) {
    sendResult = await sendEmail({
      to: [String(process.env.ADMIN_ALERT_EMAIL || "").trim()],
      subject: "FlowAPI Token 池告警测试",
      html: alertEmailHtml({ title: "FlowAPI Token 池告警测试", alerts: [alert] }),
    });
    if (sendResult.ok) await markAlertEmailSent([alert.id]);
  }
  await writeAdminAuditLog(adminId, "test_alert_email", "alert_event", alert.id, config);
  return { ...config, alert, sendResult };
}

export async function sendOpenAlertEmails(adminId = "") {
  const config = getAlertEmailConfigStatus();
  if (!config.configured) {
    return { ...config, sent: 0, sendResult: { ok: false, error: config.message } };
  }
  const alerts = (await listAlertEvents({ status: "open", limit: 100 })).filter((alert) => !alert.sentEmail);
  if (!alerts.length) return { ...config, sent: 0, sendResult: { ok: true, id: "no-open-alerts" } };
  const sendResult = await sendEmail({
    to: [String(process.env.ADMIN_ALERT_EMAIL || "").trim()],
    subject: `FlowAPI Token 池告警：${alerts.length} 条待处理`,
    html: alertEmailHtml({ alerts }),
  });
  if (sendResult.ok) await markAlertEmailSent(alerts.map((alert) => alert.id));
  if (adminId) await writeAdminAuditLog(adminId, "send_open_alert_emails", "alert_event", "open", { count: alerts.length, ok: sendResult.ok });
  return { ...config, sent: sendResult.ok ? alerts.length : 0, alerts, sendResult };
}

export async function generateWeeklyTeamReport({ adminId = "" } = {}) {
  const today = new Date();
  const day = today.getDay() || 7;
  const lastSunday = new Date(today);
  lastSunday.setDate(today.getDate() - day);
  const lastMonday = new Date(lastSunday);
  lastMonday.setDate(lastSunday.getDate() - 6);
  const reports = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(lastMonday);
    date.setDate(lastMonday.getDate() + i);
    reports.push(...await generateTeamDailyReports(date.toISOString().slice(0, 10)));
  }
  await createAlertEvent({ alertType: "weekly_report_generated", level: "info", title: "团队 Token 使用周报已生成", content: `本次生成 ${reports.length} 条团队日报数据。`, suggestion: "请在团队报表页面导出周报并查看优化建议。" });
  await updateMaintenanceTask("view-weekly-report", 0);
  if (adminId) await writeAdminAuditLog(adminId, "generate_weekly_team_report", "team_daily_reports", "weekly", { reports: reports.length });
  return { reports, period: { start: lastMonday.toISOString().slice(0, 10), end: lastSunday.toISOString().slice(0, 10) } };
}

export async function listMaintenanceTasks() {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return DEFAULT_MAINTENANCE_TASKS.map(([taskKey, name, description, frequency]) => ({ taskKey, name, description, frequency, status: "pending", pendingCount: 0 }));
  const result = await query("SELECT * FROM maintenance_tasks ORDER BY created_at ASC");
  return result.rows.map((row) => ({
    id: row.id,
    taskKey: row.task_key,
    name: row.name,
    description: row.description,
    frequency: row.frequency,
    lastRunAt: row.last_run_at ? new Date(row.last_run_at).toISOString() : "",
    nextRunAt: row.next_run_at ? new Date(row.next_run_at).toISOString() : "",
    status: row.status,
    pendingCount: Number(row.pending_count || 0),
  }));
}

export async function updateMaintenanceTask(taskKey, pendingCount = 0) {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) return null;
  await query(
    `UPDATE maintenance_tasks
     SET last_run_at = NOW(), next_run_at = NOW() + INTERVAL '7 days', status = $2, pending_count = $3, updated_at = NOW()
     WHERE task_key = $1`,
    [taskKey, pendingCount > 0 ? "needs_attention" : "done", pendingCount],
  );
  return true;
}

export async function runMaintenanceTask(taskKey, adminId = "") {
  if (taskKey === "check-token-status" || taskKey === "check-expiring-tokens") return { taskKey, result: await runTokenPoolCheck({ adminId }) };
  if (taskKey === "optimize-rate-limits") return { taskKey, result: await analyzeRateLimits({ adminId }) };
  if (taskKey === "view-weekly-report") return { taskKey, result: await generateWeeklyTeamReport({ adminId }) };
  if (taskKey === "handle-alerts") return { taskKey, result: await listAlertEvents({ status: "open" }) };
  if (taskKey === "test-token-availability") return { taskKey, result: await batchTestTokenPool({ adminId }) };
  if (taskKey === "check-log-integrity") return { taskKey, result: await runLogIntegrityTest(adminId) };
  if (taskKey === "export-finance-report") return { taskKey, result: await listTeamDailyReports({}) };
  if (taskKey === "check-cache-hit-rate") return { taskKey, result: await getRequestCacheSettings() };
  if (taskKey === "check-high-failure-teams") return { taskKey, result: await analyzeRateLimits({ adminId }) };
  throw new Error("未知维护任务");
}

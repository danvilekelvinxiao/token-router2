import crypto from "crypto";
import { hasDatabase, query } from "@/lib/db";

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
  const text = String(token || "").trim();
  if (!text) return "";
  if (text.length <= 14) return `${text.slice(0, 4)}***${text.slice(-4)}`;
  return `${text.slice(0, 8)}***${text.slice(-6)}`;
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
    CREATE INDEX IF NOT EXISTS idx_token_pool_team ON token_pool(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_usage_logs_team ON team_usage_logs(team_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_request_cache_entries_key ON request_cache_entries(cache_key);
  `);

  for (const team of DEFAULT_TEAMS) {
    await query(
      `INSERT INTO teams (id, name, code, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING`,
      [makeId("team"), team.name, team.code, team.description],
    );
  }
  schemaReady = true;
}

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
  if (!token.baseUrl || !token.tokenPreview) return false;
  const teamId = context.teamId || "";
  const purpose = context.purpose || "";
  const model = context.model || "";
  if (token.usageScope === "admin_only") return false;
  if (token.teamId && teamId && token.teamId !== teamId && token.usageScope === "team_only") return false;
  if (token.allowedTeamIds.length && teamId && !token.allowedTeamIds.includes(teamId)) return false;
  if (token.allowedModels.length && model && !token.allowedModels.includes(model)) return false;
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
  const selected = candidates[0];
  if (!selected) return null;
  let secret = "";
  if (hasDatabase()) {
    const result = await query("SELECT * FROM token_pool WHERE id = $1 LIMIT 1", [selected.id]);
    if (result.rows[0]) secret = decryptTokenSecret(rowToToken(result.rows[0], { includeSecret: false }));
  } else {
    const record = memory.tokens.find((item) => item.id === selected.id);
    if (record) secret = decryptTokenSecret(record);
  }
  if (!secret) return null;
  return { ...selected, secret };
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
    requestSummary: String(input.requestSummary || "").slice(0, 300),
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
    errorMessage: input.errorMessage || "",
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
      `UPDATE token_pool SET
         today_calls = today_calls + 1,
         today_tokens = today_tokens + $2,
         month_tokens = month_tokens + $2,
         today_cost_cny = today_cost_cny + $3,
         month_cost_cny = month_cost_cny + $3,
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

export async function listTeamUsageLogs({ teamId = "", limit = 100 } = {}) {
  await ensureTeamTokenPoolSchema();
  if (!hasDatabase()) {
    return memory.usageLogs.filter((log) => !teamId || log.teamId === teamId).slice(0, limit);
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
    tokenId: row.token_id || "",
    provider: row.provider || "",
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
    errorMessage: row.error_message || "",
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
  if (!hasDatabase()) return memory.teams.map((team) => team.id);
  const result = await query(
    `SELECT DISTINCT t.id
     FROM teams t
     LEFT JOIN team_members m ON m.team_id = t.id
     WHERE (t.owner_user_id = $1 OR m.user_id = $1)
       AND t.status = 'active'
       AND (m.status IS NULL OR m.status = 'active')`,
    [userId],
  );
  return result.rows.map((row) => row.id).filter(Boolean);
}

export async function getTeamOverviewForUser(userId = "", requestedTeamId = "") {
  const allowedTeamIds = await getUserTeamIds(userId);
  const teamId = requestedTeamId && allowedTeamIds.includes(requestedTeamId)
    ? requestedTeamId
    : allowedTeamIds[0] || "";
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
  return getTeamOverview(teamId);
}

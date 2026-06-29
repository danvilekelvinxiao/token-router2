import crypto from "crypto";
import { hasDatabase, query } from "./db.js";
import { assertSafeUpstreamUrl, sanitizeSecretText } from "./safe-upstream-url.js";
import { invalidateModelCaches, invalidateRouteCaches } from "./cache-manager.js";
import { getPublicModelRequestId, normalizeModelLookup } from "./models.js";

const PROVIDER_TYPES = new Set([
  "openai-compatible",
  "responses-compatible",
  "new-api",
  "sub2api",
  "custom",
]);

function memoryStore() {
  if (!globalThis.__FLOWAPI_PROVIDER_STORE__) {
    globalThis.__FLOWAPI_PROVIDER_STORE__ = {
      providers: [],
      mappings: [],
      logs: [],
    };
  }
  return globalThis.__FLOWAPI_PROVIDER_STORE__;
}

function makeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function encryptionSecret() {
  return String(
    process.env.PROVIDER_SECRET_KEY ||
    process.env.ADMIN_CONFIG_ENCRYPTION_KEY ||
    process.env.TOKEN_POOL_ENCRYPTION_KEY ||
    process.env.ADMIN_SECRET ||
    "flowapi-provider-local-dev-key"
  );
}

function encryptSecret(plain = "") {
  const value = String(plain || "");
  if (!value) return "";
  if (value.startsWith("enc:v1:")) return value;
  const key = crypto.createHash("sha256").update(encryptionSecret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(encrypted = "") {
  const value = String(encrypted || "");
  if (!value || !value.startsWith("enc:v1:")) return value;
  const [, , ivRaw, tagRaw, textRaw] = value.split(":");
  const key = crypto.createHash("sha256").update(encryptionSecret()).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(textRaw, "base64")), decipher.final()]).toString("utf8");
}

export function maskSecret(secret = "") {
  const value = String(secret || "");
  if (!value) return "";
  if (value.length <= 10) return `${value.slice(0, 2)}****`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function normalizeProviderType(type = "") {
  const value = String(type || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (value.includes("sub2api")) return "sub2api";
  if (value.includes("new-api") || value.includes("newapi")) return "new-api";
  if (value.includes("response")) return "responses-compatible";
  if (value.includes("openai")) return "openai-compatible";
  return PROVIDER_TYPES.has(value) ? value : "custom";
}

function normalizeProviderBaseUrl(value = "") {
  const clean = String(value || "").trim().replace(/\/+$/, "");
  if (!clean) return "";
  return /\/v1$/i.test(clean) ? clean : `${clean}/v1`;
}

function stripV1(value = "") {
  return String(value || "").trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function parseModels(value = []) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "").split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const text = String(value).toLowerCase();
  if (["true", "1", "yes", "on", "启用", "是"].includes(text)) return true;
  if (["false", "0", "no", "off", "禁用", "否"].includes(text)) return false;
  return Boolean(value);
}

function numberInRange(value, fallback, min = 0, max = 1_000_000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export async function ensureProviderSchema() {
  if (!hasDatabase()) return;
  await query(`
    CREATE TABLE IF NOT EXISTS providers (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(64) NOT NULL,
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      api_key_preview TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN DEFAULT TRUE,
      priority INT DEFAULT 0,
      weight INT DEFAULT 1,
      models JSONB DEFAULT '[]'::jsonb,
      timeout_ms INT DEFAULT 120000,
      max_retries INT DEFAULT 2,
      supports_stream BOOLEAN DEFAULT TRUE,
      supports_responses_api BOOLEAN DEFAULT FALSE,
      supports_chat_completions_api BOOLEAN DEFAULT TRUE,
      balance_check_url TEXT,
      health_check_path VARCHAR(255),
      last_health_status VARCHAR(32) DEFAULT 'unknown',
      last_health_checked_at TIMESTAMPTZ NULL,
      last_error_message TEXT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE providers ADD COLUMN IF NOT EXISTS api_key_preview TEXT NOT NULL DEFAULT '';
    ALTER TABLE providers ADD COLUMN IF NOT EXISTS balance_check_url TEXT;
    ALTER TABLE providers ADD COLUMN IF NOT EXISTS supports_stream BOOLEAN DEFAULT TRUE;
    ALTER TABLE providers ADD COLUMN IF NOT EXISTS supports_responses_api BOOLEAN DEFAULT FALSE;
    ALTER TABLE providers ADD COLUMN IF NOT EXISTS supports_chat_completions_api BOOLEAN DEFAULT TRUE;

    CREATE TABLE IF NOT EXISTS model_mappings (
      id VARCHAR(64) PRIMARY KEY,
      public_model_name VARCHAR(255) NOT NULL,
      upstream_provider_id VARCHAR(64) NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
      upstream_model_name VARCHAR(255) NOT NULL,
      enabled BOOLEAN DEFAULT TRUE,
      input_price_per_1m NUMERIC(18, 8) NULL,
      output_price_per_1m NUMERIC(18, 8) NULL,
      cached_input_price_per_1m NUMERIC(18, 8) NULL,
      display_name VARCHAR(255) NULL,
      description TEXT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_model_mappings_public ON model_mappings(public_model_name, enabled);
    CREATE INDEX IF NOT EXISTS idx_model_mappings_provider ON model_mappings(upstream_provider_id);

    CREATE TABLE IF NOT EXISTS provider_request_logs (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64),
      user_api_key_id VARCHAR(64),
      provider_id VARCHAR(64),
      public_model_name VARCHAR(255),
      upstream_model_name VARCHAR(255),
      request_id VARCHAR(255),
      status VARCHAR(32),
      http_status INT NULL,
      error_code VARCHAR(255) NULL,
      error_message TEXT NULL,
      prompt_tokens INT DEFAULT 0,
      completion_tokens INT DEFAULT 0,
      cached_tokens INT DEFAULT 0,
      estimated_cost NUMERIC(18, 8) DEFAULT 0,
      latency_ms INT DEFAULT 0,
      first_token_ms INT DEFAULT 0,
      cache_hit BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_provider_request_logs_provider_created ON provider_request_logs(provider_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_provider_request_logs_request ON provider_request_logs(request_id);
  `);
}

function sanitizeProviderForClient(provider = {}, { includeSecret = false } = {}) {
  const apiKey = includeSecret ? provider.apiKey || decryptSecret(provider.apiKeyEncrypted || provider.api_key_encrypted || "") : "";
  return {
    id: provider.id || "",
    name: provider.name || "",
    type: normalizeProviderType(provider.type),
    baseUrl: normalizeProviderBaseUrl(provider.baseUrl || provider.base_url),
    apiKeyPreview: provider.apiKeyPreview || provider.api_key_preview || maskSecret(apiKey || provider.apiKey || ""),
    ...(includeSecret ? { apiKey, apiKeyEncrypted: provider.apiKeyEncrypted || provider.api_key_encrypted || "" } : {}),
    enabled: provider.enabled !== false,
    priority: numberInRange(provider.priority, 0, -100000, 100000),
    weight: numberInRange(provider.weight, 1, 1, 100000),
    models: parseModels(provider.models),
    timeoutMs: numberInRange(provider.timeoutMs ?? provider.timeout_ms, 120000, 1000, 600000),
    maxRetries: numberInRange(provider.maxRetries ?? provider.max_retries, 2, 0, 10),
    supportsStream: toBoolean(provider.supportsStream ?? provider.supports_stream, true),
    supportsResponsesApi: toBoolean(provider.supportsResponsesApi ?? provider.supports_responses_api, false),
    supportsChatCompletionsApi: toBoolean(provider.supportsChatCompletionsApi ?? provider.supports_chat_completions_api, true),
    balanceCheckUrl: provider.balanceCheckUrl || provider.balance_check_url || "",
    healthCheckPath: provider.healthCheckPath || provider.health_check_path || "/models",
    lastHealthStatus: provider.lastHealthStatus || provider.last_health_status || "unknown",
    lastHealthCheckedAt: provider.lastHealthCheckedAt || (provider.last_health_checked_at ? new Date(provider.last_health_checked_at).toISOString() : null),
    lastErrorMessage: provider.lastErrorMessage || provider.last_error_message || "",
    createdAt: provider.createdAt || (provider.created_at ? new Date(provider.created_at).toISOString() : nowIso()),
    updatedAt: provider.updatedAt || (provider.updated_at ? new Date(provider.updated_at).toISOString() : nowIso()),
  };
}

function rowToProvider(row, options = {}) {
  return sanitizeProviderForClient({
    id: row.id,
    name: row.name,
    type: row.type,
    base_url: row.base_url,
    api_key_encrypted: row.api_key_encrypted,
    api_key_preview: row.api_key_preview,
    enabled: row.enabled,
    priority: row.priority,
    weight: row.weight,
    models: row.models || [],
    timeout_ms: row.timeout_ms,
    max_retries: row.max_retries,
    supports_stream: row.supports_stream,
    supports_responses_api: row.supports_responses_api,
    supports_chat_completions_api: row.supports_chat_completions_api,
    balance_check_url: row.balance_check_url,
    health_check_path: row.health_check_path,
    last_health_status: row.last_health_status,
    last_health_checked_at: row.last_health_checked_at,
    last_error_message: row.last_error_message,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }, options);
}

export async function listProviders({ includeSecret = false } = {}) {
  await ensureProviderSchema();
  if (!hasDatabase()) return memoryStore().providers.map((item) => sanitizeProviderForClient(item, { includeSecret }));
  const result = await query("SELECT * FROM providers ORDER BY enabled DESC, priority DESC, updated_at DESC");
  return result.rows.map((row) => rowToProvider(row, { includeSecret }));
}

export async function getProvider(id, { includeSecret = false } = {}) {
  await ensureProviderSchema();
  if (!id) return null;
  if (!hasDatabase()) {
    const found = memoryStore().providers.find((item) => item.id === id);
    return found ? sanitizeProviderForClient(found, { includeSecret }) : null;
  }
  const result = await query("SELECT * FROM providers WHERE id = $1", [id]);
  return result.rows[0] ? rowToProvider(result.rows[0], { includeSecret }) : null;
}

export async function saveProvider(input = {}, adminId = "") {
  await ensureProviderSchema();
  const id = String(input.id || "").trim() || makeId("provider");
  const name = String(input.name || "").trim();
  const baseUrl = normalizeProviderBaseUrl(input.baseUrl || input.base_url);
  if (!name) throw new Error("请填写渠道名称");
  if (!baseUrl) throw new Error("请填写上游 Base URL");
  await assertSafeUpstreamUrl(baseUrl, { resolveDns: false });
  const existing = input.id ? await getProvider(id, { includeSecret: true }) : null;
  const apiKey = String(input.apiKey || "").trim();
  const apiKeyEncrypted = apiKey ? encryptSecret(apiKey) : (input.apiKeyEncrypted || existing?.apiKeyEncrypted || existing?.api_key_encrypted || "");
  const provider = {
    id,
    name,
    type: normalizeProviderType(input.type),
    baseUrl,
    apiKeyEncrypted,
    apiKeyPreview: apiKey ? maskSecret(apiKey) : (input.apiKeyPreview || existing?.apiKeyPreview || ""),
    enabled: toBoolean(input.enabled, true),
    priority: numberInRange(input.priority, 0, -100000, 100000),
    weight: numberInRange(input.weight, 1, 1, 100000),
    models: parseModels(input.models),
    timeoutMs: numberInRange(input.timeoutMs ?? input.timeout_ms, 120000, 1000, 600000),
    maxRetries: numberInRange(input.maxRetries ?? input.max_retries, 2, 0, 10),
    supportsStream: toBoolean(input.supportsStream ?? input.supports_stream, true),
    supportsResponsesApi: toBoolean(input.supportsResponsesApi ?? input.supports_responses_api, normalizeProviderType(input.type) === "responses-compatible"),
    supportsChatCompletionsApi: toBoolean(input.supportsChatCompletionsApi ?? input.supports_chat_completions_api, true),
    balanceCheckUrl: String(input.balanceCheckUrl || input.balance_check_url || "").trim(),
    healthCheckPath: String(input.healthCheckPath || input.health_check_path || "/models").trim() || "/models",
    lastHealthStatus: input.lastHealthStatus || existing?.lastHealthStatus || "unknown",
    lastHealthCheckedAt: input.lastHealthCheckedAt || existing?.lastHealthCheckedAt || null,
    lastErrorMessage: sanitizeSecretText(input.lastErrorMessage || existing?.lastErrorMessage || ""),
  };

  if (!hasDatabase()) {
    const store = memoryStore();
    const index = store.providers.findIndex((item) => item.id === id);
    const entry = { ...provider, createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso() };
    if (index >= 0) store.providers[index] = entry;
    else store.providers.unshift(entry);
    invalidateRouteCaches();
    invalidateModelCaches();
    return sanitizeProviderForClient(entry);
  }

  await query(
    `INSERT INTO providers (
      id, name, type, base_url, api_key_encrypted, api_key_preview, enabled, priority, weight, models,
      timeout_ms, max_retries, supports_stream, supports_responses_api, supports_chat_completions_api,
      balance_check_url, health_check_path, last_health_status, last_error_message
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    ON CONFLICT (id) DO UPDATE SET
      name=$2,type=$3,base_url=$4,
      api_key_encrypted=COALESCE(NULLIF($5,''), providers.api_key_encrypted),
      api_key_preview=COALESCE(NULLIF($6,''), providers.api_key_preview),
      enabled=$7,priority=$8,weight=$9,models=$10::jsonb,timeout_ms=$11,max_retries=$12,
      supports_stream=$13,supports_responses_api=$14,supports_chat_completions_api=$15,
      balance_check_url=$16,health_check_path=$17,last_health_status=$18,last_error_message=$19,updated_at=NOW()`,
    [
      provider.id,
      provider.name,
      provider.type,
      provider.baseUrl,
      provider.apiKeyEncrypted,
      provider.apiKeyPreview,
      provider.enabled,
      provider.priority,
      provider.weight,
      JSON.stringify(provider.models),
      provider.timeoutMs,
      provider.maxRetries,
      provider.supportsStream,
      provider.supportsResponsesApi,
      provider.supportsChatCompletionsApi,
      provider.balanceCheckUrl,
      provider.healthCheckPath,
      provider.lastHealthStatus,
      provider.lastErrorMessage,
    ]
  );
  invalidateRouteCaches();
  invalidateModelCaches();
  return getProvider(id);
}

export async function deleteProvider(id) {
  await ensureProviderSchema();
  if (!id) throw new Error("缺少 Provider ID");
  const mappings = await listModelMappings({ providerId: id, includeDisabled: true });
  if (mappings.length) throw new Error("该渠道仍有关联模型映射，请先删除或迁移模型映射后再删除渠道。");
  if (!hasDatabase()) {
    const store = memoryStore();
    store.providers = store.providers.filter((item) => item.id !== id);
    invalidateRouteCaches();
    invalidateModelCaches();
    return { ok: true };
  }
  await query("DELETE FROM providers WHERE id = $1", [id]);
  invalidateRouteCaches();
  invalidateModelCaches();
  return { ok: true };
}

export async function setProviderEnabled(id, enabled) {
  const provider = await getProvider(id, { includeSecret: true });
  if (!provider) throw new Error("Provider 不存在");
  return saveProvider({ ...provider, enabled: Boolean(enabled), apiKey: provider.apiKey || "" });
}

export async function testProviderConnection(id) {
  const provider = await getProvider(id, { includeSecret: true });
  if (!provider) throw new Error("Provider 不存在");
  const started = Date.now();
  const root = stripV1(provider.baseUrl);
  const healthPath = String(provider.healthCheckPath || "/models").startsWith("/") ? provider.healthCheckPath : `/${provider.healthCheckPath}`;
  const healthUrl = `${root}/v1${healthPath === "/models" ? "/models" : healthPath}`;
  try {
    await assertSafeUpstreamUrl(healthUrl);
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(provider.timeoutMs || 15000),
    });
    const text = await response.text();
    const latencyMs = Date.now() - started;
    const ok = response.ok;
    const result = {
      ok,
      statusCode: response.status,
      latencyMs,
      message: ok ? "连接成功" : `连接失败：HTTP ${response.status}`,
      error: ok ? "" : sanitizeSecretText(text).slice(0, 300),
      checkedAt: nowIso(),
    };
    await updateProviderHealth(id, result);
    return result;
  } catch (error) {
    const result = {
      ok: false,
      statusCode: 0,
      latencyMs: Date.now() - started,
      message: "连接失败",
      error: sanitizeSecretText(error?.message || String(error)).slice(0, 300),
      checkedAt: nowIso(),
    };
    await updateProviderHealth(id, result);
    return result;
  }
}

async function updateProviderHealth(id, result = {}) {
  const status = result.ok ? "healthy" : "unhealthy";
  if (!hasDatabase()) {
    const provider = memoryStore().providers.find((item) => item.id === id);
    if (provider) {
      provider.lastHealthStatus = status;
      provider.lastHealthCheckedAt = nowIso();
      provider.lastErrorMessage = result.error || "";
      provider.updatedAt = nowIso();
    }
    return;
  }
  await query(
    `UPDATE providers
     SET last_health_status=$2,last_health_checked_at=NOW(),last_error_message=$3,updated_at=NOW()
     WHERE id=$1`,
    [id, status, result.error || ""]
  );
}

export async function syncProviderModels(id) {
  const provider = await getProvider(id, { includeSecret: true });
  if (!provider) throw new Error("Provider 不存在");
  const root = stripV1(provider.baseUrl);
  const modelsUrl = `${root}/v1/models`;
  await assertSafeUpstreamUrl(modelsUrl);
  const response = await fetch(modelsUrl, {
    method: "GET",
    headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(provider.timeoutMs || 20000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`同步模型失败：HTTP ${response.status} ${sanitizeSecretText(text).slice(0, 160)}`);
  let data = null;
  try { data = JSON.parse(text); } catch { throw new Error("上游 /v1/models 返回不是 JSON"); }
  const rawModels = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  const models = rawModels.map((item) => typeof item === "string" ? item : (item?.id || item?.model || item?.name || "")).filter(Boolean);
  await saveProvider({ ...provider, apiKey: provider.apiKey, models });
  return { ok: true, models, count: models.length };
}

function rowToMapping(row) {
  return {
    id: row.id,
    publicModelName: row.public_model_name,
    upstreamProviderId: row.upstream_provider_id,
    upstreamModelName: row.upstream_model_name,
    enabled: row.enabled !== false,
    inputPricePer1M: row.input_price_per_1m === null ? null : Number(row.input_price_per_1m || 0),
    outputPricePer1M: row.output_price_per_1m === null ? null : Number(row.output_price_per_1m || 0),
    cachedInputPricePer1M: row.cached_input_price_per_1m === null ? null : Number(row.cached_input_price_per_1m || 0),
    displayName: row.display_name || "",
    description: row.description || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : nowIso(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso(),
  };
}

function publicModelLookupAliases(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return [];
  return Array.from(new Set([
    raw,
    raw.toLowerCase(),
    normalizeModelLookup(raw),
    getPublicModelRequestId(raw),
    raw.startsWith("flowapi-") ? raw.replace(/^flowapi-/, "") : `flowapi-${raw}`,
  ].map((item) => String(item || "").trim()).filter(Boolean)));
}

export async function listModelMappings({ publicModelName = "", providerId = "", includeDisabled = false } = {}) {
  await ensureProviderSchema();
  const publicAliases = publicModelLookupAliases(publicModelName);
  if (!hasDatabase()) {
    return memoryStore().mappings.filter((item) => {
      if (!includeDisabled && item.enabled === false) return false;
      if (publicAliases.length && !publicAliases.includes(item.publicModelName)) return false;
      if (providerId && item.upstreamProviderId !== providerId) return false;
      return true;
    });
  }
  const filters = [];
  const params = [];
  if (!includeDisabled) filters.push("enabled = true");
  if (publicAliases.length) { params.push(publicAliases); filters.push(`public_model_name = ANY($${params.length}::text[])`); }
  if (providerId) { params.push(providerId); filters.push(`upstream_provider_id = $${params.length}`); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await query(`SELECT * FROM model_mappings ${where} ORDER BY public_model_name ASC, updated_at DESC`, params);
  return result.rows.map(rowToMapping);
}

export async function saveModelMapping(input = {}) {
  await ensureProviderSchema();
  const id = String(input.id || "").trim() || makeId("mapping");
  const publicModelName = String(input.publicModelName || input.public_model_name || "").trim();
  const upstreamProviderId = String(input.upstreamProviderId || input.upstream_provider_id || "").trim();
  const upstreamModelName = String(input.upstreamModelName || input.upstream_model_name || "").trim();
  if (!publicModelName) throw new Error("请填写对外模型名");
  if (!upstreamProviderId) throw new Error("请选择上游 Provider");
  if (!upstreamModelName) throw new Error("请填写上游真实模型名");
  const provider = await getProvider(upstreamProviderId);
  if (!provider) throw new Error("选择的上游 Provider 不存在");
  const mapping = {
    id,
    publicModelName,
    upstreamProviderId,
    upstreamModelName,
    enabled: toBoolean(input.enabled, true),
    inputPricePer1M: input.inputPricePer1M ?? input.input_price_per_1m ?? null,
    outputPricePer1M: input.outputPricePer1M ?? input.output_price_per_1m ?? null,
    cachedInputPricePer1M: input.cachedInputPricePer1M ?? input.cached_input_price_per_1m ?? null,
    displayName: String(input.displayName || input.display_name || "").trim(),
    description: String(input.description || "").trim(),
  };
  if (!hasDatabase()) {
    const store = memoryStore();
    const index = store.mappings.findIndex((item) => item.id === id);
    const entry = { ...mapping, createdAt: nowIso(), updatedAt: nowIso() };
    if (index >= 0) store.mappings[index] = { ...store.mappings[index], ...entry, updatedAt: nowIso() };
    else store.mappings.unshift(entry);
    invalidateRouteCaches(publicModelName);
    invalidateModelCaches();
    return entry;
  }
  await query(
    `INSERT INTO model_mappings (
      id, public_model_name, upstream_provider_id, upstream_model_name, enabled,
      input_price_per_1m, output_price_per_1m, cached_input_price_per_1m, display_name, description
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (id) DO UPDATE SET
      public_model_name=$2,upstream_provider_id=$3,upstream_model_name=$4,enabled=$5,
      input_price_per_1m=$6,output_price_per_1m=$7,cached_input_price_per_1m=$8,
      display_name=$9,description=$10,updated_at=NOW()`,
    [
      mapping.id,
      mapping.publicModelName,
      mapping.upstreamProviderId,
      mapping.upstreamModelName,
      mapping.enabled,
      mapping.inputPricePer1M,
      mapping.outputPricePer1M,
      mapping.cachedInputPricePer1M,
      mapping.displayName,
      mapping.description,
    ]
  );
  invalidateRouteCaches(publicModelName);
  invalidateModelCaches();
  return (await listModelMappings({ includeDisabled: true })).find((item) => item.id === id) || mapping;
}

export async function deleteModelMapping(id) {
  await ensureProviderSchema();
  if (!id) throw new Error("缺少模型映射 ID");
  if (!hasDatabase()) {
    memoryStore().mappings = memoryStore().mappings.filter((item) => item.id !== id);
    invalidateRouteCaches();
    invalidateModelCaches();
    return { ok: true };
  }
  await query("DELETE FROM model_mappings WHERE id = $1", [id]);
  invalidateRouteCaches();
  invalidateModelCaches();
  return { ok: true };
}

export async function setModelMappingEnabled(id, enabled) {
  const all = await listModelMappings({ includeDisabled: true });
  const mapping = all.find((item) => item.id === id);
  if (!mapping) throw new Error("模型映射不存在");
  return saveModelMapping({ ...mapping, enabled: Boolean(enabled) });
}

export async function getProviderRouteCandidates(publicModelName = "", { endpoint = "chat" } = {}) {
  const mappings = await listModelMappings({ publicModelName, includeDisabled: false });
  if (!mappings.length) return [];
  const providers = new Map((await listProviders({ includeSecret: true })).map((provider) => [provider.id, provider]));
  const candidates = [];
  for (const mapping of mappings) {
    const provider = providers.get(mapping.upstreamProviderId);
    if (!provider || provider.enabled === false) continue;
    if (provider.lastHealthStatus === "unhealthy") continue;
    if (endpoint === "responses" && provider.supportsResponsesApi === false && provider.supportsChatCompletionsApi === false) continue;
    if (endpoint === "chat" && provider.supportsChatCompletionsApi === false) continue;
    const root = stripV1(provider.baseUrl);
    const chatCompletionsUrl = `${root}/v1/chat/completions`;
    const responsesUrl = `${root}/v1/responses`;
    const useResponsesEndpoint = endpoint === "responses" && provider.supportsResponsesApi;
    const upstreamUrl = useResponsesEndpoint ? responsesUrl : chatCompletionsUrl;
    candidates.push({
      id: `${provider.id}:${mapping.id}`,
      providerId: provider.id,
      mappingId: mapping.id,
      name: provider.id,
      providerKey: provider.type,
      providerName: "FlowAPI",
      channelName: provider.name,
      upstreamName: provider.id,
      label: provider.name,
      baseUrl: stripV1(provider.baseUrl),
      upstreamUrl,
      chatCompletionsUrl,
      responsesUrl,
      endpointType: useResponsesEndpoint ? "responses" : "chat",
      modelsUrl: `${root}/v1/models`,
      healthUrl: `${root}/v1/models`,
      healthAuth: true,
      apiKey: provider.apiKey || "",
      actualModelId: mapping.upstreamModelName,
      publicModelId: mapping.publicModelName,
      inputCostPerMillion: Number(mapping.inputPricePer1M ?? 0) > 0 ? Number(mapping.inputPricePer1M) / 1.25 : 0,
      outputCostPerMillion: Number(mapping.outputPricePer1M ?? 0) > 0 ? Number(mapping.outputPricePer1M) / 1.25 : 0,
      currency: "$ API",
      priority: 1000 - Number(provider.priority || 0),
      priorityRaw: Number(provider.priority || 0),
      weight: Number(provider.weight || 1),
      qualityScore: 85,
      routeStrategy: "balanced",
      isEnabled: true,
      successRate: provider.lastHealthStatus === "healthy" ? 0.99 : 0.9,
      avgLatencyMs: 0,
      avgFirstTokenMs: 0,
      p95LatencyMs: 0,
      supportsStream: provider.supportsStream,
      supportsResponsesApi: provider.supportsResponsesApi,
      supportsChatCompletionsApi: provider.supportsChatCompletionsApi,
      timeoutMs: provider.timeoutMs,
      maxRetries: provider.maxRetries,
      raw: { provider, mapping },
    });
  }
  return expandWeightedCandidates(candidates).sort((a, b) => (a.priority - b.priority) || (b.weight - a.weight));
}

function expandWeightedCandidates(candidates = []) {
  const expanded = [];
  for (const candidate of candidates) {
    const weight = Math.max(1, Math.min(20, Number(candidate.weight || 1)));
    for (let i = 0; i < weight; i += 1) {
      expanded.push(i === 0 ? candidate : { ...candidate, id: `${candidate.id}:w${i}`, weightedAliasOf: candidate.id });
    }
  }
  return expanded;
}

export async function listProviderUpstreamConfigs() {
  const providers = await listProviders({ includeSecret: true });
  return providers
    .filter((provider) => provider.enabled !== false && provider.apiKey)
    .map((provider) => {
      const root = stripV1(provider.baseUrl);
      return {
        name: provider.id,
        label: provider.name,
        baseUrl: root,
        apiKey: provider.apiKey,
        upstreamUrl: `${root}/v1/chat/completions`,
        chatCompletionsUrl: `${root}/v1/chat/completions`,
        responsesUrl: `${root}/v1/responses`,
        modelsUrl: `${root}/v1/models`,
        healthUrl: `${root}/v1/models`,
        healthAuth: true,
        includeAsDefaultCandidate: false,
        providerConfigured: true,
        providerId: provider.id,
        supportsResponsesApi: provider.supportsResponsesApi,
        supportsChatCompletionsApi: provider.supportsChatCompletionsApi,
      };
    });
}

export async function recordProviderRequestLog(input = {}) {
  await ensureProviderSchema();
  const entry = {
    id: input.id || makeId("provider_log"),
    userId: String(input.userId || input.customerId || ""),
    userApiKeyId: String(input.userApiKeyId || input.apiKeyId || ""),
    providerId: String(input.providerId || input.upstreamChannelId || input.upstreamChannel || ""),
    publicModelName: String(input.publicModelName || input.publicModelId || ""),
    upstreamModelName: String(input.upstreamModelName || input.actualModelId || ""),
    requestId: String(input.requestId || ""),
    status: String(input.status || (input.ok ? "success" : "failed")),
    httpStatus: Number(input.httpStatus ?? input.statusCode ?? 0),
    errorCode: String(input.errorCode || ""),
    errorMessage: sanitizeSecretText(String(input.errorMessage || "")).slice(0, 500),
    promptTokens: Number(input.promptTokens || input.prompt_tokens || 0),
    completionTokens: Number(input.completionTokens || input.completion_tokens || 0),
    cachedTokens: Number(input.cachedTokens || input.cached_tokens || 0),
    estimatedCost: Number(input.estimatedCost || input.estimated_cost || 0),
    latencyMs: Number(input.latencyMs || input.latency_ms || 0),
    firstTokenMs: Number(input.firstTokenMs || input.first_token_ms || 0),
    cacheHit: Boolean(input.cacheHit || input.cache_hit),
    createdAt: nowIso(),
  };
  if (!entry.providerId) return null;
  if (!hasDatabase()) {
    memoryStore().logs.unshift(entry);
    memoryStore().logs = memoryStore().logs.slice(0, 500);
    return entry;
  }
  await query(
    `INSERT INTO provider_request_logs (
      id,user_id,user_api_key_id,provider_id,public_model_name,upstream_model_name,request_id,status,http_status,
      error_code,error_message,prompt_tokens,completion_tokens,cached_tokens,estimated_cost,latency_ms,first_token_ms,cache_hit
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      entry.id,
      entry.userId,
      entry.userApiKeyId,
      entry.providerId,
      entry.publicModelName,
      entry.upstreamModelName,
      entry.requestId,
      entry.status,
      entry.httpStatus,
      entry.errorCode,
      entry.errorMessage,
      entry.promptTokens,
      entry.completionTokens,
      entry.cachedTokens,
      entry.estimatedCost,
      entry.latencyMs,
      entry.firstTokenMs,
      entry.cacheHit,
    ]
  );
  return entry;
}

export async function listProviderLogs({ providerId = "", limit = 100 } = {}) {
  await ensureProviderSchema();
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));
  if (!hasDatabase()) {
    return memoryStore().logs
      .filter((item) => !providerId || item.providerId === providerId)
      .slice(0, safeLimit);
  }
  const params = [];
  let where = "";
  if (providerId) {
    params.push(providerId);
    where = "WHERE provider_id = $1";
  }
  params.push(safeLimit);
  const result = await query(
    `SELECT * FROM provider_request_logs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id || "",
    userApiKeyId: row.user_api_key_id || "",
    providerId: row.provider_id || "",
    publicModelName: row.public_model_name || "",
    upstreamModelName: row.upstream_model_name || "",
    requestId: row.request_id || "",
    status: row.status || "",
    httpStatus: Number(row.http_status || 0),
    errorCode: row.error_code || "",
    errorMessage: row.error_message || "",
    promptTokens: Number(row.prompt_tokens || 0),
    completionTokens: Number(row.completion_tokens || 0),
    cachedTokens: Number(row.cached_tokens || 0),
    estimatedCost: Number(row.estimated_cost || 0),
    latencyMs: Number(row.latency_ms || 0),
    firstTokenMs: Number(row.first_token_ms || 0),
    cacheHit: Boolean(row.cache_hit),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : nowIso(),
  }));
}

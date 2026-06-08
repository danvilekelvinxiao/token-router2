import { hasDatabase, query } from "./db";
import { assertSafeUpstreamUrl, sanitizeSecretText } from "./safe-upstream-url";
import { invalidateRouteCaches } from "./cache-manager";
import { listPublishedModels, upsertPublishedModel } from "./admin-commercial-config";

export const AICARDS_PROVIDER_KEY = "aicards";
export const AICARDS_CHANNEL_NAME = "AICards-Backup";
export const AICARDS_GROUP_NAME = "aicards-backup";

const memory = {
  syncLogs: [],
  upstreamModels: [],
  channels: [],
  routeCandidates: [],
  modelRoutes: [],
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function sanitizeId(value = "") {
  return String(value || "model").trim().replace(/[^a-zA-Z0-9._:-]+/g, "_").slice(0, 160);
}

function stableHash(value = "") {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(6, "0").slice(0, 8);
}

function prettifyModelSegment(segment = "") {
  const known = {
    ai: "AI",
    api: "API",
    chatgpt: "ChatGPT",
    claude: "Claude",
    codex: "Codex",
    deepseek: "DeepSeek",
    flash: "Flash",
    gemini: "Gemini",
    gpt: "GPT",
    grok: "Grok",
    haiku: "Haiku",
    high: "High",
    image: "Image",
    kiro: "Kiro",
    mini: "Mini",
    non: "Non",
    openai: "OpenAI",
    opus: "Opus",
    pro: "Pro",
    qwen: "Qwen",
    reasoning: "Reasoning",
    schnell: "Schnell",
    sonnet: "Sonnet",
  };
  const normalized = String(segment || "").toLowerCase();
  if (known[normalized]) return known[normalized];
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

const PUBLIC_TEXT_BLOCKLIST = [
  "aicards",
  "aicards.shop",
  "openrouter",
  "uniapi",
  "newapi",
  "new-api",
  "sub2api",
  "upstream",
  "actual_model",
  "provider_key",
  "base_url",
  "api_key",
  "bearer",
  "authorization",
  "proxy",
  "route",
  "backup",
  "supplier",
  "vendor",
  "sk-",
  "cr_",
  "上游",
  "供应商",
  "供货商",
];

function detectModelCategory(modelId = "") {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("claude")) return "claude";
  if (id.includes("codex")) return "codex";
  if (id.includes("gemini")) return "gemini";
  if (id.includes("deepseek")) return "deepseek";
  if (id.includes("qwen")) return "qwen";
  if (id.includes("image") || id.includes("flux") || id.includes("sdxl")) return "image";
  if (id.includes("gpt") || id.includes("openai") || /\bo[134]\b/.test(id)) return "chatgpt";
  if (id.includes("grok")) return "grok";
  return "general";
}

function publicModelIdForCandidate(modelId = "") {
  const category = detectModelCategory(modelId).replace(/[^a-z0-9-]/g, "") || "model";
  return `flowapi-${category}-${stableHash(modelId || "model")}`;
}

function containsBlockedPublicText(value = "") {
  const text = String(value || "").toLowerCase();
  return PUBLIC_TEXT_BLOCKLIST.some((keyword) => text.includes(keyword));
}

function assertSafePublicModelText(value = "", label = "对外模型信息") {
  if (containsBlockedPublicText(value)) {
    const error = new Error(`${label} 不能包含上游供应链名称、接口地址、Key 或路由字段`);
    error.status = 400;
    throw error;
  }
}

function friendlyDisplayName(modelId = "") {
  const id = String(modelId || "").trim();
  const compact = id
    .replace(/([a-z]+)-(\d+)-(\d+)(?=$|-)/gi, "$1-$2.$3")
    .replace(/([a-z]+)-(\d+)-(\d+)-(\d+)(?=$|-)/gi, "$1-$2.$3.$4");
  const parts = compact
    .split(/[^a-zA-Z0-9.]+/g)
    .map((item) => item.trim())
    .filter((item) => !containsBlockedPublicText(item))
    .filter(Boolean);
  if (!parts.length) return "FlowAPI 高级通道";
  return parts.map(prettifyModelSegment).join(" ");
}

function isUsableSecret(value = "") {
  const text = String(value || "").trim();
  return text.length > 16 && !/请填入|placeholder|example|your_/i.test(text);
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeProviderError(value = "") {
  let text = sanitizeSecretText(value || "");
  [
    process.env.AICARDS_API_KEY,
    process.env.AICARDS_USERNAME,
    process.env.AICARDS_PASSWORD,
  ].filter(Boolean).forEach((secret) => {
    text = text.replace(new RegExp(escapeRegExp(secret), "g"), "***");
  });
  return text
    .replace(/Authorization\s*:\s*Bearer\s+[^,\s}]+/gi, "Authorization: Bearer ***")
    .replace(/"api[_-]?key"\s*:\s*"[^"]+"/gi, "\"api_key\":\"***\"")
    .slice(0, 500);
}

function assertPositivePrice(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    const error = new Error(`${label} 必须大于 0，价格未配置前不能启用备用线路`);
    error.status = 400;
    throw error;
  }
  return number;
}

function assertMargin({ inputCost, outputCost, inputSell, outputSell, minProfitMargin }) {
  const min = Math.max(0, Number(minProfitMargin || 0.2));
  const inputOk = inputSell >= inputCost * (1 + min);
  const outputOk = outputSell >= outputCost * (1 + min);
  if (!inputOk || !outputOk) {
    const error = new Error(`售价必须至少覆盖上游成本并保留 ${Math.round(min * 100)}% 毛利，否则禁止启用备用兜底`);
    error.status = 400;
    throw error;
  }
}

function detectModelFamily(modelId = "") {
  const category = detectModelCategory(modelId);
  const publicModelId = publicModelIdForCandidate(modelId);
  const displayName = friendlyDisplayName(modelId);
  return { category, displayName, publicModelId };
}

function normalizeModelItem(item = {}) {
  const raw = typeof item === "string" ? { id: item } : item || {};
  const actualModelId = String(raw.id || raw.model || raw.name || raw.model_id || "").trim();
  if (!actualModelId) return null;
  const family = detectModelFamily(actualModelId);
  return {
    id: `aicards_${sanitizeId(actualModelId)}`,
    providerKey: AICARDS_PROVIDER_KEY,
    upstreamChannel: AICARDS_CHANNEL_NAME,
    actualModelId,
    rawModelName: String(raw.display_name || raw.name || raw.model || actualModelId).trim(),
    displayName: family.displayName,
    publicModelId: family.publicModelId,
    category: family.category,
    rawData: raw,
    normalizedCapabilities: {
      chat: true,
      streaming: true,
      source: "third_party_backup",
    },
  };
}

function mapModelRow(row = {}) {
  return {
    id: row.id,
    providerKey: row.provider_key || row.provider || AICARDS_PROVIDER_KEY,
    upstreamChannel: row.upstream_channel || AICARDS_CHANNEL_NAME,
    channelId: row.channel_id || "",
    actualModelId: row.actual_model_id || "",
    publicModelId: row.public_model_id || "",
    rawModelName: row.raw_model_name || row.display_name || row.actual_model_id || "",
    displayName: row.display_name || "",
    inputCostPerMillion: Number(row.channel_input_cost_per_million ?? row.input_cost_per_million ?? 0),
    outputCostPerMillion: Number(row.channel_output_cost_per_million ?? row.output_cost_per_million ?? 0),
    sellInputPricePerMillion: Number(row.sell_input_price_per_million || 0),
    sellOutputPricePerMillion: Number(row.sell_output_price_per_million || 0),
    minProfitMargin: Number(row.min_profit_margin || 0.2),
    priority: Number(row.channel_priority || 90),
    channelEnabled: row.channel_is_enabled === true,
    channelSuccessRate: Number(row.channel_success_rate || 0),
    channelLastHealthCheckAt: row.channel_last_health_check_at ? new Date(row.channel_last_health_check_at).toISOString() : null,
    channelLastError: row.channel_last_error || "",
    isPublic: row.route_is_public === true,
    routeAvailable: row.route_is_available === true,
    isAvailable: row.is_available === true,
    requiresAdminReview: row.requires_admin_review !== false,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
  };
}

export function getAicardsConfig() {
  const baseUrl = normalizeBaseUrl(process.env.AICARDS_API_BASE_URL || process.env.AICARDS_BASE_URL || "");
  return {
    providerKey: AICARDS_PROVIDER_KEY,
    channelName: AICARDS_CHANNEL_NAME,
    groupName: AICARDS_GROUP_NAME,
    baseUrl,
    modelsUrl: `${baseUrl}/v1/models`,
    chatUrl: `${baseUrl}/v1/chat/completions`,
    apiKey: String(process.env.AICARDS_API_KEY || "").trim(),
    usernameConfigured: Boolean(process.env.AICARDS_USERNAME),
    passwordConfigured: Boolean(process.env.AICARDS_PASSWORD),
    enabled: Boolean(baseUrl && isUsableSecret(process.env.AICARDS_API_KEY)),
  };
}

export async function ensureAicardsProviderSchema() {
  if (!hasDatabase()) return;
  await query(`
    ALTER TABLE upstream_channels ADD COLUMN IF NOT EXISTS provider_key TEXT DEFAULT '';
    ALTER TABLE upstream_channels ADD COLUMN IF NOT EXISTS channel_type TEXT DEFAULT 'OpenAI Compatible';
    ALTER TABLE upstream_channels ADD COLUMN IF NOT EXISTS is_user_visible BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE upstream_channels ADD COLUMN IF NOT EXISTS requires_admin_review BOOLEAN NOT NULL DEFAULT true;

    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS provider_key TEXT DEFAULT '';
    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS channel_id TEXT DEFAULT '';
    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS public_model_id TEXT DEFAULT '';
    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS raw_model_name TEXT DEFAULT '';
    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS normalized_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS input_cost_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0;
    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS output_cost_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0;
    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'CNY';
    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE upstream_models ADD COLUMN IF NOT EXISTS requires_admin_review BOOLEAN NOT NULL DEFAULT true;

    CREATE TABLE IF NOT EXISTS model_routes (
      id TEXT PRIMARY KEY,
      public_model_id TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      display_provider TEXT NOT NULL DEFAULT 'FlowAPI',
      category TEXT NOT NULL DEFAULT 'general',
      sell_input_price_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0,
      sell_output_price_per_million NUMERIC(14, 6) NOT NULL DEFAULT 0,
      min_profit_margin NUMERIC(8, 4) NOT NULL DEFAULT 0.2,
      is_public BOOLEAN NOT NULL DEFAULT false,
      is_available BOOLEAN NOT NULL DEFAULT false,
      requires_admin_review BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS route_candidates (
      id TEXT PRIMARY KEY,
      public_model_id TEXT NOT NULL,
      upstream_channel_id TEXT NOT NULL DEFAULT '',
      actual_model_id TEXT NOT NULL DEFAULT '',
      provider_key TEXT NOT NULL DEFAULT '',
      priority INTEGER NOT NULL DEFAULT 90,
      weight INTEGER NOT NULL DEFAULT 1,
      is_enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS data_sync_logs (
      id TEXT PRIMARY KEY,
      provider_key TEXT NOT NULL DEFAULT '',
      channel_name TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      total_items INTEGER NOT NULL DEFAULT 0,
      added_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT DEFAULT '',
      raw_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_upstream_channels_provider_key ON upstream_channels(provider_key, is_enabled);
    CREATE INDEX IF NOT EXISTS idx_route_candidates_public_model ON route_candidates(public_model_id, is_enabled, priority);
    CREATE INDEX IF NOT EXISTS idx_data_sync_logs_provider ON data_sync_logs(provider_key, created_at DESC);
  `);
}

async function writeDataSyncLog(payload = {}) {
  const entry = {
    id: makeId("sync"),
    providerKey: payload.providerKey || AICARDS_PROVIDER_KEY,
    channelName: payload.channelName || AICARDS_CHANNEL_NAME,
    action: payload.action || "sync_models",
    status: payload.status || "success",
    totalItems: Number(payload.totalItems || 0),
    addedCount: Number(payload.addedCount || 0),
    updatedCount: Number(payload.updatedCount || 0),
    errorMessage: String(payload.errorMessage || "").slice(0, 1000),
    rawSummary: payload.rawSummary || {},
    createdBy: payload.createdBy || payload.adminId || "",
    createdAt: nowIso(),
  };
  if (!hasDatabase()) {
    memory.syncLogs.unshift(entry);
    return entry;
  }
  await ensureAicardsProviderSchema();
  await query(
    `INSERT INTO data_sync_logs (
       id, provider_key, channel_name, action, status, total_items, added_count, updated_count,
       error_message, raw_summary_json, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [
      entry.id,
      entry.providerKey,
      entry.channelName,
      entry.action,
      entry.status,
      entry.totalItems,
      entry.addedCount,
      entry.updatedCount,
      entry.errorMessage,
      JSON.stringify(entry.rawSummary),
      entry.createdBy,
    ],
  );
  return entry;
}

async function fetchAicardsModels() {
  const config = getAicardsConfig();
  if (!config.baseUrl) throw new Error("AICARDS_API_BASE_URL 未配置");
  if (!isUsableSecret(config.apiKey)) throw new Error("AICARDS_API_KEY 未配置或不可用");
  await assertSafeUpstreamUrl(config.modelsUrl);
  const response = await fetch(config.modelsUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`备用上游模型同步失败：HTTP ${response.status} ${sanitizeProviderError(text).slice(0, 200)}`);
  }
  const data = await response.json();
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
  if (!Array.isArray(list)) throw new Error("备用上游模型列表格式异常");
  return list.map(normalizeModelItem).filter(Boolean);
}

export async function syncAicardsModels({ adminId = "" } = {}) {
  await ensureAicardsProviderSchema();
  const config = getAicardsConfig();
  try {
    const models = await fetchAicardsModels();
    let added = 0;
    let updated = 0;

    if (!hasDatabase()) {
      const existingIds = new Set(memory.upstreamModels.map((item) => item.id));
      for (const model of models) {
        const channelId = `aicards_${sanitizeId(model.publicModelId)}_${sanitizeId(model.actualModelId)}`;
        if (existingIds.has(model.id)) updated += 1;
        else added += 1;
        memory.upstreamModels = memory.upstreamModels.filter((item) => item.id !== model.id);
        memory.upstreamModels.push({ ...model, channelId, isAvailable: false, requiresAdminReview: true, lastSyncedAt: nowIso() });
        memory.channels = memory.channels.filter((item) => item.id !== channelId);
        memory.channels.push({ id: channelId, ...model, baseUrl: config.baseUrl, isEnabled: false });
        memory.routeCandidates = memory.routeCandidates.filter((item) => item.id !== `rc_${channelId}`);
        memory.routeCandidates.push({ id: `rc_${channelId}`, publicModelId: model.publicModelId, channelId, actualModelId: model.actualModelId, isEnabled: false });
      }
    } else {
      for (const model of models) {
        const channelId = `aicards_${sanitizeId(model.publicModelId)}_${sanitizeId(model.actualModelId)}`;
        const existing = await query("SELECT id FROM upstream_models WHERE id = $1 LIMIT 1", [model.id]);
        if (existing.rows[0]) updated += 1;
        else added += 1;
        await query(
	          `INSERT INTO upstream_models (
	             id, provider, provider_key, upstream_channel, channel_id, public_model_id, actual_model_id, display_name,
	             raw_model_name, raw_data, normalized_capabilities, input_cost_per_million,
	             output_cost_per_million, currency, is_detected, is_available, requires_admin_review, last_synced_at
	           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,0,0,'CNY',true,false,true,NOW())
	           ON CONFLICT (id) DO UPDATE SET
	             provider = EXCLUDED.provider,
	             provider_key = EXCLUDED.provider_key,
	             upstream_channel = EXCLUDED.upstream_channel,
	             channel_id = EXCLUDED.channel_id,
	             public_model_id = EXCLUDED.public_model_id,
	             actual_model_id = EXCLUDED.actual_model_id,
	             display_name = EXCLUDED.display_name,
	             raw_model_name = EXCLUDED.raw_model_name,
	             raw_data = EXCLUDED.raw_data,
	             normalized_capabilities = EXCLUDED.normalized_capabilities,
	             is_detected = true,
	             is_available = upstream_models.is_available,
	             requires_admin_review = upstream_models.requires_admin_review,
	             last_synced_at = NOW()`,
          [
            model.id,
            AICARDS_PROVIDER_KEY,
	            AICARDS_PROVIDER_KEY,
	            AICARDS_CHANNEL_NAME,
	            channelId,
	            model.publicModelId,
	            model.actualModelId,
	            model.displayName,
	            model.rawModelName,
            JSON.stringify(model.rawData || {}),
            JSON.stringify(model.normalizedCapabilities || {}),
          ],
        );
        await query(
          `INSERT INTO upstream_channels (
             id, provider_name, provider_key, channel_name, channel_type, base_url, actual_model_id,
             public_model_id, group_name, input_cost_per_million, output_cost_per_million, currency,
             priority, quality_score, route_strategy, is_enabled, is_user_visible, requires_admin_review, updated_at
           ) VALUES ($1,$2,$3,$4,'OpenAI Compatible',$5,$6,$7,$8,0,0,'CNY',90,70,'stability_first',false,false,true,NOW())
           ON CONFLICT (id) DO UPDATE SET
             provider_name = EXCLUDED.provider_name,
             provider_key = EXCLUDED.provider_key,
             channel_name = EXCLUDED.channel_name,
             channel_type = EXCLUDED.channel_type,
             base_url = EXCLUDED.base_url,
             actual_model_id = EXCLUDED.actual_model_id,
             public_model_id = EXCLUDED.public_model_id,
             group_name = EXCLUDED.group_name,
             priority = EXCLUDED.priority,
             quality_score = EXCLUDED.quality_score,
             route_strategy = EXCLUDED.route_strategy,
	             is_enabled = upstream_channels.is_enabled,
	             is_user_visible = false,
	             requires_admin_review = upstream_channels.requires_admin_review,
	             updated_at = NOW()`,
          [channelId, AICARDS_PROVIDER_KEY, AICARDS_PROVIDER_KEY, AICARDS_CHANNEL_NAME, config.baseUrl, model.actualModelId, model.publicModelId, AICARDS_GROUP_NAME],
        );
        await query(
          `INSERT INTO model_routes (
             id, public_model_id, display_name, display_provider, category,
             sell_input_price_per_million, sell_output_price_per_million, min_profit_margin,
             is_public, is_available, requires_admin_review, updated_at
           ) VALUES ($1,$2,$3,'FlowAPI',$4,0,0,0.2,false,false,true,NOW())
           ON CONFLICT (id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             display_provider = 'FlowAPI',
             category = EXCLUDED.category,
	             is_public = model_routes.is_public,
	             is_available = model_routes.is_available,
	             requires_admin_review = model_routes.requires_admin_review,
	             updated_at = NOW()`,
          [`route_${sanitizeId(model.publicModelId)}`, model.publicModelId, model.displayName, model.category],
        );
        await query(
          `INSERT INTO route_candidates (
             id, public_model_id, upstream_channel_id, actual_model_id, provider_key, priority, weight, is_enabled, updated_at
           ) VALUES ($1,$2,$3,$4,$5,90,1,false,NOW())
           ON CONFLICT (id) DO UPDATE SET
             public_model_id = EXCLUDED.public_model_id,
             upstream_channel_id = EXCLUDED.upstream_channel_id,
             actual_model_id = EXCLUDED.actual_model_id,
             provider_key = EXCLUDED.provider_key,
             priority = EXCLUDED.priority,
             weight = EXCLUDED.weight,
	             is_enabled = route_candidates.is_enabled,
	             updated_at = NOW()`,
          [`rc_${channelId}`, model.publicModelId, channelId, model.actualModelId, AICARDS_PROVIDER_KEY],
        );
      }
    }

    invalidateRouteCaches();
    await writeDataSyncLog({
      adminId,
      status: "success",
      totalItems: models.length,
      addedCount: added,
      updatedCount: updated,
      rawSummary: { baseUrlConfigured: Boolean(config.baseUrl), apiKeyConfigured: true },
    });
    return {
      ok: true,
      providerKey: AICARDS_PROVIDER_KEY,
      channelName: AICARDS_CHANNEL_NAME,
      total: models.length,
      added,
      updated,
      models: models.map((model) => ({
        publicModelId: model.publicModelId,
        displayName: model.displayName,
        actualModelId: model.actualModelId,
        requiresAdminReview: true,
        isPublic: false,
        isAvailable: false,
      })),
    };
  } catch (error) {
    await writeDataSyncLog({
      adminId,
      status: "failed",
      errorMessage: sanitizeProviderError(error.message || "备用上游同步失败"),
      rawSummary: { baseUrlConfigured: Boolean(config.baseUrl), apiKeyConfigured: Boolean(config.apiKey) },
    }).catch(() => {});
    throw error;
  }
}

export async function healthCheckAicards({ adminId = "", modelId = "", skipModelTest = false } = {}) {
  await ensureAicardsProviderSchema();
  const config = getAicardsConfig();
  if (!config.baseUrl) throw new Error("AICARDS_API_BASE_URL 未配置");
  if (!isUsableSecret(config.apiKey)) throw new Error("AICARDS_API_KEY 未配置或不可用");
  await assertSafeUpstreamUrl(config.modelsUrl);
  const started = Date.now();
  const response = await fetch(config.modelsUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(12000),
  });
  const modelsLatencyMs = Date.now() - started;
  const modelsOk = response.ok;
  const data = modelsOk ? await response.json().catch(() => ({})) : {};
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
  const selectedModel = modelId || normalizeModelItem(list[0])?.actualModelId || "";
  let modelTest = { skipped: true, ok: false, latencyMs: 0, firstTokenMs: 0, statusCode: 0, error: "" };

  if (modelsOk && selectedModel && !skipModelTest) {
    const chatStarted = Date.now();
    await assertSafeUpstreamUrl(config.chatUrl);
    try {
      const chatResponse = await fetch(config.chatUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const text = await chatResponse.text().catch(() => "");
      modelTest = {
        skipped: false,
        ok: chatResponse.ok,
        latencyMs: Date.now() - chatStarted,
        firstTokenMs: Date.now() - chatStarted,
        statusCode: chatResponse.status,
        error: chatResponse.ok ? "" : sanitizeProviderError(text).slice(0, 300),
      };
    } catch (error) {
      modelTest = {
        skipped: false,
        ok: false,
        latencyMs: Date.now() - chatStarted,
        firstTokenMs: 0,
        statusCode: 0,
        error: sanitizeProviderError(error.message || "health check failed"),
      };
    }
  }

  const ok = modelsOk && (modelTest.skipped || modelTest.ok);
  const lastError = ok ? "" : sanitizeProviderError(modelTest.error || `模型列表返回 HTTP ${response.status}`);
  if (hasDatabase()) {
    const params = [
      AICARDS_PROVIDER_KEY,
      ok ? 0.98 : 0,
      modelTest.latencyMs || modelsLatencyMs,
      modelTest.firstTokenMs || 0,
      lastError,
      ok,
    ];
    const modelFilter = modelId ? "AND actual_model_id = $7" : "";
    if (modelId) params.push(selectedModel);
    await query(
      `UPDATE upstream_channels
       SET success_rate = $2,
           avg_latency_ms = $3,
           avg_first_token_ms = $4,
           last_error = $5,
           last_health_check_at = NOW(),
           is_enabled = CASE WHEN $6 THEN is_enabled ELSE false END,
           updated_at = NOW()
       WHERE (provider_key = $1 OR provider_name = $1) ${modelFilter}`,
      params,
    );
  }
  await writeDataSyncLog({
    adminId,
    action: "health_check",
    status: ok ? "success" : "failed",
    totalItems: Array.isArray(list) ? list.length : 0,
    errorMessage: lastError,
    rawSummary: {
      modelsStatusCode: response.status,
      modelsLatencyMs,
      modelTest: {
        skipped: modelTest.skipped,
        ok: modelTest.ok,
        latencyMs: modelTest.latencyMs,
        firstTokenMs: modelTest.firstTokenMs,
        statusCode: modelTest.statusCode,
      },
    },
  }).catch(() => {});
  invalidateRouteCaches();
  return {
    ok,
    providerKey: AICARDS_PROVIDER_KEY,
    channelName: AICARDS_CHANNEL_NAME,
    modelsEndpoint: modelsOk ? "ok" : "failed",
    modelsStatusCode: response.status,
    modelsLatencyMs,
    modelCount: Array.isArray(list) ? list.length : 0,
    modelTest,
    lastError,
  };
}

export async function listAicardsSyncedModels() {
  await ensureAicardsProviderSchema();
  if (!hasDatabase()) return memory.upstreamModels.map((item) => ({ ...item }));
  const result = await query(
    `SELECT
       models.*,
       channels.id AS channel_id,
       channels.input_cost_per_million AS channel_input_cost_per_million,
       channels.output_cost_per_million AS channel_output_cost_per_million,
       channels.priority AS channel_priority,
       channels.is_enabled AS channel_is_enabled,
       channels.success_rate AS channel_success_rate,
       channels.last_health_check_at AS channel_last_health_check_at,
       channels.last_error AS channel_last_error,
       routes.sell_input_price_per_million,
       routes.sell_output_price_per_million,
       routes.min_profit_margin,
       routes.is_public AS route_is_public,
       routes.is_available AS route_is_available
     FROM upstream_models models
     LEFT JOIN upstream_channels channels ON channels.id = models.channel_id
     LEFT JOIN model_routes routes ON routes.public_model_id = models.public_model_id OR routes.public_model_id = channels.public_model_id
     WHERE models.provider_key = $1 OR models.provider = $1 OR models.upstream_channel = $2
     ORDER BY models.last_synced_at DESC, models.actual_model_id ASC
     LIMIT 500`,
    [AICARDS_PROVIDER_KEY, AICARDS_CHANNEL_NAME],
  );
  return result.rows.map(mapModelRow);
}

export async function reviewAicardsCandidate(input = {}, adminId = "") {
  await ensureAicardsProviderSchema();
  const id = String(input.id || input.modelId || input.upstreamModelId || "").trim();
  const actualModelId = String(input.actualModelId || input.actual_model_id || "").trim();
  const enable = Boolean(input.enable || input.isEnabled || input.is_enabled);
  const publish = Boolean(input.publish || input.isPublic || input.is_public);
  const publicModelId = String(input.publicModelId || input.public_model_id || "").trim();
  const displayName = String(input.displayName || input.display_name || "").trim();
  const modelType = String(input.modelType || input.model_type || "text").trim();
  const inputCost = assertPositivePrice(input.inputCostPerMillion ?? input.input_cost_per_million, "输入上游成本");
  const outputCost = assertPositivePrice(input.outputCostPerMillion ?? input.output_cost_per_million, "输出上游成本");
  const inputSell = assertPositivePrice(input.sellInputPricePerMillion ?? input.sell_input_price_per_million, "输入销售价");
  const outputSell = assertPositivePrice(input.sellOutputPricePerMillion ?? input.sell_output_price_per_million, "输出销售价");
  const minProfitMargin = Number(input.minProfitMargin ?? input.min_profit_margin ?? 0.2);
  assertMargin({ inputCost, outputCost, inputSell, outputSell, minProfitMargin });

  if (!publicModelId) {
    const error = new Error("请填写 FlowAPI 对外模型 ID");
    error.status = 400;
    throw error;
  }
  assertSafePublicModelText(publicModelId, "FlowAPI 对外模型 ID");
  if (!displayName) {
    const error = new Error("请填写用户看到的模型名称");
    error.status = 400;
    throw error;
  }
  assertSafePublicModelText(displayName, "用户看到的模型名称");

  const config = getAicardsConfig();
  if (!hasDatabase()) {
    const model = memory.upstreamModels.find((item) => item.id === id || item.actualModelId === actualModelId);
    if (!model) {
      const error = new Error("候选模型不存在，请先同步模型");
      error.status = 404;
      throw error;
    }
    const channelId = `aicards_${sanitizeId(publicModelId)}_${sanitizeId(model.actualModelId)}`;
    memory.channels = memory.channels.filter((item) => item.id !== channelId);
    memory.channels.push({
      id: channelId,
      providerKey: AICARDS_PROVIDER_KEY,
      upstreamChannel: AICARDS_CHANNEL_NAME,
      actualModelId: model.actualModelId,
      publicModelId,
      inputCostPerMillion: inputCost,
      outputCostPerMillion: outputCost,
      sellInputPricePerMillion: inputSell,
      sellOutputPricePerMillion: outputSell,
      minProfitMargin,
      baseUrl: config.baseUrl,
      isEnabled: enable,
      isPublic: publish,
      requiresAdminReview: !enable,
      updatedAt: nowIso(),
    });
    invalidateRouteCaches(publicModelId);
    return { ok: true, channelId, publicModelId, enabled: enable, published: publish };
  }

  const found = await query(
    `SELECT models.*, channels.id AS existing_channel_id, channels.success_rate, channels.last_health_check_at
     FROM upstream_models models
     LEFT JOIN upstream_channels channels ON channels.id = models.channel_id
     WHERE (models.id = $1 OR models.actual_model_id = $2)
       AND (models.provider_key = $3 OR models.provider = $3 OR models.upstream_channel = $4)
     ORDER BY models.last_synced_at DESC
     LIMIT 1`,
    [id, actualModelId, AICARDS_PROVIDER_KEY, AICARDS_CHANNEL_NAME],
  );
  const model = found.rows[0];
  if (!model) {
    const error = new Error("候选模型不存在，请先同步备用上游模型");
    error.status = 404;
    throw error;
  }
  const healthPassed = Number(model.success_rate || 0) > 0 && Boolean(model.last_health_check_at);
  if ((enable || publish) && !healthPassed) {
    const error = new Error("请先通过健康检查，再启用或发布备用线路");
    error.status = 400;
    throw error;
  }

  const channelId = model.existing_channel_id || model.channel_id || `aicards_${sanitizeId(publicModelId)}_${sanitizeId(model.actual_model_id)}`;
  await query(
    `UPDATE upstream_models
     SET display_name = $2,
         public_model_id = $3,
         input_cost_per_million = $4,
         output_cost_per_million = $5,
         is_available = $6,
         requires_admin_review = $7,
         last_synced_at = COALESCE(last_synced_at, NOW())
     WHERE id = $1`,
    [model.id, displayName, publicModelId, inputCost, outputCost, enable, !enable],
  );
  await query(
    `INSERT INTO upstream_channels (
       id, provider_name, provider_key, channel_name, channel_type, base_url, actual_model_id,
       public_model_id, group_name, input_cost_per_million, output_cost_per_million, currency,
       priority, quality_score, route_strategy, is_enabled, is_user_visible, requires_admin_review, updated_at
     ) VALUES ($1,$2,$3,$4,'OpenAI Compatible',$5,$6,$7,$8,$9,$10,'CNY',$11,$12,$13,$14,false,$15,NOW())
     ON CONFLICT (id) DO UPDATE SET
       provider_name = EXCLUDED.provider_name,
       provider_key = EXCLUDED.provider_key,
       channel_name = EXCLUDED.channel_name,
       channel_type = EXCLUDED.channel_type,
       base_url = EXCLUDED.base_url,
       actual_model_id = EXCLUDED.actual_model_id,
       public_model_id = EXCLUDED.public_model_id,
       group_name = EXCLUDED.group_name,
       input_cost_per_million = EXCLUDED.input_cost_per_million,
       output_cost_per_million = EXCLUDED.output_cost_per_million,
       priority = EXCLUDED.priority,
       quality_score = EXCLUDED.quality_score,
       route_strategy = EXCLUDED.route_strategy,
       is_enabled = EXCLUDED.is_enabled,
       is_user_visible = false,
       requires_admin_review = EXCLUDED.requires_admin_review,
       updated_at = NOW()`,
    [
      channelId,
      AICARDS_PROVIDER_KEY,
      AICARDS_PROVIDER_KEY,
      AICARDS_CHANNEL_NAME,
      config.baseUrl,
      model.actual_model_id,
      publicModelId,
      AICARDS_GROUP_NAME,
      inputCost,
      outputCost,
      Number(input.priority || 90),
      Number(input.qualityScore || input.quality_score || 70),
      String(input.routeStrategy || input.route_strategy || "stability_first"),
      enable,
      !enable,
    ],
  );
  await query(
    `INSERT INTO model_routes (
       id, public_model_id, display_name, display_provider, category,
       sell_input_price_per_million, sell_output_price_per_million, min_profit_margin,
       is_public, is_available, requires_admin_review, updated_at
     ) VALUES ($1,$2,$3,'FlowAPI',$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (id) DO UPDATE SET
       public_model_id = EXCLUDED.public_model_id,
       display_name = EXCLUDED.display_name,
       display_provider = 'FlowAPI',
       category = EXCLUDED.category,
       sell_input_price_per_million = EXCLUDED.sell_input_price_per_million,
       sell_output_price_per_million = EXCLUDED.sell_output_price_per_million,
       min_profit_margin = EXCLUDED.min_profit_margin,
       is_public = EXCLUDED.is_public,
       is_available = EXCLUDED.is_available,
       requires_admin_review = EXCLUDED.requires_admin_review,
       updated_at = NOW()`,
    [`route_${sanitizeId(publicModelId)}`, publicModelId, displayName, modelType, inputSell, outputSell, minProfitMargin, publish, enable, !enable],
  );
  await query(
    `INSERT INTO route_candidates (
       id, public_model_id, upstream_channel_id, actual_model_id, provider_key, priority, weight, is_enabled, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,1,$7,NOW())
     ON CONFLICT (id) DO UPDATE SET
       public_model_id = EXCLUDED.public_model_id,
       upstream_channel_id = EXCLUDED.upstream_channel_id,
       actual_model_id = EXCLUDED.actual_model_id,
       provider_key = EXCLUDED.provider_key,
       priority = EXCLUDED.priority,
       is_enabled = EXCLUDED.is_enabled,
       updated_at = NOW()`,
    [`rc_${channelId}`, publicModelId, channelId, model.actual_model_id, AICARDS_PROVIDER_KEY, Number(input.priority || 90), enable],
  );

  if (publish) {
    await upsertPublishedModel({
      modelId: publicModelId,
      displayName,
      provider: "FlowAPI",
      modelType,
      upstreamModelId: model.actual_model_id,
      description: input.description || `${displayName} 由 FlowAPI 统一计费、统一日志、统一售后。`,
      tags: input.tags || "FlowAPI 统一计费，稳定线路，成本可控",
      enabled: enable,
      showInModelSquare: true,
      showInApiKeyCreate: true,
      showInImageGeneration: false,
      pricing: {
        billingMode: "token_multiplier",
        multiplier: 1,
        inputCostPerMTokens: inputCost,
        outputCostPerMTokens: outputCost,
        inputSellPricePerMTokens: inputSell,
        outputSellPricePerMTokens: outputSell,
        enabled: enable,
      },
    }, adminId);
  } else {
    const existingPublished = (await listPublishedModels()).find((item) => item.modelId === publicModelId);
    if (existingPublished) {
      await upsertPublishedModel({
        ...existingPublished,
        modelId: publicModelId,
        displayName,
        provider: "FlowAPI",
        modelType,
        upstreamModelId: model.actual_model_id,
        description: input.description || existingPublished.description || `${displayName} 已在 FlowAPI 后台下架。`,
        tags: input.tags || existingPublished.tags || "FlowAPI 备用线路，已下架",
        enabled: false,
        showInModelSquare: false,
        showInApiKeyCreate: false,
        showInImageGeneration: false,
        pricing: {
          billingMode: "token_multiplier",
          multiplier: 1,
          inputCostPerMTokens: inputCost,
          outputCostPerMTokens: outputCost,
          inputSellPricePerMTokens: inputSell,
          outputSellPricePerMTokens: outputSell,
          enabled: false,
        },
      }, adminId);
    }
  }

  invalidateRouteCaches(publicModelId);
  return {
    ok: true,
    channelId,
    publicModelId,
    enabled: enable,
    published: publish,
    minProfitMargin,
  };
}

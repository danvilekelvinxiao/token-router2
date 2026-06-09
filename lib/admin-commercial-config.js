import crypto from "crypto";
import { hasDatabase, query } from "@/lib/db";
import { listImageModels, updateImageModelConfig } from "@/lib/image-studio";
import { getAllModelConfigs, saveModelConfig } from "@/lib/model-store";
import { MODEL_PRODUCTS, normalizeModelProduct } from "@/lib/model-products";
import { assertSafeUpstreamUrl, sanitizeSecretText } from "@/lib/safe-upstream-url";

const memory = () => {
  if (!globalThis.__FLOWAPI_BOSS_WIZARD__) {
    globalThis.__FLOWAPI_BOSS_WIZARD__ = {
      upstreams: [],
      importedModels: [],
      pricing: [],
      drafts: {},
      auditLogs: [],
    };
  }
  return globalThis.__FLOWAPI_BOSS_WIZARD__;
};

const DEFAULT_PROTOCOLS = [
  "/v1/chat/completions",
  "/v1/models",
  "/v1/images/generations",
  "/v1/responses",
];

export const UPSTREAM_TYPES = [
  "OpenAI Compatible",
  "OpenRouter",
  "New API",
  "One API",
  "DeepSeek 官方",
  "Claude 官方",
  "Gemini 官方",
  "Qwen / 阿里云",
  "火山 / 豆包",
  "自定义",
];

export const BILLING_MODES = [
  "token_multiplier",
  "token_fixed_price",
  "per_image_fixed_profit",
  "per_image_multiplier",
  "token_plus_image",
  "free",
  "manual",
];

const STARTER_MODEL_PACK_IDS = [
  "deepseek-chat",
  "deepseek-reasoner",
  "qwen/qwen3-32b",
  "flowapi-gpt4o-mini",
];

const FULL_MODEL_PACK_IDS = [
  ...STARTER_MODEL_PACK_IDS,
  "flowapi-gemini-flash",
  "flowapi-codex-lite",
  "flowapi-claude-sonnet",
];

const PACK_PRICING_PRESETS = {
  "deepseek-chat": {
    inputCostPerMTokens: 1.45,
    outputCostPerMTokens: 5.77,
    inputSellPricePerMTokens: 3,
    outputSellPricePerMTokens: 12,
  },
  "deepseek-reasoner": {
    inputCostPerMTokens: 5.04,
    outputCostPerMTokens: 18,
    inputSellPricePerMTokens: 10,
    outputSellPricePerMTokens: 36,
  },
  "qwen/qwen3-32b": {
    inputCostPerMTokens: 1,
    outputCostPerMTokens: 4,
    inputSellPricePerMTokens: 3,
    outputSellPricePerMTokens: 12,
  },
  "flowapi-gpt4o-mini": {
    inputCostPerMTokens: 1.2,
    outputCostPerMTokens: 4.8,
    inputSellPricePerMTokens: 3,
    outputSellPricePerMTokens: 12,
  },
  "flowapi-gemini-flash": {
    inputCostPerMTokens: 1.4,
    outputCostPerMTokens: 5.6,
    inputSellPricePerMTokens: 4,
    outputSellPricePerMTokens: 16,
  },
  "flowapi-codex-lite": {
    inputCostPerMTokens: 8,
    outputCostPerMTokens: 32,
    inputSellPricePerMTokens: 16,
    outputSellPricePerMTokens: 64,
  },
  "flowapi-claude-sonnet": {
    inputCostPerMTokens: 18,
    outputCostPerMTokens: 90,
    inputSellPricePerMTokens: 36,
    outputSellPricePerMTokens: 180,
  },
};

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeBaseUrl(baseUrl = "") {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

function detectProvider(modelId = "", fallback = "") {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("gpt") || id.includes("openai") || id.includes("o1") || id.includes("o3") || id.includes("o4")) return "openai";
  if (id.includes("claude") || id.includes("anthropic")) return "anthropic";
  if (id.includes("gemini") || id.includes("google") || id.includes("imagen")) return "google";
  if (id.includes("deepseek")) return "deepseek";
  if (id.includes("qwen") || id.includes("alibaba") || id.includes("dashscope")) return "alibaba";
  if (id.includes("doubao") || id.includes("seedream") || id.includes("bytedance")) return "bytedance";
  if (id.includes("flux") || id.includes("black-forest")) return "flux";
  if (id.includes("stable") || id.includes("sdxl") || id.includes("stability")) return "stability";
  if (id.includes("grok") || id.includes("x-ai")) return "xai";
  return String(fallback || "custom").toLowerCase();
}

function detectModelType(modelId = "") {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("image-edit") || id.includes("edit")) return "image-edit";
  if (id.includes("image") || id.includes("imagen") || id.includes("flux") || id.includes("sdxl") || id.includes("seedream") || id.includes("recraft") || id.includes("ideogram")) return "image";
  if (id.includes("embed")) return "embedding";
  if (id.includes("audio") || id.includes("tts") || id.includes("whisper")) return "audio";
  if (id.includes("video") || id.includes("kling") || id.includes("sora")) return "video";
  if (id.includes("vision")) return "vision";
  if (id.includes("code") || id.includes("codex")) return "coding";
  return "text";
}

function capabilitiesFor(modelType) {
  return {
    text: modelType === "text" || modelType === "vision" || modelType === "coding" || modelType === "agent",
    image: modelType === "image" || modelType === "image-edit",
    imageEdit: modelType === "image-edit",
    video: modelType === "video",
    toolCalling: modelType === "text" || modelType === "agent",
  };
}

function displayNameFromModelId(modelId = "") {
  return String(modelId || "")
    .split("/")
    .pop()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function encryptText(plain = "") {
  const value = String(plain || "");
  if (!value) return "";
  const secret = process.env.ADMIN_CONFIG_ENCRYPTION_KEY || process.env.PROXY_ACCESS_TOKEN || process.env.ADMIN_SECRET || "flowapi-local-dev-key";
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptText(encrypted = "") {
  const value = String(encrypted || "");
  if (!value.startsWith("enc:v1:")) return value;
  const [, , ivRaw, tagRaw, textRaw] = value.split(":");
  const secret = process.env.ADMIN_CONFIG_ENCRYPTION_KEY || process.env.PROXY_ACCESS_TOKEN || process.env.ADMIN_SECRET || "flowapi-local-dev-key";
  const key = crypto.createHash("sha256").update(secret).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(textRaw, "base64")), decipher.final()]).toString("utf8");
}

export function maskApiKey(key = "") {
  const value = String(key || "");
  if (!value) return "";
  if (value.length <= 10) return `${value.slice(0, 2)}****`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function round2(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

export function calculatePricing(input = {}) {
  const billingMode = BILLING_MODES.includes(input.billingMode) ? input.billingMode : "token_multiplier";
  const multiplier = Math.max(0, Number(input.multiplier || 1));
  const imageCount = Math.max(1, Math.min(99, Number(input.imageCount || input.n || 1)));

  const inputCost = Number(input.inputCostPerMTokens || 0);
  const outputCost = Number(input.outputCostPerMTokens || 0);
  const cachedCost = Number(input.cachedInputCostPerMTokens || 0);
  const inputSell = input.inputSellPricePerMTokens !== undefined ? Number(input.inputSellPricePerMTokens || 0) : inputCost * multiplier;
  const outputSell = input.outputSellPricePerMTokens !== undefined ? Number(input.outputSellPricePerMTokens || 0) : outputCost * multiplier;
  const cachedSell = input.cachedInputSellPricePerMTokens !== undefined ? Number(input.cachedInputSellPricePerMTokens || 0) : cachedCost * multiplier;

  const imageCost = Number(input.imageCostPerImageCny || 0);
  const imageProfit = Number(input.imageFixedProfitPerImageCny || 0);
  const imageSell = input.imageSellPricePerImageCny !== undefined
    ? Number(input.imageSellPricePerImageCny || 0)
    : billingMode === "per_image_multiplier"
      ? imageCost * multiplier
      : imageCost + imageProfit;

  const textCost = inputCost + outputCost;
  const textSell = inputSell + outputSell;
  const textProfit = Math.max(0, textSell - textCost);
  const imageTotalCost = imageCost * imageCount;
  const imageTotalSell = imageSell * imageCount;
  const imageTotalProfit = Math.max(0, imageTotalSell - imageTotalCost);
  const activeCost = billingMode.startsWith("per_image") || billingMode === "token_plus_image" ? imageTotalCost : textCost;
  const activeSell = billingMode.startsWith("per_image") || billingMode === "token_plus_image" ? imageTotalSell : textSell;
  const activeProfit = Math.max(0, activeSell - activeCost);

  return {
    billingMode,
    multiplier: round2(multiplier),
    inputSellPricePerMTokens: round2(inputSell),
    outputSellPricePerMTokens: round2(outputSell),
    cachedInputSellPricePerMTokens: round2(cachedSell),
    imageSellPricePerImageCny: round2(imageSell),
    textCostPerMTokens: round2(textCost),
    textSellPricePerMTokens: round2(textSell),
    textGrossProfitPerMTokens: round2(textProfit),
    textProfitMargin: textSell > 0 ? round2((textProfit / textSell) * 100) : 0,
    imageCount,
    imageTotalCostCny: round2(imageTotalCost),
    imageTotalSellPriceCny: round2(imageTotalSell),
    imageTotalProfitCny: round2(imageTotalProfit),
    imageProfitMargin: imageTotalSell > 0 ? round2((imageTotalProfit / imageTotalSell) * 100) : 0,
    grossProfit: round2(activeProfit),
    profitMargin: activeSell > 0 ? round2((activeProfit / activeSell) * 100) : 0,
  };
}

function minimumTextProfitMargin() {
  const configured = Number(process.env.FLOWAPI_MIN_TEXT_PROFIT_MARGIN ?? 0.2);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0.2;
}

function minimumImageProfitMargin() {
  const configured = Number(process.env.FLOWAPI_MIN_IMAGE_PROFIT_MARGIN ?? process.env.FLOWAPI_MIN_TEXT_PROFIT_MARGIN ?? 0.2);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0.2;
}

function assertPublishedModelCommercialGuard(model = {}, pricePayload = {}) {
  const isVisible = model.enabled !== false && (
    model.showInModelSquare !== false
    || model.showInApiKeyCreate !== false
    || model.showInImageGeneration === true
  );
  const isFree = model.free === true || pricePayload.billingMode === "free";
  if (!isVisible || isFree) return;

  const modelType = String(model.modelType || pricePayload.modelType || "text");
  const isImage = modelType === "image" || modelType === "image-edit" || String(pricePayload.billingMode || "").startsWith("per_image");
  const minMargin = isImage ? minimumImageProfitMargin() : minimumTextProfitMargin();
  const cost = isImage
    ? Number(pricePayload.imageCostPerImageCny || 0)
    : Number(pricePayload.inputCostPerMTokens || 0) + Number(pricePayload.outputCostPerMTokens || 0);
  const sell = isImage
    ? Number(pricePayload.imageSellPricePerImageCny || 0)
    : Number(pricePayload.inputSellPricePerMTokens || 0) + Number(pricePayload.outputSellPricePerMTokens || 0);

  if (!Number.isFinite(cost) || cost <= 0) {
    throw new Error("公开模型必须先配置真实成本；成本为 0 时只能保存为草稿或免费模型。");
  }
  if (!Number.isFinite(sell) || sell <= 0) {
    throw new Error("公开模型必须先配置用户售价；售价为 0 时只能保存为草稿或免费模型。");
  }
  if (sell < cost * (1 + minMargin)) {
    throw new Error(`公开模型售价必须覆盖成本并保留至少 ${Math.round(minMargin * 100)}% 毛利。`);
  }
}

export async function ensureCommercialConfigSchema() {
  if (!hasDatabase()) return;
  await query(`
    CREATE TABLE IF NOT EXISTS upstream_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'OpenAI Compatible',
      base_url TEXT NOT NULL DEFAULT '',
      encrypted_api_key TEXT NOT NULL DEFAULT '',
      api_key_preview TEXT NOT NULL DEFAULT '',
      protocol TEXT NOT NULL DEFAULT '/v1/models',
      status TEXT NOT NULL DEFAULT 'draft',
      latency_ms INTEGER NOT NULL DEFAULT 0,
      last_test_at TIMESTAMPTZ,
      last_error TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS imported_models (
      id TEXT PRIMARY KEY,
      upstream_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      logo TEXT NOT NULL DEFAULT '',
      model_type TEXT NOT NULL DEFAULT 'text',
      capabilities_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      context_length INTEGER NOT NULL DEFAULT 0,
      official_release_date TEXT DEFAULT '',
      raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'imported',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (upstream_id, model_id)
    );

    CREATE TABLE IF NOT EXISTS published_models (
      id TEXT PRIMARY KEY,
      imported_model_id TEXT DEFAULT '',
      model_id TEXT NOT NULL,
      upstream_model_id TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      logo TEXT NOT NULL DEFAULT '',
      model_type TEXT NOT NULL DEFAULT 'text',
      description TEXT DEFAULT '',
      tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      official_release_date TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 999,
      recommended BOOLEAN NOT NULL DEFAULT false,
      hot BOOLEAN NOT NULL DEFAULT false,
      free BOOLEAN NOT NULL DEFAULT false,
      member_only BOOLEAN NOT NULL DEFAULT false,
      black_gold_only BOOLEAN NOT NULL DEFAULT false,
      enabled BOOLEAN NOT NULL DEFAULT true,
      show_in_model_square BOOLEAN NOT NULL DEFAULT true,
      show_in_api_key_create BOOLEAN NOT NULL DEFAULT true,
      show_in_image_generation BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE published_models ADD COLUMN IF NOT EXISTS upstream_model_id TEXT NOT NULL DEFAULT '';

    CREATE TABLE IF NOT EXISTS model_pricing_configs (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      model_type TEXT NOT NULL DEFAULT 'text',
      billing_mode TEXT NOT NULL DEFAULT 'token_multiplier',
      input_cost_per_m_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
      output_cost_per_m_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
      cached_input_cost_per_m_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
      input_sell_price_per_m_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
      output_sell_price_per_m_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
      cached_input_sell_price_per_m_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
      multiplier NUMERIC(8, 4) NOT NULL DEFAULT 1,
      image_cost_per_image_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
      image_fixed_profit_per_image_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
      image_sell_price_per_image_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
      video_cost_per_second_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
      video_fixed_profit_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
      video_sell_price_cny NUMERIC(14, 6) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CNY',
      profit_margin NUMERIC(8, 4) NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS boss_wizard_drafts (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL DEFAULT '',
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_sync_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      before_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      after_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      sync_result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_published_models_model_id ON published_models(model_id);
    CREATE INDEX IF NOT EXISTS idx_imported_models_upstream ON imported_models(upstream_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_model_pricing_model_type ON model_pricing_configs(model_type, enabled);
  `);
}

export async function writeAdminAuditLog({ adminId = "", action, targetType = "", targetId = "", before = {}, after = {}, syncResult = {} }) {
  await ensureCommercialConfigSchema();
  const entry = {
    id: makeId("audit"),
    adminId,
    action,
    targetType,
    targetId,
    before,
    after,
    syncResult,
    createdAt: nowIso(),
  };
  if (!hasDatabase()) {
    memory().auditLogs.unshift(entry);
    return entry;
  }
  await query(
    `INSERT INTO admin_sync_audit_logs (id, admin_id, action, target_type, target_id, before_json, after_json, sync_result_json)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)`,
    [entry.id, adminId, action, targetType, targetId, JSON.stringify(before), JSON.stringify(after), JSON.stringify(syncResult)]
  );
  return entry;
}

function mapUpstreamRow(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    baseUrl: row.base_url,
    apiKeyPreview: row.api_key_preview || "",
    protocol: row.protocol,
    status: row.status,
    latencyMs: Number(row.latency_ms || 0),
    lastTestAt: row.last_test_at ? new Date(row.last_test_at).toISOString() : null,
    lastError: row.last_error || "",
    remark: row.remark || "",
    enabled: row.enabled !== false,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : nowIso(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso(),
  };
}

export async function listUpstreams() {
  await ensureCommercialConfigSchema();
  if (!hasDatabase()) return memory().upstreams.map(({ encryptedApiKey, ...item }) => item);
  const result = await query("SELECT * FROM upstream_providers ORDER BY created_at DESC");
  return result.rows.map(mapUpstreamRow);
}

export async function getUpstream(id, { includeSecret = false } = {}) {
  await ensureCommercialConfigSchema();
  if (!hasDatabase()) {
    const found = memory().upstreams.find((item) => item.id === id);
    if (!found) return null;
    return includeSecret ? found : (({ encryptedApiKey, apiKey, ...rest }) => rest)(found);
  }
  const result = await query("SELECT * FROM upstream_providers WHERE id = $1", [id]);
  const row = result.rows[0];
  if (!row) return null;
  const mapped = mapUpstreamRow(row);
  return includeSecret ? { ...mapped, apiKey: decryptText(row.encrypted_api_key || "") } : mapped;
}

export async function saveUpstream(input = {}, adminId = "") {
  await ensureCommercialConfigSchema();
  const baseUrl = normalizeBaseUrl(input.baseUrl || input.base_url);
  if (!input.name) throw new Error("请填写上游名称");
  if (!baseUrl) throw new Error("请填写 Base URL");
  if (baseUrl.endsWith("/v1")) throw new Error("Base URL 建议填写根地址，不要以 /v1 结尾");
  await assertSafeUpstreamUrl(baseUrl, { resolveDns: false });
  const protocol = DEFAULT_PROTOCOLS.includes(input.protocol) ? input.protocol : (input.protocol || "/v1/models");
  const id = input.id || makeId("upstream");
  const apiKey = String(input.apiKey || "").trim();
  const encryptedApiKey = apiKey ? encryptText(apiKey) : input.encryptedApiKey || "";
  const entry = {
    id,
    name: String(input.name || "").trim(),
    type: UPSTREAM_TYPES.includes(input.type) ? input.type : "OpenAI Compatible",
    baseUrl,
    encryptedApiKey,
    apiKeyPreview: apiKey ? maskApiKey(apiKey) : input.apiKeyPreview || "",
    protocol,
    status: input.enabled === false ? "disabled" : (input.status || "draft"),
    latencyMs: Number(input.latencyMs || 0),
    lastTestAt: input.lastTestAt || null,
    lastError: input.lastError || "",
    remark: input.remark || "",
    enabled: input.enabled !== false,
  };
  if (!hasDatabase()) {
    const store = memory();
    const index = store.upstreams.findIndex((item) => item.id === id);
    if (index >= 0) store.upstreams[index] = { ...store.upstreams[index], ...entry, updatedAt: nowIso() };
    else store.upstreams.unshift({ ...entry, createdAt: nowIso(), updatedAt: nowIso() });
  } else {
    await query(
      `INSERT INTO upstream_providers (id, name, type, base_url, encrypted_api_key, api_key_preview, protocol, status, latency_ms, last_error, remark, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         name=$2,type=$3,base_url=$4,
         encrypted_api_key=COALESCE(NULLIF($5,''), upstream_providers.encrypted_api_key),
         api_key_preview=COALESCE(NULLIF($6,''), upstream_providers.api_key_preview),
         protocol=$7,status=$8,latency_ms=$9,last_error=$10,remark=$11,enabled=$12,updated_at=NOW()`,
      [entry.id, entry.name, entry.type, entry.baseUrl, entry.encryptedApiKey, entry.apiKeyPreview, entry.protocol, entry.status, entry.latencyMs, entry.lastError, entry.remark, entry.enabled]
    );
  }
  await writeAdminAuditLog({ adminId, action: "save_upstream", targetType: "upstream", targetId: id, after: { ...entry, encryptedApiKey: "hidden" } });
  return getUpstream(id);
}

export async function testUpstreamConnection(upstreamId) {
  const upstream = await getUpstream(upstreamId, { includeSecret: true });
  if (!upstream) throw new Error("上游不存在");
  const started = Date.now();
  const modelsUrl = `${normalizeBaseUrl(upstream.baseUrl)}/v1/models`;
  try {
    await assertSafeUpstreamUrl(modelsUrl);
    const response = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${upstream.apiKey}`,
        "Content-Type": "application/json",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    const latencyMs = Date.now() - started;
    let data = null;
    try { data = JSON.parse(text); } catch {}
    const modelList = normalizeModelsPayload(data);
    const result = {
      ok: response.ok,
      statusCode: response.status,
      latencyMs,
      modelCount: modelList.length,
      message: response.ok ? `连接成功，拉取到 ${modelList.length} 个模型` : `连接失败：HTTP ${response.status}`,
      error: response.ok ? "" : sanitizeSecretText(text).slice(0, 240),
    };
    await updateUpstreamTestState(upstreamId, result);
    return result;
  } catch (error) {
    const result = {
      ok: false,
      statusCode: 0,
      latencyMs: Date.now() - started,
      modelCount: 0,
      message: "连接失败",
      error: sanitizeSecretText(error.message || String(error)),
    };
    await updateUpstreamTestState(upstreamId, result);
    return result;
  }
}

async function updateUpstreamTestState(upstreamId, result) {
  if (!hasDatabase()) {
    const target = memory().upstreams.find((item) => item.id === upstreamId);
    if (target) {
      target.status = result.ok ? "active" : "error";
      target.latencyMs = result.latencyMs;
      target.lastTestAt = nowIso();
      target.lastError = result.error || "";
    }
    return;
  }
  await query(
    `UPDATE upstream_providers
     SET status=$2, latency_ms=$3, last_test_at=NOW(), last_error=$4, updated_at=NOW()
     WHERE id=$1`,
    [upstreamId, result.ok ? "active" : "error", result.latencyMs || 0, result.error || ""]
  );
}

function normalizeModelsPayload(data) {
  const raw = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  return raw
    .map((item) => {
      const modelId = typeof item === "string" ? item : (item.id || item.model || item.name || "");
      if (!modelId) return null;
      const modelType = detectModelType(modelId);
      const provider = detectProvider(modelId, item?.owned_by || item?.provider || "");
      return {
        source: item,
        modelId,
        displayName: item?.display_name || item?.name || displayNameFromModelId(modelId),
        provider,
        logo: provider,
        modelType,
        capabilities: capabilitiesFor(modelType),
        contextLength: Number(item?.context_length || item?.contextLength || item?.top_provider?.context_length || 0),
        officialReleaseDate: item?.created ? new Date(Number(item.created) * 1000).toISOString().slice(0, 10) : "",
      };
    })
    .filter(Boolean);
}

export async function syncUpstreamModels(upstreamId) {
  const upstream = await getUpstream(upstreamId, { includeSecret: true });
  if (!upstream) throw new Error("上游不存在");
  const modelsUrl = `${normalizeBaseUrl(upstream.baseUrl)}/v1/models`;
  await assertSafeUpstreamUrl(modelsUrl);
  const response = await fetch(modelsUrl, {
    headers: {
      Authorization: `Bearer ${upstream.apiKey}`,
      "Content-Type": "application/json",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`拉取模型失败：HTTP ${response.status} ${sanitizeSecretText(text).slice(0, 200)}`);
  }
  let data = null;
  try { data = JSON.parse(text); } catch {
    throw new Error("上游返回不是 JSON");
  }
  const models = normalizeModelsPayload(data);
  await saveImportedModels(upstreamId, models);
  return models;
}

export async function saveImportedModels(upstreamId, models = []) {
  await ensureCommercialConfigSchema();
  if (!hasDatabase()) {
    const store = memory();
    store.importedModels = store.importedModels.filter((item) => item.upstreamId !== upstreamId);
    models.forEach((model) => store.importedModels.push({
      id: makeId("imported"),
      upstreamId,
      ...model,
      status: "imported",
      rawJson: model.source || {},
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }));
    return;
  }
  for (const model of models) {
    await query(
      `INSERT INTO imported_models (
        id, upstream_id, model_id, display_name, provider, logo, model_type,
        capabilities_json, context_length, official_release_date, raw_json, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,'imported')
       ON CONFLICT (upstream_id, model_id) DO UPDATE SET
        display_name=$4, provider=$5, logo=$6, model_type=$7, capabilities_json=$8::jsonb,
        context_length=$9, official_release_date=$10, raw_json=$11::jsonb, updated_at=NOW()`,
      [
        makeId("imported"),
        upstreamId,
        model.modelId,
        model.displayName,
        model.provider,
        model.logo,
        model.modelType,
        JSON.stringify(model.capabilities || {}),
        model.contextLength || 0,
        model.officialReleaseDate || "",
        JSON.stringify(model.source || {}),
      ]
    );
  }
}

function mapImportedRow(row) {
  return {
    id: row.id,
    upstreamId: row.upstream_id || row.upstreamId,
    modelId: row.model_id || row.modelId,
    displayName: row.display_name || row.displayName,
    provider: row.provider || "",
    logo: row.logo || "",
    modelType: row.model_type || row.modelType || "text",
    capabilities: row.capabilities_json || row.capabilities || {},
    contextLength: Number(row.context_length || row.contextLength || 0),
    officialReleaseDate: row.official_release_date || row.officialReleaseDate || "",
    status: row.status || "imported",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt || nowIso(),
  };
}

export async function listImportedModels({ upstreamId = "" } = {}) {
  await ensureCommercialConfigSchema();
  if (!hasDatabase()) {
    return memory().importedModels
      .filter((item) => !upstreamId || item.upstreamId === upstreamId)
      .map(mapImportedRow);
  }
  const params = [];
  const where = upstreamId ? "WHERE upstream_id = $1" : "";
  if (upstreamId) params.push(upstreamId);
  const result = await query(`SELECT * FROM imported_models ${where} ORDER BY created_at DESC`, params);
  return result.rows.map(mapImportedRow);
}

function normalizePricingPayload(model, input = {}) {
  const modelType = input.modelType || model.modelType || "text";
  const billingMode = input.billingMode || (modelType === "image" || modelType === "image-edit" ? "per_image_fixed_profit" : "token_multiplier");
  const calculated = calculatePricing({ ...input, billingMode, modelType });
  return {
    id: input.id || makeId("pricing"),
    modelId: input.modelId || model.modelId,
    displayName: input.displayName || model.displayName || input.modelId || "",
    provider: input.provider || model.provider || "",
    modelType,
    billingMode,
    inputCostPerMTokens: Number(input.inputCostPerMTokens || 0),
    outputCostPerMTokens: Number(input.outputCostPerMTokens || 0),
    cachedInputCostPerMTokens: Number(input.cachedInputCostPerMTokens || 0),
    inputSellPricePerMTokens: calculated.inputSellPricePerMTokens,
    outputSellPricePerMTokens: calculated.outputSellPricePerMTokens,
    cachedInputSellPricePerMTokens: calculated.cachedInputSellPricePerMTokens,
    multiplier: calculated.multiplier,
    imageCostPerImageCny: Number(input.imageCostPerImageCny || 0),
    imageFixedProfitPerImageCny: Number(input.imageFixedProfitPerImageCny || 0),
    imageSellPricePerImageCny: calculated.imageSellPricePerImageCny,
    videoCostPerSecondCny: Number(input.videoCostPerSecondCny || 0),
    videoFixedProfitCny: Number(input.videoFixedProfitCny || 0),
    videoSellPriceCny: Number(input.videoSellPriceCny || 0),
    currency: input.currency || "CNY",
    profitMargin: calculated.profitMargin || calculated.imageProfitMargin || calculated.textProfitMargin || 0,
    enabled: input.enabled !== false,
    calculated,
  };
}

export async function saveModelPricing(model, input = {}) {
  await ensureCommercialConfigSchema();
  const payload = normalizePricingPayload(model, input);
  if (!hasDatabase()) {
    const store = memory();
    const idx = store.pricing.findIndex((item) => item.modelId === payload.modelId);
    if (idx >= 0) store.pricing[idx] = { ...store.pricing[idx], ...payload, updatedAt: nowIso() };
    else store.pricing.unshift({ ...payload, createdAt: nowIso(), updatedAt: nowIso() });
    return payload;
  }
  await query(
    `INSERT INTO model_pricing_configs (
      id, model_id, display_name, provider, model_type, billing_mode,
      input_cost_per_m_tokens, output_cost_per_m_tokens, cached_input_cost_per_m_tokens,
      input_sell_price_per_m_tokens, output_sell_price_per_m_tokens, cached_input_sell_price_per_m_tokens,
      multiplier, image_cost_per_image_cny, image_fixed_profit_per_image_cny, image_sell_price_per_image_cny,
      video_cost_per_second_cny, video_fixed_profit_cny, video_sell_price_cny, currency, profit_margin, enabled
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
    ON CONFLICT (model_id) DO UPDATE SET
      display_name=$3, provider=$4, model_type=$5, billing_mode=$6,
      input_cost_per_m_tokens=$7, output_cost_per_m_tokens=$8, cached_input_cost_per_m_tokens=$9,
      input_sell_price_per_m_tokens=$10, output_sell_price_per_m_tokens=$11, cached_input_sell_price_per_m_tokens=$12,
      multiplier=$13, image_cost_per_image_cny=$14, image_fixed_profit_per_image_cny=$15,
      image_sell_price_per_image_cny=$16, video_cost_per_second_cny=$17, video_fixed_profit_cny=$18,
      video_sell_price_cny=$19, currency=$20, profit_margin=$21, enabled=$22, updated_at=NOW()`,
    [
      payload.id,
      payload.modelId,
      payload.displayName,
      payload.provider,
      payload.modelType,
      payload.billingMode,
      payload.inputCostPerMTokens,
      payload.outputCostPerMTokens,
      payload.cachedInputCostPerMTokens,
      payload.inputSellPricePerMTokens,
      payload.outputSellPricePerMTokens,
      payload.cachedInputSellPricePerMTokens,
      payload.multiplier,
      payload.imageCostPerImageCny,
      payload.imageFixedProfitPerImageCny,
      payload.imageSellPricePerImageCny,
      payload.videoCostPerSecondCny,
      payload.videoFixedProfitCny,
      payload.videoSellPriceCny,
      payload.currency,
      payload.profitMargin,
      payload.enabled,
    ]
  );
  return payload;
}

function mapPricingRow(row) {
  return {
    id: row.id,
    modelId: row.model_id,
    displayName: row.display_name,
    provider: row.provider,
    modelType: row.model_type,
    billingMode: row.billing_mode,
    inputCostPerMTokens: Number(row.input_cost_per_m_tokens || 0),
    outputCostPerMTokens: Number(row.output_cost_per_m_tokens || 0),
    cachedInputCostPerMTokens: Number(row.cached_input_cost_per_m_tokens || 0),
    inputSellPricePerMTokens: Number(row.input_sell_price_per_m_tokens || 0),
    outputSellPricePerMTokens: Number(row.output_sell_price_per_m_tokens || 0),
    cachedInputSellPricePerMTokens: Number(row.cached_input_sell_price_per_m_tokens || 0),
    multiplier: Number(row.multiplier || 1),
    imageCostPerImageCny: Number(row.image_cost_per_image_cny || 0),
    imageFixedProfitPerImageCny: Number(row.image_fixed_profit_per_image_cny || 0),
    imageSellPricePerImageCny: Number(row.image_sell_price_per_image_cny || 0),
    currency: row.currency || "CNY",
    profitMargin: Number(row.profit_margin || 0),
    enabled: row.enabled !== false,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function listModelPricing() {
  await ensureCommercialConfigSchema();
  if (!hasDatabase()) return memory().pricing;
  const result = await query("SELECT * FROM model_pricing_configs ORDER BY updated_at DESC");
  return result.rows.map(mapPricingRow);
}

function mapPublishedRow(row) {
  return {
    id: row.id,
    importedModelId: row.imported_model_id || "",
    modelId: row.model_id,
    upstreamModelId: row.upstream_model_id || row.actual_model_id || row.model_id,
    actualModelId: row.upstream_model_id || row.actual_model_id || row.model_id,
    displayName: row.display_name,
    provider: row.provider || "FlowAPI",
    logo: row.logo || "",
    modelType: row.model_type || "text",
    description: row.description || "",
    tags: row.tags_json || [],
    officialReleaseDate: row.official_release_date || "",
    sortOrder: Number(row.sort_order || 999),
    recommended: Boolean(row.recommended),
    hot: Boolean(row.hot),
    free: Boolean(row.free),
    memberOnly: Boolean(row.member_only),
    blackGoldOnly: Boolean(row.black_gold_only),
    enabled: row.enabled !== false,
    showInModelSquare: row.show_in_model_square !== false,
    showInApiKeyCreate: row.show_in_api_key_create !== false,
    showInImageGeneration: Boolean(row.show_in_image_generation),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function listPublishedModels({ target = "" } = {}) {
  await ensureCommercialConfigSchema();
  if (!hasDatabase()) {
    let rows = memory().publishedModels || [];
    if (target === "modelSquare") rows = rows.filter((item) => item.showInModelSquare && item.enabled);
    if (target === "apiKey") rows = rows.filter((item) => item.showInApiKeyCreate && item.enabled);
    if (target === "image") rows = rows.filter((item) => item.showInImageGeneration && item.enabled);
    return rows;
  }
  const filters = [];
  if (target === "modelSquare") filters.push("show_in_model_square = true", "enabled = true");
  if (target === "apiKey") filters.push("show_in_api_key_create = true", "enabled = true");
  if (target === "image") filters.push("show_in_image_generation = true", "enabled = true");
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await query(`SELECT * FROM published_models ${where} ORDER BY sort_order ASC, updated_at DESC`);
  return result.rows.map(mapPublishedRow);
}

function normalizePublishedInput(input = {}) {
  const modelId = String(input.modelId || input.publicModelId || input.id || "").trim();
  if (!modelId) throw new Error("请填写模型 ID");
  const displayName = String(input.displayName || modelId).trim();
  const modelType = String(input.modelType || "text").trim();
  const tags = Array.isArray(input.tags)
    ? input.tags
    : String(input.tags || "").split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  return {
    id: input.id || makeId("pub"),
    importedModelId: input.importedModelId || "",
    modelId,
    displayName,
    provider: String(input.provider || "FlowAPI").trim(),
    logo: input.logo || input.provider || "FlowAPI",
    modelType,
    description: String(input.description || `${displayName} 已在 FlowAPI 后台配置，可同步到前台使用。`).trim(),
    tags,
    officialReleaseDate: String(input.officialReleaseDate || "").trim(),
    sortOrder: Number(input.sortOrder || 500),
    recommended: Boolean(input.recommended),
    hot: Boolean(input.hot),
    free: Boolean(input.free),
    memberOnly: Boolean(input.memberOnly),
    blackGoldOnly: Boolean(input.blackGoldOnly),
    enabled: input.enabled !== false,
    showInModelSquare: input.showInModelSquare !== false,
    showInApiKeyCreate: input.showInApiKeyCreate !== false,
    showInImageGeneration: input.showInImageGeneration !== undefined
      ? Boolean(input.showInImageGeneration)
      : modelType === "image" || modelType === "image-edit",
    upstreamModelId: String(input.upstreamModelId || input.actualModelId || input.modelId || modelId).trim(),
  };
}

async function syncPublishedModelToRuntime(model, pricePayload) {
  if (model.modelType === "image" || model.modelType === "image-edit") {
    await updateImageModelConfig(model.modelId, {
      displayName: model.displayName,
      upstreamModel: model.upstreamModelId || model.modelId,
      provider: model.provider,
      enabled: model.enabled && model.showInImageGeneration,
      recommended: model.recommended,
      supportsTextToImage: true,
      supportsImageToImage: model.modelType === "image-edit",
      supportsBatch: true,
      unitPriceTokenTextToImage: 0,
      unitPriceTokenImageToImage: 0,
      unitPriceRmbTextToImage: pricePayload?.imageSellPricePerImageCny || 0,
      unitPriceRmbImageToImage: pricePayload?.imageSellPricePerImageCny || 0,
      imageBillingMode: pricePayload?.billingMode || "per_image_fixed_profit",
      imageCostPerImageCny: pricePayload?.imageCostPerImageCny || 0,
      imageFixedProfitPerImageCny: pricePayload?.imageFixedProfitPerImageCny || 0,
      imageSellPricePerImageCny: pricePayload?.imageSellPricePerImageCny || 0,
      tags: model.tags,
      sceneDescription: model.description,
      sortOrder: model.sortOrder,
    });
    return;
  }

  await saveModelConfig(model.modelId, {
    isAvailable: model.enabled,
    canCreateKey: model.showInApiKeyCreate,
    actualModelId: model.upstreamModelId || model.modelId,
    status: model.enabled ? "available" : "coming_soon",
    statusLabel: model.enabled ? "可用" : "已下架",
    upstreamChannel: model.upstreamId || "",
    officialReleaseDate: model.officialReleaseDate,
    pricing: pricePayload || null,
  });
}

export async function upsertPublishedModel(input = {}, adminId = "") {
  await ensureCommercialConfigSchema();
  const model = normalizePublishedInput(input);
  const before = (await listPublishedModels()).find((item) => item.modelId === model.modelId) || null;
  const pricingInput = {
    ...(input.pricing || {}),
    modelId: model.modelId,
    displayName: model.displayName,
    provider: model.provider,
    modelType: model.modelType,
    billingMode: input.pricing?.billingMode || (model.modelType === "image" || model.modelType === "image-edit" ? "per_image_fixed_profit" : "token_multiplier"),
  };
  assertPublishedModelCommercialGuard(
    model,
    normalizePricingPayload(
      { modelId: model.modelId, displayName: model.displayName, provider: model.provider, modelType: model.modelType },
      pricingInput,
    ),
  );
  const pricePayload = await saveModelPricing(
    { modelId: model.modelId, displayName: model.displayName, provider: model.provider, modelType: model.modelType },
    pricingInput
  );

  if (!hasDatabase()) {
    memory().publishedModels = memory().publishedModels || [];
    const index = memory().publishedModels.findIndex((item) => item.modelId === model.modelId);
    const entry = { ...model, updatedAt: nowIso() };
    if (index >= 0) memory().publishedModels[index] = { ...memory().publishedModels[index], ...entry };
    else memory().publishedModels.unshift({ ...entry, createdAt: nowIso() });
  } else {
    await query(
      `INSERT INTO published_models (
        id, imported_model_id, model_id, upstream_model_id, display_name, provider, logo, model_type,
        description, tags_json, official_release_date, sort_order, recommended, hot, free,
        member_only, black_gold_only, enabled, show_in_model_square, show_in_api_key_create, show_in_image_generation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      ON CONFLICT (model_id) DO UPDATE SET
        upstream_model_id=$4, display_name=$5, provider=$6, logo=$7, model_type=$8, description=$9, tags_json=$10::jsonb,
        official_release_date=$11, sort_order=$12, recommended=$13, hot=$14, free=$15,
        member_only=$16, black_gold_only=$17, enabled=$18, show_in_model_square=$19,
        show_in_api_key_create=$20, show_in_image_generation=$21, updated_at=NOW()`,
      [
        model.id,
        model.importedModelId,
        model.modelId,
        model.upstreamModelId,
        model.displayName,
        model.provider,
        model.logo,
        model.modelType,
        model.description,
        JSON.stringify(model.tags),
        model.officialReleaseDate,
        model.sortOrder,
        model.recommended,
        model.hot,
        model.free,
        model.memberOnly,
        model.blackGoldOnly,
        model.enabled,
        model.showInModelSquare,
        model.showInApiKeyCreate,
        model.showInImageGeneration,
      ]
    );
  }

  await syncPublishedModelToRuntime(model, pricePayload);
  const syncResult = await checkAdminSyncConsistency().catch((error) => ({ ok: false, issues: [{ message: error.message }] }));
  await writeAdminAuditLog({
    adminId,
    action: before ? "update_published_model" : "create_published_model",
    targetType: "model",
    targetId: model.modelId,
    before: before || {},
    after: { ...model, pricing: pricePayload },
    syncResult,
  });
  return { model: { ...model, pricing: pricePayload }, syncResult };
}

function findModelPackProduct(publicId = "") {
  const key = String(publicId || "").trim().toLowerCase();
  return MODEL_PRODUCTS.find((product) => {
    return [product.id, product.publicModelId, product.actualModelId, product.displayName]
      .filter(Boolean)
      .some((value) => String(value).trim().toLowerCase() === key);
  }) || null;
}

function modelTypeForPackProduct(product = {}) {
  const id = String(product.publicModelId || product.id || "").toLowerCase();
  const group = String(product.group || "").toLowerCase();
  if (id.includes("codex") || group.includes("codex")) return "coding";
  if (id.includes("vision") || group.includes("vision")) return "vision";
  return "text";
}

function pricingForPackProduct(publicModelId = "", product = {}) {
  const preset = PACK_PRICING_PRESETS[publicModelId] || PACK_PRICING_PRESETS[product.id] || product.pricing || {};
  return {
    billingMode: "token_fixed_price",
    multiplier: 1,
    inputCostPerMTokens: Number(preset.inputCostPerMTokens || 0),
    outputCostPerMTokens: Number(preset.outputCostPerMTokens || 0),
    inputSellPricePerMTokens: Number(preset.inputSellPricePerMTokens || 0),
    outputSellPricePerMTokens: Number(preset.outputSellPricePerMTokens || 0),
  };
}

export async function bootstrapModelMarketPack({ pack = "starter", adminId = "" } = {}) {
  await ensureCommercialConfigSchema();
  const ids = pack === "full" ? FULL_MODEL_PACK_IDS : STARTER_MODEL_PACK_IDS;
  const published = [];
  const skipped = [];

  for (const id of ids) {
    const rawProduct = findModelPackProduct(id);
    if (!rawProduct) {
      skipped.push({ id, reason: "预设模型不存在" });
      continue;
    }

    const product = normalizeModelProduct({
      ...rawProduct,
      isAvailable: true,
      isComingSoon: false,
    });
    const publicModelId = product.publicModelId || product.id;
    const actualModelId = product.actualModelId || publicModelId;
    const pricing = pricingForPackProduct(publicModelId, product);

    try {
      const result = await upsertPublishedModel({
        modelId: publicModelId,
        upstreamModelId: actualModelId,
        displayName: product.displayName,
        provider: "FlowAPI",
        logo: "FlowAPI",
        modelType: modelTypeForPackProduct(product),
        description: product.description || `${product.displayName} 已通过 FlowAPI 推荐模型包开通。`,
        tags: product.useCases || [],
        officialReleaseDate: product.officialReleaseDate || "",
        sortOrder: product.sortOrder || 500,
        recommended: STARTER_MODEL_PACK_IDS.includes(publicModelId) || STARTER_MODEL_PACK_IDS.includes(product.id),
        hot: publicModelId.includes("gpt") || publicModelId.includes("codex"),
        enabled: true,
        showInModelSquare: true,
        showInApiKeyCreate: true,
        showInImageGeneration: false,
        pricing,
      }, adminId);
      published.push(result.model);
    } catch (error) {
      skipped.push({
        id: publicModelId,
        displayName: product.displayName,
        reason: error.message || "开通失败",
      });
    }
  }

  const syncResult = await checkAdminSyncConsistency().catch((error) => ({ ok: false, issues: [{ message: error.message }] }));
  await writeAdminAuditLog({
    adminId,
    action: "bootstrap_model_market_pack",
    targetType: "model_pack",
    targetId: pack,
    after: { pack, publishedCount: published.length, skipped },
    syncResult,
  });

  return {
    ok: published.length > 0,
    pack,
    published,
    publishedCount: published.length,
    skipped,
    skippedCount: skipped.length,
    syncResult,
  };
}

export async function deletePublishedModel(modelId = "", adminId = "") {
  await ensureCommercialConfigSchema();
  const id = String(modelId || "").trim();
  if (!id) throw new Error("缺少模型 ID");
  const before = (await listPublishedModels()).find((item) => item.modelId === id) || null;
  if (!before) throw new Error("模型不存在或已删除");

  if (!hasDatabase()) {
    memory().publishedModels = (memory().publishedModels || []).filter((item) => item.modelId !== id);
    memory().pricing = (memory().pricing || []).filter((item) => item.modelId !== id);
  } else {
    await query("DELETE FROM published_models WHERE model_id = $1", [id]);
    await query("DELETE FROM model_pricing_configs WHERE model_id = $1", [id]);
  }
  await writeAdminAuditLog({ adminId, action: "delete_published_model", targetType: "model", targetId: id, before });
  return { ok: true, modelId: id };
}

export async function publishModels({ importedModelIds = [], modelSettings = {}, pricing = {}, adminId = "" } = {}) {
  await ensureCommercialConfigSchema();
  const imported = await listImportedModels();
  const targets = imported.filter((item) => importedModelIds.includes(item.id) || importedModelIds.includes(item.modelId));
  if (!targets.length) throw new Error("请至少选择一个模型上架");

  const published = [];
  for (const model of targets) {
    const settings = modelSettings[model.id] || modelSettings[model.modelId] || {};
    const publicId = settings.publicModelId || model.modelId;
    const displayName = settings.displayName || model.displayName;
    const modelType = settings.modelType || model.modelType;
    const tags = Array.isArray(settings.tags) ? settings.tags : String(settings.tags || "").split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    const publishEntry = {
      id: makeId("pub"),
      importedModelId: model.id,
      modelId: publicId,
      upstreamModelId: model.modelId,
      displayName,
      provider: settings.provider || model.provider,
      logo: settings.logo || model.logo || model.provider,
      modelType,
      description: settings.description || `${displayName} 已通过老板后台向导发布，可在 FlowAPI 统一计费与调用。`,
      tags,
      officialReleaseDate: settings.officialReleaseDate || model.officialReleaseDate || "",
      sortOrder: Number(settings.sortOrder || 500),
      recommended: Boolean(settings.recommended),
      hot: Boolean(settings.hot),
      free: Boolean(settings.free),
      memberOnly: Boolean(settings.memberOnly),
      blackGoldOnly: Boolean(settings.blackGoldOnly),
      enabled: settings.enabled !== false,
      showInModelSquare: settings.showInModelSquare !== false,
      showInApiKeyCreate: settings.showInApiKeyCreate !== false,
      showInImageGeneration: Boolean(settings.showInImageGeneration || modelType === "image" || modelType === "image-edit"),
    };
    const pricingInput = pricing[model.id] || pricing[model.modelId] || { billingMode: modelType === "image" || modelType === "image-edit" ? "per_image_fixed_profit" : "token_multiplier" };
    assertPublishedModelCommercialGuard(
      publishEntry,
      normalizePricingPayload({ ...model, modelId: publicId, displayName, modelType }, pricingInput),
    );
    const pricePayload = await saveModelPricing(
      { ...model, modelId: publicId, displayName, modelType },
      pricingInput
    );

    if (hasDatabase()) {
      await query(
        `INSERT INTO published_models (
          id, imported_model_id, model_id, upstream_model_id, display_name, provider, logo, model_type,
          description, tags_json, official_release_date, sort_order, recommended, hot, free,
          member_only, black_gold_only, enabled, show_in_model_square, show_in_api_key_create, show_in_image_generation
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        ON CONFLICT (model_id) DO UPDATE SET
          upstream_model_id=$4, display_name=$5, provider=$6, logo=$7, model_type=$8, description=$9, tags_json=$10::jsonb,
          official_release_date=$11, sort_order=$12, recommended=$13, hot=$14, free=$15,
          member_only=$16, black_gold_only=$17, enabled=$18, show_in_model_square=$19,
          show_in_api_key_create=$20, show_in_image_generation=$21, updated_at=NOW()`,
        [
          publishEntry.id,
          publishEntry.importedModelId,
          publishEntry.modelId,
          model.modelId,
          publishEntry.displayName,
          publishEntry.provider,
          publishEntry.logo,
          publishEntry.modelType,
          publishEntry.description,
          JSON.stringify(publishEntry.tags),
          publishEntry.officialReleaseDate,
          publishEntry.sortOrder,
          publishEntry.recommended,
          publishEntry.hot,
          publishEntry.free,
          publishEntry.memberOnly,
          publishEntry.blackGoldOnly,
          publishEntry.enabled,
          publishEntry.showInModelSquare,
          publishEntry.showInApiKeyCreate,
          publishEntry.showInImageGeneration,
        ]
      );
    } else {
      memory().publishedModels = memory().publishedModels || [];
      memory().publishedModels.unshift(publishEntry);
    }

    if (modelType === "image" || modelType === "image-edit") {
      await updateImageModelConfig(publicId, {
        displayName,
        upstreamModel: model.modelId,
        provider: publishEntry.provider,
        enabled: publishEntry.enabled && publishEntry.showInImageGeneration,
        recommended: publishEntry.recommended,
        supportsTextToImage: true,
        supportsImageToImage: modelType === "image-edit",
        supportsBatch: true,
        unitPriceTokenTextToImage: 0,
        unitPriceTokenImageToImage: 0,
        unitPriceRmbTextToImage: pricePayload.imageSellPricePerImageCny,
        unitPriceRmbImageToImage: pricePayload.imageSellPricePerImageCny,
        imageBillingMode: pricePayload.billingMode,
        imageCostPerImageCny: pricePayload.imageCostPerImageCny,
        imageFixedProfitPerImageCny: pricePayload.imageFixedProfitPerImageCny,
        imageSellPricePerImageCny: pricePayload.imageSellPricePerImageCny,
        tags,
        sceneDescription: publishEntry.description,
        sortOrder: publishEntry.sortOrder,
      });
    } else {
      await saveModelConfig(publicId, {
        isAvailable: publishEntry.enabled,
        canCreateKey: publishEntry.showInApiKeyCreate,
        actualModelId: model.modelId,
        status: publishEntry.enabled ? "available" : "coming_soon",
        statusLabel: publishEntry.enabled ? "可用" : "已下架",
        upstreamChannel: model.upstreamId,
        officialReleaseDate: publishEntry.officialReleaseDate,
        pricing: pricePayload,
      });
    }

    published.push({ ...publishEntry, pricing: pricePayload });
  }

  const syncResult = await checkAdminSyncConsistency();
  await writeAdminAuditLog({
    adminId,
    action: "publish_models",
    targetType: "model",
    targetId: published.map((item) => item.modelId).join(","),
    after: { published },
    syncResult,
  });
  return { published, syncResult };
}

export async function checkAdminSyncConsistency() {
  await ensureCommercialConfigSchema();
  const [pricing, imageModels, modelConfigs] = await Promise.all([
    listModelPricing().catch(() => []),
    listImageModels({ includeDisabled: true }).catch(() => []),
    getAllModelConfigs().catch(() => ({})),
  ]);
  const issues = [];
  const imageModelIds = new Set(imageModels.map((item) => item.id));
  const configuredTextIds = new Set(Object.keys(modelConfigs || {}));

  pricing.forEach((price) => {
    if ((price.modelType === "image" || price.modelType === "image-edit") && !imageModelIds.has(price.modelId)) {
      issues.push({ level: "error", item: price.modelId, message: "图片模型有定价但未同步到生成图片模型列表" });
    }
    if (price.modelType === "text" && !configuredTextIds.has(price.modelId)) {
      issues.push({ level: "warn", item: price.modelId, message: "文本模型有定价但未同步到 API Key 模型配置" });
    }
    if ((price.modelType === "image" || price.modelType === "image-edit") && price.imageSellPricePerImageCny <= 0 && price.billingMode !== "free") {
      issues.push({ level: "error", item: price.modelId, message: "图片模型售价为 0，无法商业化扣费" });
    }
  });

  return {
    ok: issues.filter((item) => item.level === "error").length === 0,
    checkedAt: nowIso(),
    counts: {
      pricing: pricing.length,
      imageModels: imageModels.filter((item) => item.enabled).length,
      apiKeyModelConfigs: configuredTextIds.size,
    },
    checks: [
      { name: "模型广场模型数量", status: "manual", message: "静态模型广场与后台配置仍需继续收敛到 published_models" },
      { name: "API Key 可选模型", status: configuredTextIds.size > 0 ? "pass" : "warn" },
      { name: "图片生成可选模型", status: imageModels.some((item) => item.enabled) ? "pass" : "warn" },
      { name: "模型价格配置", status: pricing.length > 0 ? "pass" : "warn" },
      { name: "图片模型售价", status: pricing.some((item) => item.modelType === "image" || item.modelType === "image-edit") ? "pass" : "warn" },
    ],
    issues,
  };
}

export async function saveBossWizardDraft({ adminId = "", data = {} }) {
  await ensureCommercialConfigSchema();
  const id = data.id || `draft_${adminId || "admin"}`;
  if (!hasDatabase()) {
    memory().drafts[id] = { id, adminId, data, updatedAt: nowIso() };
    return memory().drafts[id];
  }
  await query(
    `INSERT INTO boss_wizard_drafts (id, admin_id, data, updated_at)
     VALUES ($1,$2,$3::jsonb,NOW())
     ON CONFLICT (id) DO UPDATE SET admin_id=$2, data=$3::jsonb, updated_at=NOW()`,
    [id, adminId, JSON.stringify(data)]
  );
  return { id, adminId, data, updatedAt: nowIso() };
}

export async function getCommercialSnapshot() {
  const [upstreams, importedModels, pricing, sync] = await Promise.all([
    listUpstreams().catch(() => []),
    listImportedModels().catch(() => []),
    listModelPricing().catch(() => []),
    checkAdminSyncConsistency().catch((error) => ({ ok: false, issues: [{ message: error.message }] })),
  ]);
  return { upstreams, importedModels, pricing, sync };
}

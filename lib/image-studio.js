import { getCustomer, findCustomerByToken } from "@/lib/customer-store";
import { hasDatabase, query } from "@/lib/db";
import { getUpstreamConfigs } from "@/lib/upstream";
import { getClientIp, rateLimit } from "@/lib/security";
import { promises as fs } from "fs";
import path from "path";

const DEFAULT_IMAGE_MODELS = [
  {
    id: "flowapi-gpt-image-pro",
    display_name: "GPT Image Pro",
    upstream_model: "openai/gpt-5.4-image-2",
    provider: "openrouter",
    enabled: true,
    recommended: false,
    supports_text_to_image: true,
    supports_image_to_image: true,
    supports_batch: true,
    speed_score: 82,
    stability_score: 94,
    quality_score: 98,
    unit_price_token_text_to_image: 18,
    unit_price_token_image_to_image: 22,
    unit_price_rmb_text_to_image: 0.58,
    unit_price_rmb_image_to_image: 0.72,
    fallback_model_id: "flowapi-seedream-45",
    tags: ["OpenAI 图片", "高质量", "商业级", "海报", "电商主图"],
    scene_description: "适合商业级图片、海报、电商主图和复杂创意场景，画面稳定性和提示词理解能力强。",
    sort_order: 10,
  },
  {
    id: "flowapi-gpt-image",
    display_name: "GPT Image",
    upstream_model: "openai/gpt-5-image",
    provider: "openrouter",
    enabled: true,
    recommended: false,
    supports_text_to_image: true,
    supports_image_to_image: true,
    supports_batch: true,
    speed_score: 86,
    stability_score: 90,
    quality_score: 94,
    unit_price_token_text_to_image: 14,
    unit_price_token_image_to_image: 18,
    unit_price_rmb_text_to_image: 0.38,
    unit_price_rmb_image_to_image: 0.52,
    fallback_model_id: "flowapi-seedream-45",
    tags: ["OpenAI 图片", "中文友好", "通用高质量", "产品图", "封面图"],
    scene_description: "通用高质量图片模型，适合日常生图、产品图、封面图和创意内容。",
    sort_order: 20,
  },
  {
    id: "flowapi-gpt-image-mini",
    display_name: "GPT Image Mini",
    upstream_model: "openai/gpt-5-image-mini",
    provider: "openrouter",
    enabled: true,
    recommended: false,
    supports_text_to_image: true,
    supports_image_to_image: true,
    supports_batch: true,
    speed_score: 96,
    stability_score: 86,
    quality_score: 86,
    unit_price_token_text_to_image: 8,
    unit_price_token_image_to_image: 10,
    unit_price_rmb_text_to_image: 0.18,
    unit_price_rmb_image_to_image: 0.24,
    fallback_model_id: "flowapi-seedream-45",
    tags: ["OpenAI 图片", "低成本", "快速", "批量测试"],
    scene_description: "低成本快速出图，适合批量草稿、风格测试和普通图片需求。",
    sort_order: 30,
  },
  {
    id: "flowapi-gemini-image-pro",
    display_name: "Gemini Image Pro",
    upstream_model: "google/gemini-3-pro-image-preview",
    provider: "openrouter",
    enabled: true,
    recommended: false,
    supports_text_to_image: true,
    supports_image_to_image: true,
    supports_batch: true,
    speed_score: 78,
    stability_score: 88,
    quality_score: 95,
    unit_price_token_text_to_image: 16,
    unit_price_token_image_to_image: 20,
    unit_price_rmb_text_to_image: 0.48,
    unit_price_rmb_image_to_image: 0.62,
    fallback_model_id: "flowapi-seedream-45",
    tags: ["Google 图片", "高质量", "中文友好", "多模态理解", "复杂构图"],
    scene_description: "适合多模态理解、参考图生成、复杂构图和需要强理解能力的图片任务。",
    sort_order: 40,
  },
  {
    id: "flowapi-grok-imagine",
    display_name: "Grok Imagine",
    upstream_model: "x-ai/grok-imagine-image-quality",
    provider: "openrouter",
    enabled: true,
    recommended: false,
    supports_text_to_image: true,
    supports_image_to_image: true,
    supports_batch: true,
    speed_score: 80,
    stability_score: 84,
    quality_score: 93,
    unit_price_token_text_to_image: 15,
    unit_price_token_image_to_image: 18,
    unit_price_rmb_text_to_image: 0.46,
    unit_price_rmb_image_to_image: 0.58,
    fallback_model_id: "flowapi-seedream-45",
    tags: ["Grok", "高质量", "写实", "社媒视觉", "创意图片"],
    scene_description: "适合写实风格、社媒视觉、创意图片和高冲击力画面。",
    sort_order: 50,
  },
  {
    id: "flowapi-seedream-45",
    display_name: "Seedream 4.5",
    upstream_model: "bytedance-seed/seedream-4.5",
    provider: "openrouter",
    enabled: true,
    recommended: true,
    supports_text_to_image: true,
    supports_image_to_image: true,
    supports_batch: true,
    speed_score: 84,
    stability_score: 88,
    quality_score: 94,
    unit_price_token_text_to_image: 14,
    unit_price_token_image_to_image: 17,
    unit_price_rmb_text_to_image: 0.42,
    unit_price_rmb_image_to_image: 0.54,
    fallback_model_id: "",
    tags: ["Seedream", "中文友好", "高质量", "电商", "国风", "海报设计"],
    scene_description: "适合中文提示词、电商图、国风场景、海报设计和亚洲审美图片。",
    sort_order: 60,
  },
];

const QUALITY_MULTIPLIER = {
  standard: 1,
  hd: 1.6,
  ultra: 2.2,
};

const ASPECT_RATIO_TO_SIZE = {
  "1:1": "1024x1024",
  "4:3": "1536x1024",
  "3:4": "1024x1536",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
};

const IMAGE_SAFETY_PATTERNS = [
  /色情|裸露|露骨|成人视频|未成年.*(色情|裸露|不当)/i,
  /深度伪造|deepfake|换脸.*(真实|名人|明星)/i,
  /伪造.*(证件|护照|身份证|票据|发票|公章|官方文件)/i,
  /诈骗|钓鱼网站|假冒官方|恶意政治误导/i,
  /血腥|违法暴力|恐怖主义|极端主义/i,
];

const imageStudioStore = globalThis.__FLOWAPI_IMAGE_STUDIO__ || {
  imageModels: DEFAULT_IMAGE_MODELS.map((item) => ({ ...item })),
  workspaces: [],
  workspaceMembers: [],
  imageLogs: [],
  apiUsageLogs: [],
  walletTransactions: [],
};

globalThis.__FLOWAPI_IMAGE_STUDIO__ = imageStudioStore;

let imageStudioInitPromise = null;
const DEFAULT_IMAGE_MODEL_IDS = new Set(DEFAULT_IMAGE_MODELS.map((item) => item.id));
const RETIRED_IMAGE_MODEL_IDS = new Set(["gpt-image-2", "flux-pro", "flux-schnell", "sdxl", "recraft", "ideogram"]);

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function roundMoney(value) {
  return Number(toNumber(value).toFixed(6));
}

function truncateText(value = "", max = 120) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function getQualityMultiplier(quality = "standard") {
  return QUALITY_MULTIPLIER[String(quality || "standard").toLowerCase()] || 1;
}

function normalizeImageArray(images) {
  if (!images) return [];
  if (Array.isArray(images)) {
    return images.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof images === "string") {
    return [images.trim()].filter(Boolean);
  }
  return [];
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function isFatalStatus(status) {
  return status === 400 || status === 401 || status === 402 || status === 403 || status === 404 || status === 413 || status === 422;
}

function canRetryImageResult(result = {}) {
  if (!result || result.ok) return false;
  if (result.errorCode === "UPSTREAM_NOT_CONFIGURED") return false;
  return isRetryableStatus(result.status) && !isFatalStatus(result.status);
}

function canUseFallbackImageResult(result = {}) {
  if (canRetryImageResult(result)) return true;
  return result?.status === 403 && /not available in your region|region/i.test(String(result.upstreamErrorMessage || ""));
}

function mapAspectRatioToSize(aspectRatio = "1:1") {
  return ASPECT_RATIO_TO_SIZE[aspectRatio] || ASPECT_RATIO_TO_SIZE["1:1"];
}

function mapSizeToAspectRatio(size = "") {
  const normalized = String(size || "").trim();
  if (normalized === "1024x1536") return "3:4";
  if (normalized === "1536x1024") return "4:3";
  return "1:1";
}

function isAdminCustomer(customer = {}) {
  const email = String(customer?.email || "").toLowerCase();
  return customer?.role === "admin" || customer?.id === "cus_admin" || email === "xiaoyijie@flowapi.fun";
}

async function ensureImageStudioSchema() {
  if (!hasDatabase()) return;
  if (!imageStudioInitPromise) {
    imageStudioInitPromise = query(`
      CREATE TABLE IF NOT EXISTS image_models (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        upstream_model TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'OpenRouter',
        enabled BOOLEAN NOT NULL DEFAULT true,
        recommended BOOLEAN NOT NULL DEFAULT false,
        supports_text_to_image BOOLEAN NOT NULL DEFAULT true,
        supports_image_to_image BOOLEAN NOT NULL DEFAULT false,
        supports_batch BOOLEAN NOT NULL DEFAULT false,
        speed_score INTEGER NOT NULL DEFAULT 0,
        stability_score INTEGER NOT NULL DEFAULT 0,
        quality_score INTEGER NOT NULL DEFAULT 0,
        unit_price_token_text_to_image NUMERIC(14, 6) NOT NULL DEFAULT 0,
        unit_price_token_image_to_image NUMERIC(14, 6) NOT NULL DEFAULT 0,
        unit_price_rmb_text_to_image NUMERIC(14, 6) NOT NULL DEFAULT 0,
        unit_price_rmb_image_to_image NUMERIC(14, 6) NOT NULL DEFAULT 0,
        fallback_model_id TEXT DEFAULT '',
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        scene_description TEXT DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 999,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        balance NUMERIC(14, 6) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workspace_members (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        member_name TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (workspace_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS image_generation_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
        api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
        request_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        model_display_name TEXT NOT NULL,
        upstream_model TEXT NOT NULL,
        upstream_provider TEXT NOT NULL DEFAULT 'OpenRouter',
        prompt TEXT DEFAULT '',
        prompt_preview TEXT DEFAULT '',
        input_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
        output_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
        output_thumbnail_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
        output_image_count INTEGER NOT NULL DEFAULT 0,
        aspect_ratio TEXT DEFAULT '1:1',
        quality TEXT DEFAULT 'standard',
        token_cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        money_cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        balance_before NUMERIC(14, 6) NOT NULL DEFAULT 0,
        balance_after NUMERIC(14, 6) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'success',
        error_code TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        error_source TEXT DEFAULT '',
        latency_ms INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        saved_to_history BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS image_generations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        api_key_id TEXT DEFAULT '',
        public_model_id TEXT NOT NULL,
        actual_model_id TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'openrouter',
        prompt TEXT DEFAULT '',
        style TEXT DEFAULT '',
        size TEXT DEFAULT '1024x1024',
        count INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
        input_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
        output_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
        total_tokens NUMERIC(14, 6) NOT NULL DEFAULT 0,
        cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        internal_cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        sell_price NUMERIC(14, 6) NOT NULL DEFAULT 0,
        profit NUMERIC(14, 6) NOT NULL DEFAULT 0,
        error_code TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        latency_ms INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS api_usage_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
        api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
        request_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'POST',
        mode TEXT NOT NULL,
        model_display_name TEXT NOT NULL,
        upstream_model TEXT NOT NULL,
        upstream_provider TEXT NOT NULL DEFAULT 'OpenRouter',
        prompt_preview TEXT DEFAULT '',
        input_image_count INTEGER NOT NULL DEFAULT 0,
        output_image_count INTEGER NOT NULL DEFAULT 0,
        token_cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        money_cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        balance_before NUMERIC(14, 6) NOT NULL DEFAULT 0,
        balance_after NUMERIC(14, 6) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'success',
        error_code TEXT DEFAULT '',
        error_message TEXT DEFAULT '',
        error_source TEXT DEFAULT '',
        latency_ms INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        ip_address TEXT DEFAULT '',
        user_agent TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
        request_id TEXT DEFAULT '',
        transaction_type TEXT NOT NULL,
        token_amount NUMERIC(14, 6) NOT NULL DEFAULT 0,
        money_amount NUMERIC(14, 6) NOT NULL DEFAULT 0,
        balance_before NUMERIC(14, 6) NOT NULL DEFAULT 0,
        balance_after NUMERIC(14, 6) NOT NULL DEFAULT 0,
        related_log_id TEXT DEFAULT '',
        description TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS workspace_id TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS created_by_user_id TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS assigned_user_id TEXT DEFAULT '';
      ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS visible_scope TEXT DEFAULT 'self';

      CREATE INDEX IF NOT EXISTS idx_image_models_enabled_sort ON image_models(enabled, sort_order);
      CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id, workspace_id);
      CREATE INDEX IF NOT EXISTS idx_image_logs_user_created ON image_generation_logs(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_image_logs_workspace_created ON image_generation_logs(workspace_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_image_logs_request_id ON image_generation_logs(request_id);
      CREATE INDEX IF NOT EXISTS idx_image_generations_user_created ON image_generations(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_created ON api_usage_logs(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created ON wallet_transactions(user_id, created_at DESC);
    `).then(syncDefaultImageModels);
  }
  await imageStudioInitPromise;
}

async function syncDefaultImageModels() {
  if (!hasDatabase()) return;
  for (const model of DEFAULT_IMAGE_MODELS) {
    await query(
      `INSERT INTO image_models (
        id, display_name, upstream_model, provider, enabled, recommended,
        supports_text_to_image, supports_image_to_image, supports_batch,
        speed_score, stability_score, quality_score,
        unit_price_token_text_to_image, unit_price_token_image_to_image,
        unit_price_rmb_text_to_image, unit_price_rmb_image_to_image,
        fallback_model_id, tags, scene_description, sort_order, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12,
        $13, $14,
        $15, $16,
        $17, $18::jsonb, $19, $20, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        upstream_model = EXCLUDED.upstream_model,
        provider = EXCLUDED.provider,
        recommended = EXCLUDED.recommended,
        supports_text_to_image = EXCLUDED.supports_text_to_image,
        supports_image_to_image = EXCLUDED.supports_image_to_image,
        supports_batch = EXCLUDED.supports_batch,
        speed_score = EXCLUDED.speed_score,
        stability_score = EXCLUDED.stability_score,
        quality_score = EXCLUDED.quality_score,
        unit_price_token_text_to_image = EXCLUDED.unit_price_token_text_to_image,
        unit_price_token_image_to_image = EXCLUDED.unit_price_token_image_to_image,
        unit_price_rmb_text_to_image = EXCLUDED.unit_price_rmb_text_to_image,
        unit_price_rmb_image_to_image = EXCLUDED.unit_price_rmb_image_to_image,
        fallback_model_id = EXCLUDED.fallback_model_id,
        tags = EXCLUDED.tags,
        scene_description = EXCLUDED.scene_description,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()`,
      [
        model.id,
        model.display_name,
        model.upstream_model,
        model.provider,
        model.enabled,
        model.recommended,
        model.supports_text_to_image,
        model.supports_image_to_image,
        model.supports_batch,
        model.speed_score,
        model.stability_score,
        model.quality_score,
        model.unit_price_token_text_to_image,
        model.unit_price_token_image_to_image,
        model.unit_price_rmb_text_to_image,
        model.unit_price_rmb_image_to_image,
        model.fallback_model_id,
        JSON.stringify(model.tags || []),
        model.scene_description,
        model.sort_order,
      ]
    );
  }
  await query(
    `UPDATE image_models
     SET enabled = false,
         updated_at = NOW()
     WHERE id = ANY($1::text[])`,
    [Array.from(RETIRED_IMAGE_MODEL_IDS)]
  );
}

function syncMemoryImageModels() {
  for (const model of DEFAULT_IMAGE_MODELS) {
    const existing = imageStudioStore.imageModels.find((item) => item.id === model.id);
    if (existing) {
      Object.assign(existing, model);
    } else {
      imageStudioStore.imageModels.push({ ...model });
    }
  }
  imageStudioStore.imageModels.forEach((item) => {
    if (RETIRED_IMAGE_MODEL_IDS.has(item.id) || (!DEFAULT_IMAGE_MODEL_IDS.has(item.id) && item.provider !== "openrouter")) {
      item.enabled = false;
    }
  });
}

function mapImageModelRow(row = {}) {
  const provider = row.provider || "OpenRouter";
  const displayName = row.display_name || row.displayName;
  const identity = `${provider} ${displayName} ${row.id || ""}`.toLowerCase();
  const tags = Array.isArray(row.tags) ? row.tags : typeof row.tags === "string" ? JSON.parse(row.tags || "[]") : [];
  const logoCode = identity.includes("gpt") || identity.includes("openai")
    ? "AI"
    : identity.includes("gemini") || identity.includes("google")
      ? "GM"
      : identity.includes("grok") || identity.includes("x-ai")
        ? "GX"
        : identity.includes("seedream") || identity.includes("bytedance")
          ? "SD"
          : "IM";
  return {
    id: row.id,
    displayName,
    upstreamModel: row.upstream_model || row.upstreamModel,
    provider,
    logoCode,
    enabled: row.enabled !== false,
    recommended: Boolean(row.recommended),
    supportsTextToImage: row.supports_text_to_image !== false,
    supportsImageToImage: Boolean(row.supports_image_to_image),
    supportsBatch: Boolean(row.supports_batch),
    supportsMultiImage: Boolean(row.supports_image_to_image && row.supports_batch),
    supportsVideoInput: false,
    supportsFileInput: false,
    speedScore: Number(row.speed_score || 0),
    stabilityScore: Number(row.stability_score || 0),
    qualityScore: Number(row.quality_score || 0),
    unitPriceTokenTextToImage: Number(row.unit_price_token_text_to_image || 0),
    unitPriceTokenImageToImage: Number(row.unit_price_token_image_to_image || 0),
    unitPriceRmbTextToImage: Number(row.unit_price_rmb_text_to_image || 0),
    unitPriceRmbImageToImage: Number(row.unit_price_rmb_image_to_image || 0),
    fallbackModelId: row.fallback_model_id || "",
    tags,
    sceneDescription: row.scene_description || "",
    sortOrder: Number(row.sort_order || 999),
    labelTags: tags,
  };
}

function mapImageLogRow(row = {}) {
  const inputImages = Array.isArray(row.input_image_urls) ? row.input_image_urls : JSON.parse(row.input_image_urls || "[]");
  const outputImages = Array.isArray(row.output_image_urls) ? row.output_image_urls : JSON.parse(row.output_image_urls || "[]");
  const thumbnails = Array.isArray(row.output_thumbnail_urls) ? row.output_thumbnail_urls : JSON.parse(row.output_thumbnail_urls || "[]");
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    workspaceId: row.workspace_id || row.workspaceId,
    apiKeyId: row.api_key_id || row.apiKeyId || null,
    requestId: row.request_id || row.requestId,
    mode: row.mode,
    modelDisplayName: row.model_display_name || row.modelDisplayName,
    upstreamModel: row.upstream_model || row.upstreamModel,
    upstreamProvider: row.upstream_provider || row.upstreamProvider || "OpenRouter",
    prompt: row.prompt || "",
    promptPreview: row.prompt_preview || row.promptPreview || "",
    inputImageUrls: inputImages,
    outputImageUrls: outputImages,
    outputThumbnailUrls: thumbnails,
    outputImageCount: Number(row.output_image_count || row.outputImageCount || outputImages.length || 0),
    aspectRatio: row.aspect_ratio || "1:1",
    quality: row.quality || "standard",
    tokenCost: Number(row.token_cost || row.tokenCost || 0),
    moneyCost: Number(row.money_cost || row.moneyCost || 0),
    balanceBefore: Number(row.balance_before || row.balanceBefore || 0),
    balanceAfter: Number(row.balance_after || row.balanceAfter || 0),
    status: row.status || "success",
    errorCode: row.error_code || row.errorCode || "",
    errorMessage: row.error_message || row.errorMessage || "",
    errorSource: row.error_source || row.errorSource || "",
    latencyMs: Number(row.latency_ms || row.latencyMs || 0),
    retryCount: Number(row.retry_count || row.retryCount || 0),
    savedToHistory: row.saved_to_history !== false,
    metadata: row.metadata && typeof row.metadata === "string" ? JSON.parse(row.metadata || "{}") : (row.metadata || {}),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : row.createdAt || new Date().toISOString(),
  };
}

async function getCustomerBalanceRecord(customerId) {
  const customer = await getCustomer(customerId);
  if (!customer) return null;
  return {
    customer,
    balance: Number(customer.balance || 0),
  };
}

async function reserveCustomerBalance(customerId, reserveAmount) {
  const amount = roundMoney(reserveAmount);
  const beforeRecord = await getCustomerBalanceRecord(customerId);
  if (!beforeRecord) return { error: "用户不存在" };
  if (beforeRecord.balance < amount) {
    return {
      error: "余额不足，请先充值后再生成图片",
      balanceBefore: beforeRecord.balance,
    };
  }

  if (!hasDatabase()) {
    const memoryCustomer = globalThis.__TOKEN_ROUTER_CUSTOMERS__?.customers?.find((item) => item.id === customerId);
    if (!memoryCustomer) return { error: "用户不存在" };
    memoryCustomer.balance = roundMoney(Number(memoryCustomer.balance || 0) - amount);
    memoryCustomer.totalSpend = roundMoney(Number(memoryCustomer.totalSpend || 0) + amount);
    return {
      balanceBefore: beforeRecord.balance,
      balanceAfter: Number(memoryCustomer.balance || 0),
      reservedAmount: amount,
    };
  }

  const result = await query(
    `UPDATE customers
     SET balance = balance - $2,
         total_spend = total_spend + $2
     WHERE id = $1 AND balance >= $2
     RETURNING balance`,
    [customerId, amount]
  );
  if (!result.rows[0]) {
    return {
      error: "余额不足，请先充值后再生成图片",
      balanceBefore: beforeRecord.balance,
    };
  }
  return {
    balanceBefore: beforeRecord.balance,
    balanceAfter: Number(result.rows[0].balance || 0),
    reservedAmount: amount,
  };
}

async function settleCustomerBalance(customerId, reservedAmount, actualAmount) {
  const reserved = roundMoney(reservedAmount);
  const actual = roundMoney(actualAmount);
  const delta = roundMoney(actual - reserved);

  if (!hasDatabase()) {
    const memoryCustomer = globalThis.__TOKEN_ROUTER_CUSTOMERS__?.customers?.find((item) => item.id === customerId);
    if (!memoryCustomer) return { balanceAfter: 0, delta };
    if (delta < 0) {
      memoryCustomer.balance = roundMoney(Number(memoryCustomer.balance || 0) + Math.abs(delta));
      memoryCustomer.totalSpend = roundMoney(Math.max(0, Number(memoryCustomer.totalSpend || 0) - Math.abs(delta)));
    } else if (delta > 0) {
      memoryCustomer.balance = roundMoney(Number(memoryCustomer.balance || 0) - delta);
      memoryCustomer.totalSpend = roundMoney(Number(memoryCustomer.totalSpend || 0) + delta);
    }
    return { balanceAfter: Number(memoryCustomer.balance || 0), delta };
  }

  let result;
  if (delta < 0) {
    result = await query(
      `UPDATE customers
       SET balance = balance + $2,
           total_spend = GREATEST(0, total_spend - $2)
       WHERE id = $1
       RETURNING balance`,
      [customerId, Math.abs(delta)]
    );
  } else if (delta > 0) {
    result = await query(
      `UPDATE customers
       SET balance = balance - $2,
           total_spend = total_spend + $2
       WHERE id = $1
       RETURNING balance`,
      [customerId, delta]
    );
  } else {
    result = await query("SELECT balance FROM customers WHERE id = $1 LIMIT 1", [customerId]);
  }

  return {
    balanceAfter: Number(result.rows[0]?.balance || 0),
    delta,
  };
}

async function recordWalletTransaction(entry) {
  const payload = {
    id: makeId("wallet_tx"),
    userId: entry.userId,
    workspaceId: entry.workspaceId || null,
    requestId: entry.requestId || "",
    transactionType: entry.transactionType || "consume",
    tokenAmount: roundMoney(entry.tokenAmount || 0),
    moneyAmount: roundMoney(entry.moneyAmount || 0),
    balanceBefore: roundMoney(entry.balanceBefore || 0),
    balanceAfter: roundMoney(entry.balanceAfter || 0),
    relatedLogId: entry.relatedLogId || "",
    description: entry.description || "",
    createdAt: new Date().toISOString(),
  };

  if (!hasDatabase()) {
    imageStudioStore.walletTransactions.unshift(payload);
    return payload;
  }

  await query(
    `INSERT INTO wallet_transactions (
      id, user_id, workspace_id, request_id, transaction_type,
      token_amount, money_amount, balance_before, balance_after,
      related_log_id, description, created_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, NOW()
    )`,
    [
      payload.id,
      payload.userId,
      payload.workspaceId,
      payload.requestId,
      payload.transactionType,
      payload.tokenAmount,
      payload.moneyAmount,
      payload.balanceBefore,
      payload.balanceAfter,
      payload.relatedLogId,
      payload.description,
    ]
  );
  return payload;
}

async function upsertDefaultWorkspaceForUser(customer) {
  if (!customer?.id) return null;
  const workspaceName = customer.company || customer.name || `${String(customer.email || "FlowAPI").split("@")[0]} 团队空间`;

  if (!hasDatabase()) {
    let workspace = imageStudioStore.workspaces.find((item) => item.ownerUserId === customer.id);
    if (!workspace) {
      workspace = {
        id: makeId("ws"),
        name: workspaceName,
        ownerUserId: customer.id,
        balance: Number(customer.balance || 0),
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      imageStudioStore.workspaces.push(workspace);
    }
    const existingMember = imageStudioStore.workspaceMembers.find((item) => item.workspaceId === workspace.id && item.userId === customer.id);
    if (!existingMember) {
      imageStudioStore.workspaceMembers.push({
        id: makeId("wsm"),
        workspaceId: workspace.id,
        userId: customer.id,
        role: "owner",
        memberName: customer.name || customer.email || "Owner",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    workspace.balance = Number(customer.balance || 0);
    return workspace;
  }

  await ensureImageStudioSchema();
  let workspaceResult = await query("SELECT * FROM workspaces WHERE owner_user_id = $1 ORDER BY created_at ASC LIMIT 1", [customer.id]);
  let workspace = workspaceResult.rows[0];

  if (!workspace) {
    workspaceResult = await query(
      `INSERT INTO workspaces (id, name, owner_user_id, balance, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
       RETURNING *`,
      [makeId("ws"), workspaceName, customer.id, Number(customer.balance || 0)]
    );
    workspace = workspaceResult.rows[0];
  } else {
    workspaceResult = await query(
      `UPDATE workspaces
       SET balance = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [workspace.id, Number(customer.balance || 0)]
    );
    workspace = workspaceResult.rows[0];
  }

  await query(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role, member_name, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'owner', $4, 'active', NOW(), NOW())
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET
       role = EXCLUDED.role,
       member_name = EXCLUDED.member_name,
       status = 'active',
       updated_at = NOW()`,
    [makeId("wsm"), workspace.id, customer.id, customer.name || customer.email || "Owner"]
  );

  return {
    id: workspace.id,
    name: workspace.name,
    ownerUserId: workspace.owner_user_id,
    balance: Number(workspace.balance || 0),
    status: workspace.status || "active",
  };
}

export async function getWorkspaceContext(customerId, requestedWorkspaceId = "") {
  await ensureImageStudioSchema();
  const customer = await getCustomer(customerId);
  if (!customer) return null;
  const defaultWorkspace = await upsertDefaultWorkspaceForUser(customer);

  if (!requestedWorkspaceId || requestedWorkspaceId === defaultWorkspace.id) {
    return {
      customer,
      workspace: defaultWorkspace,
      role: "owner",
    };
  }

  if (!hasDatabase()) {
    const workspace = imageStudioStore.workspaces.find((item) => item.id === requestedWorkspaceId) || defaultWorkspace;
    const membership = imageStudioStore.workspaceMembers.find((item) => item.workspaceId === workspace.id && item.userId === customerId);
    return {
      customer,
      workspace,
      role: membership?.role || (workspace.ownerUserId === customerId ? "owner" : "member"),
    };
  }

  const membershipResult = await query(
    `SELECT m.role AS member_role, m.status AS member_status, w.*
     FROM workspace_members m
     JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.workspace_id = $1 AND m.user_id = $2
     LIMIT 1`,
    [requestedWorkspaceId, customerId]
  );
  const membership = membershipResult.rows[0];
  if (!membership) return null;
    return {
      customer,
      workspace: {
        id: membership.id,
        name: membership.name,
        ownerUserId: membership.owner_user_id,
        balance: Number(membership.balance || 0),
        status: membership.status || "active",
      },
      role: membership.member_role || "member",
    };
  }

export async function listImageModels({ includeDisabled = false } = {}) {
  await ensureImageStudioSchema();
  if (!hasDatabase()) {
    syncMemoryImageModels();
    const rows = imageStudioStore.imageModels
      .filter((item) => includeDisabled || item.enabled)
      .sort((a, b) => Number(a.sort_order || 999) - Number(b.sort_order || 999));
    return rows.map(mapImageModelRow);
  }
  const result = await query(
    `SELECT * FROM image_models
     ${includeDisabled ? "" : "WHERE enabled = true"}
     ORDER BY sort_order ASC, created_at ASC`
  );
  return result.rows.map(mapImageModelRow);
}

export async function getImageModel(modelId = "") {
  const models = await listImageModels({ includeDisabled: true });
  return models.find((item) => item.id === modelId) || models[0] || null;
}

export async function updateImageModelConfig(modelId, updates = {}) {
  await ensureImageStudioSchema();
  const fields = {
    display_name: updates.displayName,
    upstream_model: updates.upstreamModel,
    provider: updates.provider,
    enabled: updates.enabled,
    recommended: updates.recommended,
    supports_text_to_image: updates.supportsTextToImage,
    supports_image_to_image: updates.supportsImageToImage,
    supports_batch: updates.supportsBatch,
    speed_score: updates.speedScore,
    stability_score: updates.stabilityScore,
    quality_score: updates.qualityScore,
    unit_price_token_text_to_image: updates.unitPriceTokenTextToImage,
    unit_price_token_image_to_image: updates.unitPriceTokenImageToImage,
    unit_price_rmb_text_to_image: updates.unitPriceRmbTextToImage,
    unit_price_rmb_image_to_image: updates.unitPriceRmbImageToImage,
    fallback_model_id: updates.fallbackModelId,
    tags: updates.tags ? JSON.stringify(updates.tags) : undefined,
    scene_description: updates.sceneDescription,
    sort_order: updates.sortOrder,
  };

  if (!hasDatabase()) {
    const target = imageStudioStore.imageModels.find((item) => item.id === modelId);
    if (!target) return null;
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined) target[key] = key === "tags" ? JSON.parse(value) : value;
    });
    return mapImageModelRow(target);
  }

  const setClauses = [];
  const values = [];
  let index = 1;
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined) return;
    setClauses.push(`${key} = $${index}`);
    values.push(value);
    index += 1;
  });
  if (!setClauses.length) return getImageModel(modelId);
  setClauses.push("updated_at = NOW()");
  values.push(modelId);
  const result = await query(
    `UPDATE image_models
     SET ${setClauses.join(", ")}
     WHERE id = $${index}
     RETURNING *`,
    values
  );
  return result.rows[0] ? mapImageModelRow(result.rows[0]) : null;
}

function estimateImageCost(model, { mode = "text_to_image", quality = "standard", n = 1 } = {}) {
  const count = Math.max(1, Math.min(4, Number(n || 1)));
  const qualityMultiplier = getQualityMultiplier(quality);
  const tokenBase = mode === "image_to_image"
    ? Number(model.unitPriceTokenImageToImage || model.unitPriceTokenTextToImage || 0)
    : Number(model.unitPriceTokenTextToImage || 0);
  const moneyBase = mode === "image_to_image"
    ? Number(model.unitPriceRmbImageToImage || model.unitPriceRmbTextToImage || 0)
    : Number(model.unitPriceRmbTextToImage || 0);
  return {
    tokenCost: roundMoney(tokenBase * qualityMultiplier * count),
    moneyCost: roundMoney(moneyBase * qualityMultiplier * count),
  };
}

function buildImageRequestBody({ prompt, model, images, aspectRatio, quality, n, returnFormat }) {
  const normalizedImages = normalizeImageArray(images);
  const body = {
    model: model.upstreamModel,
    prompt,
    n: Math.max(1, Math.min(4, Number(n || 1))),
    size: mapAspectRatioToSize(aspectRatio),
    aspect_ratio: aspectRatio || "1:1",
    quality: String(quality || "standard").toLowerCase(),
    response_format: returnFormat === "b64_json" ? "b64_json" : "url",
  };

  if (normalizedImages.length) {
    body.image = normalizedImages[0];
    body.images = normalizedImages;
    body.input_image = normalizedImages[0];
    body.input_images = normalizedImages;
  }

  return body;
}

function buildOpenRouterImageChatBody({ prompt, model, images, aspectRatio, quality, returnFormat }) {
  const normalizedImages = normalizeImageArray(images);
  const upstreamModel = String(model.upstreamModel || "").toLowerCase();
  const imageOnlyOutput = [
    "x-ai/grok-imagine",
    "bytedance-seed/seedream",
    "recraft/",
    "black-forest-labs/",
    "microsoft/mai-image",
    "sourceful/riverflow",
  ].some((prefix) => upstreamModel.startsWith(prefix));
  const content = [
    {
      type: "text",
      text: prompt,
    },
    ...normalizedImages.map((image) => ({
      type: "image_url",
      image_url: { url: image },
    })),
  ];

  return {
    model: model.upstreamModel,
    messages: [
      {
        role: "user",
        content,
      },
    ],
    modalities: imageOnlyOutput ? ["image"] : ["image", "text"],
    size: mapAspectRatioToSize(aspectRatio),
    aspect_ratio: aspectRatio || "1:1",
    quality: String(quality || "standard").toLowerCase(),
    response_format: returnFormat === "b64_json" ? "b64_json" : "url",
  };
}

function parseImageOutputs(payload) {
  const outputs = [];

  function push(value, mime = "image/png") {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) return;
    if (text.startsWith("data:image/") || /^https?:\/\//i.test(text)) {
      outputs.push(text);
      return;
    }
    if (/^[A-Za-z0-9+/=\s]+$/.test(text) && text.length > 120) {
      outputs.push(`data:${mime};base64,${text.replace(/\s+/g, "")}`);
    }
  }

  function visit(value) {
    if (!value) return;
    if (typeof value === "string") {
      push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;

    if (value.url) push(value.url);
    if (typeof value.image_url === "string") push(value.image_url);
    if (value.image_url?.url) push(value.image_url.url);
    if (value.data_url) push(value.data_url);
    if (value.b64_json) push(value.b64_json, value.mime_type || "image/png");
    if (value.b64) push(value.b64, value.mime_type || "image/png");
    if (value.base64) push(value.base64, value.mime_type || "image/png");
    if (value.type && String(value.type).includes("image") && value.data) {
      push(value.data, value.mime_type || "image/png");
    }

    visit(value.image);
    visit(value.data);
    visit(value.result);
    visit(value.results);
    visit(value.artifacts);
    visit(value.images);
    visit(value.output);
    visit(value.content);
    visit(value.message);
    visit(value.message?.content);
    visit(value.choices);
  }

  visit(payload);
  return Array.from(new Set(outputs));
}

function dataUrlToBuffer(dataUrl = "") {
  const match = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;
  const mime = match[1] || "image/png";
  const isBase64 = Boolean(match[2]);
  const payload = decodeURIComponent(match[3] || "");
  const extension = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  return {
    mime,
    extension,
    buffer: isBase64 ? Buffer.from(payload, "base64") : Buffer.from(payload, "utf8"),
  };
}

async function persistImageOutputs(outputs = [], requestId = makeId("img")) {
  const generatedDir = path.join(process.cwd(), "public", "generated-images");
  const publicBase = "/api/images/generated";
  await fs.mkdir(generatedDir, { recursive: true });

  const persisted = [];
  for (let index = 0; index < outputs.length; index += 1) {
    const src = outputs[index];
    if (!String(src || "").startsWith("data:image/")) {
      persisted.push(src);
      continue;
    }
    const parsed = dataUrlToBuffer(src);
    if (!parsed) {
      persisted.push(src);
      continue;
    }
    const fileName = `${requestId}_${String(index + 1).padStart(2, "0")}.${parsed.extension}`;
    await fs.writeFile(path.join(generatedDir, fileName), parsed.buffer);
    persisted.push(`${publicBase}/${fileName}`);
  }
  return persisted;
}

function extractUsage(payload = {}) {
  const usage = payload?.usage || {};
  const promptTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
  const completionTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
  const totalTokens = Number(usage.total_tokens || promptTokens + completionTokens || 0);
  const upstreamCost = Number(usage.cost || usage.cost_details?.upstream_inference_cost || 0);
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
    upstreamCost: Number.isFinite(upstreamCost) ? upstreamCost : 0,
  };
}

function extractUpstreamError(payload = {}, status = 0) {
  const error = payload?.error || payload?.errors?.[0] || payload;
  const code = String(error?.code || error?.type || payload?.code || `UPSTREAM_HTTP_${status || 502}`).slice(0, 80);
  const message = String(
    error?.message
      || error?.error
      || payload?.message
      || payload?.raw
      || (status ? `上游服务返回 ${status}` : "图片上游请求失败")
  ).replace(/\s+/g, " ").slice(0, 500);
  return { code, message };
}

function friendlyUpstreamMessage(status = 0, code = "") {
  if (status === 401 || status === 403) return "图片上游鉴权失败，管理员需要检查 OpenRouter 配置";
  if (status === 402) return "图片上游额度不足，管理员需要检查 OpenRouter 账户余额";
  if (status === 404) return "当前图片模型或上游路径暂不可用，请切换其他图片模型";
  if (status === 408) return "图片生成超时，系统已按规则处理且未扣费";
  if (status === 413) return "参考图片过大，请压缩后重试";
  if (status === 422 || code === "IMAGE_OUTPUT_EMPTY") return "上游没有返回可用图片，请换一个模型或调整描述后重试";
  if (status === 429) return "图片上游暂时繁忙，请稍后重试";
  if (status >= 500) return "图片上游服务暂时不可用，请稍后重试";
  return "图片生成失败，未扣费";
}

async function callImageUpstream({
  endpoint,
  body,
  req,
}) {
  const upstreams = getUpstreamConfigs();
  const upstream = upstreams.find((item) => item.name === "openrouter") || upstreams[0];
  if (!upstream?.apiKey) {
    return {
      ok: false,
      status: 500,
      errorCode: "UPSTREAM_NOT_CONFIGURED",
      errorMessage: "图片上游未配置，请联系管理员",
      errorSource: "flowapi",
    };
  }

  const headers = {
    Authorization: `Bearer ${upstream.apiKey}`,
    "Content-Type": "application/json",
  };
  if (upstream.name === "openrouter") {
    headers["HTTP-Referer"] = process.env.PROXY_HTTP_REFERER || "https://flowapi.fun";
    headers["X-Title"] = process.env.PROXY_TITLE || "FlowAPI Image Studio";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.IMAGE_UPSTREAM_TIMEOUT_MS || 90000));
  try {
    const isOpenRouter = upstream.name === "openrouter";
    const upstreamEndpoint = isOpenRouter ? "chat/completions" : endpoint;
    const upstreamUrl = `${upstream.baseUrl}/v1/${upstreamEndpoint}`;
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    const outputs = parseImageOutputs(json);
    const usage = extractUsage(json);
    const upstreamError = response.ok && outputs.length
      ? { code: "", message: "" }
      : extractUpstreamError(json, response.ok ? 422 : response.status);
    const errorCode = response.ok && !outputs.length ? "IMAGE_OUTPUT_EMPTY" : upstreamError.code;
    return {
      ok: response.ok && outputs.length > 0,
      status: response.ok && !outputs.length ? 422 : response.status,
      payload: json,
      outputs,
      usage,
      provider: upstream.label,
      endpoint: upstreamEndpoint,
      errorCode,
      errorMessage: response.ok && outputs.length ? "" : friendlyUpstreamMessage(response.ok ? 422 : response.status, errorCode),
      errorSource: response.ok && outputs.length ? "" : "upstream",
      upstreamErrorMessage: upstreamError.message,
    };
  } catch (error) {
    return {
      ok: false,
      status: error?.name === "AbortError" ? 408 : 502,
      errorCode: error?.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_REQUEST_FAILED",
      errorMessage: error?.name === "AbortError" ? "图片生成超时，系统将尝试自动重试" : (error?.message || "图片上游请求失败"),
      errorSource: "upstream",
      provider: upstream.label,
      endpoint,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function executeImageRequest({
  model,
  prompt,
  images,
  aspectRatio,
  quality,
  n,
  returnFormat,
  autoRetry,
  req,
}) {
  const mode = images.length ? "image_to_image" : "text_to_image";
  const endpoint = mode === "image_to_image" ? "images/edits" : "images/generations";
  const requestedCount = Math.max(1, Math.min(4, Number(n || 1)));
  const upstreams = getUpstreamConfigs();
  const preferredUpstream = upstreams.find((item) => item.name === "openrouter") || upstreams[0];
  const bodyBuilder = preferredUpstream?.name === "openrouter" ? buildOpenRouterImageChatBody : buildImageRequestBody;
  const baseBody = bodyBuilder({
    prompt,
    model,
    images,
    aspectRatio,
    quality,
    n: requestedCount,
    returnFormat,
  });

  let retryCount = 0;
  let fallbackUsed = false;
  let currentModel = model;

  const callRequestedCount = async (body, count) => {
    const outputs = [];
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, upstreamCost: 0 };
    let lastResult = null;
    for (let index = 0; index < count; index += 1) {
      const result = await callImageUpstream({ endpoint, body, req });
      lastResult = result;
      usage.promptTokens += Number(result.usage?.promptTokens || 0);
      usage.completionTokens += Number(result.usage?.completionTokens || 0);
      usage.totalTokens += Number(result.usage?.totalTokens || 0);
      usage.upstreamCost += Number(result.usage?.upstreamCost || 0);
      if (!result.ok) {
        if (outputs.length) {
          return {
            ...result,
            ok: true,
            status: 200,
            outputs,
            usage,
            errorCode: "",
            errorMessage: "",
            errorSource: "",
          };
        }
        return { ...result, outputs };
      }
      outputs.push(...(result.outputs || []));
      if (outputs.length >= count) break;
    }
    return {
      ...lastResult,
      ok: outputs.length > 0,
      outputs: outputs.slice(0, count),
      usage,
      status: outputs.length > 0 ? 200 : 422,
      errorCode: outputs.length > 0 ? "" : "IMAGE_OUTPUT_EMPTY",
      errorMessage: outputs.length > 0 ? "" : friendlyUpstreamMessage(422, "IMAGE_OUTPUT_EMPTY"),
      errorSource: outputs.length > 0 ? "" : "upstream",
    };
  };

  let result = await callRequestedCount(baseBody, requestedCount);
  const canRetryPrimary = autoRetry && canRetryImageResult(result);

  if (!result.ok && canRetryPrimary) {
    retryCount += 1;
    result = await callRequestedCount(baseBody, requestedCount);
  }

  const canTryFallback = canUseFallbackImageResult(result);
  if (canTryFallback && currentModel.fallbackModelId) {
    const fallbackModel = await getImageModel(currentModel.fallbackModelId);
    if (fallbackModel?.enabled) {
      fallbackUsed = true;
      currentModel = fallbackModel;
      const fallbackBody = bodyBuilder({
        prompt,
        model: fallbackModel,
        images,
        aspectRatio,
        quality,
        n: requestedCount,
        returnFormat,
      });
      retryCount += 1;
      result = await callRequestedCount(fallbackBody, requestedCount);
    }
  }

  return {
    ...result,
    retryCount,
    fallbackUsed,
    mode,
    modelUsed: currentModel,
  };
}

async function insertImageLog(log) {
  const payload = {
    id: makeId("imglog"),
    ...log,
  };

  if (!hasDatabase()) {
    imageStudioStore.imageLogs.unshift({
      ...payload,
      input_image_urls: payload.inputImageUrls || [],
      output_image_urls: payload.outputImageUrls || [],
      output_thumbnail_urls: payload.outputThumbnailUrls || [],
      createdAt: payload.createdAt || new Date().toISOString(),
    });
    return {
      ...payload,
      createdAt: payload.createdAt || new Date().toISOString(),
    };
  }

  await query(
    `INSERT INTO image_generation_logs (
      id, user_id, workspace_id, api_key_id, request_id, mode,
      model_display_name, upstream_model, upstream_provider,
      prompt, prompt_preview, input_image_urls, output_image_urls, output_thumbnail_urls,
      output_image_count, aspect_ratio, quality, token_cost, money_cost,
      balance_before, balance_after, status, error_code, error_message, error_source,
      latency_ms, retry_count, saved_to_history, metadata, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9,
      $10, $11, $12::jsonb, $13::jsonb, $14::jsonb,
      $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24, $25,
      $26, $27, $28, $29::jsonb, NOW()
    )`,
    [
      payload.id,
      payload.userId,
      payload.workspaceId,
      payload.apiKeyId,
      payload.requestId,
      payload.mode,
      payload.modelDisplayName,
      payload.upstreamModel,
      payload.upstreamProvider,
      payload.prompt,
      payload.promptPreview,
      JSON.stringify(payload.inputImageUrls || []),
      JSON.stringify(payload.outputImageUrls || []),
      JSON.stringify(payload.outputThumbnailUrls || []),
      payload.outputImageCount,
      payload.aspectRatio,
      payload.quality,
      payload.tokenCost,
      payload.moneyCost,
      payload.balanceBefore,
      payload.balanceAfter,
      payload.status,
      payload.errorCode,
      payload.errorMessage,
      payload.errorSource,
      payload.latencyMs,
      payload.retryCount,
      payload.savedToHistory !== false,
      JSON.stringify(payload.metadata || {}),
    ]
  );
  return payload;
}

async function insertApiUsageLog(entry) {
  const payload = {
    id: makeId("apilog"),
    ...entry,
  };
  if (!hasDatabase()) {
    imageStudioStore.apiUsageLogs.unshift(payload);
    return payload;
  }
  await query(
    `INSERT INTO api_usage_logs (
      id, user_id, workspace_id, api_key_id, request_id, endpoint, method, mode,
      model_display_name, upstream_model, upstream_provider, prompt_preview,
      input_image_count, output_image_count, token_cost, money_cost,
      balance_before, balance_after, status, error_code, error_message, error_source,
      latency_ms, retry_count, ip_address, user_agent, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12,
      $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22,
      $23, $24, $25, $26, NOW()
    )`,
    [
      payload.id,
      payload.userId,
      payload.workspaceId,
      payload.apiKeyId,
      payload.requestId,
      payload.endpoint,
      payload.method || "POST",
      payload.mode,
      payload.modelDisplayName,
      payload.upstreamModel,
      payload.upstreamProvider,
      payload.promptPreview,
      payload.inputImageCount,
      payload.outputImageCount,
      payload.tokenCost,
      payload.moneyCost,
      payload.balanceBefore,
      payload.balanceAfter,
      payload.status,
      payload.errorCode,
      payload.errorMessage,
      payload.errorSource,
      payload.latencyMs,
      payload.retryCount,
      payload.ipAddress || "",
      payload.userAgent || "",
    ]
  );
  return payload;
}

async function insertImageGenerationRecord(entry) {
  const payload = {
    id: makeId("gen"),
    ...entry,
  };
  if (!hasDatabase()) return payload;
  await query(
    `INSERT INTO image_generations (
      id, user_id, api_key_id, public_model_id, actual_model_id, provider,
      prompt, style, size, count, status, image_urls,
      input_tokens, output_tokens, total_tokens, cost, internal_cost, sell_price, profit,
      error_code, error_message, latency_ms, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12::jsonb,
      $13, $14, $15, $16, $17, $18, $19,
      $20, $21, $22, NOW(), NOW()
    )`,
    [
      payload.id,
      payload.userId,
      payload.apiKeyId || "",
      payload.publicModelId,
      payload.actualModelId,
      payload.provider || "openrouter",
      payload.prompt || "",
      payload.style || "",
      payload.size || "1024x1024",
      payload.count || 1,
      payload.status || "failed",
      JSON.stringify(payload.imageUrls || []),
      payload.inputTokens || 0,
      payload.outputTokens || payload.totalTokens || 0,
      payload.totalTokens || 0,
      payload.cost || 0,
      payload.internalCost || 0,
      payload.sellPrice || payload.cost || 0,
      payload.profit || 0,
      payload.errorCode || "",
      payload.errorMessage || "",
      payload.latencyMs || 0,
    ]
  );
  return payload;
}

function buildFriendlyFailure(errorMessage = "", requestId = "") {
  return `${errorMessage || "图片生成失败"}${requestId ? `（请求 ID：${requestId}）` : ""}`;
}

function normalizeModelResult(selectedModel, upstreamResult) {
  const triedFallback = Boolean(upstreamResult?.fallbackUsed && upstreamResult?.modelUsed?.id && upstreamResult.modelUsed.id !== selectedModel.id);
  const modelForDisplay = triedFallback || upstreamResult?.ok
    ? (upstreamResult?.modelUsed || selectedModel)
    : selectedModel;

  return {
    displayName: modelForDisplay?.displayName || selectedModel.displayName,
    upstreamModel: modelForDisplay?.upstreamModel || selectedModel.upstreamModel,
    provider: upstreamResult?.provider || modelForDisplay?.provider || selectedModel.provider,
    usedId: modelForDisplay?.id || selectedModel.id,
  };
}

export async function runImageStudioJob({
  req,
  customerId,
  apiKeyId = null,
  prompt,
  images = [],
  modelId,
  aspectRatio = "1:1",
  quality = "standard",
  n = 1,
  saveHistory = true,
  autoRetry = true,
  returnFormat = "url",
  endpoint = "/api/image-chat",
  actionType = "",
  sourceImageId = "",
  sourceGenerationId = "",
  avoidImageId = "",
}) {
  await ensureImageStudioSchema();
  const customer = await getCustomer(customerId);
  if (!customer) {
    return { ok: false, status: 404, error: "用户不存在" };
  }

  const workspaceContext = await getWorkspaceContext(customerId);
  if (!workspaceContext?.workspace) {
    return { ok: false, status: 400, error: "工作空间初始化失败" };
  }

  const normalizedImages = normalizeImageArray(images);
  const cleanPrompt = String(prompt || "").trim();
  const limit = rateLimit(`image-generate:${customerId}:${getClientIp(req)}`, { limit: 8, windowMs: 60 * 1000 });
  if (!limit.ok) {
    return {
      ok: false,
      status: 429,
      error: `图片生成请求过快，请 ${limit.retryAfter} 秒后再试`,
      code: "IMAGE_RATE_LIMITED",
      retryAfter: limit.retryAfter,
    };
  }
  if (!cleanPrompt && !normalizedImages.length) {
    return { ok: false, status: 400, error: "请输入图片需求，或上传图片后告诉我你想怎么修改" };
  }
  if (!cleanPrompt && normalizedImages.length) {
    return { ok: false, status: 400, error: "请再补充一句修改要求，例如：保留主体，背景换成科技办公室风格" };
  }
  if (IMAGE_SAFETY_PATTERNS.some((pattern) => pattern.test(cleanPrompt))) {
    return {
      ok: false,
      status: 400,
      error: "该图片需求存在风险，请修改描述后再试。",
      code: "IMAGE_PROMPT_RISK",
    };
  }

  const selectedModel = await getImageModel(modelId);
  if (!selectedModel?.enabled) {
    return { ok: false, status: 400, error: "当前图片模型暂不可用，请切换其他模型" };
  }

  const mode = normalizedImages.length ? "image_to_image" : "text_to_image";
  const estimation = estimateImageCost(selectedModel, {
    mode,
    quality,
    n,
  });
  if (estimation.moneyCost <= 0) {
    return {
      ok: false,
      status: 400,
      error: "该图片模型暂未配置价格，请切换其他模型或联系管理员",
      code: "IMAGE_MODEL_PRICE_NOT_CONFIGURED",
    };
  }
  const requestId = `img_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const reserve = await reserveCustomerBalance(customerId, estimation.moneyCost);

  if (reserve?.error) {
    return {
      ok: false,
      status: 402,
      error: reserve.error,
      code: "INSUFFICIENT_BALANCE",
      requestId,
      needRecharge: true,
      currentBalance: Number(customer.balance || 0),
      estimatedCost: estimation,
    };
  }

  const startedAt = Date.now();
  const upstreamResult = await executeImageRequest({
    model: selectedModel,
    prompt: cleanPrompt,
    images: normalizedImages,
    aspectRatio,
    quality,
    n,
    returnFormat,
    autoRetry,
    req,
  });
  const latencyMs = Date.now() - startedAt;
  const persistedOutputs = upstreamResult.ok
    ? await persistImageOutputs(upstreamResult.outputs || [], requestId)
    : [];
  const outputCount = persistedOutputs.length || 0;
  const estimatedActualCost = upstreamResult.ok
    ? estimateImageCost(upstreamResult.modelUsed || selectedModel, {
        mode,
        quality,
        n: outputCount || n,
      })
    : { tokenCost: 0, moneyCost: 0 };
  const actualCost = upstreamResult.ok
    ? {
        ...estimatedActualCost,
        tokenCost: upstreamResult.usage?.totalTokens > 0
          ? roundMoney(upstreamResult.usage.totalTokens)
          : estimatedActualCost.tokenCost,
      }
    : { tokenCost: 0, moneyCost: 0 };
  const settlement = await settleCustomerBalance(customerId, reserve.reservedAmount, actualCost.moneyCost);
  const finalBalance = Number(settlement.balanceAfter || reserve.balanceBefore || 0);
  const logStatus = upstreamResult.ok
    ? (outputCount > 0 && outputCount < Number(n || 1) ? "partial_success" : "success")
    : "failed";
  const normalizedModelResult = normalizeModelResult(selectedModel, upstreamResult);

  const imageLog = await insertImageLog({
    userId: customerId,
    workspaceId: workspaceContext.workspace.id,
    apiKeyId,
    requestId,
    mode,
    modelDisplayName: normalizedModelResult.displayName,
    upstreamModel: normalizedModelResult.upstreamModel,
    upstreamProvider: normalizedModelResult.provider,
    prompt: cleanPrompt,
    promptPreview: truncateText(cleanPrompt),
    inputImageUrls: normalizedImages,
    outputImageUrls: persistedOutputs,
    outputThumbnailUrls: persistedOutputs,
    outputImageCount: outputCount,
    aspectRatio,
    quality,
    tokenCost: actualCost.tokenCost,
    moneyCost: actualCost.moneyCost,
    balanceBefore: reserve.balanceBefore,
    balanceAfter: upstreamResult.ok ? finalBalance : reserve.balanceBefore,
    status: logStatus,
    errorCode: upstreamResult.errorCode || "",
    errorMessage: upstreamResult.ok ? "" : (upstreamResult.errorMessage || "图片生成失败"),
    errorSource: upstreamResult.errorSource || "",
    latencyMs,
    retryCount: upstreamResult.retryCount || 0,
    savedToHistory: saveHistory !== false,
    metadata: {
      fallbackUsed: Boolean(upstreamResult.fallbackUsed),
      modelRequested: selectedModel.id,
      modelUsedId: normalizedModelResult.usedId,
      estimatedCost: estimation,
      upstreamUsage: upstreamResult.usage || {},
      returnFormat,
      actionType,
      sourceImageId,
      sourceGenerationId,
      avoidImageId,
    },
  });

  await insertApiUsageLog({
    userId: customerId,
    workspaceId: workspaceContext.workspace.id,
    apiKeyId,
    requestId,
    endpoint,
    method: "POST",
    mode,
    modelDisplayName: normalizedModelResult.displayName,
    upstreamModel: normalizedModelResult.upstreamModel,
    upstreamProvider: normalizedModelResult.provider,
    promptPreview: truncateText(cleanPrompt),
    inputImageCount: normalizedImages.length,
    outputImageCount: outputCount,
    tokenCost: actualCost.tokenCost,
    moneyCost: actualCost.moneyCost,
    balanceBefore: reserve.balanceBefore,
    balanceAfter: upstreamResult.ok ? finalBalance : reserve.balanceBefore,
    status: logStatus,
    errorCode: upstreamResult.errorCode || "",
    errorMessage: upstreamResult.ok ? "" : (upstreamResult.errorMessage || "图片生成失败"),
    errorSource: upstreamResult.errorSource || "",
    latencyMs,
    retryCount: upstreamResult.retryCount || 0,
    ipAddress: getClientIp(req),
    userAgent: String(req?.headers?.["user-agent"] || ""),
  });

  await insertImageGenerationRecord({
    userId: customerId,
    apiKeyId,
    publicModelId: normalizedModelResult.usedId,
    actualModelId: normalizedModelResult.upstreamModel,
    provider: normalizedModelResult.provider,
    prompt: cleanPrompt,
    style: String(quality || "standard"),
    size: mapAspectRatioToSize(aspectRatio),
    count: outputCount || Number(n || 1),
    status: upstreamResult.ok ? "success" : "failed",
    imageUrls: persistedOutputs,
    inputTokens: upstreamResult.usage?.promptTokens || 0,
    outputTokens: upstreamResult.usage?.completionTokens || actualCost.tokenCost,
    totalTokens: actualCost.tokenCost,
    cost: actualCost.moneyCost,
    internalCost: upstreamResult.usage?.upstreamCost || 0,
    sellPrice: actualCost.moneyCost,
    profit: roundMoney(actualCost.moneyCost - Number(upstreamResult.usage?.upstreamCost || 0)),
    errorCode: upstreamResult.errorCode || "",
    errorMessage: upstreamResult.ok ? "" : (upstreamResult.errorMessage || "图片生成失败"),
    latencyMs,
  });

  if (upstreamResult.ok) {
    await recordWalletTransaction({
      userId: customerId,
      workspaceId: workspaceContext.workspace.id,
      requestId,
      transactionType: "consume",
      tokenAmount: actualCost.tokenCost,
      moneyAmount: actualCost.moneyCost,
      balanceBefore: reserve.balanceBefore,
      balanceAfter: finalBalance,
      relatedLogId: imageLog.id,
      description: `${mode === "image_to_image" ? "图片编辑" : "图片生成"} · ${upstreamResult.modelUsed?.displayName || selectedModel.displayName}`,
    });
  } else {
    await recordWalletTransaction({
      userId: customerId,
      workspaceId: workspaceContext.workspace.id,
      requestId,
      transactionType: "refund",
      tokenAmount: 0,
      moneyAmount: 0,
      balanceBefore: reserve.balanceBefore,
      balanceAfter: reserve.balanceBefore,
      relatedLogId: imageLog.id,
      description: "图片生成失败，自动退回预占额度",
    });
  }

  const estimatedRemainingImages = actualCost.moneyCost > 0
    ? Math.max(0, Math.floor(finalBalance / actualCost.moneyCost))
    : Math.max(0, Math.floor(finalBalance / Math.max(0.01, estimation.moneyCost || 0.01)));

  if (!upstreamResult.ok) {
    return {
      ok: false,
      status: upstreamResult.status || 502,
      error: buildFriendlyFailure(upstreamResult.errorMessage, requestId),
      requestId,
      mode,
      modelDisplayName: normalizedModelResult.displayName,
      tokenCost: 0,
      moneyCost: 0,
      balanceBefore: reserve.balanceBefore,
      balanceAfter: reserve.balanceBefore,
      latencyMs,
      autoRetried: Boolean(upstreamResult.retryCount),
      fallbackUsed: Boolean(upstreamResult.fallbackUsed),
      logId: imageLog.id,
    };
  }

  return {
    ok: true,
    status: 200,
    requestId,
    mode,
    images: persistedOutputs,
    outputImageCount: outputCount,
    modelDisplayName: upstreamResult.modelUsed?.displayName || selectedModel.displayName,
    modelId: upstreamResult.modelUsed?.id || selectedModel.id,
    tokenCost: actualCost.tokenCost,
    moneyCost: actualCost.moneyCost,
    balanceBefore: reserve.balanceBefore,
    balanceAfter: finalBalance,
    latencyMs,
    estimatedRemainingImages,
    autoRetried: Boolean(upstreamResult.retryCount),
    fallbackUsed: Boolean(upstreamResult.fallbackUsed),
    logId: imageLog.id,
    saveHistory: saveHistory !== false,
    friendlyMessage: outputCount > 1 ? `已生成 ${outputCount} 张图片` : "图片生成成功",
  };
}

function buildWhereClause({ targetUserId, workspaceId, onlySavedHistory = false, status = "", type = "" } = {}) {
  const clauses = [];
  const values = [];
  let index = 1;
  if (targetUserId) {
    clauses.push(`user_id = $${index}`);
    values.push(targetUserId);
    index += 1;
  }
  if (workspaceId) {
    clauses.push(`workspace_id = $${index}`);
    values.push(workspaceId);
    index += 1;
  }
  if (onlySavedHistory) {
    clauses.push("saved_to_history = true");
  }
  if (status) {
    clauses.push(`status = $${index}`);
    values.push(status);
    index += 1;
  }
  if (type) {
    clauses.push(`mode = $${index}`);
    values.push(type);
    index += 1;
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function buildRequestIdFilter(requestId = "", nextIndex = 1) {
  if (!requestId) {
    return { clause: "", values: [] };
  }
  return {
    clause: `request_id = $${nextIndex}`,
    values: [requestId],
  };
}

export async function listImageHistory({
  viewerId,
  targetUserId,
  workspaceId = "",
  limit = 50,
  status = "",
  type = "",
  requestId = "",
}) {
  await ensureImageStudioSchema();
  const context = await getWorkspaceContext(viewerId, workspaceId);
  if (!context) return { error: "无权查看该工作空间" };
  const effectiveTargetUserId = targetUserId && targetUserId !== viewerId
    ? (context.role === "owner" || context.role === "admin" || isAdminCustomer(context.customer) ? targetUserId : null)
    : viewerId;
  if (!effectiveTargetUserId) return { error: "无权查看其他成员图片历史" };

  if (!hasDatabase()) {
    const items = imageStudioStore.imageLogs
      .map(mapImageLogRow)
      .filter((item) => item.userId === effectiveTargetUserId && item.savedToHistory)
      .filter((item) => !status || item.status === status)
      .filter((item) => !type || item.mode === type)
      .filter((item) => !requestId || item.requestId === requestId)
      .slice(0, Math.max(1, Math.min(100, Number(limit || 50))));
    return {
      workspace: context.workspace,
      role: context.role,
      items,
    };
  }

  const clause = buildWhereClause({
    targetUserId: effectiveTargetUserId,
    workspaceId: context.workspace.id,
    onlySavedHistory: true,
    status,
    type,
  });
  const requestIdFilter = buildRequestIdFilter(requestId, clause.values.length + 1);
  const where = [clause.where.replace(/^WHERE\s+/i, ""), requestIdFilter.clause].filter(Boolean).join(" AND ");
  const result = await query(
    `SELECT * FROM image_generation_logs
     ${where ? `WHERE ${where}` : ""}
     ORDER BY created_at DESC
     LIMIT ${Math.max(1, Math.min(100, Number(limit || 50)))}`,
    [...clause.values, ...requestIdFilter.values]
  );
  return {
    workspace: context.workspace,
    role: context.role,
    items: result.rows.map(mapImageLogRow),
  };
}

export async function listImageLogs({
  viewerId,
  targetUserId,
  workspaceId = "",
  limit = 100,
  status = "",
  type = "",
  requestId = "",
}) {
  await ensureImageStudioSchema();
  const context = await getWorkspaceContext(viewerId, workspaceId);
  if (!context) return { error: "无权查看该工作空间" };
  const canViewTeam = context.role === "owner" || context.role === "admin" || isAdminCustomer(context.customer);
  const effectiveTargetUserId = targetUserId && targetUserId !== viewerId ? (canViewTeam ? targetUserId : null) : viewerId;
  if (targetUserId && targetUserId !== viewerId && !canViewTeam) {
    return { error: "成员之间不能互相查看日志" };
  }

  if (!hasDatabase()) {
    const items = imageStudioStore.imageLogs
      .map(mapImageLogRow)
      .filter((item) => !effectiveTargetUserId || item.userId === effectiveTargetUserId)
      .filter((item) => !status || item.status === status)
      .filter((item) => !type || item.mode === type)
      .filter((item) => !requestId || item.requestId === requestId)
      .slice(0, Math.max(1, Math.min(200, Number(limit || 100))));
    return {
      workspace: context.workspace,
      role: context.role,
      items,
    };
  }

  const clause = buildWhereClause({
    targetUserId: effectiveTargetUserId,
    workspaceId: context.workspace.id,
    status,
    type,
  });
  const requestIdFilter = buildRequestIdFilter(requestId, clause.values.length + 1);
  const where = [clause.where.replace(/^WHERE\s+/i, ""), requestIdFilter.clause].filter(Boolean).join(" AND ");
  const result = await query(
    `SELECT * FROM image_generation_logs
     ${where ? `WHERE ${where}` : ""}
     ORDER BY created_at DESC
     LIMIT ${Math.max(1, Math.min(200, Number(limit || 100)))}`,
    [...clause.values, ...requestIdFilter.values]
  );
  return {
    workspace: context.workspace,
    role: context.role,
    items: result.rows.map(mapImageLogRow),
  };
}

function summarizeLogs(logs = []) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter((item) => String(item.createdAt || "").slice(0, 10) === todayKey);
  const successLogs = logs.filter((item) => item.status === "success" || item.status === "partial_success");
  const totalImages = logs.reduce((sum, item) => sum + Number(item.outputImageCount || 0), 0);
  const totalMoney = logs.reduce((sum, item) => sum + Number(item.moneyCost || 0), 0);
  const totalTokens = logs.reduce((sum, item) => sum + Number(item.tokenCost || 0), 0);
  const modelCounter = logs.reduce((memo, item) => {
    const key = item.modelDisplayName || "Unknown";
    memo[key] = (memo[key] || 0) + 1;
    return memo;
  }, {});
  const topModel = Object.entries(modelCounter).sort((a, b) => b[1] - a[1])[0]?.[0] || "暂无";
  return {
    totalGenerations: logs.length,
    totalImages,
    totalMoney: roundMoney(totalMoney),
    totalTokens: roundMoney(totalTokens),
    todayGenerations: todayLogs.length,
    todayImages: todayLogs.reduce((sum, item) => sum + Number(item.outputImageCount || 0), 0),
    todayMoney: roundMoney(todayLogs.reduce((sum, item) => sum + Number(item.moneyCost || 0), 0)),
    todayTokens: roundMoney(todayLogs.reduce((sum, item) => sum + Number(item.tokenCost || 0), 0)),
    successRate: logs.length ? Number(((successLogs.length / logs.length) * 100).toFixed(1)) : 0,
    topModel,
  };
}

export async function getImageSummary({ viewerId, workspaceId = "", targetUserId = "" } = {}) {
  const logsResult = await listImageLogs({
    viewerId,
    workspaceId,
    targetUserId,
    limit: 365,
  });
  if (logsResult.error) return logsResult;
  const summary = summarizeLogs(logsResult.items || []);
  const workspace = logsResult.workspace;
  const balance = Number(workspace?.balance || 0);
  const models = await listImageModels();
  const cheapest = models[0] || DEFAULT_IMAGE_MODELS[0];
  const estimatedRemainingImages = cheapest
    ? Math.max(0, Math.floor(balance / Math.max(0.01, Number(cheapest.unitPriceRmbTextToImage || 0.01))))
    : 0;
  return {
    workspace,
    role: logsResult.role,
    summary: {
      ...summary,
      currentBalance: balance,
      estimatedRemainingImages,
    },
    trend7d: Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      const dayLogs = (logsResult.items || []).filter((item) => String(item.createdAt || "").slice(0, 10) === key);
      return {
        date: key,
        label: date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }),
        images: dayLogs.reduce((sum, item) => sum + Number(item.outputImageCount || 0), 0),
        tokenCost: roundMoney(dayLogs.reduce((sum, item) => sum + Number(item.tokenCost || 0), 0)),
        moneyCost: roundMoney(dayLogs.reduce((sum, item) => sum + Number(item.moneyCost || 0), 0)),
      };
    }),
  };
}

export async function getTeamBilling({
  viewerId,
  workspaceId = "",
}) {
  await ensureImageStudioSchema();
  const context = await getWorkspaceContext(viewerId, workspaceId);
  if (!context) return { error: "无权查看该工作空间" };
  if (!(context.role === "owner" || context.role === "admin" || isAdminCustomer(context.customer))) {
    return { error: "仅队长或管理员可查看团队记账" };
  }

  if (!hasDatabase()) {
    const members = imageStudioStore.workspaceMembers.filter((item) => item.workspaceId === context.workspace.id);
    const logs = imageStudioStore.imageLogs.map(mapImageLogRow).filter((item) => item.workspaceId === context.workspace.id);
    const summary = summarizeLogs(logs);
    const memberRows = members.map((member) => {
      const memberLogs = logs.filter((item) => item.userId === member.userId);
      const memberSummary = summarizeLogs(memberLogs);
      return {
        userId: member.userId,
        memberName: member.memberName || member.userId,
        role: member.role,
        todayImages: memberSummary.todayImages,
        todayTokens: memberSummary.todayTokens,
        todayMoney: memberSummary.todayMoney,
        totalMoney: memberSummary.totalMoney,
        lastUsedAt: memberLogs[0]?.createdAt || null,
        successRate: memberSummary.successRate,
      };
    });
    return {
      workspace: context.workspace,
      role: context.role,
      summary,
      members: memberRows,
    };
  }

  const [membersResult, logsResult] = await Promise.all([
    query(
      `SELECT m.*, c.email
       FROM workspace_members m
       LEFT JOIN customers c ON c.id = m.user_id
       WHERE m.workspace_id = $1
       ORDER BY m.created_at ASC`,
      [context.workspace.id]
    ),
    query(
      `SELECT * FROM image_generation_logs
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 1000`,
      [context.workspace.id]
    ),
  ]);

  const logs = logsResult.rows.map(mapImageLogRow);
  const summary = summarizeLogs(logs);
  const members = membersResult.rows.map((member) => {
    const memberLogs = logs.filter((item) => item.userId === member.user_id);
    const memberSummary = summarizeLogs(memberLogs);
    return {
      userId: member.user_id,
      memberName: member.member_name || member.email || member.user_id,
      role: member.role,
      todayImages: memberSummary.todayImages,
      todayTokens: memberSummary.todayTokens,
      todayMoney: memberSummary.todayMoney,
      totalMoney: memberSummary.totalMoney,
      lastUsedAt: memberLogs[0]?.createdAt || null,
      successRate: memberSummary.successRate,
    };
  });

  return {
    workspace: context.workspace,
    role: context.role,
    summary,
    members,
  };
}

export async function getTeamMemberBillingDetail({
  viewerId,
  workspaceId = "",
  memberUserId,
}) {
  const team = await getTeamBilling({ viewerId, workspaceId });
  if (team.error) return team;
  const logsResult = await listImageLogs({
    viewerId,
    workspaceId: team.workspace.id,
    targetUserId: memberUserId,
    limit: 200,
  });
  if (logsResult.error) return logsResult;
  return {
    workspace: team.workspace,
    role: team.role,
    member: team.members.find((item) => item.userId === memberUserId) || null,
    summary: summarizeLogs(logsResult.items || []),
    items: logsResult.items || [],
  };
}

export function buildImageEndpointPayload(body = {}) {
  const style = String(body.style || "").trim();
  const basePrompt = String(body.prompt || body.text || "").trim();
  const prompt = style && style !== "自动" && style.toLowerCase() !== "auto"
    ? `${basePrompt}\n风格：${style}`.trim()
    : basePrompt;
  const images = [
    ...normalizeImageArray(body.images),
    ...normalizeImageArray(body.referenceImages),
    ...normalizeImageArray(body.reference_images),
    ...normalizeImageArray(body.input_images),
    ...normalizeImageArray(body.inputImages),
    ...normalizeImageArray(body.image),
  ];
  const explicitAspectRatio = body.aspect_ratio || body.aspectRatio;
  const size = String(body.size || "").trim();
  return {
    prompt,
    images,
    modelId: String(body.model || body.modelId || "flowapi-seedream-45").trim(),
    aspectRatio: String(explicitAspectRatio || mapSizeToAspectRatio(size) || "1:1"),
    quality: String(body.quality || "standard"),
    n: Math.max(1, Math.min(4, Number(body.n || body.count || 1))),
    saveHistory: body.save_history !== false && body.saveHistory !== false,
    autoRetry: body.auto_retry !== false && body.autoRetry !== false,
    returnFormat: String(body.return_format || body.response_format || "url"),
  };
}

export async function runImageStudioJobByToken({
  req,
  token,
  body,
  endpoint,
}) {
  const match = await findCustomerByToken(token);
  if (!match?.customer?.id) {
    return { ok: false, status: 401, error: "无效的 FlowAPI API Key" };
  }
  const payload = buildImageEndpointPayload(body);
  return runImageStudioJob({
    req,
    customerId: match.customer.id,
    apiKeyId: match.apiKey.id,
    prompt: payload.prompt,
    images: payload.images,
    modelId: payload.modelId,
    aspectRatio: payload.aspectRatio,
    quality: payload.quality,
    n: payload.n,
    saveHistory: payload.saveHistory,
    autoRetry: payload.autoRetry,
    returnFormat: payload.returnFormat,
    endpoint,
  });
}
